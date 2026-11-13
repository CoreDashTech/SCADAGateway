@echo off
chcp 65001 >nul
setlocal
REM CoreDash: start the live bridge automatically (minimised) every time this Windows user signs in.
REM After this, the web app can reconnect and change analyser IPs by itself.
set "IPS=192.168.1.62,192.168.1.63,192.168.1.66"
if exist "%~dp0live-ips.txt" set /p IPS=<"%~dp0live-ips.txt"
echo.
echo  CoreDash - ตั้งให้เปิดค่าสดอัตโนมัติเมื่อเปิดโน้ตบุ๊ก
echo  IP เครื่องวัด: %IPS%   (เปลี่ยนภายหลังได้จากเว็บแอป ปุ่ม "ตั้ง IP เครื่องวัด")
set "IN="
set /p "IN=  กด Enter เพื่อใช้ IP ชุดนี้ หรือพิมพ์ IP ใหม่ (คั่นด้วย ,) : "
if not "%IN%"=="" set "IPS=%IN%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CoreDash-PW3198.ps1" -Ip "%IPS%" -Install
pause
