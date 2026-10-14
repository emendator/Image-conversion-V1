# AI 图片生成器

[中文](README.md) | [English](README.en.md)

基于 **阿里云百炼（DashScope）** 与 **即梦 AI（火山引擎）** 的 AI 电商图 / 营销图生成工具，提供 **电商主图**、**营销海报**、**营销切片** 三大生成器，并内置账号与权限体系、组织级图片库、多供应商生图模型一键切换。

- **前端**：React 19 + Vite + TypeScript —— 负责界面、拖拽排版与本地 Canvas 合成导出
- **后端**：Python + FastAPI + SQLite —— 负责鉴权、账号/图片库数据、AI 生图调用与海报合成
- **在线演示**：(待补充：在线演示地址，如无可填「暂无」)
- **界面截图**：(待补充：功能截图或演示 GIF)

> 本项目的三大生成器中，**电商主图**与**营销切片**的成图在浏览器本地 Canvas 完成，不消耗任何 AI 额度；只有**颜色修改**与**营销海报**会调用 AI 服务。

---

## ✨ 功能特性

### 🛒 电商主图生成器

上传商品照片与品牌 Logo，选择模板，自动合成电商主图；支持横版/竖版商品类型、多行文字叠加、拖拽定位与分辨率选择。

- 商品类型切换：**横版商品**居中放置，**竖版商品**贴右侧（自动切换对应默认模板与默认文字）
- 文字叠加：商品名称 / 净含量 / 广告词 / 卖点标签，输入框支持多行，可在预览区拖拽定位
- **颜色修改（可选）**：填写自然语言指令（如「将背景从白色换成蓝色」），由 AI 做图生图改色
- 输出分辨率：800×800 或 1024×1024
- 无颜色指令时**完全本地导出，不产生费用**

### 🎨 营销海报生成器

「底图来源」提供三种模式：**AI 生成底图** / **使用现有底图** / **修改海报**。

| 模式 | 说明 |
| --- | --- |
| AI 生成底图 | 描述底图风格 → 选择生成数量（1~4 张，默认 4）→ 并行生成多张差异化底图供挑选；素材嵌入方式可选「手动」或「AI」 |
| 使用现有底图 | 直接选用图片库中的底图，拖拽素材后合成 |
| 修改海报 | 上传现有海报 + 修改说明，由 AI 生成修改后的新海报，支持基于上一次结果迭代修改 |

两种素材嵌入方式：

- **✋ 手动嵌入**：AI 只负责生成底图，Logo / 二维码 / 品牌图由后端 Pillow 按你在预览区拖拽的位置合成 —— 位置精确可控，素材本身不被 AI 重绘
- **🤖 AI 嵌入**：素材与提示词一起交给 AI 统筹构图，一次出成品 —— 更快，但素材可能被重绘产生变形（二维码可能失效，需人工复核）

> ⚠️ 「修改海报」模式经 AI 重绘同样存在素材失真风险；生成结果请务必人工确认二维码可扫、Logo 无扭曲。

### 📦 营销切片生成器

多商品展示图一键生成：上传多张商品图，自动排版到预设位置并预填默认文案，支持拖拽与缩放。

- 横版 1920×1080 / 竖版 1080×1920
- 商品图默认 4 个固定位置，可上传二维码（默认右上角）
- 文字分为 6 类共 28 项（品牌、产品名、卖点、型号、价格等，分类可独立折叠编辑）
- 全部在浏览器本地 Canvas 导出，**不调用 AI、不产生费用**

### 🔐 账号与权限

系统需登录后使用，提供三级权限与游客模式：

| 角色 | 说明 |
| --- | --- |
| 超级管理员 | 可分发一级/二级邀请码，管理自己邀请的账号 |
| 管理员 | 通过一级邀请码注册，可分发二级邀请码并管理自己邀请的账号 |
| 用户 | 通过二级邀请码注册，可使用生成器与图片库 |
| 游客 | 无需注册即可体验全部功能（需自备 AI 凭证）；退出时自动清除本次产生的全部数据 |

- **邀请码注册**：邮箱 + 邀请码注册，邀请码一次性使用、用后失效，可设置有效期（到期自动禁止登录）
- **组织（公司）体系**：管理员注册时可「创建新组织 / 加入已有组织」，用户仅可加入；同组织账号共享一个图片库
- **账号管理**：支持延期、禁用、删除；删除管理员会级联处理其下级账号
- **AI 凭证按账号绑定**：每个账号在「API 设置」中独立绑定自己的凭证，用量与凭证互不干扰

