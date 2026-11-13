@echo off
chcp 65001 >nul
REM CoreDash: live PW3198 values -> web app. Change the IP below if the analyser has another address.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CoreDash-PW3198.ps1" -Ip 192.168.1.62 -Live
pause
