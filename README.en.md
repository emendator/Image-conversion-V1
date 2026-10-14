# AI Image Generator

[English](README.en.md) | [中文](README.md)

An AI e-commerce / marketing image generation tool built on **Alibaba Cloud Bailian (DashScope)** and **Jimeng AI (Volcano Engine)**. It ships three generators — **e-commerce hero images**, **marketing posters**, and **marketing slice sheets** — together with an account and permission system, an organization-scoped image library, and one-click switching between AI image providers.

- **Frontend**: React 19 + Vite + TypeScript — UI, drag-and-drop layout, and local Canvas compositing/export
- **Backend**: Python + FastAPI + SQLite — authentication, account/image-library data, AI image calls, and poster compositing
- **Live demo**: (TBD: demo URL, or "none" if not hosted)
- **Screenshots**: (TBD: screenshots or a demo GIF)

> Of the three generators, **e-commerce hero images** and **marketing slice sheets** are composited locally in the browser via Canvas and consume no AI quota. Only **color modification** and **marketing posters** call the AI service.

---

## ✨ Features

### 🛒 E-commerce Hero Image Generator

Upload a product photo and brand logo, pick a template, and produce a polished e-commerce hero image. Supports horizontal/vertical product types, multi-line text overlays, drag positioning, and output resolution selection.

- Product type: **horizontal** (centered) or **vertical** (right-aligned), each auto-switching the default template and default text
- Text overlays: product name / net weight / tagline / selling-point tags; multi-line input, draggable in the preview
- **Optional color modification**: describe the change in natural language (e.g. "change the background from white to blue") and the AI performs an image-to-image edit
- Output resolution: 800×800 or 1024×1024
- Without a color instruction the image is **exported entirely locally at no cost**

### 🎨 Marketing Poster Generator

The "base image source" offers three modes: **AI-generated base** / **existing base** / **edit a poster**.

| Mode | Description |
| --- | --- |
| AI-generated base | Describe the style → choose how many to generate (1–4, default 4) → multiple differentiated bases are generated in parallel for you to pick from; asset embedding can be "manual" or "AI" |
| Existing base | Pick a base image from the library and composite assets onto it |
| Edit poster | Upload an existing poster plus change instructions; the AI produces a revised poster, and you can iterate on the previous result |

Two asset-embedding modes:

- **✋ Manual**: the AI only generates the base image; the logo / QR code / brand image are composited by the backend with Pillow at exactly the positions you dragged them to — precise, and the assets themselves are not redrawn
- **🤖 AI**: assets and prompt are handed to the AI together for a one-shot result — faster, but assets may be redrawn and distorted (QR codes may become unscannable; verify manually)

> ⚠️ The "edit poster" mode carries the same distortion risk from AI redrawing. Always verify that QR codes still scan and logos are undistorted.

### 📦 Marketing Slice Sheet Generator

Generate a multi-product showcase sheet in one go: upload several product images and they are auto-arranged into preset slots with prefilled copy, all draggable and resizable.

- 1920×1080 (horizontal) / 1080×1920 (vertical)
- Four fixed product slots by default; an optional QR code (top-right by default)
- Text grouped into 6 categories / 28 items (brand, product name, selling points, model, price, …), each collapsible and editable
- Fully exported by the browser Canvas — **no AI call, no cost**

### 🔐 Accounts and Permissions

Login is required. Three permission levels plus a guest mode:

| Role | Description |
| --- | --- |
| Super admin | Can issue first/second-level invite codes and manage the accounts it invited |
| Admin | Registers with a first-level invite code; can issue second-level codes and manage the accounts it invited |
| User | Registers with a second-level invite code; can use the generators and the image library |
| Guest | Uses every feature without registering (bring your own AI credentials); all data created during the session is cleared on logout |

- **Invite-code registration**: email + invite code; codes are single-use, expire on use, and can carry an expiry date (expired accounts cannot log in)
- **Organization system**: when registering, admins may "create an organization" or "join an existing one"; users may only join. Accounts in the same organization share one image library
- **Account management**: extend, disable, or delete; deleting an admin cascades to the accounts it invited
- **Per-account AI credentials**: each account binds its own credentials under "API settings"; usage and credentials are isolated per account

