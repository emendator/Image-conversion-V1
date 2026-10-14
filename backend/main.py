"""
FastAPI 后端服务 - AI 图片生成器
前后端分离架构：仅提供 REST API + 静态文件服务
"""

import os
import sys
import time
import uuid
import base64
import threading
from io import BytesIO

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Depends, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# 确保当前目录在路径中，支持直接运行
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from . import config
from . import api_config
from . import database
from .auth import require_any_login, get_user_from_request, require_jwt_secret
from .api_client import create_image_client
from .routers import auth as auth_router
from .routers import companies as companies_router
from .routers import admin as admin_router
from .routers import images as images_router
from .routers import poster as poster_router

# ========== 应用初始化 ==========

app = FastAPI(title="AI 图片生成器 API", version="3.0.0")

# CORS 配置（允许前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载业务子路由（认证/公司/用户管理/图片库/海报）
app.include_router(auth_router.router)
app.include_router(companies_router.router)
app.include_router(admin_router.router)
app.include_router(images_router.router)
app.include_router(poster_router.router)

# 确保目录存在
os.makedirs(config.UPLOAD_DIR, exist_ok=True)
os.makedirs(config.OUTPUT_DIR, exist_ok=True)

# 强制校验 JWT 密钥已注入（缺失即拒绝启动，避免使用弱/默认密钥签发令牌）
require_jwt_secret()

# 初始化数据库（建表 + 种子 + 旧模板迁移；幂等）
database.init_db()

# ========== 定时清理 ==========

CLEANUP_MAX_AGE = 24 * 60 * 60
CLEANUP_INTERVAL = 6 * 60 * 60


def cleanup_old_files():
    """清理 uploads 和 output 目录中过期的文件，并将已过期的账号自动禁用"""
    now = time.time()
    for directory in [config.UPLOAD_DIR, config.OUTPUT_DIR]:
        if not os.path.exists(directory):
            continue
        for fname in os.listdir(directory):
            fpath = os.path.join(directory, fname)
            if os.path.isdir(fpath) or fname.startswith('.'):
                continue
            if fname in ('final_result.png', 'poster_result.png', 'slice_result.png', 'poster_base.png'):
                continue
            try:
                file_age = now - os.path.getmtime(fpath)
                if file_age > CLEANUP_MAX_AGE:
                    os.remove(fpath)
                    print(f"[清理] 已删除过期文件: {fpath}")
            except Exception as e:
                print(f"[清理] 删除失败 {fpath}: {e}")
    # 账号有效期到期自动禁用
    try:
        disabled = database.disable_expired_users()
        if disabled:
            print(f"[清理] 已自动禁用 {disabled} 个到期账号")
    except Exception as e:
        print(f"[清理] 账号过期检查失败: {e}")
    # 清理没有任何账号的空公司（含公司名/密码/图片库）
    try:
        removed = database.cleanup_empty_companies()
        if removed:
            print(f"[清理] 已自动删除 {removed} 个无账号公司（含公司信息及图片库）")
    except Exception as e:
        print(f"[清理] 空公司清理失败: {e}")
    # 清理超时未退出的游客账号（游客数据不保留，兜底清理）
    try:
        cleaned = database.cleanup_guests(max_age_hours=24)
        if cleaned:
            print(f"[清理] 已清理 {cleaned} 个超时游客账号（含数据）")
    except Exception as e:
        print(f"[清理] 游客账号清理失败: {e}")


def scheduled_cleanup():
    """定时清理任务"""
    while True:
        time.sleep(CLEANUP_INTERVAL)
        cleanup_old_files()


cleanup_old_files()
cleanup_thread = threading.Thread(target=scheduled_cleanup, daemon=True)
cleanup_thread.start()

# ========== 全局工具 ==========


def resolve_client(user=None):
    """按用户构建 AI 客户端：按「API 设置」中选择的供应商与绑定的凭证构建"""
    return create_image_client(user)


def require_api_key(user=None):
    """AI 功能调用前的强制校验：仅允许账号自己绑定的凭证（不绑定则不可用 AI）"""
    if user and api_config.has_user_api_key(user):
        return True
    raise HTTPException(400, "尚未绑定 API 凭证，请先在右上角「API 设置」中选择供应商并绑定密钥")


