@echo off
chcp 65001 >nul
REM CoreDash: send ONE test notification to the phone (ntfy app). Topic is in ntfy-topic.txt (created on first run).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CoreDash-PW3198.ps1" -TestPush
pause
