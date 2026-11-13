// CoreDash · เลือกเครื่องมือวัด (instrument picker)
//   • catalog of popular power meters / PQ analysers: how to connect, what they measure, how CoreDash reads them
//   • Modbus register profiles (panel meters) → live reading through the gateway (src/pq/modbus-meter.js)
//   • CSV import with automatic column detection (portable analysers: export from PQ ONE / Energy Analyze Plus / PAT3 /
//     KEW Windows / CW500 Viewer / PowerView3) → one record in the same shape as a live PW3198
// Everything ends as the PW3198 "named" dictionary (U1RMS, I1RMS, P1 [W], PSUM [W], PFSUM, U1THD-F …) so pw3198Record()
// builds the record and the diagnosis, alarm and risk engines work unchanged.
import { pw3198Record } from './pw3198.js';

const B = (th, en) => ({ th, en });

// ------------------------------------------------------------------ canonical keys
export const CANON = {
  U1RMS: 'U', U2RMS: 'U', U3RMS: 'U', I1RMS: 'I', I2RMS: 'I', I3RMS: 'I', I4RMS: 'I',
  P1: 'P', P2: 'P', P3: 'P', PSUM: 'P', Q1: 'Q', Q2: 'Q', Q3: 'Q', QSUM: 'Q', S1: 'S', S2: 'S', S3: 'S', SSUM: 'S',
  PF1: 'PF', PF2: 'PF', PF3: 'PF', PFSUM: 'PF', FREQ: 'f',
  'U1THD-F': 'THD', 'U2THD-F': 'THD', 'U3THD-F': 'THD', 'I1THD-F': 'THD', 'I2THD-F': 'THD', 'I3THD-F': 'THD', UUNB: 'UNB', IUNB: 'UNB'
};
export const CANON_LABEL = {
  U1RMS: 'U1 (V)', U2RMS: 'U2 (V)', U3RMS: 'U3 (V)', I1RMS: 'I1 (A)', I2RMS: 'I2 (A)', I3RMS: 'I3 (A)', I4RMS: 'IN (A)',
  P1: 'P1', P2: 'P2', P3: 'P3', PSUM: 'P sum', Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', QSUM: 'Q sum', S1: 'S1', S2: 'S2', S3: 'S3', SSUM: 'S sum',
  PF1: 'PF1', PF2: 'PF2', PF3: 'PF3', PFSUM: 'PF sum', FREQ: 'f (Hz)',
  'U1THD-F': 'THD-U1 %', 'U2THD-F': 'THD-U2 %', 'U3THD-F': 'THD-U3 %', 'I1THD-F': 'THD-I1 %', 'I2THD-F': 'THD-I2 %', 'I3THD-F': 'THD-I3 %', UUNB: 'U unb %', IUNB: 'I unb %'
};

// ------------------------------------------------------------------ Modbus register profiles
// regs: [canonical key, register address as sent on the wire (0-based PDU address), scale to W/var/VA/V/A]
// Addresses were checked against the maker's register list or an integrator guide (see src). Always confirm one value
// (frequency or U1) against the meter's own screen before trusting the rest — firmware and word order can differ.
const k = 1000;
export const MODBUS = {
  'eastron-sdm630': { fc: 4, word: 'BE', note: B('Input registers (FC04) float32 · 30001 = ที่อยู่ 0', 'Input registers (FC04) float32 · 30001 = address 0'),
    regs: [['U1RMS', 0], ['U2RMS', 2], ['U3RMS', 4], ['I1RMS', 6], ['I2RMS', 8], ['I3RMS', 10], ['P1', 12], ['P2', 14], ['P3', 16], ['S1', 18], ['S2', 20], ['S3', 22],
      ['Q1', 24], ['Q2', 26], ['Q3', 28], ['PF1', 30], ['PF2', 32], ['PF3', 34], ['PSUM', 52], ['SSUM', 56], ['QSUM', 60], ['PFSUM', 62], ['FREQ', 70], ['I4RMS', 224],
      ['U1THD-F', 234], ['U2THD-F', 236], ['U3THD-F', 238], ['I1THD-F', 240], ['I2THD-F', 242], ['I3THD-F', 244]] },
  'schneider-pm5560': { fc: 3, word: 'BE', note: B('Holding (FC03) float32 · ที่อยู่ = เลขรีจิสเตอร์ในตาราง − 1 (เช่น 3110 → 3109) · P/Q/S เป็น kW/kvar/kVA · PF รูปแบบ 4 ควอดแรนต์ จึงคำนวณ PF จาก P/S แทน', 'Holding (FC03) float32 · address = register number − 1 (3110 → 3109) · P/Q/S in kW/kvar/kVA · PF uses a 4-quadrant format, so PF is computed from P/S'),
    regs: [['I1RMS', 2999], ['I2RMS', 3001], ['I3RMS', 3003], ['I4RMS', 3005], ['U1RMS', 3027], ['U2RMS', 3029], ['U3RMS', 3031],
      ['P1', 3053, k], ['P2', 3055, k], ['P3', 3057, k], ['PSUM', 3059, k], ['Q1', 3061, k], ['Q2', 3063, k], ['Q3', 3065, k], ['QSUM', 3067, k],
      ['S1', 3069, k], ['S2', 3071, k], ['S3', 3073, k], ['SSUM', 3075, k], ['FREQ', 3109]] },
  'siemens-pac3200': { fc: 3, word: 'BE', note: B('Modbus TCP พอร์ต 502 · ออฟเซ็ตในคู่มือใช้เป็นที่อยู่ตรง ๆ · ต้องอ่านเริ่มที่ออฟเซ็ตพอดี 2 รีจิสเตอร์ · THD เป็น THD-R (เทียบค่า RMS)', 'Modbus TCP port 502 · the manual offset is the address · read exactly at the offset, 2 registers · THD is THD-R (relative to RMS)'),
    regs: [['U1RMS', 1], ['U2RMS', 3], ['U3RMS', 5], ['I1RMS', 13], ['I2RMS', 15], ['I3RMS', 17], ['S1', 19], ['S2', 21], ['S3', 23], ['P1', 25], ['P2', 27], ['P3', 29],
      ['Q1', 31], ['Q2', 33], ['Q3', 35], ['PF1', 37], ['PF2', 39], ['PF3', 41], ['U1THD-F', 43], ['U2THD-F', 45], ['U3THD-F', 47], ['I1THD-F', 49], ['I2THD-F', 51], ['I3THD-F', 53],
      ['FREQ', 55], ['SSUM', 63], ['PSUM', 65], ['QSUM', 67], ['PFSUM', 69], ['UUNB', 71], ['IUNB', 73]] },
  'janitza-umg96rm': { fc: 3, word: 'BE', note: B('ชุด "ค่าที่ใช้บ่อย" เริ่ม 19000 float32 big-endian · PF คำนวณจาก P/S', '"Frequently required readings" block from 19000, float32 big-endian · PF computed from P/S'),
    regs: [['U1RMS', 19000], ['U2RMS', 19002], ['U3RMS', 19004], ['I1RMS', 19012], ['I2RMS', 19014], ['I3RMS', 19016], ['I4RMS', 19018],
      ['P1', 19020], ['P2', 19022], ['P3', 19024], ['PSUM', 19026], ['S1', 19028], ['S2', 19030], ['S3', 19032], ['SSUM', 19034],
      ['Q1', 19036], ['Q2', 19038], ['Q3', 19040], ['QSUM', 19042]] }
};

