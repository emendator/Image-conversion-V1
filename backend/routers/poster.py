"""
营销海报生成路由 - 异步任务
============================
- 支持两种模式：
  1) 现有逻辑：文生图生成底图 → 合成素材（素材位置固定或按预览传递）
  2) 选用现有底图：跳过文生图，直接用图片库底图 + 按预览位置合成
- 任务完成后返回底图下载地址（供用户选择是否保留入库）
"""

import os
import uuid
import time
import base64
import threading
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException

from PIL import Image

from .. import config, database, api_config
from ..auth import require_any_login
from ..api_client import create_image_client
from ..image_processor import composite_poster

router = APIRouter(prefix="/api", tags=["poster"])

# 任务状态（进程内内存，含创建时的用户上下文）
poster_tasks = {}
poster_tasks_lock = threading.Lock()

# 临时底图登记：AI 生成后未入库的底图（进程内内存），供「按预览位置合成」引用
# 结构: {key: {"path": 绝对路径, "user_id": int, "created": time.time()}}
poster_bases = {}
# 海报修改：按用户记录上一次修改结果（供基于上次结果继续修改）
poster_edit_results = {}
POSTER_BASE_TTL = 24 * 3600


def _cleanup_temp_bases():
    """清理过期的临时底图登记（文件仍由定时任务清理 output 目录）"""
    now = time.time()
    for k, v in list(poster_bases.items()):
        if now - v.get("created", 0) > POSTER_BASE_TTL:
            poster_bases.pop(k, None)
    for k, v in list(poster_edit_results.items()):
        if now - v.get("created", 0) > POSTER_BASE_TTL:
            poster_edit_results.pop(k, None)

SIZE = "520*1150"
CANVAS_SIZE = (520, 1150)
# wan2.7-image-pro 图生图对输入图片的最低要求：最短边 >= 240px
MIN_MATERIAL_SIDE = 240


def _ensure_material_min_size(path: str) -> str:
    """素材图最短边低于模型最低要求（240px）时等比放大，返回处理后的新路径（原图不动）"""
    if not path or not os.path.exists(path):
        return path
    try:
        img = Image.open(path)
        w, h = img.size
        if min(w, h) >= MIN_MATERIAL_SIDE:
            return path
        scale = MIN_MATERIAL_SIDE / min(w, h)
        new_size = (max(MIN_MATERIAL_SIDE, round(w * scale)), max(MIN_MATERIAL_SIDE, round(h * scale)))
        img2 = img.resize(new_size, Image.LANCZOS)
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        out = os.path.join(config.UPLOAD_DIR, f"mat_up_{uuid.uuid4().hex}.png")
        img2.convert("RGBA").save(out, format="PNG")
        print(f"[素材] 图片过小({w}x{h})，已等比放大至 {new_size[0]}x{new_size[1]} → {out}")
        return out
    except Exception as e:
        print(f"[素材] 尺寸检查失败，按原图使用: {e}")
        return path


def _preview_base64(image_path: str) -> str:
    """生成完整图片 Base64（结果预览，800px 内）"""
    try:
        img = Image.open(image_path)
        img.thumbnail((800, 800), Image.LANCZOS)
        buf = BytesIO()
        if image_path.lower().endswith(".png"):
            img.save(buf, format="PNG")
            return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception:
        return ""


def _client_for(user):
    """按当前用户构建客户端（按「API 设置」中选的供应商与凭证）"""
    return create_image_client(user)


