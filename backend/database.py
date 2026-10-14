"""
数据库层 - SQLite（登录认证 / 三级权限 / 公司 / 邀请码 / 图片库）
================================================================
- 数据库文件：主目录 data/app.db（与 api_config.json 同目录）
- 风格与 api_config.py 一致：线程安全、删除后下次运行自动自愈重建 + 种子数据
- 时间统一 UTC ISO 字符串（datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")）
"""

import os
import shutil
import sqlite3
import threading
import datetime
from typing import Optional

from . import config

DB_PATH = os.path.join(config.BASE_DIR, "data", "app.db")

# 图片库物理存储根目录：data/image_library/{company_id}/{category}/{orientation?}
IMAGE_LIBRARY_DIR = os.path.join(config.BASE_DIR, "data", "image_library")

# 系统默认模板库：company_id = 0 表示默认模板，所有公司图片库均包含（只读保护）
DEFAULT_COMPANY_ID = 0

_lock = threading.Lock()


# ========== 时间工具 ==========


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


# ========== 连接 ==========


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


# ========== 建表 ==========

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    db_password_hash TEXT NOT NULL,
    created_by INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,                -- super_admin / admin / user
    company_id INTEGER NOT NULL,
    invite_code_id INTEGER,
    created_by INTEGER,                -- 邀请码创建者（超管删管理员时级联删除依据）
    api_key_encrypted TEXT,
    api_base_url TEXT,
    api_model TEXT,
    api_provider TEXT DEFAULT 'dashscope',   -- dashscope / jimeng（生图供应商，可一键切换）
    api_access_key_encrypted TEXT,           -- 即梦 Access Key ID（加密落盘）
    api_secret_key_encrypted TEXT,           -- 即梦 Secret Access Key（加密落盘）
    created_at TEXT NOT NULL,          -- 注册时间
    last_login_at TEXT,                -- 最后一次登录时间
    valid_until TEXT,                  -- 有效期（到点禁登）
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    level INTEGER NOT NULL,            -- 1=管理员 / 2=用户
    status TEXT NOT NULL DEFAULT 'unused',  -- unused / used
    created_by INTEGER,
    valid_until TEXT,
    used_by INTEGER,
    created_at TEXT NOT NULL,
    used_at TEXT
);

CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    category TEXT NOT NULL,            -- ecommerce / slice / poster_base
    orientation TEXT,                  -- horizontal / vertical（poster_base 可空）
    label TEXT,                        -- 自定义业务分类（用户可自由新增，可为空）
    name TEXT NOT NULL,
    filename TEXT NOT NULL,            -- 物理文件名
    filepath TEXT NOT NULL,            -- 相对图片库根目录的路径
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER,
    created_at TEXT NOT NULL,          -- 上传时间
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_images_company ON images(company_id);
CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_invite_code_status ON invite_codes(status);
"""


def _ensure_column(conn, table: str, column: str, decl: str):
    """为旧库补充缺失列（幂等）"""
    cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def init_db():
    """建表 + 种子数据 + 旧模板迁移（幂等，可重复执行；删除文件后自愈重建）"""
    with _lock:
        conn = get_conn()
        try:
            conn.executescript(SCHEMA)
            _ensure_column(conn, "images", "label", "TEXT")
            # 旧库升级：为 users 表补充即梦供应商相关列（幂等）
            _ensure_column(conn, "users", "api_provider", "TEXT DEFAULT 'dashscope'")
            _ensure_column(conn, "users", "api_access_key_encrypted", "TEXT")
            _ensure_column(conn, "users", "api_secret_key_encrypted", "TEXT")
            conn.commit()
        finally:
            conn.close()
        seed_data()
        migrate_legacy_templates()


# ========== 种子数据 ==========


def seed_data():
    """创建默认公司 + 超级管理员（不存在才创建）

    账号信息取自 config.SUPER_ADMIN_*（可由环境变量覆盖）；
    口令必须由环境变量 SUPER_ADMIN_PASSWORD 注入，需要建库而缺失时直接报错退出。
    """
    conn = get_conn()
    try:
        admin_username = config.SUPER_ADMIN_USERNAME
        company_name = config.SUPER_ADMIN_COMPANY

        row = conn.execute("SELECT id FROM companies WHERE name = ?", (company_name,)).fetchone()
        needs_company = row is None
        needs_admin = conn.execute(
            "SELECT id FROM users WHERE username = ?", (admin_username,)).fetchone() is None

        if (needs_company or needs_admin) and not config.SUPER_ADMIN_PASSWORD:
            raise RuntimeError(
                "缺少 SUPER_ADMIN_PASSWORD 环境变量：首次建库需要它来初始化超级管理员口令。\n"
                "请先注入该变量再启动：\n"
                "  Linux/macOS:         export SUPER_ADMIN_PASSWORD='<你的口令>'\n"
                "  Windows(PowerShell): $env:SUPER_ADMIN_PASSWORD=\"<你的口令>\""
            )

        from .auth import hash_password

        # 1. 默认公司（首次建库时创建）
        if needs_company:
            cur = conn.execute(
                "INSERT INTO companies (name, db_password_hash, created_by, created_at) VALUES (?,?,?,?)",
                (company_name, hash_password(config.SUPER_ADMIN_PASSWORD), None, now_iso()),
            )
            company_id = cur.lastrowid
        else:
            company_id = row["id"]

        # 2. 超级管理员（用户名固定，口令由环境变量注入）
        if needs_admin:
            conn.execute(
                "INSERT INTO users (username, password_hash, email, role, company_id, "
                "created_at, valid_until, status) VALUES (?,?,?,?,?,?,?,?)",
                (admin_username, hash_password(config.SUPER_ADMIN_PASSWORD),
                 config.SUPER_ADMIN_EMAIL, "super_admin", company_id,
                 now_iso(), "2099-12-31T00:00:00Z", "active"),
            )
        conn.commit()
    finally:
        conn.close()


# ========== 旧模板迁移（图/ → 图片库） ==========


def _infer_orientation(image_path: str) -> str:
    """根据图片宽高推断版型（宽>=高为横板，否则竖版）"""
    try:
        from PIL import Image
        with Image.open(image_path) as im:
            w, h = im.size
        return "horizontal" if w >= h else "vertical"
    except Exception:
        return ""


def migrate_legacy_templates():
    """将 图/ 下的模板导入「系统默认模板库」（company_id=0），所有公司图片库均包含。

    幂等：
    - 默认库已存在同名文件则跳过（并补全缺失版型）；
    - 历史版本迁移到具体公司（如默认公司）的同名默认模板自动清理，避免重复显示。
    """
    sources = [
        (os.path.join(config.STYLE_DIR), "ecommerce", None),
        (os.path.join(config.SLICE_STYLE_DIR_H), "slice", "horizontal"),
        (os.path.join(config.SLICE_STYLE_DIR_V), "slice", "vertical"),
    ]
    for src_dir, category, orientation in sources:
        if not os.path.isdir(src_dir):
            continue
        for fname in sorted(os.listdir(src_dir)):
            if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                continue
            src_path = os.path.join(src_dir, fname)
            # 电商模板未显式分目录，按图片宽高推断版型
            eff_orientation = orientation
            if category == "ecommerce" and not eff_orientation:
                eff_orientation = _infer_orientation(src_path)

            existing_default = get_image_by_company_filename(
                DEFAULT_COMPANY_ID, category, fname, eff_orientation)
            if existing_default:
                # 已导入默认库：补全缺失的版型
                if not existing_default["orientation"] and eff_orientation:
                    try:
                        update_image_field(existing_default["id"], "orientation", eff_orientation)
                        print(f"[迁移] 已补全默认模板版型: {fname} → {eff_orientation}")
                    except Exception as e:
                        print(f"[迁移] 补全版型失败 {fname}: {e}")
                continue

            # 清理历史版本迁移到具体公司（与默认模板同名同版型）的记录，避免重复
            _remove_company_duplicate_default(category, fname, eff_orientation)

            try:
                _store_image_file(DEFAULT_COMPANY_ID, category, eff_orientation, fname, src_path,
                                  uploaded_by=None)
                print(f"[迁移] 默认模板入库: {category}/{fname}")
            except Exception as e:
                print(f"[迁移] 导入失败 {fname}: {e}")


def _remove_company_duplicate_default(category: str, filename: str, orientation: Optional[str] = None):
    """删除各公司图片库中与默认模板同名同版型的历史迁移记录（保留公司自有上传的同名图片）"""
    conn = get_conn()
    try:
        companies = conn.execute("SELECT id FROM companies").fetchall()
    finally:
        conn.close()
    for c in companies:
        old = get_image_by_company_filename(c["id"], category, filename, orientation)
        if not old:
            continue
        try:
            abs_path = image_abs_path(c["id"], old["filepath"])
            if os.path.exists(abs_path):
                os.remove(abs_path)
        except Exception as e:
            print(f"[迁移] 删除历史模板文件失败 {filename}: {e}")
        delete_image_record(old["id"])
        print(f"[迁移] 已清理历史迁移模板: 公司{c['id']} {category}/{filename}（默认模板已包含）")


# ========== 公司 CRUD ==========


def create_company(name: str, db_password_hash: str, created_by: Optional[int] = None) -> int:
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO companies (name, db_password_hash, created_by, created_at) VALUES (?,?,?,?)",
            (name, db_password_hash, created_by, now_iso()),
        )
        conn.commit()
        return int(cur.lastrowid or 0)
    finally:
        conn.close()


def get_company_by_name(name: str):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM companies WHERE name = ?", (name,)).fetchone()
    finally:
        conn.close()


def get_company_by_id(company_id: int):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    finally:
        conn.close()


def list_companies():
    conn = get_conn()
    try:
        return conn.execute("SELECT id, name, created_at FROM companies ORDER BY id").fetchall()
    finally:
        conn.close()


def update_company_db_password(company_id: int, new_hash: str):
    conn = get_conn()
    try:
        conn.execute("UPDATE companies SET db_password_hash = ? WHERE id = ?", (new_hash, company_id))
        conn.commit()
    finally:
        conn.close()


# ========== 用户 CRUD ==========


def create_user(username: str, password_hash: str, email: str, role: str, company_id: int,
                invite_code_id=None, created_by=None, valid_until=None) -> int:
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, email, role, company_id, "
            "invite_code_id, created_by, valid_until, status, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (username, password_hash, email, role, company_id, invite_code_id, created_by,
             valid_until, "active", now_iso()),
        )
        conn.commit()
        return int(cur.lastrowid or 0)
    finally:
        conn.close()


def create_user_and_consume_invite(username: str, password_hash: str, email: str, role: str,
                                   company_id: int, invite_id: int, created_by=None,
                                   valid_until=None):
    """单事务：创建用户 + 原子消耗邀请码。

    邀请码已被其他请求占用时回滚并返回 None；成功返回 user_id。
    消除"先建用户、后标记邀请码"之间的竞态窗口。
    """
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, email, role, company_id, "
            "invite_code_id, created_by, valid_until, status, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (username, password_hash, email, role, company_id, invite_id, created_by,
             valid_until, "active", now_iso()),
        )
        user_id = cur.lastrowid
        cur2 = conn.execute(
            "UPDATE invite_codes SET status = 'used', used_by = ?, used_at = ? "
            "WHERE id = ? AND status = 'unused'",
            (user_id, now_iso(), invite_id),
        )
        if cur2.rowcount != 1:
            conn.rollback()
            return None
        conn.commit()
        return int(user_id or 0)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_user_by_username(username: str):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()


def get_user_by_email(email: str):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id: int):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()


def update_user_field(user_id: int, field: str, value):
    allowed = {"password_hash", "email", "role", "company_id", "api_key_encrypted",
               "api_base_url", "api_model", "api_provider",
               "api_access_key_encrypted", "api_secret_key_encrypted",
               "valid_until", "status", "last_login_at"}
    if field not in allowed:
        raise ValueError(f"非法字段: {field}")
    conn = get_conn()
    try:
        conn.execute(f"UPDATE users SET {field} = ? WHERE id = ?", (value, user_id))
        conn.commit()
    finally:
        conn.close()


def set_user_disabled(user_id: int):
    update_user_field(user_id, "status", "disabled")


def update_last_login(user_id: int):
    update_user_field(user_id, "last_login_at", now_iso())


def count_company_users(company_id: int) -> int:
    """统计某公司下的账号数"""
    conn = get_conn()
    try:
        row = conn.execute("SELECT COUNT(*) AS c FROM users WHERE company_id = ?",
                           (company_id,)).fetchone()
        return int(row["c"] or 0) if row else 0
    finally:
        conn.close()


def delete_company_and_images(company_id: int) -> int:
    """删除公司及其图片库（DB 记录 + 物理文件），返回删除的图片数。
    仅处理真实公司（id>0）；系统默认模板库 company_id=0 永不删除。
    """
    if company_id is None or company_id <= 0:
        return 0
    conn = get_conn()
    try:
        rows = conn.execute("SELECT filepath FROM images WHERE company_id = ?",
                            (company_id,)).fetchall()
        conn.execute("DELETE FROM images WHERE company_id = ?", (company_id,))
        conn.execute("DELETE FROM companies WHERE id = ?", (company_id,))
        conn.commit()
    finally:
        conn.close()
    # 删除该公司图片库物理目录
    company_dir = os.path.join(IMAGE_LIBRARY_DIR, str(company_id))
    if os.path.isdir(company_dir):
        shutil.rmtree(company_dir, ignore_errors=True)
    return len(rows)


def cleanup_empty_companies() -> int:
    """删除所有「没有任何账号」的公司及其图片库（定时任务兜底），返回删除数"""
    conn = get_conn()
    try:
        companies = conn.execute("SELECT id FROM companies").fetchall()
    finally:
        conn.close()
    removed = 0
    for c in companies:
        if count_company_users(c["id"]) == 0:
            delete_company_and_images(c["id"])
            removed += 1
    return removed


def delete_user(user_id: int) -> bool:
    """删除账号；若其所在公司因此没有任何账号，则级联删除该公司及其图片库。
    返回是否级联删除了公司。"""
    conn = get_conn()
    try:
        user = conn.execute("SELECT company_id FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        company_id = int(user["company_id"]) if user else 0
    finally:
        conn.close()
    if company_id > 0 and count_company_users(company_id) == 0:
        delete_company_and_images(company_id)
        return True
    return False


def cleanup_guests(max_age_hours: int = 24) -> int:
    """清理创建超过 max_age_hours 的游客账号（级联删除其公司及图片库），返回删除数。
    游客数据不保留：退出时清除，超时未退出的由定时任务兜底清理。"""
    conn = get_conn()
    try:
        cutoff = (datetime.datetime.now(datetime.timezone.utc)
                  - datetime.timedelta(hours=max_age_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        guests = conn.execute(
            "SELECT id FROM users WHERE role = 'guest' AND created_at < ?", (cutoff,)).fetchall()
    finally:
        conn.close()
    removed = 0
    for g in guests:
        delete_user(g["id"])
        removed += 1
    return removed


def list_users(created_by: Optional[int] = None, company_id: Optional[int] = None):
    """created_by 为空且 company_id 为空时返回全部（仅超管可全量查看）"""
    conn = get_conn()
    try:
        sql = ("SELECT u.*, c.name AS company_name FROM users u "
               "LEFT JOIN companies c ON u.company_id = c.id WHERE 1=1")
        params: list = []
        if created_by is not None:
            sql += " AND u.created_by = ?"
            params.append(created_by)
        if company_id is not None:
            sql += " AND u.company_id = ?"
            params.append(company_id)
        sql += " ORDER BY u.id"
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def disable_expired_users():
    """将已过期且 active 的账号置为 disabled（定时任务调用）"""
    conn = get_conn()
    try:
        now = now_iso()
        cur = conn.execute(
            "UPDATE users SET status = 'disabled' WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < ?",
            (now,),
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ========== 邀请码 CRUD ==========


def create_invite_code(code: str, level: int, created_by: int, valid_until: str) -> int:
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO invite_codes (code, level, status, created_by, valid_until, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (code, level, "unused", created_by, valid_until, now_iso()),
        )
        conn.commit()
        return int(cur.lastrowid or 0)
    finally:
        conn.close()


def get_invite_code_by_code(code: str):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM invite_codes WHERE code = ?", (code,)).fetchone()
    finally:
        conn.close()


def get_invite_code_by_id(invite_id: int):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM invite_codes WHERE id = ?", (invite_id,)).fetchone()
    finally:
        conn.close()


def list_invite_codes(created_by: Optional[int] = None, status: Optional[str] = None):
    conn = get_conn()
    try:
        sql = ("SELECT ic.*, u.username AS used_by_username, cu.username AS creator_username "
               "FROM invite_codes ic "
               "LEFT JOIN users u ON ic.used_by = u.id "
               "LEFT JOIN users cu ON ic.created_by = cu.id WHERE 1=1")
        params: list = []
        if created_by is not None:
            sql += " AND ic.created_by = ?"
            params.append(created_by)
        if status is not None:
            sql += " AND ic.status = ?"
            params.append(status)
        sql += " ORDER BY ic.id DESC"
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def delete_used_invite_codes(created_by: Optional[int] = None) -> int:
    """删除已使用的邀请码记录（自动消除，前端不再显示）；可限定某创建者"""
    conn = get_conn()
    try:
        if created_by is not None:
            cur = conn.execute(
                "DELETE FROM invite_codes WHERE status = 'used' AND created_by = ?", (created_by,))
        else:
            cur = conn.execute("DELETE FROM invite_codes WHERE status = 'used'")
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def delete_invite_code(invite_id: int):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM invite_codes WHERE id = ? AND status = 'unused'", (invite_id,))
        conn.commit()
    finally:
        conn.close()


# ========== 图片库 CRUD ==========


def _rel_path(category: str, orientation: Optional[str] = None, filename: Optional[str] = None) -> str:
    """图片相对图片库根目录的路径（含分类/版型目录）"""
    parts = [category]
    if orientation:
        parts.append(orientation)
    if filename:
        parts.append(filename)
    return "/".join(parts)


def image_dir(company_id: int, category: str, orientation: Optional[str] = None) -> str:
    return os.path.join(IMAGE_LIBRARY_DIR, str(company_id), category, orientation or "")


def image_abs_path(company_id: int, rel_path: str) -> str:
    """由相对路径得到绝对路径（禁止越界）"""
    base = os.path.abspath(os.path.join(IMAGE_LIBRARY_DIR, str(company_id)))
    full = os.path.abspath(os.path.join(IMAGE_LIBRARY_DIR, str(company_id), rel_path))
    if not full.startswith(base + os.sep):
        raise ValueError("非法路径")
    return full


def create_image(company_id: int, category: str, orientation: Optional[str], label: Optional[str],
                 name: str, filename: str, rel_path: str, size: int, uploaded_by: Optional[int]) -> int:
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO images (company_id, category, orientation, label, name, filename, filepath, "
            "size, uploaded_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (company_id, category, orientation, (label or "").strip() or None, name, filename,
             rel_path, size, uploaded_by, now_iso(), now_iso()),
        )
        conn.commit()
        return int(cur.lastrowid or 0)
    finally:
        conn.close()


def get_image_by_id(image_id: int):
    conn = get_conn()
    try:
        return conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    finally:
        conn.close()


def get_image_by_company_filename(company_id: int, category: str, filename: str,
                                  orientation: Optional[str] = None):
    """按公司/分类/文件名查询图片（可指定版型，避免横竖版同名误判）"""
    conn = get_conn()
    try:
        sql = "SELECT * FROM images WHERE company_id = ? AND category = ? AND filename = ?"
        params: list = [company_id, category, filename]
        if orientation is not None:
            sql += " AND orientation = ?"
            params.append(orientation)
        return conn.execute(sql, params).fetchone()
    finally:
        conn.close()


def is_default_image(img) -> bool:
    """是否为系统默认模板（company_id = 0）"""
    return bool(img and img["company_id"] == DEFAULT_COMPANY_ID)


def list_images(company_id: int, category: Optional[str] = None, orientation: Optional[str] = None,
                label: Optional[str] = None, keyword: Optional[str] = None):
    """查询图片库：默认模板（company_id=0）+ 指定公司自有模板"""
    conn = get_conn()
    try:
        sql = "SELECT * FROM images WHERE (company_id = ? OR company_id = ?)"
        params: list = [company_id, DEFAULT_COMPANY_ID]
        if category:
            sql += " AND category = ?"
            params.append(category)
        if orientation:
            sql += " AND orientation = ?"
            params.append(orientation)
        if label:
            sql += " AND label = ?"
            params.append(label)
        if keyword:
            sql += " AND name LIKE ?"
            params.append(f"%{keyword}%")
        # 默认模板优先显示，其次按公司
        sql += " ORDER BY CASE WHEN company_id = 0 THEN 0 ELSE 1 END, id DESC"
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def list_image_labels(company_id: int, category: Optional[str] = None) -> list:
    """返回图片库中已有的自定义分类（去重排序，含默认模板 + 本公司）"""
    conn = get_conn()
    try:
        sql = ("SELECT DISTINCT label FROM images WHERE label IS NOT NULL AND label != '' "
               "AND (company_id = ? OR company_id = ?)")
        params: list = [company_id, DEFAULT_COMPANY_ID]
        if category:
            sql += " AND category = ?"
            params.append(category)
        rows = conn.execute(sql, params).fetchall()
        return sorted({r["label"] for r in rows})
    finally:
        conn.close()


def update_image_field(image_id: int, field: str, value):
    allowed = {"name", "orientation", "category", "label"}
    if field not in allowed:
        raise ValueError(f"非法字段: {field}")
    conn = get_conn()
    try:
        conn.execute(f"UPDATE images SET {field} = ?, updated_at = ? WHERE id = ?",
                     (value, now_iso(), image_id))
        conn.commit()
    finally:
        conn.close()


def delete_image_record(image_id: int):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
        conn.commit()
    finally:
        conn.close()


def _store_image_file(company_id: int, category: str, orientation: Optional[str], filename: str,
                      src_path: str, uploaded_by: Optional[int], label: Optional[str] = None) -> int:
    """把物理文件复制进图片库并落库，返回 image_id"""
    d = image_dir(company_id, category, orientation)
    os.makedirs(d, exist_ok=True)
    # 文件名去重（同目录冲突加 _1/_2 后缀）
    base, ext = os.path.splitext(filename)
    fname = filename
    counter = 1
    while os.path.exists(os.path.join(d, fname)):
        fname = f"{base}_{counter}{ext}"
        counter += 1
    dest = os.path.join(d, fname)
    shutil.copy2(src_path, dest)
    size = os.path.getsize(dest)
    rel_path = _rel_path(category, orientation, fname)
    return create_image(company_id, category, orientation, label,
                        os.path.splitext(fname)[0], fname, rel_path, size, uploaded_by)


def store_image_upload(company_id: int, category: str, orientation: Optional[str], label: Optional[str],
                       name: str, file_bytes: bytes, ext: str, uploaded_by: Optional[int]) -> int:
    """保存前端上传的图片，返回 image_id"""
    d = image_dir(company_id, category, orientation)
    os.makedirs(d, exist_ok=True)
    base = name or "image"
    fname = f"{base}{ext}"
    counter = 1
    while os.path.exists(os.path.join(d, fname)):
        fname = f"{base}_{counter}{ext}"
        counter += 1
    dest = os.path.join(d, fname)
    with open(dest, "wb") as f:
        f.write(file_bytes)
    size = os.path.getsize(dest)
    rel_path = _rel_path(category, orientation, fname)
    return create_image(company_id, category, orientation, label, base, fname, rel_path, size, uploaded_by)