### 🖼️ Image Library

Three image categories are managed separately: **e-commerce templates**, **slice templates** (horizontal/vertical), and **poster base images**.

- Upload, download, edit (name/category/orientation), delete, plus multi-select batch delete
- Two views: grid previews (large/medium/small icons) and an information table
- Custom categories with filtering by category, orientation, and keyword (filter state is synced to the URL and shareable)
- Built-in default templates carry a "default" badge and are shared by every organization (editing or deleting them affects all organizations)
- The library is **scoped per organization**; accounts in the same organization share it

### 🤖 Multiple AI Image Providers

- Switch between **Alibaba Cloud Bailian (DashScope)** and **Jimeng AI** under "API settings"; all AI features take effect immediately
- Credentials are **encrypted at rest**; no plaintext is ever returned to the UI or written to logs (the UI shows a mask only)
- Usage is tracked **per account and per provider**: the header badge, the API settings panel, and the usage detail dialog can all be filtered by provider; output is reported primarily by image count
- Every non-AI feature works fine without any credentials

### ✨ UI and Interaction

The frontend ships a **zero-dependency motion engine** (event delegation + Intersection/MutationObserver + rAF) providing 3D tilt cards, magnetic hover, click ripples, scroll reveal, FLIP layout reordering, number count-up, scramble-decode loading states, a dynamic favicon (spinning ring while generating), page transitions, and an animated login background.

All animation is confined to `transform`/`opacity` (GPU compositing) and respects the system `prefers-reduced-motion` setting.

---

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 · Vite 8 · TypeScript · axios · react-router-dom 7 · Oxlint |
| Backend | FastAPI · Uvicorn · SQLite · Pillow · cryptography (Fernet) · PyJWT · bcrypt |
| AI services | dashscope SDK (Alibaba Cloud Bailian) · self-implemented Volcano Engine SigV4 signing (Jimeng AI) |
| Deployment (optional) | Nginx + systemd (Ubuntu) |

---

## 🚀 Getting Started

### Requirements

- **Python 3.10 or later** (recommended; the Windows one-click script auto-detects Python 3.8–3.14 installations)
- **Node.js 20 or later** (the frontend uses Vite 8)
- OS: Windows / macOS / Linux; the `启动.bat` one-click script is Windows-only
- (TBD: the minimum Python / Node versions actually verified for this project)

### 1. Get the code

```bash
git clone https://github.com/emendator/Image-conversion.git
cd Image-conversion
```

### 2. Install dependencies

**Windows one-click (recommended)**

Double-click `启动.bat` in the project root. It detects Python → creates a `.venv` → installs `backend/requirements.txt` → creates `data/uploads` and `data/output` → starts both the backend and the frontend → opens the browser.

**Manual install (all platforms)**

```bash
# 1) Backend
python -m venv .venv
.venv\Scripts\activate           # Windows
source .venv/bin/activate         # macOS / Linux
pip install -r backend/requirements.txt

# 2) Frontend
cd frontend
npm install
```

### 3. Inject environment variables and run

These variables must be injected before the backend starts — **it refuses to boot without them**:

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | ✅ every start | JWT signing key, ≥ 32 characters, never written to disk |
| `SUPER_ADMIN_PASSWORD` | first DB build only | Initial super-admin password |

```bash
# Linux / macOS
export JWT_SECRET=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
export SUPER_ADMIN_PASSWORD='<your-strong-password>'

# Windows PowerShell
$env:JWT_SECRET="<at least 32 random characters>"
$env:SUPER_ADMIN_PASSWORD="<your-strong-password>"
```

> 💡 `启动.bat` validates both variables and prints the `setx` command if they are missing.

```bash
# Terminal 1: backend (FastAPI)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8003

# Terminal 2: frontend (Vite dev server)
cd frontend
npm run dev
```