### 🖼️ 图片库

三类图片分别管理：**电商主图模板**、**营销切片模板**（横版/竖版）、**营销海报底图**。

- 上传、下载、编辑（名称/分类/版型）、删除，支持勾选批量删除
- 两种视图：网格预览（大/中/小图标）与信息表格
- 支持自定义分类，可按分类、版型、关键字筛选（筛选状态同步到 URL，可分享）
- 内置默认模板带「默认」徽标，所有组织共用（修改/删除会影响全部组织）
- 图片库**按组织隔离**，同组织账号共享

### 🤖 多供应商 AI 生图

- 在「API 设置」中一键切换 **阿里云百炼（DashScope）** 与 **即梦 AI**，切换后所有 AI 功能立即生效
- 凭证**加密落盘**，任何界面与日志都不回显明文（界面仅显示掩码）
- AI 用量**按账号 + 供应商**分别统计：右上角徽标、API 设置面板、消耗明细弹窗均可按供应商筛选，出图优先按「张」展示
- 未配置凭证也能正常使用所有非 AI 功能

### ✨ 界面与交互

前端内置一套**零依赖动效引擎**（事件委托 + Intersection/MutationObserver + rAF），包含：3D 倾斜卡片、磁性悬停、点击涟漪、滚动揭示、FLIP 布局重排、数字滚动、乱码解码加载态、动态 Favicon（生成中变为加载环）、页面转场、登录页光效背景等。

动画统一收敛在 `transform/opacity`（GPU 合成），并尊重系统的 `prefers-reduced-motion` 设置。

---

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · Vite 8 · TypeScript · axios · react-router-dom 7 · Oxlint |
| 后端 | FastAPI · Uvicorn · SQLite · Pillow · cryptography(Fernet) · PyJWT · bcrypt |
| AI 服务 | dashscope SDK（阿里云百炼）· 自实现火山引擎 SigV4 签名（即梦 AI） |
| 部署（可选） | Nginx + systemd（Ubuntu） |

---

## 🚀 快速开始

### 环境要求

- **Python 3.10 及以上**（推荐；Windows 一键启动脚本会自动探测本机 3.8～3.14 的 Python 安装）
- **Node.js 20 及以上**（前端为 Vite 8 项目）
- 操作系统：Windows / macOS / Linux 均可运行；`启动.bat` 为 Windows 专用一键脚本
- (待补充：本项目实际验证过的 Python / Node 最低版本)

### 1. 获取代码

```bash
git clone https://github.com/emendator/Image-conversion.git
cd Image-conversion
```

### 2. 安装依赖

**Windows 一键启动（推荐）**

双击项目根目录的 `启动.bat`。脚本会自动：探测 Python → 创建 `.venv` 虚拟环境 → 安装 `backend/requirements.txt` → 创建 `data/uploads`、`data/output` → 同时启动后端与前端 → 自动打开浏览器。

**手动安装（全平台）**

```bash
# 1) 后端
python -m venv .venv
.venv\Scripts\activate           # Windows
source .venv/bin/activate         # macOS / Linux
pip install -r backend/requirements.txt

# 2) 前端
cd frontend
npm install
```

### 3. 注入环境变量并启动

后端启动前必须注入以下环境变量，**缺失会直接拒绝启动**：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | ✅ 每次启动 | JWT 签名密钥，长度 ≥ 32 位，不落盘 |
| `SUPER_ADMIN_PASSWORD` | 仅首次建库 | 超级管理员初始口令 |

```bash
# Linux / macOS
export JWT_SECRET=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
export SUPER_ADMIN_PASSWORD='<你的强口令>'

# Windows PowerShell
$env:JWT_SECRET="<至少32位随机字符串>"
$env:SUPER_ADMIN_PASSWORD="<你的强口令>"
```

> 💡 `启动.bat` 会自动校验这两个变量并给出设置提示；也可用 `setx` 永久设置。

```bash
# 终端 1：后端（FastAPI）
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8003

# 终端 2：前端（Vite 开发服务器）
cd frontend
npm run dev
```

打开浏览器访问 **<http://127.0.0.1:5176>**。

