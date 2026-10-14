"""
用户管理路由 - 账号列表 / 延期 / 禁用 / 删除（含级联）
======================================================
- 查询范围：本账户 + 本账户通过邀请码邀请注册的账户（超管/管理员一致）
- 超管可删除任意 admin/user（删除 admin 时级联删除其下级用户）；管理员仅可管理本人邀请的普通用户
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import database
from ..auth import require_admin_or_above
from .auth import parse_valid_until

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_payload(user) -> dict:
    company = database.get_company_by_id(user["company_id"])
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "company_id": user["company_id"],
        "company_name": company["name"] if company else "",
        "created_at": user["created_at"],
        "last_login_at": user["last_login_at"],
        "valid_until": user["valid_until"],
        "expired": bool(user["valid_until"] and user["valid_until"] < database.now_iso()),
        "status": user["status"],
        "has_api_key": bool(user["api_key_encrypted"]),
    }


@router.get("/users")
def list_users(user=Depends(require_admin_or_above)):
    """只能查询：本账户 + 本账户通过邀请码邀请注册的账户"""
    invited = database.list_users(created_by=user["id"])
    me = database.get_user_by_id(user["id"])
    # 本账户置前，避免重复
    result = [me] + [r for r in invited if r["id"] != user["id"]]
    return {"users": [_user_payload(r) for r in result]}


@router.post("/users/{user_id}/extend")
def extend_user(user_id: int, data: dict, user=Depends(require_admin_or_above)):
    target = database.get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "账号不存在")
    _check_manageable(user, target)

    new_valid_until = (data.get("valid_until") or "").strip()
    if not new_valid_until:
        raise HTTPException(400, "请填写新的有效时间（YYYY-MM-DDTHH:MM:SSZ）")
    # 校验并规范化有效期格式
    new_valid_until = parse_valid_until(new_valid_until)

    database.update_user_field(user_id, "valid_until", new_valid_until)
    database.update_user_field(user_id, "status", "active")
    return {"success": True, "message": "已延长账号有效时间"}


@router.post("/users/{user_id}/disable")
def disable_user(user_id: int, user=Depends(require_admin_or_above)):
    target = database.get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "账号不存在")
    _check_manageable(user, target)

    database.set_user_disabled(user_id)
    return {"success": True, "message": "账号已禁用"}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, user=Depends(require_admin_or_above)):
    """删除账号；超管删除管理员时级联删除其下级用户（同一事务）"""
    target = database.get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "账号不存在")
    _check_manageable(user, target)

    if target["role"] == "super_admin":
        raise HTTPException(400, "不能删除最高级管理员账号")

    # 级联：删除目标管理员创建的下级用户
    cascade_count = 0
    if user["role"] == "super_admin" and target["role"] == "admin":
        descendants = database.list_users(created_by=target["id"])
        for d in descendants:
            if d["id"] != user_id:
                database.delete_user(d["id"])
                cascade_count += 1

    company_deleted = database.delete_user(user_id)
    if company_deleted:
        return {
            "success": True,
            "message": "账号已删除，该公司已无任何账号，公司名称、密码及图片库已自动删除",
            "cascade_count": cascade_count,
            "company_deleted": True,
        }
    return {
        "success": True,
        "message": f"账号已删除" + (f"，并级联删除其下 {cascade_count} 个关联用户账号" if cascade_count else ""),
        "cascade_count": cascade_count,
        "company_deleted": False,
    }


def _check_manageable(operator, target):
    """校验操作者是否有权管理目标账号"""
    if operator["role"] == "super_admin":
        return
    # 管理员只能管理自己创建的、且非管理员/非超管的账号
    if target["id"] == operator["id"]:
        raise HTTPException(400, "不能操作自己的账号")
    if target["role"] != "user":
        raise HTTPException(403, "管理员仅能管理普通用户账号")
    if target["created_by"] != operator["id"]:
        raise HTTPException(403, "仅能管理本人邀请码注册的用户")
