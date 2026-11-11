# CoreDash Nexus Gateway

**พัฒนาโดย / Developed by CoreDash Technology**

ตัวเชื่อม (backend) ที่อ่านค่าจาก **PLC / มิเตอร์ / เซนเซอร์** ผ่าน **Modbus TCP, Modbus RTU (RS-485) และ MQTT** แล้วส่งค่าสดเข้าหน้าจอ **CoreDash Nexus** (เว็บ SCADA + แอปมือถือ) ผ่าน **WebSocket** และ **REST API** รวมถึงรับคำสั่งสั่งการกลับไปที่อุปกรณ์

The gateway bridges field devices (Modbus TCP/RTU, MQTT) to the CoreDash Nexus web SCADA and mobile app over WebSocket + REST, and carries commands back to the field.

```
 อุปกรณ์ภาคสนาม           Gateway (ไฟล์นี้)                          หน้าจอ
 ┌──────────────┐   Modbus TCP   ┌─────────────────────────────┐  WebSocket  ┌──────────────┐
 │ PLC-01       │◄──────────────►│ Drivers → Tag store         │◄───────────►│ เว็บ SCADA    │
 │ มิเตอร์ไฟ/น้ำ │   Modbus RTU   │ Alarms · Interlocks         │    REST     │ แอปมือถือ     │
 │ ไฟ (MQTT)    │◄──────────────►│ Commands (2-step) · Audit   │◄───────────►│ รายงาน        │
 │ เซนเซอร์      │      MQTT      │ Historian · Scheduler       │  LINE/Email │ LINE OA      │
 └──────────────┘                └─────────────────────────────┘             └──────────────┘
```

## สิ่งที่ทำได้ / Features

| ส่วน | รายละเอียด |
|---|---|
| **Drivers** | Modbus TCP, Modbus RTU (หลายอุปกรณ์บนสาย RS-485 เส้นเดียวกันได้), MQTT (JSON) · อ่านแบบรวมบล็อก, ต่อใหม่อัตโนมัติ (backoff), วัดสุขภาพการสื่อสาร |
| **ชนิดข้อมูล** | bool, int16, uint16, int32, uint32, float32 (สลับ word ได้), scale/offset |
| **คำสั่ง** | ยืนยัน 2 ชั้น (prepare → confirm ภายใน 30 วินาที, คนเดียวกันเท่านั้น), ตรวจสิทธิ์ตามบทบาท, ตรวจช่วงค่า, ตรวจ Interlock ซ้ำก่อนเขียน |
| **Interlock** | บังคับค่าปลอดภัยทุกโหมด และบล็อกคำสั่งที่ขัดกับ Interlock — แอปแสดงสาเหตุ ค่าปัจจุบัน/เกณฑ์ ปุ่มแก้ไขทันที (`fixes`) และสั่งคำสั่งเดิมให้อัตโนมัติเมื่อปลดล็อก |
| **Bypass ชั่วคราว** | วิศวกร/ผู้ดูแลเท่านั้น ต้องใส่เหตุผล ≥5 ตัวอักษร เลือก 5/15/30 นาที (≤ `maxBypassMin`) หมดเวลาคืนค่าเอง บันทึก `interlock.bypass` / `interlock.restore` ใน Audit log Interlock ที่ตั้ง `bypassable: false` (เช่น `IL_TANK_LSHH` 99.5%) ข้ามไม่ได้เด็ดขาด |
| **Alarm** | เงื่อนไข + หน่วงเวลา, สถานะแบบ ISA-18.2 (active / acked / cleared), ส่งต่อ (escalation) เมื่อไม่มีคนรับทราบ |
| **แจ้งเตือน** | LINE Official Account (Messaging API), Webhook สำหรับ Email / SMS / Push |
| **Historian** | เก็บค่าในหน่วยความจำสำหรับกราฟเร็ว + ไฟล์ JSONL รายวัน, API ดึงกราฟย้อนหลัง |
| **Audit log** | บันทึกทุกคำสั่งแบบ hash-chain (แก้ไขย้อนหลังแล้วตรวจจับได้) |
| **Scheduler** | ตารางเวลาทำงานบน Gateway ตามเขตเวลาไซต์ แม้คลาวด์ออฟไลน์ |
| **Simulator** | `SIMULATE=1` จำลองโรงงานทั้งระบบ ใช้สาธิตลูกค้าได้ทันทีโดยไม่ต้องมีฮาร์ดแวร์ |

