#!/usr/bin/env bash
# 用法：bash scripts/install.sh [claude|codex|both] [--force] [--dir <skills 根目录>]
#   claude → ${CLAUDE_CONFIG_DIR:-~/.claude}/skills   codex → ~/.agents/skills   --dir 指定任意根目录（测试/项目级安装）
# 与 scripts/install.ps1 行为一致：只复制 SKILL.md、README.md、CHANGELOG.md、references/、templates/、scripts/（不含 examples/.git/.github）
set -euo pipefail
target="both"; force=""; dir=""
while [ $# -gt 0 ]; do
  case "$1" in
    claude|codex|both|Claude|Codex|Both) target="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')";;
    --force|-f) force=1;;
    --dir) shift; dir="${1:?--dir 需要路径}";;
    *) echo "未知参数：$1（用法：install.sh [claude|codex|both] [--force] [--dir <路径>]）" >&2; exit 2;;
  esac; shift
done
command -v node >/dev/null 2>&1 || echo "提醒：未找到 node，pd.mjs 需要 Node.js 18+（不影响复制）" >&2
src="$(cd "$(dirname "$0")/.." && pwd)"
items="SKILL.md README.md CHANGELOG.md references templates scripts"
inst() { base="$1"; dest="$base/product-development"
  if [ -e "$dest" ]; then
    if [ -z "$force" ]; then echo "已存在 $dest（加 --force 覆盖，旧目录会备份）"; return 0; fi
    mv "$dest" "$dest.bak.$(date +%Y%m%d%H%M%S)"
  fi
  mkdir -p "$dest"
  for i in $items; do [ -e "$src/$i" ] && cp -R "$src/$i" "$dest/"; done
  chmod +x "$dest/scripts/"*.sh 2>/dev/null || true
  echo "已安装到 $dest"; }
if [ -n "$dir" ]; then inst "$dir"; exit 0; fi
claude_base="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
codex_base="$HOME/.agents/skills"
case "$target" in
  claude) inst "$claude_base";; codex) inst "$codex_base";;
  both) inst "$claude_base"; inst "$codex_base";;
esac
