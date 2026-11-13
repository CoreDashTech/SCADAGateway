# CoreDash Nexus — PW3198 connection check + SD-card dump over LAN (no USB, no SD swap)
# Double-click "CoreDash-PW3198.bat" (Windows). Works with Windows PowerShell 5.1 and PowerShell 7.
param(
  [string]$Ip = "",
  [int]$HttpPort = 80,
  [int]$FtpPort = 21,
  [string]$Out = "",
  [string]$User = "",
  [string]$Pass = "",
  [switch]$CheckOnly,
  [switch]$Dump,
  [switch]$Send,
  [string]$Folder = "",
  [string]$AppUrl = "https://coredashtech.github.io/SCADAGateway/app/",
  [int]$SendPort = 8799,
  [int]$SendMinutes = 15,
  [switch]$NoBrowser,
  [switch]$Probe,
  [switch]$Cmd,
  [switch]$Items,
  [switch]$Harm,
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Live,
  [int]$LiveMinutes = 0,
  [string]$Ntfy = "",
  [string]$NtfyServer = "https://ntfy.sh",
  [switch]$PushWarn,
  [double]$Unom = 0,
  [switch]$TestPush,
  [int]$CmdPort = 3198
)
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

function Say($t, $c = "Gray") { Write-Host $t -ForegroundColor $c }
function Ok($t)  { Write-Host ("  [ OK ] " + $t) -ForegroundColor Green }
function Bad($t) { Write-Host ("  [FAIL] " + $t) -ForegroundColor Red }
function Hint($t){ Write-Host ("         " + $t) -ForegroundColor Yellow }

function Test-Port([string]$h, [int]$p, [int]$ms = 2500) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $r = $c.BeginConnect($h, $p, $null, $null)
    if (-not $r.AsyncWaitHandle.WaitOne($ms)) { return $false }
    $c.EndConnect($r); return $true
  } catch { return $false } finally { $c.Close() }
}
function Test-Ping([string]$h) {
  try { $r = (New-Object System.Net.NetworkInformation.Ping).Send($h, 1500); return ($r.Status -eq "Success") } catch { return $false }
}
function My-IPs {
  try {
    [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq "Up" } |
      ForEach-Object { $_.GetIPProperties().UnicastAddresses } | Where-Object { $_.Address.AddressFamily -eq "InterNetwork" -and $_.Address.ToString() -ne "127.0.0.1" } |
      ForEach-Object { $_.Address.ToString() }
  } catch { @() }
}

# ---------------------------------------------------------------- 1. check
# command port: connect and ask *IDN? — the PW3198 accepts ONE command connection at a time
function Test-Cmd([string]$h, [int]$p = 3198) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $r = $c.BeginConnect($h, $p, $null, $null)
    if (-not $r.AsyncWaitHandle.WaitOne(4000)) { return "timeout" }
    $c.EndConnect($r); $ns = $c.GetStream(); $m = [System.Text.Encoding]::ASCII.GetBytes("*IDN?`r`n"); $ns.Write($m, 0, $m.Length)
    $t0 = [DateTime]::Now; $buf = New-Object byte[] 512
    while (([DateTime]::Now - $t0).TotalMilliseconds -lt 2500) { if ($ns.DataAvailable) { $k = $ns.Read($buf, 0, $buf.Length); return ("ok:" + [System.Text.Encoding]::ASCII.GetString($buf, 0, $k).Trim()) }; Start-Sleep -Milliseconds 30 }
    return "silent"
  } catch { if ($_.Exception.Message -match 'refused') { return "refused" } else { return "timeout" } } finally { $c.Close() }
}
# other copies of this tool (an old LIVE window, menu 6–9) keep the PW3198 command port busy: stop them first
function Stop-OtherTools {
  if ($env:OS -ne "Windows_NT") { return }
  try {
    $me = $PID
    $others = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction Stop | Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -like "*CoreDash-PW3198.ps1*" })
    if ($others.Count) {
      Hint ("พบหน้าต่างเครื่องมือ CoreDash เดิมค้างอยู่ " + $others.Count + " หน้าต่าง — ปิดให้ก่อน เพื่อคืนพอร์ต 3198 ของเครื่องวัด")
      foreach ($o in $others) { try { Stop-Process -Id $o.ProcessId -Force -ErrorAction Stop } catch {} }
      Start-Sleep -Seconds 3
    }
  } catch {}
}
function Check-One([string]$h) {
  Say ""
  Say ("=== PW3198 @ " + $h + " ===") "Cyan"
  $mine = @(My-IPs)
  $net = ($h -split "\.")[0..2] -join "."
  if ($mine | Where-Object { $_.StartsWith($net + ".") }) { Ok ("คอมนี้อยู่วงเดียวกัน (" + (($mine | Where-Object { $_.StartsWith($net + ".") }) -join ", ") + ")") }
  else { Bad ("คอมนี้ไม่ได้อยู่วง " + $net + ".x  (IP คอมนี้: " + ($mine -join ", ") + ")"); Hint "ต่อ Wi-Fi/LAN วงเดียวกับเครื่องวัด หรือแก้ IP เครื่องวัดให้เป็นวงเดียวกับคอม แล้วรีบูตเครื่องวัด" }
  $ping = Test-Ping $h
  if ($ping) { Ok "Ping ตอบกลับ — สายและ IP ถูกต้อง" } else { Bad "Ping ไม่ตอบ"; Hint "เช็ก: ไฟช่อง LAN กะพริบไหม / รีบูตเครื่องวัดหลังแก้ IP / IP ซ้ำกับเครื่องอื่นไหม" }
  $http = Test-Port $h $HttpPort
  if ($http) { Ok ("หน้าจอเครื่องวัดผ่านเบราว์เซอร์พร้อม: http://" + $h + $(if ($HttpPort -ne 80) { ":" + $HttpPort } else { "" }) + "/") } else { Bad "เปิดหน้าจอผ่านเบราว์เซอร์ไม่ได้ (HTTP)"; Hint "ตรวจการตั้งค่า LAN ในเครื่องวัด (SYSTEM > HARDWARE) และลองรีบูตเครื่องวัด" }
  $cmd = Test-Cmd $h $CmdPort
  if ($cmd -like "ok:*") { Ok ("พอร์ตคำสั่ง " + $CmdPort + " พร้อม — ดึงค่าสดได้ (" + $cmd.Substring(3) + ")") }
  elseif ($cmd -eq "refused") { Bad ("พอร์ตคำสั่ง " + $CmdPort + " ไม่ว่าง — มีโปรแกรมอื่นต่อเครื่องนี้อยู่"); Hint "ปิดหน้าต่าง LIVE อื่น / PQ ONE ถ้ายังไม่หาย ให้ปิด-เปิดเครื่องวัด 1 ครั้ง" }
  elseif ($ping -or $http) { Bad ("พอร์ตคำสั่ง " + $CmdPort + " ไม่ตอบ ทั้งที่ Ping/หน้าเว็บได้"); Hint "มักเกิดจากการเชื่อมต่อเก่าค้างในเครื่องวัด (เคยปิดหน้าต่างด้วย X) → ปิด-เปิดเครื่องวัด 1 ครั้ง แล้วรันใหม่" }
  $ftp = Test-Port $h $FtpPort
  if ($ftp) { Ok "ดึงไฟล์ใน SD ได้ (FTP พร้อม)" } else { Say "  [INFO] เครื่องนี้ไม่มี FTP — ปกติของ PW3198: ดึงไฟล์ผ่าน LAN ด้วยโปรแกรม Hioki PQ ONE แทน" "Yellow"; Hint "PQ ONE: เพิ่มเครื่องด้วย IP นี้ → ดาวน์โหลดข้อมูลจาก SD → Export CSV ลงโฟลเดอร์ แล้วกดเมนู 4 เพื่อส่งเข้าเว็บแอป" }
  if ($ftp) { Say "ผล: เชื่อมต่อสำเร็จ — พร้อมดึงข้อมูล (กด 2)" "Green" }
  elseif ($ping -or $http) { Say "ผล: เชื่อมต่อสำเร็จ — ดูหน้าจอสดได้ (กด 1) · ดึงไฟล์ใช้ PQ ONE แล้วกด 4" "Green" }
  else { Say "ผล: ยังต่อไม่ติด" "Red" }
  return [pscustomobject]@{ ip = $h; ping = $ping; http = $http; ftp = $ftp; cmd = $cmd }
}

