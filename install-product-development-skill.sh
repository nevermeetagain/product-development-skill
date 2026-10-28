#!/usr/bin/env bash
# 一键安装 product-development skill 到本机（Linux / macOS，用户级 all = Claude+Codex+Cursor）
# 用法：bash install-product-development-skill.sh [--force]
# 幂等：已安装会自动备份旧版并覆盖更新；自测通过才报成功；结束自动清理临时克隆与旧备份。
# 下载方式：优先 git clone；若 git 智能 HTTP 挂起，回退 curl 下载 tarball（实测更快更稳）。
set -euo pipefail

# ---------- 1. 环境检查 ----------
echo "== 1. 检查环境 =="
command -v node >/dev/null 2>&1 || { echo "✗ 缺少 node"; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "✗ 缺少 git";  exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || { echo "✗ node 需 18+，当前 $(node --version)"; exit 1; }
echo "  ✓ node $(node --version) / git $(git --version)"

# ---------- 2. 代理探测（http 优先，其次 socks5h，都不通则直连） ----------
echo "== 2. 探测代理 =="
PROXY=""
if command -v curl >/dev/null 2>&1; then
  if curl -sS -I -m 8 -x http://127.0.0.1:10808 https://github.com >/dev/null 2>&1; then
    PROXY="http://127.0.0.1:10808"
  elif curl -sS -I -m 8 -x socks5h://127.0.0.1:10808 https://github.com >/dev/null 2>&1; then
    PROXY="socks5h://127.0.0.1:10808"
  fi
fi
if [ -n "$PROXY" ]; then
  echo "  ✓ 使用代理 $PROXY"
  export http_proxy="$PROXY" https_proxy="$PROXY" HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"
else
  echo "  · 未探测到可用代理，直连 GitHub"
fi

# ---------- 3. 下载源码（git clone 优先，超时则回退 curl tarball） ----------
echo "== 3. 下载源码 =="
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
REPO="https://github.com/nevermeetagain/product-development-skill.git"
SRC="$TMPDIR/pd"
if command -v curl >/dev/null 2>&1; then
  # 先试 git clone（限时 90s）
  if timeout 90 git clone --depth 1 "$REPO" "$SRC" >/dev/null 2>&1; then
    echo "  ✓ git clone 完成"
  else
    echo "  · git clone 超时/失败，回退 curl 下载 tarball"
    rm -rf "$SRC"
    if [ -n "$PROXY" ]; then
      curl -sSL -m 120 -x "$PROXY" -o "$TMPDIR/pd.tgz" \
        "https://github.com/nevermeetagain/product-development-skill/archive/refs/heads/main.tar.gz"
    else
      curl -sSL -m 120 -o "$TMPDIR/pd.tgz" \
        "https://github.com/nevermeetagain/product-development-skill/archive/refs/heads/main.tar.gz"
    fi
    mkdir -p "$SRC"
    tar -xzf "$TMPDIR/pd.tgz" -C "$SRC" --strip-components=1
    echo "  ✓ curl tarball 下载并解压完成"
  fi
else
  timeout 120 git clone --depth 1 "$REPO" "$SRC" >/dev/null 2>&1 || { echo "✗ 下载失败（无 curl 且 git clone 失败）"; exit 1; }
  echo "  ✓ git clone 完成"
fi
cd "$SRC"

# ---------- 4. 安装 all（= Claude + Codex + Cursor，含 /pds 命令） ----------
echo "== 4. 安装 all =="
FORCE_ARG=""
if [ "${1:-}" = "--force" ] \
   || [ -e "$HOME/.claude/skills/product-development" ] \
   || [ -e "$HOME/.agents/skills/product-development" ]; then
  FORCE_ARG="--force"   # 已存在则备份旧版再覆盖，保证可升级
fi
bash scripts/install.sh all $FORCE_ARG

# ---------- 5. 补齐 examples（install.sh 刻意不复制，但 self-test 需要它） ----------
echo "== 5. 补齐 examples =="
for D in "$HOME/.claude/skills/product-development" "$HOME/.agents/skills/product-development"; do
  if [ -d "$D" ] && [ -d examples ]; then
    cp -R examples "$D/"
    echo "  ✓ 已补 examples -> $D/examples"
  fi
done

# ---------- 6. 自测 ----------
echo "== 6. 自测 =="
cd "$HOME/.claude/skills/product-development"
if node scripts/self-test.mjs; then
  echo "  ✓ 自测全部通过"
else
  echo "✗ 自测未通过"; exit 1
fi

# ---------- 7. 清理安装器生成的旧备份 ----------
echo "== 7. 清理旧备份 =="
find "$HOME/.claude/skills" "$HOME/.agents/skills" -maxdepth 2 -name 'product-development.bak.*' -type d -exec rm -rf {} + 2>/dev/null || true
find "$HOME/.claude/commands" "$HOME/.codex/prompts" "$HOME/.cursor/commands" -name 'pds.md.bak.*' -type f -delete 2>/dev/null || true
echo "  ✓ 已清理 .bak 备份"

echo
echo "✅ 安装完成。"
echo "  Skill : $HOME/.claude/skills/product-development"
echo "          $HOME/.agents/skills/product-development"
echo "  /pds  : $HOME/.claude/commands/pds.md"
echo "          $HOME/.codex/prompts/pds.md"
echo "          $HOME/.cursor/commands/pds.md"
echo "重启 IDE/CLI 后用 /pds 状态（Codex 用 /prompts:pds 状态）验证。"
