// CoreDash Nexus — installable mobile web app (PWA). Developed by CoreDash Technology.
// Data comes from the CoreDash Gateway over WebSocket (live) or from a built-in plant simulator (demo).
import { CoreDashClient } from './coredash-client.mjs';
import { createTwin } from './twin.js';
import { BenchSim, createBenchView, TANKS, STEPS, flowPoints, MODELS, MODEL_NAMES, POSITIONS, POS_COLORS, dialSvg } from './bench.js';
import { PowerSim, createPowerView, pfColor } from './power.js';
import { createPqView } from './pq.js';
import { createRealCamView } from './realcam.js';
import { loadImage as ocrLoadImage, locateRegister, locateByColour, readRegister, getWorker as ocrWorker } from './meter-ocr.js';
import { HomeSim, createHomeView, drawCam, LIGHTS as HL, LOADS as HLOADS, VALVES as HV, CAMS } from './home.js';
import { MACHINES as PMACH, FIXES, TARIFF_DEFAULT, averages, fixKey } from './power-sim.js';
import { reportHTML, buildXlsx, curveChart, barChart, summarize, docNumber, RT } from './report.js';

const B = (th, en) => ({ th, en });
const store = {
  get(k, d) { try { const v = localStorage.getItem('cdn.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('cdn.' + k, JSON.stringify(v)); } catch (_) { /* private mode */ } }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const n1 = (x) => (x == null || Number.isNaN(x) ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hhmm = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- text
const L = {
  th: {
    site: 'โรงงาน A · บางนา', home: 'หน้าหลัก', overview: 'ภาพรวมโรงงาน', control: 'ควบคุม', alerts: 'แจ้งเตือน', report: 'รายงาน',
    kwNow: 'kW ตอนนี้', usedToday: 'ใช้ไฟวันนี้', estCost: 'ค่าไฟประมาณ', peakLimit: 'เพดาน Peak 320 kW', waterFlow: 'อัตราการใช้น้ำ', tankLevel: 'ระดับถัง T-1',
    machRun: 'เครื่องจักรทำงาน', lightsOn: 'ไฟเปิดอยู่', zones: 'โซน', scenes: 'สั่งงานด่วน (Scenes)', sMorning: 'เริ่มกะเช้า', sLunch: 'พักเที่ยง', sOff: 'ปิดโรงงาน',
    power: 'กำลังไฟฟ้าล่าสุด', allOk: 'ทุกระบบทำงานปกติ', allOkSub: 'อุปกรณ์ออนไลน์ครบ', hasAlerts: 'มีแจ้งเตือน', items: 'รายการ',
    waterSys: 'ระบบน้ำ', tapHint: 'แตะอุปกรณ์เพื่อสั่งการ', well: 'บ่อน้ำดิบ', tank: 'ถัง', line: 'ไลน์ผลิต', coolLoop: 'วงจรน้ำหล่อเย็น', mold: 'แม่พิมพ์',
    segM: 'เครื่องจักร', segL: 'แสงสว่าง', segV: 'วาล์ว', run: 'ทำงาน', stop: 'หยุด', fault: 'ฟอลต์', closed: 'ปิด', openP: 'เปิด ', opening: 'กำลังเปิด', closing: 'กำลังปิด',
    close: 'ปิด', open: 'เปิด', dim: 'หรี่ไฟ', lamps: 'ดวง', unacked: 'ยังไม่รับทราบ', ack: 'รับทราบ', viewEq: 'ดูอุปกรณ์', acked: 'รับทราบแล้ว', noAlerts: 'ไม่มีแจ้งเตือน ทุกระบบปกติ', recent: 'คำสั่งล่าสุด',
    energyReport: 'รายงานพลังงาน', reportBy: 'จัดทำรายงานโดย', lastHour: 'กำลังไฟฟ้า 60 นาทีล่าสุด (kW)', avg: 'เฉลี่ย', max: 'สูงสุด', min: 'ต่ำสุด', totalElec: 'ไฟฟ้าสะสม', totalWater: 'น้ำสะสม', share: 'สัดส่วนการใช้ไฟ (ประมาณการ)', exportPdf: 'พิมพ์ / บันทึกเป็น PDF',
    confirmTitle: 'ยืนยันคำสั่ง', confirmNote: 'คำสั่งจะส่งไปที่ PLC ทันที และบันทึกใน Audit log ในชื่อของคุณ', cancel: 'ยกเลิก', confirm: 'ยืนยัน', sent: 'ส่งคำสั่งแล้ว · ', failed: 'คำสั่งไม่สำเร็จ: ',
    settings: 'ตั้งค่า', language: 'ภาษา', theme: 'โทนสีพื้นหลัง', notif: 'แจ้งเตือนบนเครื่องนี้', notifOn: 'เปิดอยู่', notifAsk: 'อนุญาตการแจ้งเตือน', notifNo: 'ไม่รองรับบนเบราว์เซอร์นี้', connection: 'การเชื่อมต่อ',
    live: 'เชื่อมต่อ Gateway', demo: 'โหมดสาธิต (ข้อมูลจำลองในเครื่อง)', offline: 'ขาดการเชื่อมต่อ — กำลังเชื่อมใหม่', logout: 'ออกจากระบบ', done: 'เสร็จสิ้น',
    about: 'เกี่ยวกับแอป', version: 'CoreDash Nexus เวอร์ชัน 1.0', devBy: 'พัฒนาโดย', devName: 'CoreDash Technology',
    install: 'ติดตั้งแอปลงเครื่อง', installBtn: 'ติดตั้ง', iosInstall: 'iPhone: แตะปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”',
    loginTitle: 'เข้าสู่ระบบ', loginLead: 'เชื่อมต่อ CoreDash Gateway ของโรงงานเพื่อดูค่าสดและสั่งการ', token: 'รหัสผู้ใช้ (API token)', gateway: 'ที่อยู่ Gateway',
    signIn: 'เข้าสู่ระบบ', demoAcc: 'ใช้บัญชีสาธิตของ Gateway', offlineDemo: 'ลองโหมดสาธิตโดยไม่ต่อ Gateway', badToken: 'รหัสไม่ถูกต้อง หรือเชื่อมต่อ Gateway ไม่ได้', gwFound: 'พบ Gateway', gwSim: '(โหมดจำลอง)', demoBanner: 'โหมดสาธิต · ข้อมูลจำลองในเครื่อง',
    role: { viewer: 'ผู้ดู (Viewer)', operator: 'ผู้ควบคุม (Operator)', engineer: 'วิศวกร (Engineer)', admin: 'ผู้ดูแลระบบ (Admin)' }, viewOnly: 'บัญชีนี้ดูได้อย่างเดียว',
    level: 'ระดับ', volume: 'ปริมาตร', inflow: 'น้ำเข้า', outflow: 'น้ำออก', pos: 'ตำแหน่ง', flow: 'อัตราไหล', amps: 'กระแส', vib: 'ความสั่น', chw: 'น้ำเย็นจ่าย', rated: 'พิกัด',
    closeIn: 'ปิดน้ำเข้า V-101', drainOpen: 'ระบาย V-103', o50: 'เปิด 50%', o100: 'เปิด 100%', closePanel: 'ปิดแผง', nothingToDo: 'ทุกอุปกรณ์อยู่ในสถานะนี้แล้ว',
    days: ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'],
    twin: 'ห้องควบคุม 3D', pid: 'แผนผัง P&ID', twinTitle: 'ห้องควบคุมเสมือน', auto: 'อัตโนมัติ', day: 'กลางวัน', night: 'กลางคืน', labels: 'ป้ายค่า', zoomIn: 'ขยาย', zoomOut: 'ย่อ', twinHint: 'แตะเครื่องจักร วาล์ว หรือโคมไฟเพื่อสั่งการ', zoneA: 'ZONE A · ไลน์ผลิต', zoneB: 'ZONE B · ฉีดพลาสติก', zoneU: 'UTILITY · น้ำ & หล่อเย็น', twinAria: 'ภาพจำลองโรงงานแบบเรียลไทม์', lux: 'ความสว่าง', on: 'เปิด', off: 'ปิด', kwNowL: 'กำลังไฟ', pf: 'Power Factor', energy: 'พลังงานสะสม', moldT: 'อุณหภูมิแม่พิมพ์', coolBy: 'ระบายความร้อนด้วย', moldNote: 'ถ้าเกิน 60 °C ระบบจะแจ้งอลาร์ม',
    bench: 'ทดสอบมาตร', benchTitle: 'แท่นทดสอบมาตรวัดน้ำ (ถังตวง)', benchStd: 'วิธีปริมาตร · ISO 4064 / OIML R 49 · ข้อมูลจำลอง', setup: 'ตั้งค่าการทดสอบ', meterUnder: 'มาตรที่ทดสอบ (ต่ออนุกรม)', spec: 'สเปกมาตร (ตามใบรับรอง)', testPoint: 'จุดทดสอบ', volume: 'ปริมาตรทดสอบ', autoVol: 'อัตโนมัติ', speed: 'ความเร็วจำลอง', runOne: 'ทดสอบ', runSet: 'ทดสอบครบชุด Q1 · Q2 · Q3', stopRun: 'หยุด', fault: 'จำลองมาตรชำรุด', live: 'สถานะขณะทดสอบ', flowNow: 'อัตราไหล (FT-01)', simTime: 'เวลาจำลอง', eta: 'เหลือประมาณ', stepNow: 'ขั้นตอน', manual: 'โหมดช่าง: สั่งวาล์วเอง', manualHint: 'ใช้ตรวจเช็กวาล์ว ไล่อากาศ หรือดูเซนเซอร์ทำงาน ถ้าเติมจนเต็ม เซนเซอร์กันล้น LSHH จะตัดให้อัตโนมัติ — ถ้าต้องการผลทดสอบ ให้ใช้ปุ่ม ▶ เริ่มทดสอบอัตโนมัติ', fillAt: 'เติมที่', closeAll: 'ปิดทั้งหมด', results: 'ผลการทดสอบ', colMeter: 'มาตร', colPoint: 'จุด', colQ: 'อัตราไหล', colVref: 'ปริมาตรอ้างอิง', colVm: 'มาตรอ่านได้', colE: 'ค่าผิดพลาด', colMpe: 'เกณฑ์', colRes: 'ผล', pass: 'ผ่าน', failR: 'ไม่ผ่าน', clear: 'ล้างผล', noResults: 'ยังไม่มีผล กด ▶ เริ่มทดสอบอัตโนมัติ ในขั้นที่ 4', curve: 'กราฟค่าผิดพลาดเทียบเกณฑ์ (เส้นประ = เกณฑ์ ±5% / ±2%)', guide: 'ตำแหน่งเซนเซอร์และอุปกรณ์', gSensor: 'อุปกรณ์', gWhere: 'ติดตั้งที่', gWhy: 'หน้าที่', gType: 'ชนิดที่แนะนำ', neckTitle: 'ทำไมเซนเซอร์ปริมาตรต้องอยู่ที่คอถังแคบ', neckText: 'คอ Ø50 มม. จุ 1.96 มล./มม. ส่วนตัวถัง Ø650 มม. จุ 332 มล./มม. เซนเซอร์คลาดเคลื่อน ±1 มม. ที่คอถัง = ±0.002 ลิตร แต่ที่ตัวถัง = ±0.33 ลิตร (มากกว่า 170 เท่า)', planTitle: 'ปริมาตรและเวลาที่แนะนำ', tankUsed: 'ถังที่ใช้', alarmOv: 'กันล้นทำงาน', reportBench: 'รายงานผลการทดสอบมาตรวัดน้ำ', benchNote: '* ค่าผิดพลาดบนรูปคือค่าจำลองขณะไหล ผลจริงคำนวณจากปริมาตรอ้างอิงที่อ่านจากคอถัง แก้อุณหภูมิเป็น 20 °C แล้ว', minutes: 'นาที', selectMeter: 'เลือกมาตรอย่างน้อย 1 ตัว', faultOn: 'จำลองชำรุด', s1pos: 'ตำแหน่งบนแท่น (แตะเพื่อเลือก/ไม่เลือก) · แก้หมายเลขเครื่องได้', dialTitle: 'หน้าปัดมาตร · ค่าเริ่มต้น / สิ้นสุด', dialHint: 'ระบบอ่านค่าตอนเริ่มและตอนจบของทุกจุดทดสอบ ขณะน้ำหยุดนิ่ง', colStart: 'เริ่มต้น (L)', colEnd: 'สิ้นสุด (L)', sumTitle: 'สรุปผลการทดสอบ', rpPreview: 'ดูตัวอย่างรายงาน', rpPdf: 'บันทึก PDF / พิมพ์', doneTitle: 'ทดสอบเสร็จแล้ว', donePass: 'ผ่าน {a} จาก {b} รายการ', savedX: 'บันทึกไฟล์แล้ว · ', tabHouse: 'บ้าน', hmTitle: 'บ้านพักอาศัย', hmSub: 'บ้านอัจฉริยะ · ข้อมูลจำลอง', hmOverview: 'ภาพรวมบ้าน', hmMeter: 'มาตรน้ำ', hmCam: 'กล้องวงจรปิด', hmLight: 'ไฟฟ้า/แสงสว่าง', hmValve: 'วาล์วน้ำ', hmHouseName: 'บ้านเลขที่ 555', hmTapHint: 'แตะไฟ กล้อง มาตรน้ำ หรือแท็งก์ในภาพเพื่อสั่งงาน', hmLightHint: 'แตะวงเหลืองในภาพเพื่อเปิด/ปิดไฟจุดนั้น', hmValveHint: 'น้ำไหลในท่อแสดงด้วยเส้นสีฟ้าเคลื่อนที่', hmAuto: 'อัตโนมัติ', hmDay: 'กลางวัน', hmNight: 'กลางคืน', hmPowerNow: 'ใช้ไฟตอนนี้', hmToday: 'วันนี้', hmLightsOn: 'ไฟที่เปิดอยู่', hmWaterNow: 'น้ำกำลังไหล', hmMeterLast: 'อ่านมาตรล่าสุด', hmCams: 'กล้องวงจรปิด', hmRec: 'บันทึกต่อเนื่อง 24 ชม.', hmMainValve: 'วาล์วน้ำหลัก', hmOpen: 'เปิด', hmClosed: 'ปิด', hmOpening: 'กำลังเปิด…', hmClosing: 'กำลังปิด…', hmTank: 'แท็งก์น้ำ', hmScHome: 'กลับถึงบ้าน', hmScNight: 'เข้านอน', hmScAway: 'ไม่อยู่บ้าน', hmScOff: 'ปิดไฟทั้งหมด', hmSceneDone: 'สั่งฉากแล้ว', hmOffS: 'ปิด', hmLightsW: 'ไฟแสงสว่างรวม', hmHouseW: 'ใช้ไฟทั้งบ้านตอนนี้', hmKwhToday: 'พลังงานวันนี้', hmCostToday: 'ค่าไฟวันนี้ (ประมาณ)', hmLightList: 'จุดไฟแสงสว่าง', hmLoads: 'เครื่องใช้ไฟฟ้าหลัก', hmPriceNote: 'ค่าไฟประมาณ 4.18 บาท/หน่วย (ค่าสมมติ) · ระบบจริงอ่านจากสมาร์ทมิเตอร์/สวิตช์อัจฉริยะ', hmFlow: 'อัตราการไหล', hmWaterToday: 'น้ำที่ใช้วันนี้', hmMeterNow: 'ค่ามาตรตอนนี้', hmValveList: 'ควบคุมวาล์วทางไกล', hmLastCmd: 'สั่งล่าสุด', hmDoOpen: 'เปิดวาล์ว', hmDoClose: 'ปิดวาล์ว', hmConfOpen: 'วาล์วจะค่อยๆ เปิดภายใน 3 วินาที และแสดงสถานะเมื่อเปิดสุด', hmConfClose: 'วาล์วจะค่อยๆ ปิดภายใน 3 วินาที น้ำจะหยุดไหลในจุดนี้', hmConfirm: 'ยืนยันสั่งงาน', hmSent: 'ส่งคำสั่งแล้ว', hmLeak: 'ตรวจพบน้ำรั่ว: มีน้ำไหลต่อเนื่องทั้งที่ไม่มีการใช้น้ำ', hmLeakSub: 'มาตรยังหมุน 0.6 ลิตร/นาที (≈ 860 ลิตร/วัน)', hmCutMain: 'ปิดวาล์วหลักทันที', hmLeakOn: 'จำลองน้ำรั่ว', hmLeakOff: 'หยุดจำลองน้ำรั่ว', hmCamSim: 'จำลอง', hmCamReal: 'กล้องจริง', hmCamTitle: 'กล้องวงจรปิด 4 ตัว', hmCamHint: 'แตะเพื่อดูภาพเต็มจอ · กลางคืนเปลี่ยนเป็นอินฟราเรดอัตโนมัติ', hmCamNote: 'ภาพเป็นการจำลอง · ต่อของจริงผ่าน NVR/กล้อง IP (RTSP → WebRTC) ที่เกตเวย์', hmSnap: 'ถ่ายภาพ', hmSnapDone: 'บันทึกภาพแล้ว', hmMeterPick: 'มาตรน้ำของบ้านนี้', hmMeterPickHint: 'เลือกรุ่น ระบบจะใช้วิธีอ่านค่าที่เหมาะกับรุ่นนั้น', hmReadNow: 'อ่านค่ามาตรน้ำ', hmLastRead: 'ค่าที่อ่านล่าสุด', hmReadAt: 'อ่านเมื่อ', hmUsedSince: 'ใช้ไปจากครั้งก่อน', hmNowSince: 'ใช้ไปตั้งแต่อ่านล่าสุด', hmUsage: 'ปริมาณน้ำที่ใช้รายเดือน (m³)', hmHistory: 'ประวัติการอ่านมาตร', hmDate: 'วันที่', hmTime: 'เวลา', hmReadingM3: 'ค่ามาตร (m³)', hmUsedM3: 'ใช้ไป (m³)', hmCost: 'ค่าน้ำ', hmMethod: 'วิธีอ่าน', hmMech: 'แมคคานิค', hmSimTag: 'จำลอง', hmWaterNote: 'ค่าน้ำประมาณ 12 บาท/ม³ (ค่าสมมติ) · ประวัติเก็บไว้ในเครื่องนี้', hmNoCam: 'เปิดกล้องไม่ได้ จะใช้ภาพจำลองแทน', hmNfcTap: 'แตะมือถือที่หน้ามาตร SMCV4', hmNfcWait: 'กำลังอ่านข้อมูลจากมาตร…', hmNfcReal: 'มือถือนี้รองรับ Web NFC: แตะแล้วระบบจะอ่านค่าจากแท็กของมาตร', hmNfcSim: 'อุปกรณ์นี้ไม่รองรับ Web NFC (ใช้ได้กับ Chrome บน Android) จะแสดงผลแบบจำลอง', hmStartNfc: 'เริ่มอ่าน NFC', hmCapture: 'ถ่ายและอ่านค่า', hmReading: 'กำลังอ่าน…', hmOpenCam: 'เปิดกล้อง', hmVolume: 'ปริมาตร', hmLitres: 'ลิตร', hmMeterId: 'หมายเลขมาตร', hmBattery: 'แบตเตอรี่', hmCheck: 'ตรวจสอบตัวเลขที่อ่านได้ (แก้ได้ก่อนบันทึก)', hmAgain: 'อ่านใหม่', hmSave: 'บันทึกค่า', hmSaved: 'บันทึกค่ามาตรแล้ว', hmGuide: 'ให้ตัวเลข 7 หลักอยู่พอดีกรอบ', hmOcrHow: 'อ่านค่ามาตรแมคคานิคจากรูป', hmOcr1: 'ถ่ายให้หน้าปัดตรง เห็นตัวเลขชัด ไม่มีแสงสะท้อน', hmOcr2: 'ระบบหาแถวตัวเลข 7 หลัก (ดำ = ม³, แดง = ลิตร) และอ่านทีละล้อ', hmOcr3: 'ตรวจตัวเลข แตะ ▲▼ แก้ได้ แล้วกดบันทึก', hmPickPhoto: 'ถ่าย/เลือกรูป', hmOcrDemo: 'ลองกับรูปจำลอง', hmOcrNote: 'อ่านตัวเลขบนเครื่องนี้ด้วย Tesseract.js (ไม่ส่งรูปออกไปไหน) · ครั้งแรกโหลดโมเดลประมาณ 7 MB', hmOcrFind: 'กำลังหาแถวตัวเลขในรูป…', hmOcrRead: 'กำลังอ่านตัวเลขทีละล้อ…', hmOcrFail: 'อ่านรูปไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น', hmAdjust: 'ลากกรอบให้ครอบตัวเลข 7 หลักพอดี (ลากมุมขวาล่างเพื่อปรับขนาด) แล้วกดอ่านค่าใหม่', hmOcrAgain: 'อ่านค่าในกรอบนี้', hmOcrPhoto: 'ดูรูปและกรอบที่อ่าน', hmOcrAuto: 'หาตำแหน่งอัตโนมัติ', hmOcrTapFix: 'ล้อที่เป็นสีส้มคือระบบไม่มั่นใจ ตรวจกับหน้าปัดจริง แตะ ▲▼ เพื่อแก้ ถ้ากรอบไม่ตรงให้เปิด "ดูรูปและกรอบที่อ่าน" แล้วลากกรอบใหม่', hmLitresU: 'ลิตร', hmIn: 'ใน', hmDays: 'วัน', hmPerDay: 'เฉลี่ยต่อวัน', hmMonthEst: 'คาดการณ์ 30 วัน', hmCostEst: 'ค่าน้ำช่วงนี้ (ประมาณ)', hmOcrLower: 'ค่าน้อยกว่าครั้งก่อน ตรวจตัวเลขอีกครั้ง (หรือเปลี่ยนมาตรใหม่)', hmOcrReseed: 'ค่าน้อยกว่าประวัติจำลอง: เมื่อบันทึก ระบบจะลบประวัติจำลองทิ้ง แล้วเริ่มเก็บประวัติจริงจากมาตรของคุณ (การอ่านครั้งถัดไปจะคำนวณปริมาณที่ใช้ให้)', hmOcrJump: 'ใช้น้ำมากผิดปกติ (> 150 ม³) ตรวจตัวเลขอีกครั้ง', hmReal: 'อ่านจริง', hmTakePhoto: 'ถ่ายรูปมาตร (แนะนำ)', gsTitle: 'บันทึกลง Google Sheets · CoreDash AquaLog', gsLinked: 'เชื่อมต่อกับ "{s}" แล้ว', gsSub: 'ทุกครั้งที่บันทึกค่ามาตร ระบบส่งแถวข้อมูลไปที่ชีตของคุณ พร้อมสรุปรายเดือนและกราฟในชีต', gsOpen: 'เปิดชีต', gsUrl: 'URL เว็บแอป (Apps Script, ลงท้าย /exec)', gsKey: 'รหัสลับ (API_KEY ในสคริปต์)', gsPlace: 'สถานที่ / ชื่อบ้าน', gsMeterId: 'หมายเลขมาตร (บนขอบมาตร)', gsAuto: 'ส่งอัตโนมัติทุกครั้งที่บันทึก (ถ้าออฟไลน์จะเก็บไว้ส่งทีหลัง)', gsTest: 'ทดสอบการเชื่อมต่อ', gsSync: 'ส่งที่ค้าง', gsAll: 'ส่งประวัติทั้งหมด', gsCsv: 'ดาวน์โหลด CSV', gsScript: 'ดาวน์โหลดสคริปต์', gsHow: 'วิธีตั้งค่า', gsBusy: 'กำลังเชื่อมต่อ Google Sheets…', gsNotSet: 'ยังไม่ได้ตั้งค่า · ค่ามาตรจะเก็บไว้ในเครื่องก่อน แล้วส่งให้ทีหลังเมื่อตั้งค่าเสร็จ', gsPending: 'รอส่ง {n} รายการ', gsAllSent: 'ส่งครบแล้ว', gsSent: 'ส่งไป Google Sheets แล้ว {n} รายการ', gsOk: 'เชื่อมต่อสำเร็จ: {s} · มี {n} แถว', gsBadKey: 'รหัสลับไม่ตรงกับ API_KEY ในสคริปต์', gsRunSetup: 'ยังไม่ได้รัน setup ใน Apps Script', gsNetErr: 'ส่งไม่สำเร็จ: ตรวจ URL และตั้ง "ผู้มีสิทธิ์เข้าถึง: ทุกคน" ตอน Deploy (จะลองใหม่เมื่อกดส่ง)', gsOffline: 'ออฟไลน์อยู่ จะส่งเมื่อกลับมาออนไลน์', gsNeedCfg: 'ใส่ URL เว็บแอปและรหัสลับ (อย่างน้อย 8 ตัว) ก่อน', gsSteps: ['สร้าง Google Sheet ใหม่ ตั้งชื่อ <b>CoreDash AquaLog – บันทึกมาตรน้ำ</b>', 'เมนู <b>ส่วนขยาย → Apps Script</b> ลบโค้ดเดิม วางสคริปต์ที่ดาวน์โหลด แล้วบันทึก', 'แก้บรรทัด <code>API_KEY</code> เป็นรหัสลับของคุณ (อย่างน้อย 8 ตัว)', 'เลือกฟังก์ชัน <b>setup</b> กด ▶ เรียกใช้ แล้วอนุญาตสิทธิ์ ระบบสร้างแผ่นงาน บันทึกมาตร / สรุปรายเดือน / แดชบอร์ด พร้อมกราฟ', '<b>ทำให้ใช้งานได้ → การทำให้ใช้งานได้รายการใหม่ → เว็บแอป</b> · เรียกใช้ในฐานะ: ฉัน · ผู้มีสิทธิ์เข้าถึง: ทุกคน · คัดลอก URL ที่ลงท้าย /exec', 'กลับไปที่ชีต (รีเฟรช 1 ครั้ง) เมนู <b>CoreDash → เชื่อมต่อแอปมือถือ</b> → ส่งลิงก์เข้าอีเมล แล้วเปิดลิงก์บนมือถือ แอปจะตั้งค่าเองทั้งหมด · หรือวาง URL และรหัสลับในช่องด้านบนเอง'], hmFirstRead: 'ค่าแรกของมาตรนี้', hmFirstReadSub: 'บันทึกเป็นค่าตั้งต้น (ประวัติจำลองจะถูกลบ) อ่านครั้งถัดไประบบจะคำนวณปริมาณน้ำที่ใช้ เฉลี่ยต่อวัน และค่าน้ำให้', hmLiveScan: 'สแกนสด', hmFromAlbum: 'จากอัลบั้ม', hmSnapNow: 'ถ่ายตอนนี้', hmTorch: 'ไฟฉาย', hmScanLook: 'กำลังหาแถวตัวเลข… เล็งให้ตัวเลขแดงอยู่ในกรอบ', hmScanFound: 'เจอตัวเลขแล้ว ถือนิ่งๆ', hmScanHold: 'ถือนิ่งๆ กำลังถ่าย…', hmScanCloser: 'ขยับเข้าใกล้อีกนิด', hmScanAuto: 'ระบบถ่ายให้เองเมื่อเจอตัวเลขชัด หรือกด "ถ่ายตอนนี้"', hmCamFail: 'เปิดกล้องสดไม่ได้', hmCamInApp: 'เปิดลิงก์นี้จากแอป LINE/Facebook ซึ่งไม่อนุญาตกล้องสด ใช้ปุ่ม "ถ่ายรูปมาตร" ด้านล่าง (เปิดกล้องของเครื่องได้) หรือเปิดใน Chrome', hmCamDenied: 'ไม่ได้รับอนุญาตใช้กล้อง: เปิดสิทธิ์กล้องให้เว็บไซต์นี้ในการตั้งค่าเบราว์เซอร์ หรือใช้ปุ่ม "ถ่ายรูปมาตร"', hmCamNone: 'ไม่พบกล้องหลังในอุปกรณ์นี้', hmCamBusy: 'กล้องถูกแอปอื่นใช้อยู่ ปิดแอปกล้องอื่นแล้วลองใหม่', hmCamOther: 'เบราว์เซอร์นี้ไม่รองรับกล้องสด ใช้ปุ่ม "ถ่ายรูปมาตร" แทน', hmOpenChrome: 'เปิดใน Chrome', hmInAppTitle: 'กำลังเปิดในแอป LINE/Facebook', hmInAppTip: 'ถ่ายรูปมาตรได้ตามปกติ แต่สแกนสดอาจไม่ทำงาน ถ้าต้องการสแกนสดให้เปิดใน Chrome', hmOcrNotFound: 'หาแถวตัวเลขไม่เจอ ลากกรอบให้ครอบตัวเลข 7 หลักแล้วกดอ่าน', hmNeedTwo: 'อ่านมาตรอย่างน้อย 2 ครั้งเพื่อดูปริมาณน้ำที่ใช้', tabPower: 'พลังงาน', tabPq: 'คุณภาพไฟ', pqTitle: 'คุณภาพไฟฟ้า', pwTitle: 'จำลองพลังงานโรงชุบและโรงรีดทองเหลือง', pwSub: 'P · Q · D · S · cos φ · THD · ข้อมูลจำลอง', pwExec: 'ภาพรวมสำหรับผู้บริหาร: ก่อน → หลังปรับปรุง', pwExecSub: 'ค่าเฉลี่ยตลอดรอบการผลิต เปิด/ปิดมาตรการด้านล่างเพื่อดูผล', pwP0: 'ก่อนปรับปรุง', pwP1: 'ระยะที่ 1: แก้ PF (คาปาซิเตอร์ + เตาอบ + มอเตอร์)', pwP2: 'ครบทุกมาตรการ', pwPF: 'PF จริง', pwCur: 'กระแสรวม', pwLoss: 'สูญเสียหม้อแปลง/สาย', pwKW: 'กำลังจริง', pwBill: 'ค่าไฟประมาณการ/เดือน', pwFrom: 'จาก', pwPFch: 'ค่าปรับเพาเวอร์แฟกเตอร์/เดือน', pwSaveM: 'ประหยัดได้/เดือน', pwInvest: 'เงินลงทุน', pwPay: 'คืนทุน', pwYear: 'ปี', pwMonth: 'เดือน', pwSave: 'ประหยัด', pwRelease: 'คืนพิกัดหม้อแปลง', pwTr: 'โหลด TR', pwScene: 'โรงงานเสมือน · การไหลของกำลังไฟฟ้า', pwSceneHint: 'แตะเครื่องจักรเพื่อดูรูปคลื่นและฮาร์มอนิก · เส้นเขียว = P เส้นส้ม = Q', pwRegen: 'คืนพลังงาน', pwFixes: 'แนวทางปรับปรุงเพาเวอร์แฟกเตอร์และคุณภาพไฟฟ้า', pwFixHint: 'ตัวเลขในการ์ด = ผลของมาตรการนั้นอย่างเดียว เทียบกับก่อนปรับปรุง', pwDetuned: 'มีรีแอคเตอร์ 7% (แนะนำ)', pwPlain: 'คาปาซิเตอร์ธรรมดา', pwResonance: 'เกิดเรโซแนนซ์กับฮาร์มอนิกลำดับ 5–7: THD พุ่งสูง คาปาซิเตอร์ร้อน ฟิวส์ขาด อายุสั้น — โรงงานที่มีเรกติไฟเออร์/VFD ต้องใช้แบบมีรีแอคเตอร์', pwCostNote: 'ราคาลงทุนเป็นตัวเลขประมาณการเพื่อเปรียบเทียบเท่านั้น ควรขอใบเสนอราคาและวัดค่าจริงด้วย Power Analyzer ก่อนตัดสินใจ', pwTable: 'การใช้พลังงานรายเครื่อง', pwTableHint: 'เรียงตาม kvar มากไปน้อย = ตัวการที่ควรแก้ก่อน · แตะแถวเพื่อดูรูปคลื่น', pwMach: 'เครื่องจักร', pwShareQ: 'สัดส่วน kvar', pwWhy: 'สาเหตุตามหลัก Power Electronics', pwTotal: 'รวมที่แผงเมน', pwSumNote: 'รวมผลคาปาซิเตอร์/ฟิลเตอร์ที่แผงเมนแล้ว', pwTheory: 'หลักวิชาแบบเข้าใจง่าย', pwThP: 'กำลังจริง (kW)', pwThPd: 'พลังงานที่ทำงานจริง: ความร้อน แรงบิด ไฟฟ้าเคมี — คิดเงินเป็น kWh', pwThQ: 'กำลังรีแอกทีฟ (kvar)', pwThQd: 'พลังงานที่วิ่งไป-กลับระหว่างสนามแม่เหล็ก/การหน่วงมุม SCR กับแหล่งจ่าย ไม่ได้ทำงาน แต่ทำให้กระแสสูง แก้ด้วยคาปาซิเตอร์', pwThD: 'กำลังบิดเบือน (kVA)', pwThDd: 'จากกระแสฮาร์มอนิกของเรกติไฟเออร์/อินเวอร์เตอร์ คาปาซิเตอร์แก้ไม่ได้ ต้องใช้ฟิลเตอร์หรืออุปกรณ์ที่สะอาดกว่า', pwThS: 'กำลังปรากฏ (kVA)', pwThPF: 'คาปาซิเตอร์แก้ได้แค่ cos φ ส่วน THD ต้องใช้ฟิลเตอร์', pwThGoal: 'เป้าหมาย', pwThGoald: '“เพิ่ม” PF ให้เข้าใกล้ 1 = ลด kvar และฮาร์มอนิก → กระแสลด สายเย็นลง หม้อแปลงรับโหลดเพิ่มได้ ไม่โดนค่าปรับ', pwTariff: 'อัตราค่าไฟที่ใช้คำนวณ (แก้ไขได้)', pwTE: 'ค่าพลังงานเฉลี่ยรวม Ft', pwTD: 'ค่าความต้องการพลังไฟฟ้า', pwTP: 'ค่าเพาเวอร์แฟกเตอร์', pwTH: 'ชั่วโมงทำงาน/เดือน', pwTariffNote: 'ค่าเริ่มต้นอ้างอิงตารางอัตรา กฟภ. (กิจการขนาดใหญ่ TOU แรงดันต่ำกว่า 22 kV และค่าเพาเวอร์แฟกเตอร์ 56.07 บาท/kvar ส่วนที่เกิน 61.97% ของ kW) ค่าพลังงานเฉลี่ยเป็นค่าสมมติ ควรใส่ตามบิลจริง', pdfHint: 'เปิดแอปเต็มหน้าจอ (ไม่ใช่ในกรอบ) เพื่อบันทึก PDF', s1: 'เลือกรุ่นมาตรที่จะทดสอบ', s1h: 'ทั้ง 3 ตำแหน่งบนแท่นเป็นรุ่นเดียวกัน ต่ออนุกรม ทดสอบพร้อมกัน', s2: 'ตั้งสเปกตามใบรับรองมาตร', s2h: 'ดู Q3 และ R บนหน้าปัดมาตร ระบบคำนวณอัตราไหล Q1–Q4 ให้เอง', s3: 'เลือกจุดทดสอบ (เลือกได้หลายจุด)', s3h: 'ระบบจะทดสอบทุกจุดที่ติ๊ก ✓ เรียงจากไหลน้อยไปมาก', s4: 'กดเริ่ม ระบบทำให้อัตโนมัติจนจบ', presetStd: 'มาตรฐาน Q1 + Q2 + Q3', presetAll: 'ทุกจุด Q1–Q4', startAuto: 'เริ่มทดสอบอัตโนมัติ', summary: 'จะทดสอบมาตร {m} ตัว ที่ {p} · ใช้น้ำ {w} L · ใช้เวลาจริงประมาณ {t}', startNote: 'ระบบจะ ระบายถัง → เปิดน้ำ → ปิดเมื่อถึงเซนเซอร์ → อ่านค่า → คำนวณผ่าน/ไม่ผ่าน ทีละจุดเอง ไม่ต้องกดอะไรเพิ่ม', selectPoint: 'เลือกจุดทดสอบอย่างน้อย 1 จุด', nowTesting: 'กำลังทดสอบ', pointOf: 'จุดที่ {a} จาก {b}', filled: 'น้ำในถัง', pointTime: 'เวลาจุดนี้', how1: 'เลือกรุ่นมาตร', how2: 'ตั้งสเปก Q3 / R', how3: 'ติ๊กจุดทดสอบ', how4: 'กดปุ่มเขียว ▶ เริ่มทดสอบ แล้วรอผล', manualSub: 'สำหรับช่างตรวจเช็กอุปกรณ์ · ไม่บันทึกผล', mValves: 'แตะวาล์วเพื่อเปิด/ปิด', mFlows: 'เปิดน้ำเข้าถังที่อัตราไหล (ใช้ไล่อากาศ / ตรวจเซนเซอร์)',
    blkTitle: 'ระบบป้องกันบล็อกคำสั่งนี้', blkNow: 'ตอนนี้', blkRule: 'เงื่อนไขบล็อก', blkFix: 'แก้ไขแล้วสั่งต่อ', blkFixHint: 'กดแก้ไข แล้วแอปจะเด้งคำสั่งเดิมให้ยืนยันทันทีที่ปลดล็อก', blkWait: 'รอปลดล็อกแล้วสั่งให้อัตโนมัติ', blkBypass: 'ข้ามระบบป้องกันชั่วคราว (วิศวกรขึ้นไป)', blkReason: 'เหตุผล (บันทึกใน Audit log)', blkReasonPh: 'เช่น ทดสอบปั๊มหลังซ่อม มีช่างเฝ้าหน้างาน', blkDo: 'ข้ามระบบป้องกัน', blkMin: 'นาที', blkNeedRole: 'บัญชีนี้เป็นผู้ควบคุม ต้องให้วิศวกรหรือผู้ดูแลระบบเป็นผู้ข้ามระบบป้องกัน', blkNoBypass: 'ระบบป้องกันนี้ข้ามไม่ได้ เพราะเป็นการป้องกันขั้นสุดท้าย (เทียบเท่าสวิตช์กันล้นแบบต่อสายตรง) ต้องแก้สาเหตุก่อน', blkReasonShort: 'กรุณาใส่เหตุผลอย่างน้อย 5 ตัวอักษร', close2: 'ปิด', waiting: 'รอปลดล็อก', cancelWait: 'ยกเลิก', ready: 'ปลดล็อกแล้ว', byp: 'ข้ามระบบป้องกันอยู่', bypLeft: 'เหลือ', bypBy: 'โดย', restore: 'คืนค่าป้องกัน', bypassed: 'ข้ามระบบป้องกันแล้ว · ', restored: 'คืนค่าระบบป้องกันแล้ว'
  },
  en: {
    site: 'Plant A · Bang Na', home: 'Home', overview: 'Plant overview', control: 'Control', alerts: 'Alerts', report: 'Reports',
    kwNow: 'kW now', usedToday: 'Used today', estCost: 'Est. cost', peakLimit: 'Peak limit 320 kW', waterFlow: 'Water flow', tankLevel: 'Tank T-1 level',
    machRun: 'Machines running', lightsOn: 'Lights on', zones: 'zones', scenes: 'Quick scenes', sMorning: 'Start shift', sLunch: 'Lunch break', sOff: 'Shut down',
    power: 'Recent power', allOk: 'All systems normal', allOkSub: 'All devices online', hasAlerts: 'Active alerts:', items: '',
    waterSys: 'Water system', tapHint: 'Tap equipment to control', well: 'Raw well', tank: 'Tank', line: 'Production', coolLoop: 'Cooling loop', mold: 'Mold',
    segM: 'Machines', segL: 'Lighting', segV: 'Valves', run: 'Running', stop: 'Stopped', fault: 'Fault', closed: 'Closed', openP: 'Open ', opening: 'Opening', closing: 'Closing',
    close: 'Close', open: 'Open', dim: 'Dim', lamps: 'lamps', unacked: 'Unacknowledged', ack: 'Acknowledge', viewEq: 'View equipment', acked: 'Acknowledged', noAlerts: 'No alerts — all systems normal', recent: 'Recent commands',
    energyReport: 'Energy report', reportBy: 'Report prepared by', lastHour: 'Power, last 60 minutes (kW)', avg: 'Avg', max: 'Max', min: 'Min', totalElec: 'Energy meter', totalWater: 'Water meter', share: 'Energy share (estimate)', exportPdf: 'Print / save as PDF',
    confirmTitle: 'Confirm command', confirmNote: 'The command goes to the PLC immediately and is logged under your name', cancel: 'Cancel', confirm: 'Confirm', sent: 'Command sent · ', failed: 'Command failed: ',
    settings: 'Settings', language: 'Language', theme: 'Background theme', notif: 'Notifications on this device', notifOn: 'On', notifAsk: 'Allow notifications', notifNo: 'Not supported in this browser', connection: 'Connection',
    live: 'Connected to gateway', demo: 'Demo mode (simulated on this device)', offline: 'Disconnected — reconnecting', logout: 'Sign out', done: 'Done',
    about: 'About', version: 'CoreDash Nexus version 1.0', devBy: 'Developed by', devName: 'CoreDash Technology',
    install: 'Install the app on this device', installBtn: 'Install', iosInstall: 'iPhone: tap Share, then “Add to Home Screen”',
    loginTitle: 'Sign in', loginLead: 'Connect to your plant’s CoreDash Gateway to see live values and control equipment', token: 'User code (API token)', gateway: 'Gateway address',
    signIn: 'Sign in', demoAcc: 'Use the gateway demo account', offlineDemo: 'Try demo mode without a gateway', badToken: 'Wrong code, or the gateway cannot be reached', gwFound: 'Gateway found', gwSim: '(simulator)', demoBanner: 'Demo mode · simulated on this device',
    role: { viewer: 'Viewer', operator: 'Operator', engineer: 'Engineer', admin: 'Admin' }, viewOnly: 'This account is view-only',
    level: 'Level', volume: 'Volume', inflow: 'Inflow', outflow: 'Outflow', pos: 'Position', flow: 'Flow', amps: 'Current', vib: 'Vibration', chw: 'Chilled water', rated: 'Rated',
    closeIn: 'Close inlet V-101', drainOpen: 'Drain V-103', o50: 'Open 50%', o100: 'Open 100%', closePanel: 'Close', nothingToDo: 'Everything is already in that state',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    twin: '3D control room', pid: 'P&ID diagram', twinTitle: 'Virtual control room', auto: 'Auto', day: 'Day', night: 'Night', labels: 'Labels', zoomIn: 'Zoom in', zoomOut: 'Zoom out', twinHint: 'Tap a machine, valve or light to control it', zoneA: 'ZONE A · PRODUCTION', zoneB: 'ZONE B · MOLDING', zoneU: 'UTILITY · WATER & COOLING', twinAria: 'Live plant scene', lux: 'Brightness', on: 'On', off: 'Off', kwNowL: 'Power', pf: 'Power factor', energy: 'Energy meter', moldT: 'Mold temperature', coolBy: 'Cooled by', moldNote: 'Alarm above 60 °C',
    bench: 'Meter test', benchTitle: 'Water-meter test bench (proving tank)', benchStd: 'Volumetric method · ISO 4064 / OIML R 49 · simulated data', setup: 'Test setup', meterUnder: 'Meters under test (in series)', spec: 'Meter rating (per certificate)', testPoint: 'Test point', volume: 'Test volume', autoVol: 'Auto', speed: 'Simulation speed', runOne: 'Run', runSet: 'Run full set Q1 · Q2 · Q3', stopRun: 'Stop', fault: 'Simulate a worn meter', live: 'Live status', flowNow: 'Flow (FT-01)', simTime: 'Simulated time', eta: 'Time left', stepNow: 'Step', manual: 'Technician mode: manual valves', manualHint: 'Check valves, purge air or watch the sensors. Fill until full and the LSHH overflow sensor trips by itself. For test results use ▶ Start automatic test.', fillAt: 'Fill at', closeAll: 'Close all', results: 'Test results', colMeter: 'Meter', colPoint: 'Point', colQ: 'Flow', colVref: 'Reference vol.', colVm: 'Meter vol.', colE: 'Error', colMpe: 'MPE', colRes: 'Result', pass: 'Pass', failR: 'Fail', clear: 'Clear', noResults: 'No results yet — press ▶ Start automatic test in step 4', curve: 'Error curve vs MPE (dashed = ±5% / ±2% limits)', guide: 'Sensor and instrument placement', gSensor: 'Device', gWhere: 'Location', gWhy: 'Purpose', gType: 'Recommended type', neckTitle: 'Why the volume sensors sit in the narrow neck', neckText: 'A Ø50 mm neck holds 1.96 mL per mm; a Ø650 mm body holds 332 mL per mm. A ±1 mm sensor error is ±0.002 L in the neck but ±0.33 L in the body (over 170× more).', planTitle: 'Recommended volumes and times', tankUsed: 'Tank', alarmOv: 'Overflow protection tripped', reportBench: 'Water-meter test report', benchNote: '* Errors on the drawing are live simulated values; results use the reference volume read from the tank neck, corrected to 20 °C.', minutes: 'min', selectMeter: 'Select at least one meter', faultOn: 'worn', s1pos: 'Positions on the bench (tap to include/exclude) · serial numbers are editable', dialTitle: 'Meter dials · start / end readings', dialHint: 'Each point is read at the start and at the end with the water at rest', colStart: 'Start (L)', colEnd: 'End (L)', sumTitle: 'Test summary', rpPreview: 'Preview report', rpPdf: 'Save PDF / Print', doneTitle: 'Test complete', donePass: '{a} of {b} passed', savedX: 'Saved · ', tabHouse: 'Home', hmTitle: 'Residence', hmSub: 'Smart home · simulated', hmOverview: 'Overview', hmMeter: 'Water meter', hmCam: 'CCTV', hmLight: 'Lights & power', hmValve: 'Water valves', hmHouseName: 'House No. 555', hmTapHint: 'Tap a lamp, camera, meter or tank in the picture', hmLightHint: 'Tap a yellow circle to switch that lamp', hmValveHint: 'Moving blue lines show water flowing in the pipes', hmAuto: 'Auto', hmDay: 'Day', hmNight: 'Night', hmPowerNow: 'Power now', hmToday: 'today', hmLightsOn: 'Lights on', hmWaterNow: 'Water flowing', hmMeterLast: 'Last meter reading', hmCams: 'CCTV', hmRec: 'Recording 24 h', hmMainValve: 'Main valve', hmOpen: 'Open', hmClosed: 'Closed', hmOpening: 'Opening…', hmClosing: 'Closing…', hmTank: 'Water tank', hmScHome: 'Arrive home', hmScNight: 'Bedtime', hmScAway: 'Away', hmScOff: 'All lights off', hmSceneDone: 'Scene applied', hmOffS: 'off', hmLightsW: 'Lighting total', hmHouseW: 'Whole house now', hmKwhToday: 'Energy today', hmCostToday: 'Cost today (est.)', hmLightList: 'Light points', hmLoads: 'Main appliances', hmPriceNote: 'About 4.18 THB/kWh (assumed) · a real system reads a smart meter / smart switches', hmFlow: 'Flow rate', hmWaterToday: 'Water used today', hmMeterNow: 'Meter now', hmValveList: 'Remote valve control', hmLastCmd: 'Last command', hmDoOpen: 'Open valve', hmDoClose: 'Close valve', hmConfOpen: 'The valve opens over 3 seconds and reports when fully open', hmConfClose: 'The valve closes over 3 seconds; water stops at this point', hmConfirm: 'Confirm', hmSent: 'Command sent', hmLeak: 'Leak detected: water keeps flowing with nothing in use', hmLeakSub: 'Meter still turning at 0.6 L/min (≈ 860 L/day)', hmCutMain: 'Close the main valve now', hmLeakOn: 'Simulate a leak', hmLeakOff: 'Stop leak simulation', hmCamSim: 'Simulated', hmCamReal: 'Real cameras', hmCamTitle: '4 CCTV cameras', hmCamHint: 'Tap for full screen · switches to infrared at night', hmCamNote: 'Simulated pictures · real cameras connect through an NVR/IP cameras (RTSP → WebRTC) at the gateway', hmSnap: 'Snapshot', hmSnapDone: 'Snapshot saved', hmMeterPick: 'Water meter of this house', hmMeterPickHint: 'Pick the model; the app uses the matching reading method', hmReadNow: 'Read water meter', hmLastRead: 'Last reading', hmReadAt: 'Read at', hmUsedSince: 'Used since previous', hmNowSince: 'Used since last reading', hmUsage: 'Monthly water use (m³)', hmHistory: 'Reading history', hmDate: 'Date', hmTime: 'Time', hmReadingM3: 'Reading (m³)', hmUsedM3: 'Used (m³)', hmCost: 'Water cost', hmMethod: 'Method', hmMech: 'mechanical', hmSimTag: 'simulated', hmWaterNote: 'About 12 THB/m³ (assumed) · history is kept on this device', hmNoCam: 'Camera unavailable — using a simulated view', hmNfcTap: 'Tap the phone on the SMCV4 meter', hmNfcWait: 'Reading the meter…', hmNfcReal: 'This phone supports Web NFC: tap and the meter tag is read', hmNfcSim: 'This device has no Web NFC (Chrome on Android has it) — showing a simulated read', hmStartNfc: 'Start NFC read', hmCapture: 'Capture and read', hmReading: 'Reading…', hmOpenCam: 'Open camera', hmVolume: 'Volume', hmLitres: 'Litres', hmMeterId: 'Meter ID', hmBattery: 'Battery', hmCheck: 'Check the digits read (edit before saving)', hmAgain: 'Read again', hmSave: 'Save reading', hmSaved: 'Meter reading saved', hmGuide: 'Fit the 7 digits inside the frame', hmOcrHow: 'Read a mechanical meter from a photo', hmOcr1: 'Shoot straight on, digits sharp, no glare', hmOcr2: 'The app finds the 7-drum row (black = m³, red = litres) and reads each drum', hmOcr3: 'Check the digits, tap ▲▼ to fix, then save', hmPickPhoto: 'Take/choose photo', hmOcrDemo: 'Try a sample photo', hmOcrNote: 'Digits are read on this device with Tesseract.js (the photo is not uploaded) · first use downloads about 7 MB', hmOcrFind: 'Finding the digit row…', hmOcrRead: 'Reading each drum…', hmOcrFail: 'Could not read the photo — try a sharper shot', hmAdjust: 'Drag the box over the 7 digits (drag the bottom-right corner to resize), then read again', hmOcrAgain: 'Read inside this box', hmOcrPhoto: 'Photo and reading box', hmOcrAuto: 'found automatically', hmOcrTapFix: 'Orange drums are uncertain — compare with the meter and tap ▲▼ to fix. If the box is off, open "Photo and reading box" and drag it', hmLitresU: 'L', hmIn: 'in', hmDays: 'days', hmPerDay: 'Average per day', hmMonthEst: '30-day estimate', hmCostEst: 'Water cost (est.)', hmOcrLower: 'Lower than the previous reading — check the digits (or a new meter)', hmOcrReseed: 'Lower than the simulated history: saving clears it and starts your real history (the next reading calculates the use)', hmOcrJump: 'Unusually high use (> 150 m³) — check the digits', hmReal: 'real', hmTakePhoto: 'Take a photo of the meter (recommended)', gsTitle: 'Save to Google Sheets · CoreDash AquaLog', gsLinked: 'Linked to "{s}"', gsSub: 'Every saved reading becomes a row in your sheet, with a monthly summary and charts there', gsOpen: 'Open sheet', gsUrl: 'Web app URL (Apps Script, ends in /exec)', gsKey: 'Secret key (API_KEY in the script)', gsPlace: 'Place / house name', gsMeterId: 'Meter number (on the meter ring)', gsAuto: 'Send automatically on every save (kept and sent later when offline)', gsTest: 'Test connection', gsSync: 'Send pending', gsAll: 'Send all history', gsCsv: 'Download CSV', gsScript: 'Download script', gsHow: 'How to set up', gsBusy: 'Talking to Google Sheets…', gsNotSet: 'Not set up · readings stay on this device and are sent once set up', gsPending: '{n} waiting to send', gsAllSent: 'All sent', gsSent: 'Sent {n} to Google Sheets', gsOk: 'Connected: {s} · {n} rows', gsBadKey: 'The key does not match API_KEY in the script', gsRunSetup: 'Run setup in Apps Script first', gsNetErr: 'Send failed: check the URL and deploy with "Who has access: Anyone"', gsOffline: 'Offline — will send when back online', gsNeedCfg: 'Enter the web app URL and a key of 8+ characters first', gsSteps: ['Create a new Google Sheet named <b>CoreDash AquaLog – Water meter log</b>', '<b>Extensions → Apps Script</b>: replace the code with the downloaded script and save', 'Change <code>API_KEY</code> to your own secret (8+ characters)', 'Choose <b>setup</b>, press ▶ Run and allow access; it builds the log, monthly summary and dashboard with charts', '<b>Deploy → New deployment → Web app</b> · Execute as: Me · Who has access: Anyone · copy the URL ending in /exec', 'Back in the sheet (reload once): menu <b>CoreDash → Connect phone app</b> → email yourself the link and open it on the phone; the app sets itself up · or paste the URL and key above'], hmFirstRead: 'First reading of this meter', hmFirstReadSub: 'Saved as the starting point (simulated history is removed); the next reading calculates use, daily average and cost', hmLiveScan: 'Live scan', hmFromAlbum: 'From album', hmSnapNow: 'Capture now', hmTorch: 'Torch', hmScanLook: 'Looking for the digits… aim the red digits into the frame', hmScanFound: 'Digits found — hold still', hmScanHold: 'Hold still, capturing…', hmScanCloser: 'Move a little closer', hmScanAuto: 'Captures by itself when the digits are clear, or tap "Capture now"', hmCamFail: 'Live camera unavailable', hmCamInApp: 'This link is open inside LINE/Facebook, which blocks the live camera. Use "Take a photo of the meter" below (opens the phone camera) or open in Chrome', hmCamDenied: 'Camera permission denied: allow the camera for this site in the browser settings, or use "Take a photo"', hmCamNone: 'No rear camera found on this device', hmCamBusy: 'The camera is in use by another app; close it and retry', hmCamOther: 'This browser has no live camera; use "Take a photo" instead', hmOpenChrome: 'Open in Chrome', hmInAppTitle: 'Open inside LINE/Facebook', hmInAppTip: 'Taking a photo works; live scan may not. Open in Chrome for live scan', hmOcrNotFound: 'Digit row not found — drag the box over the 7 digits and read', hmNeedTwo: 'Read the meter at least twice to see the water used', tabPower: 'Energy', tabPq: 'Power quality', pqTitle: 'Power quality', pwTitle: 'Plating & brass rolling power simulation', pwSub: 'P · Q · D · S · cos φ · THD · simulated data', pwExec: 'Management view: before → after', pwExecSub: 'Averages over the production cycle. Switch the measures below to see the effect', pwP0: 'As is', pwP1: 'Phase 1: fix PF (capacitors + furnace + motors)', pwP2: 'All measures', pwPF: 'True PF', pwCur: 'Total current', pwLoss: 'Transformer/cable loss', pwKW: 'Active power', pwBill: 'Estimated bill / month', pwFrom: 'from', pwPFch: 'Power factor charge / month', pwSaveM: 'Saving / month', pwInvest: 'Investment', pwPay: 'Payback', pwYear: 'yr', pwMonth: 'mo', pwSave: 'Saves', pwRelease: 'Transformer capacity freed', pwTr: 'TR load', pwScene: 'Virtual plant · power flow', pwSceneHint: 'Tap a machine for its waveform and harmonics · green = P, orange = Q', pwRegen: 'regenerating', pwFixes: 'Power factor and power quality measures', pwFixHint: 'Figures on each card = that measure alone, against the as-is plant', pwDetuned: 'With 7 % reactors (recommended)', pwPlain: 'Plain capacitors', pwResonance: 'Resonates with the 5th–7th harmonics: THD soars, capacitors overheat, fuses blow — plants with rectifiers/VFDs need detuned banks', pwCostNote: 'Investment figures are rough, for comparison only. Get quotations and measure with a power analyser before deciding.', pwTable: 'Power by machine', pwTableHint: 'Sorted by kvar = fix these first · tap a row for its waveform', pwMach: 'Machine', pwShareQ: 'kvar share', pwWhy: 'Cause (power electronics)', pwTotal: 'Total at the MDB', pwSumNote: 'includes capacitors/filters at the main board', pwTheory: 'The theory, simply', pwThP: 'Active power (kW)', pwThPd: 'Does real work — heat, torque, electro-chemistry — billed as kWh', pwThQ: 'Reactive power (kvar)', pwThQd: 'Swings back and forth (magnetic fields, SCR firing delay); does no work but raises current. Capacitors fix it', pwThD: 'Distortion power (kVA)', pwThDd: 'From rectifier/inverter harmonic currents. Capacitors cannot fix it: filters or cleaner converters can', pwThS: 'Apparent power (kVA)', pwThPF: 'capacitors fix cos φ only; THD needs filters', pwThGoal: 'Goal', pwThGoald: 'RAISE PF towards 1 = less kvar and harmonics → lower current, cooler cables, more transformer headroom, no penalty', pwTariff: 'Tariff used (editable)', pwTE: 'Average energy incl. Ft', pwTD: 'Demand charge', pwTP: 'Power factor charge', pwTH: 'Operating hours / month', pwTariffNote: 'Defaults from the PEA tariff table (large general service TOU < 22 kV; PF charge 56.07 THB/kvar above 61.97 % of kW). The average energy price is an assumption — use your bill.', pdfHint: 'Open the app full screen (not in a frame) to save a PDF', s1: 'Choose the meter model', s1h: 'All three bench positions carry the same model, in series, tested together', s2: 'Set the rating from the meter certificate', s2h: 'Read Q3 and R on the meter dial; Q1–Q4 are calculated for you', s3: 'Choose test points (several allowed)', s3h: 'Every ticked ✓ point runs, lowest flow first', s4: 'Press start; the bench runs by itself', presetStd: 'Standard Q1 + Q2 + Q3', presetAll: 'All points Q1–Q4', startAuto: 'Start automatic test', summary: 'Tests {m} meter(s) at {p} · uses {w} L of water · about {t} in real time', startNote: 'The bench drains → fills → closes at the sensor → reads → passes/fails each point on its own. Nothing else to press.', selectPoint: 'Select at least one test point', nowTesting: 'Testing', pointOf: 'Point {a} of {b}', filled: 'Water in tank', pointTime: 'Time on this point', how1: 'Pick the model', how2: 'Set Q3 / R', how3: 'Tick test points', how4: 'Press the green ▶ Start button and wait', manualSub: 'For technicians checking equipment · results not saved', mValves: 'Tap a valve to open/close', mFlows: 'Fill the tank at a flow rate (purge air / check sensors)',
    blkTitle: 'A safety interlock blocked this command', blkNow: 'Now', blkRule: 'Blocks when', blkFix: 'Fix it and continue', blkFixHint: 'Pick a fix; the app brings your command back for confirmation as soon as it is unblocked', blkWait: 'Wait until unblocked, then ask me', blkBypass: 'Temporary bypass (engineer or admin)', blkReason: 'Reason (saved in the audit log)', blkReasonPh: 'e.g. pump test after repair, technician on site', blkDo: 'Bypass interlock', blkMin: 'min', blkNeedRole: 'This account is an operator; an engineer or admin must bypass an interlock', blkNoBypass: 'This interlock cannot be bypassed: it is the last line of defence (like a hard-wired overflow switch). Fix the cause first.', blkReasonShort: 'Please enter a reason of at least 5 characters', close2: 'Close', waiting: 'Waiting to unblock', cancelWait: 'Cancel', ready: 'Unblocked', byp: 'Interlock bypassed', bypLeft: 'left', bypBy: 'by', restore: 'Restore', bypassed: 'Interlock bypassed · ', restored: 'Interlock restored'
  }
};

// ---------------------------------------------------------------- equipment catalog (tag ids match config/plant-a.yaml)
const MACHINES = [
  { id: 'P-01', name: B('ปั๊มน้ำดิบ', 'Raw water pump'), run: 'P-01.RUN', kw: 15, stats: [['amps', 'P-01.AMPS', 'A']] },
  { id: 'P-02', name: B('ปั๊มน้ำหล่อเย็น', 'Cooling water pump'), run: 'P-02.RUN', kw: 11, stats: [['vib', 'P-02.VIB', 'mm/s']] },
  { id: 'CHL-01', name: B('Chiller 01', 'Chiller 01'), run: 'CHL-01.RUN', kw: 75, stats: [['chw', 'CHL-01.SUPPLY_T', '°C']] },
  { id: 'CMP-01', name: B('ปั๊มลม', 'Air compressor'), run: 'CMP-01.RUN', kw: 37, stats: [] },
  { id: 'CNV-01', name: B('สายพานลำเลียง', 'Conveyor'), run: 'CNV-01.RUN', kw: 5.5, stats: [] }
];
const LIGHTS = [
  { id: 'L-A', name: B('โซนผลิต A', 'Production A'), on: 'L-A.ON', level: 'L-A.LEVEL', lamps: 24 },
  { id: 'L-B', name: B('โซนผลิต B', 'Production B'), on: 'L-B.ON', level: 'L-B.LEVEL', lamps: 20 },
  { id: 'L-O', name: B('ลานจอด / รอบอาคาร', 'Parking / perimeter'), on: 'L-O.ON', lamps: 16 }
];
const VALVES = [
  { id: 'V-101', name: B('น้ำดิบเข้าถัง', 'Raw water to tank'), pos: 'V-101.POS', max: 20 },
  { id: 'V-102', name: B('จ่ายน้ำไลน์ผลิต', 'Supply to production'), pos: 'V-102.POS', max: 15 },
  { id: 'V-103', name: B('ระบายถัง', 'Tank drain'), pos: 'V-103.POS', max: 25 },
  { id: 'V-201', name: B('น้ำหล่อเย็น INJ-01', 'INJ-01 cooling'), pos: 'V-201.POS', max: 12 }
];
const ALARM_RULES = [
  { id: 'TANK_OVERFLOW', tag: 'T-1.LEVEL', op: '>=', value: 97, severity: 'critical', text: B('ถัง T-1 ล้น — Interlock ตัด P-01', 'Tank T-1 overflow — interlock tripped P-01') },
  { id: 'TANK_LOW', tag: 'T-1.LEVEL', op: '<', value: 15, severity: 'medium', text: B('ถัง T-1 ระดับต่ำ', 'Tank T-1 low') },
  { id: 'P02_VIB', tag: 'P-02.VIB', op: '>', value: 4.5, delaySec: 5, severity: 'high', text: B('P-02 สั่นสะเทือนเกินเกณฑ์', 'P-02 vibration above limit') },
  { id: 'MOLD_HOT', tag: 'INJ-01.MOLD_T', op: '>', value: 60, severity: 'high', text: B('แม่พิมพ์ INJ-01 ร้อนเกิน 60 °C', 'INJ-01 mold above 60 °C') },
  { id: 'PEAK_DEMAND', tag: 'MDB-1.KW', op: '>', value: 320, delaySec: 10, severity: 'medium', text: B('กำลังไฟเกินเพดาน Peak', 'Power above peak limit') }
];
const INTERLOCKS = [
  { id: 'IL_TANK_HIGH', tag: 'T-1.LEVEL', op: '>=', value: 97, force: ['P-01.RUN', false], bypassable: true, maxBypassMin: 30, text: B('ถังเต็ม 97% — ห้ามเดิน P-01', 'Tank at 97% — P-01 blocked'),
    fixes: [{ label: B('ระบายถัง: เปิด V-103 100%', 'Drain the tank: open V-103 100%'), set: [{ tag: 'V-103.POS', value: 100 }] }, { label: B('จ่ายน้ำออก: เปิด V-102 100%', 'Draw water: open V-102 100%'), set: [{ tag: 'V-102.POS', value: 100 }] }] },
  { id: 'IL_TANK_LSHH', tag: 'T-1.LEVEL', op: '>=', value: 99.5, force: ['P-01.RUN', false], bypassable: false, text: B('ถังล้น 99.5% (LSHH) — ตัด P-01 เสมอ', 'Tank 99.5% (LSHH) — P-01 always tripped'), fixes: [] }
];
INTERLOCKS[1].fixes = INTERLOCKS[0].fixes.slice(0, 1);
const cmp = (v, op, r) => ({ '>': v > r, '<': v < r, '>=': v >= r, '<=': v <= r, '==': v === r }[op]);

// ---------------------------------------------------------------- demo source: same model as the gateway simulator
class DemoSource {
  constructor() {
    this.mode = 'demo';
    this.user = { id: 'demo', name: 'Demo Engineer', role: 'engineer' };
    this.bypasses = new Map();
    this.connected = true;
    this.s = {
      'P-01.RUN': true, 'P-01.FAULT': false, 'P-02.RUN': true, 'CHL-01.RUN': true, 'CMP-01.RUN': true, 'CNV-01.RUN': false,
      'V-101.POS': 100, 'V-102.POS': 60, 'V-103.POS': 0, 'V-201.POS': 100, 'T-1.LEVEL': 62, 'CHL-01.SUPPLY_T': 7.4, 'INJ-01.MOLD_T': 44.5,
      'L-A.ON': true, 'L-A.LEVEL': 80, 'L-B.ON': true, 'L-B.LEVEL': 70, 'L-O.ON': false, 'MDB-1.KWH': 182340.5, 'WM-01.TOTAL': 48211.4
    };
    this.p02Fault = true;
    this.targets = {};
    this.pending = new Map();
    this.alarmState = new Map();
    this.pendingSince = new Map();
    this.alarmList = [];
    this.log = [];
    this.hist = [];
    this.listeners = [];
    for (let i = 0; i < 60; i++) this.hist.push([Date.now() - (60 - i) * 60000, 250 + Math.sin(i / 6) * 25 + Math.random() * 10]);
    this.step(); // fill initial values
  }
  on(fn) { this.listeners.push(fn); }
  emit(kind) { for (const f of this.listeners) f(kind); }
  start() { this.timer = setInterval(() => { this.step(); this.emit('tags'); }, 1000); }
  stop() { clearInterval(this.timer); }
  has(tag) { return tag in this.s; }
  value(tag) { return this.s[tag]; }
  values() { return this.s; }
  step() {
    const s = this.s;
    for (const [id, t] of Object.entries(this.targets)) { s[id] = s[id] < t ? Math.min(t, s[id] + 25) : Math.max(t, s[id] - 25); if (s[id] === t) delete this.targets[id]; }
    const f = (id, max) => max * s[id] / 100;
    const raw = s['P-01.RUN'] ? f('V-101.POS', 20) : 0;
    const out = s['T-1.LEVEL'] > 2 ? f('V-102.POS', 15) + f('V-103.POS', 25) : 0;
    s['T-1.LEVEL'] = clamp(s['T-1.LEVEL'] + (raw - out) * 0.03, 0, 100);
    s['P-01.AMPS'] = s['P-01.RUN'] ? 25 + Math.random() * 2.5 : 0;
    s['P-02.VIB'] = s['P-02.RUN'] ? (this.p02Fault ? 7.4 + Math.random() * 0.8 : 1.8 + Math.random() * 0.6) : 0;
    const cool = s['CHL-01.RUN'] && s['P-02.RUN'] && s['V-201.POS'] > 0;
    s['CHL-01.SUPPLY_T'] += ((s['CHL-01.RUN'] ? 7 : 18) - s['CHL-01.SUPPLY_T']) * 0.08 + (Math.random() - 0.5) * 0.1;
    s['INJ-01.MOLD_T'] += ((cool ? 42 + s['CHL-01.SUPPLY_T'] * 0.3 + (100 - s['V-201.POS']) * 0.15 : 78) - s['INJ-01.MOLD_T']) * 0.05;
    let kw = 40 + 21.6 + 19.5 + 44;
    for (const m of MACHINES) if (s[m.run]) kw += m.kw * 0.8;
    kw += (s['L-A.ON'] ? 3.6 * s['L-A.LEVEL'] / 100 : 0) + (s['L-B.ON'] ? 3 * s['L-B.LEVEL'] / 100 : 0) + (s['L-O.ON'] ? 2.4 : 0) + (Math.random() - 0.5) * 8;
    s['MDB-1.KW'] = kw; s['MDB-1.KWH'] += kw / 3600; s['WM-01.FLOW'] = raw; s['WM-01.TOTAL'] += raw / 3600;
    const last = this.hist[this.hist.length - 1];
    if (Date.now() - last[0] > 60000) { this.hist.push([Date.now(), kw]); this.hist.shift(); }
    // interlocks: tank full -> P-01 off (unless bypassed); LSHH is never bypassable
    for (const [id, b] of this.bypasses) if (b.until <= Date.now()) { this.bypasses.delete(id); this.addLog(B(`คืนค่าระบบป้องกัน ${id} (หมดเวลา)`, `Interlock ${id} restored (expired)`), 'PLC'); }
    for (const il of INTERLOCKS) {
      if (s[il.force[0]] !== il.force[1] && cmp(s[il.tag], il.op, il.value) && !this.bypasses.has(il.id)) {
        s[il.force[0]] = il.force[1];
        this.addLog(B(`Interlock ${il.id}: ตัด ${il.force[0].split('.')[0]}`, `Interlock ${il.id}: tripped ${il.force[0].split('.')[0]}`), 'PLC');
      }
    }
    this.alarms(Date.now());
  }
  alarms(t) {
    for (const r of ALARM_RULES) {
      const on = cmp(this.s[r.tag], r.op, r.value);
      const cur = this.alarmState.get(r.id);
      if (on) {
        if (cur && cur.state === 'active') continue;
        if (!this.pendingSince.has(r.id)) this.pendingSince.set(r.id, t);
        if (t - this.pendingSince.get(r.id) < (r.delaySec || 0) * 1000) continue;
        const a = { id: r.id + '@' + t, rule: r.id, tag: r.tag, severity: r.severity, text: r.text, value: this.s[r.tag], state: 'active', acked: false, raisedAt: t };
        this.alarmState.set(r.id, a);
        this.alarmList = [a, ...this.alarmList.filter((x) => x.rule !== r.id)].slice(0, 20);
        this.emit({ alarm: a });
      } else {
        this.pendingSince.delete(r.id);
        if (cur && cur.state === 'active') { cur.state = 'cleared'; if (cur.acked) this.alarmState.delete(r.id); }
      }
    }
  }
  activeAlarms() { return this.alarmList.filter((a) => !(a.acked && a.state === 'cleared')); }
  addLog(text, by) { this.log.unshift({ ts: Date.now(), text, by }); this.log.length = Math.min(this.log.length, 12); }
  async prepare(tag, value) {
    if (!(tag in this.s)) throw err('UNKNOWN_TAG', tag);
    for (const il of [...INTERLOCKS].sort((a, b) => a.bypassable - b.bypassable)) {
      if (il.force[0] !== tag || value === il.force[1] || this.bypasses.has(il.id)) continue;
      if (cmp(this.s[il.tag], il.op, il.value)) {
        const e = err('INTERLOCK', 'Blocked by interlock ' + il.id);
        e.details = { id: il.id, text: il.text, tag: il.tag, op: il.op, limit: il.value, value: this.s[il.tag], bypassable: il.bypassable, maxBypassMin: il.maxBypassMin || 30, fixes: il.fixes };
        throw e;
      }
    }
    const id = Math.random().toString(36).slice(2);
    this.pending.set(id, { id, tag, value, at: Date.now() });
    return { id, tag, value };
  }
  async confirm(id) {
    const c = this.pending.get(id);
    if (!c) throw err('NOT_FOUND', 'expired');
    this.pending.delete(id);
    if (/\.POS$/.test(c.tag)) this.targets[c.tag] = c.value; else this.s[c.tag] = c.value;
    if (c.tag === 'P-02.RUN' && c.value === false) this.p02Fault = false; // inspected & fixed in the demo story
    this.addLog(B(`${c.tag} → ${fmtVal(c.value, 'th')}`, `${c.tag} → ${fmtVal(c.value, 'en')}`), this.user.name);
    this.emit('tags');
    return { result: 'ok' };
  }
  async cancel(id) { this.pending.delete(id); }
  async ack(alarmId) {
    const a = this.alarmList.find((x) => x.id === alarmId);
    if (a) { a.acked = true; if (a.state === 'cleared') this.alarmState.delete(a.rule); }
    this.emit('alarms');
  }
  async history() { return this.hist.slice(); }
  interlocks() { return INTERLOCKS.map((il) => ({ id: il.id, text: il.text, active: cmp(this.s[il.tag], il.op, il.value), bypass: this.bypasses.get(il.id) || null })); }
  async bypass(id, minutes, reason) {
    const il = INTERLOCKS.find((q) => q.id === id);
    if (!il.bypassable) throw err('NOT_BYPASSABLE', id);
    if (!reason || reason.trim().length < 5) throw err('REASON_REQUIRED', 'reason');
    const b = { id, until: Date.now() + minutes * 60000, by: this.user.name, reason: reason.trim(), minutes };
    this.bypasses.set(id, b);
    this.addLog(B(`ข้ามระบบป้องกัน ${id} ${minutes} นาที: ${b.reason}`, `Bypassed ${id} for ${minutes} min: ${b.reason}`), this.user.name);
    this.emit('alarms');
    return b;
  }
  async restore(id) { this.bypasses.delete(id); this.addLog(B(`คืนค่าระบบป้องกัน ${id}`, `Interlock ${id} restored`), this.user.name); this.emit('alarms'); return true; }
}

// ---------------------------------------------------------------- live source: CoreDash Gateway
class LiveSource {
  constructor(base, token, user) {
    this.mode = 'live';
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.user = user;
    this.listeners = [];
    this.log = [];
    this.alarmList = [];
  }
  on(fn) { this.listeners.push(fn); }
  emit(kind) { for (const f of this.listeners) f(kind); }
  get connected() { return this.client && this.client.connected; }
  start() {
    const ws = this.base.replace(/^http/, 'ws') + '/ws';
    this.client = new CoreDashClient(ws, this.token);
    this.client.on('snapshot', (m) => { this.alarmList = m.alarms || []; this.emit('tags'); });
    this.client.on('tags', () => this.emit('tags'));
    this.client.on('connection', () => this.emit('conn'));
    this.client.on('interlocks', () => this.emit('alarms'));
    this.client.on('alarm', ({ event, alarm }) => {
      this.alarmList = [alarm, ...this.alarmList.filter((x) => x.rule !== alarm.rule)].slice(0, 20);
      this.emit(event === 'raise' ? { alarm } : 'alarms');
    });
    this.client.on('audit', (e) => {
      if (e.action !== 'write') return;
      const t = `${e.tag} → ${fmtVal(e.value, 'en')}`;
      this.log.unshift({ ts: Date.parse(e.ts), text: B(`${e.tag} → ${fmtVal(e.value, 'th')}`, t), by: e.user });
      this.log.length = Math.min(this.log.length, 12);
      this.emit('log');
    });
    this.client.on('error', (e) => { if (e && e.error === 'UNAUTHORIZED') this.emit('unauthorized'); });
  }
  stop() { if (this.client) this.client.close(); }
  has(tag) { return Boolean(this.client && this.client.values[tag]); }
  value(tag) { return this.client ? this.client.value(tag) : undefined; }
  values() { const o = {}; if (this.client) for (const [k, v] of Object.entries(this.client.values)) o[k] = v.value; return o; }
  activeAlarms() { return this.alarmList.filter((a) => !(a.acked && a.state === 'cleared')); }
  prepare(tag, value) { return this.client.prepare(tag, value); }
  confirm(id) { return this.client.confirm(id); }
  cancel(id) { return this.client.cancel(id).catch(() => {}); }
  ack(id) { return this.client.ack(id); }
  interlocks() { return (this.client && this.client.interlocks || []).map((il) => ({ ...il, bypass: il.bypass && il.bypass.until > Date.now() ? { ...il.bypass, by: il.bypass.by } : null })); }
  bypass(id, minutes, reason) { return this.client.bypass(id, minutes, reason); }
  restore(id) { return this.client.restore(id); }
  async history(tag, from) {
    const r = await fetch(`${this.base}/api/history?tag=${encodeURIComponent(tag)}&from=${from}&max=120`, { headers: { Authorization: 'Bearer ' + this.token } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).points;
  }
}

function err(code, message) { const e = new Error(message); e.code = code; return e; }
function fmtVal(v, lang) {
  if (v === true) return lang === 'th' ? 'เปิด/เดิน' : 'ON';
  if (v === false) return lang === 'th' ? 'ปิด/หยุด' : 'OFF';
  return v + '%';
}

// ---------------------------------------------------------------- app state
const S = {
  view: 'boot', tab: (location.hash || '#home').slice(1).split(/[?&]/)[0], seg: 'machines', sheet: null, settings: false,
  pending: null, toast: null, lang: store.get('lang', 'th'), theme: store.get('theme', 'navy'),
  gw: null, loginErr: '', hist: null, installEvt: null, busy: false,
  scadaMode: 'twin', blocked: null, deferred: null, bypassMin: 15, bypassReason: '', dayNight: store.get('dayNight', 'auto'), labels: true, zoom: null
};
if (!['home', 'house', 'scada', 'power', 'pq', 'bench', 'control', 'alerts', 'report'].includes(S.tab)) S.tab = 'home';
let src = null;
window.coredash = { get source() { return src; }, state: () => S };
const root = typeof document !== 'undefined' ? document.getElementById('app') : null;
const t = () => L[S.lang];
const tr = (o) => (o == null ? '' : typeof o === 'string' ? o : o[S.lang] ?? o.en);

function applyPrefs() {
  document.documentElement.lang = S.lang;
  document.documentElement.dataset.theme = S.theme;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = S.theme === 'light' ? '#FFFFFF' : S.theme === 'graphite' ? '#121418' : '#0A1230';
}

// developer badge: keep the animation phase continuous across re-renders
function badge(w, h) {
  const ph = -((performance.now() / 1000) % 9);
  return `<span class="cdt" role="img" aria-label="CoreDash Technology" style="width:${w}px;height:${h}px;--ph:${ph.toFixed(2)}s"><img class="a" src="icons/logo-green.webp" alt=""><img class="b" src="icons/logo-red.webp" alt=""><span class="s"></span></span>`;
}
const ICON = {
  wave: 'M2 12h3l2-6 3 12 3-14 3 16 2-8h4',
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', house: 'M3 10.5L12 3l9 7.5M5 9v11h14V9M9.5 20v-6h5v6M15.5 6.5V4h2v4', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', scada: 'M4 6h5v5H4zM15 13h5v5h-5zM9 8.5h4v7h2', control: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  alerts: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0', report: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bench: 'M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3M7 15h10',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z', warn: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  sun: 'M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4M7 16a5 5 0 0 1 10 0M3 20h18', clock: 'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', power: 'M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10'
};
const svg = (d, size = 22, color = 'currentColor') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// ---------------------------------------------------------------- derived values
const V = (tag) => (src ? src.value(tag) : undefined);
const has = (tag) => src && src.has(tag);
function alarmsFor(eqId) { return src.activeAlarms().some((a) => a.state === 'active' && a.tag.startsWith(eqId + '.')); }
function valveText(v) {
  const pos = V(v.pos) ?? 0;
  return [pos === 0 ? t().closed : t().openP + Math.round(pos) + '%', pos === 0 ? 'var(--mu)' : 'var(--it)', pos === 0 ? '#64748B' : '#1F5FFF'];
}
const embedded = () => { try { return window.self !== window.top; } catch (_) { return true; } };
const isDesk = () => typeof window !== 'undefined' && window.innerWidth >= 1024;
const canCommand = () => src && src.user && src.user.role !== 'viewer';

// ---------------------------------------------------------------- virtual control room
let twin = null, twinLang = null, twinCentered = false;
function getTwin() {
  if (!twin || twinLang !== S.lang) {
    if (twin) twin.destroy();
    const x = t();
    twin = createTwin({ zoneA: x.zoneA, zoneB: x.zoneB, zoneU: x.zoneU, aria: x.twinAria });
    twinLang = S.lang; twinCentered = false;
  }
  return twin;
}
function twinBar() {
  const x = t();
  const dn = [['auto', x.auto], ['day', x.day], ['night', x.night]].map(([k, l]) => `<button class="chip ${S.dayNight === k ? 'on' : ''}" data-act="daynight" data-arg="${k}" aria-pressed="${S.dayNight === k}">${l}</button>`).join('');
  return `<div class="twin-bar"><div class="chips">${dn}</div><button class="chip ${S.labels ? 'on' : ''}" data-act="labels" aria-pressed="${S.labels}">${x.labels}</button><div class="chips" style="margin-left:auto"><button class="chip" data-act="zoom" data-arg="-1" aria-label="${x.zoomOut}">−</button><button class="chip" data-act="zoom" data-arg="1" aria-label="${x.zoomIn}">+</button></div></div>`;
}
function twinBlock() {
  return `<div class="twin-block">${twinBar()}<div id="twin-slot"></div><div class="muted twin-hint">${t().twinHint}</div></div>`;
}
function mountTwin() {
  const slot = root.querySelector('#twin-slot');
  if (!slot) return;
  const tw = getTwin();
  slot.appendChild(tw.el);
  if (S.zoom == null) S.zoom = isDesk() ? 1 : 1.7;
  tw.setZoom(S.zoom);
  tw.update(src.values(), src.activeAlarms(), { dayNight: S.dayNight, labels: S.labels, t: t() });
  const sc = tw.el.querySelector('.twin-scroll');
  if (!twinCentered && sc.scrollWidth > sc.clientWidth) { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) * 0.55; twinCentered = true; }
  else if (sc.dataset.left) sc.scrollLeft = Number(sc.dataset.left);
}

// ---------------------------------------------------------------- meter test bench
const bench = new BenchSim();
let benchView = null;
const BS = { pts: { Q1: true, Q2: true, Q3: true, Q4: false }, vol: null, manual: false, runTotal: 0 };
const PNAME = { Q1: B('ไหลน้อยสุด', 'Minimum flow'), Q2: B('ไหลช่วงเปลี่ยน', 'Transitional flow'), Q3: B('ไหลใช้งานปกติ', 'Permanent flow'), Q4: B('ไหลสูงสุด (เกินพิกัด)', 'Overload flow') };
const DEFAULT_VOL = { Q1: 10, Q2: 10, Q3: 100, Q4: 200 };
const fmtQ = (q) => (q >= 1000 ? (q / 1000).toFixed(q >= 10000 ? 1 : 3).replace(/0+$/, '').replace(/\.$/, '') + ' m³/h' : (Math.round(q * 100) / 100) + ' L/h');
const fmtDur = (sec) => { const m = Math.floor(sec / 60), s2 = Math.round(sec % 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s2).padStart(2, '0')}`; };
function mountBench() {
  const slot = root.querySelector('#bench-slot');
  if (!slot) return;
  if (!benchView) { benchView = createBenchView({ lang: () => S.lang }); benchView.attach(bench); bench.on(() => schedule(100)); }
  slot.appendChild(benchView.el);
  const ds = root.querySelector('#dial-slot'); if (ds) ds.appendChild(benchView.dials);
  const sc = benchView.el.querySelector('.bench-scroll');
  if (sc && sc.dataset.left) sc.scrollLeft = Number(sc.dataset.left);
  else if (sc && sc.scrollWidth > sc.clientWidth) { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) * 0.4; sc.dataset.left = sc.scrollLeft; }
}
function viewBench() {
  const x = t(), pts = bench.points(), run = bench.run;
  const chip = (act, arg, label, on, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-arg="${arg}" aria-pressed="${on}" ${extra}>${label}</button>`;
  const busy = bench.mode === 'auto';
  const q3s = [1.6, 2.5, 4].map((q) => chip('bench-q3', q, 'Q3 ' + q, bench.q3 === q, busy ? 'disabled' : '')).join('');
  const rs = [80, 100, 160, 200, 250].map((r) => chip('bench-r', r, 'R' + r, bench.R === r, busy ? 'disabled' : '')).join('');
  const vols = [null, 10, 100, 200].map((v) => chip('bench-vol', v ?? 'auto', v ? v + ' L' : x.autoVol, BS.vol === v, busy ? 'disabled' : '')).join('');
  const speeds = [1, 10, 60, 300].map((v) => chip('bench-speed', v, '×' + v, bench.speed === v)).join('');
  const remaining = run && bench.step === 2 && bench.Q > 0.1 ? (run.V - bench.tank[run.tank]) / bench.Q * 3600 : null;
  const steps = STEPS.map((st, i) => `<li class="${bench.step === i ? 'now' : bench.step > i ? 'done' : ''}"><span class="num">${i + 1}</span>${tr(st)}</li>`).join('');
  const valves = [['in', 'XV-IN'], ['s', 'XV-S'], ['l', 'XV-L'], ['ds', 'XV-DS'], ['dl', 'XV-DL']].map(([k, l]) => `<button class="vbtn ${bench.v[k] ? 'on' : ''}" data-act="bench-valve" data-arg="${k}" aria-pressed="${bench.v[k]}" ${busy ? 'disabled' : ''}><span class="dotS" style="background:${bench.v[k] ? '#3B82F6' : '#64748B'}"></span>${l}<small>${bench.v[k] ? x.open : x.close}</small></button>`).join('');
  const res = bench.results.slice().reverse();
  const rows = res.map((r) => `<tr><td><b style="color:${POS_COLORS[r.meter]}">${r.meter}</b><div class="muted" style="font-size:11px">${esc(r.serial || '')}${r.fault ? ' · ' + x.faultOn : ''}</div></td><td><b>${r.key}</b></td><td class="num">${fmtQ(r.Q)}</td><td class="num">${r.start != null ? r.start.toFixed(2) : '—'}</td><td class="num">${r.end != null ? r.end.toFixed(2) : '—'}</td><td class="num">${r.vm.toFixed(2)}</td><td class="num">${r.vref.toFixed(3)}</td><td class="num" style="color:${r.pass ? 'var(--it)' : 'var(--bad)'};font-weight:700">${r.e >= 0 ? '+' : ''}${r.e.toFixed(2)} %</td><td class="num">±${r.mpe} %</td><td><span class="pill ${r.pass ? 'run' : 'alarm'}">${r.pass ? x.pass : x.failR}</span></td></tr>`).join('');
  const plan = ['Q1', 'Q2', 'Q3', 'Q4'].map((k) => { const v = DEFAULT_VOL[k]; return `<tr><td><b>${k}</b></td><td class="num">${fmtQ(pts[k])}</td><td class="num">${v} L</td><td>${v <= 10.5 ? TANKS.S.name : TANKS.L.name}</td><td class="num">${fmtDur(v / pts[k] * 3600)}</td><td class="num">±${k === 'Q1' ? 5 : 2} %</td></tr>`; }).join('');
  const G = S.lang === 'th' ? [
    ['LSL-S / LSL-L', 'ก้นถังตวง เหนือวาล์วระบาย', 'ยืนยันถังแห้ง (จุดศูนย์) ก่อนเริ่มทุกครั้ง', 'Capacitive / conductive point'],
    ['LS-10', 'กึ่งกลางคอถัง TK-20 ที่ 10.00 L', 'สั่งปิดวาล์วเร็วเมื่อครบ 10 L (Q1, Q2)', 'Optical / capacitive ปรับระดับได้'],
    ['LS-100', 'กึ่งกลางคอล่าง TK-200 ที่ 100.0 L', 'หยุดที่ 100 L (Q3)', 'Optical / capacitive ปรับระดับได้'],
    ['LS-200', 'กึ่งกลางคอบน TK-200 ที่ 200.0 L', 'หยุดที่ 200 L (Q3, Q4)', 'Optical / capacitive ปรับระดับได้'],
    ['LSHH-S / LSHH-L', 'เหนือคอบนสุด (11.2 L / 210 L)', 'กันล้น: ตัดวาล์วทั้งหมด + อลาร์ม ต่อตรงเข้ารีเลย์ความปลอดภัย', 'Float switch'],
    ['LT-01', 'ฝาบนถัง TK-200', 'วัดระดับต่อเนื่อง แสดงปริมาตรและเวลาที่เหลือ', 'Radar 80 GHz'],
    ['FT-01', 'ปลายน้ำของชุดมาตร ก่อน FCV-01', 'อ้างอิงและคุมอัตราไหลให้คงที่ระหว่างทดสอบ', 'Electromagnetic DN15 · ±0.2 %'],
    ['PT-01 / PT-02', 'ก่อนและหลังชุดมาตร', 'แรงดันทดสอบ และแรงดันตกคร่อมมาตร (≤ 0.63 bar ที่ Q3)', 'Pressure transmitter 0–10 bar'],
    ['TT-01', 'ก่อนเข้าถังตวง', 'แก้ค่าปริมาตรถังตวงเป็น 20 °C', 'PT100 class A'],
    ['XV-S / XV-L', 'เหนือถังตวง ชิดทางเข้าถังที่สุด', 'วาล์วเปิด-ปิดเร็ว (≤ 0.5 วินาที) ลดน้ำค้างในท่อ', 'Pneumatic ball valve'],
    ['XV-DS / XV-DL', 'ก้นถังตวง', 'ระบายน้ำกลับถังพัก TK-SUP', 'Pneumatic ball valve']
  ] : [
    ['LSL-S / LSL-L', 'Tank bottom, above the drain valve', 'Confirms an empty tank (zero) before every run', 'Capacitive / conductive point'],
    ['LS-10', 'Middle of the TK-20 neck at 10.00 L', 'Fast valve close at 10 L (Q1, Q2)', 'Adjustable optical / capacitive'],
    ['LS-100', 'Middle of the TK-200 lower neck at 100.0 L', 'Stop at 100 L (Q3)', 'Adjustable optical / capacitive'],
    ['LS-200', 'Middle of the TK-200 upper neck at 200.0 L', 'Stop at 200 L (Q3, Q4)', 'Adjustable optical / capacitive'],
    ['LSHH-S / LSHH-L', 'Above the top neck (11.2 L / 210 L)', 'Overflow: close all valves + alarm, hard-wired to a safety relay', 'Float switch'],
    ['LT-01', 'Top cover of TK-200', 'Continuous level for volume and time-left display', 'Radar 80 GHz'],
    ['FT-01', 'Downstream of the meters, before FCV-01', 'Reference and closed-loop control of the test flow', 'Electromagnetic DN15 · ±0.2 %'],
    ['PT-01 / PT-02', 'Before and after the meter string', 'Test pressure and pressure loss (≤ 0.63 bar at Q3)', 'Pressure transmitter 0–10 bar'],
    ['TT-01', 'Before the proving tanks', 'Correct the tank volume to 20 °C', 'PT100 class A'],
    ['XV-S / XV-L', 'Above each tank, as close to the inlet as possible', 'Fast open/close (≤ 0.5 s) to cut line drain-back', 'Pneumatic ball valve'],
    ['XV-DS / XV-DL', 'Tank bottom', 'Drain back to TK-SUP', 'Pneumatic ball valve']
  ];
  // ---------- easy flow: 1 meters · 2 rating · 3 points · 4 start
  const PK = ['Q1', 'Q2', 'Q3', 'Q4'];
  const chosen = PK.filter((k) => BS.pts[k]);
  const nMeters = POSITIONS.filter((id) => bench.selected[id]).length;
  const volOf = (k) => BS.vol || DEFAULT_VOL[k];
  const realSec = chosen.reduce((sum, k) => sum + volOf(k) / pts[k] * 3600 + 90, 0);
  const water = chosen.reduce((sum, k) => sum + volOf(k), 0);
  const ptCards = PK.map((k) => {
    const on = !!BS.pts[k], v = volOf(k);
    return `<button class="pcard ${on ? 'on' : ''}" data-act="bench-pt" data-arg="${k}" aria-pressed="${on}" ${busy ? 'disabled' : ''}>
      <span class="tick">${on ? '✓' : ''}</span>
      <span class="pk">${k}</span>
      <span class="pn2">${tr(PNAME[k])}</span>
      <span class="pq">${fmtQ(pts[k])}</span>
      <span class="pm">${v} L · ${v <= 10.5 ? 'TK-20' : 'TK-200'} · ±${k === 'Q1' ? 5 : 2}%</span>
      <span class="pm">≈ ${fmtDur(v / pts[k] * 3600 + 90)}</span>
    </button>`;
  }).join('');
  const modelCards = MODEL_NAMES.map((n) => { const on = bench.model === n, M = MODELS[n]; return `<button class="modcard ${on ? 'on' : ''}" data-act="bench-model" data-arg="${esc(n)}" aria-pressed="${on}" ${busy ? 'disabled' : ''}><span class="tick">${on ? '✓' : ''}</span><svg viewBox="0 0 200 200" class="mini-dial" aria-hidden="true">${dialSvg('mc' + M.code, n, { q3: bench.q3, R: bench.R, serial: '—', reading: 397.4 })}</svg><b>${esc(n)}</b><small>${esc(tr(M.kind))}</small></button>`; }).join('');
  const mCards = POSITIONS.map((id) => { const on = !!bench.selected[id]; return `<div class="poscard ${on ? 'on' : ''}"><button class="posbtn" data-act="bench-meter" data-arg="${id}" aria-pressed="${on}" ${busy ? 'disabled' : ''}><span class="tick">${on ? '✓' : ''}</span><b style="color:${POS_COLORS[id]}">${id}</b><span>${esc(bench.model)}</span>${bench.fault === id ? `<small class="bad">${x.faultOn}</small>` : ''}</button><label class="sn"><small>S/N</small><input data-serial="${id}" value="${esc(bench.serials[id] || '')}" maxlength="24" ${busy ? 'disabled' : ''} aria-label="${id} serial"></label></div>`; }).join('');
  const sec = (n, title, hint, body) => `<div class="wstep"><div class="wh"><span class="wn">${n}</span><div><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</div></div>${body}</div>`;
  const total = BS.runTotal || 1, idx = run ? total - bench.queue.length : 0;
  const fillPct = run ? clamp(bench.tank[run.tank] / run.V * 100, 0, 100) : 0;
  const pointSec = run ? bench.t - run.t0 : 0;
  const startBox = busy && run ? `
    <div class="runbox">
      <div class="row" style="flex-wrap:wrap;gap:8px"><span class="dotS pulse" style="width:12px;height:12px;background:#22C55E"></span><b class="big">${x.nowTesting} ${run.key} · ${fmtQ(run.Q)}</b><span class="pill run" style="margin-left:auto">${x.pointOf.replace('{a}', idx).replace('{b}', total)}</span></div>
      <div class="pbar"><i style="width:${((idx - 1) / total * 100 + fillPct / total).toFixed(1)}%"></i></div>
      <div class="muted">${x.stepNow} ${bench.step + 1}/6: <b style="color:var(--tx)">${tr(STEPS[Math.max(0, bench.step)])}</b></div>
      <div class="grid2"><div class="stat"><small>${x.filled} (${TANKS[run.tank].name})</small><b>${bench.tank[run.tank].toFixed(run.tank === 'S' ? 3 : 2)} / ${run.V} L</b></div><div class="stat"><small>${remaining != null ? x.eta : x.pointTime}</small><b>${fmtDur(remaining != null ? remaining : pointSec)}</b></div></div>
      <button class="btn warn big" data-act="bench-stop">■ ${x.stopRun}</button>
    </div>` : `
    ${bench.results.length && !busy ? (() => { const sm = summarize(bench.results); return `<div class="donebar ${sm.allPass ? 'ok' : 'ng'}"><b>${sm.allPass ? '✓' : '!'} ${x.doneTitle}</b><span>${x.donePass.replace('{a}', sm.nPass).replace('{b}', sm.nRows)}</span><span class="dbtns"><button class="btn primary" data-act="rp-open">👁 ${x.rpPreview}</button><button class="btn" data-act="rp-xlsx">⬇ Excel</button></span></div>`; })() : ''}
    <div class="startbox">
      <div class="sum">${chosen.length && nMeters ? x.summary.replace('{m}', nMeters).replace('{p}', chosen.join(' → ')).replace('{w}', water).replace('{t}', fmtDur(realSec)) : `<span class="bad">${!nMeters ? x.selectMeter : x.selectPoint}</span>`}</div>
      <button class="btn go" data-act="bench-run" ${chosen.length && nMeters ? '' : 'disabled'}>▶ ${x.startAuto}</button>
      <div class="muted" style="font-size:12px">${x.startNote}</div>
    </div>`;
  const flows = PK.map((k) => chip('bench-flow', k, `${x.fillAt} ${k} · ${fmtQ(pts[k])}`, Math.abs(bench.Qset - pts[k]) < 0.01 && bench.Qset > 0, busy ? 'disabled' : '')).join('');
  return `
  <div class="row" style="flex-wrap:wrap"><h2>${x.benchTitle}</h2><span class="pill run">${x.benchStd}</span></div>
  <div class="howto">${[x.how1, x.how2, x.how3, x.how4].map((h, i) => `<div><span class="wn">${i + 1}</span><span>${h}</span></div>`).join('<i class="arrow">›</i>')}</div>
  <div class="actionbar">${startBox}</div>
  ${bench.alarm ? `<div class="status warn"><span class="dotS pulse" style="width:14px;height:14px;background:#F59E0B"></span><div><b style="color:var(--tx)">${x.alarmOv}</b><div class="muted">${esc(tr(bench.alarm.text))}</div></div></div>` : ''}
  <div class="bgrid2">
    <section class="card col wizard">
      ${sec(1, x.s1, x.s1h, `<div class="modgrid">${modelCards}</div><div class="lbl2 muted">${x.s1pos}</div><div class="mgrid">${mCards}</div>`)}
      ${sec(2, x.s2, x.s2h, `<div class="chipwrap">${q3s}</div><div class="chipwrap">${rs}</div>`)}
      ${sec(3, x.s3, x.s3h, `<div class="chipwrap"><button class="chip" data-act="bench-preset" data-arg="std" ${busy ? 'disabled' : ''}>${x.presetStd}</button><button class="chip" data-act="bench-preset" data-arg="all" ${busy ? 'disabled' : ''}>${x.presetAll}</button></div><div class="pgrid">${ptCards}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px"><span class="muted" style="font-size:13px">${x.volume}:</span>${vols}</div>`)}
    </section>
    <div class="col" style="gap:14px">
      <div class="bench-wrap card"><div id="bench-slot"></div><div class="muted" style="font-size:12px">${x.benchNote}</div></div>
      <section class="card col"><div class="row" style="flex-wrap:wrap"><h2>${x.dialTitle}</h2><span class="muted" style="font-size:12px">${x.dialHint}</span></div><div id="dial-slot"></div></section>
      <section class="card col">
        <h2>${x.live}</h2>
        <div class="grid2">
          <div class="stat"><small>${x.flowNow}</small><b>${bench.Q.toFixed(1)} L/h</b></div>
          <div class="stat"><small>${x.pointTime}</small><b>${fmtDur(pointSec)}</b></div>
          <div class="stat"><small>TK-20</small><b>${bench.tank.S.toFixed(3)} L</b></div>
          <div class="stat"><small>TK-200</small><b>${bench.tank.L.toFixed(2)} L</b></div>
        </div>
        <ol class="steps">${steps}</ol>
        <div class="row" style="flex-wrap:wrap;gap:6px"><span class="muted" style="font-size:13px">${x.speed}:</span>${speeds}</div>
      </section>
      <section class="card col">
        <button class="mtoggle" data-act="bench-manual" aria-expanded="${!!BS.manual}"><div><b>🔧 ${x.manual}</b><small>${x.manualSub}</small></div><span>${BS.manual ? '▲' : '▼'}</span></button>
        ${BS.manual ? `<div class="muted">${x.manualHint}</div>
          <div class="lbl2 muted">${x.mValves}</div><div class="vgrid">${valves}</div>
          <div class="lbl2 muted">${x.mFlows}</div><div class="chipwrap">${flows}${chip('bench-flow', 'off', '■ ' + x.closeAll, false, busy ? 'disabled' : '')}</div>
          <button class="btn" data-act="bench-fault" ${busy ? 'disabled' : ''}>${x.fault}${bench.fault ? ' · ' + bench.fault : ''}</button>` : ''}
      </section>
    </div>
  </div>
  ${res.length ? viewBenchSummary(pts) : ''}
  <section class="card col">
    <div class="row" style="flex-wrap:wrap"><h2>${x.results}</h2><span class="muted">${esc(bench.model)} · DN15 · Q3 ${bench.q3} m³/h · R${bench.R}</span>
      <span style="margin-left:auto;display:flex;gap:8px">${res.length ? `<button class="btn" style="min-height:40px;padding:8px 14px" data-act="bench-clear">${x.clear}</button>` : ''}</span></div>
    ${res.length ? `<div class="tscroll"><table class="rtable"><thead><tr><th>${x.colMeter}</th><th>${x.colPoint}</th><th>${x.colQ}</th><th>${x.colStart}</th><th>${x.colEnd}</th><th>${x.colVm}</th><th>${x.colVref}</th><th>${x.colE}</th><th>${x.colMpe}</th><th>${x.colRes}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="muted">${x.noResults}</div>`}
  </section>
  <section class="card col">
    <h2>${x.guide}</h2>
    <div class="tscroll"><table class="rtable"><thead><tr><th>${x.gSensor}</th><th>${x.gWhere}</th><th>${x.gWhy}</th><th>${x.gType}</th></tr></thead><tbody>${G.map((g) => `<tr><td><b class="num">${g[0]}</b></td><td>${g[1]}</td><td>${g[2]}</td><td class="muted">${g[3]}</td></tr>`).join('')}</tbody></table></div>
    <div class="neck"><b>${x.neckTitle}</b><span>${x.neckText}</span></div>
    <h2 style="margin-top:6px">${x.planTitle}</h2>
    <div class="tscroll"><table class="rtable"><thead><tr><th>${x.colPoint}</th><th>${x.colQ}</th><th>${x.volume}</th><th>${x.tankUsed}</th><th>${x.simTime}</th><th>${x.colMpe}</th></tr></thead><tbody>${plan}</tbody></table></div>
  </section>`;
}

function viewBenchSummary(pts) {
  const x = t(), R = RT[S.lang], sm = summarize(bench.results);
  const tiles = sm.meters.map((m) => `<div class="vtile ${m.pass ? 'ok' : 'ng'}"><div class="row"><b style="color:${POS_COLORS[m.id]}">${m.id}</b><span class="muted">SN ${esc(m.serial)}</span></div><div class="vbig">${m.pass ? '✓ ' + R.pass : '✕ ' + R.fail}</div><div class="muted">${R.ptsPassed} ${m.rows.filter((r) => r.pass).length}/${m.rows.length} · ${R.maxErr} ${m.maxE >= 0 ? '+' : ''}${m.maxE.toFixed(2)} %</div></div>`).join('');
  const kpi = [[R.kMeters, sm.meters.length], [R.kPoints, sm.keys.join(' · ')], [R.kPass, `${sm.nPass}/${sm.nRows}`], [R.kWater, sm.water.toFixed(1) + ' L'], [R.kTime, Math.round(sm.time / 60) + ' min']].map(([k, v]) => `<div class="stat"><small>${k}</small><b>${esc(v)}</b></div>`).join('');
  const p = flowPoints(sm.q3, sm.R);
  return `<section class="card col sumcard">
    <div class="row" style="flex-wrap:wrap;gap:10px"><h2>${x.sumTitle}</h2><span class="pill ${sm.allPass ? 'run' : 'alarm'}">${sm.allPass ? '✓ ' + R.pass : '✕ ' + R.fail} ${sm.nPass}/${sm.nRows}</span><span class="muted" style="font-size:12px">${docNumber(sm.t0)} · ${esc(sm.model)}</span>
      <span class="dbtns" style="margin-left:auto"><button class="btn primary" data-act="rp-open">👁 ${x.rpPreview}</button><button class="btn" data-act="rp-xlsx">⬇ Excel</button><button class="btn" data-act="rp-pdf">🖨 PDF</button></span></div>
    <div class="vtiles">${tiles}</div>
    <div class="kpis">${kpi}</div>
    <div class="charts2"><div><h3>${R.chartCurve}</h3>${curveChart(sm.rows, p)}</div><div><h3>${R.chartBar}</h3>${barChart(sm.rows)}</div></div>
  </section>`;
}
let rpCache = { key: '', html: '' };
function viewPreview() {
  if (!S.preview || !bench.results.length) return '';
  const x = t();
  const key = S.lang + '|' + bench.results.length + '|' + bench.results[bench.results.length - 1].ts;
  if (rpCache.key !== key) rpCache = { key, html: reportHTML(bench.results, reportMeta(), S.lang, badge(64, 78)) };
  return `<div class="rp-scrim" role="dialog" aria-label="${x.rpPreview}"><div class="rp-bar"><b>${x.rpPreview}</b><span class="dbtns"><button class="btn" data-act="rp-xlsx">⬇ Excel</button><button class="btn primary" data-act="rp-pdf">🖨 ${x.rpPdf}</button><button class="btn" data-act="rp-close">${x.close2}</button></span></div><div class="rp-paper">${rpCache.html}</div></div>`;
}
function reportMeta() { return { site: tr(B('โรงงาน A · บางนา', 'Plant A · Bang Na')), bench: 'TB-01 · CoreDash Nexus', operator: (src && src.user && src.user.name) || '—', simulated: true }; }
function saveXlsx() {
  if (!bench.results.length) return;
  const data = buildXlsx(bench.results, reportMeta(), S.lang);
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = docNumber(summarize(bench.results).t0) + '.xlsx';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(t().savedX + a.download);
}
function printReport() {
  if (!S.preview) { S.preview = true; render(); }
  document.body.classList.add('print-report');
  const done = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (_) { toast(t().pdfHint, true); } setTimeout(done, 1500); }, 250);
}

// ---------------------------------------------------------------- residential home
const HM_METERS = {
  'SMCV4': { how: 'nfc', label: B('อ่านผ่าน NFC', 'Read over NFC'), hint: B('แตะด้านหลังมือถือที่หน้ามาตร ระบบอ่านปริมาตร วันที่ เวลา และแบตเตอรี่จากมาตรโดยตรง', 'Tap the back of the phone on the meter face: volume, date, time and battery come straight from the meter') },
  'GMCV3-V3.5': { how: 'lcd', label: B('อ่านจากจอ LCD ด้วยกล้อง', 'Read the LCD with the camera'), hint: B('เล็งกล้องให้จอ LCD อยู่ในกรอบ ระบบอ่านตัวเลข 7 ส่วนจากภาพ แล้วให้ตรวจสอบก่อนบันทึก', 'Frame the LCD; the 7-segment digits are read from the image, then you confirm') },
  'ASAHI GMK': { how: 'mech', label: B('อ่านหน้าปัดแมคคานิคด้วยกล้อง', 'Read the mechanical dial with the camera'), hint: B('ถ่ายรูปหน้าปัด ระบบหาแถวตัวเลขเอง แล้วอ่านล้อดำ (ม³) และล้อแดง (ลิตร) ละเอียด 1 ลิตร', 'Photograph the dial; the app finds the drums and reads black (m³) and red (litres) to 1 litre') }
};
const hm = { sim: new HomeSim(), view: null, cams: null, big: null, model: 'ASAHI GMK', hist: [], stream: null, price: { water: 12, power: 4.18 } };
(() => {
  const s = hm.sim; if (s.reading < 100000) s.reading = 182450.0;
  try { const h = JSON.parse(localStorage.getItem('cd-home-hist3') || 'null'); if (Array.isArray(h)) hm.hist = h; const m = localStorage.getItem('cd-home-model'); if (m) hm.model = m; } catch (_) { /* storage unavailable */ }
  if (!hm.hist.length) hm.hist = seedHistory(s.reading - 9200);
})();
// simulated past readings (monthly, on the 1st) ending at `endL` litres; usage scales down for a new meter
function seedHistory(endL) {
  const now = new Date(), out = []; let r = endL;
  const typical = 20000, k = Math.min(1, endL / (typical * 7));
  for (let i = 1; i <= 6; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1, 8, 30); if (d.getTime() > Date.now()) continue; out.push({ ts: d.getTime(), L: Math.max(0, Math.round(r)), how: 'mech', model: 'ASAHI GMK', src: 'seed' }); r -= (17000 + (i * 2300) % 7000) * k; }
  return out;
}
function saveHist() { try { localStorage.setItem('cd-home-hist3', JSON.stringify(hm.hist.slice(0, 60))); localStorage.setItem('cd-home-model', hm.model); } catch (_) { /* ignore */ } }
function mountHouse() {
  const slot = root.querySelector('#hm-slot');
  if (slot) {
    if (!hm.view) hm.view = createHomeView(hm.sim, { lang: () => S.lang, showHot: () => S.hsec === 'light', onPick: (k, a) => {
      if (k === 'light') { hm.sim.light[a] = !hm.sim.light[a]; }
      else if (k === 'cam') { S.camBig = a; }
      else if (k === 'meter') S.hsec = 'meter';
      else if (k === 'valves') S.hsec = 'valve';
      schedule();
    } });
    slot.appendChild(hm.view.el);
  }
  const rs = root.querySelector('#realcam-slot');
  if (rs) {
    if (!hm.real) hm.real = createRealCamView({ lang: () => S.lang, live: () => (src && src.mode === 'live' ? { base: src.base, token: src.token } : null), onToast: (m, bad) => toast(m, bad) });
    if (hm.real.el.parentNode !== rs) { rs.appendChild(hm.real.el); hm.real.langChanged(); }
    hm.real.show();
  } else if (hm.real) hm.real.hide();
  const cs = root.querySelector('#cam-slot');
  if (cs) {
    if (!hm.cams) {
      hm.cams = document.createElement('div'); hm.cams.className = 'cam-grid';
      hm.cams.innerHTML = CAMS.map((c) => `<figure class="cam" data-act="cam-big" data-arg="${c.id}"><canvas width="480" height="270" data-cam="${c.id}"></canvas><figcaption><span class="dotS pulse" style="background:#22C55E"></span><b>${c.id}</b><span class="cam-n" data-cn="${c.id}"></span></figcaption></figure>`).join('');
      camLoop();
    }
    hm.cams.querySelectorAll('[data-cn]').forEach((e) => { const c = CAMS.find((q) => q.id === e.dataset.cn); e.textContent = tr(c.name); });
    cs.appendChild(hm.cams);
  }
  const bs = root.querySelector('#camb-slot');
  if (bs) { if (!hm.big) { hm.big = document.createElement('canvas'); hm.big.width = 1280; hm.big.height = 720; hm.big.className = 'cam-bigc'; camLoop(); } bs.appendChild(hm.big); }
  const vs = root.querySelector('#mr-video');
  if (vs && hm.stream && vs.srcObject !== hm.stream) { vs.srcObject = hm.stream; vs.play().catch(() => {}); }
}
let camRaf = 0;
const camState = () => { const s = hm.sim; return { carLight: s.light['L-CAR'], gardenLight: s.light['L-GDN'], livLight: s.light['L-LIV'], sprinkler: s.valve['V-GDN'].pos * s.valve['V-MAIN'].pos > 0.3 }; };
function camLoop() {
  if (camRaf) return;
  const step = (now) => {
    camRaf = requestAnimationFrame(step);
    if (step.last && now - step.last < 80) return; step.last = now;
    const night = hm.sim.isNight(), t = now / 1000;
    if (hm.cams && hm.cams.isConnected) hm.cams.querySelectorAll('canvas').forEach((cv) => drawCam(cv.getContext('2d'), CAMS.find((c) => c.id === cv.dataset.cam), t, night, S.lang, camState()));
    if (hm.big && hm.big.isConnected && S.camBig) drawCam(hm.big.getContext('2d'), CAMS.find((c) => c.id === S.camBig), t, night, S.lang, camState());
  };
  camRaf = requestAnimationFrame(step);
}
function stopCamera() { clearInterval(scanTimer); if (hm.stream) { hm.stream.getTracks().forEach((tk) => tk.stop()); hm.stream = null; } }
const inAppBrowser = () => /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|KAKAOTALK|MicroMessenger|; wv\)/i.test(navigator.userAgent || '');
const isAndroid = () => /Android/i.test(navigator.userAgent || '');
function chromeIntent() { const u = new URL(location.href); return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`; }
async function startCamera() {
  const m = S.mread; if (!m) return;
  m.camErr = null;
  try {
    if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { name: 'Insecure' });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nomedia'), { name: 'NoMedia' });
    try { hm.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
    catch (e) { if (e && e.name === 'OverconstrainedError') hm.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); else throw e; }
    m.cam = 'live'; m.scan = { hits: 0, msg: t().hmScanLook, busy: false };
    // torch (flash) when the camera supports it
    try { const tr2 = hm.stream.getVideoTracks()[0], cap = tr2.getCapabilities ? tr2.getCapabilities() : {}; m.torchOk = !!cap.torch; } catch (_) { m.torchOk = false; }
    scanLoop();
  } catch (e) { m.cam = 'sim'; m.camErr = (e && e.name) || 'Error'; }
  schedule();
}
let scanTimer = 0;
function scanLoop() {
  clearInterval(scanTimer);
  const work = document.createElement('canvas');
  scanTimer = setInterval(async () => {
    const m = S.mread, v = root.querySelector('#mr-video');
    if (!m || m.cam !== 'live' || m.step !== 'ready' || !hm.stream) { clearInterval(scanTimer); return; }
    if (!v || !v.videoWidth || m.scan.busy) return;
    m.scan.busy = true;
    try {
      const sc = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight));
      work.width = Math.round(v.videoWidth * sc); work.height = Math.round(v.videoHeight * sc);
      work.getContext('2d').drawImage(v, 0, 0, work.width, work.height);
      const loc = await locateByColour(work);
      const x = t();
      if (loc && loc.digitH > work.height * 0.022) { m.scan.hits++; m.scan.msg = m.scan.hits >= 2 ? x.hmScanHold : x.hmScanFound; }
      else { m.scan.hits = 0; m.scan.msg = loc ? x.hmScanCloser : x.hmScanLook; }
      const el = root.querySelector('.scan-msg'); if (el) { el.textContent = m.scan.msg; el.classList.toggle('ok', m.scan.hits > 0); }
      const fr = root.querySelector('.vf-guide'); if (fr) fr.classList.toggle('ok', m.scan.hits > 0);
      if (m.scan.hits >= 3 && m.autoSnap !== false) { clearInterval(scanTimer); await ocrFromCamera(); }
    } catch (_) { /* keep scanning */ } finally { if (S.mread && S.mread.scan) S.mread.scan.busy = false; }
  }, 600);
}
async function toggleTorch() {
  const m = S.mread; if (!hm.stream || !m) return;
  try { m.torch = !m.torch; await hm.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: m.torch }] }); } catch (_) { m.torchOk = false; }
}

