@echo off
rem Usage: scripts\install.cmd [claude^|codex^|both] [--force] [--dir PATH]
rem Shim for cmd.exe users: forwards to install.ps1 (Windows PowerShell 5.1 or pwsh).
setlocal
rem capture script dir before SHIFT (shift also moves %0)
set "PD_HERE=%~dp0"
set "PD_TARGET=Both"
set "PD_FORCE="
set "PD_DIR="
:loop
if "%~1"=="" goto run
if /i "%~1"=="claude" set "PD_TARGET=Claude"
if /i "%~1"=="codex" set "PD_TARGET=Codex"
if /i "%~1"=="both" set "PD_TARGET=Both"
if /i "%~1"=="--force" set "PD_FORCE=-Force"
if /i "%~1"=="-f" set "PD_FORCE=-Force"
if /i "%~1"=="--dir" (set "PD_DIR=%~2" & shift)
shift
goto loop
:run
set "PD_PS=powershell"
where powershell >nul 2>nul || set "PD_PS=pwsh"
if defined PD_DIR (
  %PD_PS% -NoProfile -ExecutionPolicy Bypass -File "%PD_HERE%install.ps1" -Target %PD_TARGET% %PD_FORCE% -Dir "%PD_DIR%"
) else (
  %PD_PS% -NoProfile -ExecutionPolicy Bypass -File "%PD_HERE%install.ps1" -Target %PD_TARGET% %PD_FORCE%
)
exit /b %ERRORLEVEL%
