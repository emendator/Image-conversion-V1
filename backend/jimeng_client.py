"""
即梦 AI 图片生成 4.6 客户端（火山引擎视觉智能开放平台）
========================================================
基于官方接口文档: https://docs.volcengine.com/docs/85621/2275082?lang=zh

- 提交任务: POST https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31
- 查询任务: POST https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31
- 鉴权: 火山引擎签名 v4（Access Key ID + Secret Access Key）
  Region 固定 cn-north-1，Service 固定 cv
- 服务标识: req_key = jimeng_seedream46_cvtob

与 BailianImageClient 保持同一调用接口（image_editing_sync /
text_to_image_with_reference / encode_image_to_base64 / download_image），
业务层无需关心底层厂商差异。
"""

import base64
import datetime
import hashlib
import hmac
import json
import mimetypes
import os
import time
import urllib.request
import urllib.parse
import urllib.error
from typing import List, Optional, Tuple

from . import config
from . import api_config

JIMENG_HOST = "visual.volcengineapi.com"
JIMENG_BASE_URL = "https://" + JIMENG_HOST
JIMENG_REQ_KEY = "jimeng_seedream46_cvtob"
JIMENG_REGION = "cn-north-1"
JIMENG_SERVICE = "cv"
JIMENG_VERSION = "2022-08-31"
JIMENG_ALGORITHM = "HMAC-SHA256"

# 输出面积约束（接口文档：宽高乘积在 [1024*1024, 4096*4096]）
JIMENG_MIN_AREA = 1024 * 1024
JIMENG_MAX_AREA = 4096 * 4096
JIMENG_MAX_SIDE = 4096