// ---------- real reading of a mechanical meter from a photo (on-device OCR)
const ocr = { src: null, work: null, url: '' };
async function ocrSetImage(srcCanvasOrImg, rotateDeg = 0) {
  const W = srcCanvasOrImg.naturalWidth || srcCanvasOrImg.width, H = srcCanvasOrImg.naturalHeight || srcCanvasOrImg.height;
  const sc = Math.min(1, 1800 / Math.max(W, H));
  const c = document.createElement('canvas'); c.width = Math.round(W * sc); c.height = Math.round(H * sc);
  const g = c.getContext('2d'); g.fillStyle = '#E5E5E5'; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate(rotateDeg * Math.PI / 180); g.drawImage(srcCanvasOrImg, -c.width / 2, -c.height / 2, c.width, c.height);
  ocr.work = c; ocr.url = c.toDataURL('image/jpeg', 0.9);
}
const ocrProgress = (st, p) => { if (S.mread && S.mread.step === 'ocr') { S.mread.prog = st === 'recognizing text' ? null : `${st} ${Math.round(p * 100)}%`; schedule(200); } };
async function ocrFromImage(img) {
  const m = S.mread; ocr.src = img; m.rot = 0;
  m.step = 'ocr'; m.prog = t().hmOcrFind; schedule();
  try {
    const loc = await locateRegister(img, ocrProgress);
    if (loc) { ocr.work = loc.image; ocr.url = loc.image.toDataURL('image/jpeg', 0.9); m.box = loc.box; m.auto = true; }
    else { await ocrSetImage(img); m.box = { x: 0.2, y: 0.4, w: 0.6, h: 0.08 }; m.auto = false; m.step = 'adjust'; toast(t().hmOcrNotFound, true); schedule(); return; }
  } catch (e) { m.step = 'ready'; toast(t().hmOcrFail, true); schedule(); return; }
  await ocrRead();
}
async function ocrRead() {
  const m = S.mread; if (!m || !ocr.work) return;
  m.step = 'ocr'; m.prog = t().hmOcrRead; schedule();
  try {
    const r = await readRegister(ocr.work, m.box, { onProgress: ocrProgress, onCell: (k, n) => { m.prog = `${t().hmOcrRead} ${k}/${n}`; const e = root.querySelector('.ocr-prog'); if (e) e.textContent = m.prog; } });
    Object.assign(m, { step: 'check', digits: r.digits.map((d) => (d === '?' ? '0' : d)), conf: r.conf, cells: r.cells, ts: Date.now(), src: 'ocr' });
  } catch (e) { m.step = 'adjust'; toast(t().hmOcrFail, true); }
  schedule();
}
function ocrValue(m) { const s = m.digits.join(''); return Number(s.slice(0, 4) + '.' + s.slice(4)); }
async function ocrFromCamera() {
  const v = root.querySelector('#mr-video'); if (!v || !v.videoWidth) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  stopCamera(); S.mread.cam = 'sim';
  await ocrFromImage(c);
}
async function ocrDemo() {
  // a rendered photo of the meter at the current (simulated) reading, slightly tilted
  const L = hm.sim.reading, svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 320 320" width="1100" height="1100"><rect x="-60" y="-60" width="320" height="320" fill="#D9D6CE"/>${dialSvg('ocrd', 'ASAHI GMK', { R: 80, serial: 'AG-25110388', reading: L })}</svg>`;
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await im.decode();
  const c = document.createElement('canvas'); c.width = 1100; c.height = 1100; const g = c.getContext('2d'); g.translate(550, 550); g.rotate(0.07); g.drawImage(im, -550, -550);
  await ocrFromImage(c);
}
function cropDrag(ev) {
  const h = ev.target.closest('[data-crop]'); if (!h || !S.mread || !S.mread.box) return;
  const wrap = h.closest('.crop-wrap'), r = wrap.getBoundingClientRect(), b0 = { ...S.mread.box }, x0 = ev.clientX, y0 = ev.clientY, mode = h.dataset.crop, boxEl = wrap.querySelector('.crop-box');
  interacting = true; h.setPointerCapture && h.setPointerCapture(ev.pointerId); ev.preventDefault();
  const move = (e) => {
    const dx = (e.clientX - x0) / r.width, dy = (e.clientY - y0) / r.height, b = S.mread.box;
    if (mode === 'move') { b.x = Math.min(1 - b0.w, Math.max(0, b0.x + dx)); b.y = Math.min(1 - b0.h, Math.max(0, b0.y + dy)); }
    else { b.w = Math.min(1 - b0.x, Math.max(0.08, b0.w + dx)); b.h = Math.min(1 - b0.y, Math.max(0.03, b0.h + dy)); }
    Object.assign(boxEl.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' });
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); interacting = false; schedule(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
const hmQuant = (L, model) => { const r = model === 'ASAHI GMK' ? 0.05 : 0.01; return Math.round(L / r) * r; };
async function readMeter() {
  const m = S.mread; if (!m) return;
  m.step = 'scan'; schedule();
  const sim = () => ({ L: hmQuant(hm.sim.reading, m.model), src: 'sim' });
  let got = null;
  if (m.how === 'nfc' && 'NDEFReader' in window) {
    try {
      const reader = new window.NDEFReader();
      const ctl = new AbortController();
      await reader.scan({ signal: ctl.signal });
      got = await new Promise((res) => {
        const tm = setTimeout(() => { ctl.abort(); res(null); }, 12000);
        reader.onreading = (ev) => {
          for (const rec of ev.message.records) {
            if (rec.recordType === 'text') { const txt = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data); const n = parseFloat((txt.match(/[\d.]+/) || [])[0]); if (Number.isFinite(n)) { clearTimeout(tm); ctl.abort(); res({ L: n < 100000 && /m3|m³/i.test(txt) ? n * 1000 : n, src: 'nfc', raw: txt }); return; } }
          }
        };
      });
    } catch (_) { got = null; }
  } else await new Promise((r) => setTimeout(r, 2200));
  if (!got) got = sim();
  const now = Date.now(), prev = hm.hist[0];
  Object.assign(m, { step: 'done', L: got.L, src: got.src, ts: now, used: prev ? got.L - prev.L : null, edit: got.L / 1000 });
  stopCamera(); schedule();
}
function hmKpis() {
  const x = t(), s = hm.sim, on = HL.filter((l) => s.light[l.id]).length;
  const k = (ico, lab, v, sub, c) => `<div class="hk"><span class="hk-i" style="background:${c}">${ico}</span><div><small>${lab}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
  const last = hm.hist[0];
  return `<div class="hkpis">
    ${k('⚡', x.hmPowerNow, `${(s.power() / 1000).toFixed(2)} kW`, `${s.kwh.toFixed(1)} kWh ${x.hmToday} · ≈ ฿${Math.round(s.kwh * hm.price.power)}`, '#F59E0B')}
    ${k('💡', x.hmLightsOn, `${on}/${HL.length}`, `${s.lightsW()} W`, '#FACC15')}
    ${k('💧', x.hmWaterNow, `${s.flow.toFixed(1)} L/min`, `${Math.round(s.waterToday)} L ${x.hmToday}`, '#38BDF8')}
    ${k('🔢', x.hmMeterLast, last ? `${(last.L / 1000).toFixed(3)} m³` : '—', last ? new Date(last.ts).toLocaleDateString(S.lang === 'th' ? 'th-TH' : 'en-GB') : '', '#6366F1')}
    ${k('🎥', x.hmCams, `${CAMS.length}/${CAMS.length} online`, x.hmRec, '#EF4444')}
    ${k('🚰', x.hmMainValve, s.valve['V-MAIN'].open ? x.hmOpen : x.hmClosed, `${x.hmTank} ${Math.round(s.tank * 100)}%`, s.valve['V-MAIN'].open ? '#22C55E' : '#EF4444')}
  </div>`;
}
function hmScenes() {
  const x = t();
  return `<div class="hscenes">${[['home', '🏠', x.hmScHome], ['night', '🌙', x.hmScNight], ['away', '🔒', x.hmScAway], ['off', '⏻', x.hmScOff]].map(([id, i, l]) => `<button class="hscene" data-act="hm-scene" data-arg="${id}"><span>${i}</span>${l}</button>`).join('')}</div>`;
}
function viewHouse() {
  const x = t(), s = hm.sim, sec = S.hsec || 'overview';
  const tabs = [['overview', '🏠', x.hmOverview], ['meter', '🔢', x.hmMeter], ['cam', '🎥', x.hmCam], ['light', '💡', x.hmLight], ['valve', '🚰', x.hmValve]]
    .map(([id, i, l]) => `<button class="hsec ${sec === id ? 'on' : ''}" data-act="hm-sec" data-arg="${id}" aria-pressed="${sec === id}"><span>${i}</span>${l}</button>`).join('');
  const dn = `<div class="seg">${[['auto', x.hmAuto], ['day', x.hmDay], ['night', x.hmNight]].map(([k, l]) => `<button class="chip ${(s.night == null ? 'auto' : s.night ? 'night' : 'day') === k ? 'on' : ''}" data-act="hm-dn" data-arg="${k}">${l}</button>`).join('')}</div>`;
  const scene = (hint) => `<section class="card hm-card"><div class="row" style="flex-wrap:wrap;gap:8px"><h2>${x.hmHouseName}</h2><span class="muted" style="font-size:12px">${hint}</span><span style="margin-left:auto">${dn}</span></div><div id="hm-slot"></div></section>`;
  const leak = s.leak && s.valve['V-MAIN'].pos > 0.5 ? `<div class="status warn" style="margin-bottom:12px"><span class="dotS pulse" style="width:14px;height:14px;background:#EF4444"></span><div><b style="color:var(--tx)">${x.hmLeak}</b><div class="muted">${x.hmLeakSub}</div></div><button class="btn warn" style="margin-left:auto" data-act="hm-valve" data-arg="V-MAIN" data-val="0">${x.hmCutMain}</button></div>` : '';
  let body = '';
  if (sec === 'overview') body = `${scene(x.hmTapHint)}${hmScenes()}${hmKpis()}`;
  else if (sec === 'light') {
    const cards = HL.map((l) => { const on = s.light[l.id]; return `<div class="hl ${on ? 'on' : ''}"><button class="pw-sw" data-act="hm-light" data-arg="${l.id}" aria-pressed="${on}"><span class="knob"></span></button><div><b>${esc(tr(l.name))}</b><small>${esc(tr(l.zone))} · ${l.w} W</small></div><span class="hl-w">${on ? l.w + ' W' : x.hmOffS}</span></div>`; }).join('');
    const loads = HLOADS.map((l) => { const on = s.load[l.id]; return `<div class="hl ${on ? 'on' : ''}"><button class="pw-sw" data-act="hm-load" data-arg="${l.id}" aria-pressed="${on}"><span class="knob"></span></button><div><b>${esc(tr(l.name))}</b><small>${(l.w / 1000).toFixed(2)} kW</small></div></div>`; }).join('');
    const pw = s.power();
    body = `${scene(x.hmLightHint)}${hmScenes()}
      <div class="grid2" style="margin:12px 0"><div class="stat"><small>${x.hmLightsW}</small><b>${s.lightsW()} W</b></div><div class="stat"><small>${x.hmHouseW}</small><b>${(pw / 1000).toFixed(2)} kW</b></div><div class="stat"><small>${x.hmKwhToday}</small><b>${s.kwh.toFixed(2)} kWh</b></div><div class="stat"><small>${x.hmCostToday}</small><b>฿${(s.kwh * hm.price.power).toFixed(0)}</b></div></div>
      <section class="card col"><h2>${x.hmLightList}</h2><div class="hls">${cards}</div></section>
      <section class="card col" style="margin-top:14px"><h2>${x.hmLoads}</h2><div class="hls">${loads}</div><div class="muted" style="font-size:12px">${x.hmPriceNote}</div></section>`;
  } else if (sec === 'valve') {
    const cards = HV.map((v) => { const st = s.valve[v.id], p = st.pos, state = p > 0.97 ? x.hmOpen : p < 0.03 ? x.hmClosed : st.open ? x.hmOpening : x.hmClosing, col = p > 0.97 ? '#22C55E' : p < 0.03 ? '#EF4444' : '#F59E0B';
      return `<div class="hv"><div class="row" style="gap:10px"><span class="hv-ic" style="background:${col}">🚰</span><div style="flex:1"><b>${esc(tr(v.name))}</b><small class="muted" style="display:block">${esc(tr(v.desc))}</small></div><span class="pill" style="background:${col}22;color:${col}">${state}</span></div>
      <div class="pbar"><i style="width:${Math.round(p * 100)}%;background:${col}"></i></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="muted" style="font-size:12px">${st.by ? `${x.hmLastCmd}: ${esc(st.by)} · ${new Date(st.at).toLocaleTimeString(S.lang === 'th' ? 'th-TH' : 'en-GB')}` : ''}</span><span style="margin-left:auto;display:flex;gap:8px"><button class="btn primary" data-act="hm-valve" data-arg="${v.id}" data-val="1" ${st.open ? 'disabled' : ''}>${x.hmDoOpen}</button><button class="btn" data-act="hm-valve" data-arg="${v.id}" data-val="0" ${!st.open ? 'disabled' : ''}>${x.hmDoClose}</button></span></div></div>`; }).join('');
    body = `${leak}${scene(x.hmValveHint)}
      <div class="grid2" style="margin:12px 0"><div class="stat"><small>${x.hmFlow}</small><b>${s.flow.toFixed(1)} L/min</b></div><div class="stat"><small>${x.hmWaterToday}</small><b>${Math.round(s.waterToday)} L</b></div><div class="stat"><small>${x.hmTank}</small><b>${Math.round(s.tank * 100)} %</b></div><div class="stat"><small>${x.hmMeterNow}</small><b>${(s.reading / 1000).toFixed(3)} m³</b></div></div>
      <section class="card col"><h2>${x.hmValveList}</h2><div class="hvs">${cards}</div>
      <button class="btn" data-act="hm-leak">${s.leak ? x.hmLeakOff : x.hmLeakOn}</button></section>`;
  } else if (sec === 'cam') {
    const sw = `<div class="seg rc-seg"><button class="${S.camMode !== 'real' ? 'on' : ''}" data-act="cam-mode" data-arg="sim">🎬 ${x.hmCamSim}</button><button class="${S.camMode === 'real' ? 'on' : ''}" data-act="cam-mode" data-arg="real">🔒 ${x.hmCamReal}</button></div>`;
    body = S.camMode === 'real'
      ? `<section class="card col"><div class="row" style="flex-wrap:wrap;gap:10px"><h2>${x.hmCamReal}</h2>${sw}</div><div id="realcam-slot"></div></section>`
      : `<section class="card col"><div class="row" style="flex-wrap:wrap;gap:10px"><h2>${x.hmCamTitle}</h2>${sw}<span class="muted" style="font-size:12px">${x.hmCamHint}</span></div><div id="cam-slot"></div><div class="muted" style="font-size:12px">${x.hmCamNote}</div></section>`;
  } else {
    const mods = Object.keys(HM_METERS).map((n) => { const on = hm.model === n, M = HM_METERS[n]; return `<button class="modcard ${on ? 'on' : ''}" data-act="hm-model" data-arg="${esc(n)}" aria-pressed="${on}"><span class="tick">${on ? '✓' : ''}</span><svg viewBox="0 0 200 200" class="mini-dial" aria-hidden="true">${dialSvg('hmm' + n.slice(0, 2), n, { q3: 2.5, R: 160, serial: n === 'SMCV4' ? '69100004' : n === 'ASAHI GMK' ? 'AG-25110388' : '71250012', reading: hm.sim.reading })}</svg><b>${esc(n)}</b><small>${M.how === 'nfc' ? '📶 ' : '📷 '}${esc(tr(M.label))}</small></button>`; }).join('');
    const last = hm.hist[0], prev = hm.hist[1];
    const fmtD = (ts) => new Date(ts).toLocaleDateString(S.lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const fmtT = (ts) => new Date(ts).toLocaleTimeString(S.lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    const how = (h) => (h === 'nfc' ? '📶 NFC' : h === 'lcd' ? '📷 LCD' : '📷 ' + x.hmMech);
    const rows = hm.hist.slice(0, 12).map((h, i) => { const nx = hm.hist[i + 1]; const used = nx ? (h.L - nx.L) / 1000 : null; return `<tr><td>${fmtD(h.ts)}<div class="muted" style="font-size:11px">${fmtT(h.ts)}</div></td><td class="num"><b>${(h.L / 1000).toFixed(3)}</b></td><td class="num">${used != null ? used.toFixed(2) : '—'}</td><td class="num">${used != null ? '฿' + Math.round(used * hm.price.water) : '—'}</td><td>${how(h.how)}${h.src === 'sim' || h.src === 'seed' ? ` <span class="muted" style="font-size:11px">(${x.hmSimTag})</span>` : h.src === 'ocr' ? ` <span class="pill run" style="font-size:10px;padding:1px 6px">${x.hmReal}</span>` : ''}${h.synced ? ' <span title="Google Sheets" style="color:#16A34A">▦✓</span>' : h.id && gs.queue.some((q) => q.id === h.id) ? ' <span title="Google Sheets" style="color:#F59E0B">▦⏳</span>' : ''}</td></tr>`; }).join('');
    const bars = hm.hist.slice(0, 7).reverse(), usage = bars.map((h, i) => (i ? (h.L - bars[i - 1].L) / 1000 : null)).slice(1), mx = Math.max(1, ...usage);
    const chart = `<svg viewBox="0 0 520 190" class="hm-chart">${usage.map((u, i) => { const bw = 480 / usage.length, h = u / mx * 130, xx = 30 + i * bw; return `<rect x="${(xx + 8).toFixed(1)}" y="${(160 - h).toFixed(1)}" width="${(bw - 16).toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="#38BDF8"/><text x="${(xx + bw / 2).toFixed(1)}" y="${(152 - h).toFixed(1)}" font-size="12" font-weight="700" text-anchor="middle" fill="currentColor">${u.toFixed(1)}</text><text x="${(xx + bw / 2).toFixed(1)}" y="178" font-size="11" text-anchor="middle" fill="currentColor" opacity="0.7">${new Date(bars[i + 1].ts).toLocaleDateString(S.lang === 'th' ? 'th-TH' : 'en-GB', { month: 'short' })}</text>`; }).join('')}<line x1="30" x2="510" y1="160" y2="160" stroke="currentColor" opacity="0.2"/></svg>`;
    body = `<section class="card col"><div class="row" style="flex-wrap:wrap"><h2>${x.hmMeterPick}</h2><span class="muted" style="font-size:12px">${x.hmMeterPickHint}</span></div><div class="modgrid">${mods}</div>
      <div class="hm-how"><b>${HM_METERS[hm.model].how === 'nfc' ? '📶' : '📷'} ${esc(tr(HM_METERS[hm.model].label))}</b><span class="muted">${esc(tr(HM_METERS[hm.model].hint))}</span></div>
      <button class="btn go" data-act="hm-read">${HM_METERS[hm.model].how === 'nfc' ? '📶' : '📷'} ${x.hmReadNow}</button></section>
      <div class="grid2" style="margin:14px 0"><div class="stat"><small>${x.hmLastRead}</small><b>${last ? (last.L / 1000).toFixed(3) + ' m³' : '—'}</b></div><div class="stat"><small>${x.hmReadAt}</small><b>${last ? fmtD(last.ts) + ' ' + fmtT(last.ts) : '—'}</b></div><div class="stat"><small>${x.hmUsedSince}</small><b>${last && prev ? ((last.L - prev.L) / 1000).toFixed(2) + ' m³' : '—'}</b></div><div class="stat"><small>${x.hmNowSince}</small><b>${last ? ((hm.sim.reading - last.L) / 1000).toFixed(3) + ' m³' : '—'}</b></div></div>
      <section class="card col"><h2>${x.hmUsage}</h2>${usage.length ? chart : `<div class="muted">${x.hmNeedTwo}</div>`}</section>
      <section class="card col" style="margin-top:14px"><h2>${x.hmHistory}</h2><div class="tscroll"><table class="rtable"><thead><tr><th>${x.hmDate}</th><th>${x.hmReadingM3}</th><th>${x.hmUsedM3}</th><th>${x.hmCost}</th><th>${x.hmMethod}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="muted" style="font-size:12px">${x.hmWaterNote}</div></section>${viewGsheet()}`;
  }
  return `<div class="row" style="flex-wrap:wrap"><h2>${x.hmTitle}</h2><span class="pill run">${x.hmSub}</span></div>
    <div class="hsecs">${tabs}</div>${sec !== 'valve' ? leak : ''}${body}`;
}
function viewHouseModals() {
  const x = t();
  let o = '';
  if (S.camBig) {
    const c = CAMS.find((q) => q.id === S.camBig);
    o += `<div class="scrim center" data-act="cam-close"><div class="dialog cam-dlg" role="dialog" aria-label="${c.id}"><div class="row"><b>${c.id} · ${esc(tr(c.name))}</b><span class="pill run" style="margin-left:auto">LIVE</span></div><div id="camb-slot"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${CAMS.map((q) => `<button class="chip ${q.id === c.id ? 'on' : ''}" data-act="cam-big" data-arg="${q.id}">${q.id}</button>`).join('')}<span style="margin-left:auto;display:flex;gap:8px"><button class="btn" data-act="cam-snap">📸 ${x.hmSnap}</button><button class="btn" data-act="cam-close">${x.close2}</button></span></div></div></div>`;
  }
  if (S.hconfirm) {
    const v = HV.find((q) => q.id === S.hconfirm.id), open = S.hconfirm.open;
    o += `<div class="scrim center"><div class="dialog" role="alertdialog"><h3>${open ? x.hmDoOpen : x.hmDoClose}: ${esc(tr(v.name))}</h3><p class="muted">${open ? x.hmConfOpen : x.hmConfClose}</p><div class="row" style="gap:8px"><button class="btn" data-act="hm-conf" data-arg="0">${x.cancel || 'ยกเลิก'}</button><button class="btn ${open ? 'primary' : 'warn'}" style="flex:1" data-act="hm-conf" data-arg="1">${x.hmConfirm}</button></div></div></div>`;
  }
  if (S.mread) {
    const m = S.mread, M = HM_METERS[m.model];
    let inner = '';
    if (m.how === 'mech' && m.step !== 'done') {
      if (m.step === 'ready') {
        if (m.cam === 'live') {
          inner = `<div class="vf"><video id="mr-video" playsinline muted autoplay></video><div class="vf-guide"><span class="scan-msg">${esc((m.scan && m.scan.msg) || x.hmScanLook)}</span></div></div>
            <div class="ocr-btns"><button class="btn go" data-act="ocr-snap">📸 ${x.hmSnapNow}</button>${m.torchOk ? `<button class="btn" data-act="ocr-torch">🔦 ${x.hmTorch}</button>` : ''}<button class="btn" data-act="ocr-camstop">${x.cancel || 'ยกเลิก'}</button></div>
            <div class="muted" style="font-size:12px">${x.hmScanAuto}</div>`;
        } else {
          const err = m.camErr ? `<div class="pw-warn cam-err"><b>⚠ ${x.hmCamFail}</b><span>${m.camErr === 'NotAllowedError' || m.camErr === 'SecurityError' ? (inAppBrowser() ? x.hmCamInApp : x.hmCamDenied) : m.camErr === 'NotFoundError' || m.camErr === 'OverconstrainedError' ? x.hmCamNone : m.camErr === 'NotReadableError' ? x.hmCamBusy : inAppBrowser() ? x.hmCamInApp : x.hmCamOther}</span>${isAndroid() ? `<a class="btn" href="${chromeIntent()}">🌐 ${x.hmOpenChrome}</a>` : ''}</div>`
            : inAppBrowser() ? `<div class="pw-warn cam-err"><b>ℹ ${x.hmInAppTitle}</b><span>${x.hmInAppTip}</span>${isAndroid() ? `<a class="btn" href="${chromeIntent()}">🌐 ${x.hmOpenChrome}</a>` : ''}</div>` : '';
          inner = `<div class="ocr-intro"><svg viewBox="0 0 200 200" class="ocr-ill">${dialSvg('ocri', m.model, { R: 80, serial: 'AG-25110388', reading: hm.sim.reading })}<rect x="22" y="52" width="150" height="34" rx="4" fill="none" stroke="#22C55E" stroke-width="3" stroke-dasharray="7 4"/></svg>
             <div><b>${x.hmOcrHow}</b><ol class="ocr-steps"><li>${x.hmOcr1}</li><li>${x.hmOcr2}</li><li>${x.hmOcr3}</li></ol></div></div>
             ${err}
             <label class="btn go ocr-main">📸 ${x.hmTakePhoto}<input type="file" accept="image/*" capture="environment" data-ocr-file="1" hidden></label>
             <div class="ocr-btns"><button class="btn" data-act="hm-cam-on">🎥 ${x.hmLiveScan}</button><label class="btn">🖼️ ${x.hmFromAlbum}<input type="file" accept="image/*" data-ocr-file="1" hidden></label><button class="btn" data-act="ocr-demo">🧪 ${x.hmOcrDemo}</button></div>
             <div class="muted" style="font-size:12px">${x.hmOcrNote}</div>`;
        }
      } else if (m.step === 'ocr') {
        inner = `<div class="ocr-busy">${ocr.url ? `<img src="${ocr.url}" alt="">` : ''}<div class="vf-line on"></div></div><div class="row" style="gap:10px"><span class="spin"></span><b class="ocr-prog">${esc(m.prog || x.hmOcrRead)}</b></div>`;
      } else if (m.step === 'adjust' || m.step === 'check') {
        const b = m.box;
        const crop = `<div class="crop-wrap"><img src="${ocr.url}" alt=""><div class="crop-box" data-crop="move" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%">${Array.from({ length: 6 }, (_, i) => `<i style="left:${((i + 1) / 7 * 100).toFixed(2)}%"></i>`).join('')}<span class="crop-h" data-crop="size"></span></div></div>`;
        if (m.step === 'adjust') inner = `${crop}<div class="muted" style="font-size:12px">${x.hmAdjust}</div><button class="btn go" data-act="ocr-read">🔍 ${x.hmOcrAgain}</button>`;
        else {
          const v = ocrValue(m), last = hm.hist.find((h) => h.src !== 'seed' && h.src !== 'sim'), used0 = last ? v - last.L / 1000 : null, used = used0 != null && used0 >= 0 ? used0 : null;
          const days = last ? Math.max(0.01, (m.ts - last.ts) / 86400000) : null;
          const warn = used0 != null && used0 < 0 ? x.hmOcrLower : used != null && used > 150 ? x.hmOcrJump : '';
          const first = !last;
          const drums = m.digits.map((d, i) => `<div class="drum ${i >= 4 ? 'red' : ''} ${m.conf[i] < 70 ? 'low' : ''}"><img src="${m.cells[i]}" alt=""><button data-act="ocr-dig" data-arg="${i}" data-val="-1" aria-label="-">▲</button><b>${d}</b><button data-act="ocr-dig" data-arg="${i}" data-val="1" aria-label="+">▼</button><small>${m.conf[i]}%</small></div>`).join('');
          inner = `<details class="ocr-photo"><summary>${x.hmOcrPhoto}${m.auto ? ' · ' + x.hmOcrAuto : ''}</summary>${crop}<button class="btn" data-act="ocr-read">🔍 ${x.hmOcrAgain}</button></details>
            <div class="drums">${drums.slice(0)}</div>
            <div class="muted" style="font-size:12px">${x.hmOcrTapFix}</div>
            <div class="ocr-val"><div><small>${x.hmVolume}</small><b>${v.toFixed(3)} m³</b><span>${(v * 1000).toFixed(0)} ${x.hmLitresU}</span></div>
              <div><small>${x.hmUsedSince}</small><b>${used != null ? used.toFixed(3) + ' m³' : '—'}</b><span>${used != null ? Math.round(used * 1000) + ' ' + x.hmLitresU + ' · ' + x.hmIn + ' ' + days.toFixed(1) + ' ' + x.hmDays : ''}</span></div>
              <div><small>${x.hmPerDay}</small><b>${used != null && used >= 0 ? Math.round(used * 1000 / days) + ' L' : '—'}</b><span>${x.hmMonthEst} ${used != null && used >= 0 ? (used / days * 30).toFixed(1) + ' m³' : '—'}</span></div>
              <div><small>${x.hmCostEst}</small><b>${used != null && used >= 0 ? '฿' + Math.round(used * hm.price.water) : '—'}</b><span>${x.hmMonthEst} ${used != null && used >= 0 ? '฿' + Math.round(used / days * 30 * hm.price.water) : '—'}</span></div></div>
            ${warn ? `<div class="pw-warn">⚠ ${warn}</div>` : ''}${first ? `<div class="hm-how"><b>ℹ ${x.hmFirstRead}</b><span class="muted">${x.hmFirstReadSub}</span></div>` : ''}
            <div class="muted" style="font-size:12px">${x.hmDate}: ${new Date(m.ts).toLocaleString(S.lang === 'th' ? 'th-TH' : 'en-GB')}</div>
            <div class="row" style="gap:8px"><button class="btn" data-act="hm-reread">${x.hmAgain}</button><button class="btn primary" style="flex:1" data-act="ocr-save">💾 ${x.hmSave}</button></div>`;
        }
      }
    } else if (m.step === 'ready' || m.step === 'scan') {
      const scanning = m.step === 'scan';
      if (m.how === 'nfc') inner = `<div class="nfc ${scanning ? 'on' : ''}"><svg viewBox="0 0 320 220" class="nfc-svg"><g transform="translate(40,20) scale(0.9)">${dialSvg('nfcd', m.model, { serial: '69100004', reading: hm.sim.reading })}</g>
          <g class="nfc-phone"><rect x="200" y="40" width="96" height="170" rx="16" fill="#0F172A" stroke="#64748B" stroke-width="3"/><rect x="208" y="54" width="80" height="140" rx="6" fill="#1E293B"/><text x="248" y="120" font-size="26" text-anchor="middle">📶</text><text x="248" y="150" font-size="10" fill="#E2E8F0" text-anchor="middle">NFC</text></g>
          ${[0, 1, 2].map((i) => `<path class="nfc-w" style="animation-delay:${i * 0.3}s" d="M${178 - i * 12},${100 - i * 12} q ${-14 - i * 6},${20 + i * 12} 0,${40 + i * 24}" fill="none" stroke="#38BDF8" stroke-width="4" stroke-linecap="round"/>`).join('')}</svg>
          <b>${scanning ? x.hmNfcWait : x.hmNfcTap}</b><span class="muted">${'NDEFReader' in window ? x.hmNfcReal : x.hmNfcSim}</span></div>`;
      else inner = `<div class="vf ${scanning ? 'on' : ''}">${m.cam === 'live' ? '<video id="mr-video" playsinline muted autoplay></video>' : `<svg viewBox="0 0 200 200" class="vf-sim">${dialSvg('vfd', m.model, { serial: m.model === 'ASAHI GMK' ? 'AG-25110388' : '71250012', reading: hm.sim.reading })}</svg>`}
          <div class="vf-frame"><i></i><i></i><i></i><i></i><span class="vf-line"></span></div></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><span class="muted" style="font-size:12px;flex:1">${tr(M.hint)}</span>${m.cam !== 'live' ? `<button class="btn" data-act="hm-cam-on">📷 ${x.hmOpenCam}</button>` : ''}</div>`;
      inner += `<button class="btn go" data-act="hm-scan" ${scanning ? 'disabled' : ''}>${scanning ? x.hmReading : m.how === 'nfc' ? '📶 ' + x.hmStartNfc : '📸 ' + x.hmCapture}</button>`;
    } else {
      const d = new Date(m.ts), id = m.model === 'SMCV4' ? '69100004' : m.model === 'ASAHI GMK' ? 'AG-25110388' : '71250012';
      inner = `<div class="mres"><svg viewBox="0 0 200 200" class="mres-d">${dialSvg('mrd', m.model, { serial: id, reading: m.L })}</svg>
        <dl class="dread big"><dt>${x.hmVolume}</dt><dd><b>${(m.L / 1000).toFixed(m.model === 'ASAHI GMK' ? 4 : 5)} m³</b></dd><dt>${x.hmLitres}</dt><dd>${m.L.toFixed(2)} L</dd><dt>${x.hmDate}</dt><dd>${d.toLocaleDateString(S.lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd><dt>${x.hmTime}</dt><dd>${d.toLocaleTimeString(S.lang === 'th' ? 'th-TH' : 'en-GB')}</dd>
        <dt>${x.hmMeterId}</dt><dd>${id}</dd><dt>${x.hmMethod}</dt><dd>${m.how === 'nfc' ? '📶 NFC' : m.how === 'lcd' ? '📷 LCD OCR' : '📷 ' + x.hmMech}${m.src === 'sim' ? ` (${x.hmSimTag})` : ''}</dd>${m.how === 'nfc' ? `<dt>${x.hmBattery}</dt><dd>3.14 V · 92%</dd>` : ''}
        <dt>${x.hmUsedSince}</dt><dd>${m.used != null ? (m.used / 1000).toFixed(3) + ' m³' : '—'}</dd></dl></div>
        ${m.how !== 'nfc' ? `<label class="hm-edit"><small>${x.hmCheck}</small><input type="number" step="0.001" data-mread="1" value="${(m.edit).toFixed(3)}"><i>m³</i></label>` : ''}
        <div class="row" style="gap:8px"><button class="btn" data-act="hm-reread">${x.hmAgain}</button><button class="btn primary" style="flex:1" data-act="hm-save">💾 ${x.hmSave}</button></div>`;
    }
    o += `<div class="scrim center"><div class="dialog mr-dlg" role="dialog"><div class="row"><b>${x.hmReadNow} · ${esc(m.model)}</b><button class="chip" style="margin-left:auto" data-act="hm-mclose">✕</button></div>${inner}</div></div>`;
  }
  return o;
}