// ------------------------------------------------------------------ catalog
// ingest: live-hioki (TCP 3198 commands, verified on PW3198 fw 1.08) · modbus (gateway reads registers) · csv · manual
const S = (th, en) => B(th, en);
export const METERS = [
  { id: 'hioki-pw3198', brand: 'Hioki', model: 'PW3198', kind: 'pqa', cls: 'A', harm: 50, ingest: ['live-hioki', 'csv', 'manual'], verified: true,
    io: ['LAN', 'USB', 'SD', 'RS-232C'], sw: 'PQ ONE (CSV export)',
    conn: [S('ตั้ง IP คงที่: SYSTEM → Interface → LAN (เช่น 192.168.1.62) ต่อสาย LAN เข้าสวิตช์เดียวกับ PC', 'Fixed IP: SYSTEM → Interface → LAN (e.g. 192.168.1.62), LAN cable to the same switch as the PC'),
      S('รัน CoreDash-PW3198-LIVE.bat (หรือ LIVE-MULTI) → เว็บแอปแท็บ PQ → 📡 ข้อมูลจริง', 'Run CoreDash-PW3198-LIVE.bat (or LIVE-MULTI) → web app PQ tab → 📡 Live'),
      S('ทดสอบแล้วกับเครื่องจริง: พอร์ต 3198 คำสั่ง :MEASure? ได้ U/I/P/Q/S/PF/THD/KF/peak/HF รายเฟส ทุก 1–2 วินาที', 'Verified on a real unit: port 3198, :MEASure? gives per-phase U/I/P/Q/S/PF/THD/KF/peak/HF every 1–2 s')],
    note: S('รุ่นนี้เลิกผลิตแล้ว รุ่นแทนคือ PQ3198 · รับได้ทีละ 1 การเชื่อมต่อ ปิด PQ ONE ก่อนดึงสด', 'Discontinued, replaced by the PQ3198 · one connection at a time — close PQ ONE before live pulling'),
    src: ['https://www.hioki.com/sites/default/files/document/2021-07/Quick%20Comparison%20of%20HIOKI%20PQAs.pdf'] },
  { id: 'hioki-pq3198', brand: 'Hioki', model: 'PQ3198 / PQ3100', kind: 'pqa', cls: 'A / S', harm: 50, ingest: ['csv', 'manual'],
    io: ['LAN (HTTP/FTP)', 'USB', 'SD', 'RS-232C'], sw: 'PQ ONE (CSV export) · GENNECT',
    conn: [S('ตั้ง IP คงที่ แล้วเปิด http://<IP>/ ดูหน้าจอระยะไกล หรือดาวน์โหลดไฟล์ผ่าน FTP', 'Set a fixed IP, then http://<IP>/ for the remote screen or FTP to download files'),
      S('เปิดข้อมูลใน PQ ONE → Export CSV (ค่า trend) → นำเข้าในแท็บนี้', 'Open the data in PQ ONE → export CSV (trend values) → import here'),
      S('อยากดึงสด: ลองเมนู 6 ของเครื่องมือภาคสนาม (ทดสอบคำสั่ง) ส่งผลมาให้ก่อน — ยังไม่ได้ยืนยันกับรุ่นนี้', 'For live data: run field-tool menu 6 (command test) and send the result — not yet verified on this model')],
    note: S('PQ3198 = Class A, PQ3100 = Class S · PQ ONE มีรายงาน EN 50160 และ IEEE 519 TDD', 'PQ3198 = Class A, PQ3100 = Class S · PQ ONE reports EN 50160 and IEEE 519 TDD'),
    src: ['https://valuetronics.com/apps/aeo/ai/md/default/products/8125924540663.md', 'https://www.hioki.com/us-en/products/pqa/power-quality/id_6735'] },
  { id: 'fluke-1770', brand: 'Fluke', model: '1773 / 1775 / 1777', kind: 'pqa', cls: 'A', harm: 50, ingest: ['csv', 'manual'],
    io: ['Ethernet', 'Wi-Fi/BLE', 'USB-C', 'USB stick'], sw: 'Energy Analyze Plus (export CSV)',
    conn: [S('ต่อ Ethernet หรือ Wi-Fi แล้วเปิด Energy Analyze Plus → Add instrument → ดาวน์โหลด session ได้ระหว่างบันทึก', 'Ethernet or Wi-Fi → Energy Analyze Plus → Add instrument → download a session even while it is still logging'),
      S('Export → CSV (เลือก V, A, W, var, VA, PF, Hz, THD) → นำเข้าในแท็บนี้', 'Export → CSV (pick V, A, W, var, VA, PF, Hz, THD) → import here')],
    note: S('1775 สุ่ม 1 MHz, 1777 สุ่ม 20 MHz จับทรานเซียนต์ · ซอฟต์แวร์เทียบ EN 50160 / IEEE 519 ได้', '1775 samples at 1 MHz, 1777 at 20 MHz for transients · the software checks EN 50160 / IEEE 519'),
    src: ['https://regression.fluke.com/en-in/product/electrical-testing/power-quality/1773-1775-1777', 'https://www.instrumentation2000.com/fluke-1777-power-quality-analyzer.html'] },
  { id: 'fluke-435', brand: 'Fluke', model: '435-II / 437-II', kind: 'pqa', cls: 'A', harm: 50, ingest: ['csv', 'manual'],
    io: ['USB mini-B', 'Wi-Fi SD', 'Fluke Connect'], sw: 'PowerLog 430-II (export CSV)',
    conn: [S('ตั้งค่า Logger → บันทึกลง SD → ต่อ USB/Wi-Fi SD → PowerLog 430-II → Export CSV', 'Set up Logger → record to SD → USB / Wi-Fi SD → PowerLog 430-II → export CSV'),
      S('ดูสดบนมือถือผ่าน Fluke Connect (ไม่มี API เปิดให้ระบบอื่นอ่าน) — ใช้ CSV หรือป้อนค่าจากหน้าจอ', 'Live view on a phone via Fluke Connect (no open API) — use CSV or type the screen values')],
    note: S('434-II = Class S, 435-II/437-II = Class A · Energy Loss Calculator แยกกำลังสูญเสียจากฮาร์มอนิก/ไม่สมดุล', '434-II = Class S, 435-II/437-II = Class A · Energy Loss Calculator splits losses from harmonics/unbalance'),
    src: ['https://static.rapidonline.com/pdf/561854_v1.pdf', 'https://regression.fluke.com/en-gb/product/electrical-testing/power-quality/437-series-ii'] },
  { id: 'ca-8345', brand: 'Chauvin Arnoux', model: 'C.A 8345 Qualistar Class A', kind: 'pqa', cls: 'A', harm: 63, ingest: ['csv', 'manual'],
    io: ['Ethernet', 'Wi-Fi', 'Web server', 'USB', 'SD'], sw: 'PAT3 / DataView (export CSV)',
    conn: [S('Ethernet (DHCP หรือ IP คงที่) หรือ Wi-Fi → เปิดเว็บเซิร์ฟเวอร์ของเครื่องดูหน้าจอสด', 'Ethernet (DHCP or fixed) or Wi-Fi → open the built-in web server for a live screen'),
      S('PAT3 ดึงข้อมูลผ่าน USB/Ethernet/Wi-Fi หรืออ่าน SD → Export CSV → นำเข้า', 'PAT3 downloads over USB/Ethernet/Wi-Fi or reads the SD → export CSV → import')],
    note: S('ฮาร์มอนิก DC ถึงลำดับ 63 รวมค่า DC · แสดง N, Q1, D (กำลังฮาร์มอนิก) ตรง ๆ', 'Harmonics DC to the 63rd including DC · shows N, Q1, D (harmonic power) directly'),
    src: ['https://tester.co.uk/chauvin-arnoux-ca8345-qualistar-class-a-power-quality-analyser', 'https://cauk.tv/wp-content/uploads/2022/03/CA8435-Sales-Presentation.pdf'] },
  { id: 'ca-8336', brand: 'Chauvin Arnoux', model: 'C.A 8336 Qualistar+', kind: 'pqa', cls: 'B', harm: 50, ingest: ['csv', 'manual'],
    io: ['USB', 'SD'], sw: 'PAT2 / DataView (export CSV)',
    conn: [S('บันทึกลง SD หรือดึงผ่าน USB ด้วย PAT/DataView → Export CSV → นำเข้า', 'Record to SD or download over USB with PAT/DataView → export CSV → import')],
    note: S('ตระกูล 8331/8333/8336/8436 เป็น IEC 61000-4-30 Class B — พอสำหรับไล่ปัญหา ไม่ใช่งานรับรอง', '8331/8333/8336/8436 are IEC 61000-4-30 Class B — fine for troubleshooting, not certification'),
    src: ['https://cauk.tv/wp-content/uploads/2022/03/CA8435-Sales-Presentation.pdf'] },
  { id: 'kyoritsu-6315', brand: 'Kyoritsu', model: 'KEW 6315', kind: 'pqa', cls: 'S', harm: 50, ingest: ['csv', 'manual'],
    io: ['USB', 'Bluetooth', 'SD'], sw: 'KEW Windows for KEW6315 · KEW Smart 6315 (Android)',
    conn: [S('Quick Start Guide บนเครื่อง → เลือก 3P4W/3P3W → Wiring check ต้องขึ้น OK ก่อนเริ่มบันทึก', 'On-unit Quick Start Guide → 3P4W/3P3W → wiring check must show OK before recording'),
      S('ดึงไฟล์จาก SD/USB ด้วย KEW Windows → บันทึกเป็น CSV → นำเข้า', 'Pull files from SD/USB with KEW Windows → save CSV → import')],
    note: S('4 ช่องกระแส (วัด IN ได้) · ราคาย่อมเยา ใช้กันมากในไทย', '4 current channels (measures IN) · affordable, common in Thailand'),
    src: ['https://ledaelectronics.com.au/product/kyoritsu-6315-power-quality-meter', 'https://duncaninstr.com/products/kyoritsu-6315-power-quality-analyzer'] },
  { id: 'yokogawa-cw500', brand: 'Yokogawa', model: 'CW500', kind: 'pqa', cls: 'S', harm: 50, ingest: ['csv', 'manual'],
    io: ['USB', 'Bluetooth*', 'SD'], sw: 'CW500 Viewer (export CSV)',
    conn: [S('Quick start guide → เลือกการต่อสาย → Wiring check → ตั้งช่วงบันทึก', 'Quick start guide → wiring → wiring check → recording interval'),
      S('อ่าน SD/USB ด้วย CW500 Viewer → CSV → นำเข้า (Bluetooth มีเฉพาะบางประเทศ)', 'Read SD/USB with CW500 Viewer → CSV → import (Bluetooth only in some countries)')],
    note: S('คำนวณขนาดคาปาซิเตอร์แก้ PF ได้บนเครื่อง', 'Can size a PF-correction capacitor on the unit'),
    src: ['https://core.instrumart.com/assets/Yoko-CW500-datasheet.pdf'] },
  { id: 'metrel-2892', brand: 'Metrel', model: 'MI 2892 Power Master', kind: 'pqa', cls: 'A', harm: 50, ingest: ['csv', 'manual'],
    io: ['Ethernet', 'USB', 'RS-232', 'microSD'], sw: 'PowerView3 (export)',
    conn: [S('PowerView3 ดาวน์โหลดผ่าน USB/Ethernet หรือ microSD → Export ตาราง → นำเข้า', 'PowerView3 downloads over USB/Ethernet or microSD → export the table → import')],
    note: S('คิดกำลังตาม IEEE 1459 (แยก fundamental / non-active / unbalance)', 'Power per IEEE 1459 (fundamental / non-active / unbalance split)'),
    src: ['https://www.tester.co.uk/files/get/download/id/8640/metrel-mi2892-powermaster-power-quality-analyser-datasheet.pdf'] },
  { id: 'schneider-pm5560', brand: 'Schneider Electric', model: 'PowerLogic PM5560 / PM5563', kind: 'panel', cls: '0.2S (kWh)', harm: 63, ingest: ['modbus', 'csv', 'manual'],
    io: ['Modbus TCP', 'Modbus RTU (RS-485)'], sw: 'EcoStruxure / Modbus',
    conn: [S('ตั้ง IP ที่หน้าเครื่อง (Comm → Ethernet) แล้วเพิ่มใน config ของ Gateway (สร้าง YAML ด้านล่าง)', 'Set the IP on the meter (Comm → Ethernet) and add it to the gateway config (YAML below)'),
      S('ทดสอบก่อนด้วยความถี่: อ่านที่อยู่ 3109 ต้องได้ ~50.00 Hz ถ้าได้แสดงว่าที่อยู่/ลำดับไบต์ถูก', 'Test with frequency first: address 3109 must read ~50.00 Hz — then addressing and byte order are right')],
    note: S('ติดตั้งถาวรในตู้ — อ่านสดได้ตลอด 24 ชม. ไม่ต้องยกเครื่องวัดพกพาไปตั้ง · THD อยู่ในตาราง Excel ของรุ่น เพิ่มเองได้ในโปรไฟล์ custom', 'Fixed in the panel — live 24 h without a portable analyser · THD is in the model\'s Excel list; add it in a custom profile'),
    src: ['https://www.productinfo.schneider-electric.com/pm3200/pm3200-user-manual/PM3200%20User%20Manual/English/BM_PM3200SeriesUserManual_0000831598.ditamap/$/C_CurrentVoltagePowerPowerFactorAndFrequency_0000844798', 'https://apc.com/id/en/faqs/FA234017'] },
  { id: 'siemens-pac3200', brand: 'Siemens', model: 'SENTRON PAC3200 / PAC4200', kind: 'panel', cls: '0.5S', harm: 31, ingest: ['modbus', 'csv', 'manual'],
    io: ['Modbus TCP (Ethernet)', 'RS-485 (module)'], sw: 'powermanager / Modbus',
    conn: [S('เครื่องมาจากโรงงานเป็นโปรโตคอล SEAbus TCP ต้องเปลี่ยน: F4 → SETTINGS → COMMUNICATION → Modbus TCP', 'Ships with SEAbus TCP — switch it: F4 → SETTINGS → COMMUNICATION → Modbus TCP'),
      S('เพิ่มใน config ของ Gateway (YAML ด้านล่าง) · PAC4200 ใช้ออฟเซ็ตเดียวกันสำหรับค่าเหล่านี้', 'Add to the gateway config (YAML below) · the PAC4200 uses the same offsets for these values')],
    note: S('THD ที่ได้เป็น THD-R (เทียบ RMS) ค่าจะต่ำกว่า THD-F เล็กน้อยเมื่อเพี้ยนมาก', 'THD is THD-R (vs RMS) — reads a little lower than THD-F at high distortion'),
    src: ['https://docs.cybus.io/guides/machine-connectivity/robots-sensors-shop-floor-devices/connecting-a-siemens-sentron-pac3200-power-meter', 'https://www.aggsoft.com/serial-data-logger/tutorials/modbus-data-logging/siemens-sentron-pac-2200.htm'] },
  { id: 'janitza-umg96rm', brand: 'Janitza', model: 'UMG 96RM-E / -P', kind: 'panel', cls: '0.5S', harm: 40, ingest: ['modbus', 'csv', 'manual'],
    io: ['Modbus TCP', 'Modbus RTU', 'web page'], sw: 'GridVis (export CSV)',
    conn: [S('ตั้ง IP แล้วเพิ่มใน config ของ Gateway · ค่าที่ใช้บ่อยอยู่ในบล็อก 19000–19042', 'Set the IP and add it to the gateway config · common values are in the 19000–19042 block'),
      S('ถ้าค่าเพี้ยนเป็นเลขแปลก ๆ ให้ลองสลับลำดับเวิร์ด (wordSwap)', 'If values look like garbage, try swapping the word order (wordSwap)')],
    note: S('รุ่นอื่นของ UMG (604/605/511) ใช้ตารางคนละชุด ต้องเลือกโปรไฟล์ custom', 'Other UMG models (604/605/511) use other tables — use a custom profile'),
    src: ['https://docs.cybus.io/guides/machine-connectivity/robots-sensors-shop-floor-devices/connecting-a-janitza-umg-power-analyzer', 'https://manualslib.com/manual/1345480/Janitza-Umg-96rm-P.html?page=114'] },
  { id: 'eastron-sdm630', brand: 'Eastron', model: 'SDM630 (Modbus)', kind: 'panel', cls: '1 (kWh)', harm: 0, ingest: ['modbus', 'manual'],
    io: ['RS-485 Modbus RTU'], sw: 'Modbus (ตัวแปลง RS-485→USB/LAN)',
    conn: [S('ต่อ A/B ของ RS-485 (สายคู่บิดเกลียว) → ตัวแปลง USB-RS485 หรือ RS485-to-Ethernet เข้า PC/Gateway', 'Wire RS-485 A/B (twisted pair) → USB-RS485 or RS485-to-Ethernet converter → PC/gateway'),
      S('ดูที่หน้าจอเครื่อง: ID, baud (มัก 9600), parity ให้ตรงกับ config · อ่าน input register (FC04)', 'Check ID, baud (often 9600) and parity on the meter screen and match the config · read input registers (FC04)')],
    note: S('ราคาถูก นิยมติดตามตู้ย่อย มี THD-U/THD-I รายเฟส แต่ไม่มีฮาร์มอนิกรายลำดับ ไม่มีจับเหตุการณ์ — ใช้เฝ้าดูแนวโน้ม ไม่แทนเครื่องวิเคราะห์', 'Cheap and common on sub-panels; per-phase THD-U/THD-I but no per-order harmonics or event capture — for trends, not a PQ analyser'),
    src: ['https://esphome.io/api/sdm__meter__registers_8h_source', 'https://communityarchive.victronenergy.com/storage/attachments/sdm630-modbus-protocol.pdf'] },
  { id: 'custom-modbus', brand: 'อื่น ๆ / Other', model: 'Modbus (กำหนดเอง)', kind: 'panel', cls: '—', harm: null, ingest: ['modbus', 'csv', 'manual'],
    io: ['Modbus TCP', 'Modbus RTU'], sw: 'ตารางรีจิสเตอร์จากคู่มือ',
    conn: [S('เปิดตาราง Modbus จากคู่มือรุ่นนั้น ใส่ที่อยู่ float32 ของ U1–U3, I1–I3, P, Q, S, PF, f, THD ในช่อง registers ของ YAML', 'Take the Modbus table from the meter manual and put the float32 addresses of U1–U3, I1–I3, P, Q, S, PF, f, THD into the YAML registers'),
      S('เช่น Socomec DIRIS, Accuenergy Acuvim, Lovato DMG, Rishabh — ใช้วิธีเดียวกัน', 'e.g. Socomec DIRIS, Accuenergy Acuvim, Lovato DMG, Rishabh — same method')],
    note: S('ใช้ได้ทุกยี่ห้อที่มี Modbus และส่งค่าเป็น float32', 'Works with any brand that has Modbus and float32 values'), src: [] }
];
export const meterById = (id) => METERS.find((m) => m.id === id) || null;
export const INGEST = {
  'live-hioki': B('📡 ดึงสดผ่าน LAN (ทดสอบแล้ว)', '📡 Live over LAN (verified)'),
  modbus: B('🔗 ดึงสด Modbus ผ่าน Gateway', '🔗 Live Modbus via the gateway'),
  csv: B('📁 นำเข้าไฟล์ CSV', '📁 CSV import'),
  manual: B('✍ ป้อนค่าจากหน้าจอ', '✍ Type the screen values')
};

