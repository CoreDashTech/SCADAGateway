# CoreDash Nexus – หน้าแรก (Landing Page)

หน้าแรกของ **CoreDash Nexus** โดย **CoreDash Technology** · โทร 081-923-2380

- ฉาก 3D แผนผังการเชื่อมต่อ: Edge Gateway → Cloud, โรงงาน, บ้าน/อาคาร, เครื่องจักร, มิเตอร์ไฟฟ้า, มิเตอร์น้ำ, ไฟส่องสว่าง, ปั๊ม/วาล์ว, แผงโซลาร์, อินเวอร์เตอร์
- โปรโตคอล: Modbus RTU/TCP, SunSpec, LAN/Ethernet, OPC UA, MQTT, Wireless M-Bus, LoRaWAN, Zigbee, Wi-Fi, 4G
- โหมด กลางวัน / กลางคืน / อัตโนมัติ
- กราฟภาระไฟฟ้า 24 ชม., เกจกำลังไฟฟ้า, กราฟแท่งตามโซน, ตารางสถานะอุปกรณ์
- ปุ่ม "ทดลองใช้ฟรี" ที่หัวเว็บ หน้าแรก และท้ายเว็บ

> ตัวเลขในหน้านี้เป็นข้อมูลจำลองเพื่อการสาธิต

## วางไฟล์ไว้ตรงไหนใน GitHub

วางไว้ที่ **ราก (root) ของ repository** — ระดับบนสุด ไม่อยู่ในโฟลเดอร์ย่อย:

```
coredash-nexus/          ← repository
├── index.html           ← หน้าเว็บ (ต้องชื่อนี้)
├── README.md
└── .nojekyll
```

> อย่าอัปไฟล์ .zip ขึ้นไปตรง ๆ ต้องแตกไฟล์ก่อน

## วิธีอัปผ่านหน้าเว็บ GitHub (ไม่ต้องใช้ git)

1. เข้า https://github.com/new → ตั้งชื่อ repo เช่น `coredash-nexus` → เลือก **Public** → **Create repository**
2. ในหน้า repo กด **uploading an existing file** (หรือ **Add file → Upload files**)
3. ลากไฟล์ `index.html` และ `README.md` วางลงไป → กด **Commit changes**
4. ไปที่ **Settings** (แท็บบนของ repo) → เมนูซ้าย **Pages**
5. ช่อง **Source** เลือก **Deploy from a branch** → Branch เลือก **main** และโฟลเดอร์ **/ (root)** → **Save**
6. รอ 1–2 นาที แล้วรีเฟรชหน้า Pages จะเห็นลิงก์ `https://<ชื่อผู้ใช้>.github.io/coredash-nexus/`

`.nojekyll` เป็นไฟล์ซ่อน (บาง Windows/Mac มองไม่เห็น) ไม่อัปก็ใช้งานได้

## วิธีอัปด้วยคำสั่ง git

```bash
cd coredash-nexus-site        # โฟลเดอร์ที่แตก zip แล้ว
git init
git add .
git commit -m "CoreDash Nexus landing page"
git branch -M main
git remote add origin https://github.com/<ชื่อผู้ใช้>/coredash-nexus.git
git push -u origin main
```

จากนั้นเปิด Settings → Pages ตามข้อ 4–6

## ใช้โดเมนของบริษัทเอง (ถ้ามี)

Settings → Pages → **Custom domain** ใส่เช่น `www.coredash.co.th` แล้วตั้ง DNS ที่ผู้ให้บริการโดเมน: เรคคอร์ด **CNAME** `www` → `<ชื่อผู้ใช้>.github.io`

## แก้ไขเพิ่มเติม

- ปุ่ม "ทดลองใช้ฟรี" ลิงก์ไปที่ `#trial` — เปลี่ยนเป็นลิงก์ฟอร์มสมัครจริงได้ โดยค้นหา `href="#trial"` ใน `index.html`
- ค่าสดจำลองด้วย JavaScript ท้ายไฟล์ ถ้าจะต่อข้อมูลจริง ให้แทนส่วน `render()` ด้วยการดึงข้อมูลจาก API/MQTT ของคุณ