// ---------------------------------------------------------------- Google Sheets sync (CoreDash AquaLog)
// The sheet side is a Google Apps Script web app (tools/google-sheets/Code.gs). Readings are queued on the device
// and sent when online; the script ignores ids it already has, so resending is safe.
const gs = { cfg: { url: '', key: '', auto: true, place: 'บ้าน 88/8', meterId: '' }, queue: [], busy: false, last: null, err: '', sheetUrl: '' };
try { Object.assign(gs.cfg, JSON.parse(localStorage.getItem('cd-gsheet') || '{}')); gs.queue = JSON.parse(localStorage.getItem('cd-gsheet-q') || '[]'); gs.sheetUrl = localStorage.getItem('cd-gsheet-url') || ''; } catch (_) { /* storage unavailable */ }
function gsSave() { try { localStorage.setItem('cd-gsheet', JSON.stringify(gs.cfg)); localStorage.setItem('cd-gsheet-q', JSON.stringify(gs.queue.slice(-500))); localStorage.setItem('cd-gsheet-url', gs.sheetUrl || ''); } catch (_) { /* ignore */ } }
const gsReady = () => (/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(gs.cfg.url || '') || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(gs.cfg.url || '')) && (gs.cfg.key || '').length >= 8;
// a saved reading → one sheet row
function readingRow(h, prev) {
  const usedM3 = prev ? (h.L - prev.L) / 1000 : null, days = prev ? (h.ts - prev.ts) / 86400000 : null;
  return { id: h.id, ts: h.ts, place: gs.cfg.place || '', model: h.model, meterId: gs.cfg.meterId || '', m3: +(h.L / 1000).toFixed(4),
    usedM3: usedM3 != null && usedM3 >= 0 ? +usedM3.toFixed(4) : null, days: days != null ? +days.toFixed(2) : null,
    perDay: usedM3 != null && usedM3 >= 0 && days > 0.01 ? Math.round(usedM3 * 1000 / days) : null, cost: usedM3 != null && usedM3 >= 0 ? Math.round(usedM3 * hm.price.water) : null,
    method: h.how === 'nfc' ? 'NFC' : h.how === 'lcd' ? 'กล้อง LCD' : 'กล้อง แมคคานิค', minConf: h.minConf ?? null, edited: !!h.edited,
    device: /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS' : 'Desktop', note: h.note || '' };
}
function gsEnqueue(h) {
  const prev = hm.hist.find((q) => q !== h && q.src !== 'seed' && q.src !== 'sim' && q.ts < h.ts);
  gs.queue.push(readingRow(h, prev)); gsSave();
  if (gs.cfg.auto && gsReady()) gsFlush();
}
async function gsCall(method, payload) {
  const url = gs.cfg.url.trim();
  if (method === 'GET') { const r = await fetch(`${url}?key=${encodeURIComponent(gs.cfg.key)}&action=${payload}`, { redirect: 'follow' }); return r.json(); }
  // text/plain keeps it a "simple" request (no CORS preflight), which Apps Script web apps accept
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ key: gs.cfg.key, ...payload }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  return r.json();
}
async function gsFlush() {
  if (gs.busy || !gs.queue.length || !gsReady()) return;
  if (!navigator.onLine) { gs.err = t().gsOffline; schedule(); return; }
  gs.busy = true; gs.err = ''; schedule();
  try {
    const batch = gs.queue.slice(0, 50);
    const res = await gsCall('POST', { rows: batch });
    if (!res || !res.ok) throw new Error(res && res.error || 'ERR');
    const ok = new Set(res.saved || batch.map((b) => b.id));
    gs.queue = gs.queue.filter((q) => !ok.has(q.id));
    for (const h of hm.hist) if (ok.has(h.id)) h.synced = Date.now();
    if (res.url) gs.sheetUrl = res.url;
    gs.last = Date.now(); saveHist(); gsSave();
    toast(t().gsSent.replace('{n}', ok.size));
  } catch (e) {
    gs.err = e.message === 'BAD_KEY' ? t().gsBadKey : e.message === 'RUN_SETUP' ? t().gsRunSetup : t().gsNetErr;
  } finally { gs.busy = false; schedule(); }
  if (gs.queue.length && !gs.err) setTimeout(gsFlush, 500);
}
async function gsTest() {
  if (!gsReady()) { gs.err = t().gsNeedCfg; schedule(); return; }
  gs.busy = true; gs.err = ''; schedule();
  try {
    const res = await gsCall('GET', 'ping');
    if (!res.ok) throw new Error(res.error);
    gs.sheetUrl = res.url || gs.sheetUrl; gsSave();
    toast(t().gsOk.replace('{s}', res.sheet || 'Google Sheet').replace('{n}', res.rows));
  } catch (e) { gs.err = e.message === 'BAD_KEY' ? t().gsBadKey : e.message === 'RUN_SETUP' ? t().gsRunSetup : t().gsNetErr; }
  finally { gs.busy = false; schedule(); }
}
function gsResendAll() {
  const real = hm.hist.filter((h) => h.src !== 'seed' && h.src !== 'sim').slice().sort((a, b) => a.ts - b.ts);
  const have = new Set(gs.queue.map((q) => q.id));
  real.forEach((h, i) => { if (!h.id) h.id = newId(h.ts); if (!have.has(h.id)) gs.queue.push(readingRow(h, real[i - 1])); });
  saveHist(); gsSave(); gsFlush();
}
function csvExport() {
  const real = hm.hist.filter((h) => h.src !== 'seed' && h.src !== 'sim').slice().sort((a, b) => a.ts - b.ts);
  const head = ['วันเวลา', 'สถานที่', 'รุ่นมาตร', 'หมายเลขมาตร', 'ค่ามาตร (m3)', 'ใช้ไป (m3)', 'ช่วงเวลา (วัน)', 'เฉลี่ย (ลิตร/วัน)', 'ค่าน้ำ (บาท)', 'วิธีอ่าน', 'ความมั่นใจต่ำสุด', 'แก้เอง'];
  const z = (n) => String(n).padStart(2, '0');
  const lines = real.map((h, i) => { const r = readingRow(h, real[i - 1]), d = new Date(r.ts); return [`${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`, r.place, r.model, r.meterId, r.m3, r.usedM3 ?? '', r.days ?? '', r.perDay ?? '', r.cost ?? '', r.method, r.minConf ?? '', r.edited ? 'ใช่' : ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','); });
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `CoreDash-AquaLog-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const newId = (ts) => `${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
window.addEventListener('online', () => { if (gs.cfg.auto) gsFlush(); });
// one-tap connect: the sheet's "CoreDash → เชื่อมต่อแอปมือถือ" menu makes a link  …/app/#aqualog=<base64url {u,k,n}>
function gsFromLink() {
  const m = /[#&]aqualog=([A-Za-z0-9_\-=]+)/.exec(location.hash || '');
  if (!m) return false;
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/'), txt = new TextDecoder().decode(Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0)));
    const o = JSON.parse(txt);
    if (o.u && o.k) { gs.cfg.url = o.u; gs.cfg.key = o.k; gs.cfg.auto = true; gs.err = ''; gsSave(); }
    history.replaceState(null, '', location.pathname + location.search); // keep the key out of the address bar / history
    return o.n || 'Google Sheet';
  } catch (_) { return false; }
}
function viewGsheet() {
  const x = t(), c = gs.cfg, ready = gsReady();
  const pend = gs.queue.length, real = hm.hist.filter((h) => h.src !== 'seed' && h.src !== 'sim').length;
  const status = gs.busy ? `<span class="spin"></span> ${x.gsBusy}` : gs.err ? `<span class="bad">⚠ ${esc(gs.err)}</span>` : !ready ? `<span class="muted">${x.gsNotSet}</span>` : pend ? `<span style="color:#F59E0B">⏳ ${x.gsPending.replace('{n}', pend)}</span>` : `<span class="good">✓ ${x.gsAllSent}${gs.last ? ' · ' + new Date(gs.last).toLocaleTimeString(S.lang === 'th' ? 'th-TH' : 'en-GB') : ''}</span>`;
  return `<section class="card col gs-card" style="margin-top:14px">
    <div class="row" style="flex-wrap:wrap;gap:8px"><span class="gs-logo">▦</span><div style="flex:1;min-width:180px"><h2 style="margin:0">${x.gsTitle}</h2><span class="muted" style="font-size:12px">${x.gsSub}</span></div>${gs.sheetUrl ? `<a class="btn primary" style="min-height:40px;padding:8px 14px;text-decoration:none" href="${esc(gs.sheetUrl)}" target="_blank" rel="noopener">📊 ${x.gsOpen}</a>` : ''}</div>
    <div class="gs-status row" style="gap:8px">${status}</div>
    <div class="gs-grid">
      <label><small>${x.gsUrl}</small><input type="url" data-gs="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url)}"></label>
      <label><small>${x.gsKey}</small><input type="password" data-gs="key" placeholder="••••••••" value="${esc(c.key)}" autocomplete="off"></label>
      <label><small>${x.gsPlace}</small><input type="text" data-gs="place" value="${esc(c.place)}" maxlength="60"></label>
      <label><small>${x.gsMeterId}</small><input type="text" data-gs="meterId" placeholder="0-343764-64" value="${esc(c.meterId)}" maxlength="40"></label>
    </div>
    <label class="gs-auto"><input type="checkbox" data-gs="auto" ${c.auto ? 'checked' : ''}> ${x.gsAuto}</label>
    <div class="ocr-btns"><button class="btn" data-act="gs-test" ${gs.busy ? 'disabled' : ''}>🔌 ${x.gsTest}</button><button class="btn primary" data-act="gs-sync" ${gs.busy || !pend ? 'disabled' : ''}>⬆ ${x.gsSync}${pend ? ` (${pend})` : ''}</button><button class="btn" data-act="gs-all" ${gs.busy || !real || !ready ? 'disabled' : ''}>↻ ${x.gsAll}</button></div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="gs-csv" ${real ? '' : 'disabled'}>⬇ ${x.gsCsv}</button><a class="btn" href="./google-sheets/CoreDash-AquaLog-script.txt" download="CoreDash-AquaLog.gs" style="text-decoration:none">📄 ${x.gsScript}</a><button class="btn" data-act="gs-help">❓ ${x.gsHow}</button></div>
    ${S.gsHelp ? `<ol class="gs-help">${x.gsSteps.map((st) => `<li>${st}</li>`).join('')}</ol>` : ''}
  </section>`;
}

// ---------------------------------------------------------------- power quality (Hioki PW3198 × 3)
let pqView = null, pqLang = null;
function viewPq() { return `<div id="pq-slot"></div>`; }
function mountPq() {
  const slot = root.querySelector('#pq-slot');
  if (!slot) { if (pqView) pqView.hide(); return; }
  if (!pqView) pqView = createPqView({ lang: () => S.lang, live: () => (src && src.mode === 'live' ? { base: src.base, token: src.token } : null), onToast: (m, bad) => toast(m, bad) });
  if (pqView.el.parentNode !== slot) slot.appendChild(pqView.el);
  if (pqLang && pqLang !== S.lang) pqView.langChanged();
  pqLang = S.lang;
  pqView.show();
}

// ---------------------------------------------------------------- plant power (plating + brass rolling)
const pw = { sim: new PowerSim(), view: null, tariff: { ...TARIFF_DEFAULT }, cost: Object.fromEntries(FIXES.map((f) => [f.id, f.cost])), avg: {} };
function pwAvg(fx) { const k = fixKey(fx) + JSON.stringify(pw.tariff); return pw.avg[k] || (pw.avg[k] = averages(fx, pw.tariff)); }
function mountPower() {
  const slot = root.querySelector('#pw-slot'); if (!slot) return;
  if (!pw.view) pw.view = createPowerView(pw.sim, { lang: () => S.lang, onSelect: (id) => { pw.sim.selected = id; schedule(); } });
  slot.appendChild(pw.view.el);
  const sc = pw.view.el.querySelector('.pw-scroll');
  if (sc && sc.dataset.left) sc.scrollLeft = Number(sc.dataset.left);
  else if (sc && sc.scrollWidth > sc.clientWidth) { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) * 0.3; sc.dataset.left = sc.scrollLeft; }
  if (sc && !sc.dataset.bound) { sc.dataset.bound = '1'; sc.addEventListener('scroll', () => { sc.dataset.left = sc.scrollLeft; }, { passive: true }); }
  const ds = root.querySelector('#pwd-slot'); if (ds) ds.appendChild(pw.view.dash);
}
const baht = (v) => '฿' + Math.round(v).toLocaleString('en-US');
const PW_WHY = {
  scr: B('SCR หน่วงมุมจุดชนวนมากเมื่อจ่ายแรงดันต่ำกว่าพิกัด → cos φ ต่ำ + ฮาร์มอนิก 5,7,11,13', 'SCR fires late when running below rated voltage → low cos φ + 5th/7th/11th/13th harmonics'),
  heater: B('โหลดความต้านทาน PF = 1', 'Resistive, PF = 1'),
  motor: B('มอเตอร์เหนี่ยวนำ ยิ่งโหลดเบา PF ยิ่งต่ำ', 'Induction motor: PF drops at light load'),
  furnace: B('อินเวอร์เตอร์ไทริสเตอร์ 6 พัลส์: PF ดีแต่ THD สูง', '6-pulse thyristor inverter: good cos φ, high THD'),
  mill: B('ไดรฟ์ DC ไทริสเตอร์: cos φ แปรตามความเร็ว ช่วงร้อยแผ่นความเร็วต่ำ PF แย่มาก', 'DC thyristor drive: cos φ follows speed, terrible while threading slowly'),
  coiler: B('VFD ไดโอด 6 พัลส์ ไม่มีโช้ก: THD 40%+', '6-pulse diode VFD, no choke: THD 40 %+'),
  phase: B('คุมแบบ phase-angle: PF จริง ≈ √(สัดส่วนกำลัง)', 'Phase-angle control: true PF ≈ √(power fraction)'),
  comp: B('ช่วงอันโหลดกินไฟ 30% ที่ PF ~0.4 โดยไม่ได้ลม', 'Unloaded running draws 30 % at PF ≈ 0.4 for no air'),
  led: B('ไดรเวอร์ LED: ฮาร์มอนิกลำดับ 3', 'LED drivers: triplen harmonics')
};
function viewPower() {
  const x = t(), fx = pw.sim.fx, base = pwAvg({}), cur = pwAvg(fx);
  const save = base.bill.total - cur.bill.total, invest = FIXES.filter((f) => fx[f.id]).reduce((a, f) => a + pw.cost[f.id], 0);
  const pay = save > 0 ? invest / (save * 12) : null;
  const cmp = (lab, a, b, u, dig = 0, good = 'down') => { const d = b - a, better = good === 'down' ? d < 0 : d > 0; return `<div class="pw-cmp"><small>${lab}</small><div><span class="was">${a.toFixed(dig)}</span><span class="arr">→</span><b class="${Math.abs(d) < 1e-6 ? '' : better ? 'good' : 'bad'}">${b.toFixed(dig)}</b><i>${u}</i></div></div>`; };
  const fixCards = FIXES.map((f) => {
    const one = pwAvg({ [f.id]: true, capPlain: f.id === 'cap' && fx.capPlain }), sv = base.bill.total - one.bill.total, on = !!fx[f.id];
    const pb = sv > 0 ? pw.cost[f.id] / (sv * 12) : null;
    return `<div class="pw-fix ${on ? 'on' : ''}"><button class="pw-sw" data-act="pw-fix" data-arg="${f.id}" aria-pressed="${on}"><span class="knob"></span></button>
      <div class="pw-fixb"><b>${esc(tr(f.name))}</b><small>${esc(tr(f.what))}</small>
      <div class="pw-fixn"><span>PF ${base.pf.toFixed(2)} → <b style="color:${pfColor(one.pf)}">${one.pf.toFixed(2)}</b></span><span>Q −${Math.round(base.Q - one.Q)} kvar</span><span>S −${Math.round(base.S - one.S)} kVA</span><span>${x.pwSave} <b class="good">${baht(sv)}</b>/${x.pwMonth}</span><span>${x.pwInvest} ${baht(pw.cost[f.id])}</span><span>${x.pwPay} ${pb != null ? pb.toFixed(1) + ' ' + x.pwYear : '—'}</span></div>
      ${f.id === 'cap' && on ? `<div class="pw-captype"><button class="chip ${!fx.capPlain ? 'on' : ''}" data-act="pw-capplain" data-arg="0">${x.pwDetuned}</button><button class="chip ${fx.capPlain ? 'on' : ''}" data-act="pw-capplain" data-arg="1">${x.pwPlain}</button></div>${fx.capPlain ? `<div class="pw-warn">⚠ ${x.pwResonance}</div>` : ''}` : ''}</div></div>`;
  }).join('');
  const per = cur.per, totQ = Math.max(1, Object.values(per).reduce((a, q) => a + q.Q, 0));
  const rows = PMACH.map((m) => ({ m, a: per[m.id], b: pwAvg({}).per[m.id] })).sort((p, q) => q.a.Q - p.a.Q).map(({ m, a }) => {
    const pf = a.S > 0 ? a.Pa / a.S : 1, cos = a.Pa / Math.max(0.01, Math.hypot(a.Pa, a.Q)), thd = a.D / Math.max(0.01, Math.hypot(a.Pa, a.Q));
    return `<tr class="${pw.sim.selected === m.id ? 'sel' : ''}" data-act="pw-sel" data-arg="${m.id}"><td><b>${m.id}</b><div class="muted" style="font-size:11px">${esc(tr(m.name))}</div></td><td class="num">${a.P.toFixed(1)}</td><td class="num" style="color:#FB923C">${a.Q.toFixed(1)}</td><td class="num" style="color:#A78BFA">${a.D.toFixed(1)}</td><td class="num">${a.S.toFixed(1)}</td><td class="num">${cos.toFixed(2)}</td><td class="num">${(thd * 100).toFixed(0)}%</td><td class="num"><b style="color:${pfColor(pf)}">${pf.toFixed(2)}</b></td><td style="min-width:90px"><div class="pw-bar"><i style="width:${(a.Q / totQ * 100).toFixed(1)}%"></i></div><small class="muted">${(a.Q / totQ * 100).toFixed(0)}%</small></td><td class="muted" style="font-size:11.5px;min-width:200px">${esc(tr(PW_WHY[m.kind]))}</td></tr>`;
  }).join('');
  const preset = (id, lab) => `<button class="chip" data-act="pw-preset" data-arg="${id}">${lab}</button>`;
  return `
  <div class="row" style="flex-wrap:wrap"><h2>${x.pwTitle}</h2><span class="pill run">${x.pwSub}</span></div>
  <section class="pw-exec">
    <div class="pw-exec-h"><b>${x.pwExec}</b><span class="muted">${x.pwExecSub}</span><span class="dbtns">${preset('none', x.pwP0)}${preset('quick', x.pwP1)}${preset('all', x.pwP2)}</span></div>
    <div class="pw-cmps">
      ${cmp(x.pwPF, base.pf, cur.pf, '', 3, 'up')}${cmp('cos φ', base.cos, cur.cos, '', 3, 'up')}${cmp('Q', base.Q, cur.Q, 'kvar')}${cmp('S', base.S, cur.S, 'kVA')}${cmp(x.pwCur, base.I, cur.I, 'A')}${cmp('THD-I', base.thd * 100, cur.thd * 100, '%', 1)}${cmp(x.pwLoss, base.loss, cur.loss, 'kW', 1)}${cmp(x.pwKW, base.P, cur.P, 'kW')}
    </div>
    <div class="pw-money">
      <div><small>${x.pwBill}</small><b>${baht(cur.bill.total)}</b><span class="muted">${x.pwFrom} ${baht(base.bill.total)}</span></div>
      <div><small>${x.pwPFch}</small><b style="color:${cur.bill.pf > 0 ? '#EF4444' : '#22C55E'}">${baht(cur.bill.pf)}</b><span class="muted">${x.pwFrom} ${baht(base.bill.pf)}</span></div>
      <div class="hl"><small>${x.pwSaveM}</small><b class="good">${baht(save)}</b><span class="muted">${baht(save * 12)} / ${x.pwYear}</span></div>
      <div><small>${x.pwInvest}</small><b>${baht(invest)}</b><span class="muted">${x.pwPay} ${pay != null ? pay.toFixed(1) + ' ' + x.pwYear : '—'}</span></div>
      <div><small>${x.pwRelease}</small><b>${Math.round(base.S - cur.S)} kVA</b><span class="muted">${x.pwTr} ${Math.round(base.S / 16)}% → ${Math.round(cur.S / 16)}%</span></div>
    </div>
  </section>
  <section class="card pw-scenecard"><div class="row" style="flex-wrap:wrap"><h2>${x.pwScene}</h2><span class="muted" style="font-size:12px">${x.pwSceneHint}</span>
    <span class="pw-legend"><span><i style="background:#4ADE80"></i>P</span><span><i style="background:#FB923C"></i>Q</span><span><i style="background:#38BDF8"></i>${x.pwRegen}</span><span><i style="background:#22C55E;border-radius:50%"></i>PF ≥ 0.90</span><span><i style="background:#F59E0B;border-radius:50%"></i>0.85–0.90</span><span><i style="background:#EF4444;border-radius:50%"></i>&lt; 0.85</span></span></div>
    <div id="pw-slot"></div></section>
  <div id="pwd-slot"></div>
  <section class="card col"><div class="row" style="flex-wrap:wrap"><h2>${x.pwFixes}</h2><span class="muted" style="font-size:12px">${x.pwFixHint}</span></div><div class="pw-fixes">${fixCards}</div>
    <div class="muted" style="font-size:12px">${x.pwCostNote}</div></section>
  <section class="card col"><div class="row" style="flex-wrap:wrap"><h2>${x.pwTable}</h2><span class="muted" style="font-size:12px">${x.pwTableHint}</span></div>
    <div class="tscroll"><table class="rtable pw-table"><thead><tr><th>${x.pwMach}</th><th>P kW</th><th>Q kvar</th><th>D kVA</th><th>S kVA</th><th>cos φ</th><th>THD-I</th><th>PF</th><th>${x.pwShareQ}</th><th>${x.pwWhy}</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td><b>${x.pwTotal}</b></td><td class="num"><b>${cur.P.toFixed(0)}</b></td><td class="num"><b>${cur.Q.toFixed(0)}</b></td><td class="num"><b>${cur.D.toFixed(0)}</b></td><td class="num"><b>${cur.S.toFixed(0)}</b></td><td class="num"><b>${cur.cos.toFixed(2)}</b></td><td class="num"><b>${(cur.thd * 100).toFixed(0)}%</b></td><td class="num"><b style="color:${pfColor(cur.pf)}">${cur.pf.toFixed(2)}</b></td><td colspan="2" class="muted" style="font-size:11px">${x.pwSumNote}</td></tr></tfoot></table></div></section>
  <section class="card col pw-theory"><h2>${x.pwTheory}</h2>
    <div class="pw-th">
      <div><b style="color:#4ADE80">P · ${x.pwThP}</b><span>${x.pwThPd}</span></div>
      <div><b style="color:#FB923C">Q · ${x.pwThQ}</b><span>${x.pwThQd}</span></div>
      <div><b style="color:#A78BFA">D · ${x.pwThD}</b><span>${x.pwThDd}</span></div>
      <div><b>S · ${x.pwThS}</b><span>S = √(P² + Q² + D²) · I = S / (√3 · 400 V)</span></div>
      <div><b>cos φ vs PF</b><span>PF = P / S = cos φ / √(1 + THD²) — ${x.pwThPF}</span></div>
      <div><b>${x.pwThGoal}</b><span>${x.pwThGoald}</span></div>
    </div></section>
  <section class="card col"><h2>${x.pwTariff}</h2><div class="pw-tariff">
    ${[['energy', x.pwTE, '฿/kWh'], ['demand', x.pwTD, '฿/kW'], ['pf', x.pwTP, '฿/kvar'], ['hours', x.pwTH, 'h']].map(([k, l, u]) => `<label><small>${l}</small><span><input type="number" step="any" data-tariff="${k}" value="${pw.tariff[k]}"><i>${u}</i></span></label>`).join('')}
    </div><div class="muted" style="font-size:12px">${x.pwTariffNote}</div></section>`;
}

// ---------------------------------------------------------------- views
function viewLogin() {
  const x = t(), gw = S.gw;
  return `<div class="login">
    <div style="display:flex;justify-content:center;padding:8px 0 4px">${badge(150, 182)}</div>
    <h1>CoreDash Nexus</h1>
    <p>${x.loginLead}</p>
    ${gw ? `<p class="muted"><span class="conn" style="background:#3B82F6"></span>${x.gwFound} · ${esc(location.host)} ${gw.simulate ? x.gwSim : ''}</p>` : ''}
    <div class="field"><label for="tok">${x.token}</label><input id="tok" type="password" autocomplete="current-password" value="${esc(store.get('token', ''))}"></div>
    ${S.loginErr ? `<div class="err">${esc(S.loginErr)}</div>` : ''}
    <button class="btn primary" data-act="signin" ${S.busy ? 'disabled' : ''}>${x.signIn}</button>
    ${gw && gw.simulate ? `<button class="btn" data-act="signin-demo">${x.demoAcc}</button>` : ''}
    <button class="btn" data-act="offline-demo">${x.offlineDemo}</button>
    <div style="display:flex;gap:8px;justify-content:center">${langButtons()}</div>
    <div class="devcard" style="justify-content:center;margin-top:8px">${badge(40, 48)}<div><small>${x.devBy}</small><b>${x.devName}</b></div></div>
  </div>`;
}

function langButtons() {
  return [['th', 'ไทย'], ['en', 'English']].map(([k, l]) => `<button class="btn ${S.lang === k ? 'on' : ''}" data-act="lang" data-arg="${k}" aria-pressed="${S.lang === k}">${l}</button>`).join('');
}

function header() {
  const x = t(), open = src.activeAlarms().filter((a) => !a.acked).length;
  const titles = { home: isDesk() ? x.overview : 'CoreDash Nexus', scada: 'SCADA', power: isDesk() ? x.pwTitle : x.tabPower, pq: isDesk() ? x.pqTitle : x.tabPq, house: x.hmTitle, bench: isDesk() ? x.benchTitle : x.bench, control: x.control, alerts: x.alerts, report: x.report };
  const conn = src.connected ? '#3B82F6' : '#F59E0B';
  return `<header class="hdr">
    ${badge(34, 41)}
    <div class="ttl"><b>${titles[S.tab]}</b><span><span class="conn" style="background:${conn}"></span>${x.site} · ${hhmm(Date.now())}</span></div>
    <button class="ibtn" style="margin-left:auto" data-act="settings" aria-label="${x.settings}">${svg(ICON.gear)}</button>
    <button class="ibtn" data-act="tab" data-arg="alerts" aria-label="${x.alerts} ${open}">${svg(ICON.alerts)}${open ? `<span class="badge">${open}</span>` : ''}</button>
  </header>${src.mode === 'demo' ? `<div class="banner">${x.demoBanner}</div>` : ''}${src.mode === 'live' && !src.connected ? `<div class="banner">${x.offline}</div>` : ''}`;
}

function tabs() {
  const x = t(), open = src.activeAlarms().some((a) => !a.acked);
  const desk = isDesk();
  const label = (k) => (k === 'scada' ? 'SCADA' : k === 'home' && desk ? x.overview : k === 'power' ? x.tabPower : k === 'pq' ? (desk ? x.pqTitle : x.tabPq) : k === 'house' ? (desk ? x.hmTitle : x.tabHouse) : x[k]);
  const brand = desk ? `<div class="side-brand">${badge(40, 48)}<div><b>CoreDash Nexus</b><span>${x.site}</span></div></div>` : '';
  const foot = desk ? `<div class="side-foot"><button data-act="settings">${svg(ICON.gear, 22)}<span>${x.settings}</span></button><div class="devcard side-dev">${badge(96, 117)}<small>${x.devBy}</small><b>${x.devName}</b></div></div>` : '';
  return `<nav class="tabs" aria-label="tabs">${brand}${['home', 'house', 'scada', 'power', 'pq', 'bench', 'control', 'alerts', 'report'].map((k) => `<button data-act="tab" data-arg="${k}" aria-current="${S.tab === k ? 'page' : 'false'}">${svg(ICON[k === 'power' ? 'bolt' : k === 'pq' ? 'wave' : k], 24)}<span>${label(k)}</span>${k === 'alerts' && open ? '<span class="dot"></span>' : ''}</button>`).join('')}${foot}</nav>`;
}

function viewHome() {
  const x = t(), open = src.activeAlarms().filter((a) => !a.acked);
  const kw = V('MDB-1.KW') ?? 0, C = 2 * Math.PI * 60, frac = clamp(kw / 400, 0, 1);
  const kwh = V('MDB-1.KWH');
  const run = MACHINES.filter((m) => has(m.run)), running = run.filter((m) => V(m.run)).length;
  const lights = LIGHTS.filter((l) => has(l.on)), lon = lights.filter((l) => V(l.on)).length;
  return `
  <div class="status ${open.length ? 'warn' : 'ok'}">
    <span class="dotS ${open.length ? 'pulse' : ''}" style="width:14px;height:14px;background:${open.length ? '#F59E0B' : '#3B82F6'}"></span>
    <div><div style="font-weight:700;color:var(--tx)">${open.length ? `${x.hasAlerts} ${open.length} ${x.items}` : x.allOk}</div><div class="muted">${open.length ? esc(tr(open[0].text)) : x.allOkSub}</div></div>
  </div>
  <div class="card row" style="gap:16px">
    <div style="position:relative;width:140px;height:140px;flex:0 0 auto">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="${n0(kw)} kW"><circle cx="70" cy="70" r="60" fill="none" stroke="var(--ln)" stroke-width="12"/><circle cx="70" cy="70" r="60" fill="none" stroke="${kw > 320 ? '#F59E0B' : '#3B82F6'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 70 70)"/></svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><b class="num" style="font-size:32px;color:var(--tx)">${n0(kw)}</b><span class="muted" style="font-size:12px">${x.kwNow}</span></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
      <div><div class="muted">${x.totalElec}</div><b class="num" style="font-size:19px;color:var(--tx)">${n0(kwh)} kWh</b></div>
      <div><div class="muted">${x.waterFlow}</div><b class="num" style="font-size:19px;color:var(--tx)">${n1(V('WM-01.FLOW'))} m³/h</b></div>
      <div class="muted" style="color:var(--it)">${x.peakLimit}</div>
    </div>
  </div>
  <div class="grid2">
    <button class="kpi" data-act="tab" data-arg="scada"><small>${x.tankLevel}</small><b>${n0(V('T-1.LEVEL'))}%</b></button>
    <button class="kpi" data-act="tab" data-arg="scada"><small>${x.mold} INJ-01</small><b>${n1(V('INJ-01.MOLD_T'))} <i>°C</i></b></button>
    <button class="kpi" data-act="seg" data-arg="machines"><small>${x.machRun}</small><b>${running} <i>/ ${run.length}</i></b></button>
    <button class="kpi" data-act="seg" data-arg="lights"><small>${x.lightsOn}</small><b style="color:var(--yl)">${lon} <i>${x.zones}</i></b></button>
  </div>
  <h2>${x.scenes}</h2>
  <div class="grid3">
    <button class="scene" data-act="scene" data-arg="morning">${svg(ICON.sun, 24, 'var(--yl)')}${x.sMorning}</button>
    <button class="scene" data-act="scene" data-arg="lunch">${svg(ICON.clock, 24, 'var(--it)')}${x.sLunch}</button>
    <button class="scene" data-act="scene" data-arg="off">${svg(ICON.power, 24, 'var(--wt)')}${x.sOff}</button>
  </div>
  ${installCard()}
  <div class="card devcard">${badge(54, 66)}<div><small>${x.devBy}</small><b>${x.devName}</b></div></div>`;
}

function installCard() {
  const x = t();
  if (embedded()) return '';
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  if (S.installEvt) return `<div class="install">${svg(ICON.home)}<span style="flex:1">${x.install}</span><button class="btn primary" style="min-height:40px;padding:8px 14px" data-act="install">${x.installBtn}</button></div>`;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return `<div class="install">${svg(ICON.home)}<span style="flex:1">${x.iosInstall}</span></div>`;
  return '';
}

function scadaSeg() {
  const x = t();
  return `<div class="seg seg2" role="tablist"><button role="tab" aria-selected="${S.scadaMode === 'twin'}" data-act="scada-mode" data-arg="twin">${x.twin}</button><button role="tab" aria-selected="${S.scadaMode === 'pid'}" data-act="scada-mode" data-arg="pid">${x.pid}</button></div>`;
}
function viewScadaTab() {
  return scadaSeg() + (S.scadaMode === 'twin' ? twinBlock() : viewScada());
}
function viewScada() {
  const x = t();
  const p01 = V('P-01.RUN'), pumpBg = (id) => alarmsFor(id) ? '#B45309' : (V(id + '.RUN') ? '#1F5FFF' : '#475569');
  const sel = (id) => (S.sheet === id ? ' sel' : '');
  const lvl = V('T-1.LEVEL') ?? 0;
  const vpos = (id) => V(id + '.POS') ?? 0;
  const pipe = (on, extra, st) => `<div class="pipe ${extra || ''}${on ? ' on' : ''}" style="${st}"></div>`;
  const inOn = p01 && vpos('V-101') > 0, supOn = vpos('V-102') > 0 && lvl > 2, drOn = vpos('V-103') > 0 && lvl > 2;
  const valve = (id, left, top, rot) => { const vt = valveText(VALVES.find((v) => v.id === id)); return `<button class="eq${sel(id)}" data-act="sheet" data-arg="${id}" aria-label="${id}" style="left:${left}px;top:${top}px;width:48px;height:40px${rot ? ';transform:rotate(90deg)' : ''}"><svg width="36" height="24" viewBox="0 0 40 28" aria-hidden="true"><path d="M2 2 L20 14 L2 26 Z M38 2 L20 14 L38 26 Z" fill="${vt[2]}" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/></svg></button>`; };
  const lab = (id, left, top, extra) => { const v = VALVES.find((q) => q.id === id), vt = valveText(v), p = Math.round(V(v.pos) ?? 0); return `<div class="lbl" style="left:${left}px;top:${top}px;${extra || ''}"><b>${id}</b><span style="color:${vt[1]}">${p === 0 ? x.closed : p + '%'}</span></div>`; };
  const coolOn = V('CHL-01.RUN') && V('P-02.RUN') && vpos('V-201') > 0;
  const cool = ['CHL-01', 'P-02', 'V-201'].map((id) => {
    const isV = id === 'V-201', bad = !isV && alarmsFor(id), on = isV ? vpos(id) > 0 : V(id + '.RUN');
    const txt = bad ? x.fault : isV ? valveText(VALVES[3])[0] : on ? x.run : x.stop;
    return `<button class="eq${sel(id)}" data-act="sheet" data-arg="${id}" style="position:relative;background:${bad ? 'var(--wc)' : 'var(--pn)'};border:1.5px solid ${bad ? '#F59E0B' : on ? '#0891B2' : 'var(--ln2)'};border-radius:14px;padding:16px 6px;flex-direction:column;gap:4px;min-height:92px;color:var(--tx)"><b class="num" style="font-size:15px">${id}</b><span style="font-size:12px;color:${bad ? 'var(--wt)' : on ? 'var(--cy)' : 'var(--mu)'}">${txt}</span></button>`;
  }).join('');
  return `
  <div class="row"><h2>${x.waterSys}</h2><span class="muted">${x.tapHint}</span></div>
  <div class="mimic">
    ${pipe(inOn, 'v', 'left:65px;top:62px;width:6px;height:34px')}${pipe(inOn, 'v', 'left:65px;top:152px;width:6px;height:40px')}${pipe(inOn, 'v', 'left:65px;top:232px;width:6px;height:34px')}${pipe(inOn, '', 'left:65px;top:260px;width:78px;height:6px')}
    ${pipe(supOn, 'v', 'left:192px;top:352px;width:6px;height:30px')}${pipe(supOn, 'v', 'left:192px;top:422px;width:6px;height:26px')}${pipe(drOn, '', 'left:250px;top:326px;width:40px;height:6px')}
    <div class="box" style="left:16px;top:12px;width:104px;height:50px">${x.well}</div>
    <button class="eq${sel('P-01')}" data-act="sheet" data-arg="P-01" aria-label="P-01" style="left:40px;top:96px;width:56px;height:56px;border-radius:50%;background:${pumpBg('P-01')}"><svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#FFFFFF" stroke-width="2.5"/><path d="M13 11 L31 20 L13 29 Z" fill="#FFFFFF"/></svg></button>
    <div class="lbl" style="left:104px;top:106px"><b>P-01</b><span style="color:${p01 ? 'var(--it)' : 'var(--mu)'}">${p01 ? x.run : x.stop}</span></div>
    ${valve('V-101', 44, 192)}${lab('V-101', 100, 194)}
    <button class="tank${sel('T-1')}" data-act="sheet" data-arg="T-1" aria-label="${x.tank} T-1 ${Math.round(lvl)}%" style="left:140px;top:182px;width:110px;height:170px"><span class="fill" style="height:${lvl}%;background:${lvl >= 90 || lvl <= 15 ? '#D97706' : '#1F5FFF'}"></span><span class="nm">${x.tank} T-1</span><span class="pct">${Math.round(lvl)}%</span></button>
    ${valve('V-103', 290, 306)}${lab('V-103', 282, 352, 'width:70px;text-align:center')}
    ${valve('V-102', 171, 382, true)}${lab('V-102', 228, 388)}
    <div class="box" style="left:120px;top:448px;width:150px;height:40px;gap:6px"><span>${x.line}</span><span class="num" style="color:var(--it)">${n1(supOn ? VALVES[1].max * vpos('V-102') / 100 : 0)}</span></div>
  </div>
  <h2>${x.coolLoop}</h2>
  <div style="position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
    ${pipe(coolOn, 'cool', 'left:20px;right:20px;top:46px;height:6px')}
    ${cool}
  </div>
  <div class="card row"><span class="muted" style="flex:1">${x.mold} INJ-01</span><b class="num" style="font-size:20px;color:${(V('INJ-01.MOLD_T') ?? 0) > 60 ? 'var(--wt)' : 'var(--tx)'}">${n1(V('INJ-01.MOLD_T'))} °C</b></div>`;
}

function viewControl() {
  const x = t();
  const segs = [['machines', x.segM], ['lights', x.segL], ['valves', x.segV]].map(([k, l]) => `<button role="tab" aria-selected="${S.seg === k}" data-act="seg" data-arg="${k}">${l}</button>`).join('');
  let body = '';
  const dis = canCommand() ? '' : 'disabled';
  if (S.seg === 'machines') {
    body = MACHINES.filter((m) => has(m.run)).map((m) => {
      const on = Boolean(V(m.run)), bad = alarmsFor(m.id);
      return `<div class="card row"><span class="dotS" style="background:${bad ? '#F59E0B' : on ? '#3B82F6' : '#64748B'}"></span>
        <div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--tx)">${esc(tr(m.name))}</div><div class="muted" style="color:${bad ? 'var(--wt)' : 'var(--mu)'}">${m.id} · ${bad ? x.fault : on ? x.run : x.stop}</div></div>
        <button class="sw" aria-pressed="${on}" aria-label="${esc(tr(m.name))}" data-act="set" data-arg="${m.run}" data-val="${!on}" ${dis}></button></div>`;
    }).join('');
  } else if (S.seg === 'lights') {
    body = LIGHTS.filter((l) => has(l.on)).map((l) => {
      const on = Boolean(V(l.on)), lv = l.level ? V(l.level) ?? 0 : null;
      return `<div class="card" style="display:flex;flex-direction:column;gap:10px">
        <div class="row">${svg(ICON.bulb, 24, on ? 'var(--yl)' : 'var(--m2)')}<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--tx)">${esc(tr(l.name))}</div><div class="muted">${l.lamps} ${x.lamps}</div></div>
        <button class="sw" aria-pressed="${on}" aria-label="${esc(tr(l.name))}" data-act="set" data-arg="${l.on}" data-val="${!on}" ${dis}></button></div>
        ${l.level ? `<div class="row"><label class="muted" for="dim-${l.id}">${x.dim}</label><input id="dim-${l.id}" type="range" min="10" max="100" step="10" value="${lv}" data-range="${l.level}" ${on && canCommand() ? '' : 'disabled'}><b class="num" style="width:44px;text-align:right;color:var(--tx)">${n0(lv)}%</b></div>` : ''}
      </div>`;
    }).join('');
  } else {
    body = VALVES.filter((v) => has(v.pos)).map((v) => {
      const pos = V(v.pos) ?? 0, vt = valveText(v);
      const b = (val, label) => `<button class="btn ${Math.round(pos) === val ? 'on' : ''}" data-act="set" data-arg="${v.pos}" data-val="${val}" ${dis}>${label}</button>`;
      return `<div class="card" style="display:flex;flex-direction:column;gap:10px">
        <div class="row"><b class="num" style="color:var(--tx)">${v.id}</b><span class="muted" style="color:var(--t2)">${esc(tr(v.name))}</span><span style="margin-left:auto;font-size:12px;color:${vt[1]}">${vt[0]}</span></div>
        <div class="bar"><span style="width:${pos}%"></span></div>
        <div class="grid3">${b(0, x.close)}${b(50, '50%')}${b(100, x.open)}</div></div>`;
    }).join('');
  }
  return `<div class="seg" role="tablist">${segs}</div>${canCommand() ? '' : `<div class="banner" style="border-radius:10px">${x.viewOnly}</div>`}<div class="cgrid">${body}</div>`;
}

function viewAlerts() {
  const x = t(), list = src.activeAlarms();
  const items = list.length ? list.map((a) => `<div class="alert ${a.acked ? 'done' : 'open'}">
      <div class="row" style="align-items:flex-start">${svg(ICON.warn, 22, a.acked ? '#64748B' : '#F59E0B')}<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--tx)">${esc(tr(a.text))}</div><div class="muted">${esc(a.tag)} = ${esc(typeof a.value === 'number' ? n1(a.value) : a.value)} · ${hhmm(a.raisedAt)}${a.acked ? ' · ' + x.acked : ''}</div></div></div>
      ${a.acked ? '' : `<div class="grid2"><button class="btn warn" data-act="view-eq" data-arg="${esc(a.tag.split('.')[0])}">${x.viewEq}</button><button class="btn amber" data-act="ack" data-arg="${esc(a.id)}" ${canCommand() ? '' : 'disabled'}>${x.ack}</button></div>`}
    </div>`).join('') : `<div class="card muted">${x.noAlerts}</div>`;
  const log = (src.log || []).map((l) => `<div class="log"><span class="num">${hhmm(l.ts)}</span><span>${esc(tr(l.text))} · ${esc(l.by)}</span></div>`).join('');
  return `<div class="row"><h2>${x.alerts}</h2><span class="muted">${x.unacked} ${list.filter((a) => !a.acked).length}</span></div>${items}<h2 style="margin-top:6px">${x.recent}</h2>${log || '<div class="muted">—</div>'}`;
}

function viewReport() {
  const x = t();
  const pts = S.hist || [];
  const vals = pts.map((p) => p[1]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const mx = vals.length ? Math.max(...vals) : null, mn = vals.length ? Math.min(...vals) : null;
  const W = 320, H = 110, max = Math.max(400, mx || 0);
  const line = pts.map((p, i) => `${(i / Math.max(1, pts.length - 1) * W).toFixed(1)},${(H - clamp(p[1] / max, 0, 1) * H).toFixed(1)}`).join(' ');
  const kwNow = V('MDB-1.KW') || 0;
  const parts = [[B('เครื่องจักร & ไลน์ผลิต', 'Machines & lines'), 105 + MACHINES.filter((m) => V(m.run) && !['P-01', 'P-02', 'CHL-01'].includes(m.id)).reduce((a, m) => a + m.kw * 0.8, 0), '#3B82F6'],
    [B('Chiller & ปั๊ม', 'Chiller & pumps'), ['P-01', 'P-02', 'CHL-01'].reduce((a, id) => a + (V(id + '.RUN') ? MACHINES.find((m) => m.id === id).kw * 0.8 : 0), 0), '#38BDF8'],
    [B('แสงสว่าง', 'Lighting'), (V('L-A.ON') ? 3.6 * (V('L-A.LEVEL') || 0) / 100 : 0) + (V('L-B.ON') ? 3 * (V('L-B.LEVEL') || 0) / 100 : 0) + (V('L-O.ON') ? 2.4 : 0), '#F5B820']];
  const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
  return `
  <div class="devcard gold">${badge(64, 78)}<div style="display:flex;flex-direction:column;gap:2px"><small>${x.reportBy}</small><b>${x.devName}</b><span style="font-size:12px;color:#C7D2EC">${x.site} · ${new Date().toLocaleString(S.lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span></div></div>
  <div class="row"><h2>${x.energyReport}</h2>${src.mode === 'demo' ? `<span class="muted" style="color:var(--wt)">${x.demoBanner}</span>` : ''}</div>
  <div class="grid2">
    <div class="kpi"><small>${x.totalElec}</small><b>${n0(V('MDB-1.KWH'))} <i>kWh</i></b></div>
    <div class="kpi"><small>${x.totalWater}</small><b>${n0(V('WM-01.TOTAL'))} <i>m³</i></b></div>
    <div class="kpi"><small>${x.avg} · 60 min</small><b>${n0(avg)} <i>kW</i></b></div>
    <div class="kpi"><small>${x.max} / ${x.min}</small><b>${n0(mx)} / ${n0(mn)} <i>kW</i></b></div>
  </div>
  <div class="card" style="display:flex;flex-direction:column;gap:8px">
    <span style="font-weight:600;color:var(--tx);font-size:14px">${x.lastHour}</span>
    ${pts.length > 1 ? `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="${x.lastHour}"><line x1="0" y1="${(H - 320 / max * H).toFixed(1)}" x2="${W}" y2="${(H - 320 / max * H).toFixed(1)}" stroke="#F59E0B" stroke-dasharray="5 4"/><polygon points="0,${H} ${line} ${W},${H}" fill="#1F5FFF" fill-opacity="0.22"/><polyline points="${line}" fill="none" stroke="var(--a2)" stroke-width="2.5"/></svg>` : '<div class="muted">…</div>'}
  </div>
  <div class="card" style="display:flex;flex-direction:column;gap:10px">
    <span style="font-weight:600;color:var(--tx);font-size:14px">${x.share} · ${n0(kwNow)} kW</span>
    ${parts.map((p) => `<div style="display:flex;flex-direction:column;gap:4px"><div class="row" style="justify-content:space-between;font-size:13px"><span style="color:var(--t2)">${tr(p[0])}</span><b class="num" style="color:var(--tx)">${Math.round(p[1] / tot * 100)}%</b></div><div class="bar"><span style="width:${Math.round(p[1] / tot * 100)}%;background:${p[2]}"></span></div></div>`).join('')}
  </div>
  ${embedded() ? '' : `<button class="btn primary" data-act="print">${x.exportPdf}</button>`}`;
}

function viewSheet() {
  if (!S.sheet) return '';
  const x = t(), id = S.sheet;
  let name = '', state = '', tone = 'run', stats = [], actions = [];
  const dis = canCommand() ? '' : 'disabled';
  if (id === 'T-1') {
    const lvl = V('T-1.LEVEL') ?? 0;
    name = B('ถังพักน้ำ 50 m³', 'Storage tank 50 m³'); state = n0(lvl) + '%'; tone = lvl >= 90 || lvl <= 15 ? 'alarm' : 'run';
    const inflow = V('P-01.RUN') ? 20 * (V('V-101.POS') || 0) / 100 : 0, out = 15 * (V('V-102.POS') || 0) / 100 + 25 * (V('V-103.POS') || 0) / 100;
    stats = [[x.level, n0(lvl) + '%'], [x.volume, n1(lvl / 2) + ' m³'], [x.inflow, n1(inflow) + ' m³/h'], [x.outflow, n1(out) + ' m³/h']];
    actions = [`<button class="btn" data-act="set" data-arg="V-101.POS" data-val="0" ${dis}>${x.closeIn}</button>`, `<button class="btn warn" data-act="set" data-arg="V-103.POS" data-val="100" ${dis}>${x.drainOpen}</button>`];
  } else if (LIGHTS.some((l) => l.id === id)) {
    const l = LIGHTS.find((q) => q.id === id), on = Boolean(V(l.on)), lv = l.level ? V(l.level) ?? 100 : 100;
    name = l.name; state = on ? x.on + (l.level ? ' ' + n0(lv) + '%' : '') : x.off; tone = on ? 'run' : 'stop';
    stats = [[x.lamps, String(l.lamps)], [x.lux, on ? n0(lv * 5) + ' lux' : '0 lux']];
    actions = [`<button class="btn warn" data-act="set" data-arg="${l.on}" data-val="false" ${dis}>${x.off}</button>`, `<button class="btn primary" data-act="set" data-arg="${l.on}" data-val="true" ${dis}>${x.on}</button>`];
    if (l.level) actions.push(`<div class="grid3" style="grid-column:1 / -1">${[30, 60, 100].map((p) => `<button class="btn ${on && Math.round(lv) === p ? 'on' : ''}" data-act="set" data-arg="${l.level}" data-val="${p}" ${on ? dis : 'disabled'}>${p}%</button>`).join('')}</div>`);
  } else if (id === 'MDB-1') {
    name = B('ตู้ไฟหลัก 3 เฟส', '3-phase main board'); state = n0(V('MDB-1.KW')) + ' kW'; tone = (V('MDB-1.KW') ?? 0) > 320 ? 'alarm' : 'run';
    stats = [[x.kwNowL, n0(V('MDB-1.KW')) + ' kW'], [x.energy, n0(V('MDB-1.KWH')) + ' kWh'], [x.pf, V('MDB-1.PF') != null ? Number(V('MDB-1.PF')).toFixed(2) : '0.93'], ['Peak', '320 kW']];
  } else if (id === 'INJ-01') {
    const mt = V('INJ-01.MOLD_T') ?? 0;
    name = B('เครื่องฉีดพลาสติก INJ-01', 'Injection molder INJ-01'); state = n1(mt) + ' °C'; tone = mt > 60 ? 'alarm' : 'run';
    stats = [[x.moldT, n1(mt) + ' °C'], [x.coolBy, 'V-201 · P-02 · CHL-01']];
    actions = [`<div class="muted" style="grid-column:1 / -1">${x.moldNote}</div>`];
  } else if (id.startsWith('V-')) {
    const v = VALVES.find((q) => q.id === id), pos = V(v.pos) ?? 0;
    name = v.name; state = valveText(v)[0]; tone = pos === 0 ? 'stop' : 'run';
    stats = [[x.pos, n0(pos) + '%'], [x.flow, n1(v.max * pos / 100) + ' m³/h']];
    actions = [`<button class="btn warn" data-act="set" data-arg="${v.pos}" data-val="0" ${dis}>${x.close}</button>`, `<button class="btn primary" data-act="set" data-arg="${v.pos}" data-val="${pos >= 100 ? 50 : 100}" ${dis}>${pos >= 100 ? x.o50 : x.o100}</button>`];
  } else {
    const m = MACHINES.find((q) => q.id === id); if (!m) return '';
    const on = Boolean(V(m.run)), bad = alarmsFor(id);
    name = m.name; state = bad ? x.fault : on ? x.run : x.stop; tone = bad ? 'alarm' : on ? 'run' : 'stop';
    stats = [[x.rated, m.kw + ' kW'], ...m.stats.map(([k, tag, u]) => [x[k], n1(V(tag)) + ' ' + u])];
    actions = [`<button class="btn warn" data-act="set" data-arg="${m.run}" data-val="false" ${dis}>STOP</button>`, `<button class="btn primary" data-act="set" data-arg="${m.run}" data-val="true" ${dis}>START</button>`];
  }
  return `<div class="scrim"><button style="flex:1;background:transparent;border:0" data-act="close-sheet" aria-label="${x.closePanel}"></button>
    <div class="sheet" role="dialog" aria-label="${esc(id)}"><span class="handle"></span>
      <div class="row"><div style="min-width:0"><b class="num" style="font-size:24px;color:var(--tx)">${esc(id)}</b><div class="muted" style="color:var(--t2);font-size:14px">${esc(tr(name))}</div></div><span class="pill ${tone}" style="margin-left:auto">${esc(state)}</span></div>
      <div class="grid2">${stats.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
      <div class="grid2">${actions.join('')}</div>
    </div></div>`;
}

function viewSettings() {
  if (!S.settings) return '';
  const x = t(), u = src.user || {};
  const themes = [['navy', 'Navy', '#0E1733'], ['graphite', 'Graphite', '#2A2F38'], ['light', 'Light', '#F3F5F9']].map(([k, l, c]) => `<button class="btn ${S.theme === k ? 'on' : ''}" data-act="theme" data-arg="${k}" aria-pressed="${S.theme === k}" style="display:flex;flex-direction:column;align-items:center;gap:6px"><span style="width:28px;height:28px;border-radius:50%;border:2px solid var(--ln2);background:${c}"></span>${l}</button>`).join('');
  const np = 'Notification' in window ? (Notification.permission === 'granted' ? `<span class="pill run">${x.notifOn}</span>` : `<button class="btn" style="min-height:40px;padding:8px 12px" data-act="notif">${x.notifAsk}</button>`) : `<span class="muted">${x.notifNo}</span>`;
  return `<div class="scrim"><button style="flex:1;background:transparent;border:0" data-act="close-settings" aria-label="${x.closePanel}"></button>
    <div class="sheet" role="dialog" aria-label="${x.settings}"><span class="handle"></span>
      <div class="row"><span style="width:48px;height:48px;border-radius:50%;background:#1F5FFF;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px">${esc((u.name || '?').slice(0, 1))}</span>
        <div><div style="font-weight:700;color:var(--tx)">${esc(u.name || '')}</div><div class="muted">${x.role[u.role] || esc(u.role || '')}</div></div></div>
      <div><div class="muted" style="font-weight:600;margin-bottom:8px">${x.language}</div><div class="grid2">${langButtons()}</div></div>
      <div><div class="muted" style="font-weight:600;margin-bottom:8px">${x.theme}</div><div class="grid3">${themes}</div></div>
      <div class="row" style="justify-content:space-between"><span style="color:var(--tx)">${x.notif}</span>${np}</div>
      <div class="row" style="justify-content:space-between"><span style="color:var(--tx)">${x.connection}</span><span class="muted"><span class="conn" style="background:${src.connected ? '#3B82F6' : '#F59E0B'}"></span>${src.mode === 'demo' ? x.demo : src.connected ? x.live : x.offline}</span></div>
      ${installCard()}
      <div class="devcard" style="border-top:1px solid var(--rw);padding-top:12px">${badge(48, 58)}<div><small>${x.about} · ${x.version}</small><b>${x.devBy} ${x.devName}</b></div></div>
      <div class="grid2"><button class="btn warn" data-act="logout">${x.logout}</button><button class="btn primary" data-act="close-settings">${x.done}</button></div>
    </div></div>`;
}

function viewBlocked() {
  const b = S.blocked; if (!b) return '';
  const x = t(), d = b.details;
  const val = typeof d.value === 'number' ? n1(d.value) : String(d.value);
  const unit = d.tag === 'T-1.LEVEL' ? ' %' : '';
  const role = src.user && src.user.role;
  const canBypass = role === 'engineer' || role === 'admin';
  const fixes = (d.fixes || []).map((f, i) => `<button class="btn primary" data-act="blk-fix" data-arg="${i}" ${canCommand() ? '' : 'disabled'}>${esc(tr(f.label))}</button>`).join('');
  const mins = [5, 15, 30].filter((m) => m <= (d.maxBypassMin || 30)).map((m) => `<button class="chip ${S.bypassMin === m ? 'on' : ''}" data-act="blk-min" data-arg="${m}" aria-pressed="${S.bypassMin === m}">${m} ${x.blkMin}</button>`).join('');
  return `<div class="scrim center"><div class="dialog blk" role="alertdialog" aria-label="${x.blkTitle}">
    <div class="row"><span class="blk-ico">${svg(ICON.warn, 26, '#F59E0B')}</span><div><h3>${x.blkTitle}</h3><div class="muted">${esc(d.id)}</div></div></div>
    <p style="font-weight:600">${esc(tr(d.text))}</p>
    <div class="grid2"><div class="stat"><small>${x.blkNow}</small><b>${esc(d.tag)} = ${esc(val)}${unit}</b></div><div class="stat"><small>${x.blkRule}</small><b>${esc(d.op)} ${esc(d.limit)}${unit}</b></div></div>
    ${fixes ? `<div class="blk-sec"><b>${x.blkFix}</b><span class="muted">${x.blkFixHint}</span>${fixes}</div>` : ''}
    <button class="btn" data-act="blk-wait">${x.blkWait}</button>
    <div class="blk-sec">
      <b>${x.blkBypass}</b>
      ${!d.bypassable ? `<span class="muted">${x.blkNoBypass}</span>` : !canBypass ? `<span class="muted">${x.blkNeedRole}</span>` : `
        <label class="muted" for="byp-reason">${x.blkReason}</label>
        <input id="byp-reason" data-reason="1" type="text" maxlength="200" placeholder="${x.blkReasonPh}" value="${esc(S.bypassReason)}">
        <div class="chipwrap">${mins}</div>
        <button class="btn warn" data-act="blk-bypass">${x.blkDo} ${S.bypassMin} ${x.blkMin}</button>`}
    </div>
    <button class="btn" data-act="blk-close">${x.close2}</button>
  </div></div>`;
}
function bypassBanner() {
  if (!src || !src.interlocks) return '';
  const x = t();
  const list = src.interlocks().filter((il) => il.bypass);
  const parts = list.map((il) => { const left = Math.max(0, il.bypass.until - Date.now()) / 1000; return `<div class="byp"><span class="dotS pulse" style="background:#F59E0B"></span><span><b>${x.byp}: ${esc(il.id)}</b> · ${x.bypLeft} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · ${x.bypBy} ${esc(il.bypass.by)}</span><button class="chip" data-act="blk-restore" data-arg="${esc(il.id)}">${x.restore}</button></div>`; });
  if (S.deferred) parts.push(`<div class="byp wait"><span class="dotS pulse" style="background:#3B82F6"></span><span><b>${x.waiting}:</b> ${esc(tr(describe(S.deferred.steps)))}</span><button class="chip" data-act="blk-unwait">${x.cancelWait}</button></div>`);
  return parts.join('');
}
function viewConfirm() {
  if (!S.pending) return '';
  const x = t();
  return `<div class="scrim center"><div class="dialog" role="alertdialog" aria-label="${x.confirmTitle}">
    <span style="width:52px;height:52px;border-radius:14px;background:var(--sb);display:flex;align-items:center;justify-content:center">${svg('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4', 28, 'var(--a2)')}</span>
    <h3>${x.confirmTitle}</h3><p>${esc(tr(S.pending.text))}</p>
    <div class="muted">${x.confirmNote}</div>
    <div class="grid2"><button class="btn" data-act="cancel">${x.cancel}</button><button class="btn primary" data-act="confirm" ${S.busy ? 'disabled' : ''}>${x.confirm}</button></div>
  </div></div>`;
}

// ---------------------------------------------------------------- render loop
let renderTimer = null, interacting = false;
function render() {
  renderTimer = null;
  if (interacting) return;
  applyPrefs();
  if (S.view === 'login') { root.innerHTML = viewLogin(); return; }
  if (S.view !== 'app') return;
  const prevMain = root.querySelector('main');
  if (twin) { const sc = twin.el.querySelector('.twin-scroll'); if (sc && twin.el.isConnected) sc.dataset.left = sc.scrollLeft; }
  if (benchView) { const sc = benchView.el.querySelector('.bench-scroll'); if (sc && benchView.el.isConnected) sc.dataset.left = sc.scrollLeft; }
  const scroll = prevMain ? prevMain.scrollTop : 0;
  const prevRp = root.querySelector('.rp-scrim'), rpScroll = prevRp ? prevRp.scrollTop : 0;
  const views = { home: viewHome, house: viewHouse, scada: viewScadaTab, power: viewPower, pq: viewPq, bench: viewBench, control: viewControl, alerts: viewAlerts, report: viewReport };
  const body = isDesk() && S.tab === 'home'
    ? `<div class="overview"><section class="twin-hero"><div class="row"><h2>${t().twinTitle}</h2></div>${twinBlock()}</section><div class="dgrid"><section class="col">${viewHome()}</section><section class="col">${viewScada()}</section><section class="col">${viewAlerts()}</section></div></div>`
    : `<div class="wrap wrap-${S.tab}">${views[S.tab]()}</div>`;
  root.classList.toggle('desk', isDesk());
  const html = header() + `<main>${bypassBanner()}${body}</main>` + tabs() + viewSheet() + viewSettings() + viewBlocked() + viewConfirm() + viewPreview() + viewHouseModals() +
    (S.toast ? `<div class="toast ${S.toast.bad ? 'bad' : ''}" role="status">${esc(S.toast.text)}</div>` : '');
  // update the page in place (no wholesale innerHTML swap): scrolling, focus and animations keep going
  if (!root.querySelector('main')) root.innerHTML = html;
  else { const tpl = document.createElement('template'); tpl.innerHTML = html; morphChildren(root, tpl.content); }
  mountTwin();
  mountBench();
  mountPower();
  mountPq();
  mountHouse();
  const rp = root.querySelector('.rp-scrim'); if (rp) rp.scrollTop = rpScroll;
  const main = root.querySelector('main');
  if (main && !S.keepScroll) { main.scrollTop = 0; window.scrollTo(0, 0); }
  S.keepScroll = true;
}
// ---------------------------------------------------------------- tiny DOM morph
// Elements whose id ends in "-slot" host persistent animated nodes (digital twin, bench, power plant): their children are left alone.
function morphNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.nodeType !== 1) return;
  const slotA = !!a.id && a.id.endsWith('-slot'), slotB = !!b.id && b.id.endsWith('-slot');
  if ((slotA || slotB) && a.id !== b.id) { a.replaceWith(b); return; }
  const keep = slotA;
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(keep && name.startsWith('data-'))) a.removeAttribute(name);
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') {
    if (document.activeElement !== a) { const v = b.getAttribute('value') ?? ''; if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked'); else if (a.value !== v && a.tagName !== 'SELECT') a.value = v; }
    return;
  }
  if (keep) return;
  morphChildren(a, b);
}
function morphChildren(a, b) {
  const na = [...a.childNodes], nb = [...b.childNodes];
  for (let i = 0; i < nb.length; i++) {
    if (i < na.length) morphNode(na[i], nb[i]);
    else a.appendChild(nb[i]);
  }
  for (let i = nb.length; i < na.length; i++) na[i].remove();
}
function schedule(ms = 0) { if (!renderTimer) renderTimer = setTimeout(render, ms); }
function toast(text, bad) { S.toast = { text, bad }; schedule(); clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = null; schedule(); }, 2800); }

