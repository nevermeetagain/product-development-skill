@echo off
rem Usage: scripts\install.cmd [claude^|codex^|cursor^|both^|all] [--force] [--dir PATH] [--commands-dir PATH] [--no-commands]
rem Shim for cmd.exe users: forwards to install.ps1 (Windows PowerShell 5.1 or pwsh).
setlocal
rem capture script dir before SHIFT (shift also moves %0)
set "PD_HERE=%~dp0"
set "PD_TARGET=Both"
set "PD_FORCE="
set "PD_NOCMD="
set "PD_DIR="
set "PD_CMDDIR="
:loop
if "%~1"=="" goto run
if /i "%~1"=="claude" set "PD_TARGET=Claude"
if /i "%~1"=="codex" set "PD_TARGET=Codex"
if /i "%~1"=="cursor" set "PD_TARGET=Cursor"
if /i "%~1"=="both" set "PD_TARGET=Both"
if /i "%~1"=="all" set "PD_TARGET=All"
if /i "%~1"=="--force" set "PD_FORCE=-Force"
if /i "%~1"=="-f" set "PD_FORCE=-Force"
if /i "%~1"=="--no-commands" set "PD_NOCMD=-NoCommands"
if /i "%~1"=="--dir" (set "PD_DIR=%~2" & shift)
if /i "%~1"=="--commands-dir" (set "PD_CMDDIR=%~2" & shift)
shift
goto loop
:run
set "PD_PS=powershell"
where powershell >nul 2>nul || set "PD_PS=pwsh"
set "PD_ARGS=-Target %PD_TARGET% %PD_FORCE% %PD_NOCMD%"
if defined PD_DIR (
  if defined PD_CMDDIR (
    %PD_PS% -NoProfile -ExecutionPolicy Bypass -File "%PD_HERE%install.ps1" %PD_ARGS% -Dir "%PD_DIR%" -CommandsDir "%PD_CMDDIR%"
  ) else (
    %PD_PS% -NoProfile -ExecutionPolicy Bypass -File "%PD_HERE%install.ps1" %PD_ARGS% -Dir "%PD_DIR%"
  )
) else (
  if defined PD_CMDDIR (
    %PD_PS% -NoProfile -ExecutionPolicy Bypass -File "%PD_HERE%install.ps1" %PD_ARGS% -CommandsDir "%PD_CMDDIR%"
  ) else (
    %PD_PS% -NoProfile -ExecutionPolicy Bypass -File "%PD_HERE%install.ps1" %PD_ARGS%
  )
)
exit /b %ERRORLEVEL%