def _friendly_error(msg) -> str:
    """把 API 原始报错转成对用户友好的原因提示；未识别的 API 错误也带上原始原因，避免只显示笼统的失败"""
    s = str(msg)
    low = s.lower()
    if ("risk not pass" in low or "not pass" in low or "datainspectionfailed" in low
            or "green net" in low or ("content" in low and "check" in low)):
        return "内容安全审核未通过：输入的文字或图片疑似包含违规/敏感内容，无法生成。请检查描述或素材后修改再试。"
    if ("ratelimit" in low or "throttling" in low or "flow control" in low or "serverbusy" in low
            or "50429" in low or "50430" in low or "concurrent limit" in low or "api limit" in low
            or "qps" in low):
        return "即梦服务并发/频率超限（QPS 或并发任务数达上限），请稍等片刻再试。多张底图方案现在会逐张生成，可避免此类报错。"
    if "insufficientbalance" in low or ("balance" in low and "insufficient" in low):
        return "账户余额不足，无法继续调用 AI，请充值后再试。"
    if "service not enabled" in low or "not enabled" in low or "not activated" in low             or "not opened" in low or "not open" in low or "unopened" in low:
        return "该 AI 服务尚未开通：请先在火山引擎控制台开通「即梦 AI」服务，并确认账号有 cv 服务权限。"
    if ("expired" in low and ("request" in low or "time" in low or "date" in low or "skew" in low)):
        return "请求时间与服务器偏差过大（签名有效期约 15 分钟），请校准本机时间（自动同步）后重试。"
    if ("invalidapikey" in low or "authentication" in low or "unauthorized" in low
            or "permissiondenied" in low or "signature" in low or "accesskey" in low
            or "deniedaccess" in low or "authfailure" in low or "credential" in low):
        return f"API 凭证无效或没有权限（服务端返回：{s}）。请在「API 设置」中核对 Access Key ID / Secret Access Key 是否正确完整。"
    if "modelnotfound" in low or "model not found" in low or "modelnotexists" in low:
        return "模型不存在或不可用，请在「API 设置」中检查模型名称。"
    if ("paramvalidationerror" in low or "invalidparameter" in low or "input invalid" in low
            or "param" in low and "invalid" in low):
        return "请求参数不合法，请检查输入内容（文字/图片）后重试。"
    if "imagetoosmall" in low or "image too small" in low or "resolution must be at least" in low:
        return "素材图片分辨率过低：AI 模型要求输入图片最短边不低于 240 像素，请更换更大、更清晰的图片后重试。"
    if "timeout" in low or "timed out" in low:
        return "请求超时，请稍后重试。"
    if "internalerror" in low or "systemerror" in low:
        return "AI 服务内部错误，请稍后重试。"
    # 未识别但确属 AI 服务调用失败的：保留原始原因，方便用户/开发定位
    if "api 调用失败" in s or "api调用失败" in s or "未返回图片" in s or "code=" in low:
        return f"AI 服务异常：{s}"
    return s


def _sanitize_positions(positions) -> dict:
    """校验并规范化素材位置（百分比坐标），非法参数直接 400"""
    result = {}
    for key, pos in (positions or {}).items():
        if not isinstance(pos, dict):
            continue
        try:
            result[key] = {
                "xPct": float(pos.get("xPct", 0)),
                "yPct": float(pos.get("yPct", 0)),
                "wPct": float(pos.get("wPct", 0)),
                "hPct": float(pos.get("hPct", 0)),
            }
        except (TypeError, ValueError):
            raise HTTPException(400, f"素材位置参数非法: {key}")
    return result


def _validate_material_path(path: str) -> str:
    """校验素材路径必须位于上传缓存目录内（防任意文件包含）"""
    if not path:
        return path
    abs_path = os.path.abspath(path)
    upload_root = os.path.abspath(config.UPLOAD_DIR)
    if not (abs_path == upload_root or abs_path.startswith(upload_root + os.sep)):
        raise HTTPException(400, "素材路径非法")
    return path