后端接口文档（Swagger UI）：**<http://127.0.0.1:8003/docs>**

### 4. 配置 AI 生图凭证（可选，每个账号一次）

登录后点击右上角 **🔑 API 设置**，选择供应商并填入凭证保存即可。**不配置也能使用所有非 AI 功能。**

| 供应商 | 需要的凭证 | 默认模型 |
| --- | --- | --- |
| 阿里云百炼 (DashScope) | API Key | `wan2.7-image` |
| 即梦 AI（火山引擎） | Access Key ID + Secret Access Key | `jimeng_seedream46_cvtob` |

凭证获取入口：

- 阿里云百炼控制台：<https://bailian.console.aliyun.com/> → API Key 管理
- 火山引擎控制台：<https://console.volcengine.com/> → 访问控制 → API 访问密钥

> 🔒 凭证由后端加密后落盘（见下方「安全与隐私」），界面只显示掩码，不会回显明文。

### 5. 注册与登录

- **首次使用**：首次启动会自动初始化数据库；超级管理员用户名默认 `admin`，口令取自 `SUPER_ADMIN_PASSWORD` 环境变量，默认组织名与邮箱取自 `SUPER_ADMIN_COMPANY` / `SUPER_ADMIN_EMAIL`（未设置时为 `我的公司` / `admin@example.com`）。**部署后请立即登录并修改口令。**
- **注册**：需要邀请码。邀请码由上级账号在「用户管理」中生成（格式为「颜色-名词-四位」，一次性使用）
- **游客模式**：登录页可直接以游客身份进入，无需注册（需自备 AI 凭证）

---

## ⚙️ 配置说明

### 后端配置项（`backend/config.py`）

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `DASHSCOPE_BASE_URL` | API 基础地址（可在「API 设置 → 高级选项」中覆盖） | DashScope 服务地址 |
| `IMAGE_MODEL` | 图生图/文生图模型 | `wan2.7-image` |
| `OUTPUT_SIZE` | 电商主图输出分辨率 | `800*800` |
| `OUTPUT_NUM` | 默认生成张数 | `1` |
| `THINKING_MODE` | 思考模式（增强质量、耗时更长） | `False` |
| `WATERMARK` | 是否添加水印 | `False` |
| `HOST` / `PORT` | 后端监听地址与端口 | `127.0.0.1` / `8003` |

> ⚠️ **API Key 不在此文件中**。所有凭证通过前端「API 设置」提交并加密存储，代码与配置文件中不保存任何明文密钥。

### 环境变量（必读）

| 变量 | 必需 | 说明 | 默认值 |
| --- | --- | --- | --- |
| `JWT_SECRET` | ✅ 每次启动 | JWT 签名密钥，长度 ≥ 32 | 无（缺失拒绝启动） |
| `SUPER_ADMIN_PASSWORD` | ✅ 仅首次建库 | 超级管理员初始口令 | 无（缺失拒绝建库） |
| `SUPER_ADMIN_USERNAME` | ❌ | 超级管理员用户名 | `admin` |
| `SUPER_ADMIN_COMPANY` | ❌ | 首次建库时创建的默认组织名 | `我的公司` |
| `SUPER_ADMIN_EMAIL` | ❌ | 超级管理员邮箱 | `admin@example.com` |

> 📌 数据库已存在时不再校验 `SUPER_ADMIN_PASSWORD`；`JWT_SECRET` 每次启动都必须提供，更换后已签发的令牌全部失效。

### 模型切换

- **切换供应商**：在「API 设置」顶部两张卡片间切换，保存后立即生效
- **百炼模型**：默认 `wan2.7-image`，可在「高级选项」中改为效果更佳的 `wan2.7-image-pro`
- **即梦模型**：`req_key` 不写死，可在「API 设置」中填写其他即梦服务标识；本地图片会自动转 Base64 提交，接口拒绝 `data:` URL 时自动回退为 `binary_data_base64`
- **并发**：即梦账号并发上限为 1，生成多张方案时自动改为逐张生成 + 重试；百炼保持并发

### 运行数据目录 `data/`

所有运行时数据集中存放在 `data/`（已被 `.gitignore` 忽略，**不会随仓库分发**）：