## เริ่มใช้งานเร็ว / Quick start

ต้องใช้ Node.js 20 ขึ้นไป

```bash
npm install
npm run sim          # โหมดจำลอง + demo tokens
npm test             # ชุดทดสอบ 17 ข้อ (รวม Modbus TCP และ MQTT broker จริง)
```

เปิด `http://localhost:8080/api/health` แล้วลอง:

```bash
curl -H "Authorization: Bearer demo-viewer" http://localhost:8080/api/tags
# สั่งปิดวาล์ว V-102 (ขั้นที่ 1 → ได้ id)
curl -X POST -H "Authorization: Bearer demo-operator" -H "Content-Type: application/json" \
     -d '{"tag":"V-102.POS","value":0}' http://localhost:8080/api/commands
# ยืนยัน (ขั้นที่ 2)
curl -X POST -H "Authorization: Bearer demo-operator" http://localhost:8080/api/commands/<id>/confirm
```

### ใช้งานจริงกับอุปกรณ์ / Live devices

1. แก้ `config/plant-a.yaml` ให้ตรงกับไซต์ (IP ของ PLC, พอร์ต RS-485, เลข Register จากคู่มือมิเตอร์, MQTT topic)
2. ตั้งค่า secrets เป็น environment variables (อย่าใส่ในไฟล์):
   ```bash
   export TOKEN_WIPA=$(openssl rand -hex 24)      # โทเคนผู้ใช้แต่ละคน
   export TOKEN_SOMCHAI=$(openssl rand -hex 24)
   export MQTT_PASSWORD=...
   export LINE_CHANNEL_TOKEN=...                 # LINE OA channel access token
   ```
3. `npm start` หรือใช้ Docker: `docker compose up -d`

## แอปมือถือ (ติดตั้งได้) / Installable mobile app (PWA)

Gateway มีแอปมือถือในตัวที่ **`/app/`** (เปิด `http://<gateway>:8080/` จะพาไปที่แอปเอง)

- 5 แท็บ: หน้าหลัก · SCADA · ควบคุม · แจ้งเตือน · รายงาน, สลับ **ไทย / English** และโทน **Navy / Graphite / Light**
- ค่าสดผ่าน WebSocket, ทุกคำสั่งยืนยัน 2 ชั้นและบันทึกใน Audit log, Interlock บล็อกคำสั่งเสี่ยง
- ไอคอนแอปเป็นโลโก้ **CoreDash Technology**, เปิดเต็มจอ, เปิดได้แม้ออฟไลน์ (แสดง “กำลังเชื่อมใหม่”)
- ถ้าเปิดจากที่ที่ไม่มี Gateway จะเข้า **โหมดสาธิต** อัตโนมัติ (จำลองข้อมูลในเครื่อง)

### เผยแพร่บน GitHub Pages (สาธิตลูกค้า)

repo นี้เปิดบน GitHub Pages ได้ทันที: `index.html` (หน้าแรกภาษาไทย), `en.html` (English) และ Web App ที่ `app/`
GitHub Pages รัน Gateway (Node.js) ไม่ได้ แอปจึงเข้า **โหมดสาธิต** เอง และเพราะเป็น HTTPS จึง **ติดตั้งลงมือถือได้จากลิงก์นั้นเลย**

1. อัปโหลดทุกไฟล์ในโฟลเดอร์นี้ขึ้น repo (รวม `.nojekyll`, `index.html`, `en.html`, `app/`)
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`
3. เปิด `https://<user>.github.io/<repo>/` · Web App: `https://<user>.github.io/<repo>/app/`

แก้หน้าแรก: แก้ `tools/landing.dc.html` แล้วรัน `node tools/build-landing.cjs tools/landing.dc.html .`