@router.post("/generate-poster")
def generate_poster(data: dict, user=Depends(require_any_login)):
    prompt = (data.get("prompt") or "").strip()
    logo_path = _validate_material_path(data.get("logo_path") or "")
    qr_path = _validate_material_path(data.get("qr_path") or "")
    brand_path = _validate_material_path(data.get("brand_path") or "")
    use_existing_base = bool(data.get("use_existing_base"))
    # 素材嵌入方式：manual=AI 生成底图后手动合成（现有逻辑）；ai=素材随底图一起交给 AI 生成
    ai_embed = bool(data.get("ai_embed"))
    try:
        base_image_id = int(data.get("base_image_id") or 0)
    except (TypeError, ValueError):
        base_image_id = 0
    req_temp_base_id = (data.get("temp_base_id") or "").strip()
    positions = _sanitize_positions(data.get("positions") or {})
    # 生成底图数量（1~4，默认 4）
    try:
        num_bases = int(data.get("num") or 4)
    except (TypeError, ValueError):
        num_bases = 4
    num_bases = max(1, min(4, num_bases))

    # 线程内使用用户数据副本（sqlite Row 生命周期不跨请求线程）
    user_dict = dict(user)

    _cleanup_temp_bases()

    if not use_existing_base and not prompt:
        raise HTTPException(400, "请输入提示词")
    # 选用底图模式：图片库底图或本次 AI 生成的临时底图，二者至少其一
    if use_existing_base and not base_image_id and not req_temp_base_id:
        raise HTTPException(400, "请选择现有底图或先生成海报底图")
    # AI 嵌入素材模式：仅用于 AI 生成底图（不与现有底图合成共用），且必须至少上传一个素材
    if ai_embed and use_existing_base:
        raise HTTPException(400, "AI 嵌入素材模式仅适用于 AI 生成底图")
    if ai_embed and not (logo_path or qr_path or brand_path):
        raise HTTPException(400, "AI 嵌入素材模式请至少上传一个素材（Logo / 二维码 / 品牌图）")

    # 文生图模式必须绑定 API Key（仅账号自绑，不导入则不可用 AI）；选用底图模式（纯合成）不强制
    # 注意：user 是 sqlite3.Row（无 .get 方法），此处用 user_dict（普通 dict）
    if not use_existing_base:
        if not api_config.has_user_api_key(user_dict):
            raise HTTPException(400, "尚未绑定 API 凭证，请先在「API 设置」中选择供应商并绑定密钥")

    task_id = uuid.uuid4().hex
    with poster_tasks_lock:
        poster_tasks[task_id] = {
            "status": "running", "step": 0, "step_name": "",
            "progress": 0, "error": None, "result": None,
            "start_time": time.time(),
            "user_id": user_dict["id"],
            "company_id": user_dict["company_id"],
        }

    def _update_step(step: int, step_name: str, progress: int):
        with poster_tasks_lock:
            if task_id in poster_tasks:
                poster_tasks[task_id]["step"] = step
                poster_tasks[task_id]["step_name"] = step_name
                poster_tasks[task_id]["progress"] = progress
                print(f"[任务 {task_id[:8]}][{progress}%] 第{step}步: {step_name}")

    def _run():
        ensure_work_dirs()
        start_time = time.time()
        base_path = None
        ai_usage = {}
        # 局部变量 temp_base_id：初始为请求传入的临时底图（AI 分支会重新赋值为新 uuid）
        temp_base_id = req_temp_base_id
        try:
            # ---- 第一步：确定底图 ----
            if use_existing_base:
                _update_step(1, "加载现有底图", 40)
                if base_image_id:
                    img = database.get_image_by_id(base_image_id)
                    # 默认模板（company_id=0）任何公司可用；公司自有模板仅本公司
                    if not img or (img["company_id"] != user_dict["company_id"]
                                   and not database.is_default_image(img)):
                        raise RuntimeError("所选底图不存在或无权使用")
                    base_path = database.image_abs_path(img["company_id"], img["filepath"])
                    if not os.path.exists(base_path):
                        raise RuntimeError("底图文件不存在")
                elif temp_base_id:
                    # 本次会话 AI 生成的临时底图（未入库）
                    tb = poster_bases.get(temp_base_id)
                    if not tb or tb.get("user_id") != user_dict["id"] \
                            or not os.path.exists(tb.get("path", "")):
                        raise RuntimeError("临时底图不存在或已过期，请重新生成底图")
                    base_path = tb["path"]
            else:
                _update_step(1, "生成海报（AI 嵌入素材）" if ai_embed else "生成海报底图", 40)
                client = _client_for(user_dict)
                client.scene = "营销海报·AI嵌入素材" if ai_embed else "营销海报·生成底图"
                if ai_embed:
                    # ===== AI 嵌入素材模式：素材作为输入一并交给大模型，生成成品海报 =====
                    material_notes = []
                    if logo_path:
                        material_notes.append(
                            "- Logo（用户提供的 logo 图片）：默认放置在画布左上角；若用户描述了位置则严格按用户描述放置。"
                            "保持清晰、比例正确、不改变颜色，不得扭曲变形。"
                        )
                    if qr_path:
                        material_notes.append(
                            "- 二维码（用户提供的二维码图片）：默认放置在画布右上角；若用户描述了位置则严格按用户描述放置。"
                            "必须保持方正、清晰、可正常扫描，不得变形、扭曲、拉伸或遮挡。"
                        )
                    if brand_path:
                        material_notes.append(
                            "- 品牌图（用户提供的品牌图片）：默认放置在画布底部居中；若用户描述了位置则严格按用户描述放置。"
                            "保持清晰、不变形，图片中的文字不得错乱。"
                        )
                    enhanced_prompt = (
                        f"{prompt}\n\n"
                        "【任务】以资深海报设计师的审美，一次性生成一张 520×1150 竖版成品营销海报（宽高比约 1:2.2）："
                        "画面主题、文字与内容紧密围绕用户描述，并把用户提供的素材图片原样嵌入到指定位置。\n"
                        "【主题文字设计】根据海报主题，在合适位置主动排版恰当文字：\n"
                        "1. 主标题（4~10 个汉字）提炼核心卖点，置于画面中部偏上、视觉最舒适的黄金位置，醒目突出；\n"
                        "2. 副文案（6~16 个汉字）贴合主题，置于主标题下方或画面中下部，与主标题主次呼应；\n"
                        "3. 文字字形清晰、笔画完整、无错别字、无乱码、无残缺；字体风格、颜色、大小与整体氛围高度统一；\n"
                        "4. 若用户描述已明确指定文字及其位置，严格按描述呈现，不得改写或移动。\n"
                        "【嵌入素材清单与位置说明】\n"
                        f"{chr(10).join(material_notes)}\n"
                        "【素材嵌入要求】\n"
                        "1. 素材必须完整、原样嵌入：清晰、比例正确、不拉伸、不裁剪关键内容、不改变颜色、不额外添加元素；\n"
                        "2. 二维码保持方正清晰、可正常扫描；Logo 不扭曲变形；品牌图文字不错乱；\n"
                        "3. 素材与背景自然融合（可适当加投影、描边、光晕等使其协调），素材上方不得叠加文字或元素。\n"
                        "【版面与视觉】\n"
                        "1. 画面完整铺满画布，不留白边、不出现画框或边框；\n"
                        "2. 主视觉与主标题居中偏上，装饰元素（光斑、线条、几何图形、纹理、粒子等）向四周自然扩散点缀，层次丰富而不杂乱；\n"
                        "3. 色彩大胆而协调、明暗对比鲜明，第一眼即抓人眼球，整体精致高级；\n"
                        "4. 元素之间讲究呼应、留白与节奏，避免简单堆砌或均匀平铺。\n"
                        "【禁止出现】价格数字、促销折扣、联系方式、二维码（素材中提供的外除外）、Logo（素材中提供的外除外）、水印、拼写错误或残缺变形的文字。"
                    )
                else:
                    # ===== 手动嵌入素材模式：生成带主题文字排版的竖版海报底图，素材稍后由前端按预览位置合成 =====
                    enhanced_prompt = (
                        f"{prompt}\n\n"
                        "【任务】以资深海报设计师的审美，创作一张 520×1150 竖版营销海报底图（宽高比约 1:2.2），"
                        "画面主题、文字与内容必须紧密围绕上述描述。\n"
                        "【文字设计】根据海报主题，主动为画面设计并放置恰当的文字内容：\n"
                        "1. 主标题：提炼主题核心卖点（4~10 个汉字），置于画面中部偏上、视觉最舒适的黄金位置，醒目突出；\n"
                        "2. 副文案：一句贴合主题的短文案（6~16 个汉字），置于主标题下方或画面中下部，与主标题主次呼应；\n"
                        "3. 文字必须字形清晰、笔画完整、无错别字、无乱码、无残缺；字体风格、颜色、大小与整体氛围高度统一；\n"
                        "4. 若用户描述已明确指定文字及其摆放位置，则严格按描述呈现，不得改写或移动。\n"
                        "【版面分区】主视觉、主标题与副文案集中在中部略偏上区域。\n"
                        "【视觉要求】\n"
                        "1. 画面完整铺满画布，边缘无缝衔接，不留白边、不出现画框或边框；\n"
                        "2. 构图主次分明、焦点明确：主体元素居中偏上，装饰元素（光斑、线条、几何图形、纹理、粒子等）向四周自然扩散点缀，层次丰富而不杂乱；\n"
                        "3. 色彩大胆而协调、明暗对比鲜明，画面第一眼即抓人眼球，整体精致高级、可直接作为活动主视觉；\n"
                        "4. 元素之间讲究呼应、留白与节奏，避免简单堆砌或均匀平铺。\n"
                        "【禁止出现】价格数字、促销折扣、联系方式、二维码、Logo、商品实拍图、水印、拼写错误或残缺变形的文字。"
                    )
                # 多张方案使用相同的提示词（不再拼接差异化风格描述，各方案仅靠模型随机性产生差异）
                variants = [""] * num_bases
                usage_lock = threading.Lock()
                ai_usage = {"total_tokens": 0, "image_count": 0, "calls": 0}

                def _gen_one(variant: str) -> str:
                    if ai_embed:
                        # 图生图：素材一并上传给大模型嵌入（过小素材自动等比放大，满足最短边 >= 240px 要求）
                        material_images = [
                            client.encode_image_to_base64(_ensure_material_min_size(p))
                            for p in (logo_path, qr_path, brand_path) if p
                        ]
                        urls = client.image_editing_sync(
                            prompt=enhanced_prompt, images=material_images,
                            size=SIZE, n=1, save_dir=None, thinking_mode=False,
                        )
                    else:
                        urls = client.text_to_image_with_reference(
                            prompt=enhanced_prompt, size=SIZE, n=1, save_dir=None,
                        )
                    if not urls:
                        raise RuntimeError("AI 生成海报失败")
                    u = dict(client.last_usage or {})
                    with usage_lock:
                        for k in ("total_tokens", "image_count", "calls"):
                            ai_usage[k] = ai_usage.get(k, 0) + (u.get(k) or 0)
                    return urls[0]

                # 即梦接口并发上限较低（QPS/并发 50429/50430），多方案逐张生成避免并发超限；
                # 阿里云百炼保持原有 4 并发加速
                if getattr(client, "provider", "dashscope") == "jimeng":
                    print(f"[海报] 即梦模式：{len(variants)} 张方案逐张生成（避免并发超限 50430）")
                    result_urls = [_gen_one(v) for v in variants]
                else:
                    with ThreadPoolExecutor(max_workers=4) as pool:
                        result_urls = list(pool.map(_gen_one, variants))
                # 每张结果图单独保存为临时底图，供用户预览选择
                temp_base_ids = []
                base_previews = []
                base_download_urls = []
                first_base_path = None
                for idx, url in enumerate(result_urls):
                    base_path = os.path.join(config.OUTPUT_DIR, f"pass_1_base_{idx}.png")
                    if os.path.exists(base_path):
                        os.remove(base_path)
                    client.download_image(url, base_path)
                    tb_id = uuid.uuid4().hex
                    with poster_tasks_lock:
                        poster_bases[tb_id] = {
                            "path": base_path,
                            "user_id": user_dict["id"],
                            "created": time.time(),
                        }
                    temp_base_ids.append(tb_id)
                    base_previews.append(_preview_base64(base_path))
                    base_download_urls.append(f"/api/download-poster?file={os.path.basename(base_path)}")
                    if first_base_path is None:
                        first_base_path = base_path
                    print(f"[海报] 临时底图已登记: {tb_id[:8]} → {base_path}")
                temp_base_id = temp_base_ids[0]
                base_path = first_base_path

            # ---- 第二步：AI 嵌入素材模式已直接生成成品，跳过合成；否则按预览位置合成 ----
            if ai_embed:
                _update_step(2, "生成完成", 100)
                final_path = base_path
            else:
                _update_step(2, "合成素材", 80)
                output_path = os.path.join(config.OUTPUT_DIR, "poster_result.png")
                final_path = composite_poster(
                    base_image_path=base_path,
                    logo_path=logo_path if logo_path else None,
                    qr_path=qr_path if qr_path else None,
                    brand_path=brand_path if brand_path else None,
                    output_path=output_path,
                    canvas_size=CANVAS_SIZE,
                    positions=positions or None,
                )

            elapsed = round(time.time() - start_time, 1)
            preview_b64 = _preview_base64(final_path)
            result = {
                "success": True,
                "preview": preview_b64,
                "download_url": f"/api/download-poster?file={os.path.basename(final_path)}",
                "elapsed": elapsed,
                "size": SIZE,
                "usage": ai_usage,
                "ai_used": bool(ai_usage),
                "use_existing_base": use_existing_base,
            }
            # 文生图模式：提供本次 AI 生成底图的下载地址 + 多张底图方案（临时底图不自动入库，由前端选择其一并询问是否保留）
            if not use_existing_base:
                result["base_download_url"] = f"/api/download-poster?file={os.path.basename(base_path)}"
                result["temp_base_id"] = temp_base_id
                result["base_previews"] = base_previews
                result["temp_base_ids"] = temp_base_ids
                result["base_download_urls"] = base_download_urls
                result["ai_embed"] = ai_embed
            with poster_tasks_lock:
                if task_id in poster_tasks:
                    poster_tasks[task_id]["status"] = "completed"
                    poster_tasks[task_id]["step"] = 2
                    poster_tasks[task_id]["progress"] = 100
                    poster_tasks[task_id]["result"] = result
            print(f"\n{'='*50}\n✅ 海报生成完成！总耗时: {elapsed}s\n{'='*50}")
        except Exception as e:
            error_msg = _friendly_error(str(e))
            print(f"[海报生成失败] {error_msg}")
            with poster_tasks_lock:
                if task_id in poster_tasks:
                    poster_tasks[task_id]["status"] = "failed"
                    poster_tasks[task_id]["error"] = error_msg
                    poster_tasks[task_id]["progress"] = -1

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return {"task_id": task_id, "message": "任务已提交"}