def ensure_work_dirs():
    """确保输入/输出缓存目录存在（位于 data/ 下，删除后自动重建）"""
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)


# ========== 辅助函数 ==========


def make_full_base64(image_path: str) -> str:
    """生成完整图片的 Base64 字符串（用于结果预览）"""
    try:
        img = Image.open(image_path)
        img.thumbnail((800, 800), Image.LANCZOS)
        buf = BytesIO()
        if image_path.lower().endswith('.png'):
            img.save(buf, format="PNG")
            return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"
        else:
            img.convert("RGB").save(buf, format="JPEG", quality=90)
            return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception:
        return ""


# 模板接口（电商 / 切片）已迁移到图片库路由 routers/images.py（按公司隔离、需登录）


# ==================== API 配置与用量（按登录账户绑定） ====================


@app.get("/api/config/api")
def get_api_config(user=Depends(require_any_login)):
    """获取当前登录账户的 API 配置状态（供应商、是否已绑定、掩码、累计 Token 用量等）"""
    status = auth_router.api_key_status(user["id"])
    status["transit_nonce"] = os.urandom(16).hex()
    return status


@app.post("/api/config/api")
def set_api_config(data: dict, user=Depends(require_any_login)):
    """保存当前登录账户的 API 配置（Key 加密落盘）。支持 base_url / model 可选修改。"""
    return auth_router.bind_api_key(data, user)


@app.post("/api/config/api/test")
def test_api_config(user=Depends(require_any_login)):
    """即梦连接自检：使用当前账号已保存的 AK/SK 轻量探测鉴权（不创建任务、不计费）"""
    if api_config.get_user_provider(user) != "jimeng":
        raise HTTPException(400, "当前供应商不是即梦，无需测试连接")
    client = resolve_client(user)
    ak = getattr(client, "access_key", "") or ""
    sk = getattr(client, "secret_key", "") or ""
    if not ak or not sk:
        raise HTTPException(400, "尚未配置即梦 Access Key ID / Secret Access Key，请先保存")
    result = client.test_connection()
    return {"success": result.get("ok"), "detail": result.get("detail", "")}


@app.get("/api/config/usage-history")
def get_usage_history(provider: str = None, user=Depends(require_any_login)):
    """获取当前登录账户的 API 消耗历史（每笔明细，倒序；可按供应商过滤）"""
    history = api_config.get_usage_history(user["id"], provider=provider)
    return {"success": True, "history": history}


@app.post("/api/upload-product")
async def upload_product(file: UploadFile = File(...), user=Depends(require_any_login)):
    """上传商品图"""
    ensure_work_dirs()
    if not file.filename:
        raise HTTPException(400, "文件名为空")
    ext = os.path.splitext(file.filename)[1] or '.jpg'
    safe_name = f"product_{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(config.UPLOAD_DIR, safe_name)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    preview_b64 = make_full_base64(save_path)
    return {'path': save_path, 'name': safe_name, 'preview': preview_b64}


@app.post("/api/upload-logo")
async def upload_logo(file: UploadFile = File(...), user=Depends(require_any_login)):
    """上传 Logo 图"""
    ensure_work_dirs()
    if not file.filename:
        raise HTTPException(400, "文件名为空")
    ext = os.path.splitext(file.filename)[1] or '.png'
    safe_name = f"logo_{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(config.UPLOAD_DIR, safe_name)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    # 保持原始图片宽高比（不再补边）：预览与合成使用同一文件，确保预览与生成结果一致
    preview_b64 = make_full_base64(save_path)
    return {'path': save_path, 'name': safe_name, 'preview': preview_b64}


@app.post("/api/upload-qr")
async def upload_qr(file: UploadFile = File(...), user=Depends(require_any_login)):
    """上传二维码图片"""
    ensure_work_dirs()
    if not file.filename:
        raise HTTPException(400, "文件名为空")
    ext = os.path.splitext(file.filename)[1] or '.png'
    safe_name = f"qr_{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(config.UPLOAD_DIR, safe_name)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    # 保持原始图片宽高比（不再补边）：预览与合成使用同一文件，确保预览与生成结果一致
    preview_b64 = make_full_base64(save_path)
    return {'path': save_path, 'name': safe_name, 'preview': preview_b64}


