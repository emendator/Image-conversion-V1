"""
公司路由 - 公司列表（注册用）+ 修改公司数据库密码
=================================================
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import database, auth
from ..auth import require_admin_or_above

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("")
def get_companies():
    """公司列表（注册时"加入公司"下拉用，无需登录）"""
    rows = database.list_companies()
    return {"companies": [{"id": r["id"], "name": r["name"], "created_at": r["created_at"]} for r in rows]}


@router.put("/{company_id}/db-password")
def change_db_password(company_id: int, data: dict, user=Depends(require_admin_or_above)):
    """管理员/最高级管理员修改所属公司的数据库密码（需校验旧密码）"""
    if user["role"] not in ("admin", "super_admin"):
        raise HTTPException(403, "仅管理员可修改公司数据库密码")
    if user["company_id"] != company_id:
        raise HTTPException(403, "仅能修改本公司的数据库密码")

    company = database.get_company_by_id(company_id)
    if not company:
        raise HTTPException(404, "公司不存在")

    old_password = data.get("old_password") or ""
    new_password = data.get("new_password") or ""

    if not auth.verify_password(old_password, company["db_password_hash"]):
        raise HTTPException(400, "原公司数据库密码错误")
    if len(new_password) < 6:
        raise HTTPException(400, "新密码至少 6 位")

    database.update_company_db_password(company_id, auth.hash_password(new_password))
    return {"success": True, "message": "公司数据库密码已更新"}
