"""
图片库路由 - 三类图片（电商模板 / 切片模板 / 海报底图）的增删改查
================================================================
- 按公司隔离：所有读写以当前用户 company_id 过滤
- 文件物理存储：data/image_library/{company_id}/{category}/{orientation}
- 文件访问支持 query token（供 <img> 直接引用），兼容 Authorization 头
"""

import os
import base64
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse

from PIL import Image

from .. import database, auth
from ..auth import require_any_login

router = APIRouter(prefix="/api", tags=["images"])

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
CATEGORIES = {"ecommerce", "slice", "poster_base"}
ORIENTATIONS = {"horizontal", "vertical"}


def _thumbnail_base64(image_path: str, max_size: int = 512) -> str:
    """生成图片缩略图 Base64（列表展示用，512px 保证预览清晰）"""
    try:
        img = Image.open(image_path)
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=88)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception:
        return ""


def _resolve_user(request: Request):
    """优先 Authorization 头，其次 ?token= 查询参数（供 <img> 引用）"""
    return auth.get_user_from_request(request)


def _image_payload(img) -> dict:
    abs_path = database.image_abs_path(img["company_id"], img["filepath"])
    return {
        "id": img["id"],
        "category": img["category"],
        "orientation": img["orientation"],
        "label": img["label"] or "",
        "name": img["name"],
        "filename": img["filename"],
        "size": img["size"],
        "uploaded_by": img["uploaded_by"],
        "created_at": img["created_at"],
        "updated_at": img["updated_at"],
        "is_default": database.is_default_image(img),
        "thumbnail": _thumbnail_base64(abs_path) if os.path.exists(abs_path) else "",
        "file_url": f"/api/images/{img['id']}/file",
    }


# ========== 图片列表 / 上传 / 修改 / 删除 ==========


@router.get("/images")
def list_images(request: Request, category: str = None, orientation: str = None,
                label: str = None, keyword: str = None):
    user = _resolve_user(request)
    if category and category not in CATEGORIES:
        raise HTTPException(400, "图片分类非法")
    if orientation and orientation not in ORIENTATIONS:
        raise HTTPException(400, "版型非法")
    rows = database.list_images(user["company_id"], category, orientation, label, keyword)
    return {"images": [_image_payload(r) for r in rows]}


@router.get("/image-labels")
def image_labels(request: Request, category: str = None):
    """返回图片库已有的自定义分类列表（供筛选 / 上传时选择已有分类）"""
    user = _resolve_user(request)
    if category and category not in CATEGORIES:
        raise HTTPException(400, "图片分类非法")
    return {"labels": database.list_image_labels(user["company_id"], category)}


@router.post("/images")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(...),
    orientation: str = Form(""),
    label: str = Form(""),
    name: str = Form(""),
):
    user = _resolve_user(request)
    if category not in CATEGORIES:
        raise HTTPException(400, "图片分类非法")
    if orientation and orientation not in ORIENTATIONS:
        raise HTTPException(400, "版型非法")
    if category == "slice" and not orientation:
        raise HTTPException(400, "切片模板需选择版型（横板/竖版）")

    ext = os.path.splitext(file.filename or "")[1].lower() or ".png"
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "仅支持 png/jpg/jpeg/webp/bmp 图片")

    display_name = (name or "").strip() or os.path.splitext(os.path.basename(file.filename or "image"))[0]
    content = await file.read()
    if not content:
        raise HTTPException(400, "文件内容为空")

    image_id = database.store_image_upload(
        user["company_id"], category, orientation, label, display_name, content, ext, user["id"],
    )
    img = database.get_image_by_id(image_id)
    return {"success": True, "image": _image_payload(img)}