// ------------------------------------------------------------------ Modbus reading (shared by gateway + tests)
export function planReads(regs, { maxLen = 100, maxGap = 8 } = {}) {
  const sorted = [...regs].sort((a, b) => a[1] - b[1]);
  const blocks = [];
  for (const r of sorted) {
    const end = r[1] + 2, last = blocks[blocks.length - 1];
    if (last && r[1] - last.end <= maxGap && end - last.start <= maxLen) { last.end = Math.max(last.end, end); last.regs.push(r); }
    else blocks.push({ start: r[1], end, regs: [r] });
  }
  return blocks;
}
export function f32(hi, lo, swap = false) {
  const dv = new DataView(new ArrayBuffer(4));
  const [a, b] = swap ? [lo, hi] : [hi, lo];
  dv.setUint16(0, a & 0xffff); dv.setUint16(2, b & 0xffff);
  const v = dv.getFloat32(0);
  return Number.isFinite(v) && Math.abs(v) < 1e12 ? v : null;
}
// read(fc, start, count) → Promise<number[]> (uint16 words). Returns the canonical "named" dictionary.
export async function readProfile(profile, read) {
  const swap = profile.word === 'swap' || profile.wordSwap === true;
  const named = {};
  for (const b of planReads(profile.regs)) {
    const words = await read(profile.fc || 3, b.start, b.end - b.start);
    for (const [key, addr, scale] of b.regs) {
      const i = addr - b.start, v = f32(words[i], words[i + 1], swap);
      named[key.toUpperCase()] = v == null ? null : Math.round(v * (scale || 1) * 1e4) / 1e4;
    }
  }
  return complete(named);
}