# ---------------------------------------------------------------- 2. FTP dump
function Ftp-Req([string]$url, [string]$method) {
  $r = [System.Net.FtpWebRequest]::Create($url)
  $r.Method = $method; $r.UseBinary = $true; $r.UsePassive = $true; $r.KeepAlive = $false; $r.Timeout = 15000
  $r.Credentials = New-Object System.Net.NetworkCredential($script:FtpUser, $script:FtpPass)
  return $r
}
function Ftp-List([string]$base, [string]$dir) {
  $res = (Ftp-Req ($base + $dir) ([System.Net.WebRequestMethods+Ftp]::ListDirectoryDetails)).GetResponse()
  $sr = New-Object System.IO.StreamReader($res.GetResponseStream())
  $text = $sr.ReadToEnd(); $sr.Close(); $res.Close()
  $items = @()
  foreach ($line in ($text -split "`r?`n")) {
    if (-not $line.Trim()) { continue }
    if ($line -match '^([d-])[rwx-]{9}\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\w{3}\s+\d+\s+[\d:]+\s+(.+)$') { $items += [pscustomobject]@{ name = $matches[3]; dir = ($matches[1] -eq "d"); size = [int64]$matches[2] }; continue }
    if ($line -match '^\d{2}-\d{2}-\d{2,4}\s+\d{2}:\d{2}[AP]M\s+(<DIR>|\d+)\s+(.+)$') { $items += [pscustomobject]@{ name = $matches[2]; dir = ($matches[1] -eq "<DIR>"); size = $(if ($matches[1] -eq "<DIR>") { 0 } else { [int64]$matches[1] }) } }
  }
  return $items | Where-Object { $_.name -ne "." -and $_.name -ne ".." }
}
function Ftp-Get([string]$url, [string]$dest) {
  $res = (Ftp-Req $url ([System.Net.WebRequestMethods+Ftp]::DownloadFile)).GetResponse()
  $in = $res.GetResponseStream(); $out = [System.IO.File]::Create($dest)
  try { $in.CopyTo($out) } finally { $out.Close(); $in.Close(); $res.Close() }
}
function Dump-One([string]$h) {
  $script:FtpUser = $(if ($User) { $User } else { "anonymous" }); $script:FtpPass = $(if ($Pass) { $Pass } else { "coredash@" })
  $base = "ftp://" + $h + ":" + $FtpPort
  try { $null = Ftp-List $base "/" }
  catch {
    if ("$_" -match "530|Not logged in|login") {
      Say "เครื่องวัดเปิดการยืนยันตัวตน FTP — ใส่ชื่อผู้ใช้/รหัสที่ตั้งไว้ในเครื่องวัด" "Yellow"
      $script:FtpUser = Read-Host "  User"; $script:FtpPass = Read-Host "  Password"
    } else { Bad ("ต่อ FTP ไม่ได้: " + $_.Exception.Message); return }
  }
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $root = $(if ($Out) { $Out } else { Join-Path ([Environment]::GetFolderPath("Desktop")) ("PW3198-" + $h + "-" + $stamp) })
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  Say ("กำลังดึงไฟล์ทั้งหมดไปที่: " + $root) "Cyan"
  $count = 0; $bytes = 0; $skipped = 0
  $queue = New-Object System.Collections.Queue; $queue.Enqueue("/")
  while ($queue.Count) {
    $dir = $queue.Dequeue()
    foreach ($it in (Ftp-List $base $dir)) {
      $remote = $dir.TrimEnd("/") + "/" + $it.name
      if ($it.dir) { $queue.Enqueue($remote); continue }
      $local = Join-Path $root ($remote.TrimStart("/") -replace "/", "\")
      if ([System.IO.Path]::DirectorySeparatorChar -eq "/") { $local = Join-Path $root $remote.TrimStart("/") }
      New-Item -ItemType Directory -Force -Path (Split-Path $local) | Out-Null
      if ((Test-Path $local) -and ((Get-Item $local).Length -eq $it.size)) { $skipped++; continue }
      Write-Host ("  ↓ " + $remote + "  (" + [math]::Round($it.size / 1MB, 2) + " MB)")
      Ftp-Get ($base + $remote) $local
      $count++; $bytes += $it.size
    }
  }
  Ok ("ดึงไฟล์เสร็จ " + $count + " ไฟล์, " + [math]::Round($bytes / 1MB, 1) + " MB" + $(if ($skipped) { " (ข้าม " + $skipped + " ไฟล์ที่มีแล้ว)" } else { "" }))
  Hint "ไฟล์ข้อมูลดิบของ Hioki เปิดด้วย PQ ONE แล้ว Export CSV จากนั้นกด 'นำเข้าไฟล์' ในแอป CoreDash"
  if ($env:OS -eq "Windows_NT") { Start-Process explorer.exe $root }
}


# ---------------------------------------------------------------- 4. send a dump folder to the CoreDash web app
# A tiny local web server (127.0.0.1 only) hands the files to the web app, which parses and plots them in the browser.
function Pick-Folder {
  if ($Folder) { return $Folder }
  $desk = $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") })
  $last = Get-ChildItem -Path $desk -Directory -Filter "PW3198-*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($last) { Say ("โฟลเดอร์ล่าสุด: " + $last.FullName) "Cyan"; $a = Read-Host "  Enter = ใช้โฟลเดอร์นี้ หรือพิมพ์ที่อยู่โฟลเดอร์อื่น"; if ($a) { return $a } ; return $last.FullName }
  return (Read-Host "ใส่ที่อยู่โฟลเดอร์ที่มีไฟล์ CSV")
}
function Send-Folder {
  $dir = Pick-Folder
  if (-not (Test-Path $dir)) { Bad ("ไม่พบโฟลเดอร์: " + $dir); return }
  $dir = (Resolve-Path $dir).Path
  $all = @(Get-ChildItem -Path $dir -Recurse -File | Where-Object { $_.Name -notlike "PW3198-check-*" })
  $csv = @($all | Where-Object { $_.Extension -match '^\.(csv|txt)$' })
  $raw = $all.Count - $csv.Count
  Say ("พบไฟล์ CSV/TXT " + $csv.Count + " ไฟล์, ไฟล์ดิบของ Hioki " + $raw + " ไฟล์") "Cyan"
  if (-not $csv.Count) {
    Bad "ยังไม่มีไฟล์ CSV ให้ส่งเข้าเว็บแอป"
    Hint "เปิดไฟล์ดิบด้วยโปรแกรม PQ ONE ของ Hioki → Export CSV ลงในโฟลเดอร์นี้ → แล้วกด 4 อีกครั้ง"
    if ($env:OS -eq "Windows_NT") { Start-Process explorer.exe $dir }
    return
  }
  $list = @(); $i = 0
  foreach ($f in $all) { $list += [pscustomobject]@{ i = $i; name = $f.FullName.Substring($dir.Length).TrimStart('\', '/') -replace '\\', '/'; size = $f.Length; path = $f.FullName }; $i++ }
  $json = ConvertTo-Json -Depth 3 -Compress @{ folder = (Split-Path $dir -Leaf); files = @($list | ForEach-Object { @{ i = $_.i; name = $_.name; size = $_.size } }) }
  $listener = $null
  foreach ($p in $SendPort..($SendPort + 9)) {
    try { $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p); $listener.Start(); $port = $p; break } catch { $listener = $null }
  }
  if (-not $listener) { Bad "เปิดพอร์ตส่งข้อมูลไม่ได้"; return }
  $url = $AppUrl.TrimEnd('#') + "#pq?import=http://127.0.0.1:" + $port
  Ok ("พร้อมส่ง " + $csv.Count + " ไฟล์เข้าเว็บแอป (ช่องทางภายในเครื่องนี้ 127.0.0.1:" + $port + ")")
  Hint "เบราว์เซอร์จะเปิดแอป CoreDash ไปที่ คุณภาพไฟ → ไฟล์ แล้ว plot ให้อัตโนมัติ"
  Hint "ถ้าเบราว์เซอร์ถาม 'อนุญาตให้เข้าถึงอุปกรณ์ในเครือข่ายภายใน' ให้กด อนุญาต"
  if (-not $NoBrowser) { Start-Process $url }
  Say ("(ปิดอัตโนมัติใน " + $SendMinutes + " นาที หรือกด Enter เพื่อหยุด)") "DarkGray"
  $until = (Get-Date).AddMinutes($SendMinutes); $served = 0
  try {
    while ((Get-Date) -lt $until) {
      try { if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq "Enter") { break } } catch {}
      if (-not $listener.Pending()) { Start-Sleep -Milliseconds 100; continue }
      $c = $listener.AcceptTcpClient(); $c.ReceiveTimeout = 5000
      try {
        $ns = $c.GetStream(); $rd = New-Object System.IO.StreamReader($ns, [System.Text.Encoding]::ASCII, $false, 4096, $true)
        $req = $rd.ReadLine(); while (($h = $rd.ReadLine()) -ne $null -and $h -ne "") {}
        $parts = "$req" -split " "; $method = $parts[0]; $path = $(if ($parts.Count -gt 1) { $parts[1] } else { "/" })
        $cors = "Access-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nAccess-Control-Allow-Private-Network: true`r`nCache-Control: no-store`r`nConnection: close`r`n"
        if ($method -eq "OPTIONS") { $body = [byte[]]@(); $head = "HTTP/1.1 204 No Content`r`n" + $cors + "`r`n" }
        elseif ($path -eq "/files.json") { $body = [System.Text.Encoding]::UTF8.GetBytes($json); $head = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n" }
        elseif ($path -match '^/f/(\d+)$' -and [int]$matches[1] -lt $list.Count) { $body = [System.IO.File]::ReadAllBytes($list[[int]$matches[1]].path); $head = "HTTP/1.1 200 OK`r`nContent-Type: application/octet-stream`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n"; $served++ }
        else { $body = [System.Text.Encoding]::UTF8.GetBytes("CoreDash PW3198 tool"); $head = "HTTP/1.1 404 Not Found`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n" }
        $hb = [System.Text.Encoding]::ASCII.GetBytes($head); $ns.Write($hb, 0, $hb.Length); if ($body.Length) { $ns.Write($body, 0, $body.Length) }; $ns.Flush()
      } catch {} finally { $c.Close() }
      if ($served -ge $csv.Count) { Ok "เว็บแอปรับข้อมูลครบแล้ว"; Start-Sleep -Milliseconds 300; break }
    }
  } finally { $listener.Stop() }
}


# ---------------------------------------------------------------- 5. probe the live-data channels (to wire real-time values)
function Probe-One([string]$h) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $root = Join-Path $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") }) ("PW3198-probe-" + $h + "-" + $stamp)
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $report = New-Object System.Collections.ArrayList
  $add = { param($t) [void]$report.Add($t); Write-Host ("  " + $t) }
  Say ("=== สำรวจช่องทางค่าสด @ " + $h + " ===") "Cyan"
  # a) web pages of the instrument (the browser screen gets its numbers from somewhere)
  $wc = New-Object System.Net.WebClient
  $seen = @{}; $queue = New-Object System.Collections.Queue; $queue.Enqueue("/"); $n = 0
  while ($queue.Count -and $n -lt 40) {
    $path = $queue.Dequeue(); if ($seen.ContainsKey($path)) { continue }; $seen[$path] = 1; $n++
    $url = "http://" + $h + $(if ($HttpPort -ne 80) { ":" + $HttpPort } else { "" }) + $path
    try {
      $bytes = $wc.DownloadData($url)
      $ct = "" + $wc.ResponseHeaders["Content-Type"]
      $safe = ($path.Trim("/") -replace '[^A-Za-z0-9._-]', "_"); if (-not $safe) { $safe = "index" }
      [System.IO.File]::WriteAllBytes((Join-Path $root ("web_" + $safe + $(if ($safe -notmatch '\.\w+$') { ".html" } else { "" }))), $bytes)
      & $add ("HTTP 200 " + $path + "  (" + $bytes.Length + " B, " + $ct + ")")
      if ($ct -match "text|html|javascript|xml|json" -or $path -match '\.(htm|html|js|cgi|xml|txt)$|/$') {
        $text = [System.Text.Encoding]::ASCII.GetString($bytes)
        foreach ($m in [regex]::Matches($text, '(?:(?:src|href|action|data)\s*=\s*|open\(\s*["'']GET["'']\s*,\s*|url\s*[:=]\s*|fetch\(\s*)["'']([^"''#]+)["'']', "IgnoreCase")) {
          $u = $m.Groups[1].Value
          if ($u -match '^https?://') { if ($u -notmatch [regex]::Escape($h)) { continue }; $u = ([uri]$u).PathAndQuery }
          if (-not $u.StartsWith("/")) { $u = ($path.Substring(0, $path.LastIndexOf("/") + 1)) + $u }
          if (-not $seen.ContainsKey($u)) { $queue.Enqueue($u) }
        }
      }
    } catch { & $add ("HTTP ERR " + $path + "  " + $_.Exception.Message) }
  }
  # b) TCP ports 1–10000 (command channels answer here)
  Say "  กำลังสแกนพอร์ต 1–10000 (ประมาณ 20 วินาที)…" "DarkGray"
  $open = @()
  for ($start = 1; $start -le 10000; $start += 500) {
    $batch = @()
    foreach ($p in $start..([math]::Min(10000, $start + 499))) { $c = New-Object System.Net.Sockets.TcpClient; $batch += [pscustomobject]@{ p = $p; c = $c; r = $c.BeginConnect($h, $p, $null, $null) } }
    Start-Sleep -Milliseconds 700
    foreach ($b in $batch) { if ($b.r.IsCompleted -and $b.c.Connected) { $open += $b.p }; try { $b.c.Close() } catch {} }
  }
  & $add ("พอร์ตที่เปิด: " + ($open -join ", "))
  # c) ask each open port who it is (SCPI-style *IDN?)
  foreach ($p in $open) {
    if ($p -eq 80 -or $p -eq $HttpPort) { continue }
    foreach ($q in @("*IDN?", ":HEADer?")) {
      try {
        $c = New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout = 2000; $c.SendTimeout = 2000; $c.Connect($h, $p)
        $ns = $c.GetStream(); $msg = [System.Text.Encoding]::ASCII.GetBytes($q + "`r`n"); $ns.Write($msg, 0, $msg.Length)
        $buf = New-Object byte[] 4096; Start-Sleep -Milliseconds 600
        $got = ""; if ($ns.DataAvailable) { $k = $ns.Read($buf, 0, $buf.Length); $got = ([System.Text.Encoding]::ASCII.GetString($buf, 0, $k).Trim() -split "`r?`n")[0] }
        & $add ("TCP " + $p + "  " + $q + "  →  " + $(if ($got) { $got } else { "(ไม่ตอบ)" }))
        $c.Close()
      } catch { & $add ("TCP " + $p + "  " + $q + "  →  ERR " + $_.Exception.Message) }
    }
  }
  $report | Set-Content -Encoding UTF8 (Join-Path $root "probe-report.txt")
  $zip = $root + ".zip"
  try { Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zip -Force; Ok ("สร้างไฟล์ผลสำรวจแล้ว: " + $zip); Hint "ส่งไฟล์ zip นี้ให้ทีม CoreDash เพื่อเปิดค่าสดเข้าเว็บแอป" } catch { Ok ("ผลสำรวจอยู่ที่: " + $root) }
  if ($env:OS -eq "Windows_NT") { try { Start-Process explorer.exe ("/select," + $zip) } catch { } }
}

# Menu 6: ask the command port (3198) a list of READ-ONLY queries (every one ends with "?")
# and record which ones the instrument understands. Nothing is set, started or reset.
function Cmd-One([string]$h, [int]$port = 3198) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $root = Join-Path $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") }) ("PW3198-cmd-" + $h + "-" + $stamp)
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $report = New-Object System.Collections.ArrayList
  Say ("=== ทดสอบคำสั่งอ่านค่า @ " + $h + ":" + $port + " (อ่านอย่างเดียว) ===") "Cyan"
  $qs = @(
    "*IDN?", "*OPT?", "*ESR?", ":HEADer?", ":SYSTem:ERRor?", ":ERRor?",
    ":MEASure?", ":MEASure:POWer?", ":MEASure:ITEM?", ":MEASure:ITEM:POWer?", ":MEASure:ITEM:HARMonic?",
    ":MEASure:VOLTage?", ":MEASure:CURRent?", ":MEASure:FREQuency?", ":MEASure:HARMonic?",
    ":MEASure:INSTant?", ":MEASure:WAVE?", ":MEASure:EVENt?", ":MEASure:DMM?", ":MEASure:RMS?",
    ":MEASure:POWer? U1", ":MEASure:POWer? URMS1", ":MEASure:VOLTage? U1", ":MEASure:VOLTage? CH1",
    ":FETCh?", ":READ?", ":DATAout?", ":DATAout:ITEM?", ":DATA?", ":DATA:ITEM?",
    ":WIRing?", ":CONNection?", ":SYSTem:WIRing?", ":FREQuency?", ":NOMInal?", ":VOLTage:NOMInal?",
    ":CURRent:RANGe?", ":CURRent:SENSor?", ":SENSor?", ":RANGe?", ":VOLTage:RANGe?",
    ":STATus?", ":STATe?", ":RECord?", ":RECord:STATe?", ":STARt?", ":INTerval?", ":TIMEInterval?",
    ":SYSTem:TIME?", ":SYSTem:DATE?", ":TIME?", ":DATE?", ":CLOCk?",
    ":HARMonic?", ":HARMonic:ITEM?", ":THD?", ":DISPlay?", ":VIEW?", ":MODE?"
  )
  try {
    $c = New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout = 1500; $c.SendTimeout = 2000; $c.Connect($h, $port)
    $ns = $c.GetStream(); $enc = [System.Text.Encoding]::ASCII
    $ask = {
      param($q)
      $m = $enc.GetBytes($q + "`r`n"); $ns.Write($m, 0, $m.Length)
      $sb = New-Object System.Text.StringBuilder; $buf = New-Object byte[] 65536; $t0 = [DateTime]::Now
      while (([DateTime]::Now - $t0).TotalMilliseconds -lt 1500) {
        if ($ns.DataAvailable) { $k = $ns.Read($buf, 0, $buf.Length); [void]$sb.Append($enc.GetString($buf, 0, $k)); if ($sb.ToString().EndsWith("`n")) { break } }
        else { Start-Sleep -Milliseconds 30 }
      }
      return $sb.ToString().Trim()
    }
    [void](& $ask "*ESR?")   # clear old error bits first
    $okN = 0
    foreach ($q in $qs) {
      $r = & $ask $q
      $e = & $ask "*ESR?"
      $err = 0; [void][int]::TryParse(($e -replace '[^0-9]', ''), [ref]$err)
      $verdict = if ($err -band 32) { "ไม่รู้จัก" } elseif ($err -band 16) { "รู้จักแต่สั่งตอนนี้ไม่ได้" } elseif ($r) { "ตอบ"; $okN++ } else { "เงียบ" }
      $short = if ($r.Length -gt 300) { $r.Substring(0, 300) + " …(" + $r.Length + " ตัวอักษร)" } else { $r }
      $line = $q + "`t" + $verdict + "`tESR=" + $e + "`t" + $short
      [void]$report.Add($line)
      Write-Host ("  " + $q.PadRight(26) + " " + $verdict.PadRight(10) + " " + $(if ($short.Length -gt 70) { $short.Substring(0, 70) + "…" } else { $short })) -ForegroundColor $(if ($verdict -eq "ตอบ") { "Green" } else { "DarkGray" })
      if ($r.Length -gt 300) { Set-Content -Encoding UTF8 -Path (Join-Path $root ("resp_" + ($q -replace '[^A-Za-z0-9]', '_') + ".txt")) -Value $r }
    }
    $c.Close()
    Ok ("คำสั่งที่เครื่องตอบ: " + $okN + " จาก " + $qs.Count)
  } catch { Bad ("ต่อพอร์ต " + $port + " ไม่ได้: " + $_.Exception.Message); [void]$report.Add("ERR " + $_.Exception.Message) }
  $report | Set-Content -Encoding UTF8 (Join-Path $root "cmd-report.txt")
  $zip = $root + ".zip"
  try { Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zip -Force; Ok ("สร้างไฟล์ผลทดสอบแล้ว: " + $zip); Hint "ส่งไฟล์ zip นี้ให้ทีม CoreDash" } catch { Ok ("ผลทดสอบอยู่ที่: " + $root) }
  if ($env:OS -eq "Windows_NT") { try { Start-Process explorer.exe ("/select," + $zip) } catch { } }
}

# Menu 7: find which values :MEASure? can output. Only the "communication output item" selection
# (:MEASure:ITEM:POWer / :MEASure:ITEM:HARMonic) and :HEADer are changed, and all of them are put
# back to the original values at the end. Measurement, range, wiring and recording are not touched.
function Items-One([string]$h, [int]$port = 3198) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $root = Join-Path $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") }) ("PW3198-items-" + $h + "-" + $stamp)
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $log = New-Object System.Collections.ArrayList
  Say ("=== หารายการค่าที่อ่านได้ @ " + $h + ":" + $port + " ===") "Cyan"
  $c = New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout = 3000; $c.SendTimeout = 3000
  try { $c.Connect($h, $port) } catch { Bad ("ต่อพอร์ต " + $port + " ไม่ได้: " + $_.Exception.Message); return }
  $ns = $c.GetStream(); $enc = [System.Text.Encoding]::ASCII
  $send = { param($q) $m = $enc.GetBytes($q + "`r`n"); $ns.Write($m, 0, $m.Length); [void]$log.Add(">> " + $q) }
  $ask = {
    param($q, [int]$ms = 1500)
    & $send $q
    $sb = New-Object System.Text.StringBuilder; $buf = New-Object byte[] 65536; $t0 = [DateTime]::Now
    while (([DateTime]::Now - $t0).TotalMilliseconds -lt $ms) {
      if ($ns.DataAvailable) { $k = $ns.Read($buf, 0, $buf.Length); [void]$sb.Append($enc.GetString($buf, 0, $k)); if ($sb.ToString().EndsWith("`n")) { break } }
      else { Start-Sleep -Milliseconds 20 }
    }
    $r = $sb.ToString().Trim(); [void]$log.Add("<< " + $r); return $r
  }
  $esr = { $e = & $ask "*ESR?"; $v = 0; [void][int]::TryParse(($e -replace '[^0-9]', ''), [ref]$v); return $v }
  $orig = @{}
  try {
    [void](& $esr)
    $hdr0 = & $ask ":HEADer?"
    $groups = @(":MEASure:ITEM:POWer", ":MEASure:ITEM:HARMonic")
    $max = @{}
    foreach ($g in $groups) {
      $o = & $ask ($g + "?"); $orig[$g] = $o
      $n = ($o -split ",").Count; $vals = @()
      for ($i = 0; $i -lt $n; $i++) {
        $best = 0
        foreach ($cand in @(65535, 32767, 16383, 8191, 4095, 2047, 1023, 511, 255, 127, 63, 31, 15, 7, 3, 1)) {
          $arr = @(); for ($j = 0; $j -lt $n; $j++) { $arr += $(if ($j -eq $i) { $cand } else { 0 }) }
          & $send ($g + " " + ($arr -join ","))
          Start-Sleep -Milliseconds 150
          $e = & $esr; $rb = & $ask ($g + "?")
          if ($e -eq 0 -and (($rb -split ",")[$i] -replace '\s', '') -eq "$cand") { $best = $cand; break }
        }
        $vals += $best
        Say ("  " + $g + " ช่อง " + ($i + 1) + " : ค่าสูงสุดที่รับได้ = " + $best) "DarkGray"
      }
      $max[$g] = $vals
    }
    # select everything, turn headers on so every value comes back with its name
    foreach ($g in $groups) { & $send ($g + " " + ($max[$g] -join ",")); Start-Sleep -Milliseconds 150 }
    & $send ":HEADer ON"; Start-Sleep -Milliseconds 150
    foreach ($q in @(":MEASure?", ":MEASure:POWer?", ":MEASure:HARMonic?")) {
      for ($rep = 1; $rep -le 2; $rep++) {
        $r = & $ask $q 4000
        $f = Join-Path $root ("measure_" + ($q -replace '[^A-Za-z]', '') + "_" + $rep + ".txt")
        Set-Content -Encoding UTF8 -Path $f -Value $r
        Say ("  " + $q + " ครั้งที่ " + $rep + " : " + $r.Length + " ตัวอักษร  " + $(if ($r.Length -gt 80) { $r.Substring(0, 80) + "…" } else { $r })) $(if ($r.Length -gt 10) { "Green" } else { "Yellow" })
        Start-Sleep -Milliseconds 1000
      }
    }
    & $send ":HEADer OFF"; Start-Sleep -Milliseconds 150
    $r = & $ask ":MEASure?" 4000; Set-Content -Encoding UTF8 -Path (Join-Path $root "measure_noheader.txt") -Value $r
  } catch { Bad $_.Exception.Message; [void]$log.Add("ERR " + $_.Exception.Message) }
  finally {
    # put everything back exactly as it was
    try {
      foreach ($g in $orig.Keys) { & $send ($g + " " + $orig[$g]); Start-Sleep -Milliseconds 150 }
      if ($hdr0 -match "ON") { & $send ":HEADer ON" } else { & $send ":HEADer OFF" }
      Start-Sleep -Milliseconds 150
      $chk = & $ask ":MEASure:ITEM?"
      Ok ("คืนค่าเดิมแล้ว (:MEASure:ITEM? = " + $chk + ")")
    } catch { Bad ("คืนค่าเดิมไม่สำเร็จ: " + $_.Exception.Message) }
    $c.Close()
  }
  $log | Set-Content -Encoding UTF8 (Join-Path $root "items-log.txt")
  $zip = $root + ".zip"
  try { Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zip -Force; Ok ("สร้างไฟล์ผลแล้ว: " + $zip); Hint "ส่งไฟล์ zip นี้ให้ทีม CoreDash" } catch { Ok ("ผลอยู่ที่: " + $root) }
  if ($env:OS -eq "Windows_NT") { try { Start-Process explorer.exe ("/select," + $zip) } catch { } }
}