class VolcengineSigner:
    """火山引擎 IAM v4 请求签名（Header 场景）"""

    @staticmethod
    def _uri_encode(s: str) -> str:
        safe = "-_.~"
        out = []
        for ch in str(s):
            if ch.isalnum() or ch in safe:
                out.append(ch)
            else:
                for byte in ch.encode("utf-8"):
                    out.append("%%%02X" % byte)
        return "".join(out)

    @staticmethod
    def _signing_key(secret_key: str, short_date: str, region: str, service: str) -> bytes:
        k_date = hmac.new(secret_key.encode("utf-8"), short_date.encode("utf-8"), hashlib.sha256).digest()
        k_region = hmac.new(k_date, region.encode("utf-8"), hashlib.sha256).digest()
        k_service = hmac.new(k_region, service.encode("utf-8"), hashlib.sha256).digest()
        return hmac.new(k_service, b"request", hashlib.sha256).digest()

    @classmethod
    def sign(cls, method: str, path: str, headers: dict, body: bytes,
             access_key: str, secret_key: str,
             region: str = JIMENG_REGION, service: str = JIMENG_SERVICE,
             query_params: Optional[dict] = None) -> dict:
        now = datetime.datetime.now(datetime.timezone.utc)
        x_date = now.strftime("%Y%m%dT%H%M%SZ")
        short_date = x_date[:8]
        payload_hash = hashlib.sha256(body).hexdigest()

        headers = dict(headers or {})
        headers["X-Date"] = x_date
        headers["X-Content-Sha256"] = payload_hash

        # 官方要求签名头固定为 content-type;host;x-content-sha256;x-date
        signed_headers_list = ["content-type", "host", "x-content-sha256", "x-date"]

        canonical_query = ""
        if query_params:
            sorted_params = sorted((str(k), str(v)) for k, v in query_params.items())
            canonical_query = "&".join(
                cls._uri_encode(k) + "=" + cls._uri_encode(v) for k, v in sorted_params
            )

        parts = []
        for h in signed_headers_list:
            if h == "content-type":
                parts.append("content-type:" + headers.get("Content-Type", "application/json"))
            elif h == "host":
                parts.append("host:" + headers.get("Host", ""))
            elif h == "x-content-sha256":
                parts.append("x-content-sha256:" + payload_hash)
            elif h == "x-date":
                parts.append("x-date:" + x_date)
        canonical_headers = "\n".join(parts) + "\n"
        signed_headers = ";".join(signed_headers_list)

        canonical_request = "\n".join([
            method.upper(),
            path,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ])
        canonical_request_hash = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()

        credential_scope = f"{short_date}/{region}/{service}/request"
        string_to_sign = "\n".join([
            JIMENG_ALGORITHM, x_date, credential_scope, canonical_request_hash,
        ])
        signing_key = cls._signing_key(secret_key, short_date, region, service)
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        headers["Authorization"] = (
            f"{JIMENG_ALGORITHM} Credential={access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return headers


def _uri_encode(s: str) -> str:
    return urllib.parse.quote(str(s), safe="-_.~")


class JimengImageClient:
    """即梦 AI 图片生成 4.6 客户端（异步提交 + 轮询结果）"""

    def __init__(self, access_key: Optional[str] = None, secret_key: Optional[str] = None,
                 model: Optional[str] = None, user_id: int = 0, scene: str = ""):
        # 严格按账号：不提供密钥即为空（不再回退全局配置）
        self.access_key = access_key or ""
        self.secret_key = secret_key or ""
        self.model = model or JIMENG_REQ_KEY
        self.user_id = user_id
        self.scene = scene
        self.provider = "jimeng"
        self.last_usage = {}
        # 记录最近一次请求希望得到的输出尺寸（生成后下载/保存时自动缩放）
        self._last_target_size: Optional[Tuple[int, int]] = None

    # ---------- 通用工具 ----------

    @staticmethod
    def encode_image_to_base64(image_path: str) -> str:
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type or not mime_type.startswith("image/"):
            raise ValueError(f"不支持或无法识别的图像格式: {image_path}")
        with open(image_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
        return f"data:{mime_type};base64,{encoded}"

    @staticmethod
    def _parse_size(size) -> Optional[Tuple[int, int]]:
        """解析 '800*800' / '520x1150' 等尺寸字符串 → (宽, 高)"""
        if not size:
            return None
        s = str(size).strip().lower().replace("x", "*").replace("×", "*")
        if "*" not in s:
            return None
        parts = s.split("*")
        if len(parts) != 2:
            return None
        try:
            w = int(float(parts[0].strip()))
            h = int(float(parts[1].strip()))
        except (TypeError, ValueError):
            return None
        if w <= 0 or h <= 0:
            return None
        return w, h

    @classmethod
    def _requestable_size(cls, w: int, h: int) -> Tuple[int, int]:
        """把目标尺寸换算为接口允许的请求尺寸（面积过小自动放大，超限自动缩小）"""
        area = w * h
        scale = 1.0
        if area < JIMENG_MIN_AREA:
            scale = max(scale, (JIMENG_MIN_AREA / area) ** 0.5)
        if area > JIMENG_MAX_AREA:
            scale = min(scale, (JIMENG_MAX_AREA / area) ** 0.5)
        if max(w, h) > JIMENG_MAX_SIDE:
            scale = min(scale, JIMENG_MAX_SIDE / max(w, h))
        return max(1, round(w * scale)), max(1, round(h * scale))

    def _normalize_image_inputs(self, images: List[str]) -> List[str]:
        """输入图片：http(s) URL 或 data: 直接透传；本地路径转 base64 data URL"""
        result = []
        for img in images or []:
            img = (img or "").strip()
            if not img:
                continue
            if img.startswith("http://") or img.startswith("https://") or img.startswith("data:"):
                result.append(img)
            elif os.path.exists(img):
                result.append(self.encode_image_to_base64(img))
            else:
                raise ValueError(f"输入图片不存在或格式不受支持: {img}")
        return result[:14]  # 接口最多支持 14 张

    # ---------- 签名请求 ----------

    def _post(self, action: str, body: dict, timeout: int = 30) -> dict:
        query = {"Action": action, "Version": JIMENG_VERSION}
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        path = "/"
        headers = {
            "Content-Type": "application/json",
            "Host": JIMENG_HOST,
        }
        signed = VolcengineSigner.sign(
            "POST", path, headers, payload,
            self.access_key, self.secret_key,
            query_params=query,
        )
        url = f"{JIMENG_BASE_URL}{path}?" + "&".join(
            f"{_uri_encode(k)}={_uri_encode(v)}" for k, v in sorted(query.items())
        )
        req = urllib.request.Request(url, data=payload, method="POST")
        for k, v in signed.items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            raw = e.read() or b""
            raw_text = raw.decode("utf-8", errors="ignore")
            try:
                err = json.loads(raw_text)
            except Exception:
                err = {}
            # 火山引擎错误常见两种结构：
            # 1) {"code":..., "message":..., "request_id":...}
            # 2) {"ResponseMetadata": {"Error": {"Code":..., "Message":...}, "RequestId":...}}
            meta = err.get("ResponseMetadata") or {}
            api_err = meta.get("Error") or {}
            code = (err.get("code") or err.get("Code") or api_err.get("Code")
                    or meta.get("Code") or e.code)
            msg = (err.get("message") or err.get("Message") or api_err.get("Message")
                   or meta.get("Message") or raw_text[:300] or f"HTTP {e.code}")
            request_id = err.get("request_id") or meta.get("RequestId") or ""
            raise RuntimeError(
                f"即梦 API 调用失败: HTTP {e.code}, code={code}, message={msg}"
                + (f", request_id={request_id}" if request_id else "")
            )
        except urllib.error.URLError as e:
            raise RuntimeError(f"即梦 API 网络错误: {e.reason}")

        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            raise RuntimeError("即梦 API 返回了无法解析的内容")
        meta = data.get("ResponseMetadata") or {}
        api_err = meta.get("Error") or {}
        if api_err:
            raise RuntimeError(
                f"即梦 API 调用失败: code={api_err.get('Code')}, "
                f"message={api_err.get('Message')}, request_id={meta.get('RequestId') or ''}"
            )
        if data.get("code") not in (None, 10000) and data.get("code") != "10000":
            raise RuntimeError(
                f"即梦 API 调用失败: code={data.get('code')}, message={data.get('message')}, "
                f"request_id={data.get('request_id') or ''}"
            )
        return data

    # ---------- 任务提交 / 查询 ----------

    def _submit_task(self, prompt: str, image_urls: List[str],
                     width: Optional[int], height: Optional[int],
                     force_single: bool = True,
                     binary_inputs: Optional[List[str]] = None) -> str:
        # 接口文档建议 prompt 不超过 800 字符，超长有概率出图异常或不生效
        if prompt and len(prompt) > 750:
            prompt = prompt[:750]
            print("[即梦] 提示词超过 750 字符，已自动截断以保证出图稳定")
        # 服务标识(req_key)使用当前配置的模型（默认即梦图片4.6，可在 API 设置中修改）
        req_key = (self.model or "").strip() or JIMENG_REQ_KEY
        body = {
            "req_key": req_key,
            "prompt": prompt,
        }
        if binary_inputs:
            body["binary_data_base64"] = binary_inputs
        elif image_urls:
            body["image_urls"] = image_urls
        if width and height:
            body["width"] = width
            body["height"] = height
        if force_single:
            body["force_single"] = True
        print(f"[即梦] 提交任务: prompt={prompt[:80]}, 图片={len(binary_inputs or image_urls)}张, 尺寸={width}x{height}, 单图={force_single}")
        # 并发/频率超限（50429/50430）自动重试，等待后重试
        last_err: Optional[Exception] = None
        for attempt in range(3):
            try:
                resp = self._post("CVSync2AsyncSubmitTask", body)
                last_err = None
                break
            except RuntimeError as e:
                low = str(e).lower()
                if ("50429" in str(e) or "50430" in str(e) or "concurrent limit" in low
                        or "api limit" in low or "qps" in low):
                    last_err = e
                    wait = 2 * (attempt + 1)
                    print(f"[即梦] 触发并发/频率限制，{wait} 秒后重试（第 {attempt + 1} 次）")
                    time.sleep(wait)
                    continue
                raise
        if last_err is not None:
            raise last_err
        data = resp.get("data") or {}
        task_id = data.get("task_id") or ""
        if not task_id:
            raise RuntimeError(f"即梦任务提交成功但未返回 task_id: {resp.get('message')}")
        return str(task_id)

    def _get_result(self, task_id: str) -> dict:
        req_json = json.dumps({"return_url": True}, ensure_ascii=False)
        req_key = (self.model or "").strip() or JIMENG_REQ_KEY
        body = {
            "req_key": req_key,
            "task_id": task_id,
            "req_json": req_json,
        }
        return self._post("CVSync2AsyncGetResult", body)

    def _poll_task(self, task_id: str, poll_interval: int = 4, max_wait: int = 180) -> dict:
        elapsed = 0
        while elapsed < max_wait:
            resp = self._get_result(task_id)
            data = resp.get("data") or {}
            status = data.get("status") or ""
            print(f"[即梦] 任务 {task_id[:8]} 状态: {status} (已等待 {elapsed}s)")
            if status == "done":
                return resp
            if status in ("not_found", "expired"):
                raise RuntimeError(f"即梦任务不存在或已过期（{status}），请重新提交")
            if status not in ("in_queue", "generating"):
                # 未知状态但外层 code=10000：继续等待兜底，避免偶发状态枚举差异
                print(f"[即梦] 未知任务状态: {status}，继续轮询")
            time.sleep(poll_interval)
            elapsed += poll_interval
        raise TimeoutError(f"即梦任务超时: 等待了 {max_wait} 秒仍未完成")

    # ---------- 结果处理 ----------

    def _capture_usage(self, image_count: int):
        usage = api_config.normalize_usage({
            "total_tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "image_count": image_count,
        })
        self.last_usage = usage
        try:
            api_config.record_usage(self.user_id, usage, self.scene, provider=self.provider)
        except Exception as e:
            print(f"[用量记录失败] {e}")
        return usage

    def _resize_to_target(self, image_path: str):
        """按最近一次请求的目标尺寸缩放（接口最小面积 1024*1024，业务尺寸可能更小）"""
        if not self._last_target_size:
            return
        from PIL import Image
        try:
            img = Image.open(image_path)
            if img.size == self._last_target_size:
                return
            img = img.convert("RGBA" if image_path.lower().endswith(".png") else "RGB")
            img = img.resize(self._last_target_size, Image.LANCZOS)
            img.save(image_path, format="PNG" if image_path.lower().endswith(".png") else "JPEG", quality=95)
            print(f"[即梦] 结果已缩放至 {self._last_target_size[0]}x{self._last_target_size[1]}: {image_path}")
        except Exception as e:
            print(f"[即梦] 结果缩放失败（按原尺寸使用）: {e}")

    def _save_binary(self, b64: str, save_dir: str, idx: int) -> str:
        """保存 base64 图片；binary_data_base64 可能是裸 base64 或 data: URL"""
        data = b64 or ""
        if data.startswith("data:"):
            data = data.split(",", 1)[-1]
        raw = base64.b64decode(data)
        os.makedirs(save_dir, exist_ok=True)
        file_path = os.path.join(save_dir, f"generated_{idx}_0.png")
        with open(file_path, "wb") as f:
            f.write(raw)
        self._resize_to_target(file_path)
        print(f"[即梦] ✅ 图片已保存: {file_path}")
        return file_path

    def _extract_and_save_images(self, resp: dict, save_dir: Optional[str] = None) -> List[str]:
        data = resp.get("data") or {}
        urls = data.get("image_urls") or []
        b64s = data.get("binary_data_base64") or []
        results: List[str] = []
        if b64s:
            for idx, b64 in enumerate(b64s):
                if not b64:
                    continue
                if save_dir:
                    results.append(self._save_binary(b64, save_dir, idx))
                else:
                    # 无保存目录时仍返回可下载引用：把 base64 转成 data URL
                    raw = b64
                    if raw.startswith("data:"):
                        results.append(raw)
                    else:
                        results.append(f"data:image/png;base64,{raw}")
        elif urls:
            results = [u for u in urls if u]
            if save_dir:
                saved = []
                for i, url in enumerate(results):
                    file_path = os.path.join(save_dir, f"generated_{i}_0.png")
                    self.download_image(url, file_path)
                    saved.append(file_path)
                results = saved
        return results

    # ---------- 对外接口（与 BailianImageClient 一致） ----------

    def image_editing_sync(
        self, prompt: str, images: List[str],
        model: Optional[str] = None, size: Optional[str] = None, n: Optional[int] = None,
        watermark: Optional[bool] = None, thinking_mode: Optional[bool] = None,
        save_dir: Optional[str] = None, poll_interval: int = 4, max_wait: int = 180,
    ) -> List[str]:
        """图生图（含文生图参考图场景）：提交即梦异步任务并轮询，返回图片列表"""
        size = size or config.OUTPUT_SIZE
        n = n or config.OUTPUT_NUM
        target = self._parse_size(size)
        self._last_target_size = target
        req_w, req_h = None, None
        if target:
            req_w, req_h = self._requestable_size(target[0], target[1])
            if (req_w, req_h) != target:
                print(f"[即梦] 目标尺寸 {target[0]}x{target[1]} 不在接口最小面积内，请求尺寸调整为 {req_w}x{req_h}，下载后自动缩放回目标尺寸")

        image_urls = self._normalize_image_inputs(images or [])
        print(f"[即梦] 正在调用 {self.model} 模型（图生图，同步模式）...")
        print(f"[即梦] 提示词: {prompt}")
        force_single = (n or 1) <= 1
        try:
            task_id = self._submit_task(prompt, image_urls, req_w, req_h, force_single=force_single)
        except RuntimeError as e:
            # 兼容性兜底：若接口不接受 data: URL（部分服务要求图片 URL），
            # 改用 binary_data_base64 提交（即梦素材提取等同平台服务支持该字段）
            msg = str(e).lower()
            if (image_urls and any(u.startswith("data:") for u in image_urls)
                    and any(k in msg for k in ("url", "image", "invalid", "param"))):
                raw = [u.split(",", 1)[-1] for u in image_urls if u.startswith("data:")]
                if raw:
                    print("[即梦] image_urls 提交失败，尝试以 binary_data_base64 方式提交")
                    task_id = self._submit_task(prompt, [], req_w, req_h,
                                                force_single=force_single, binary_inputs=raw)
                else:
                    raise
            else:
                raise
        resp = self._poll_task(task_id, poll_interval=poll_interval, max_wait=max_wait)
        result_urls = self._extract_and_save_images(resp, save_dir)
        usage = self._capture_usage(len(result_urls))
        if not result_urls:
            raise RuntimeError(f"即梦调用成功但未返回图片: {resp.get('message')}")
        print(f"[即梦] 生成完成，共 {len(result_urls)} 张图片，本次用量: {usage}")
        return result_urls

    def image_editing_async(self, prompt: str, images: List[str], **kwargs) -> List[str]:
        """兼容别名：即梦接口本身为异步提交，这里等同于同步轮询"""
        return self.image_editing_sync(prompt, images, **kwargs)

    def text_to_image_with_reference(
        self, prompt: str, reference_image: Optional[str] = None,
        model: Optional[str] = None, size: Optional[str] = None, save_dir: Optional[str] = None,
        n: int = 1,
    ) -> List[str]:
        """文生图；带参考图时走图生图"""
        if reference_image:
            return self.image_editing_sync(
                prompt=prompt, images=[reference_image],
                model=model, size=size, save_dir=save_dir, n=n,
            )
        size = size or config.OUTPUT_SIZE
        target = self._parse_size(size)
        self._last_target_size = target
        req_w, req_h = None, None
        if target:
            req_w, req_h = self._requestable_size(target[0], target[1])
        print(f"[即梦] 文生图模式，模型: {self.model}, 生成数量: {n}")
        task_id = self._submit_task(prompt, [], req_w, req_h, force_single=n <= 1)
        resp = self._poll_task(task_id)
        result_urls = self._extract_and_save_images(resp, save_dir)
        usage = self._capture_usage(len(result_urls))
        if not result_urls:
            raise RuntimeError(f"即梦调用成功但未返回图片: {resp.get('message')}")
        print(f"[即梦] 本次用量: {usage}")
        return result_urls

    def test_connection(self) -> dict:
        """轻量鉴权自检：用「查询任务」接口 + 无效任务 ID 探测鉴权是否通过。

        不会创建生成任务、不会产生任何费用；鉴权失败时返回服务端的真实错误码。
        """
        try:
            req_key = (self.model or "").strip() or JIMENG_REQ_KEY
            self._post("CVSync2AsyncGetResult", {
                "req_key": req_key,
                "task_id": "connection-test",
                "req_json": "{}",
            })
            return {"ok": True, "detail": "鉴权成功，即梦服务可正常访问"}
        except RuntimeError as e:
            s = str(e)
            low = s.lower()
            auth_failed = any(k in low for k in (
                "401", "invalidaccess", "signature", "authentication", "unauthorized",
                "permission", "deniedaccess", "authfailure", "credential",
                "security token", "request expired", "request time",
            ))
            if auth_failed:
                return {"ok": False, "detail": s}
            # 鉴权已通过，只是“任务不存在”之类的业务级提示
            return {"ok": True, "detail": "鉴权成功（服务返回: " + s + "）"}

    def download_image(self, url: str, save_path: str) -> str:
        """下载图片（支持 http(s) URL 与 data: URL），并按最近请求的目标尺寸缩放"""
        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
        if url.startswith("data:"):
            data = url.split(",", 1)[-1]
            with open(save_path, "wb") as f:
                f.write(base64.b64decode(data))
        elif url.startswith("http://") or url.startswith("https://"):
            urllib.request.urlretrieve(url, save_path)
        elif os.path.exists(url):
            import shutil
            shutil.copyfile(url, save_path)
        else:
            raise RuntimeError(f"无法下载图片: {url}")
        self._resize_to_target(save_path)
        print(f"[下载] 图片已保存到: {save_path}")
        return save_path