// ------------------------------------------------------------------ fill what a source does not give
// Hioki sign convention is kept: PF and Q negative = leading (capacitive).
export function complete(n) {
  const g = (x) => (n[x] == null || !Number.isFinite(n[x]) ? null : n[x]);
  for (const p of [1, 2, 3]) {
    if (g('S' + p) == null && g('U' + p + 'RMS') != null && g('I' + p + 'RMS') != null) n['S' + p] = g('U' + p + 'RMS') * g('I' + p + 'RMS');
    if (g('PF' + p) == null && g('P' + p) != null && g('S' + p)) n['PF' + p] = Math.min(1, Math.abs(g('P' + p) / g('S' + p))) * (g('Q' + p) != null && g('Q' + p) < 0 ? -1 : 1);
  }
  const sum3 = (x) => ([1, 2, 3].every((p) => g(x + p) != null) ? g(x + 1) + g(x + 2) + g(x + 3) : null);
  for (const x of ['P', 'Q', 'S']) if (g(x + 'SUM') == null && sum3(x) != null) n[x + 'SUM'] = sum3(x);
  if (g('PFSUM') == null && g('PSUM') != null && g('SSUM')) n.PFSUM = Math.min(1, Math.abs(g('PSUM') / g('SSUM'))) * (g('QSUM') != null && g('QSUM') < 0 ? -1 : 1);
  else if (g('PFSUM') != null && g('QSUM') != null) n.PFSUM = Math.abs(g('PFSUM')) * (g('QSUM') < 0 ? -1 : 1);
  return n;
}
export function toRecord(id, named, src = {}) {
  const rec = pw3198Record(id, complete({ ...named }));
  rec.src = src; rec.live = src.via !== 'csv';
  return rec;
}

