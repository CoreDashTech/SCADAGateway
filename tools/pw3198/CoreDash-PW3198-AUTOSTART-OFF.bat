@echo off
chcp 65001 >nul
REM CoreDash: stop starting the live bridge automatically.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CoreDash-PW3198.ps1" -Uninstall
pause
