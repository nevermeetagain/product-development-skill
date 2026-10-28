# 用法（PowerShell 5.1 / 7）：
#   .\scripts\install.ps1 [-Target Claude|Codex|Both] [-Force] [-Dir <skills 根目录>]
#   cmd：scripts\install.cmd both --force
# 与 scripts/install.sh 行为一致：只复制 SKILL.md、README.md、CHANGELOG.md、references\、templates\、scripts\（不含 examples/.git/.github）
# Claude → $env:CLAUDE_CONFIG_DIR 或 %USERPROFILE%\.claude\skills；Codex → %USERPROFILE%\.agents\skills
[CmdletBinding()]
param(
  [Parameter(Position = 0)][ValidateSet('Claude', 'Codex', 'Both')][string]$Target = 'Both',
  [switch]$Force,
  [string]$Dir = ''
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$src = Split-Path -Parent $PSScriptRoot
$items = @('SKILL.md', 'README.md', 'CHANGELOG.md', 'references', 'templates', 'scripts')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Warning '未找到 node，pd.mjs 需要 Node.js 18+（不影响复制）' }

function Install-To([string]$base) {
  $dest = Join-Path $base 'product-development'
  if (Test-Path -LiteralPath $dest) {
    if (-not $Force) { Write-Host "已存在 $dest（加 -Force 覆盖，旧目录会备份）"; return }
    Rename-Item -LiteralPath $dest ('product-development.bak.' + (Get-Date -Format yyyyMMddHHmmss))
  }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  foreach ($i in $items) {
    $p = Join-Path $src $i
    if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $dest -Recurse -Force }
  }
  Write-Host "已安装到 $dest"
}

$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
if (-not $userHome) { $userHome = $HOME }
if ($Dir) { Install-To $Dir; return }
$claudeBase = if ($env:CLAUDE_CONFIG_DIR) { Join-Path $env:CLAUDE_CONFIG_DIR 'skills' } else { Join-Path (Join-Path $userHome '.claude') 'skills' }
$codexBase = Join-Path (Join-Path $userHome '.agents') 'skills'
if ($Target -in 'Claude', 'Both') { Install-To $claudeBase }
if ($Target -in 'Codex', 'Both') { Install-To $codexBase }
