#!/usr/bin/env bash
# 用法：bash scripts/install.sh [claude|codex|cursor|both|all] [--force] [--dir <skills 根目录>] [--commands-dir <命令目录>] [--no-commands]
#   Skill：claude → ${CLAUDE_CONFIG_DIR:-~/.claude}/skills   codex / cursor → ~/.agents/skills（Cursor 官方也从这里加载 Skill）
#   /pds 命令：claude → ${CLAUDE_CONFIG_DIR:-~/.claude}/commands/pds.md   codex → ${CODEX_HOME:-~/.codex}/prompts/pds.md（用 /prompts:pds）
#             cursor → ~/.cursor/commands/pds.md   both = claude+codex（默认）   all = claude+codex+cursor
#   --dir 只装 Skill 到指定根目录（测试/项目级）；同时给 --commands-dir 才装命令（如 --dir .claude/skills --commands-dir .claude/commands）
#   已存在且内容不同的 pds.md：默认跳过；加 --force 先备份为 pds.md.bak.<时间> 再覆盖
# 与 scripts/install.ps1 行为一致：只复制 SKILL.md、README.md、CHANGELOG.md、references/、templates/、scripts/（不含 examples/.git/.github）
set -euo pipefail
target="both"; force=""; dir=""; cmddir=""; nocmd=""
while [ $# -gt 0 ]; do
  case "$1" in
    claude|codex|cursor|both|all|Claude|Codex|Cursor|Both|All) target="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')";;
    --force|-f) force=1;;
    --dir) shift; dir="${1:?--dir 需要路径}";;
    --commands-dir) shift; cmddir="${1:?--commands-dir 需要路径}";;
    --no-commands) nocmd=1;;
    *) echo "未知参数：$1（用法：install.sh [claude|codex|cursor|both|all] [--force] [--dir <路径>] [--commands-dir <路径>] [--no-commands]）" >&2; exit 2;;
  esac; shift
done
command -v node >/dev/null 2>&1 || echo "提醒：未找到 node，pd.mjs 需要 Node.js 18+（不影响复制）" >&2
src="$(cd "$(dirname "$0")/.." && pwd)"
items="SKILL.md README.md CHANGELOG.md references templates scripts"
stamp="$(date +%Y%m%d%H%M%S)"
done_bases=" "
inst() { base="$1"; dest="$base/product-development"
  case "$done_bases" in *" $base "*) return 0;; esac; done_bases="$done_bases$base "
  if [ -e "$dest" ]; then
    if [ -z "$force" ]; then echo "已存在 $dest（加 --force 覆盖，旧目录会备份）"; return 0; fi
    mv "$dest" "$dest.bak.$stamp"
  fi
  mkdir -p "$dest"
  for i in $items; do [ -e "$src/$i" ] && cp -R "$src/$i" "$dest/"; done
  chmod +x "$dest/scripts/"*.sh 2>/dev/null || true
  echo "已安装到 $dest"; }
# inst_cmd <模板> <命令目录>：安装 pds.md；内容相同跳过，不同且无 --force 跳过，--force 先备份
inst_cmd() { tpl="$1"; d="$2"; f="$d/pds.md"
  [ -n "$nocmd" ] && return 0
  mkdir -p "$d"
  if [ -e "$f" ]; then
    if cmp -s "$tpl" "$f"; then echo "/pds 已是最新：$f"; return 0; fi
    if [ -z "$force" ]; then echo "已存在不同的 $f（未覆盖；加 --force 覆盖，旧文件会备份为 pds.md.bak.<时间>）"; return 0; fi
    mv "$f" "$f.bak.$stamp"; echo "已备份旧命令到 $f.bak.$stamp"
  fi
  cp "$tpl" "$f"; echo "已安装 /pds 命令到 $f"; }
tpl_std="$src/templates/commands/pds.md"; tpl_cursor="$src/templates/commands/cursor/pds.md"
if [ -n "$dir" ]; then
  inst "$dir"
  if [ -n "$cmddir" ]; then if [ "$target" = cursor ]; then inst_cmd "$tpl_cursor" "$cmddir"; else inst_cmd "$tpl_std" "$cmddir"; fi; fi
  exit 0
fi
claude_root="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
codex_home="${CODEX_HOME:-$HOME/.codex}"
agents_base="$HOME/.agents/skills"
do_claude() { inst "$claude_root/skills"; inst_cmd "$tpl_std" "${cmddir:-$claude_root/commands}"; }
do_codex()  { inst "$agents_base";        inst_cmd "$tpl_std" "${cmddir:-$codex_home/prompts}"; }
do_cursor() { inst "$agents_base";        inst_cmd "$tpl_cursor" "${cmddir:-$HOME/.cursor/commands}"; }
case "$target" in
  claude) do_claude;; codex) do_codex;; cursor) do_cursor;;
  both) do_claude; do_codex;;
  all) do_claude; do_codex; do_cursor;;
esac