```text
data/
├── app.db                 # SQLite 数据库（账号/组织/邀请码/图片库元数据）
├── .secret_key            # Fernet 加密密钥（加密账号凭证用，首次运行自动生成）
├── api_config.json        # 加密后的凭证配置
├── api_usage.json         # AI 用量统计（按账号 × 供应商分桶）
├── image_library/         # 图片库文件：{company_id}/{分类}/{版型}/
├── uploads/               # 上传缓存（自动创建）
└── output/                # 生成结果缓存（自动创建，超 24 小时自动清理）
```

`data/` 目录及其中文件**删除后会在下次运行时自动重建**：

- 删除 `api_usage.json` → 重建空用量，已保存的凭证不受影响
- 删除 `api_config.json` 或 `.secret_key` → 文件重建，但**已保存的凭证无法恢复**，需重新填写
- 删除整个 `data/` → 等同重置，需要重新配置凭证

### 模板与素材

- 模板图统一在网页「图片库」中管理（支持编辑名称/分类/版型、修改与删除）
- 仓库中的 `图/` 目录为**默认模板与示例素材源目录**，首次启动会自动迁入图片库默认库（所有组织共享）
- 删除默认模板后，若 `图/` 下的源文件仍在，重启会自动重新导入

> 📌 `data/`、`.venv/`、`frontend/node_modules/` 为本地运行产物，不随仓库分发；提交代码前请确认没有把 `data/` 加入版本控制。

---

## 🏗️ 项目结构

```text
image-conversion/
├── README.md                   # 文档（中文版）
├── README.en.md                # 文档（英文版）
├── .gitignore
├── 启动.bat                    # Windows 一键启动脚本
├── config_text.json            # 历史遗留文件，当前代码未引用
│
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 应用入口：挂载路由、初始化数据库、上传与成图接口、静态托管
│   ├── config.py               # 全局常量（路径、模型、端口、开关）
│   ├── database.py             # SQLite 数据层：建表、种子数据、账号/组织/邀请码/图片库读写
│   ├── auth.py                 # 认证层：bcrypt 密码哈希、JWT 签发校验、角色权限依赖
│   ├── api_config.py           # 凭证加密存储 + 用量统计
│   ├── api_client.py           # 阿里云百炼客户端 + 按账号供应商的客户端工厂
│   ├── jimeng_client.py        # 即梦 AI 客户端（火山引擎 SigV4 签名、异步任务提交与轮询）
│   ├── image_processor.py      # Pillow 海报合成（按预览坐标粘贴素材）
│   ├── requirements.txt
│   └── routers/                # 业务路由
│       ├── auth.py             # /api/auth：注册·登录·游客·当前用户·绑定凭证·邀请码
│       ├── companies.py        # /api/companies：组织列表与组织口令
│       ├── admin.py            # /api/admin：用户管理（延期/禁用/删除）
│       ├── images.py           # 图片库：增删改查、鉴权文件流、模板列表
│       └── poster.py           # 营销海报：异步生成/修改任务与进度查询
│
├── frontend/                   # React 前端
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts          # 端口 5176，代理 /api 等路径到后端 8003
│   ├── tsconfig*.json
│   ├── .oxlintrc.json
│   ├── public/                 # 静态资源（favicon、icons）
│   └── src/
│       ├── main.tsx            # 入口：挂载 App、引入全局样式、启动动效引擎
│       ├── App.tsx             # 路由表 + Provider 嵌套 + 权限守卫
│       ├── motion.ts           # 零依赖动效引擎（initMotion / flipLayout）
│       ├── ui-meta.ts          # 按路由切换 Favicon 与 theme-color
│       ├── ui-details.css      # 生成器/管理页共享的基础工艺样式
│       ├── motion-premium.css  # 高级动效样式层
│       ├── api/                # 接口封装（api.ts 基建 + auth.ts / library.ts）
│       ├── types/index.ts      # 全项目共享 TypeScript 类型
│       ├── context/            # 全局状态（AuthContext / ApiConfigContext）
│       ├── hooks/              # usePageLeave 页面转场
│       ├── components/         # 通用组件（Header、RouteGuard、Toast、上传区、各类弹窗…）
│       ├── pages/              # 页面（Login / Home / Ecommerce / Poster / Slice / Library / AdminUsers / NotFound）
│       └── utils/              # 传输混淆、剪贴板工具
│
├── deploy/                     # 自托管部署脚本（Ubuntu）
│   ├── deploy.sh               # 一键部署：系统依赖 → 前端构建 → systemd → Nginx → 防火墙
│   ├── nginx.conf              # Nginx 站点模板（托管前端构建产物 + 反代后端）
│   ├── image-conversion.service# systemd 服务单元
│   └── update.sh               # 更新：修权限 → 装依赖 → 构建前端 → 重启后端
│
├── 图/                         # 默认模板与示例素材源目录（首次启动自动导入图片库）
└── docs/                       # 设计与实现文档
```

