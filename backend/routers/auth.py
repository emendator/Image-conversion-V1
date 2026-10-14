"""
认证路由 - 注册 / 登录 / 当前用户 / 账户 API Key 绑定
======================================================
- 注册：用户名+密码+邮箱+邀请码；一级邀请码→管理员，二级→用户；
        管理员可"加入公司/创建新公司"，用户仅"加入公司"；
        邀请码原子一次性使用；有效期联动账号 valid_until。
- 登录：返回 JWT + 用户信息；过期/禁用账号拦截。
- API Key：每个账户单独绑定（Fernet 加密落盘），传输用 XOR 混淆。
"""

import datetime
import random
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException

from .. import database, auth, api_config
from ..auth import require_any_login

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _now():
    return database.utc_now()


def parse_valid_until(value: str) -> str:
    """校验并规范化有效期（兼容毫秒），非法格式抛 400"""
    try:
        raw = value.strip()
        if "." in raw:  # 兼容毫秒格式
            raw = raw.split(".")[0] + "Z"
        dt = datetime.datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        raise HTTPException(400, "有效期格式应为 YYYY-MM-DDTHH:MM:SSZ")


def _invite_code_payload(code) -> dict:
    keys = code.keys() if hasattr(code, "keys") else []
    return {
        "id": code["id"],
        "code": code["code"],
        "level": code["level"],
        "status": code["status"],
        "created_by": code["created_by"],
        "creator_username": code["creator_username"] if "creator_username" in keys else None,
        "used_by_username": code["used_by_username"] if "used_by_username" in keys else None,
        "valid_until": code["valid_until"],
        "used_by": code["used_by"],
        "created_at": code["created_at"],
        "used_at": code["used_at"],
    }


# ========== 注册 ==========