### ติดตั้งลงมือถือ

เบราว์เซอร์จะยอมให้ติดตั้งเมื่อเปิดผ่าน **HTTPS** เท่านั้น (ยกเว้น `localhost`) ทางที่ง่ายที่สุด:

| วิธี | คำสั่ง | เหมาะกับ |
|---|---|---|
| **Cloudflare Tunnel** (ได้ลิงก์ https ทันที) | `cloudflared tunnel --url http://localhost:8080` | สาธิตลูกค้า / ทดลอง |
| **Caddy** ในเครือข่ายโรงงาน | `caddy reverse-proxy --from scada.plant-a.local --to localhost:8080` | ใช้งานจริงภายใน |
| โดเมนจริง + Let’s Encrypt | Caddy / Nginx หน้า Gateway | ใช้งานจากนอกโรงงาน |

จากนั้นบนมือถือ:
- **Android (Chrome):** เปิดลิงก์ → แตะปุ่ม **ติดตั้ง** ในแอป หรือเมนู ⋮ → *ติดตั้งแอป*
- **iPhone (Safari):** เปิดลิงก์ → ปุ่ม **แชร์** → *เพิ่มไปยังหน้าจอโฮม*

เข้าสู่ระบบด้วยโทเคนของผู้ใช้ (ในโหมดจำลองกด “ใช้บัญชีสาธิตของ Gateway”)

> แจ้งเตือนบนเครื่อง: เปิดได้ในหน้าตั้งค่าของแอป แจ้งเตือนจะเด้งเมื่อแอปทำงานอยู่เบื้องหลัง · บน iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน (iOS 16.4+)

### ทดสอบแอปในเบราว์เซอร์จริง

`npm test` รันชุดทดสอบแอปแบบ end-to-end ใน Chrome ด้วย (ข้ามอัตโนมัติถ้าไม่มี Chrome) — เข้าสู่ระบบ, สั่งวาล์วแบบยืนยัน, ตรวจ Interlock, รับทราบอลาร์ม, เปลี่ยนภาษา/ธีม และเปิดแบบออฟไลน์ ตั้ง `SHOTS_DIR=./shots` เพื่อเก็บภาพหน้าจอทุกขั้น

## แท่นทดสอบมาตรวัดน้ำ (ถังตวง) / Water-meter test bench

แท็บ **ทดสอบมาตร** ในแอปจำลองแท่นทดสอบความเที่ยงตรงมาตรวัดน้ำแบบปริมาตร (ISO 4064 / OIML R 49):

- มาตร 3 ตัวต่ออนุกรม: **SMCV4 · GMCV3-V3.5 · ASAHI GMK** + มาตรอ้างอิง FT-01, เกจแรงดันก่อน/หลัง, อุณหภูมิ
- ถังตวง 2 ใบ: **TK-20** (คอวัดที่ 10 L) และ **TK-200** (คอวัดที่ 100 L และ 200 L) น้ำขึ้นจริงตามอัตราไหล
- เซนเซอร์: LSL (ถังแห้ง), **LS-10 / LS-100 / LS-200** (ที่กึ่งกลางคอถังแคบ), LSHH (กันล้น), LT-01 (เรดาร์)
- ทดสอบอัตโนมัติ Q1 · Q2 · Q3 (Q4 เลือกเองได้): ระบาย → อ่านค่าเริ่ม → เติม → ปิดวาล์วเร็วที่เซนเซอร์ → รอน้ำนิ่ง → อ่านคอถัง → คำนวณ
- ค่าผิดพลาด E = (V มาตร − V อ้างอิง) / V อ้างอิง × 100 เทียบเกณฑ์ ±5 % (Q1 ≤ Q < Q2) และ ±2 % (Q2 ≤ Q ≤ Q4) พร้อมกราฟและพิมพ์รายงาน
- ตั้ง Q3 / R ตามใบรับรองของมาตรจริง (ค่าเริ่มต้น DN15 · Q3 2.5 m³/h · R160 → Q1 15.6 L/h, Q2 25 L/h, Q4 3.125 m³/h)
- เร่งเวลาจำลอง ×1 ถึง ×300 (Q1 ที่ 10 L ใช้เวลาจริง ~38 นาที)

