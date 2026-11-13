@echo off
chcp 65001 >nul
setlocal
REM ============================================================
REM  CoreDash: live values from SEVERAL Hioki PW3198 -> web app
REM  Order of IPs = cards: 1st -> #2 MAIN GRID, 2nd -> #3 LOAD, 3rd -> #6 APF (max 3)
REM  Edit the line below to your analysers' IP addresses.
REM ============================================================
set "IPS=192.168.1.62,192.168.1.63,192.168.1.66"

echo.
echo  CoreDash - ค่าสดหลายเครื่อง (PW3198)
echo  ลำดับ IP = การ์ด:  ตัวที่1 = #2 MAIN GRID   ตัวที่2 = #3 LOAD   ตัวที่3 = #6 APF
echo.
echo  IP ที่ตั้งไว้: %IPS%
set "IN="
set /p "IN=  กด Enter เพื่อใช้ IP ชุดนี้ หรือพิมพ์ IP ใหม่ (คั่นด้วย ,) : "
if not "%IN%"=="" set "IPS=%IN%"
echo.
echo  กำลังเชื่อมต่อ %IPS% ...  (หยุด: กด Enter ในหน้าต่างนี้ - อย่ากดปิด X)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CoreDash-PW3198.ps1" -Ip "%IPS%" -Live
pause
