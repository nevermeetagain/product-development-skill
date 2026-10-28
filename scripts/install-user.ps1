# 兼容旧入口：等同于 .\scripts\install.ps1（参数原样转发）
[CmdletBinding()]
param(
  [Parameter(Position = 0)][ValidateSet('Claude', 'Codex', 'Cursor', 'Both', 'All')][string]$Target = 'Both',
  [switch]$Force,
  [string]$Dir = '',
  [string]$CommandsDir = '',
  [switch]$NoCommands
)
& (Join-Path $PSScriptRoot 'install.ps1') -Target $Target -Force:$Force -Dir $Dir -CommandsDir $CommandsDir -NoCommands:$NoCommands