// ---------------------------------------------------------------- commands
function describe(steps) {
  const m = (s) => {
    const eq = s.tag.split('.')[0];
    return { th: `${eq} → ${fmtVal(s.value, 'th')}`, en: `${eq} → ${fmtVal(s.value, 'en')}` };
  };
  const parts = steps.map(m);
  return { th: parts.map((p) => p.th).join(', '), en: parts.map((p) => p.en).join(', ') };
}
function errorText(e) {
  const map = { NOT_BYPASSABLE: B('ระบบป้องกันนี้ข้ามไม่ได้', 'This interlock cannot be bypassed'), REASON_REQUIRED: B('ต้องใส่เหตุผล', 'A reason is required'), INTERLOCK: B('ถูกบล็อกโดย Interlock (ระบบป้องกัน)', 'Blocked by an interlock'), FORBIDDEN: B('บัญชีนี้ไม่มีสิทธิ์สั่งการ', 'This account cannot command'), OUT_OF_RANGE: B('ค่าเกินช่วงที่อนุญาต', 'Value out of range'), EXPIRED: B('หมดเวลายืนยัน ลองใหม่อีกครั้ง', 'Confirmation expired, try again') };
  return map[e.code] ? tr(map[e.code]) : e.message;
}
async function command(steps, title) {
  steps = steps.filter((s) => has(s.tag) && V(s.tag) !== s.value);
  if (!steps.length) { toast(t().nothingToDo); return; }
  // Step 1: validate everything on the gateway first (role, range, interlocks)
  const cmds = [];
  try { for (const s of steps) cmds.push(await src.prepare(s.tag, s.value)); }
  catch (e) {
    for (const c of cmds) src.cancel(c.id);
    if (e.code === 'INTERLOCK' && e.details) { S.blocked = { details: e.details, steps, title }; S.sheet = null; S.bypassReason = ''; schedule(); return; }
    toast(t().failed + errorText(e), true); return;
  }
  const d = describe(steps);
  S.pending = { cmds, steps, text: title ? { th: `${title.th}: ${d.th}`, en: `${title.en}: ${d.en}` } : { th: d.th + ' ?', en: d.en + '?' } };
  S.sheet = null;
  schedule();
}
async function retryDeferred() {
  const d = S.deferred;
  if (!d || S.pending || S.blocked || !src) return;
  try {
    const c = await src.prepare(d.steps[0].tag, d.steps[0].value);
    await src.cancel(c.id);
  } catch (e) { if (e.code === 'INTERLOCK') return; S.deferred = null; toast(t().failed + errorText(e), true); return; }
  S.deferred = null;
  toast(t().ready + ' · ' + tr(describe(d.steps)));
  await command(d.steps, d.title);
}
async function doBypass() {
  const b = S.blocked; if (!b) return;
  const x = t();
  if ((S.bypassReason || '').trim().length < 5) { toast(x.blkReasonShort, true); return; }
  try {
    await src.bypass(b.details.id, S.bypassMin, S.bypassReason.trim());
    S.blocked = null;
    toast(x.bypassed + b.details.id);
    await command(b.steps, b.title); // bring the original command back for confirmation
  } catch (e) { toast(t().failed + errorText(e), true); }
}
async function confirmPending() {
  const p = S.pending; if (!p) return;
  S.busy = true; schedule();
  try {
    for (const c of p.cmds) await src.confirm(c.id);
    S.pending = null; toast(t().sent + tr(describe(p.steps)));
  } catch (e) {
    S.pending = null; toast(t().failed + errorText(e), true);
  } finally { S.busy = false; schedule(); }
}
async function quickSet(tag, value) {
  // dimming: low-risk, no dialog, still prepared + confirmed + audited on the gateway
  try { const c = await src.prepare(tag, value); await src.confirm(c.id); } catch (e) { toast(t().failed + errorText(e), true); }
}
const SCENES = {
  morning: { title: B('ฉาก “เริ่มกะเช้า”', 'Scene “Start shift”'), steps: [['CMP-01.RUN', true], ['CNV-01.RUN', true], ['L-A.ON', true], ['L-A.LEVEL', 80], ['L-B.ON', true], ['L-B.LEVEL', 80], ['V-102.POS', 50]] },
  lunch: { title: B('ฉาก “พักเที่ยง”', 'Scene “Lunch break”'), steps: [['L-A.LEVEL', 30], ['L-B.LEVEL', 30], ['CNV-01.RUN', false]] },
  off: { title: B('ฉาก “ปิดโรงงาน”', 'Scene “Shut down”'), steps: [['CMP-01.RUN', false], ['CNV-01.RUN', false], ['CHL-01.RUN', false], ['P-02.RUN', false], ['L-A.ON', false], ['L-B.ON', false], ['L-O.ON', true], ['V-102.POS', 0]] }
};

