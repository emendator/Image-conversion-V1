"""
配置文件 - 阿里云百炼 API 配置与项目路径
（前后端分离版 - 后端配置）
"""

import os

# ========== API 配置 ==========
# 新版百炼业务空间专属域名（支持同步+异步，推荐使用）
# WorkspaceId 可在百炼控制台「业务空间」页面查看
DASHSCOPE_BASE_URL = "https://llm-89y5g84k7innclev.cn-beijing.maas.aliyuncs.com/api/v1"

# 图生图/图像编辑模型
IMAGE_MODEL = "wan2.7-image"

# ========== 文件路径配置 ==========
# 项目根目录（backend 的上级目录）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 模板图文件夹
STYLE_DIR = os.path.join(BASE_DIR, "图", "电商主图", "模板图")

# 营销切片模板图文件夹（分横板/竖版子目录）
SLICE_STYLE_DIR_BASE = os.path.join(BASE_DIR, "图", "营销切片", "模板图")
SLICE_STYLE_DIR_H = os.path.join(SLICE_STYLE_DIR_BASE, "横板")
SLICE_STYLE_DIR_V = os.path.join(SLICE_STYLE_DIR_BASE, "竖版")

# 输出目录（缓存，位于主目录 data/ 下，删除后自动重建）
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "output")

# 上传目录（缓存，位于主目录 data/ 下，删除后自动重建）
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")

# ========== 生成参数 ==========
# 输出图片分辨率: "1024*1024" 或 "800*800"
OUTPUT_SIZE = "800*800"

# 生成图片数量
OUTPUT_NUM = 1

# 是否开启思考模式（增强出图质量，但耗时更长）
THINKING_MODE = False

# 是否添加水印（建议关闭）
WATERMARK = False

# ========== 超级管理员账号（首次建库时初始化） ==========
# 口令不再硬编码：必须通过环境变量 SUPER_ADMIN_PASSWORD 注入；需要建库而缺失时直接报错。
# 其余项可用环境变量覆盖，未设置时使用下列默认值。
SUPER_ADMIN_USERNAME = os.environ.get("SUPER_ADMIN_USERNAME", "admin")
SUPER_ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD", "")
SUPER_ADMIN_COMPANY = os.environ.get("SUPER_ADMIN_COMPANY", "我的公司")
SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "admin@example.com")

# ========== 服务器配置 ==========
HOST = "127.0.0.1"
PORT = 8003