Open **<http://127.0.0.1:5176>**.

API docs (Swagger UI): **<http://127.0.0.1:8003/docs>**

### 4. Configure AI credentials (optional, once per account)

After logging in, click **🔑 API settings** in the top-right corner, choose a provider, paste the credentials and save. **Everything except the AI features works without them.**

| Provider | Credentials | Default model |
| --- | --- | --- |
| Alibaba Cloud Bailian (DashScope) | API Key | `wan2.7-image` |
| Jimeng AI (Volcano Engine) | Access Key ID + Secret Access Key | `jimeng_seedream46_cvtob` |

Where to get them:

- Bailian console: <https://bailian.console.aliyun.com/> → API Key management
- Volcano Engine console: <https://console.volcengine.com/> → Access Control → API access keys

> 🔒 Credentials are encrypted by the backend before being written to disk (see "Security and Privacy" below); the UI only ever shows a mask.

### 5. Register and log in

- **First run**: the database is created automatically; the super-admin username defaults to `admin`, the password is taken from `SUPER_ADMIN_PASSWORD`, and the default organization / email come from `SUPER_ADMIN_COMPANY` / `SUPER_ADMIN_EMAIL` (`我的公司` / `admin@example.com` when unset). **Log in and change the password right after deploying.**
- **Registration** requires an invite code, generated by a parent account under "User management" (format: color-noun-four characters, single-use)
- **Guest mode**: enter as a guest straight from the login page, no registration required (bring your own AI credentials)

---

## ⚙️ Configuration

### Backend settings (`backend/config.py`)

| Setting | Description | Default |
| --- | --- | --- |
| `DASHSCOPE_BASE_URL` | API base URL (overridable under "API settings → Advanced") | DashScope service endpoint |
| `IMAGE_MODEL` | Image-to-image / text-to-image model | `wan2.7-image` |
| `OUTPUT_SIZE` | E-commerce hero output resolution | `800*800` |
| `OUTPUT_NUM` | Default number of images per run | `1` |
| `THINKING_MODE` | Thinking mode (better quality, slower) | `False` |
| `WATERMARK` | Add a watermark | `False` |
| `HOST` / `PORT` | Backend bind address and port | `127.0.0.1` / `8003` |

> ⚠️ **The API key is not in this file.** All credentials are submitted through the web UI and stored encrypted; no plaintext key exists in the code or configuration files.

### Environment variables (required reading)

| Variable | Required | Description | Default |
| --- | --- | --- | --- |
| `JWT_SECRET` | ✅ every start | JWT signing key, ≥ 32 characters | none (startup refused) |
| `SUPER_ADMIN_PASSWORD` | ✅ first DB build | Initial super-admin password | none (seeding refused) |
| `SUPER_ADMIN_USERNAME` | ❌ | Super-admin username | `admin` |
| `SUPER_ADMIN_COMPANY` | ❌ | Default organization created on the first build | `我的公司` |
| `SUPER_ADMIN_EMAIL` | ❌ | Super-admin email | `admin@example.com` |

> 📌 `SUPER_ADMIN_PASSWORD` is only checked when the database does not exist yet; `JWT_SECRET` is required on every start, and changing it invalidates all issued tokens.

### Model switching

- **Provider**: switch between the two cards at the top of "API settings"; effective immediately after saving
- **Bailian model**: defaults to `wan2.7-image`; switch to the higher-quality `wan2.7-image-pro` under "Advanced"
- **Jimeng model**: the `req_key` is not hardcoded and can be set under "API settings"; local images are sent as Base64 and automatically fall back to `binary_data_base64` if the API rejects `data:` URLs
- **Concurrency**: Jimeng accounts are limited to one concurrent request, so multi-image runs switch to sequential generation with retries; Bailian stays concurrent

### Runtime data directory `data/`

All runtime data lives in `data/` (excluded by `.gitignore`, **never shipped with the repository**):