@router.post("/edit-poster")
def edit_poster(data: dict, user=Depends(require_any_login)):
    """修改现有营销海报：按提示词对上传的海报（或上一次修改结果）进行图生图编辑"""
    prompt = (data.get("prompt") or "").strip()
    image_path = _validate_material_path(data.get("image_path") or "")
    user_dict = dict(user)

    if not prompt:
        raise HTTPException(400, "请输入修改内容")
    if not api_config.has_user_api_key(user_dict):
        raise HTTPException(400, "尚未绑定 API 凭证，请先在「API 设置」中选择供应商并绑定密钥")

    # 确定输入图：优先使用本次上传的新海报；未上传则用上一次修改结果（迭代修改）
    if image_path:
        if not os.path.exists(image_path):
            raise HTTPException(400, "上传的海报文件不存在")
        input_path = image_path
    else:
        last = poster_edit_results.get(user_dict["id"])
        if not last or not os.path.exists(last.get("path", "")):
            raise HTTPException(400, "请先上传海报或先生成一次修改结果")
        input_path = last["path"]

    start_time = time.time()
    client = _client_for(user_dict)
    client.scene = "营销海报·修改海报"
    edit_prompt = (
        "【任务】修改这张营销海报：严格按用户要求执行，用户未提及的内容一律保持原样。\n"
        "【用户修改要求（最高优先级，必须完整、准确、逐字执行，不得遗漏、不得曲解、不得自行改动）】\n"
        f"「{prompt}」\n\n"
        "【硬性约束】\n"
        "1. 用户没有提到的任何内容（已有文字、图案、元素、布局、配色等）一律保持原样，不得修改、删减、替换或重绘；\n"
        "2. 仅当新增内容确实无处安放时，可最小限度调整布局腾出空间，但既有内容的文字与形态必须原样保留。\n\n"
        "【执行步骤】\n"
        "1. 先通读海报中的全部文字与元素，判断用户要求属于以下哪种情况：\n"
        "   A. 修改/替换已有内容（如改标题、改日期、改文案、换背景、换配色等）：精确锁定目标对象，严格替换为用户指定的内容，文字逐字一致，不得近似、不得只改一半；\n"
        "   B. 新增内容（如添加标题、祝福语、宣传语、按钮、印章等海报中原本没有的元素）：在画面合适的位置新增这些内容。\n"
        "2. 新增或替换的文字必须贴合海报主题与整体风格：字体、大小、颜色、质感与版式协调，放在视觉舒适、不遮挡主体与其他元素的位置；\n"
        "3. 用户要求中的文字必须原样、完整地出现在海报中，一个字符都不能少；需要换算的日期/节日信息（如「2026年的中秋节」）先推算准确再写入，数字与文字必须正确无误；\n"
        "4. 保持海报整体风格、配色与构图基调不变；为容纳新增内容可适当调整版式布局，但不得删减或改动用户未要求改动的已有文字与元素；\n"
        "5. 画面清晰、排版整洁、主次分明，输出竖版 520×1150 像素的海报。"
    )
    input_b64 = client.encode_image_to_base64(input_path)
    try:
        # 图生图编辑必须开启思考模式：wan2.7-image-pro 需先推理修改方案再生成，
        # 关闭时只会高保真重建原图，用户要求的修改/新增内容不会被应用
        result_urls = client.image_editing_sync(
            prompt=edit_prompt, images=[input_b64], size=SIZE, thinking_mode=True, save_dir=None,
        )
    except Exception as e:
        raise HTTPException(500, _friendly_error(str(e)))
    usage = dict(client.last_usage or {})
    if not result_urls:
        raise HTTPException(500, "AI 修改海报失败")

    output_path = os.path.join(config.OUTPUT_DIR, f"poster_edit_{user_dict['id']}_{int(time.time())}.png")
    client.download_image(result_urls[0], output_path)
    with poster_tasks_lock:
        poster_edit_results[user_dict["id"]] = {
            "path": output_path,
            "user_id": user_dict["id"],
            "created": time.time(),
        }
    preview_b64 = _preview_base64(output_path)
    return {
        "success": True,
        "preview": preview_b64,
        "download_url": f"/api/download-poster?file={os.path.basename(output_path)}",
        "elapsed": round(time.time() - start_time, 1),
        "size": SIZE,
        "usage": usage,
        "ai_used": bool(usage),
    }


@router.get("/generate-poster-progress/{task_id}")
def get_poster_progress(task_id: str, user=Depends(require_any_login)):
    with poster_tasks_lock:
        task = poster_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return {
        "status": task["status"],
        "step": task["step"],
        "step_name": task["step_name"],
        "progress": task["progress"],
        "error": task["error"],
        "result": task["result"],
        "elapsed": round(time.time() - task.get("start_time", time.time()), 1),
    }


def ensure_work_dirs():
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