@router.put("/images/{image_id}")
def update_image(image_id: int, data: dict, user=Depends(require_any_login)):
    img = database.get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "图片不存在")
    # 默认模板（company_id=0）为所有公司共用，允许修改名称/分类/版型；公司自有模板仅本公司
    if not database.is_default_image(img) and img["company_id"] != user["company_id"]:
        raise HTTPException(404, "图片不存在")

    new_name = (data.get("name") or "").strip()
    new_orientation = (data.get("orientation") or "").strip()
    new_label = (data.get("label") or "").strip()
    if new_name:
        if len(new_name) > 60:
            raise HTTPException(400, "图片名过长")
        database.update_image_field(image_id, "name", new_name)
    if new_orientation:
        if new_orientation not in ORIENTATIONS:
            raise HTTPException(400, "版型非法")
        database.update_image_field(image_id, "orientation", new_orientation)
    if "label" in data:
        database.update_image_field(image_id, "label", new_label)
    img = database.get_image_by_id(image_id)
    return {"success": True, "image": _image_payload(img)}


@router.delete("/images/{image_id}")
def delete_image(image_id: int, user=Depends(require_any_login)):
    img = database.get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "图片不存在")
    # 默认模板（company_id=0）为所有公司共用，允许删除；公司自有模板仅本公司可删
    if not database.is_default_image(img) and img["company_id"] != user["company_id"]:
        raise HTTPException(404, "图片不存在")
    try:
        abs_path = database.image_abs_path(img["company_id"], img["filepath"])
        if os.path.exists(abs_path):
            os.remove(abs_path)
    except Exception as e:
        print(f"[图片库] 删除文件失败 {e}")
    database.delete_image_record(image_id)
    return {"success": True, "message": "图片已删除"}


@router.get("/images/{image_id}/file")
def image_file(image_id: int, request: Request):
    """原始图片文件（<img> 可用 ?token= 引用；默认模板所有公司可访问）"""
    user = _resolve_user(request)
    img = database.get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "图片不存在")
    # 默认模板（company_id=0）任何登录用户可访问；公司自有模板仅本公司
    if not database.is_default_image(img) and img["company_id"] != user["company_id"]:
        raise HTTPException(404, "图片不存在")
    abs_path = database.image_abs_path(img["company_id"], img["filepath"])
    if not os.path.exists(abs_path):
        raise HTTPException(404, "文件不存在")
    return FileResponse(abs_path, filename=img["filename"])


# ========== 生成器模板接口（从图片库读取，按公司隔离） ==========


@router.get("/templates")
def get_ecommerce_templates(request: Request):
    user = _resolve_user(request)
    rows = database.list_images(user["company_id"], category="ecommerce")
    return {"templates": [_template_item(r) for r in rows]}


@router.get("/slice-templates")
def get_slice_templates(request: Request, orientation: str = "horizontal"):
    if orientation not in ORIENTATIONS:
        orientation = "horizontal"
    user = _resolve_user(request)
    rows = database.list_images(user["company_id"], category="slice", orientation=orientation)
    return {"templates": [_template_item(r) for r in rows]}


def _template_item(img) -> dict:
    """模板项：兼容旧字段 name/path/thumbnail，新增 id/file_url/is_default"""
    abs_path = database.image_abs_path(img["company_id"], img["filepath"])
    sub_prefix = f"{img['orientation']}/" if img["orientation"] else ""
    return {
        "id": img["id"],
        "name": f"{sub_prefix}{img['filename']}",
        "path": abs_path,
        "thumbnail": _thumbnail_base64(abs_path, max_size=512) if os.path.exists(abs_path) else "",
        "file_url": f"/api/images/{img['id']}/file",
        "category": img["category"],
        "orientation": img["orientation"],
        "is_default": database.is_default_image(img),
    }


# ========== 海报底图保存 ==========


@router.post("/poster-bases")
async def save_poster_base(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(""),
    label: str = Form(""),
):
    """保存营销海报生成的底图到图片库（poster_base 分类）"""
    user = _resolve_user(request)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".png"
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "仅支持 png/jpg/jpeg/webp/bmp 图片")
    display_name = (name or "").strip() or "海报底图"
    content = await file.read()
    if not content:
        raise HTTPException(400, "文件内容为空")
    image_id = database.store_image_upload(
        user["company_id"], "poster_base", "", label, display_name, content, ext, user["id"],
    )
    img = database.get_image_by_id(image_id)
    return {"success": True, "image": _image_payload(img)}