```text
data/
├── app.db                 # SQLite database (accounts / organizations / invite codes / image metadata)
├── .secret_key            # Fernet key used to encrypt account credentials (generated on first run)
├── api_config.json        # Encrypted credential configuration
├── api_usage.json         # AI usage statistics (bucketed by account × provider)
├── image_library/         # Library files: {company_id}/{category}/{orientation}/
├── uploads/               # Upload cache (created automatically)
└── output/                # Generated-result cache (created automatically, purged after 24 h)
```

Deleting `data/` or any file inside it **is self-healing** — everything is recreated on the next run:

- Deleting `api_usage.json` → usage resets to empty; saved credentials are unaffected
- Deleting `api_config.json` or `.secret_key` → the files are recreated, but **saved credentials cannot be recovered** and must be entered again
- Deleting the whole `data/` directory → equivalent to a reset; credentials must be reconfigured

### Templates and assets

- Templates are managed entirely from the web "Image library" page (rename, recategorize, re-orient, edit, delete)
- The `图/` directory in the repository is the **source folder for default templates and sample assets**; on first start it is imported into the shared default library (visible to all organizations)
- If you delete a default template while its source file still exists under `图/`, it is re-imported on the next restart

> 📌 `data/`, `.venv/`, and `frontend/node_modules/` are local runtime artifacts and are not distributed with the repository. Make sure you never commit `data/`.

---

## 🏗️ Project Structure

```text
image-conversion/
├── README.md                   # Documentation (Chinese)
├── README.en.md                # Documentation (English)
├── .gitignore
├── 启动.bat                    # Windows one-click launcher
├── config_text.json            # Legacy file, no longer referenced by the code
│
├── backend/                    # FastAPI backend
│   ├── main.py                 # App entry: routers, DB init, upload and render endpoints, static hosting
│   ├── config.py               # Global constants (paths, models, ports, feature switches)
│   ├── database.py             # SQLite layer: schema, seed data, account/org/invite/library I/O
│   ├── auth.py                 # Auth: bcrypt hashing, JWT issuing/verification, role dependencies
│   ├── api_config.py           # Credential encryption at rest + usage accounting
│   ├── api_client.py           # Bailian client + per-account/per-provider client factory
│   ├── jimeng_client.py        # Jimeng client (Volcano Engine SigV4, async submit/poll)
│   ├── image_processor.py      # Pillow poster compositing (paste assets at preview coordinates)
│   ├── requirements.txt
│   └── routers/                # Business routers
│       ├── auth.py             # /api/auth: register · login · guest · me · bind credentials · invite codes
│       ├── companies.py        # /api/companies: organization list and organization password
│       ├── admin.py            # /api/admin: user management (extend / disable / delete)
│       ├── images.py           # Image library: CRUD, authenticated file streaming, template lists
│       └── poster.py           # Posters: async generation/edit tasks and progress polling
│
├── frontend/                   # React frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts          # Port 5176, proxies /api and friends to the backend on 8003
│   ├── tsconfig*.json
│   ├── .oxlintrc.json
│   ├── public/                 # Static assets (favicon, icons)
│   └── src/
│       ├── main.tsx            # Entry: mount App, global styles, start the motion engine
│       ├── App.tsx             # Routes + nested providers + permission guards
│       ├── motion.ts           # Zero-dependency motion engine (initMotion / flipLayout)
│       ├── ui-meta.ts          # Per-route favicon and theme-color
│       ├── ui-details.css      # Shared craft-level styles for generator/management pages
│       ├── motion-premium.css  # Premium motion style layer
│       ├── api/                # API wrappers (api.ts base + auth.ts / library.ts)
│       ├── types/index.ts      # Shared TypeScript types
│       ├── context/            # Global state (AuthContext / ApiConfigContext)
│       ├── hooks/              # usePageLeave page transition
│       ├── components/         # Shared components (Header, RouteGuard, Toast, upload zone, dialogs…)
│       ├── pages/              # Pages (Login / Home / Ecommerce / Poster / Slice / Library / AdminUsers / NotFound)
│       └── utils/              # Transit obfuscation, clipboard helpers
│
├── deploy/                     # Self-hosting scripts (Ubuntu)
│   ├── deploy.sh               # One-shot deploy: system deps → frontend build → systemd → Nginx → firewall
│   ├── nginx.conf              # Nginx site template (serve the built frontend + reverse proxy the backend)
│   ├── image-conversion.service# systemd unit
│   └── update.sh               # Update: fix permissions → install deps → rebuild frontend → restart backend
│
├── 图/                         # Default templates and sample assets (imported into the library on first start)
└── docs/                       # Design and implementation documents
```