# Menu 9: find how the PW3198 outputs per-phase HARMONICS (orders 1–50, U/I/P/angles) over :MEASure:HARMonic?
# Tries a list of item selections, records which the analyser accepts and what each returns, then restores everything.
function Harm-One([string]$h, [int]$port = 3198) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmm"
  $root = Join-Path $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") }) ("PW3198-harm-" + $h + "-" + $stamp)
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $log = New-Object System.Collections.ArrayList; $rep = New-Object System.Collections.ArrayList
  Say ("=== หาค่าฮาร์มอนิกรายเฟส @ " + $h + ":" + $port + " ===") "Cyan"
  $c = New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout = 6000; $c.SendTimeout = 3000
  try { $c.Connect($h, $port) } catch { Bad ("ต่อพอร์ต " + $port + " ไม่ได้: " + $_.Exception.Message); return }
  $ns = $c.GetStream(); $enc = [System.Text.Encoding]::ASCII
  $send = { param($q) $m = $enc.GetBytes($q + "`r`n"); $ns.Write($m, 0, $m.Length); [void]$log.Add(">> " + $q); Start-Sleep -Milliseconds 120 }
  $ask = {
    param($q, [int]$ms = 2000)
    $m = $enc.GetBytes($q + "`r`n"); $ns.Write($m, 0, $m.Length); [void]$log.Add(">> " + $q)
    $sb = New-Object System.Text.StringBuilder; $buf = New-Object byte[] 262144; $t0 = [DateTime]::Now
    while (([DateTime]::Now - $t0).TotalMilliseconds -lt $ms) {
      if ($ns.DataAvailable) { $k = $ns.Read($buf, 0, $buf.Length); [void]$sb.Append($enc.GetString($buf, 0, $k)); if ($sb.ToString().EndsWith("`n")) { break }; $t0 = [DateTime]::Now.AddMilliseconds(-($ms - 800)) }
      else { Start-Sleep -Milliseconds 15 }
    }
    $r = $sb.ToString().Trim(); [void]$log.Add("<< " + $(if ($r.Length -gt 400) { $r.Substring(0, 400) + " …(" + $r.Length + ")" } else { $r })); return $r
  }
  $esr = { $e = & $ask "*ESR?"; $v = 0; [void][int]::TryParse(($e -replace '[^0-9]', ''), [ref]$v); return $v }
  $oH = $null; $oP = $null; $hdr0 = "OFF"
  try {
    [void](& $esr)
    $hdr0 = & $ask ":HEADer?"; $oH = & $ask ":MEASure:ITEM:HARMonic?"; $oP = & $ask ":MEASure:ITEM:POWer?"
    [void]$rep.Add("orig HEADer=" + $hdr0 + "  ITEM:HARMonic=" + $oH + "  ITEM:POWer=" + $oP)
    $cands = @("31,8,0,0", "31,31,0,0", "1,1,0,0", "1,31,0,0", "3,31,0,0", "7,31,0,0", "15,31,0,0", "63,31,0,0", "127,31,0,0", "255,31,0,0",
               "31,31,1,0", "31,31,0,1", "31,31,1,1", "31,31,3,3", "31,31,15,15", "31,31,255,255", "31,31,65535,65535", "31,1,0,0", "31,2,0,0", "31,4,0,0", "31,16,0,0")
    $ok = @()
    foreach ($cd in $cands) {
      & $send (":MEASure:ITEM:HARMonic " + $cd)
      $e = & $esr; $rb = & $ask ":MEASure:ITEM:HARMonic?"
      [void]$rep.Add("SET " + $cd.PadRight(20) + " ESR=" + $e + "  readback=" + $rb)
      if ($e -eq 0) { $ok += $rb }
      Write-Host ("  " + $cd.PadRight(20) + " → " + $(if ($e -eq 0) { "รับ (" + $rb + ")" } else { "ไม่รับ" })) -ForegroundColor $(if ($e -eq 0) { "Green" } else { "DarkGray" })
    }
    $ok = @($ok | Select-Object -Unique)
    & $send ":HEADer ON"; & $send ":MEASure:ITEM:POWer 0,0,0"
    $i = 0
    foreach ($sel in $ok) {
      $i++
      & $send (":MEASure:ITEM:HARMonic " + $sel)
      foreach ($q in @(":MEASure:HARMonic?", ":MEASure?")) {
        $r = & $ask $q 6000
        $f = "harm_" + $i + "_" + ($sel -replace ',', '-') + "_" + ($q -replace '[^A-Za-z]', '') + ".txt"
        Set-Content -Encoding UTF8 -Path (Join-Path $root $f) -Value $r
        $names = @(($r -split "[,;]") | ForEach-Object { ($_.Trim() -split '\s+')[0] } | Select-Object -First 12) -join " "
        [void]$rep.Add("GET " + $sel + "  " + $q + "  len=" + $r.Length + "  items=" + (($r -split "[,;]").Count) + "  first: " + $names)
        Say ("  [" + $sel + "] " + $q + " → " + $r.Length + " ตัวอักษร, " + (($r -split "[,;]").Count) + " ค่า  " + $names) $(if ($r.Length -gt 30) { "Green" } else { "Yellow" })
      }
    }
  } catch { Bad $_.Exception.Message; [void]$log.Add("ERR " + $_.Exception.Message) }
  finally {
    try {
      if ($oH) { & $send (":MEASure:ITEM:HARMonic " + $oH) }
      if ($oP) { & $send (":MEASure:ITEM:POWer " + $(if ($oP -match '^159,255,255$') { "0,0,0" } else { $oP })) }
      if ($hdr0 -match "ON") { & $send ":HEADer ON" } else { & $send ":HEADer OFF" }
      $chk = & $ask ":MEASure:ITEM?"
      Ok ("คืนค่าเดิมแล้ว (:MEASure:ITEM? = " + $chk + ")"); [void]$rep.Add("restored " + $chk)
    } catch { Bad ("คืนค่าเดิมไม่สำเร็จ: " + $_.Exception.Message) }
    $c.Close()
  }
  $rep | Set-Content -Encoding UTF8 (Join-Path $root "harm-report.txt")
  $log | Set-Content -Encoding UTF8 (Join-Path $root "harm-log.txt")
  $zip = $root + ".zip"
  try { Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zip -Force; Ok ("สร้างไฟล์ผลแล้ว: " + $zip); Hint "ส่งไฟล์ zip นี้ให้ทีม CoreDash" } catch { Ok ("ผลอยู่ที่: " + $root) }
  if ($env:OS -eq "Windows_NT") { try { Start-Process explorer.exe ("/select," + $zip) } catch { } }
}

