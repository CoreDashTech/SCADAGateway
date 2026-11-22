# CoreDash Watch · คู่มือเปิดระบบ

ระบบแจ้งเตือนปั๊มหยุด ไฟดับ และวัดไฟผ่านมือถือ บน **coredashtech.com/watch**
ใช้ Supabase (โปรเจกต์เดิม แพ็กเกจฟรี) ทำงานฝั่งเซิร์ฟเวอร์ทั้งหมด ไม่ต้องใช้ Vercel

```
ESP32 + PZEM ──ทุก 60 วิ──► Supabase (ฐานข้อมูล + ตรรกะ + ตั้งเวลา) ──► Telegram / LINE
                                    ▲
       coredashtech.com/watch/app ──┘ (ลูกค้าล็อกอิน ดูค่า ตั้งค่า)
```

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `index.html` | หน้าแนะนำ ราคา ดาวน์โหลด |
| `app/` | หน้าล็อกอินและแดชบอร์ดลูกค้า |
| `config.js` | **ต้องแก้ครั้งเดียว** ใส่ Supabase URL และ Publishable key |
| `coredash-watch.ino` | โปรแกรม ESP32 (หน้าเว็บกรอกค่าให้อัตโนมัติตอนดาวน์โหลด) |
| `coredash-link.ino` | โปรแกรมบอร์ด CoreDash Link (ESP32-C3 + RS485 + แบตสำรอง) |
| `supabase/link-upgrade.sql` | รันครั้งเดียวถ้าเคยติดตั้ง watch.sql ไปแล้ว เพื่อรองรับ Link |
| `supabase/watch.sql` | ฐานข้อมูลและตรรกะทั้งหมด (ไม่มีรหัสลับ) |
| `supabase/functions/watch-hook/index.ts` | รับข้อความจาก Telegram/LINE เพื่อผูกบัญชี |

## ขั้นตอนเปิดระบบ (ทำครั้งเดียว ราว 30 นาที)

### ๑. ฐานข้อมูล
Supabase → **SQL Editor** → New query → วางทั้งไฟล์ `supabase/watch.sql` → **Run**
(ถ้าขึ้น error ที่บรรทัด extension: ไป Database → Extensions เปิด `pg_cron` กับ `pg_net` แล้ว Run ใหม่)

### ๒. ให้เว็บรู้จัก Supabase
แก้ไฟล์ `config.js` บน GitHub (กดรูปดินสอ):
- `supabaseUrl` = Project Settings → API → Project URL
- `supabaseKey` = **Publishable key** (`sb_publishable_...`) ห้ามใช้ secret key

### ๓. อนุญาตลิงก์ยืนยันอีเมล
Supabase → Authentication → URL Configuration → Redirect URLs → เพิ่ม
`https://www.coredashtech.com/watch/app/`

### ๔. บอท Telegram (ฟรี)
1. ใน Telegram คุยกับ **@BotFather** → `/newbot` → ตั้งชื่อ → ได้ **token**
2. ใส่ชื่อบอท (ไม่มี @) ใน `config.js` ช่อง `telegramBot`
3. Supabase → SQL Editor รัน (แทนค่าในวงเล็บเหลี่ยม):
   ```sql
   update watch_private.config set v = '[TOKEN จาก BotFather]' where k = 'tg_token';
   update watch_private.config set v = '[สุ่มเอง ตัวอักษร/ตัวเลข 20 ตัวขึ้นไป]' where k = 'tg_secret';
   ```
4. Supabase → **Edge Functions** → Deploy a new function → **Via Editor** → ตั้งชื่อ `watch-hook`
   → วางโค้ดจาก `supabase/functions/watch-hook/index.ts` → Deploy
   → เข้าไปที่ฟังก์ชัน → Details/Settings → **ปิด Verify JWT** → Save
5. เปิดลิงก์นี้ในเบราว์เซอร์ครั้งเดียว (แทน 3 จุด):
   ```
   https://api.telegram.org/bot[TOKEN]/setWebhook?secret_token=[tg_secret]&url=https%3A%2F%2F[REF].supabase.co%2Ffunctions%2Fv1%2Fwatch-hook%3Fsrc%3Dtelegram
   ```
   `[REF]` คือรหัสโปรเจกต์ในลิงก์ Supabase เช่น `abcdxyz` จาก `https://abcdxyz.supabase.co`
   ถ้าขึ้น `"ok":true` แปลว่าสำเร็จ