// ------------------------------------------------------------------ CSV import
const P1 = ['1', 'l1', 'l1n', 'an', 'a', 'r', 'ch1', 'ph1', 'phase1', 'phasea', 'l1g'];
const P2 = ['2', 'l2', 'l2n', 'bn', 'b', 's', 'ch2', 'ph2', 'phase2', 'phaseb', 'l2g'];
const P3 = ['3', 'l3', 'l3n', 'cn', 'c', 't', 'ch3', 'ph3', 'phase3', 'phasec', 'l3g'];
const PN = ['4', 'n', 'l4', 'ch4', 'neutral'];
const TOT = ['', 'sum', 'total', 'tot', '3ph', 'all', 'system', 'avg3'];
const PRE = {
  U: ['u', 'v', 'urms', 'vrms', 'voltage', 'volt', 'volts', 'uln', 'vln', 'voltageln', 'vrmsln', 'urmsln', 'voltagerms', 'phasevoltage'],
  I: ['i', 'a', 'irms', 'arms', 'current', 'amp', 'amps', 'currentrms'],
  P: ['p', 'w', 'kw', 'activepower', 'realpower', 'power', 'pactive', 'watt', 'watts'],
  Q: ['q', 'var', 'kvar', 'reactivepower', 'reactive', 'qreactive'],
  S: ['s', 'va', 'kva', 'apparentpower', 'apparent'],
  PF: ['pf', 'powerfactor', 'lambda', 'λ', 'truepf'],
  THDU: ['uthd', 'vthd', 'thdu', 'thdv', 'thdvolt', 'thdvoltage', 'voltagethd', 'uthdf', 'vthdf', 'thduf', 'thdvf', 'uthdr', 'thdur'],
  THDI: ['ithd', 'athd', 'thdi', 'thda', 'thdcurrent', 'currentthd', 'ithdf', 'thdif', 'athdf', 'thdaf', 'ithdr', 'thdir']
};
let ALIAS = null;
function aliases() {
  if (ALIAS) return ALIAS;
  const m = new Map();
  const add = (c, key) => { if (!m.has(c)) m.set(c, []); if (!m.get(c).includes(key)) m.get(c).push(key); };
  const both = (pre, ph, key, sfx = ['', 'rms']) => { for (const p of pre) for (const h of ph) for (const s of sfx) { add(p + h + s, key); add(h + p + s, key); } };
  // totals first: "va" alone is apparent power, not "voltage phase A" (a unit in the header still decides)
  for (const t of TOT) { for (const p of PRE.S) add(p + t, 'SSUM'); for (const p of PRE.P) add(p + t, 'PSUM'); for (const p of PRE.Q) add(p + t, 'QSUM'); for (const p of PRE.PF) add(p + t, 'PFSUM'); }
  [P1, P2, P3].forEach((ph, i) => {
    const n = i + 1;
    both(PRE.U, ph, `U${n}RMS`); both(PRE.I, ph, `I${n}RMS`);
    both(PRE.P, ph, `P${n}`, ['']); both(PRE.Q, ph, `Q${n}`, ['']); both(PRE.S, ph, `S${n}`, ['']); both(PRE.PF, ph, `PF${n}`, ['']);
    both(PRE.THDU, ph, `U${n}THD-F`, ['']); both(PRE.THDI, ph, `I${n}THD-F`, ['']);
    for (const h of ph) for (const p of ['u', 'v']) for (const s of ['thd', 'thdf', 'thdr']) { add(p + h + s, `U${n}THD-F`); add('thd' + p + h, `U${n}THD-F`); }
    for (const h of ph) for (const p of ['i', 'a']) for (const s of ['thd', 'thdf', 'thdr']) { add(p + h + s, `I${n}THD-F`); add('thd' + p + h, `I${n}THD-F`); }
  });
  both(PRE.I, PN, 'I4RMS');
  for (const c of ['f', 'freq', 'frequency', 'hz', 'linefrequency', 'fhz']) add(c, 'FREQ');
  for (const c of ['uunb', 'vunb', 'unbalanceu', 'unbalancev', 'voltageunbalance', 'uunbalance', 'vunbalance', 'unbu', 'unbv', 'u2u1', 'vneg', 'uneg']) add(c, 'UUNB');
  for (const c of ['iunb', 'aunb', 'unbalancei', 'currentunbalance', 'iunbalance', 'unbi', 'i2i1']) add(c, 'IUNB');
  ALIAS = m; return m;
}
const UNIT_Q = { v: 'U', kv: 'U', a: 'I', ka: 'I', w: 'P', kw: 'P', mw: 'P', var: 'Q', kvar: 'Q', mvar: 'Q', va: 'S', kva: 'S', mva: 'S', hz: 'f', '%': 'THD' };
const UNIT_K = { kw: 1e3, kvar: 1e3, kva: 1e3, mw: 1e6, mvar: 1e6, mva: 1e6, kv: 1e3, ka: 1e3 };
// one header cell → { key, stat, scale } or null
export function classifyHeader(raw) {
  let h = String(raw || '').trim().toLowerCase();
  let unit = '';
  const um = h.match(/[[(]\s*([kmμ]?(?:var|va|w|v|a|hz)|%)\s*[\])]/);
  if (um) { unit = um[1]; h = h.replace(um[0], ' '); }
  h = h.replace(/[[(][^\])]*[\])]/g, ' ');
  let stat = 'avg';
  if (/(^|[^a-z])(min|minimum)([^a-z]|$)/.test(h)) stat = 'min'; else if (/(^|[^a-z])(max|maximum|peak)([^a-z]|$)/.test(h)) stat = 'max';
  h = h.replace(/(^|[^a-z])(avg|ave|average|mean|min|minimum|max|maximum|inst|instant|value|rms_?avg)(?=[^a-z]|$)/g, '$1');
  h = h.replace(/(^|[^a-z])(l[123])-?n(?=[^a-z]|$)/g, '$1$2n');
  let c = h.replace(/[^a-z0-9λ]/g, '');
  if (!c) return null;
  let list = aliases().get(c);
  // trailing unit word without brackets ("P_sum_kW", "Freq Hz") — only when the name alone is not understood
  const tu = h.match(/[\s_]+(kw|kvar|kva|w|var|va|hz|v|a)\s*$/);
  if (!list && !unit && tu) { unit = tu[1]; c = h.slice(0, h.length - tu[0].length).replace(/[^a-z0-9λ]/g, ''); list = aliases().get(c); }
  if (!list) return null;
  const uq = UNIT_Q[unit] || null;
  const pick = uq ? list.find((key) => { const q = CANON[key]; return q === uq || (uq === 'THD' && (q === 'THD' || q === 'UNB')); }) : list[0];
  if (!pick) return null;
  const kName = !unit && /^(kw|kvar|kva)/.test(c) ? 1e3 : 1;
  return { key: pick, stat, scale: UNIT_K[unit] || kName, unit };
}
function splitLine(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === d && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out.map((s) => s.trim());
}
function num(s, decComma) {
  if (s == null) return null;
  let t = String(s).trim().replace(/^\+/, '');
  if (!t || /^(-|--|n\/?a|over|ovr|invalid|\*+)$/i.test(t)) return null;
  if (decComma) t = t.replace(/\./g, '').replace(',', '.');
  const v = Number(t);
  if (!Number.isFinite(v) || Math.abs(v) >= 9e98) return null; // Hioki "+9999.9E+99" = invalid
  return v;
}
// text → { header, rows, map:{KEY:{col,scale,stat}}, delim, headerLine }
export function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { header: [], rows: [], map: {}, delim: ',', headerLine: -1 };
  const sample = lines.slice(0, 60).join('\n');
  const cnt = (c) => (sample.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
  const delim = ['\t', ';', ','].map((c) => [c, cnt(c)]).sort((a, b) => b[1] - a[1])[0][0];
  const decComma = delim === ';' && /\d,\d/.test(sample);
  let best = { i: -1, n: 0, map: {} };
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const cells = splitLine(lines[i], delim);
    if (cells.length < 3) continue;
    const map = buildMap(cells);
    const n = Object.keys(map).length;
    if (n > best.n) best = { i, n, map };
  }
  if (best.i < 0) return { header: [], rows: [], map: {}, delim, headerLine: -1 };
  const header = splitLine(lines[best.i], delim);
  const rows = [];
  for (const l of lines.slice(best.i + 1)) {
    const cells = splitLine(l, delim);
    if (cells.length < header.length * 0.6) continue;
    const vals = cells.map((c) => num(c, decComma));
    if (vals.filter((v) => v != null).length < 2) continue;
    rows.push({ cells, vals });
  }
  return { header, rows, map: best.map, delim, headerLine: best.i };
}
export function buildMap(header) {
  const rank = { avg: 0, max: 1, min: 2 };
  const map = {};
  header.forEach((h, col) => {
    const c = classifyHeader(h); if (!c) return;
    const cur = map[c.key];
    if (!cur || rank[c.stat] < rank[cur.stat]) map[c.key] = { col, scale: c.scale, stat: c.stat };
  });
  return map;
}
// rows → named dictionary. mode: last | avg | worst (row with the highest current / apparent power)
export function csvNamed(parsed, { mode = 'avg', map = parsed.map } = {}) {
  const rows = parsed.rows; if (!rows.length) return null;
  const val = (row, m) => (row.vals[m.col] == null ? null : row.vals[m.col] * (m.scale || 1));
  let pick = rows;
  if (mode === 'last') pick = [rows[rows.length - 1]];
  else if (mode === 'worst') {
    const score = (r) => { const s = map.SSUM && val(r, map.SSUM); if (s != null) return s; return ['I1RMS', 'I2RMS', 'I3RMS'].reduce((a, k2) => a + (map[k2] ? val(r, map[k2]) || 0 : 0), 0); };
    pick = [rows.reduce((b, r) => (score(r) > score(b) ? r : b), rows[0])];
  }
  const named = {};
  for (const [key, m] of Object.entries(map)) {
    if (!m || m.col == null || m.col < 0) continue;
    const v = pick.map((r) => val(r, m)).filter((x) => x != null);
    named[key] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  // power columns without a unit that are really kW: Σ U·I is ~1000× larger than the column
  const ui = [1, 2, 3].reduce((a, p) => a + (named[`U${p}RMS`] || 0) * (named[`I${p}RMS`] || 0), 0);
  for (const x of ['PSUM', 'SSUM', 'QSUM']) {
    const m = map[x];
    if (m && m.scale === 1 && named[x] && ui > 0 && ui / Math.abs(named[x]) > 300 && ui / Math.abs(named[x]) < 3000) {
      named[x] *= 1000; for (const p of [1, 2, 3]) if (named[x[0] + p] != null && map[x[0] + p] && map[x[0] + p].scale === 1) named[x[0] + p] *= 1000;
    }
  }
  return { named, rowsUsed: pick.length, rowsTotal: rows.length };
}
export function csvRecord(id, text, opt = {}) {
  const parsed = parseCsv(text);
  const r = csvNamed(parsed, opt);
  if (!r) return { parsed, record: null };
  return { parsed, ...r, record: toRecord(id, r.named, { via: 'csv', meter: opt.meter || null, mode: opt.mode || 'avg' }) };
}

// ------------------------------------------------------------------ gateway YAML for a Modbus meter
export function gatewayYaml({ meter, id = 'PQ-MAIN', no = 2, name = 'MAIN', host = '192.168.1.70', port = 502, unitId = 1, rtu = false, path = 'COM3', baud = 9600, parity = 'none' }) {
  const prof = MODBUS[meter] ? meter : 'custom';
  const lines = [
    '# วางใน "pq: instruments:" ของไฟล์ config ของ Gateway',
    `    - id: ${id}`, `      no: ${no}`, `      name: ${name}`, `      driver: modbus`, `      profile: ${prof}`,
    ...(rtu ? [`      path: ${path}          # พอร์ต RS-485 (Windows: COMx, Linux: /dev/ttyUSB0)`, `      baudRate: ${baud}`, `      parity: ${parity}`] : [`      host: ${host}`, `      port: ${port}`]),
    `      unitId: ${unitId}`, '      pollMs: 1000'
  ];
  if (prof === 'custom') lines.push('      fc: 3', '      wordSwap: false', '      registers:            # ที่อยู่ float32 จากคู่มือ (0-based)', '        - [U1RMS, 0]', '        - [I1RMS, 6]', '        - [PSUM, 52]        # [key, address, scale] — scale 1000 ถ้าเป็น kW');
  return lines.join('\n');
}