### Backend module responsibilities

| File | Responsibility |
| --- | --- |
| `main.py` | FastAPI app assembly: mounts the routers; on startup creates directories, initializes the database and migrates default templates; a background thread purges expired files and disables expired accounts; also implements credential configuration/testing, usage history, six upload endpoints, the e-commerce final-image endpoint, the download allowlist, and home-page static hosting |
| `config.py` | Pure constants: project root, cache directories, template source directory, default model and resolution, feature switches, bind address and port |
| `database.py` | SQLite data-access layer: connection management, schema creation and column back-fill, seed data, default-template migration; all account/organization/invite-code/image-library I/O, scoped per organization |
| `auth.py` | bcrypt password hashing and JWT issuing/verification; accepts both `Authorization: Bearer` and the `?token=` query parameter; `require_roles(*roles)` dependency factory; sanitized user serialization |
| `api_config.py` | Credential storage at rest: Fernet encryption, masked display, per-account retrieval; usage bucketed by "account × provider" with history, concurrency locking, and legacy-data migration |
| `api_client.py` | Bailian client: image-to-image editing, text-to-image, image encoding and download; `create_image_client(user)` returns a Bailian or Jimeng client per account configuration, transparent to business code |
| `jimeng_client.py` | Jimeng client: Volcano Engine SigV4 signing, async task submission and result polling, failure retries; its public methods mirror the Bailian client |
| `image_processor.py` | Local compositing: converts dragged percentage coordinates into pixels and pastes the logo / QR code / brand image onto the base with contain scaling |
| `routers/poster.py` | Poster async tasks: in-memory task dict + thread pool with progress polling; supports parallel generation of N base images, compositing onto an existing base, and iterative image-to-image edits |

### Frontend modules (summary)

| Module | Responsibility |
| --- | --- |
| `api/api.ts` | axios instance and auth interceptor (attaches the Bearer token, redirects to login on 401) plus the core upload/generate/download wrappers |
| `context/AuthContext.tsx` | Global auth state: token restore, login/register/guest login and logout, user info |
| `context/ApiConfigContext.tsx` | Credential status loading, saving (with transit obfuscation), settings dialog control, usage refresh |
| `components/RouteGuard.tsx` | Route guard: placeholder while auth restores, redirect to login when signed out, role-based page access |
| `pages/Ecommerce.tsx` · `pages/Slice.tsx` | The two "local Canvas export" generators (each with its own Canvas compositing component) |
| `pages/Poster.tsx` | The three poster modes: parallel base generation and selection / compositing onto an existing base / iterative edits |
| `pages/Library.tsx` · `pages/AdminUsers.tsx` | Image library management and user management (role-gated) |
| `motion.ts` · `motion-premium.css` · `ui-details.css` | Motion engine, premium motion style layer, and base craft styles |

---

## 📡 API Overview

| Module (prefix) | Main endpoints | Purpose |
| --- | --- | --- |
| `/api/auth` | `POST register` / `login` / `guest` / `guest-logout`; `GET me` / `invite-code-info` / `invite-codes`; `PUT api-key`; `DELETE invite-codes/{id}` | Registration, login, guest mode, current user, credential binding, invite codes |
| `/api/companies` | `GET /`; `PUT /{id}/db-password` | Organization list (for registration), organization password |
| `/api/admin` | `GET users`; `POST users/{id}/extend` · `/disable`; `DELETE users/{id}` | User list, extend, disable, delete |
| `/api` (images) | `GET images` / `image-labels` / `templates` / `slice-templates` / `images/{id}/file`; `POST images` / `poster-bases`; `PUT`·`DELETE images/{id}` | Library CRUD, template lists, authenticated image streaming |
| `/api` (poster) | `POST generate-poster` / `edit-poster`; `GET generate-poster-progress/{taskId}` | Async poster generation, iterative editing, progress polling |
| `/api` (generate & upload) | `GET`·`POST config/api`; `POST config/api/test`; `GET config/usage-history`; `POST upload-*`; `POST generate-ecommerce-final`; `GET download*` | Credential configuration and connectivity test, usage history, per-generator uploads and renders, result downloads |