// ---------------------------------------------------------------- events
function wireEvents() {
root.addEventListener('click', async (ev) => {
  // a tap on a button ends any typing, so the page can refresh again
  const ae = document.activeElement; if (ev.target.closest('[data-act]') && ae && ae !== ev.target && /INPUT|TEXTAREA/.test(ae.tagName) && ae.type !== 'file') { ae.blur(); interacting = false; }
  const bel = ev.target.closest('[data-bench]');
  if (bel && !ev.target.closest('[data-act]')) {
    const kind = bel.dataset.bench, a = bel.dataset.arg;
    if (kind === 'valve' && bench.mode !== 'auto') { bench.alarm = null; bench.setValve(a, !bench.v[a]); }
    else if (kind === 'meter' && bench.mode !== 'auto') bench.selected[a] = !bench.selected[a];
    else if (kind === 'sensor') toast(`${a}: ${a.startsWith('LSHH') ? (S.lang === 'th' ? 'กันล้น' : 'overflow protection') : a.startsWith('LSL') ? (S.lang === 'th' ? 'ถังแห้ง / จุดศูนย์' : 'empty / zero') : (S.lang === 'th' ? 'เซนเซอร์ปริมาตรที่คอถัง' : 'neck volume sensor')}`);
    schedule();
    return;
  }
  const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
  const act = el.dataset.act, arg = el.dataset.arg;
  S.keepScroll = true;
  switch (act) {
    case 'tab': S.tab = arg; S.sheet = null; S.keepScroll = false; history.replaceState(null, '', '#' + arg); if (arg === 'report') loadHistory(); break;
    case 'seg': S.tab = 'control'; S.seg = arg; history.replaceState(null, '', '#control'); break;
    case 'sheet': S.sheet = arg; break;
    case 'close-sheet': S.sheet = null; break;
    case 'settings': S.settings = true; S.sheet = null; break;
    case 'close-settings': S.settings = false; break;
    case 'lang': S.lang = arg; store.set('lang', arg); break;
    case 'theme': S.theme = arg; store.set('theme', arg); break;
    case 'set': { const v = el.dataset.val; await command([{ tag: arg, value: v === 'true' ? true : v === 'false' ? false : Number(v) }]); break; }
    case 'scene': { const sc = SCENES[arg]; await command(sc.steps.map(([tag, value]) => ({ tag, value })), sc.title); break; }
    case 'confirm': await confirmPending(); break;
    case 'cancel': if (S.pending) S.pending.cmds.forEach((c) => src.cancel(c.id)); S.pending = null; break;
    case 'ack': try { await src.ack(arg); } catch (e) { toast(t().failed + errorText(e), true); } break;
    case 'view-eq': S.tab = 'scada'; S.sheet = MACHINES.some((m) => m.id === arg) || VALVES.some((v) => v.id === arg) || ['T-1', 'INJ-01', 'MDB-1'].includes(arg) ? arg : null; break;
    case 'print': window.print(); break;
    case 'scada-mode': S.scadaMode = arg; break;
    case 'blk-close': S.blocked = null; break;
    case 'blk-min': S.bypassMin = Number(arg); break;
    case 'blk-wait': S.deferred = { steps: S.blocked.steps, title: S.blocked.title }; S.blocked = null; break;
    case 'blk-unwait': S.deferred = null; break;
    case 'blk-fix': { const b = S.blocked, f = b.details.fixes[Number(arg)]; S.deferred = { steps: b.steps, title: b.title }; S.blocked = null; await command(f.set.map((q) => ({ tag: q.tag, value: q.value })), f.label); break; }
    case 'blk-bypass': await doBypass(); break;
    case 'blk-restore': try { await src.restore(arg); toast(t().restored); } catch (e) { toast(t().failed + errorText(e), true); } break;
    case 'bench-meter': bench.selected[arg] = !bench.selected[arg]; break;
    case 'bench-q3': bench.q3 = Number(arg); break;
    case 'bench-r': bench.R = Number(arg); break;
    case 'bench-pt': BS.pts[arg] = !BS.pts[arg]; break;
    case 'bench-preset': BS.pts = { Q1: true, Q2: true, Q3: true, Q4: arg === 'all' }; break;
    case 'bench-manual': BS.manual = !BS.manual; break;
    case 'bench-model': bench.setModel(arg); if (bench.fault) bench.injectFault(null); break;
    case 'rp-open': S.preview = true; break;
    case 'hm-sec': S.hsec = arg; break;
    case 'cam-mode': S.camMode = arg; S.camBig = null; break;
    case 'hm-dn': hm.sim.night = arg === 'auto' ? null : arg === 'night'; break;
    case 'hm-light': hm.sim.light[arg] = !hm.sim.light[arg]; break;
    case 'hm-load': hm.sim.load[arg] = !hm.sim.load[arg]; break;
    case 'hm-scene': { const L = hm.sim.light, set = (ids, v) => ids.forEach((i) => { L[i] = v; });
      if (arg === 'home') { set(['L-GATE', 'L-CAR', 'L-EAVE', 'L-LIV', 'L-GDN'], true); }
      else if (arg === 'night') { set(Object.keys(L), false); set(['L-GATE', 'L-EAVE', 'L-MBR'], true); hm.sim.load['AC-1'] = true; }
      else if (arg === 'away') { set(Object.keys(L), false); set(['L-GATE', 'L-EAVE', 'L-CAR'], true); hm.sim.load['AC-1'] = false; hm.sim.load['AC-2'] = false; }
      else set(Object.keys(L), false);
      toast(t().hmSceneDone); break; }
    case 'hm-valve': S.hconfirm = { id: arg, open: el.dataset.val === '1' }; break;
    case 'hm-conf': if (arg === '1' && S.hconfirm) { hm.sim.setValve(S.hconfirm.id, S.hconfirm.open, (src && src.user && src.user.name) || 'App'); toast(t().hmSent); } S.hconfirm = null; break;
    case 'hm-leak': hm.sim.leak = !hm.sim.leak; if (hm.sim.leak) { for (const id of ['V-GDN', 'V-TANK']) hm.sim.setValve(id, false, 'App'); } break;
    case 'cam-big': S.camBig = arg; break;
    case 'cam-close': if (ev.target === el || el.tagName === 'BUTTON') S.camBig = null; break;
    case 'cam-snap': if (hm.big) { const a = document.createElement('a'); a.href = hm.big.toDataURL('image/jpeg', 0.9); a.download = `${S.camBig}-${Date.now()}.jpg`; document.body.appendChild(a); a.click(); a.remove(); toast(t().hmSnapDone); } break;
    case 'ocr-demo': await ocrDemo(); break;
    case 'ocr-snap': await ocrFromCamera(); break;
    case 'ocr-torch': await toggleTorch(); break;
    case 'ocr-camstop': stopCamera(); S.mread.cam = 'sim'; break;
    case 'ocr-read': await ocrRead(); break;
    case 'ocr-dig': { const m = S.mread, i = Number(arg); m.digits[i] = String((Number(m.digits[i]) + Number(el.dataset.val) + 10) % 10); m.conf[i] = 100; m.edited = true; break; }
    case 'ocr-save': { const m = S.mread, L = Math.round(ocrValue(m) * 1000 * 100) / 100;
      hm.hist = hm.hist.filter((h) => h.src !== 'seed' && h.src !== 'sim'); // real readings only from now on
      const rec = { id: newId(m.ts), ts: m.ts, L, how: 'mech', model: m.model, src: 'ocr', minConf: Math.min(...m.conf), edited: !!m.edited };
      hm.hist.unshift(rec); hm.sim.reading = L; saveHist(); stopCamera(); S.mread = null; S.hsec = 'meter'; toast(t().hmSaved); gsEnqueue(rec); break; }
    case 'hm-model': hm.model = arg; saveHist(); break;
    case 'gs-test': await gsTest(); break;
    case 'gs-sync': await gsFlush(); break;
    case 'gs-all': gsResendAll(); break;
    case 'gs-csv': csvExport(); break;
    case 'gs-help': S.gsHelp = !S.gsHelp; break;
    case 'hm-read': S.mread = { model: hm.model, how: HM_METERS[hm.model].how, step: 'ready', cam: 'sim' }; if (S.mread.how === 'mech') ocrWorker().catch(() => {}); break;
    case 'hm-cam-on': await startCamera(); break;
    case 'hm-scan': readMeter(); break;
    case 'hm-reread': S.mread.step = 'ready'; S.mread.cam = 'sim'; break;
    case 'hm-mclose': stopCamera(); S.mread = null; break;
    case 'hm-save': { const m = S.mread; const L = m.how === 'nfc' ? m.L : Math.round((Number(m.edit) || m.L / 1000) * 1000 * 100) / 100; const rec = { id: newId(m.ts), ts: m.ts, L, how: m.how, model: m.model, src: m.src }; hm.hist.unshift(rec); saveHist(); S.mread = null; S.hsec = 'meter'; toast(t().hmSaved); if (m.src !== 'sim') gsEnqueue(rec); break; }
    case 'pw-fix': pw.sim.fx = { ...pw.sim.fx, [arg]: !pw.sim.fx[arg] }; break;
    case 'pw-capplain': pw.sim.fx = { ...pw.sim.fx, capPlain: arg === '1' }; break;
    case 'pw-sel': pw.sim.selected = pw.sim.selected === arg ? 'PLANT' : arg; break;
    case 'pw-preset': pw.sim.fx = arg === 'none' ? {} : arg === 'quick' ? { cap: true, burst: true, ie3: true } : Object.fromEntries(FIXES.map((f) => [f.id, true])); break;
    case 'rp-close': S.preview = false; break;
    case 'rp-xlsx': saveXlsx(); break;
    case 'rp-pdf': printReport(); break;
    case 'bench-vol': BS.vol = arg === 'auto' ? null : Number(arg); break;
    case 'bench-speed': bench.speed = Number(arg); break;
    case 'bench-stop': bench.stop(); break;
    case 'bench-fault': bench.injectFault(bench.fault ? null : ([...POSITIONS].reverse().find((id) => bench.selected[id]) || 'M3')); break;
    case 'bench-clear': bench.clearResults(); break;
    case 'bench-valve': bench.alarm = null; bench.setValve(arg, !bench.v[arg]); break;
    case 'bench-flow': { const p = bench.points(); if (arg === 'off') { bench.v = { in: false, s: false, l: false, ds: false, dl: false }; bench.setFlow(0); } else { bench.alarm = null; if (!bench.v.s && !bench.v.l) bench.v.l = true; bench.setFlow(p[arg]); } break; }
    case 'bench-run': {
      if (!Object.values(bench.selected).some(Boolean)) { toast(t().selectMeter, true); break; }
      const p = bench.points();
      const mk = (k) => ({ key: k, Q: p[k], V: BS.vol || DEFAULT_VOL[k] });
      const list = ['Q1', 'Q2', 'Q3', 'Q4'].filter((k) => BS.pts[k]);
      if (!list.length) { toast(t().selectPoint, true); break; }
      BS.runTotal = list.length;
      bench.start(list.map(mk));
      break;
    }
    case 'daynight': S.dayNight = arg; store.set('dayNight', arg); break;
    case 'labels': S.labels = !S.labels; break;
    case 'zoom': S.zoom = clamp(Math.round(((S.zoom || 1) + Number(arg) * 0.35) * 100) / 100, 1, 3); break;
    case 'install': if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; } break;
    case 'notif': if ('Notification' in window) await Notification.requestPermission(); break;
    case 'logout': store.set('session', null); if (src) src.stop(); src = null; S.settings = false; S.view = 'login'; break;
    case 'signin': await signIn(document.getElementById('tok').value.trim()); break;
    case 'signin-demo': await signIn('demo-operator'); break;
    case 'offline-demo': startDemo(); break;
  }
  schedule();
});
root.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.range) { interacting = false; quickSet(el.dataset.range, Number(el.value)); schedule(); }
});
root.addEventListener('pointerdown', (ev) => { if (ev.target.type === 'range') interacting = true; if (ev.target.closest && ev.target.closest('[data-crop]')) cropDrag(ev); });
root.addEventListener('change', async (ev) => {
  if (ev.target.dataset && ev.target.dataset.gs === 'auto') { gs.cfg.auto = ev.target.checked; gsSave(); if (gs.cfg.auto) gsFlush(); schedule(); return; }
  if (!(ev.target.dataset && ev.target.dataset.ocrFile) || !ev.target.files || !ev.target.files[0] || !S.mread) return;
  const url = URL.createObjectURL(ev.target.files[0]);
  try { const im = await ocrLoadImage(url); await ocrFromImage(im); } catch (_) { toast(t().hmOcrFail, true); } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
});
root.addEventListener('input', (ev) => { if (ev.target.dataset && ev.target.dataset.reason) S.bypassReason = ev.target.value; if (ev.target.dataset && ev.target.dataset.serial) bench.serials[ev.target.dataset.serial] = ev.target.value.trim(); if (ev.target.dataset && ev.target.dataset.mread && S.mread) S.mread.edit = Number(ev.target.value); if (ev.target.dataset && ev.target.dataset.gs && ev.target.type !== 'checkbox') { gs.cfg[ev.target.dataset.gs] = ev.target.value.trim(); gs.err = ''; gsSave(); } if (ev.target.dataset && ev.target.dataset.tariff) { const v = Number(ev.target.value); if (Number.isFinite(v) && v >= 0) pw.tariff[ev.target.dataset.tariff] = v; } });
root.addEventListener('focusin', (ev) => { if (ev.target.dataset && (ev.target.dataset.reason || ev.target.dataset.serial || ev.target.dataset.tariff || ev.target.dataset.mread || ev.target.dataset.gs)) interacting = true; });
root.addEventListener('focusout', (ev) => { if (ev.target.dataset && (ev.target.dataset.reason || ev.target.dataset.serial || ev.target.dataset.tariff || ev.target.dataset.mread || ev.target.dataset.gs)) { interacting = false; schedule(300); } });
window.addEventListener('pointerup', () => { if (interacting) { setTimeout(() => { interacting = false; schedule(); }, 300); } });
let lastDesk = null; window.addEventListener('resize', () => { if (isDesk() !== lastDesk) { lastDesk = isDesk(); schedule(); } });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; schedule(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== S.tab && ['home', 'scada', 'bench', 'control', 'alerts', 'report'].includes(h)) { S.tab = h; schedule(); } });

}