> กราฟค่าผิดพลาดของแต่ละรุ่นในโหมดจำลองเป็น **ค่าสมมติ** ไม่ใช่ข้อมูลผู้ผลิต

รายการ I/O สำหรับสร้างแท่นจริงต่อ PLC อยู่ที่ `config/bench-io.example.yaml`

## การแมป Tag / Tag mapping

ทุกค่าที่แสดงบนหน้าจอคือ **Tag** หนึ่งตัว เช่น `T-1.LEVEL`, `V-101.POS`, `P-01.RUN`, `MDB-1.KW`

```yaml
# Modbus: ระดับถัง อ่านจาก Input Register 20, ค่าดิบ 625 = 62.5 %
- { id: T-1.LEVEL, device: PLC-01, type: input, address: 20, dataType: uint16, scale: 0.1, unit: "%" }
# Modbus: วาล์ว สั่งได้ 0–100 %
- { id: V-101.POS, device: PLC-01, type: holding, address: 10, dataType: uint16, writable: true, min: 0, max: 100 }
# MQTT: ไฟโซน A รับสถานะจาก JSON {"on":true,"level":80} และสั่งด้วย {"level":30}
- { id: L-A.LEVEL, device: LGT-01, topic: plant-a/lighting/zone-a/state, jsonPath: level,
    commandTopic: plant-a/lighting/zone-a/set, commandKey: level, dataType: uint16, writable: true }
```

> **Address:** ใช้เลขเริ่มที่ 0 (protocol address) — ถ้าคู่มือเขียน 30021 ให้ใส่ `type: input, address: 20`

## บทบาทผู้ใช้ / Roles

| สิทธิ์ | viewer | operator | engineer | admin |
|---|:-:|:-:|:-:|:-:|
| ดูค่าสด กราฟ รายงาน | ✓ | ✓ | ✓ | ✓ |
| รับทราบอลาร์ม / สั่งการ | — | ✓ | ✓ | ✓ |
| Tag ที่ตั้ง `minRole: engineer` (เช่น Setpoint) | — | — | ✓ | ✓ |
| ดู Audit log / เปิด-ปิดตารางเวลา | — | — | ✓ | ✓ |
| ตรวจความถูกต้อง Audit log | — | — | — | ✓ |

## API

| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| GET | `/api/health` | — | สถานะเซิร์ฟเวอร์ |
| GET | `/api/tags` | viewer | ค่าปัจจุบันทุก Tag |
| GET | `/api/history?tag=&from=&to=` | viewer | กราฟย้อนหลัง `[[ts, value], …]` |
| GET | `/api/alarms` | viewer | อลาร์มที่ active + ล่าสุด |
| POST | `/api/alarms/:id/ack` | operator | รับทราบอลาร์ม |
| POST | `/api/commands` | operator | ขั้น 1: เตรียมคำสั่ง `{tag, value}` |
| POST | `/api/commands/:id/confirm` | operator | ขั้น 2: ยืนยันและเขียนค่า |
| GET | `/api/devices` | viewer | สุขภาพการสื่อสาร (online/degraded/offline, latency, errors/h) |
| GET | `/api/interlocks` | viewer | สถานะ Interlock (รวม bypass ที่ใช้อยู่) |
| POST | `/api/interlocks/:id/bypass` | engineer | `{ minutes, reason }` ข้ามชั่วคราว |
| DELETE | `/api/interlocks/:id/bypass` | engineer | คืนค่าระบบป้องกันทันที |
| GET | `/api/audit` | engineer | Audit log |
| GET | `/api/audit/verify` | admin | ตรวจ hash-chain |
| PATCH | `/api/schedules/:id` | engineer | เปิด/ปิดตารางเวลา |

**WebSocket** `ws://host:8080/ws?token=…`
- ส่งจาก Gateway: `snapshot`, `tags` (รวมทุก 250 ms), `alarm`, `devices`, `audit`
- ส่งจากหน้าจอ: `command.prepare`, `command.confirm`, `command.cancel`, `alarm.ack`

