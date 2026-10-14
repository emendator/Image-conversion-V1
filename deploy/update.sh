#!/usr/bin/env bash
# ============================================================
# 图片转换工具 - 服务器更新脚本
#
# 前提：新代码已通过 git pull 同步到 /opt/image-conversion
# 用法：cd /opt/image-conversion && sudo bash deploy/update.sh
# 效果：修复权限 → 重新构建前端 → 重启后端，使新代码生效
# ============================================================
set -euo pipefail

APP_DIR="/opt/image-conversion"
FRONTEND_DIR="$APP_DIR/frontend"

echo "============================================================"
echo "  图片转换工具 - 更新服务"
echo "============================================================"

# 0. 修复权限（新上传的文件属主可能是 root，data/ 需 www-data 可写）
echo "[0/4] 修复目录权限..."
chown -R www-data:www-data "$APP_DIR"

# 0.5 安装后端 Python 依赖（requirements.txt 有新增依赖时生效）
echo "[0.5/4] 安装后端 Python 依赖..."
cd "$APP_DIR/backend"
if [ -x ".venv/bin/pip" ]; then
    ./.venv/bin/pip install -r requirements.txt --no-input --quiet || echo "[警告] pip 安装失败，请手动检查"
else
    pip3 install -r requirements.txt --no-input --quiet || echo "[警告] pip 安装失败，请手动检查"
fi

# 1. 重新构建前端
if [ -d "$FRONTEND_DIR" ]; then
    echo "[1/4] 重新构建前端..."
    cd "$FRONTEND_DIR"
    npm install --no-audit --no-fund
    npm run build
else
    echo "[1/4] 未找到前端目录，跳过前端构建"
fi

# 2. 重启后端服务
echo "[2/4] 重启后端服务..."
systemctl restart image-conversion

# 3. 校验状态
echo "[3/4] 检查服务状态..."
systemctl --no-pager status image-conversion --lines=3 || true

echo ""
echo "============================================================"
echo "  ✅ 更新完成！刷新浏览器即可（建议 Ctrl+F5 强刷）"
echo "============================================================"
