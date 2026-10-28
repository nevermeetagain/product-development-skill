# 用法（PowerShell 5.1 / 7）：
#   .\scripts\install.ps1 [-Target Claude|Codex|Cursor|Both|All] [-Force] [-Dir <skills 根目录>] [-CommandsDir <命令目录>] [-NoCommands]
#   cmd：scripts\install.cmd all --force
# 与 scripts/install.sh 行为一致：只复制 SKILL.md、README.md、CHANGELOG.md、references\、templates\、scripts\（不含 examples/.git/.github）
# Skill：Claude → $env:CLAUDE_CONFIG_DIR 或 %USERPROFILE%\.claude\skills；Codex / Cursor → %USERPROFILE%\.agents\skills（Cursor 官方也从这里加载 Skill）
# /pds 命令：Claude → <Claude 配置目录>\commands\pds.md；Codex → $env:CODEX_HOME 或 %USERPROFILE%\.codex\prompts\pds.md（用 /prompts:pds）；
#           Cursor → %USERPROFILE%\.cursor\commands\pds.md；Both = Claude+Codex（默认），All = Claude+Codex+Cursor
# -Dir 只装 Skill；同时给 -CommandsDir 才装命令。已存在且内容不同的 pds.md 默认跳过，-Force 先备份为 pds.md.bak.<时间> 再覆盖
[CmdletBinding()]
param(
  [Parameter(Position = 0)][ValidateSet('Claude', 'Codex', 'Cursor', 'Both', 'All')][string]$Target = 'Both',
  [switch]$Force,
  [string]$Dir = '',
  [string]$CommandsDir = '',
  [switch]$NoCommands
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$src = Split-Path -Parent $PSScriptRoot
$items = @('SKILL.md', 'README.md', 'CHANGELOG.md', 'references', 'templates', 'scripts')
$stamp = Get-Date -Format yyyyMMddHHmmss
$script:doneBases = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Warning '未找到 node，pd.mjs 需要 Node.js 18+（不影响复制）' }

function Install-To([string]$base) {
  if ($script:doneBases -contains $base) { return }
  $script:doneBases += $base
  $dest = Join-Path $base 'product-development'
  if (Test-Path -LiteralPath $dest) {
    if (-not $Force) { Write-Host "已存在 $dest（加 -Force 覆盖，旧目录会备份）"; return }
    Rename-Item -LiteralPath $dest ('product-development.bak.' + $stamp)
  }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  foreach ($i in $items) {
    $p = Join-Path $src $i
    if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $dest -Recurse -Force }
  }
  Write-Host "已安装到 $dest"
}

# 安装 pds.md：内容相同跳过；不同且无 -Force 跳过；-Force 先备份
# 不用 Get-FileHash：从 pwsh 7 启动 Windows PowerShell 5.1 时继承的 PSModulePath 会让它无法加载（CI 发现）
function Install-Command([string]$tpl, [string]$dir) {
  if ($NoCommands) { return }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $f = Join-Path $dir 'pds.md'
  if (Test-Path -LiteralPath $f) {
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($tpl)) -eq [Convert]::ToBase64String([IO.File]::ReadAllBytes($f))) { Write-Host "/pds 已是最新：$f"; return }
    if (-not $Force) { Write-Host "已存在不同的 $f（未覆盖；加 -Force 覆盖，旧文件会备份为 pds.md.bak.<时间>）"; return }
    Rename-Item -LiteralPath $f ('pds.md.bak.' + $stamp)
    Write-Host "已备份旧命令到 $f.bak.$stamp"
  }
  Copy-Item -LiteralPath $tpl -Destination $f -Force
  Write-Host "已安装 /pds 命令到 $f"
}

$tplStd = Join-Path $src 'templates\commands\pds.md'
$tplCursor = Join-Path $src 'templates\commands\cursor\pds.md'
$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
if (-not $userHome) { $userHome = $HOME }
if ($Dir) {
  Install-To $Dir
  if ($CommandsDir) { if ($Target -eq 'Cursor') { Install-Command $tplCursor $CommandsDir } else { Install-Command $tplStd $CommandsDir } }
  return
}
$claudeRoot = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $userHome '.claude' }
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $userHome '.codex' }
$agentsBase = Join-Path (Join-Path $userHome '.agents') 'skills'
function Pick([string]$default) { if ($CommandsDir) { $CommandsDir } else { $default } }
if ($Target -in 'Claude', 'Both', 'All') { Install-To (Join-Path $claudeRoot 'skills'); Install-Command $tplStd (Pick (Join-Path $claudeRoot 'commands')) }
if ($Target -in 'Codex', 'Both', 'All') { Install-To $agentsBase; Install-Command $tplStd (Pick (Join-Path $codexHome 'prompts')) }
if ($Target -in 'Cursor', 'All') { Install-To $agentsBase; Install-Command $tplCursor (Pick (Join-Path (Join-Path $userHome '.cursor') 'commands')) }