@router.post("/register")
def register(data: dict):
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    email = (data.get("email") or "").strip().lower()
    invite_code = (data.get("invite_code") or "").strip().upper()
    action = (data.get("action") or "join").strip()
    company_name = (data.get("company_name") or "").strip()
    company_db_password = data.get("company_db_password") or ""

    # --- 基础校验 ---
    if not username or not password or not email or not invite_code:
        raise HTTPException(400, "用户名、密码、邮箱、邀请码均为必填项")
    if len(username) < 2:
        raise HTTPException(400, "用户名至少 2 个字符")
    if len(username) > 20:
        raise HTTPException(400, "用户名最多 20 个字符")
    if len(password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(400, "密码过长（最多 72 字节）")
    if len(email) > 100:
        raise HTTPException(400, "邮箱过长")
    if "@" not in email or "." not in email:
        raise HTTPException(400, "邮箱格式不正确")
    if database.get_user_by_username(username):
        raise HTTPException(400, "用户名已被注册")
    if database.get_user_by_email(email):
        raise HTTPException(400, "该邮箱已被注册")

    # --- 邀请码校验 ---
    inv = database.get_invite_code_by_code(invite_code)
    if not inv:
        raise HTTPException(400, "邀请码无效")
    if inv["status"] != "unused":
        raise HTTPException(400, "邀请码已被使用")
    if inv["valid_until"] and inv["valid_until"] < database.now_iso():
        raise HTTPException(400, "邀请码已过期")

    level = inv["level"]
    if level == 1:
        role = "admin"
    elif level == 2:
        role = "user"
    else:
        raise HTTPException(400, "邀请码级别非法")

    # --- 公司处理 ---
    if action == "create":
        if role != "admin":
            raise HTTPException(400, "用户注册仅能选择加入公司")
        if not company_name:
            raise HTTPException(400, "创建新公司需填写公司名称")
        if not company_db_password:
            raise HTTPException(400, "创建新公司需设置公司数据库密码")
        if len(company_db_password) < 6:
            raise HTTPException(400, "公司数据库密码至少 6 位")
        if database.get_company_by_name(company_name):
            raise HTTPException(400, "该公司名称已存在，请选择加入公司")
        company_id = database.create_company(
            company_name, auth.hash_password(company_db_password),
            created_by=None,
        )
    else:
        company = database.get_company_by_name(company_name)
        if not company:
            raise HTTPException(400, "公司不存在，请确认公司名称")
        if not auth.verify_password(company_db_password, company["db_password_hash"]):
            raise HTTPException(400, "公司数据库密码错误")
        company_id = company["id"]

    # --- 创建用户 + 原子使用邀请码（同一事务，杜绝并发竞态） ---
    user_id = database.create_user_and_consume_invite(
        username=username,
        password_hash=auth.hash_password(password),
        email=email,
        role=role,
        company_id=company_id,
        invite_id=inv["id"],
        created_by=inv["created_by"],
        valid_until=inv["valid_until"],
    )
    if not user_id:
        # 本次新建的公司未成功注册任何账号：回滚空公司（含图片库）
        if action == "create":
            database.delete_company_and_images(company_id)
        raise HTTPException(400, "邀请码已被使用，请刷新后重试")

    return {"success": True, "message": "注册成功，请登录"}


# ========== 邀请码检测（注册时前端按级别展示表单） ==========


@router.get("/invite-code-info")
def invite_code_info(code: str = ""):
    """仅检测邀请码有效性/级别，不消耗"""
    code = code.strip().upper()
    if not code:
        return {"valid": False, "message": "请输入邀请码"}
    inv = database.get_invite_code_by_code(code)
    if not inv:
        return {"valid": False, "message": "邀请码无效"}
    if inv["status"] != "unused":
        return {"valid": False, "message": "邀请码已被使用"}
    if inv["valid_until"] and inv["valid_until"] < database.now_iso():
        return {"valid": False, "message": "邀请码已过期"}
    return {"valid": True, "level": inv["level"], "message": ""}


# ========== 登录 ==========


@router.post("/login")
def login(data: dict):
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        raise HTTPException(400, "请输入用户名和密码")

    user = database.get_user_by_username(username)
    if not user or not auth.verify_password(password, user["password_hash"]):
        raise HTTPException(401, "用户名或密码错误")

    if user["status"] == "disabled":
        raise HTTPException(403, "账号已被禁用，请联系管理员")

    if user["valid_until"] and user["valid_until"] < database.now_iso():
        database.set_user_disabled(user["id"])
        raise HTTPException(403, "账号有效期已到，已被禁止登录，请联系管理员延长有效期")

    database.update_last_login(user["id"])
    token = auth.create_token(user)
    return {"token": token, "user": auth.serialize_user(user)}


# ========== 游客模式 ==========


@router.post("/guest")
def guest_login():
    """游客登录：创建临时账号与临时公司；游客可体验全部功能，但数据不保留，退出自动清除"""
    suffix = uuid.uuid4().hex[:10]
    username = f"游客_{suffix}"
    email = f"guest_{suffix}@guest.local"
    random_pwd = uuid.uuid4().hex + uuid.uuid4().hex
    # 创建独立临时公司（游客数据按公司隔离，退出时随账号级联清除）
    company_id = database.create_company(
        f"游客公司_{suffix}", auth.hash_password(random_pwd), created_by=None,
    )
    user_id = database.create_user(
        username=username,
        password_hash=auth.hash_password(random_pwd),
        email=email,
        role="guest",
        company_id=company_id,
        invite_code_id=None,
        created_by=None,
        valid_until=None,
    )
    user = database.get_user_by_id(user_id)
    token = auth.create_token(user)
    return {"token": token, "user": auth.serialize_user(user)}


@router.post("/guest-logout")
def guest_logout(user=Depends(require_any_login)):
    """游客退出：清除游客账号及其全部数据（图片库、临时底图、API Key 等）"""
    if user["role"] != "guest":
        return {"success": True, "message": "已退出"}
    user_id = user["id"]
    # 清除该游客在内存中的临时底图与海报修改记录
    try:
        from .poster import poster_bases, poster_edit_results, poster_tasks_lock
        with poster_tasks_lock:
            for k, v in list(poster_bases.items()):
                if v.get("user_id") == user_id:
                    poster_bases.pop(k, None)
            poster_edit_results.pop(user_id, None)
    except Exception:
        pass
    # 删除游客账号；其独立公司无账号后自动删除（含图片库记录与物理文件）
    database.delete_user(user_id)
    return {"success": True, "message": "游客数据已清除"}


# ========== 当前用户 ==========


@router.get("/me")
def me(user=Depends(require_any_login)):
    return auth.serialize_user(user)


# ========== 账户 API Key 绑定 ==========


@router.put("/api-key")
def bind_api_key(data: dict, user=Depends(require_any_login)):
    """绑定当前账户的 AI 生图凭证（传输混淆 + Fernet 加密落盘）

    支持两种供应商，可一键切换：
    - dashscope（阿里云百炼）：api_key
    - jimeng（即梦）：access_key + secret_key（火山引擎 Access Key ID / Secret Access Key）
    """
    provider = (data.get("provider") or "").strip() or api_config.get_user_provider(user)
    if provider not in ("dashscope", "jimeng"):
        raise HTTPException(400, "不支持的供应商")

    encrypted_key = (data.get("encrypted_key") or "").strip()
    nonce = (data.get("nonce") or "").strip()
    base_url = (data.get("base_url") or "").strip()
    model = (data.get("model") or "").strip()

    if encrypted_key and nonce:
        api_key = api_config.transit_decrypt(encrypted_key, nonce)
    else:
        api_key = (data.get("api_key") or "").strip()

    def _transit(field: str) -> str:
        enc = (data.get(field) or "").strip()
        if enc and nonce:
            return api_config.transit_decrypt(enc, nonce)
        return (data.get(field.replace("encrypted_", "")) or "").strip()

    access_key = _transit("encrypted_access_key")
    secret_key = _transit("encrypted_secret_key")

    changed = False

    # 供应商切换（不输入新凭证时保留原供应商已保存的凭证；切换本身即一次修改）
    if provider != api_config.get_user_provider(user):
        database.update_user_field(user["id"], "api_provider", provider)
        changed = True

    if provider == "jimeng":
        if access_key:
            if len(access_key) < 8:
                raise HTTPException(400, "Access Key ID 长度过短，请检查是否填写完整")
            database.update_user_field(user["id"], "api_access_key_encrypted",
                                       api_config.encrypt_secret(access_key))
            changed = True
        if secret_key:
            if len(secret_key) < 8:
                raise HTTPException(400, "Secret Access Key 长度过短，请检查是否填写完整")
            database.update_user_field(user["id"], "api_secret_key_encrypted",
                                       api_config.encrypt_secret(secret_key))
            changed = True
    else:
        if api_key:
            if len(api_key) < 8:
                raise HTTPException(400, "API Key 长度过短，请检查是否填写完整")
            database.update_user_field(user["id"], "api_key_encrypted", api_config.encrypt_secret(api_key))
            changed = True

    if base_url:
        database.update_user_field(user["id"], "api_base_url", base_url)
        changed = True
    if model:
        database.update_user_field(user["id"], "api_model", model)
        changed = True

    if not changed:
        raise HTTPException(400, "未做任何修改")

    return api_key_status(user["id"])


def api_key_status(user_id: int):
    """返回当前账户 AI 凭证状态（供应商 / 掩码 / 用量）"""
    user = database.get_user_by_id(user_id)
    provider = api_config.get_user_provider(user)
    # 累计用量按账号 + 按供应商分开统计；total_* 为当前供应商的独立消耗
    usage = api_config.get_usage(user_id, provider)
    usage_by_provider = api_config.get_usage_by_provider(user_id)
    # 已保存过凭证的供应商（供前端一键切换回，无需重新输入）
    configured = []
    if user["api_key_encrypted"]:
        configured.append("dashscope")
    if user["api_access_key_encrypted"] and user["api_secret_key_encrypted"]:
        configured.append("jimeng")
    # 后端能力版本：前端据此识别旧后端（旧后端无法保存即梦 AK/SK）
    api_version = 2

    if provider == "jimeng":
        ak = api_config.get_user_access_key(user)
        sk = api_config.get_user_secret_key(user)
        jimeng_model = (user["api_model"] or "").strip() or "jimeng_seedream46_cvtob"
        return {
            "provider": "jimeng",
            "provider_name": "即梦 AI · 图片生成4.6",
            "has_api_key": bool(ak and sk),
            "api_key_masked": api_config.mask_api_key(ak) if ak else "",
            "access_key_masked": api_config.mask_api_key(ak) if ak else "",
            "secret_key_masked": api_config.mask_api_key(sk) if sk else "",
            "key_masked": api_config.mask_api_key(ak) if ak else "",
            "base_url": "https://visual.volcengineapi.com",
            "model": jimeng_model,
            "model_name": "即梦图片4.6（Seedream 4.0 系）" if jimeng_model == "jimeng_seedream46_cvtob" else "",
            "total_tokens": usage.get("total_tokens", 0),
            "total_images": usage.get("image_count", 0),
            "calls": usage.get("calls", 0),
            "configured_providers": configured,
            "usage_by_provider": usage_by_provider,
            "api_version": api_version,
        }

    key = api_config.decrypt_secret(user["api_key_encrypted"] or "") if user["api_key_encrypted"] else ""
    return {
        "provider": "dashscope",
        "provider_name": "阿里云百炼 (DashScope)",
        "has_api_key": bool(key),
        "api_key_masked": api_config.mask_api_key(key) if key else "",
        "key_masked": api_config.mask_api_key(key) if key else "",
        "base_url": user["api_base_url"] or api_config.get_base_url(),
        "model": user["api_model"] or api_config.get_model(),
        "model_name": "",
        "total_tokens": usage.get("total_tokens", 0),
        "total_images": usage.get("image_count", 0),
        "calls": usage.get("calls", 0),
        "configured_providers": configured,
        "usage_by_provider": usage_by_provider,
        "api_version": api_version,
    }


# ========== 生成邀请码 ==========


@router.post("/invite-codes")
def create_invite_code(data: dict, user=Depends(require_any_login)):
    """创建邀请码：level=1 仅超管；level=2 超管/管理员均可"""
    try:
        level = int(data.get("level") or 0)
    except (TypeError, ValueError):
        level = 0
    valid_until = (data.get("valid_until") or "").strip()

    if level not in (1, 2):
        raise HTTPException(400, "邀请码级别只能是 1（管理员）或 2（用户）")
    if level == 1 and user["role"] != "super_admin":
        raise HTTPException(403, "仅最高级管理员可分发一级邀请码")

    # 有效期：不填则默认 30 天；填了则校验格式
    if not valid_until:
        dt = _now() + datetime.timedelta(days=30)
        valid_until = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    else:
        valid_until = parse_valid_until(valid_until)

    code = _generate_code()
    invite_id = database.create_invite_code(code, level, user["id"], valid_until)
    inv = database.get_invite_code_by_id(invite_id)
    return {"success": True, "invite": _invite_code_payload(inv)}


@router.get("/invite-codes")
def list_invite_codes(user=Depends(require_any_login)):
    """只能查看本账户创建的邀请码；已使用的邀请码自动消除，不再显示"""
    # 自动消除本账户已使用的邀请码
    try:
        database.delete_used_invite_codes(user["id"])
    except Exception as e:
        print(f"[邀请码] 清理已使用记录失败: {e}")
    rows = database.list_invite_codes(created_by=user["id"], status="unused")
    return {"invites": [_invite_code_payload(r) for r in rows]}


@router.delete("/invite-codes/{invite_id}")
def delete_invite_code(invite_id: int, user=Depends(require_any_login)):
    inv = database.get_invite_code_by_id(invite_id)
    if not inv:
        raise HTTPException(404, "邀请码不存在")
    if inv["status"] != "unused":
        raise HTTPException(400, "已使用的邀请码不可作废")
    if inv["created_by"] != user["id"]:
        raise HTTPException(403, "仅创建者可作废该邀请码")
    database.delete_invite_code(invite_id)
    return {"success": True, "message": "邀请码已作废"}


_COLORS = ["AZURE", "CRIMSON", "EMERALD", "GOLDEN", "INDIGO", "LILAC", "MINT", "OCHRE", "RUBY", "SAFFRON", "SAPPHIRE", "SLATE", "TOPAZ", "VIOLET", "CORAL"]
_NOUNS = ["FALCON", "HARBOR", "MIRROR", "PEBBLE", "QUARTZ", "RIVER", "SUNSET", "TEMPLE", "VALLEY", "WILLOW", "ORBIT", "NIMBUS", "HORIZON", "RIBBON", "MEADOW"]

def _generate_code(length: int = 4) -> str:
    """生成易读易记的邀请码：COLOR-NOUN-XXXX（detail.design #79 Color Name Invite Code）

    相比纯随机字符，颜色+名词的组合更好读、更好念、更好分享；
    尾部保留 4 位安全随机串（排除易混淆字符 0/O/1/I）保证唯一性。
    """
    alphabet = string.ascii_uppercase + string.digits
    for ch in "0O1I":
        alphabet = alphabet.replace(ch, "")
    for _ in range(100):
        color = random.choice(_COLORS)
        noun = random.choice(_NOUNS)
        suffix = "".join(random.choices(alphabet, k=length))
        code = f"{color}-{noun}-{suffix}"
        if not database.get_invite_code_by_code(code):
            return code
    raise HTTPException(500, "邀请码生成失败，请重试")
