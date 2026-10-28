# 用法：.\scripts\install-user.ps1 -Target Claude|Codex|Both [-Force]
param([ValidateSet('Claude','Codex','Both')][string]$Target = 'Both', [switch]$Force)
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
function Install-To($base) {
  $dest = Join-Path $base 'product-development'
  if (Test-Path $dest) {
    if (-not $Force) { Write-Host "已存在 $dest（加 -Force 覆盖，旧目录会备份）"; return }
    Rename-Item $dest ("product-development.bak." + (Get-Date -Format yyyyMMddHHmmss))
  }
  New-Item -ItemType Directory -Force -Path $base | Out-Null
  Copy-Item -Recurse $src $dest
  Remove-Item -Recurse -Force (Join-Path $dest 'examples') -ErrorAction SilentlyContinue
  Write-Host "已安装到 $dest"
}
if ($Target -in 'Claude','Both') { Install-To (Join-Path $env:USERPROFILE '.claude\skills') }
if ($Target -in 'Codex','Both')  { Install-To (Join-Path $env:USERPROFILE '.agents\skills') }