### ๕. ตั้งตัวเองเป็นผู้ดูแล
สมัครที่ `coredashtech.com/watch/app` ก่อน แล้วรันใน SQL Editor:
```sql
update watch_private.config set v = (select id::text from auth.users where email = '[อีเมลของคุณ]') where k = 'admin_ids';
```
หลังจากนี้หน้าอุปกรณ์จะมีลิงก์ “หน้าผู้ดูแล” ไว้ต่ออายุให้ลูกค้าที่โอนเงินแล้ว

### ๖. LINE (ไม่บังคับ)
LINE Developers → Messaging API channel → คัดลอก Channel secret และ Channel access token แล้วรัน:
```sql
update watch_private.config set v = '[Channel access token]' where k = 'line_token';
update watch_private.config set v = '[Channel secret]' where k = 'line_secret';
```
Webhook URL = `https://[REF].supabase.co/functions/v1/watch-hook?src=line` → เปิด Use webhook
ใส่ LINE OA ID (เช่น `@coredash`) ใน `config.js` ช่อง `lineOA`
หมายเหตุ: LINE OA แพ็กเกจฟรีส่งข้อความได้จำกัดต่อเดือน รวมทุกลูกค้า แนะนำ Telegram เป็นหลัก

## CoreDash Link (บอร์ดติดตู้ไฟ)

1. ถ้าเคยรัน `watch.sql` ไปแล้ว ให้รัน `supabase/link-upgrade.sql` ใน SQL Editor หนึ่งครั้ง (ไม่ต้องใส่รหัสลับ) ถ้าติดตั้งใหม่ รัน `watch.sql` อย่างเดียวพอ
2. เพิ่มอุปกรณ์ในหน้าแอป แล้วกด "โปรแกรม CoreDash Link" จะได้ไฟล์ที่ฝังรหัสให้แล้ว
3. Arduino IDE เลือกบอร์ด ESP32C3 Dev Module · USB CDC On Boot: Enabled · ลงไลบรารี WiFiManager, OneWire, DallasTemperature
4. ต่อมือถือเข้า Wi-Fi `CoreDash-Link-xxxx` (รหัส coredash) เลือก Wi-Fi และชนิดมิเตอร์ 1 = PZEM-016, 2 = SDM120
5. ทดสอบ: ปิดเบรกเกอร์ไฟ 24V ภายใน 2–3 วินาทีต้องได้ข้อความ "ไฟฟ้าดับ · ทำงานด้วยแบตสำรอง"

## ปรับราคา/ระยะทดลอง
แก้ได้ 2 ที่ให้ตรงกัน: `config.js` (ตัวเลขบนหน้าเว็บ) และ
```sql
update watch_private.config set v = '149' where k = 'price_month';   -- ตัวอย่าง
update watch_private.config set v = '60'  where k = 'trial_days';    -- มีผลกับอุปกรณ์ที่เพิ่มใหม่
```

## รับชำระเงิน
ลูกค้าโทร/LINE แจ้ง “รหัสลงท้าย ๔ ตัว” → เข้า `watch/app` → หน้าผู้ดูแล → ค้นหา → กด **+30 วัน** หรือ **+1 ปี**

## ความปลอดภัย (ทำงานอย่างไร)
- รหัสอุปกรณ์เก็บแบบแฮช SHA-256 แสดงครั้งเดียวตอนสร้าง
- ลูกค้าเห็นและแก้ได้เฉพาะอุปกรณ์ของตัวเอง (Row Level Security) แก้วันหมดอายุเองไม่ได้
- รหัส Telegram/LINE อยู่ในตาราง `watch_private.config` ซึ่งเรียกผ่าน API ไม่ได้
- ช่วงทดลองนับในฐานข้อมูล แก้โปรแกรม ESP32 เพื่อใช้ฟรีต่อไม่ได้

## ข้อจำกัดที่ควรรู้
- อีเมลยืนยันของ Supabase แพ็กเกจฟรีส่งได้จำกัดต่อชั่วโมง เมื่อมีลูกค้ามากควรตั้ง Custom SMTP
- Supabase แพ็กเกจฟรีมีพื้นที่ฐานข้อมูล 500 MB ระบบลบข้อมูลรายนาทีที่เก่ากว่า 35 วันให้อัตโนมัติ