### 后端模块职责

| 文件 | 职责 |
| --- | --- |
| `main.py` | FastAPI 应用组装：挂载业务路由；启动时建目录、初始化数据库、迁移默认模板；后台线程定期清理过期文件并禁用到期账号；直接实现凭证配置与测试、用量历史、6 类上传接口、电商主图终稿接口、下载白名单与首页静态托管 |
| `config.py` | 纯配置常量：项目根目录、缓存目录、模板源目录、默认模型与分辨率、功能开关、监听地址端口 |
| `database.py` | SQLite 数据访问层：连接管理、建表与补列、种子数据、默认模板迁移；账号/组织/邀请码/图片库的全部读写，按组织隔离 |
| `auth.py` | 密码哈希（bcrypt）与 JWT 签发校验；支持 `Authorization: Bearer` 与 URL `?token=` 两种携带方式；`require_roles(*roles)` 权限依赖工厂；用户对象脱敏输出 |
| `api_config.py` | 凭证安全存储：Fernet 加密落盘、掩码显示、按账号取回；用量按「账号 × 供应商」分桶记账与历史明细，含并发写锁与旧数据迁移 |
| `api_client.py` | 百炼客户端：图生图编辑、文生图、图片编码与下载；`create_image_client(user)` 工厂按账号配置返回百炼或即梦客户端，业务层无感知 |
| `jimeng_client.py` | 即梦客户端：火山引擎 SigV4 签名、异步任务提交与结果轮询、失败重试；对外方法与百炼客户端保持一致 |
| `image_processor.py` | 本地合成：按预览拖拽的百分比坐标换算像素，将 Logo/二维码/品牌图 contain 缩放后粘贴到底图 |
| `routers/poster.py` | 营销海报异步任务：内存任务字典 + 线程池，前端轮询进度；支持 N 张底图并发生成、现有底图合成、图生图迭代修改 |

### 前端模块职责（摘要）

| 模块 | 职责 |
| --- | --- |
| `api/api.ts` | axios 实例与鉴权拦截器（自动附加 Bearer Token、401 自动跳登录），并封装上传/生成/下载等核心接口 |
| `context/AuthContext.tsx` | 登录态全局状态：token 恢复、登录/注册/游客登录登出、用户信息 |
| `context/ApiConfigContext.tsx` | 凭证状态加载、保存（提交前做传输混淆）、设置弹窗控制与用量刷新 |
| `components/RouteGuard.tsx` | 路由守卫：登录态未就绪显示占位，未登录跳登录页，按角色限制页面 |
| `pages/Ecommerce.tsx` · `pages/Slice.tsx` | 两大「本地 Canvas 导出」生成器（合成核心为各自的 Canvas 组件） |
| `pages/Poster.tsx` | 海报三模式：多张底图并行生成挑选 / 现有底图合成 / 迭代修改 |
| `pages/Library.tsx` · `pages/AdminUsers.tsx` | 图片库管理与用户管理（按角色可见） |
| `motion.ts` · `motion-premium.css` · `ui-details.css` | 动效引擎、高级动效样式层与基础工艺样式 |

---

## 📡 接口速览

| 模块（前缀） | 主要接口 | 功能 |
| --- | --- | --- |
| `/api/auth` | `POST register` / `login` / `guest` / `guest-logout`；`GET me` / `invite-code-info` / `invite-codes`；`PUT api-key`；`DELETE invite-codes/{id}` | 注册、登录、游客、当前用户、绑定凭证、邀请码管理 |
| `/api/companies` | `GET /`；`PUT /{id}/db-password` | 组织列表（注册用）、组织口令 |
| `/api/admin` | `GET users`；`POST users/{id}/extend` · `/disable`；`DELETE users/{id}` | 用户列表、延期、禁用、删除 |
| `/api`（图片库） | `GET images` / `image-labels` / `templates` / `slice-templates` / `images/{id}/file`；`POST images` / `poster-bases`；`PUT`·`DELETE images/{id}` | 图片库增删改查、模板列表、鉴权图片流 |
| `/api`（海报） | `POST generate-poster` / `edit-poster`；`GET generate-poster-progress/{taskId}` | 海报异步生成、迭代修改、进度查询 |
| `/api`（生成与上传） | `GET`·`POST config/api`；`POST config/api/test`；`GET config/usage-history`；`POST upload-*`；`POST generate-ecommerce-final`；`GET download*` | 凭证配置与连通性测试、用量历史、各生成器上传与成图、结果下载 |