# ---------------------------------------------------------------- power-quality alarms (same rules as app/pq-alarms.js)
# Rules: pq-alarm-rules.json next to this script. Push to phones: ntfy (free app, Android/iOS) — -Ntfy <secret-topic>.
$script:AL = @{ rules = $null; unom = 230.0; comm = 10; state = @{}; log = (New-Object System.Collections.ArrayList); lastU = @{}; lastSeen = @{}; seq = 0; push = @{} }
function Al-Load {
  $f = Join-Path $PSScriptRoot "pq-alarm-rules.json"
  if (-not (Test-Path $f)) { Hint "ไม่พบ pq-alarm-rules.json — ปิดการแจ้งเตือน"; return }
  $j = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $script:AL.rules = @($j.rules); $script:AL.comm = [int]$j.comm.after
  $script:AL.unom = $(if ($Unom -gt 0) { [double]$Unom } else { [double]$j.unom })
}
function Al-Num($v, $k) { $x = 0.0; if ($v.ContainsKey($k) -and [double]::TryParse($v[$k], [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$x) -and [math]::Abs($x) -lt 9e37) { return $x }; return $null }
function Al-Metrics($v) {
  $un = $script:AL.unom
  $U = @(1..3 | ForEach-Object { Al-Num $v ("U" + $_ + "rms") } | Where-Object { $null -ne $_ })
  $I = @(1..3 | ForEach-Object { Al-Num $v ("I" + $_ + "rms") } | Where-Object { $null -ne $_ })
  $pk = @(1..3 | ForEach-Object { Al-Num $v ("U" + $_ + "pk+"); Al-Num $v ("U" + $_ + "pk-") } | Where-Object { $null -ne $_ } | ForEach-Object { [math]::Abs($_) })
  $mx = { param($a) if ($a.Count) { ($a | Measure-Object -Maximum).Maximum } else { $null } }
  $ph = { param($fmt) @(1..3 | ForEach-Object { Al-Num $v ($fmt -f $_) } | Where-Object { $null -ne $_ }) }
  $Iavg = $(if ($I.Count) { ($I | Measure-Object -Average).Average } else { $null })
  # THD-I = 0 with a huge K-factor = current far below the clamp range: K-factor is not valid then
  $kf = @(1..3 | Where-Object { (Al-Num $v ("I" + $_ + "rms")) -gt 0 -and -not ((Al-Num $v ("I" + $_ + "thd-F")) -eq 0 -and (Al-Num $v ("KF" + $_)) -gt 20) } | ForEach-Object { Al-Num $v ("KF" + $_) } | Where-Object { $null -ne $_ })
  $hf = & $ph "U{0}harmH"
  $IN = Al-Num $v "I4rms"; $F = Al-Num $v "Freq"; $PF = Al-Num $v "PFsum"
  return @{
    Umin_pct = $(if ($U.Count) { ($U | Measure-Object -Minimum).Minimum / $un * 100 } else { $null })
    Umax_pct = $(if ($U.Count) { ($U | Measure-Object -Maximum).Maximum / $un * 100 } else { $null })
    Upk_pu = $(if ($pk.Count) { (& $mx $pk) / ([math]::Sqrt(2) * $un) } else { $null })
    THDU = & $mx (& $ph "U{0}thd-F"); THDI = & $mx (& $ph "I{0}thd-F")
    HFU_pct = $(if ($hf.Count) { (& $mx $hf) / $un * 100 } else { $null })
    Uunb = Al-Num $v "Uunb"; Fdev = $(if ($null -ne $F) { [math]::Abs($F - 50) } else { $null })
    PF = $(if ($null -ne $PF) { [math]::Abs($PF) } else { $null })
    IN_pct = $(if ($null -ne $IN -and $Iavg) { $IN / $Iavg * 100 } else { $null })
    KF = & $mx $kf; Iavg = $Iavg; Umax = $(if ($U.Count) { ($U | Measure-Object -Maximum).Maximum } else { $null })
  }
}
function Al-Crossed($op, $v, $lim) { if ($null -eq $lim -or $null -eq $v) { return $false }; if ($op -eq ">") { return $v -gt $lim } else { return $v -lt $lim } }
function Al-Open($r, $d, $sev, $v, $start) {
  $script:AL.seq++
  $ev = [ordered]@{ id = ("AL" + $script:AL.seq + "-" + $start); rule = $r.id; dev = $d.id; devName = ("#" + $d.no + " " + $d.name); host = $d.h; sev = $sev; th = $r.th; en = $r.en
    value = $v; worst = $v; lastBad = $start; limit = $(if ($sev -eq "alarm") { $r.alarm } else { $r.warn }); op = $r.op; unit = $r.unit; std = $r.std; why = $r.why; act = $r.act; kind = $r.kind; start = $start; end = $null }
  [void]$script:AL.log.Insert(0, $ev); if ($script:AL.log.Count -gt 300) { $script:AL.log.RemoveAt(300) }
  Al-Notify $ev "raise"; return $ev
}
function Al-Close($ev, $ts) { $ev.end = [math]::Min($ts, $ev.lastBad + 1000); Al-Notify $ev "clear" }
function Al-Fmt($x) { if ($null -eq $x) { "—" } elseif ([math]::Abs($x) -ge 100) { ([double]$x).ToString("0", [System.Globalization.CultureInfo]::InvariantCulture) } elseif ([math]::Abs($x) -ge 10) { ([double]$x).ToString("0.0", [System.Globalization.CultureInfo]::InvariantCulture) } else { ([double]$x).ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture) } }
function Al-Notify($ev, $kind) {
  $sevTh = $(if ($kind -eq "clear") { "กลับสู่ปกติ" } elseif ($ev.sev -eq "alarm") { "แจ้งเตือน" } else { "เฝ้าระวัง" })
  $icon = $(if ($kind -eq "clear") { "✅" } elseif ($ev.sev -eq "alarm") { "🔴" } else { "🟡" })
  $title = $icon + " " + $sevTh + ": " + $ev.th + " · " + $ev.devName + $(if ($ev.host) { " (" + $ev.host + ")" } else { "" })
  $body = "ค่า " + (Al-Fmt $ev.worst) + " " + $ev.unit + " (" + $ev.op + " " + (Al-Fmt $ev.limit) + ")"
  if ($kind -eq "clear") { $body += " · นาน " + [math]::Round(($ev.end - $ev.start) / 1000) + " วินาที" }
  if ($ev.rule -eq "comm" -and $ev.why) { $body = "IP " + $ev.host + " · " + $ev.why.th }
  if ($ev.std) { $body += "`n" + $ev.std }
  if ($kind -ne "clear" -and $ev.act) { $body += "`n→ " + $ev.act.th }
  Write-Host ("  " + (Get-Date -Format "HH:mm:ss") + "  " + $title) -ForegroundColor $(if ($kind -eq "clear") { "Green" } elseif ($ev.sev -eq "alarm") { "Red" } else { "Yellow" })
  try { Add-Content -Encoding UTF8 -Path (Join-Path $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") }) ("PW3198-alarms-" + (Get-Date -Format "yyyyMMdd") + ".csv")) -Value ((Get-Date -Format "yyyy-MM-dd,HH:mm:ss") + "," + $kind + "," + $ev.sev + "," + $ev.dev + "," + $ev.host + "," + $ev.rule + "," + (Al-Fmt $ev.worst) + "," + (Al-Fmt $ev.limit) + ",""" + $ev.th + """") } catch {}
  # phone push: alarms always; "watch" level only with -PushWarn; at most one push per rule+instrument per 10 min (clears always go)
  if (-not $Ntfy) { return }
  if ($kind -ne "clear" -and $ev.sev -ne "alarm" -and -not $PushWarn) { return }
  $key = $ev.dev + "|" + $ev.rule; $now = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  if ($kind -ne "clear" -and $script:AL.push.ContainsKey($key) -and ($now - $script:AL.push[$key]) -lt 600000) { return }
  if ($kind -eq "clear" -and -not $script:AL.push.ContainsKey($key)) { return }
  if ($kind -ne "clear") { $script:AL.push[$key] = $now }
  $msg = @{ topic = $Ntfy; title = $title; message = $body; priority = $(if ($kind -eq "clear") { 2 } elseif ($ev.sev -eq "alarm") { 5 } else { 3 }); tags = @("zap") }
  if ($AppUrl) { $msg.click = $AppUrl.TrimEnd('#') + "#pq" }
  try { Invoke-RestMethod -Method Post -Uri $NtfyServer -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress $msg))) -TimeoutSec 5 | Out-Null }
  catch { Hint ("ส่งแจ้งเตือนเข้ามือถือไม่ได้ (ต้องมีอินเทอร์เน็ต): " + $_.Exception.Message) }
}
function Al-Feed($d, $v, [long]$ts) {
  if (-not $script:AL.rules) { return }
  $m = Al-Metrics $v
  $script:AL.lastSeen[$d.id] = $ts
  $cs = $script:AL.state[$d.id + "|comm"]; if ($cs -and $cs.ev) { Al-Close $cs.ev $ts; $cs.ev = $null }
  if ($null -ne $m.Umax -and $m.Umax -gt 0.5 * $script:AL.unom) { $script:AL.lastU[$d.id] = $ts }
  $hadU = $script:AL.lastU.ContainsKey($d.id) -and ($ts - $script:AL.lastU[$d.id]) -lt 600000
  foreach ($r in $script:AL.rules) {
    $key = $d.id + "|" + $r.id
    if (-not $script:AL.state.ContainsKey($key)) { $script:AL.state[$key] = @{ since = $null; okSince = $null; ev = $null } }
    $s = $script:AL.state[$key]
    $v2 = $m[$r.metric]
    if ($r.needU -and -not $hadU) { $v2 = $null }
    if ($r.minI -and -not ($m.Iavg -ge $r.minI)) { $v2 = $null }
    $lvl = $(if (Al-Crossed $r.op $v2 $r.alarm) { "alarm" } elseif (Al-Crossed $r.op $v2 $r.warn) { "warn" } else { $null })
    if ($lvl) {
      $s.okSince = $null
      if ($null -eq $s.since) { $s.since = $ts }
      if (-not $s.ev -and ($ts - $s.since) -ge $r.dur * 1000) { $s.ev = Al-Open $r $d $lvl $v2 $s.since }
      elseif ($s.ev) {
        $worse = $(if ($r.op -eq ">") { $v2 -gt $s.ev.worst } else { $v2 -lt $s.ev.worst }); if ($worse) { $s.ev.worst = $v2 }
        if ($lvl -eq "alarm" -and $s.ev.sev -eq "warn") { $s.ev.sev = "alarm"; $s.ev.limit = $r.alarm; Al-Notify $s.ev "escalate" }
        $s.ev.value = $v2
      }
      if ($s.ev) { $s.ev.lastBad = $ts }
    } else {
      $s.since = $null
      if ($s.ev) { if ($null -eq $s.okSince) { $s.okSince = $ts }; if (($ts - $s.okSince) -ge $r.clr * 1000) { Al-Close $s.ev $ts; $s.ev = $null; $s.okSince = $null } }
    }
  }
}
function Al-Offline($d, [long]$ts, [long]$since = 0) {
  if (-not $script:AL.rules) { return }
  if (-not $script:AL.lastSeen.ContainsKey($d.id)) { if (-not $since) { return }; $script:AL.lastSeen[$d.id] = $since }
  $key = $d.id + "|comm"; if (-not $script:AL.state.ContainsKey($key)) { $script:AL.state[$key] = @{ ev = $null } }
  $s = $script:AL.state[$key]; $last = $script:AL.lastSeen[$d.id]
  if (-not $s.ev -and ($ts - $last) -ge $script:AL.comm * 1000) {
    $r = [pscustomobject]@{ id = "comm"; th = "ขาดการเชื่อมต่อเครื่องวัด"; en = "Lost connection to the analyser"; op = ">"; unit = "s"; std = ""; alarm = $script:AL.comm; warn = $null; kind = $null
      why = @{ th = "สาย LAN หลุด เครื่องวัดปิด/ดับ IP เปลี่ยน"; en = "LAN cable unplugged, analyser off, IP changed" }; act = @{ th = "ตรวจสาย LAN ไฟเลี้ยงเครื่องวัด และ IP"; en = "Check the LAN cable, the analyser power and its IP" } }
    $r.why = @{ th = $d.err; en = $d.err }
    $s.ev = Al-Open $r $d "alarm" ([math]::Round(($ts - $last) / 1000)) $last
  }
}
function Al-Itic {
  @($script:AL.log | Where-Object { $_.kind } | ForEach-Object {
    $end = $(if ($null -ne $_.end) { $_.end } else { [DateTimeOffset]::Now.ToUnixTimeMilliseconds() })
    @{ id = $_.id; ts = $_.start; kind = $_.kind; th = $_.th; en = $_.en; ch = "U"; inst = $_.dev; mag = $(if ($_.kind -eq "tran") { $_.worst } else { $_.worst / 100 }); ms = [math]::Max(1000, $end - $_.start); live = $true }
  })
}