> The full API definition and an interactive console are available at `/docs` (Swagger UI) once the backend is running.

---

## 🔒 Security and Privacy

- **Credentials encrypted at rest**: account API keys / Jimeng secrets are encrypted with Fernet and written to `data/api_config.json`; the key is generated locally at `data/.secret_key` (file mode 0600)
- **No plaintext echo**: the UI shows only a mask; credentials never reach browser storage or the page
- **Transit obfuscation**: the frontend obfuscates credentials with a one-time nonce (XOR + Base64) so plaintext never appears in the request body. **Note: this is obfuscation, not transport encryption** — enable HTTPS in production
- **Sessions**: JWTs are valid for 7 days; the signing key must be injected via the `JWT_SECRET` environment variable (≥ 32 characters, never written to disk, auto-generation removed — the backend refuses to start without it); passwords are stored as bcrypt hashes
- **Data isolation**: the image library is scoped per organization; usage is tracked separately per provider within an account
- **⚠️ Never commit runtime data**: `data/` holds the database, encryption keys, and credential configuration and is excluded via `.gitignore`. **Change the initial admin credentials immediately after deploying.**

---

## 🤝 Development and Contributing

### Common commands

```bash
# Frontend
cd frontend
npm run dev        # dev server (5176)
npm run build      # type-check + production build (tsc -b && vite build)
npm run lint       # Oxlint
npm run preview    # preview the build output
```

### Code walkthrough (one request, end to end)

1. **Data layer**: table structure in `backend/database.py` (organizations / users / invite_codes / images) — how accounts, organizations, and the library relate
2. **Backend entry**: router mounting and startup initialization in `backend/main.py`; login and permission dependencies in `backend/auth.py`
3. **One request**: `frontend/src/pages/Ecommerce.tsx` (click generate) → `frontend/src/api/api.ts` → `/api/generate-ecommerce-final` in `backend/main.py` → (with a color instruction) `backend/api_client.py` or `backend/jimeng_client.py` → usage recorded in `backend/api_config.py`
4. **Async task**: `frontend/src/pages/Poster.tsx` → `backend/routers/poster.py` (thread-pool async) → the frontend polls the progress endpoint → renders the result
5. **Pure local export**: the Canvas `drawImage` calls in `Ecommerce.tsx` / `Slice.tsx` are the compositing core and never touch the backend

### Contributing

- Contribution guide: (TBD: or your Issue/PR conventions if there is no guide)
- Code of conduct: (TBD)
- Before committing: make sure `npm run lint` and `npm run build` pass, and never include local data such as `data/`

---

## ❓ FAQ

**Q: How long does generation take?**
E-commerce hero images take about 10–30 s (near-instant when exported locally without a color instruction); marketing posters take about 30–60 s (in Jimeng mode multiple images are generated sequentially, so the time grows with the count); slice sheets export locally in seconds. Don't close the page while generating.

**Q: It says "no API credentials configured" — what now?**
Click **🔑 API settings** in the top-right corner, pick a provider, and bind your credentials. Only the AI features need them.

**Q: It says the API credentials are invalid.**
Re-enter them under "API settings"; for Jimeng, make sure both the Access Key ID and the Secret Access Key are correct.

**Q: It says the service is busy / concurrency or rate limit exceeded.**
Retry later. Jimeng accounts are limited to one concurrent request, so generating several images queues them sequentially — this is expected.