@app.post("/api/upload-brand")
async def upload_brand(file: UploadFile = File(...), user=Depends(require_any_login)):
    """上传品牌图"""
    ensure_work_dirs()
    if not file.filename:
        raise HTTPException(400, "文件名为空")
    ext = os.path.splitext(file.filename)[1] or '.png'
    safe_name = f"brand_{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(config.UPLOAD_DIR, safe_name)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    # 保持原始图片宽高比（不再补边）：预览与合成使用同一文件，确保预览与生成结果一致
    preview_b64 = make_full_base64(save_path)
    return {'path': save_path, 'name': safe_name, 'preview': preview_b64}


@app.post("/api/upload-poster-edit")
async def upload_poster_edit(file: UploadFile = File(...), user=Depends(require_any_login)):
    """上传待修改的营销海报图"""
    ensure_work_dirs()
    if not file.filename:
        raise HTTPException(400, "文件名为空")
    ext = os.path.splitext(file.filename)[1] or '.png'
    safe_name = f"poster_edit_{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(config.UPLOAD_DIR, safe_name)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    preview_b64 = make_full_base64(save_path)
    return {'path': save_path, 'name': safe_name, 'preview': preview_b64}


@app.post("/api/upload-multiple-products")
async def upload_multiple_products(files: list[UploadFile] = File(...), user=Depends(require_any_login)):
    """上传多个商品图"""
    ensure_work_dirs()
    if not files or len(files) == 0:
        raise HTTPException(400, "文件列表为空")
    results = []
    for file in files:
        if not file.filename:
            continue
        ext = os.path.splitext(file.filename)[1] or '.jpg'
        safe_name = f"product_{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(config.UPLOAD_DIR, safe_name)
        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)
        preview_b64 = make_full_base64(save_path)
        results.append({'path': save_path, 'name': safe_name, 'preview': preview_b64})
    return {'success': True, 'products': results, 'count': len(results)}


@app.post("/api/generate-ecommerce-final")
async def generate_ecommerce_final(
    file: UploadFile = File(...),
    color_prompt: str = Form(""),
    size: str = Form("800*800"),
    user=Depends(require_any_login),
):
    """接收前端 Canvas 导出的电商主图，可选 AI 颜色修改（按登录用户取 API Key）"""
    ensure_work_dirs()
    start_time = time.time()
    preview_path = os.path.join(config.OUTPUT_DIR, 'ecommerce_preview.png')
    content = await file.read()
    with open(preview_path, "wb") as f:
        f.write(content)

    ai_usage = {}
    ai_used = False
    if color_prompt:
        require_api_key(user)
        client = resolve_client(user)
        client.scene = "电商主图·颜色修改"
        try:
            preview_b64 = client.encode_image_to_base64(preview_path)
            color_edit_prompt = (
                f'请按照以下指令精准修改图片对应区域的颜色，但严格保持其他所有内容完全不变'
                f'（版式、文字、商品、Logo、色块形状等均不允许改动）：\n'
                f'{color_prompt}\n\n'
                '重要约束：\n'
                '1. 严格保持整体版式、结构、布局完全不变\n'
                '2. 仅对指定区域做颜色替换，其他区域颜色不允许有任何变化\n'
                '3. 替换后颜色要自然、协调，与周围环境融合\n'
                '4. 渐变区域要保持渐变效果，仅替换色调\n'
                '5. 图中所有文字内容必须严格保留原样，不容许改动\n'
                '6. Logo 和商品图保持原样不变\n'
                f'7. 输出{size.replace("*", "×")}像素'
            )
            result_urls = client.image_editing_sync(
                prompt=color_edit_prompt, images=[preview_b64],
                size=size, thinking_mode=False, save_dir=config.OUTPUT_DIR,
            )
            # AI 调用成功后立即捕获本次用量，避免异常/并发时读到残留值
            ai_usage = dict(client.last_usage or {})
            ai_used = True
            if result_urls:
                gen_path = os.path.join(config.OUTPUT_DIR, 'generated_0_0.png')
                final_path = os.path.join(config.OUTPUT_DIR, 'final_result.png')
                if os.path.exists(final_path):
                    os.remove(final_path)
                if os.path.exists(gen_path):
                    os.rename(gen_path, final_path)
                else:
                    final_path = preview_path
            else:
                final_path = preview_path
        except Exception as e:
            print(f"[颜色修改失败] {e}，使用预览图")
            final_path = preview_path
    else:
        final_path = preview_path

    elapsed = round(time.time() - start_time, 1)
    result_preview = make_full_base64(final_path)
    return {
        'success': True,
        'preview': result_preview,
        'download_url': f'/api/download?file={os.path.basename(final_path)}',
        'elapsed': elapsed,
        'size': size,
        # 本次 AI 匹配消耗（未使用 AI 或 AI 失败时为空对象）
        'usage': ai_usage,
        'ai_used': ai_used,
    }


