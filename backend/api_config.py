"""
API 密钥安全存储与用量统计模块
================================

职责：
1. 使用 Fernet 对称加密将 API Key 加密后落盘（主目录 data/api_config.json），
   避免任何地方以明文形式存储密钥（前端显示掩码、后端配置不再含明文）。
2. 提供前端 API 设置界面所需的数据：当前使用的供应商、是否已配置 Key、
   Key 掩码、Base URL、模型、以及当前 Key 的累计 Token 消耗。
3. 每次 AI 调用成功后累计该 API Key 的 Token 用量（按 Key 指纹隔离），
   切换 API Key 后自动按新 Key 重新计算总量。

安全约定：
- 加密密钥保存在主目录 data/.secret_key（本机独立生成，不入库、不入 git）。
- 前端始终只拿到掩码（sk-****xxxx），绝不回传明文。
- 前端提交新 Key 时使用一次性 nonce 做 XOR 混淆后再传输（防网络明文）。
"""

import os
import json
import base64
import time
import datetime
import threading
import shutil

try:
    from cryptography.fernet import Fernet, InvalidToken
    HAVE_CRYPTO = True
except Exception:  # pragma: no cover - 兜底
    HAVE_CRYPTO = False

from . import config

# ========== 路径 ==========
# 数据统一存放在项目主目录下的 data/（删除后下次运行自动重建）
DATA_DIR = os.path.join(config.BASE_DIR, "data")
# 兼容旧版本：数据曾存放在 backend/data，首次运行自动迁移
LEGACY_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
CONFIG_FILE = os.path.join(DATA_DIR, "api_config.json")
SECRET_KEY_FILE = os.path.join(DATA_DIR, ".secret_key")
USAGE_FILE = os.path.join(DATA_DIR, "api_usage.json")

_lock = threading.Lock()
_secret_lock = threading.Lock()  # 保护加密密钥文件的并发生成


def _migrate_data_dir():
    """将旧版 backend/data 中的数据迁移到主目录 data/（新位置已有数据时不覆盖）"""
    try:
        if os.path.abspath(DATA_DIR) == os.path.abspath(LEGACY_DATA_DIR):
            return
        if os.path.exists(LEGACY_DATA_DIR) and not os.path.exists(CONFIG_FILE):
            os.makedirs(DATA_DIR, exist_ok=True)
            for fname in os.listdir(LEGACY_DATA_DIR):
                src = os.path.join(LEGACY_DATA_DIR, fname)
                if os.path.isfile(src) and not os.path.exists(os.path.join(DATA_DIR, fname)):
                    shutil.move(src, os.path.join(DATA_DIR, fname))
            # 旧目录清空后尝试删除
            try:
                if not os.listdir(LEGACY_DATA_DIR):
                    os.rmdir(LEGACY_DATA_DIR)
            except Exception:
                pass
            print(f"[API配置] 数据已迁移到主目录: {DATA_DIR}")
    except Exception as e:
        print(f"[API配置] 数据迁移失败: {e}")

# ========== 加解密（落盘） ==========