> 完整接口定义与在线调试见后端启动后的 `/docs`（Swagger UI）。

---

## 🔒 安全与隐私

- **凭证加密存储**：账号绑定的 API Key / 即梦密钥由后端使用 Fernet 对称加密后写入 `data/api_config.json`，加密密钥为本机独立生成的 `data/.secret_key`（文件权限 0600）
- **不回显明文**：界面只显示掩码，凭证不会出现在浏览器存储或页面中
- **传输混淆**：前端提交凭证时使用一次性 nonce 做 XOR 混淆 + Base64，避免明文出现在请求体。**注意：这是防明文混淆，不等同于传输加密**，正式部署请启用 HTTPS
- **会话**：JWT 有效期 7 天，签名密钥必须通过环境变量 `JWT_SECRET` 注入（≥32 字符，不落盘、不自动生成，缺失即拒绝启动）；口令使用 bcrypt 哈希存储
- **数据隔离**：图片库按组织隔离；同一账号的用量按供应商分开统计
- **⚠️ 请勿提交运行数据**：`data/` 内含数据库、加密密钥与凭证配置，已在 `.gitignore` 中排除。**首次部署后请立即修改初始管理员凭证**

---

## 🤝 开发与贡献

### 常用命令

```bash
# 前端
cd frontend
npm run dev        # 开发服务器（5176）
npm run build      # 类型检查 + 生产构建（tsc -b && vite build）
npm run lint       # Oxlint 代码检查
npm run preview    # 预览构建产物
```

### 代码导读（一条主链路）

1. **数据层**：`backend/database.py` 的表结构（organizations / users / invite_codes / images）→ 理解账号、组织与图片库的关系
2. **后端入口**：`backend/main.py` 的路由挂载与启动初始化；`backend/auth.py` 的登录与权限依赖
3. **一条请求**：`frontend/src/pages/Ecommerce.tsx`（点击生成）→ `frontend/src/api/api.ts` → `backend/main.py` 的 `/api/generate-ecommerce-final` →（有颜色指令时）`backend/api_client.py` 或 `backend/jimeng_client.py` → `backend/api_config.py` 记账
4. **异步任务**：`frontend/src/pages/Poster.tsx` → `backend/routers/poster.py`（线程池异步）→ 前端轮询进度接口 → 展示结果
5. **纯本地导出**：`Ecommerce.tsx` / `Slice.tsx` 中 Canvas 的 `drawImage` 是合成核心，不经过后端

### 贡献

- 贡献指南：(待补充：如无贡献指南，可填写提 Issue / PR 的约定)
- 行为准则：(待补充)
- 提交前建议：`npm run lint`、`npm run build` 通过；不要在提交中夹带 `data/` 等本地数据

---

## ❓ 常见问题

**Q：生成需要多久？**
电商主图约 10~30 秒（无颜色修改时为本地导出，几乎瞬时）；营销海报约 30~60 秒（即梦模式下多张方案逐张生成，耗时随张数增加）；营销切片为本地导出，数秒完成。生成过程中请勿关闭页面。

**Q：提示「未配置 API 凭证」怎么办？**
点击右上角「🔑 API 设置」，选择供应商并绑定凭证。仅 AI 功能需要凭证，其他功能可正常使用。

**Q：提示「API 凭证无效」？**
在「API 设置」中重新填写；即梦需同时确认 Access Key ID 与 Secret Access Key 均正确。

**Q：提示「服务繁忙 / 并发超限 / 频率超限」？**
稍后重试。即梦账号并发上限为 1，一次生成多张会排队逐张处理，属正常现象。

