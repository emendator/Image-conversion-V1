"""
图片处理模块
负责营销海报素材合成（按预览位置/默认位置粘贴素材）
（前后端分离版 - 后端模块）
"""

import os
from typing import Tuple, Dict

from PIL import Image, ImageDraw, ImageFont

from . import config


def composite_poster(
    base_image_path: str, logo_path: str = None, qr_path: str = None,
    brand_path: str = None, output_path: str = None,
    canvas_size: Tuple[int, int] = (520, 1150),
    padding: int = 0, bottom_padding: int = 20,
    logo_max_width: int = 250, logo_max_height: int = 250,
    qr_max_width: int = 250, qr_max_height: int = 250,
    brand_max_width: int = 520, brand_max_height: int = 350,
    positions: Dict = None,
) -> str:
    """合成营销海报。

    positions: 可选，前端预览区拖拽后的素材位置，格式：
        {"logo": {"xPct","yPct","wPct","hPct"}, "qr": {...}, "brand": {...}}
    提供时按百分比换算为像素粘贴（图片 contain 缩放并居中于目标区域）；
    未提供时使用原有固定位置（logo 左上、二维码右上、品牌图底部居中）。
    """
    if output_path is None:
        output_path = os.path.join(config.OUTPUT_DIR, "poster_result.png")

    base = Image.open(base_image_path).convert("RGBA")
    base = base.resize(canvas_size, Image.LANCZOS)

    def _resize_and_paste(src_path, max_w, max_h, anchor='top-left', bp=0, tp=0):
        if not src_path or not os.path.exists(src_path):
            return None
        try:
            img = Image.open(src_path).convert("RGBA")
            w, h = img.size
            ratio = min(max_w / w, max_h / h)
            new_w = int(w * ratio)
            new_h = int(h * ratio)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            if anchor == 'top-left':
                pos = (0, -50 + tp)
            elif anchor == 'top-right':
                pos = (canvas_size[0] - new_w, -50 + tp)
            elif anchor == 'bottom-center':
                pos = ((canvas_size[0] - new_w) // 2, canvas_size[1] - new_h - bp)
            else:
                pos = (0, 0)
            base.paste(img, pos, img)
            print(f"[合成] 已放置: {os.path.basename(src_path)} 原图 {w}×{h} → {new_w}×{new_h} 位置: {pos}")
            return img
        except Exception as e:
            print(f"[合成] 粘贴失败 {src_path}: {e}")
            return None

    def _paste_at(src_path, x, y, w, h):
        """按像素区域粘贴：图片 contain 缩放后居中于 (x,y,w,h)"""
        if not src_path or not os.path.exists(src_path):
            return None
        try:
            img = Image.open(src_path).convert("RGBA")
            iw, ih = img.size
            if w <= 0 or h <= 0 or iw <= 0 or ih <= 0:
                return None
            ratio = min(w / iw, h / ih)
            new_w = max(1, int(iw * ratio))
            new_h = max(1, int(ih * ratio))
            img = img.resize((new_w, new_h), Image.LANCZOS)
            px = x + (w - new_w) // 2
            py = y + (h - new_h) // 2
            base.paste(img, (px, py), img)
            print(f"[合成] 已放置(预览位置): {os.path.basename(src_path)} {iw}×{ih} → {new_w}×{new_h} 位置 ({px},{py})")
            return img
        except Exception as e:
            print(f"[合成] 粘贴失败 {src_path}: {e}")
            return None

    if positions:
        cw, ch = canvas_size
        mapping = {
            "logo": logo_path,
            "qr": qr_path,
            "brand": brand_path,
        }
        for key, src_path in mapping.items():
            pos = (positions or {}).get(key)
            if not pos or not src_path:
                continue
            x = int(float(pos.get("xPct", 0)) / 100.0 * cw)
            y = int(float(pos.get("yPct", 0)) / 100.0 * ch)
            w = int(float(pos.get("wPct", 0)) / 100.0 * cw)
            h = int(float(pos.get("hPct", 0)) / 100.0 * ch)
            _paste_at(src_path, x, y, w, h)
    else:
        _resize_and_paste(logo_path, logo_max_width, logo_max_height, 'top-left')
        _resize_and_paste(qr_path, qr_max_width, qr_max_height, 'top-right', tp=50)
        _resize_and_paste(brand_path, brand_max_width, brand_max_height, 'bottom-center', bp=bottom_padding)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    base.save(output_path, format="PNG")
    print(f"[合成] 海报已保存: {output_path}")
    return output_path
