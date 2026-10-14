"""
阿里云百炼 API 客户端
支持图生图（图像编辑）功能，将商品图与模板图合成电商主图
（前后端分离版 - 后端模块）
"""

import os
import base64
import mimetypes
import urllib.request
import time
from typing import Optional, List, Dict

import dashscope
from dashscope.aigc.image_generation import ImageGeneration
from dashscope.api_entities.dashscope_response import Message

from . import config
from . import api_config


class BailianImageClient:
    """阿里云百炼图像生成客户端"""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 model: Optional[str] = None, user_id: int = 0, scene: str = ""):
        # 严格按账号：不提供 api_key 即为空（不再回退全局 Key）
        self.api_key = api_key or ""
        self.base_url = base_url or api_config.get_base_url() or config.DASHSCOPE_BASE_URL
        self.model = model or api_config.get_model() or config.IMAGE_MODEL
        self.user_id = user_id
        self.scene = scene  # 消耗来源标注（如「营销海报·生成底图」），写入消耗历史
        self.provider = "dashscope"
        self.last_usage = {}
        dashscope.base_http_api_url = self.base_url

    @staticmethod
    def encode_image_to_base64(image_path: str) -> str:
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type or not mime_type.startswith("image/"):
            raise ValueError(f"不支持或无法识别的图像格式: {image_path}")
        with open(image_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
        return f"data:{mime_type};base64,{encoded}"

    def _capture_usage(self, response, image_count: int = None):
        """从响应中提取用量并累计到当前账号（供前端展示本次/累计消耗）。

        万相图片生成接口会返回 input/output tokens（图片也折算成 token 数），
        但实际按生成的图片张数计费：这里把实际张数写入 image_count，
        前端优先按“张”展示，tokens 仅作参考。
        """
        usage = {}
        raw = getattr(response, "usage", None)
        if raw:
            usage = dict(raw) if isinstance(raw, dict) else {}
        usage = api_config.normalize_usage(usage)
        if image_count is not None:
            usage["image_count"] = int(image_count)
        self.last_usage = usage
        try:
            api_config.record_usage(self.user_id, usage, self.scene, provider=self.provider)
        except Exception as e:
            print(f"[用量记录失败] {e}")
        return usage

    def image_editing_sync(
        self, prompt: str, images: List[str],
        model: Optional[str] = None, size: Optional[str] = None, n: Optional[int] = None,
        watermark: Optional[bool] = None, thinking_mode: Optional[bool] = None,
        save_dir: Optional[str] = None,
    ) -> List[str]:
        model = model or self.model
        size = size or config.OUTPUT_SIZE
        n = n or config.OUTPUT_NUM
        watermark = watermark if watermark is not None else config.WATERMARK
        thinking_mode = thinking_mode if thinking_mode is not None else config.THINKING_MODE

        content = [{"text": prompt}]
        for img in images:
            content.append({"image": img})

        message = Message(role="user", content=content)
        print(f"[API] 正在调用 {model} 模型（同步模式）...")
        print(f"[API] 提示词: {prompt}")
        print(f"[API] 输入图片数量: {len(images)}")

        response = ImageGeneration.call(
            model=model, api_key=self.api_key,
            messages=[message], watermark=watermark,
            n=n, size=size, thinking_mode=thinking_mode,
        )

        if response.status_code == 404:
            print("[API] ⚠️ 同步端点不可用（404），自动切换为异步模式...")
            return self.image_editing_async(
                prompt=prompt, images=images, model=model,
                size=size, n=n, watermark=watermark,
                thinking_mode=thinking_mode, save_dir=save_dir,
            )

        if response.status_code != 200:
            error_msg = f"API 调用失败: status_code={response.status_code}, code={response.code}, message={response.message}"
            print(f"[API] ❌ {error_msg}")
            raise RuntimeError(error_msg)

        result_urls = self._extract_and_save_images(response, save_dir)
        usage = self._capture_usage(response, len(result_urls))
        if not result_urls:
            raise RuntimeError(f"API 调用成功但未返回图片: {response.code} - {response.message}")
        print(f"[API] 生成完成，共 {len(result_urls)} 张图片")
        print(f"[API] 本次用量: {usage}")
        return result_urls

    def image_editing_async(
        self, prompt: str, images: List[str],
        model: Optional[str] = None, size: Optional[str] = None, n: Optional[int] = None,
        watermark: Optional[bool] = None, thinking_mode: Optional[bool] = None,
        save_dir: Optional[str] = None, poll_interval: int = 3, max_wait: int = 120,
    ) -> List[str]:
        model = model or self.model
        size = size or config.OUTPUT_SIZE
        n = n or config.OUTPUT_NUM
        watermark = watermark if watermark is not None else config.WATERMARK
        thinking_mode = thinking_mode if thinking_mode is not None else config.THINKING_MODE

        content = [{"text": prompt}]
        for img in images:
            content.append({"image": img})

        message = Message(role="user", content=content)
        print(f"[API] 正在提交异步任务到 {model} 模型...")
        print(f"[API] 提示词: {prompt}")

        response = ImageGeneration.async_call(
            model=model, api_key=self.api_key,
            messages=[message], watermark=watermark,
            n=n, size=size, thinking_mode=thinking_mode,
        )

        if response.status_code != 200:
            error_msg = f"任务提交失败: status_code={response.status_code}, code={response.code}, message={response.message}"
            print(f"[API] ❌ {error_msg}")
            raise RuntimeError(error_msg)

        task_id = response.output.task_id
        print(f"[API] 任务已提交，task_id: {task_id}")

        elapsed = 0
        while elapsed < max_wait:
            status = ImageGeneration.wait(task=response, api_key=self.api_key)
            task_status = status.output.task_status
            print(f"[API] 任务状态: {task_status} (已等待 {elapsed}s)")

            if task_status == "SUCCEEDED":
                break
            elif task_status in ("FAILED", "CANCELED", "UNKNOWN"):
                raise RuntimeError(f"任务失败: task_status={task_status}, message={status.message}")

            time.sleep(poll_interval)
            elapsed += poll_interval

        if elapsed >= max_wait:
            raise TimeoutError(f"任务超时: 等待了 {max_wait} 秒仍未完成")

        result_urls = self._extract_and_save_images(status, save_dir)
        usage = self._capture_usage(status)
        if not result_urls:
            raise RuntimeError(f"API 调用成功但未返回图片: {status.code} - {status.message}")
        print(f"[API] 生成完成，共 {len(result_urls)} 张图片")
        print(f"[API] 本次用量: {usage}")
        return result_urls

    def _extract_and_save_images(self, response, save_dir: Optional[str] = None) -> List[str]:
        result_urls = []
        for i, choice in enumerate(response.output.choices):
            for j, content_item in enumerate(choice["message"]["content"]):
                if content_item.get("type") == "image":
                    image_url = content_item["image"]
                    result_urls.append(image_url)
                    if save_dir:
                        os.makedirs(save_dir, exist_ok=True)
                        file_name = f"generated_{i}_{j}.png"
                        file_path = os.path.join(save_dir, file_name)
                        urllib.request.urlretrieve(image_url, file_path)
                        print(f"[API] ✅ 图片已保存: {file_path}")
        return result_urls

    def text_to_image_with_reference(
        self, prompt: str, reference_image: Optional[str] = None,
        model: Optional[str] = None, size: Optional[str] = None, save_dir: Optional[str] = None,
        n: int = 1,
    ) -> List[str]:
        if reference_image:
            return self.image_editing_sync(
                prompt=prompt, images=[reference_image],
                model=model, size=size, save_dir=save_dir, n=n,
            )
        else:
            message = Message(role="user", content=[{"text": prompt}])
            model = model or self.model
            size = size or config.OUTPUT_SIZE
            print(f"[API] 文生图模式，模型: {model}, 生成数量: {n}")
            response = ImageGeneration.call(
                model=model, api_key=self.api_key,
                messages=[message], watermark=False, n=n, size=size,
            )
            if response.status_code != 200:
                raise RuntimeError(f"API 调用失败: {response.code} - {response.message}")
            result_urls = self._extract_and_save_images(response, save_dir)
            usage = self._capture_usage(response, len(result_urls))
            if not result_urls:
                raise RuntimeError(f"API 调用成功但未返回图片: {response.code} - {response.message}")
            print(f"[API] 本次用量: {usage}")
            return result_urls

    @staticmethod
    def download_image(url: str, save_path: str) -> str:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        urllib.request.urlretrieve(url, save_path)
        print(f"[下载] 图片已保存到: {save_path}")
        return save_path


def create_image_client(user=None) -> "object":
    """按用户选择的供应商构建 AI 图片客户端（用户绑定凭证优先，回退全局配置）。

    - dashscope: 阿里云百炼 BailianImageClient（API Key）
    - jimeng: 即梦 AI 图片生成4.6 JimengImageClient（Access Key ID + Secret Access Key）
    """
    from .jimeng_client import JimengImageClient
    if not user:
        # 未登录场景（理论上不会触发 AI 调用）：回退阿里云百炼
        return BailianImageClient()
    if hasattr(user, "keys"):
        user = dict(user)
    user_id = user.get("id") or 0
    provider = api_config.get_user_provider(user)
    if provider == "jimeng":
        return JimengImageClient(
            access_key=api_config.get_user_access_key(user),
            secret_key=api_config.get_user_secret_key(user),
            model=user.get("api_model") or None,
            user_id=user_id,
        )
    return BailianImageClient(
        api_key=api_config.get_user_api_key(user),
        base_url=user.get("api_base_url") or None,
        model=user.get("api_model") or None,
        user_id=user_id,
    )