**Q：上传后预览位置不对 / 模板图预览模糊？**
预览覆盖层使用**像素坐标**直接定位，导出时按 `scaleX/scaleY` 等比缩放到输出尺寸；预览背景使用完整图片 URL（缩略图仅用于模板选择网格）。

**Q：游客模式会留下数据吗？**
不会。游客产生的上传图片、底图与图片库数据会在退出登录时清除，系统也会定期清理超时游客数据。

**Q：模板图删除后为什么又出现了？**
默认模板源文件仍在仓库的 `图/` 目录中，重启后会重新导入。如需彻底移除，请同时处理源文件。

**Q：生成结果不满意？**
电商主图：调整文案、更换模板、上传更清晰的商品图或使用颜色修改指令；营销海报：修改提示词重新生成底图，或切到「修改海报」模式做针对性修改；营销切片：调整商品图顺序与文案内容。

---

## 💰 费用说明

本工具的计费完全取决于所选的第三方 AI 服务，**以下操作不产生任何费用**：

| 功能 | 是否调用 AI |
| --- | --- |
| 电商主图（无颜色修改） | ❌ 本地 Canvas 导出，免费 |
| 电商主图（有颜色修改） | ✅ 1 次图生图调用 |
| 营销海报（AI 生成底图） | ✅ 每张底图 1 次调用 |
| 营销海报（使用现有底图 + 手动嵌入素材） | ❌ 本地 Pillow 合成，免费 |
| 营销海报（AI 嵌入素材 / 修改海报） | ✅ 调用 AI |
| 营销切片 | ❌ 本地 Canvas 导出，免费 |

- **计费规则**：由供应商按其官方规则计费（通常**仅对成功输出的图片计费**，失败请求与输入不计费）
- **参考单价**（本文档整理时的公开信息，可能已调整，**请以供应商官方计费页为准**）：
  - `wan2.7-image`：约 0.20 元/张
  - `wan2.7-image-pro`：约 0.50 元/张
  - 即梦 AI 图片生成：按实际出图张数计费
- **用量查看**：右上角徽标、「API 设置」、「消耗明细」弹窗均可查看当前账号的累计消耗（按供应商筛选）
- **官方计费入口**：<https://help.aliyun.com/zh/model-studio/billing-for-model-studio>

**省钱建议**：优先使用本地 Canvas 导出路径；确需 AI 时优先用更经济的默认模型；即梦模式下把「生成数量」调小（并发为 1，逐张生成）。

---

## 🗺️ 更新记录

| 日期 | 里程碑 | 要点 |
| --- | --- | --- |
| 2026-07-01 ~ 07-14 | 原型到全栈 | 从智能体工作流原型演进为 Flask 全栈应用，实现文字区块、Logo 处理、横竖版与三大生成器雏形 |
| 2026-07-15 | 架构迁移 | 重写为 React + Vite + FastAPI 前后端分离；电商主图与营销切片改为前端 Canvas 导出 |
| 2026-08-05 | 部署脚本 | 新增 `deploy/`（一键部署脚本、Nginx 与 systemd 模板），模板图统一入库 |
| 2026-08-06 | 账号体系 | 三级权限、组织体系、凭证加密绑定、图片库、邀请码、游客模式 |
| 2026-08-07 | 海报升级 | 底图提示词分层、多张差异化生成、修改现有海报（可迭代） |
| 2026-08-10 | 图片库改造 | 自定义分类、双显示模式、统一编辑、海报 AI 嵌入素材模式 |
| 2026-08-12 | 动效与转场 | 登录页动效重构、页面转场动画、交互问题修复 |
| 2026-08-19 | 动效体系 | 零依赖动效引擎、动态 Favicon、404 页面与工艺细节打磨 |
| 2026-08-24 | 多供应商 | 接入即梦 AI（SigV4 签名）、供应商一键切换、用量按供应商分桶、默认模型调整 |
| 2026-08-24 | 性能优化 | 移除高开销滤镜与重绘，动画统一为合成层，登录页与全局帧率优化 |
| 2026-09-04 | 文档 | 重写 README，面向公众发布 |
| 2026-10-14 | 文档 | README 拆分为中英文两版 |

---

## 📄 许可证

(待补充：本项目尚未添加 `LICENSE` 文件，请确定许可证类型后补充)

## 📮 联系方式

- 作者 / 维护者：(待补充)
- 问题反馈：(待补充：如 Issues 地址或邮箱)