async function loadHistory() {
  try { S.hist = await src.history('MDB-1.KW', Date.now() - 3600_000); } catch (_) { S.hist = []; }
  schedule();
}

function attach(source) {
  src = source;
  src.on((kind) => {
    if (kind === 'unauthorized') { store.set('session', null); src.stop(); src = null; S.view = 'login'; S.loginErr = t().badToken; schedule(); return; }
    if (kind && kind.alarm) notifyAlarm(kind.alarm);
    schedule(kind === 'tags' ? 400 : 0);
  });
  src.start();
  S.view = 'app';
  if (S.tab === 'report') loadHistory();
  setInterval(() => { if (S.tab === 'report') loadHistory(); }, 60000);
  setInterval(() => { if (S.tab === 'bench') schedule(); }, 500);
  setInterval(() => { if (S.tab === 'house' && !S.mread) schedule(); }, 1000);
  setInterval(() => { retryDeferred(); if (src && src.interlocks && src.interlocks().some((il) => il.bypass)) schedule(); }, 2000);
  schedule();
}

async function notifyAlarm(a) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const opts = { body: `${a.tag} = ${typeof a.value === 'number' ? n1(a.value) : a.value}`, icon: 'icons/icon-192.png', tag: a.rule };
    if (reg) reg.showNotification(tr(a.text), opts); else new Notification(tr(a.text), opts);
  } catch (_) { /* ignore */ }
}

