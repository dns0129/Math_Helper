#!/bin/bash
set -e
cd "$(dirname "$0")"
TASK_NODE=""
for candidate in "$(command -v node || true)" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node@22/bin/node; do
  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22 || (a===22&&b>=19)?0:1)' 2>/dev/null; then
    TASK_NODE="$candidate"
    break
  fi
done
if [ -z "$TASK_NODE" ]; then
  echo "数学助手需要 Node.js 22.19 或更新版本。"
  read -r -p "按回车关闭…"
  exit 1
fi
export PATH="$(dirname "$TASK_NODE"):$PATH"
if [ ! -d node_modules ]; then
  npm ci --ignore-scripts --registry=https://registry.npmjs.org --cache=.local/npm-cache
fi
"$TASK_NODE" node_modules/vite/bin/vite.js build
exec "$TASK_NODE" "$PWD/scripts/publish-local.mjs"
