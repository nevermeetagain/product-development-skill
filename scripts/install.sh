#!/usr/bin/env bash
# 用法：bash scripts/install.sh [claude|codex|both] [--force]
set -euo pipefail
target="${1:-both}"; force="${2:-}"
src="$(cd "$(dirname "$0")/.." && pwd)"
inst() { dest="$1/product-development"
  if [ -e "$dest" ] && [ "$force" != "--force" ]; then echo "已存在 $dest（加 --force 覆盖，旧目录会备份）"; return; fi
  [ -e "$dest" ] && mv "$dest" "$dest.bak.$(date +%Y%m%d%H%M%S)"
  mkdir -p "$1"; cp -R "$src" "$dest"; rm -rf "$dest/examples"; echo "已安装到 $dest"; }
case "$target" in
  claude) inst "$HOME/.claude/skills";; codex) inst "$HOME/.agents/skills";;
  both) inst "$HOME/.claude/skills"; inst "$HOME/.agents/skills";; *) echo "目标只能是 claude|codex|both"; exit 2;;
esac
