#!/bin/zsh -l
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 兼容 Finder 双击启动时 fnm / homebrew 环境变量加载
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" >/dev/null 2>&1 || true

echo "=== Warm Atelier · 一键启动并应用主题 ==="
node "$SCRIPT_DIR/scripts/agy-theme.mjs" relaunch
echo ""
echo "完成！如需边改 CSS 边热重载，可运行：node \"$SCRIPT_DIR/scripts/agy-theme.mjs\" watch"
