"""
认证模块 - 密码哈希 + JWT 签发/校验 + FastAPI 依赖
=================================================
- 密码/公司数据库密码：bcrypt（passlib CryptContext）
- 会话令牌：JWT（pyjwt），有效期 7 天，密钥由环境变量 JWT_SECRET 强制注入（不落盘）
- 依赖：get_current_user / require_roles
"""

import os
import datetime

import jwt
import bcrypt

from fastapi import Request, HTTPException, Depends

from . import database
from . import api_config

# 令牌有效期（秒），7 天
TOKEN_TTL = 7 * 24 * 3600

# JWT 密钥最小长度
JWT_SECRET_MIN_LENGTH = 32

# bcrypt 最多 72 字节
_BCRYPT_MAX = 72


# ========== JWT 密钥 ==========
# 密钥不再自动生成、不再落盘，必须通过环境变量 JWT_SECRET 强制注入。


def _jwt_secret() -> str:
    secret = (os.environ.get("JWT_SECRET") or "").strip()
    if not secret:
        raise RuntimeError(
            "缺少 JWT_SECRET 环境变量：请先注入 JWT 签名密钥再启动。\n"
            "  Linux/macOS:         export JWT_SECRET=$(python -c \"import secrets;print(secrets.token_urlsafe(48))\")\n"
            "  Windows(PowerShell): $env:JWT_SECRET=\"<至少32位的随机字符串>\"\n"
            "密钥不再自动生成或从 data/ 读取；更换密钥会使已签发的令牌全部失效。"
        )
    if len(secret) < JWT_SECRET_MIN_LENGTH:
        raise RuntimeError(f"JWT_SECRET 长度不足：至少需要 {JWT_SECRET_MIN_LENGTH} 个字符。")
    return secret


def require_jwt_secret() -> None:
    """启动时校验：JWT 密钥必须已注入，缺失即拒绝启动"""
    _jwt_secret()


# ========== 密码哈希 ==========


def hash_password(password: str) -> str:
    """bcrypt 哈希（截断到 72 字节以内）"""
    raw = password.encode("utf-8")[:_BCRYPT_MAX]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """校验明文密码与 bcrypt 哈希是否匹配"""
    if not password_hash:
        return False
    try:
        raw = password.encode("utf-8")[:_BCRYPT_MAX]
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except Exception:
        return False


# ========== JWT 签发/校验 ==========


def create_token(user) -> str:
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "company_id": user["company_id"],
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=TOKEN_TTL),
        "iat": datetime.datetime.now(datetime.timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def decode_token(token: str):
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except Exception:
        return None


def get_user_from_token(token: str):
    """由 token 解出并校验用户（返回 sqlite Row 或 None）"""
    payload = decode_token(token)
    if not payload:
        return None
    try:
        user = database.get_user_by_id(int(payload.get("sub")))
    except (TypeError, ValueError):
        return None
    if not user or user["status"] != "active":
        return None
    if user["valid_until"] and user["valid_until"] < database.now_iso():
        return None
    return user


def get_user_from_request(request: Request):
    """从 Authorization 头或 ?token= 查询参数解析用户（供 <img>/<a download> 等无法带 Header 的场景）"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    else:
        token = request.query_params.get("token") or ""
    if not token:
        raise HTTPException(401, "未登录或登录已过期")
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(401, "未登录或登录已过期")
    return user


# ========== FastAPI 依赖 ==========


def get_current_user(request: Request):
    """从 Authorization: Bearer 头解析当前用户；未登录/过期/禁用一律 401"""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "未登录或登录已过期")
    user = get_user_from_token(auth[7:].strip())
    if not user:
        raise HTTPException(401, "未登录或登录已过期")
    return user


def require_roles(*roles):
    """角色守卫依赖工厂：仅允许指定角色访问"""
    def _dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "无权限执行该操作")
        return user
    return _dep


# 便捷别名
require_admin_or_above = require_roles("super_admin", "admin")
require_any_login = get_current_user


def serialize_user(user) -> dict:
    """对外输出用户信息（不含敏感字段）"""
    company = database.get_company_by_id(user["company_id"])
    valid_until = user["valid_until"]
    expired = bool(valid_until and valid_until < database.now_iso())
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "company_id": user["company_id"],
        "company_name": company["name"] if company else "",
        "invite_code_id": user["invite_code_id"],
        "created_at": user["created_at"],
        "last_login_at": user["last_login_at"],
        "valid_until": valid_until,
        "expired": expired,
        "status": user["status"],
        "has_api_key": api_config.has_user_api_key(user),
    }
