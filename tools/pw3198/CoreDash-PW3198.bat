@echo off
chcp 65001 >nul
title CoreDash Nexus - PW3198 LAN Tool
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CoreDash-PW3198.ps1" %*
echo.
pause