# Menu 8: LIVE values → CoreDash web app, every second, without installing anything.
#   PW3198 (TCP 3198)  ──  this tool  ──  http://127.0.0.1:<port>/api/pq  ──  web app "คุณภาพไฟ" (#pq?live=…)
# Verified command set: ":HEADer ON", ":MEASure:ITEM:POWer 159,255,255", then ":MEASure?" each second.
# The original item/header settings are put back when the tool stops. Every reading is also saved to a CSV.
# plain-language reason for a failed connection
function Net-Reason([string]$m, [string]$h, [int]$port, [bool]$probe = $true) {
  if ($m -match 'refused|ปฏิเสธ') { return ("พอร์ต " + $port + " ไม่รับการเชื่อมต่อ — มีโปรแกรมอื่นต่อเครื่องนี้อยู่ (หน้าต่าง LIVE อีกหน้าต่าง / PQ ONE / เมนู 6-9) หรือเครื่องวัดเพิ่งเปิด: ปิดโปรแกรมอื่นแล้วรอสักครู่") }
  if ($m -match 'timeout|timed out|did not properly respond|ไม่ตอบ') {
    if (-not $probe) { return "" }
    if (Test-Ping $h) { return ("Ping ได้ แต่พอร์ต " + $port + " ไม่ตอบ — มีการเชื่อมต่อเก่าค้างในเครื่องวัด: ปิด-เปิดเครื่องวัด 1 ครั้ง") }
    return "ไม่ตอบ (Ping ไม่ได้) — เครื่องวัดปิดอยู่ / สาย LAN หลุด / IP ไม่ถูกต้อง"
  }
  if ($m -match 'unreachable|No route|network') { return "เข้าถึงเครือข่ายไม่ได้ — ตรวจสาย LAN และวง IP ของโน้ตบุ๊ก" }
  if ($m -match 'ตอบไม่ครบ|unexpected') { return "เครื่องตอบไม่ครบ — กำลังลองตั้งค่าใหม่" }
  return $m
}
# autostart: run the live bridge minimised whenever this Windows user signs in, so the web app can
# connect / reconnect / change IPs by itself — no more double-clicking .bat files
function AutoStart-Path { Join-Path ([Environment]::GetFolderPath("Startup")) "CoreDash PW3198 Live.lnk" }
function Test-AutoStart { try { return (Test-Path (AutoStart-Path)) } catch { return $false } }
function Install-AutoStart {
  if ($env:OS -ne "Windows_NT") { Bad "ใช้ได้บน Windows เท่านั้น"; return }
  $ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut((AutoStart-Path))
  $lnk.TargetPath = (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe")
  $lnk.Arguments = '-NoProfile -WindowStyle Minimized -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Live -NoBrowser'
  $lnk.WorkingDirectory = $PSScriptRoot; $lnk.WindowStyle = 7; $lnk.Description = "CoreDash PW3198 live bridge"; $lnk.Save()
  Ok "ตั้งให้เปิดอัตโนมัติทุกครั้งที่เปิดเครื่อง/ล็อกอิน Windows แล้ว (ย่อหน้าต่างไว้ที่ทาสก์บาร์)"
  Hint "จากนี้เปิดเว็บแอป → คุณภาพไฟ → ข้อมูลจริง ได้เลย กด 🔄 / ⚙ บนเว็บเพื่อเชื่อมต่อใหม่หรือเปลี่ยน IP"
}
function Remove-AutoStart { try { Remove-Item (AutoStart-Path) -ErrorAction Stop; Ok "ยกเลิกการเปิดอัตโนมัติแล้ว" } catch { Hint "ยังไม่ได้ตั้งเปิดอัตโนมัติ" } }

# last instrument IPs (used by the autostart copy and when the web app changes them)
function Save-Ips([string[]]$l) { try { Set-Content -Encoding UTF8 -Path (Join-Path $PSScriptRoot "live-ips.txt") -Value (($l | ForEach-Object { if ($_) { $_ } else { "-" } }) -join ",") } catch {} }
function Load-Ips { try { $f = Join-Path $PSScriptRoot "live-ips.txt"; if (Test-Path $f) { return @((Get-Content -Encoding UTF8 $f | Select-Object -First 1) -split "[,\s]+" | Where-Object { $_ }) } } catch {}; return @() }
# restore the analyser's own output settings and close (used when the web app changes the IPs)
function Bridge-Release($d, $ask) {
  try {
    if ($d.ns) {
      if ($d.orig) { [void](& $ask $d (":MEASure:ITEM:POWer " + $d.orig)) }
      if ($d.hdr -match "ON") { [void](& $ask $d ":HEADer ON") } else { [void](& $ask $d ":HEADer OFF") }
    }
  } catch {}
  try { if ($d.c) { $d.c.Close() } } catch {}
  $d.c = $null; $d.ns = $null; $d.pend = $null
}
function Live-Bridge([string[]]$hosts, [int]$port = 3198) {
  $t0bridge = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  Al-Load
  if ($script:AL.rules) { Ok ("เปิดการวิเคราะห์แจ้งเตือน " + $script:AL.rules.Count + " เงื่อนไข (Udin " + $script:AL.unom + " V)" + $(if ($Ntfy) { " · ส่งเข้ามือถือผ่าน ntfy หัวข้อ " + $Ntfy } else { " · ยังไม่ได้ตั้งส่งเข้ามือถือ (-Ntfy)" })) }
  $roles = @(@{ id = "PQ-MAIN"; no = 2; role = "grid"; name = "MAIN GRID" }, @{ id = "PQ-LOAD"; no = 3; role = "load"; name = "LOAD" }, @{ id = "PQ-APF"; no = 6; role = "apf"; name = "APF" })
  $enc = [System.Text.Encoding]::ASCII
  $desk = $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") })
  $mkDevs = {
    param([string[]]$hl)
    $out = @()
    for ($k = 0; $k -lt [math]::Min(3, $hl.Count); $k++) {
      $r = $roles[$k]; if (-not $hl[$k] -or $hl[$k] -eq "-") { continue }
      $out += [pscustomobject]@{ h = $hl[$k]; id = $r.id; no = $r.no; role = $r.role; name = $r.name; c = $null; ns = $null; orig = $null; hdr = "OFF"; last = ""; ts = 0; online = $false; err = ""; retry = 0; shown = $null; pend = $null; pendT = $null; csv = (Join-Path $desk ("PW3198-live-" + $hl[$k] + "-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".csv")); csvHead = $false; n = 0 }
    }
    return ,$out
  }
  $devs = & $mkDevs $hosts
  Save-Ips $hosts
  $ask = {
    param($d, $q, [int]$ms = 2500)
    $m = $enc.GetBytes($q + "`r`n"); $d.ns.Write($m, 0, $m.Length)
    if (-not $q.Contains("?")) { Start-Sleep -Milliseconds 80; return "" }
    $sb = New-Object System.Text.StringBuilder; $buf = New-Object byte[] 65536; $t0 = [DateTime]::Now
    while (([DateTime]::Now - $t0).TotalMilliseconds -lt $ms) {
      if ($d.ns.DataAvailable) { $k = $d.ns.Read($buf, 0, $buf.Length); [void]$sb.Append($enc.GetString($buf, 0, $k)); if ($sb.ToString().EndsWith("`n")) { break } }
      else { Start-Sleep -Milliseconds 10 }
    }
    return $sb.ToString().Trim()
  }
  # non-blocking connect: returns $true (connected), $false (failed) or $null (still trying) — one slow
  # instrument never freezes the others
  $open = {
    param($d, [int]$wait = 0)
    try {
      if (-not $d.pend) {
        $d.c = New-Object System.Net.Sockets.TcpClient; $d.c.ReceiveTimeout = 3000; $d.c.SendTimeout = 3000
        $d.pend = $d.c.BeginConnect($d.h, $port, $null, $null); $d.pendT = [DateTime]::Now
      }
      $left = 4000 - ([DateTime]::Now - $d.pendT).TotalMilliseconds
      if (-not $d.pend.IsCompleted -and $wait -gt 0 -and $left -gt 0) { [void]$d.pend.AsyncWaitHandle.WaitOne([int][math]::Min($wait, $left)) }
      if (-not $d.pend.IsCompleted) { if (([DateTime]::Now - $d.pendT).TotalMilliseconds -ge 4000) { throw "timeout" } else { return $null } }
      $ar = $d.pend; $d.pend = $null
      $d.c.EndConnect($ar); $d.ns = $d.c.GetStream()
      if ($null -eq $d.orig) {
        $d.orig = & $ask $d ":MEASure:ITEM:POWer?"; $d.hdr = & $ask $d ":HEADer?"
        # left over from a run that was closed with the X button → restore to the instrument's original values instead
        if ($d.orig -match '^159,255,255$') { $d.orig = "0,0,0"; $d.hdr = "OFF" }
      }
      [void](& $ask $d ":HEADer ON"); [void](& $ask $d ":MEASure:ITEM:POWer 159,255,255")
      $d.err = ""; return $true
    } catch { $d.pend = $null; $nr = Net-Reason $_.Exception.Message $d.h $port ($d.shown -ne $false); if ($nr) { $d.err = $nr }; $d.online = $false; try { $d.c.Close() } catch {}; $d.c = $null; $d.ns = $null; $d.retry = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + 5000; return $false }
  }
  # print only when an instrument changes state, so the window stays readable
  $state = {
    param($d, [bool]$up)
    if ($d.shown -eq $up) { return }
    $d.shown = $up
    if ($up) { Ok ("#" + $d.no + " " + $d.name + "  " + $d.h + "  ติดต่อได้ — กำลังส่งค่าสด") }
    else { Bad ("#" + $d.no + " " + $d.name + "  " + $d.h + "  ติดต่อไม่ได้: " + $d.err); Hint "จะลองต่อใหม่ทุก 5 วินาที · เครื่องอื่นยังส่งค่าตามปกติ" }
  }
  foreach ($d in $devs) { [void](& $open $d 0) }          # start all connections at once
  foreach ($d in $devs) { $r = & $open $d 4000; & $state $d ([bool]$r) }
  $listener = $null
  foreach ($p in $SendPort..($SendPort + 9)) {
    try { $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p); $listener.Start(); $lport = $p; break } catch { $listener = $null }
  }
  if (-not $listener) { Bad "เปิดพอร์ตส่งข้อมูลไม่ได้"; return }
  $url = $AppUrl.TrimEnd('#') + "#pq?live=http://127.0.0.1:" + $lport + "&host=" + ($hosts -join ",")
  Ok ("กำลังส่งค่าสดเข้าเว็บแอป (127.0.0.1:" + $lport + ") ทุก 1 วินาที")
  Hint "เบราว์เซอร์จะเปิดแอป CoreDash ที่หน้า คุณภาพไฟ → เกตเวย์ LAN"
  Hint "ถ้าเบราว์เซอร์ถาม 'อนุญาตให้เข้าถึงอุปกรณ์ในเครือข่ายภายใน' ให้กด อนุญาต"
  Hint ("ทุกค่าบันทึกลง CSV บน Desktop ด้วย: " + (Split-Path $devs[0].csv -Leaf))
  if (-not $NoBrowser) { Start-Process $url }
  Say "เปิดหน้าต่างนี้ไว้ตลอดเวลาที่ดูค่าสด · กด Enter เพื่อหยุด" "Yellow"
  $until = $(if ($LiveMinutes -gt 0) { (Get-Date).AddMinutes($LiveMinutes) } else { [DateTime]::MaxValue })
  $next = Get-Date
  $cors = "Access-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nAccess-Control-Allow-Private-Network: true`r`nCache-Control: no-store`r`nConnection: close`r`n"
  # control requests (reconnect / change IPs) are accepted only from the CoreDash web app itself
  $appOrigin = $(try { ([uri]$AppUrl).GetLeftPart([System.UriPartial]::Authority) } catch { "" })
  $started = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  try {
    while ((Get-Date) -lt $until) {
      try { if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq "Enter") { break } } catch {}
      if ((Get-Date) -ge $next) {
        $next = (Get-Date).AddMilliseconds(1000)
        foreach ($d in $devs) {
          $nowMs = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
          if (-not $d.ns) {
            if (-not $d.pend -and $d.retry -and $nowMs -lt $d.retry) { Al-Offline $d $nowMs $t0bridge; continue }
            $r = & $open $d 0
            if ($null -eq $r) { Al-Offline $d $nowMs $t0bridge; continue }
            if (-not $r) { & $state $d $false; Al-Offline $d $nowMs $t0bridge; continue }
          }
          try {
            $line = & $ask $d ":MEASure?"
            if ($line -notmatch "Freq") { throw ("ตอบไม่ครบ: " + $line) }
            $d.last = $line; $d.ts = [long]([DateTimeOffset]::Now.ToUnixTimeMilliseconds()); $d.online = $true; $d.n++
            $pairs = @($line -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\S+\s+\S+$' })
            $v = @{}; foreach ($p in $pairs) { $a = $p -split '\s+'; $v[$a[0]] = $a[1] }
            Al-Feed $d $v $d.ts
            $num = { param($k) $x = 0.0; if ($v.ContainsKey($k) -and [double]::TryParse($v[$k], [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$x) -and [math]::Abs($x) -lt 9e37) { $x } else { $null } }
            $txt = { param($x, [string]$f = "0.###") if ($null -eq $x) { "" } else { $x.ToString($f, [System.Globalization.CultureInfo]::InvariantCulture) } }
            $Ps = & $num "Psum"; $Qs = & $num "Qsum"; $Ss = & $num "Ssum"; $PFs = & $num "PFsum"
            $Is = @(1, 2, 3 | ForEach-Object { & $num ("I" + $_ + "rms") } | Where-Object { $null -ne $_ })
            $Ts = @(1, 2, 3 | ForEach-Object { & $num ("I" + $_ + "thd-F") } | Where-Object { $null -ne $_ })
            $Us = @(1, 2, 3 | ForEach-Object { & $num ("U" + $_ + "thd-F") } | Where-Object { $null -ne $_ })
            $sum = @(
              (& $txt $(if ($null -ne $Ps) { $Ps / 1000 }) "0.000"), (& $txt $(if ($null -ne $Qs) { $Qs / 1000 }) "0.000"), (& $txt $(if ($null -ne $Ss) { $Ss / 1000 }) "0.000"),
              (& $txt $(if ($null -ne $PFs) { [math]::Abs($PFs) }) "0.0000"),
              (& $txt $(if ($Is.Count) { ($Is | Measure-Object -Average).Average }) "0.0"),
              (& $txt $(if ($Ts.Count) { ($Ts | Measure-Object -Maximum).Maximum }) "0.00"),
              (& $txt $(if ($Us.Count) { ($Us | Measure-Object -Maximum).Maximum }) "0.00"),
              (& $txt (& $num "U1rms") "0.00"), (& $txt (& $num "Freq") "0.000"))
            # first columns: summary in kW/kvar/kVA (what the Pilot tab reads), then every raw value from the analyser (SI units)
            if (-not $d.csvHead) { Set-Content -Encoding UTF8 -Path $d.csv -Value ("Date,Time,P_sum[kW],Q_sum[kvar],S_sum[kVA],PF_sum,I_avg[A],Ithd_max[%],Uthd_max[%],U1[V],Freq[Hz]," + (($pairs | ForEach-Object { "raw_" + ($_ -split '\s+')[0] }) -join ",")); $d.csvHead = $true }
            Add-Content -Encoding UTF8 -Path $d.csv -Value ((Get-Date -Format "yyyy-MM-dd,HH:mm:ss") + "," + ($sum -join ",") + "," + (($pairs | ForEach-Object { $r = ($_ -split '\s+')[1]; if ($r -match '9999\.9E\+99') { "" } else { $r } }) -join ","))
            if ($d.n % 10 -eq 1) {
              Say ("  " + (Get-Date -Format "HH:mm:ss") + "  #" + $d.no + "  U1 " + $sum[7] + " V   I " + $sum[4] + " A   P " + $sum[0] + " kW   PF " + $sum[3] + "   THD-I " + $sum[5] + " %   f " + $sum[8] + " Hz") "Green"
            }
            & $state $d $true
          } catch { $d.online = $false; $nr = Net-Reason $_.Exception.Message $d.h $port ($d.shown -ne $false); if ($nr) { $d.err = $nr }; & $state $d $false; try { $d.c.Close() } catch {}; $d.c = $null; $d.ns = $null; $d.retry = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + 2000 }
          if (-not $d.online) { Al-Offline $d ([DateTimeOffset]::Now.ToUnixTimeMilliseconds()) $t0bridge }
        }
      }
      if (-not $listener.Pending()) { Start-Sleep -Milliseconds 30; continue }
      $c = $listener.AcceptTcpClient(); $c.ReceiveTimeout = 3000
      try {
        $ns = $c.GetStream(); $rd = New-Object System.IO.StreamReader($ns, [System.Text.Encoding]::ASCII, $false, 4096, $true)
        $req = $rd.ReadLine(); $origin = ""
        while (($hl = $rd.ReadLine()) -ne $null -and $hl -ne "") { if ($hl -match '^Origin:\s*(.+)$') { $origin = $matches[1].Trim() } }
        $parts = "$req" -split " "; $method = $parts[0]; $full = $(if ($parts.Count -gt 1) { $parts[1] } else { "/" }); $path = ($full -split '\?')[0]
        $qs = @{}; if ($full.Contains("?")) { foreach ($kv in ($full.Split("?", 2)[1] -split "&")) { $a = $kv.Split("=", 2); if ($a.Count -eq 2) { $qs[$a[0]] = [uri]::UnescapeDataString($a[1]) } } }
        $okOrigin = (-not $origin) -or $origin -eq $appOrigin -or $origin -match '^https?://(127\.0\.0\.1|localhost)(:\d+)?$'
        $json = { param($o) return [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Depth 4 -Compress $o)) }
        if ($method -eq "OPTIONS") { $body = [byte[]]@(); $head = "HTTP/1.1 204 No Content`r`n" + $cors + "`r`n" }
        elseif ($method -eq "POST" -and -not $okOrigin) { $body = & $json @{ ok = $false; error = "origin not allowed" }; $head = "HTTP/1.1 403 Forbidden`r`nContent-Type: application/json`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n" }
        elseif ($method -eq "POST" -and $path -eq "/api/reconnect") {
          $n = 0
          foreach ($d in $devs) { if (-not $qs.id -or $qs.id -eq $d.id) { if (-not $d.online) { try { if ($d.c) { $d.c.Close() } } catch {}; $d.c = $null; $d.ns = $null; $d.pend = $null }; $d.retry = 0; $n++ } }
          Say ("  " + (Get-Date -Format "HH:mm:ss") + "  เว็บแอปสั่งเชื่อมต่อใหม่ (" + $(if ($qs.id) { $qs.id } else { "ทุกเครื่อง" }) + ")") "Cyan"
          $body = & $json @{ ok = $true; count = $n }; $head = "HTTP/1.1 200 OK`r`nContent-Type: application/json`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n"
        }
        elseif ($method -eq "POST" -and $path -eq "/api/devices") {
          $new = @(("" + $qs.ips) -split "," | ForEach-Object { $_.Trim() })
          $bad = @($new | Where-Object { $_ -and $_ -ne "-" -and $_ -notmatch '^\d{1,3}(\.\d{1,3}){3}$' })
          if ($bad.Count -or -not ($new | Where-Object { $_ -and $_ -ne "-" })) { $body = & $json @{ ok = $false; error = "bad ip" }; $head = "HTTP/1.1 400 Bad Request`r`nContent-Type: application/json`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n" }
          else {
            foreach ($d in $devs) { Bridge-Release $d $ask }
            $hosts = $new; $devs = & $mkDevs $new; Save-Ips $new
            Say ("  " + (Get-Date -Format "HH:mm:ss") + "  เว็บแอปเปลี่ยน IP เครื่องวัดเป็น " + ($new -join ", ")) "Cyan"
            foreach ($d in $devs) { [void](& $open $d 0) }
            $body = & $json @{ ok = $true; ips = $new }; $head = "HTTP/1.1 200 OK`r`nContent-Type: application/json`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n"
          }
        }
        elseif ($path -eq "/api/pq") {
          $inst = @(); foreach ($r in $roles) {
            $d = $devs | Where-Object { $_.id -eq $r.id } | Select-Object -First 1
            if ($d) { $inst += @{ id = $d.id; no = $d.no; role = $d.role; name = $d.name; host = $d.h; online = ($d.online -and ([DateTimeOffset]::Now.ToUnixTimeMilliseconds() - $d.ts) -lt 5000); ts = $d.ts; raw = $d.last; error = $d.err; remoteScreen = ("http://" + $d.h + "/") } }
            else { $inst += @{ id = $r.id; no = $r.no; role = $r.role; name = $r.name; host = $null; online = $false } }
          }
          $alog = @($script:AL.log | Select-Object -First 150)
          $ipl = @($roles | ForEach-Object { $id = $_.id; $x = $devs | Where-Object { $_.id -eq $id } | Select-Object -First 1; if ($x) { $x.h } else { "" } })
          $body = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Depth 6 -Compress @{ mode = "live"; source = "pw3198-bridge"; apf = $null; events = @(Al-Itic); alarms = @{ unom = $script:AL.unom; push = [bool]$Ntfy; log = $alog; topic = $(if ($Ntfy -and $origin -and $okOrigin) { $Ntfy } else { $null }); server = $NtfyServer }; instruments = $inst; bridge = @{ control = $true; ips = $ipl; started = $started; autostart = (Test-AutoStart) } }))
          $head = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n"
        }
        else { $body = [System.Text.Encoding]::UTF8.GetBytes("CoreDash PW3198 live bridge"); $head = "HTTP/1.1 404 Not Found`r`nContent-Length: " + $body.Length + "`r`n" + $cors + "`r`n" }
        $hb = [System.Text.Encoding]::ASCII.GetBytes($head); $ns.Write($hb, 0, $hb.Length); if ($body.Length) { $ns.Write($body, 0, $body.Length) }; $ns.Flush()
      } catch {} finally { $c.Close() }
    }
  } finally {
    $listener.Stop()
    foreach ($d in $devs) {
      try {
        if (-not $d.ns) { $d.pend = $null; [void](& $open $d 4000) }
        if ($d.ns) {
          if ($d.orig) { [void](& $ask $d (":MEASure:ITEM:POWer " + $d.orig)) }
          if ($d.hdr -match "ON") { [void](& $ask $d ":HEADer ON") } else { [void](& $ask $d ":HEADer OFF") }
          $d.c.Close()
        }
        if ($d.n -gt 0) { Ok ($d.h + ": หยุดส่งค่าสด คืนค่าตั้งเดิมแล้ว · บันทึก " + $d.n + " แถวใน " + $d.csv) } else { Hint ($d.h + ": ติดต่อไม่ได้ตลอดการทำงาน — ไม่มีข้อมูลบันทึก") }
      } catch { Bad ($d.h + ": คืนค่าเดิมไม่สำเร็จ " + $_.Exception.Message) }
    }
  }
}

# ---------------------------------------------------------------- main
Say "CoreDash Nexus · PW3198 LAN Tool" "Yellow"
if ($Send -and -not $Ip) { Send-Folder; return }
# phone push topic: -Ntfy, else ntfy-topic.txt next to this script (created with a random secret name on first run)
if (-not $Ntfy -and ($Live -or $TestPush -or -not $Ip)) {
  $tf = Join-Path $PSScriptRoot "ntfy-topic.txt"
  try {
    if (-not (Test-Path $tf)) {
      $rnd = -join ((48..57) + (97..122) | Get-Random -Count 14 | ForEach-Object { [char]$_ })
      Set-Content -Encoding UTF8 -Path $tf -Value @(("coredash-" + $rnd), "# หัวข้อ (topic) ลับสำหรับแจ้งเตือนเข้ามือถือผ่านแอป ntfy — ใครรู้ชื่อนี้จะเห็นการแจ้งเตือน อย่าเผยแพร่", "# ลบไฟล์นี้ = ปิดการส่งเข้ามือถือ (จะสร้างหัวข้อใหม่เมื่อรันครั้งถัดไป)")
    }
    $Ntfy = (Get-Content -Encoding UTF8 $tf | Where-Object { $_ -and -not $_.StartsWith("#") } | Select-Object -First 1).Trim()
  } catch {}
}
if ($Ntfy -and ($Live -or $TestPush)) {
  Say ("📱 แจ้งเตือนเข้ามือถือ: ติดตั้งแอป ntfy (Play Store / App Store) → กด + → Subscribe to topic → ใส่  " + $Ntfy) "Cyan"
}
if ($TestPush) {
  if (-not $Ntfy) { Bad "ใส่ชื่อหัวข้อ ntfy ด้วย เช่น -Ntfy coredash-xxxx"; return }
  Al-Notify ([ordered]@{ dev = "TEST"; devName = "ทดสอบ"; host = ""; rule = "test"; sev = "alarm"; th = "ทดสอบการแจ้งเตือน CoreDash"; en = "CoreDash test"; worst = 1; limit = 1; op = ">"; unit = ""; std = "ถ้าเห็นข้อความนี้บนมือถือ แปลว่าตั้งค่าถูกต้อง"; act = @{ th = "พร้อมใช้งาน"; en = "ready" }; start = 0; end = $null }) "raise"
  Ok ("ส่งข้อความทดสอบไปที่หัวข้อ " + $Ntfy + " แล้ว — ดูที่แอป ntfy บนมือถือ"); return
}
if ($Uninstall) { Remove-AutoStart; return }
if (($Live -or $Install) -and -not $Ip) { $Ip = (Load-Ips) -join "," }
if (-not $Ip) { $Ip = Read-Host "ใส่ IP เครื่องวัด (หลายเครื่องคั่นด้วย , เช่น 192.168.10.62,192.168.10.63)" }
$ips = $Ip -split "[,\s]+" | Where-Object { $_ }
Stop-OtherTools
$results = foreach ($h in $ips) { Check-One $h }
$log = Join-Path $(if ($Out) { $Out } else { [Environment]::GetFolderPath("Desktop") }) ("PW3198-check-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".csv")
try { New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null; $results | Export-Csv -NoTypeInformation -Encoding UTF8 $log; Say ("บันทึกผลตรวจไว้ที่ " + $log) } catch {}
if ($Send -and -not $Ip) { }
if ($Probe) { foreach ($h in $ips) { Probe-One $h }; return }
if ($Cmd) { foreach ($h in $ips) { Cmd-One $h $CmdPort }; return }
if ($Items) { foreach ($h in $ips) { Items-One $h $CmdPort }; return }
if ($Harm) { foreach ($h in $ips) { Harm-One $h $CmdPort }; return }
if ($Install) { Save-Ips $ips; Install-AutoStart; $Live = $true }
if ($Live) { Live-Bridge $ips $CmdPort; return }
if ($CheckOnly) { return }
if ($Dump) { foreach ($r in $results) { if ($r.ftp) { Dump-One $r.ip } }; if ($Send) { Send-Folder }; return }
if ($Send) { Send-Folder; return }
while ($true) {
  Say ""
  Say "เลือกทำต่อ:  [1] เปิดหน้าจอเครื่องวัดในเบราว์เซอร์   [2] ดึงไฟล์ทั้งหมดใน SD มาเก็บ   [3] ตรวจซ้ำ   [4] ส่งไฟล์เข้าเว็บแอป CoreDash   [5] สำรวจช่องทางค่าสด   [6] ทดสอบคำสั่งอ่านค่า (พอร์ต 3198)   [7] หารายการค่าที่อ่านได้   [8] ▶ ค่าสดเข้าเว็บแอป   [9] หาค่าฮาร์มอนิกรายเฟส   [0] ออก" "Cyan"
  $k = Read-Host ">"
  if ($k -eq "1") { foreach ($h in $ips) { Start-Process ("http://" + $h + $(if ($HttpPort -ne 80) { ":" + $HttpPort } else { "" }) + "/") } }
  elseif ($k -eq "2") { foreach ($r in $results) { if ($r.ftp) { Dump-One $r.ip } else { Say ("  " + $r.ip + ": ไม่มี FTP — ใช้ PQ ONE ดึงไฟล์ผ่าน LAN แล้ว Export CSV จากนั้นกด 4") "Yellow" } } }
  elseif ($k -eq "3") { $results = foreach ($h in $ips) { Check-One $h } }
  elseif ($k -eq "4") { Send-Folder }
  elseif ($k -eq "5") { foreach ($h in $ips) { Probe-One $h } }
  elseif ($k -eq "6") { foreach ($h in $ips) { Cmd-One $h $CmdPort } }
  elseif ($k -eq "7") { foreach ($h in $ips) { Items-One $h $CmdPort } }
  elseif ($k -eq "8") { Live-Bridge $ips $CmdPort }
  elseif ($k -eq "9") { foreach ($h in $ips) { Harm-One $h $CmdPort } }
  else { break }
}