function startDemo() {
  store.set('session', { mode: 'demo' });
  attach(new DemoSource());
}

async function signIn(token) {
  if (!token) { S.loginErr = t().badToken; schedule(); return; }
  S.busy = true; S.loginErr = ''; schedule();
  const base = gatewayBase();
  try {
    const r = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const user = await r.json();
    store.set('token', token);
    store.set('session', { mode: 'live', token, user });
    attach(new LiveSource(base, token, user));
  } catch (_) {
    S.loginErr = t().badToken;
  } finally { S.busy = false; schedule(); }
}

function gatewayBase() {
  // The app is served by the gateway at /app/ → API at the same origin.
  return location.origin;
}

async function probeGateway() {
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(gatewayBase() + '/api/health', { signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch (_) { return null; }
}

async function boot() {
  wireEvents();
  applyPrefs();
  const linked = gsFromLink();
  if (linked) {
    S.tab = 'house'; S.hsec = 'meter';
    setTimeout(async () => { toast(t().gsLinked.replace('{s}', linked)); await gsTest(); if (!gs.err) gsResendAll(); }, 1200);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not available on this host */ });
  }
  const session = store.get('session', null);
  S.gw = await probeGateway();
  if (session && session.mode === 'live') { attach(new LiveSource(gatewayBase(), session.token, session.user)); return; }
  if (S.gw) { S.view = 'login'; schedule(); return; }
  startDemo(); // no gateway on this host (e.g. hosted demo link) → offline demo
}
if (root) boot();

// exported for tests
export { DemoSource, LiveSource, describe, SCENES, MACHINES, VALVES, LIGHTS };