## เชื่อมหน้าจอ CoreDash Nexus / Connecting the screens

ใช้ `client/coredash-client.mjs` (ไม่มี dependency ใช้ได้ทั้งเบราว์เซอร์และ Node):

```js
import { CoreDashClient } from './coredash-client.mjs';
const cd = new CoreDashClient('wss://gateway.plant-a.local/ws', userToken);

cd.on('tags', () => {
  tankLevel = cd.value('T-1.LEVEL');      // ใช้แทนค่าจำลองในหน้าจอ
  powerKw  = cd.value('MDB-1.KW');
});
cd.on('alarm', ({ alarm }) => showAlert(alarm.text.th));

// ปุ่ม "ปิดวาล์ว" → กล่องยืนยัน → ยืนยัน
const cmd = await cd.prepare('V-101.POS', 0);
if (await confirmDialog(`ปิดวาล์ว V-101 ?`)) await cd.confirm(cmd.id); else await cd.cancel(cmd.id);
```

ในหน้าจอต้นแบบ ทุกจุดที่ใช้ค่าจำลอง (`tick()`) แทนที่ด้วยค่าจาก `cd.value(tagId)` และทุกปุ่มสั่งการเรียก `prepare` → `confirm` ตามลำดับเดิม (หน้าจอมีกล่องยืนยันอยู่แล้ว)

| หน้าจอ | Tag ที่ใช้ |
|---|---|
| ภาพรวม / KPI | `MDB-1.KW`, `MDB-1.KWH`, `WM-01.FLOW`, `WM-01.TOTAL` |
| มิเตอร์ไฟหลัก | `MDB-1.V_L1..3`, `MDB-1.PF`, `MDB-1.HZ` |
| SCADA ระบบน้ำ | `P-01.RUN`, `P-01.AMPS`, `V-101..103.POS`, `T-1.LEVEL` |
| วงจรน้ำหล่อเย็น | `CHL-01.RUN`, `CHL-01.SUPPLY_T`, `P-02.RUN`, `P-02.VIB`, `V-201.POS`, `INJ-01.MOLD_T` |
| แสงสว่าง | `L-A.ON`, `L-A.LEVEL`, `L-O.ON` |
| ระบบ & ตั้งค่า | `/api/devices`, `/api/interlocks`, `/api/audit` |

## ความปลอดภัย / Security checklist

- [ ] เปิด TLS: วาง Gateway หลัง reverse proxy (Caddy / Nginx) ให้เป็น `https://` และ `wss://`
- [ ] ตั้ง `server.cors` เป็นโดเมนเว็บจริง ไม่ใช่ `*`
- [ ] PLC อยู่ใน VLAN แยก **ห้ามเปิดพอร์ต 502 ออกอินเทอร์เน็ต** ให้ Gateway เป็นทางเดียวที่เข้าถึงได้
- [ ] โทเคนผู้ใช้ยาว ≥ 32 ตัวอักษร เก็บใน env / secret manager และเปลี่ยนเมื่อพนักงานลาออก
- [ ] MQTT ใช้ `mqtts://` + username/password หรือ client certificate
- [ ] สำรอง `data/` (audit + history) ทุกคืน และตรวจ `/api/audit/verify` เป็นประจำ
- [ ] ทดสอบ Interlock หน้างานจริงก่อนเปิดใช้สั่งการระยะไกล

## ขั้นต่อไปที่แนะนำ / Roadmap

1. Login หน้าเว็บ (OIDC / Google Workspace / Microsoft 365) แทน API token
2. ต่อ Historian เข้า InfluxDB หรือ TimescaleDB สำหรับข้อมูลหลายปี
3. OPC UA และ BACnet/IP driver (Chiller, BMS)
4. Store-and-forward เมื่อเน็ตหลุด สำหรับไซต์ที่ส่งขึ้นคลาวด์
5. รายงานพลังงานรายเดือนอัตโนมัติ (PDF) ส่งเข้าอีเมลผู้บริหาร
