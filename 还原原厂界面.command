#!/bin/zsh -l
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" >/dev/null 2>&1 || true

echo "=== Warm Atelier · 还原 Antigravity 原厂界面 ==="
node "$SCRIPT_DIR/scripts/agy-theme.mjs" remove