def _get_or_create_secret_key() -> bytes:
    """获取（或首次生成）本机加密密钥（线程安全，删除后自动重建）"""
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE, "rb") as f:
            return f.read().strip()
    with _secret_lock:
        # 双检锁：等待锁期间可能已被其他线程创建
        if os.path.exists(SECRET_KEY_FILE):
            with open(SECRET_KEY_FILE, "rb") as f:
                return f.read().strip()
        key = Fernet.generate_key()
        os.makedirs(DATA_DIR, exist_ok=True)
        fd = os.open(SECRET_KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(key)
        return key


def _fernet():
    return Fernet(_get_or_create_secret_key())


def _encrypt(plain: str) -> str:
    """加密 API Key 为可落盘字符串"""
    if not plain:
        return ""
    if HAVE_CRYPTO:
        return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")
    return _fallback_encrypt(plain)


def _decrypt(token: str) -> str:
    """解密落盘字符串为 API Key"""
    if not token:
        return ""
    if HAVE_CRYPTO:
        try:
            return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
        except (InvalidToken, Exception):
            return ""
    return _fallback_decrypt(token)


def _fallback_encrypt(plain: str) -> str:
    """未安装 cryptography 时的兜底混淆（流式 XOR）"""
    key = _get_or_create_secret_key()
    raw = plain.encode("utf-8")
    out = bytearray(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return "f:" + base64.b64encode(bytes(out)).decode("ascii")


def _fallback_decrypt(token: str) -> str:
    if not token.startswith("f:"):
        return ""
    key = _get_or_create_secret_key()
    try:
        raw = base64.b64decode(token[2:])
    except Exception:
        return ""
    out = bytearray(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return bytes(out).decode("utf-8")


# ========== 传输混淆（前端 ↔ 后端） ==========
# 仅做“非明文”混淆：前端拿到 GET /api/config/api 返回的 nonce，
# 用 nonce 字节流对 API Key 做 XOR 后以 base64 提交，后端同样方式还原。


def transit_decrypt(token: str, nonce: str) -> str:
    """后端使用：还原前端提交的混淆 API Key"""
    if not token or not nonce:
        return ""
    nonce_bytes = nonce.encode("utf-8")
    try:
        raw = base64.b64decode(token)
    except Exception:
        return ""
    out = bytearray(b ^ nonce_bytes[i % len(nonce_bytes)] for i, b in enumerate(raw))
    return bytes(out).decode("utf-8")


# ========== 配置读写 ==========


def _load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_config(cfg: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_FILE)


def get_base_url() -> str:
    cfg = _load_config()
    return cfg.get("base_url") or config.DASHSCOPE_BASE_URL


def get_model() -> str:
    cfg = _load_config()
    return cfg.get("model") or config.IMAGE_MODEL


def mask_api_key(api_key: str) -> str:
    """生成掩码，仅用于前端展示"""
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return api_key[:2] + "****"
    return api_key[:4] + "****" + api_key[-4:]


# ========== Token 用量统计 ==========


def _load_usage() -> dict:
    if os.path.exists(USAGE_FILE):
        try:
            with open(USAGE_FILE, "r", encoding="utf-8") as f:
                store = json.load(f)
            if not isinstance(store, dict):
                return {}
            # 迁移：旧版按 API Key 指纹记录（无法归属账号），
            # 切换为按账号统计后旧数据无法归属，直接丢弃并清零
            if any(not str(k).isdigit() for k in store.keys()):
                print("[用量] 检测到旧版按 API Key 统计，已切换为按账号统计，历史用量清零")
                return {}
            return store
        except Exception:
            pass
    return {}


def _save_usage(store: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = USAGE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, USAGE_FILE)


def normalize_usage(usage: dict) -> dict:
    """把各厂商返回的 usage 归一化为统一字段"""
    had_data = bool(usage)
    usage = dict(usage or {})
    it = usage.get("input_tokens") or 0
    ot = usage.get("output_tokens") or 0
    total = usage.get("total_tokens")
    if total is None:
        total = int(it or 0) + int(ot or 0)
    usage["total_tokens"] = int(total or 0)
    # 仅当响应确实携带用量数据、且未提供图片计数时，才默认算作 1 张图
    usage.setdefault("image_count", int(usage.get("image_count", 1 if had_data else 0) or 0))
    usage.setdefault("input_tokens", int(it or 0))
    usage.setdefault("output_tokens", int(ot or 0))
    return usage


_EMPTY_BUCKET = {"total_tokens": 0, "image_count": 0, "calls": 0, "history": []}


def _is_legacy_record(rec) -> bool:
    """旧版记录：直接含 total_tokens/history/calls（尚未按供应商分桶）"""
    return isinstance(rec, dict) and any(
        k in rec for k in ("total_tokens", "history", "calls", "last_usage"))


def _migrate_record(rec) -> dict:
    """旧库（即梦接入前只有阿里云百炼）自动迁移为按供应商分桶：{provider: 用量桶}"""
    if not isinstance(rec, dict):
        return {}
    if _is_legacy_record(rec):
        legacy = {k: rec[k] for k in
                  ("total_tokens", "image_count", "calls", "last_usage", "history") if k in rec}
        return {"dashscope": legacy}
    return rec


def _usage_record(store: dict, user_id: int) -> dict:
    """取某账号的用量记录（旧格式自动迁移为按供应商分桶），并回写内存结构"""
    k = str(user_id)
    rec = store.get(k) or {}
    rec = _migrate_record(rec)
    store[k] = rec
    return rec


def record_usage(user_id: int, usage: dict, scene: str = "", provider: str = "dashscope"):
    """记录一次 AI 调用消耗（按账号 + 按供应商分开累计与明细）。

    provider: dashscope（阿里云百炼）/ jimeng（即梦）…… 后续新供应商各自独立统计。
    """
    if not user_id:
        return
    provider = provider or "dashscope"
    usage = normalize_usage(usage)
    now = int(time.time())
    time_str = datetime.datetime.fromtimestamp(now).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        store = _load_usage()
        rec = _usage_record(store, user_id)
        bucket = rec.setdefault(provider, dict(_EMPTY_BUCKET))
        bucket["total_tokens"] = int(bucket.get("total_tokens", 0)) + usage["total_tokens"]
        bucket["image_count"] = int(bucket.get("image_count", 0)) + usage.get("image_count", 0)
        bucket["calls"] = int(bucket.get("calls", 0)) + 1
        bucket["last_usage"] = usage
        # 每笔消耗明细（按供应商分开，保留最近 500 笔，防止无限增长）
        history = bucket.get("history", []) or []
        history.append({
            "ts": now,
            "time": time_str,
            "scene": scene or "AI 生成",
            "provider": provider,
            "total_tokens": usage["total_tokens"],
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "image_count": usage.get("image_count", 0),
        })
        bucket["history"] = history[-500:]
        rec[provider] = bucket
        store[str(user_id)] = rec
        _save_usage(store)


def get_usage_history(user_id: int = 0, limit: int = 200, provider: str = None) -> list:
    """获取某账号的消耗历史明细（倒序，最新在前；provider 为空则合并全部供应商）"""
    _ensure_data_files()  # 数据被删除时先自愈再读取
    if not user_id:
        return []
    with _lock:
        store = _load_usage()
        rec = _migrate_record(store.get(str(user_id), {}))
    items = []
    for p, bucket in (rec or {}).items():
        if not isinstance(bucket, dict):
            continue
        if provider and p != provider:
            continue
        for h in bucket.get("history", []) or []:
            item = dict(h)
            item.setdefault("provider", p)
            items.append(item)
    items.sort(key=lambda h: h.get("ts", 0), reverse=True)
    return items[:limit]


def get_usage_by_provider(user_id: int = 0) -> dict:
    """返回各供应商的累计用量（独立统计）：{provider: {total_tokens, image_count, calls}}"""
    _ensure_data_files()
    if not user_id:
        return {}
    with _lock:
        store = _load_usage()
        rec = _migrate_record(store.get(str(user_id), {}))
    result = {}
    for p, bucket in (rec or {}).items():
        if not isinstance(bucket, dict):
            continue
        result[p] = {
            "total_tokens": int(bucket.get("total_tokens", 0)),
            "image_count": int(bucket.get("image_count", 0)),
            "calls": int(bucket.get("calls", 0)),
        }
    return result


def get_usage(user_id: int = 0, provider: str = None) -> dict:
    """获取某账号的累计用量；provider 指定时返回该供应商独立统计，否则合并全部供应商"""
    _ensure_data_files()  # 数据被删除时先自愈再读取
    if not user_id:
        return {"total_tokens": 0, "image_count": 0, "calls": 0}
    with _lock:
        store = _load_usage()
        rec = _migrate_record(store.get(str(user_id), {}))
    if provider:
        b = (rec or {}).get(provider, {})
        return {
            "total_tokens": int(b.get("total_tokens", 0)),
            "image_count": int(b.get("image_count", 0)),
            "calls": int(b.get("calls", 0)),
        }
    total = {"total_tokens": 0, "image_count": 0, "calls": 0}
    for p, b in (rec or {}).items():
        if not isinstance(b, dict):
            continue
        total["total_tokens"] += int(b.get("total_tokens", 0))
        total["image_count"] += int(b.get("image_count", 0))
        total["calls"] += int(b.get("calls", 0))
    return total


# ========== 敏感文本通用加解密（账户级 API Key 复用） ==========


def encrypt_secret(plain: str) -> str:
    """加密任意敏感文本（账户绑定 API Key 等），返回可落盘字符串"""
    return _encrypt(plain)


def decrypt_secret(token: str) -> str:
    """解密 encrypt_secret 产出的字符串"""
    return _decrypt(token)


def get_user_api_key(user) -> str:
    """取账户绑定的 API Key（解密后）；未绑定返回空串"""
    if not user:
        return ""
    # 兼容 sqlite3.Row（无 .get 方法）与普通 dict
    if hasattr(user, "keys"):
        user = dict(user)
    return _decrypt(user.get("api_key_encrypted") or "")


def _user_dict(user) -> dict:
    if not user:
        return {}
    if hasattr(user, "keys"):
        return dict(user)
    return user


def get_user_provider(user) -> str:
    """当前账户选择的生图供应商: dashscope（阿里云百炼）/ jimeng（即梦）"""
    return _user_dict(user).get("api_provider") or "dashscope"


def get_user_access_key(user) -> str:
    """取账户绑定的即梦 Access Key ID（解密后）；未绑定返回空串"""
    return _decrypt(_user_dict(user).get("api_access_key_encrypted") or "")


def get_user_secret_key(user) -> str:
    """取账户绑定的即梦 Secret Access Key（解密后）；未绑定返回空串"""
    return _decrypt(_user_dict(user).get("api_secret_key_encrypted") or "")


def has_user_api_key(user) -> bool:
    """按当前供应商判断该账户是否已配置可用的生图凭证"""
    if not user:
        return False
    provider = get_user_provider(user)
    if provider == "jimeng":
        return bool(get_user_access_key(user) and get_user_secret_key(user))
    return bool(get_user_api_key(user))


def _ensure_data_files():
    """确保数据目录与全部数据文件存在（任一被删除后自动重建；线程安全）
    在模块导入与各读取入口调用，保证删除后无需重启即可自愈。"""
    with _lock:
        os.makedirs(DATA_DIR, exist_ok=True)
        # 1) 加密密钥文件：不存在则重新生成
        _get_or_create_secret_key()
        # 2) 配置文件：不存在则创建默认结构（无 Key，等待用户通过前端配置）
        if not os.path.exists(CONFIG_FILE):
            _save_config({"provider": "dashscope"})
        # 3) 用量文件：不存在则创建空对象
        if not os.path.exists(USAGE_FILE):
            _save_usage({})
        # 4) 输入/输出缓存目录：不存在则重建（data/uploads、data/output）
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)


# 1) 迁移旧数据目录（backend/data → 主目录 data/） 2) 迁移旧明文 Key 3) 确保文件删除后可重建
_migrate_data_dir()
_ensure_data_files()