# 营销海报生成接口（/api/generate-poster 与 /api/generate-poster-progress）
# 已迁移到 routers/poster.py（支持选用现有底图、预览位置合成、底图保存）


@app.post("/api/upload-slice-result")
async def upload_slice_result(file: UploadFile = File(...), user=Depends(require_any_login)):
    """接收前端 Canvas 导出的切片 PNG"""
    ensure_work_dirs()
    save_path = os.path.join(config.OUTPUT_DIR, 'slice_result.png')
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    preview_b64 = make_full_base64(save_path)
    return {
        'success': True,
        'preview': preview_b64,
        'download_url': '/api/download-slice?file=slice_result.png',
    }


# ==================== 下载与预览 ====================


@app.get("/api/download")
def download(request: Request, file: str = "final_result.png"):
    """下载生成的图片（需登录，支持 ?token=；仅允许 OUTPUT 目录根下文件名，防路径穿越）"""
    get_user_from_request(request)
    file = os.path.basename(file or "final_result.png")
    filepath = os.path.join(config.OUTPUT_DIR, file)
    if not os.path.exists(filepath):
        filepath = os.path.join(config.OUTPUT_DIR, 'generated_0_0.png')
        if not os.path.exists(filepath):
            raise HTTPException(404, "文件不存在")
    return FileResponse(filepath, filename=file)


@app.get("/api/download-poster")
def download_poster(request: Request, file: str = "poster_result.png"):
    """下载生成的海报（需登录，支持 ?token=；仅允许 OUTPUT 目录根下文件名）"""
    get_user_from_request(request)
    file = os.path.basename(file or "poster_result.png")
    filepath = os.path.join(config.OUTPUT_DIR, file)
    if not os.path.exists(filepath):
        filepath = os.path.join(config.OUTPUT_DIR, 'poster_result.png')
        if not os.path.exists(filepath):
            raise HTTPException(404, "文件不存在")
    return FileResponse(filepath, filename=file)


@app.get("/api/download-slice")
def download_slice(request: Request, file: str = "slice_result.png"):
    """下载生成的切片（需登录，支持 ?token=；仅允许 OUTPUT 目录根下文件名）"""
    get_user_from_request(request)
    file = os.path.basename(file or "slice_result.png")
    filepath = os.path.join(config.OUTPUT_DIR, file)
    if not os.path.exists(filepath):
        filepath = os.path.join(config.OUTPUT_DIR, 'slice_result.png')
        if not os.path.exists(filepath):
            raise HTTPException(404, "文件不存在")
    return FileResponse(filepath, filename=file)


# ==================== 静态文件服务 ====================

# 前端静态页面
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

# 注：uploads/output 素材与结果缓存不再静态挂载——
# 前端一律使用 Base64 预览与 /api/download* 鉴权接口访问，避免资源无鉴权暴露


@app.get("/")
async def serve_index():
    """主页（React SPA）"""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# ==================== 启动入口 ====================

if __name__ == '__main__':
    import uvicorn
    print("\n" + "=" * 50)
    print("  AI 图片生成器 API - FastAPI 后端")
    print("=" * 50)
    print(f"  API 地址: http://{config.HOST}:{config.PORT}")
    print(f"  API 文档: http://{config.HOST}:{config.PORT}/docs")
    print(f"  前端页面: http://{config.HOST}:{config.PORT}")
    print(f"  数据库: {database.DB_PATH}")
    print(f"  登录账户: {config.SUPER_ADMIN_USERNAME}（口令由环境变量 SUPER_ADMIN_PASSWORD 注入）")
    print("=" * 50 + "\n")
    uvicorn.run(
        "backend.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
    )