**Q: The preview position is off, or the template preview is blurry.**
The preview overlay uses **pixel coordinates** directly and scales by `scaleX`/`scaleY` on export. The preview background uses the full image URL (thumbnails are only used in the template picker grid).

**Q: Does guest mode leave data behind?**
No. Uploaded images, base images, and library entries created as a guest are cleared on logout, and expired guest data is also purged periodically.

**Q: Why does a deleted template come back?**
Its source file still exists under the repository's `图/` directory and is re-imported on restart. Remove the source file as well to delete it permanently.

**Q: I don't like the result.**
E-commerce hero: adjust the copy, switch templates, upload a sharper product photo, or use a color-modification instruction. Marketing poster: rewrite the prompt to regenerate the base, or switch to "edit poster" for targeted changes. Slice sheet: reorder the product images and edit the copy.

---

## 💰 Cost

Billing is entirely determined by the third-party AI service you choose. **The following operations cost nothing:**

| Feature | Calls AI? |
| --- | --- |
| E-commerce hero (no color modification) | ❌ local Canvas export, free |
| E-commerce hero (with color modification) | ✅ one image-to-image call |
| Marketing poster (AI-generated base) | ✅ one call per base image |
| Marketing poster (existing base + manual assets) | ❌ local Pillow compositing, free |
| Marketing poster (AI-embedded assets / edit poster) | ✅ calls AI |
| Marketing slice sheet | ❌ local Canvas export, free |

- **Billing rules**: charged by the provider under its own terms (typically **only successful output images are billed**; failed requests and inputs are free)
- **Reference prices** (public information at the time of writing, subject to change — **always check the provider's official pricing page**):
  - `wan2.7-image`: about ¥0.20 per image
  - `wan2.7-image-pro`: about ¥0.50 per image
  - Jimeng AI image generation: billed per successfully generated image
- **Where to check usage**: the header badge, "API settings", and the usage detail dialog all show the current account's cumulative usage (filterable by provider)
- **Official pricing page**: <https://help.aliyun.com/zh/model-studio/billing-for-model-studio>

**Cost-saving tips**: prefer the local Canvas export path; when AI is needed, prefer the cheaper default model; in Jimeng mode keep the generation count low (concurrency is 1, so images are generated sequentially).

---

## 🗺️ Changelog

| Date | Milestone | Highlights |
| --- | --- | --- |
| 2026-07-01 – 07-14 | Prototype to full stack | Evolved from an agent-workflow prototype into a Flask application: text blocks, logo handling, horizontal/vertical layouts, and the first versions of the three generators |
| 2026-07-15 | Architecture migration | Rewritten as React + Vite + FastAPI; the e-commerce hero and slice sheets moved to frontend Canvas export |
| 2026-08-05 | Deploy scripts | Added `deploy/` (one-shot deploy script, Nginx and systemd templates); templates unified into the library |
| 2026-08-06 | Accounts | Three permission levels, organizations, encrypted credential binding, image library, invite codes, guest mode |
| 2026-08-07 | Poster upgrade | Layered base-image prompts, multiple differentiated generations, iterative poster editing |
| 2026-08-10 | Library rework | Custom categories, dual views, unified editing, AI-embedded poster assets |
| 2026-08-12 | Motion and transitions | Login page rework, page transition animations, interaction fixes |
| 2026-08-19 | Motion system | Zero-dependency motion engine, dynamic favicon, 404 page, craft polish |
| 2026-08-24 | Multi-provider | Jimeng AI integration (SigV4), one-click provider switching, per-provider usage buckets, default model change |
| 2026-08-24 | Performance | Removed expensive filters and repaints, confined animation to the compositor, login and global frame-rate work |
| 2026-09-04 | Docs | README rewritten for a public audience |
| 2026-10-14 | Docs | README split into separate Chinese and English versions |

---

## 📄 License

(TBD: this project has no `LICENSE` file yet — choose a license and add one)

## 📮 Contact

- Author / maintainer: (TBD)
- Feedback: (TBD: e.g. the Issues URL or an email address)
