// CoreDash Nexus — "Power Quality Center": live data from three Hioki PW3198 analysers (MAIN GRID · LOAD · APF)
// Sources: demo model (this device) · CoreDash Gateway on the LAN (/api/pq) · a file (CSV from USB-OTG / SD / PQ ONE export)
import { PqModel, ROLES, waveform, spectrumOf, ITIC_UPPER, ITIC_LOWER, iticVerdict } from './pq-model.js';
import { apfCase, ASSUME, TARIFF } from './audit-engine.js';
import { createAuditView } from './audit.js';
import { parsePw3198, pw3198Record } from './pw3198.js';
import { PqAlarmEngine, alarmText } from './pq-alarms.js';

const B = (th, en) => ({ th, en });
const T = {
  title: B('ศูนย์คุณภาพไฟฟ้า', 'Power Quality Center'),
  sub: B('Hioki PW3198 × 3 · IEC 61000-4-30 Class A', 'Hioki PW3198 × 3 · IEC 61000-4-30 Class A'),
  impFolder: B('เลือกทั้งโฟลเดอร์', 'Choose a folder'), impFiles: B('เลือกไฟล์ (หลายไฟล์ได้)', 'Choose files (several OK)'), impDrop: B('หรือลากไฟล์/โฟลเดอร์ที่ดึงจาก PW3198 มาวางตรงนี้', 'or drag the files/folder dumped from the PW3198 here'),
  impDone: B('นำเข้าแล้ว', 'Imported'), impSkip: B('ไฟล์ดิบของ Hioki (ต้องแปลงด้วย PQ ONE ก่อน)', 'raw Hioki files (convert with PQ ONE first)'), impMerged: B('รวม', 'merged'), impFrom: B('จากเครื่องมือ PW3198 (เมนู 4)', 'from the PW3198 tool (menu 4)'),
  impWait: B('กำลังรับข้อมูลจากเครื่องมือ PW3198…', 'Receiving data from the PW3198 tool…'), impFail: B('รับข้อมูลจากเครื่องมือไม่ได้ — กดอนุญาต "เข้าถึงเครือข่ายภายใน" ถ้าเบราว์เซอร์ถาม หรือลากโฟลเดอร์มาวางที่ช่องนำเข้าแทน', 'Could not receive data from the tool — allow "local network access" if the browser asks, or drag the folder onto the import box instead'),
  mLive: B('มอนิเตอร์', 'Monitor'), mAudit: B('วิเคราะห์ความคุ้มค่า ฿', 'Savings analysis ฿'), why: B('ที่มาของตัวเลข →', 'Where it comes from →'), net: B('ผลสุทธิต่อบิล', 'Net bill effect'),
  srcDemo: B('ข้อมูลจำลอง', 'Simulated data'), srcGw: B('ข้อมูลจริง · PW3198', 'Real data · PW3198'), srcFile: B('ไฟล์ย้อนหลัง', 'Recorded file'),
  srcLabel: B('แหล่งข้อมูล', 'Data source'),
  stDemo: B('ตัวเลขทั้งหมดเป็นข้อมูลจำลองจากแบบจำลองในเครื่อง — ไม่ใช่ค่าจากเครื่องวัด', 'All numbers are simulated on this device — not from an analyser'),
  stReal: B('ข้อมูลจริงจากเครื่องวัด', 'Real data from the analyser'), stUpd: B('อัปเดต', 'updated'),
  stWait: B('ยังไม่ได้รับข้อมูลจริง — บนโน้ตบุ๊กที่ต่อ LAN กับเครื่องวัด ให้ดับเบิลคลิก CoreDash-PW3198-LIVE.bat (หรือ LIVE-MULTI.bat) แล้วเปิดหน้านี้จากเบราว์เซอร์ที่เครื่องมือเปิดให้', 'No real data yet — on the notebook wired to the analyser, double-click CoreDash-PW3198-LIVE.bat (or LIVE-MULTI.bat) and use the browser window it opens'),
  stFile: B('ข้อมูลจากไฟล์ที่นำเข้า — ไม่ใช่ค่าสด', 'Data from an imported file — not live'),
  chipSim: B('จำลอง', 'SIM'), chipOff: B('ไม่มีข้อมูล', 'no data'),
  live: B('สด', 'LIVE'), offline: B('ออฟไลน์', 'OFFLINE'), sim: B('จำลอง', 'SIM'),
  guideT: B('ดึงข้อมูลจากเครื่องวัดทางไหนดี — ไม่ต้องถอดเสียบ USB / SD', 'Best way to pull the data — no USB or SD swapping'),
  guideHide: B('ซ่อน', 'Hide'), guideShow: B('ช่องทางเชื่อมต่อ', 'Connection options'),
  ch1: B('สาย LAN → CoreDash Gateway', 'LAN cable → CoreDash Gateway'),
  ch1b: B('แนะนำ', 'Recommended'),
  ch1d: B('เสียบสาย LAN ทิ้งไว้ทั้ง 3 เครื่องเข้าสวิตช์ตัวเดียว เกตเวย์อ่านค่าสดทุก 1 วินาทีด้วยคำสั่งสื่อสาร และดึงไฟล์บันทึกจาก SD ผ่าน FTP ขณะเครื่องยังบันทึกอยู่ มือถือดูผ่าน Wi-Fi/4G ได้หลายเครื่องพร้อมกัน', 'Leave all three analysers on one LAN switch. The gateway reads live values every second with communication commands and pulls recorded files from the SD card over FTP while recording continues. Phones view it over Wi-Fi/4G, many at once.'),
  ch2: B('Wi-Fi Router พกพา → เบราว์เซอร์มือถือ', 'Pocket Wi-Fi router → phone browser'),
  ch2d: B('เปิดหน้าจอเครื่องวัดจากมือถือผ่าน HTTP server ของเครื่อง ดูและสั่ง Start/Stop ได้ แต่เป็นภาพหน้าจอ ไม่ได้ตัวเลขมา plot', 'Opens the analyser\'s own HTTP screen on the phone. Good for viewing and Start/Stop, but it is a screen, not data to plot.'),
  ch3: B('สาย USB-OTG เข้ามือถือ Android', 'USB-OTG cable to an Android phone'),
  ch3d: B('เครื่องวัดเปิดเป็นไดรฟ์ USB (Mass Storage) โดยทั่วไปต้องหยุดบันทึกก่อน เลือกไฟล์แล้วกด "นำเข้าไฟล์" ด้านล่าง เหมาะกับงานภาคสนามที่ไม่มีเครือข่าย ไม่ใช่ค่าสด', 'The analyser appears as a USB drive (Mass Storage), usually only while not recording. Pick the file with "Import file" below. Good in the field without a network; not live.'),
  ch4: B('ถอด SD การ์ด', 'Pull the SD card'), ch4d: B('ต้องหยุดบันทึก เสี่ยงข้อมูลหายและขั้วสึก — ไม่แนะนำ', 'Recording must stop; risk of lost data and worn contacts — not recommended'),
  chNote: B('เบราว์เซอร์มือถือคุยกับพอร์ต USB ของเครื่องวัดโดยตรงไม่ได้ (WebUSB ไม่รองรับอุปกรณ์ Mass Storage) ค่าสดจึงมาทางเกตเวย์ ส่วน USB ใช้นำไฟล์เข้า', 'A phone browser cannot drive the analyser\'s USB port directly (WebUSB does not support Mass Storage devices), so live values come through the gateway and USB is for files.'),
  live1: B('ค่าสด 1 วินาที', 'Live, 1 s'), files1: B('ไฟล์ย้อนหลัง', 'Recorded files'), multi: B('หลายคนดูพร้อมกัน', 'Many viewers'), noUnplug: B('ไม่ต้องถอดเสียบ', 'No unplugging'),
  kw: B('กำลังจริง', 'Active power'), kva: B('กำลังปรากฏ', 'Apparent power'), kvar: B('กำลังรีแอกทีฟ', 'Reactive power'),
  amp: B('กระแสเฉลี่ย', 'Avg current'), pf: B('เพาเวอร์แฟกเตอร์', 'Power factor'),
  apfLoad: B('โหลด APF', 'APF loading'), comp: B('ชดเชย', 'Compensating'),
  exec: B('ผลของ Active Power Filter — ภาพรวมผู้บริหาร', 'Active Power Filter impact — executive view'),
  execSub: B('เทียบค่าที่โหลด (#3) กับค่าที่แผงเมนฝั่งการไฟฟ้า (#2) ณ เวลาเดียวกัน', 'Load side (#3) versus the utility side at the main board (#2), same instant'),
  apfOn: B('APF ทำงาน', 'APF ON'), apfOff: B('APF หยุด', 'APF OFF'), apfReact: B('ชดเชย kvar ด้วย', 'Also compensate kvar'),
  hRed: B('ฮาร์มอนิกกระแสลดลง', 'Harmonic current cut'), kvaRel: B('คืนพิกัดหม้อแปลง', 'Transformer capacity freed'),
  curRed: B('กระแสสายเมนลดลง', 'Feeder current down'), lossRed: B('ความสูญเสียในสาย/หม้อแปลงลดลง', 'Cable/transformer losses down'),
  save: B('ประหยัดโดยประมาณ', 'Estimated saving'), perM: B('/เดือน', '/month'),
  saveNote: B('ผลสุทธิ = ค่าปรับ PF ที่ลด + ค่าไฟจากความสูญเสียหม้อแปลง/สายที่ลด + ค่าดีมานด์ − ความสูญเสียของตัว APF เอง · แตะ "ที่มาของตัวเลข" เพื่อดูสูตรและแก้สมมติฐาน', 'Net = PF charge saved + transformer/cable loss energy saved + demand − the APF\'s own losses · tap "Where it comes from" for formulas and assumptions'),
  tMeas: B('ค่าวัด', 'Readings'), tWave: B('รูปคลื่น', 'Waveform'), tPhasor: B('เฟสเซอร์', 'Phasor'), tHarm: B('ฮาร์มอนิก', 'Harmonics'), tTrend: B('แนวโน้ม 24 ชม.', '24 h trend'), tEvents: B('เหตุการณ์', 'Events'), tFiles: B('ไฟล์ / นำเข้า', 'Files / import'),
  phase: B('เฟส', 'Phase'), hI: B('กระแส I', 'Current I'), hU: B('แรงดัน U', 'Voltage U'), total: B('รวม', 'Total'),
  limitI: B('เส้นประ = ขีดจำกัด IEEE 519-2014 (Isc/IL 20–50)', 'Dashed = IEEE 519-2014 limit (Isc/IL 20–50)'),
  limitU: B('เส้นประ = ระดับความเข้ากันได้ IEC 61000-2-4 Class 2', 'Dashed = IEC 61000-2-4 class 2 compatibility level'),
  over: B('เกินเกณฑ์', 'over limit'), within: B('อยู่ในเกณฑ์', 'within limit'),
  trendHint: B('แถบเทา = ช่วงที่ APF หยุด · แตะ/ลากบนกราฟเพื่ออ่านค่า', 'Grey band = APF off · tap/drag on the chart to read values'),
  evHint: B('จุดในกราฟ ITIC (CBEMA): นอกกรอบ = อุปกรณ์อิเล็กทรอนิกส์อาจรีเซ็ต/เสียหาย', 'Points on the ITIC (CBEMA) curve: outside the band = electronics may trip or reset'),
  evTime: B('เวลา', 'Time'), evKind: B('ชนิด', 'Type'), evCh: B('ช่อง', 'Ch'), evMag: B('ขนาด', 'Magnitude'), evDur: B('นาน', 'Duration'), evRes: B('ITIC', 'ITIC'), evInst: B('เครื่อง', 'Unit'),
  ok: B('ผ่าน', 'OK'), out: B('นอกกรอบ', 'Outside'),
  imp: B('นำเข้าไฟล์ (CSV / TXT)', 'Import file (CSV / TXT)'), impHint: B('จาก USB-OTG, SD การ์ด, อีเมล หรือไฟล์ที่ส่งออกจาก PQ ONE · ประมวลผลในเครื่องนี้ ไม่ส่งออกไปไหน', 'From USB-OTG, SD card, e-mail or a PQ ONE export · processed on this device only'),
  binNote: B('ไฟล์บันทึกดิบของเครื่องเป็นรูปแบบเฉพาะของ Hioki ถ้าเปิดไม่ได้ ให้ส่งออกเป็น CSV ด้วยโปรแกรม PQ ONE ก่อน', 'Raw recording files are in Hioki\'s own format; if one will not open, export it to CSV with PQ ONE first'),
  ftpT: B('ไฟล์บนเครื่องวัด (FTP ผ่านเกตเวย์)', 'Files on the analyser (FTP via gateway)'), plot: B('Plot', 'Plot'), dl: B('ดาวน์โหลด', 'Download'),
  noFile: B('ยังไม่มีไฟล์ — เลือกไฟล์ หรือกด Plot ที่ไฟล์บนเครื่องวัด', 'No file yet — choose one, or press Plot on an analyser file'),
  cols: B('เลือกคอลัมน์ที่จะ plot', 'Columns to plot'), stat: B('สถิติ', 'Statistics'), rows: B('แถว', 'rows'),
  min: B('ต่ำสุด', 'Min'), avg: B('เฉลี่ย', 'Avg'), max: B('สูงสุด', 'Max'), p95: B('P95', 'P95'),
  exportCsv: B('ส่งออก CSV ค่าปัจจุบัน', 'Export current CSV'), remote: B('เปิดหน้าจอเครื่อง', 'Open remote screen'),
  alTitle: B('การแจ้งเตือนคุณภาพไฟ (วิเคราะห์ทุก 1 วินาที)', 'Power-quality alarms (checked every second)'),
  alAlarm: B('แจ้งเตือน', 'alarm'), alWarn: B('เฝ้าระวัง', 'watch'), alSince: B('ตั้งแต่', 'since'),
  alWhy: B('สาเหตุที่พบบ่อย · สิ่งที่ควรทำ · มาตรฐาน', 'Common causes · what to do · standard'), alCause: B('สาเหตุ:', 'Cause:'), alAct: B('ควรทำ:', 'Do:'),
  alNone: B('ไม่มีเหตุผิดปกติตอนนี้', 'No abnormal condition right now'), alHist: B('ประวัติแจ้งเตือน', 'Alarm history'), alWorst: B('ค่าที่แย่ที่สุด', 'Worst value'),
  alNoti: B('เปิดแจ้งเตือนบนอุปกรณ์นี้', 'Enable notifications on this device'), alNotiOn: B('แจ้งเตือนบนอุปกรณ์นี้เปิดอยู่', 'Notifications on for this device'),
  alPushOn: B('ส่งเข้ามือถือ (ntfy) เปิดอยู่', 'Phone push (ntfy) on'), alPushOff: B('ยังไม่ได้ตั้งส่งเข้ามือถือ', 'Phone push not set up'),
  alNote: B('ค่าสดอ่านทุก 1 วินาที จับเหตุที่นาน ≥ 1 วินาทีได้ครบ (ฮาร์มอนิก ไม่สมดุล PF ไฟตก/เกินต่อเนื่อง) — ไฟตกสั้นกว่า 1 วินาทีและทรานเซียนต์ระดับไมโครวินาที ดูจากหน้า EVENT ของ PW3198 ซึ่งบันทึกครบตามมาตรฐาน Class A', 'Live values are read every second, so conditions lasting ≥ 1 s are caught (harmonics, unbalance, PF, sustained sags/swells). Sub-second dips and µs transients are recorded completely by the PW3198 EVENT function (Class A).'),
  bridgeOn: B('● ค่าสดจาก PW3198 ผ่านเครื่องมือ CoreDash บนเครื่องนี้ ·', '● Live values from the PW3198 through the CoreDash tool on this PC ·'),
  bridgeErr: B('เครื่องมือ CoreDash ปิดอยู่หรือหยุดส่งค่า — เปิด CoreDash-PW3198.bat แล้วกด 8 อีกครั้ง', 'The CoreDash tool is closed or stopped — run CoreDash-PW3198.bat and press 8 again'),
  bridgeOnly: B('โหมดค่าสดจากเครื่องมือภาคสนามอ่านค่าได้อย่างเดียว', 'The field-tool live mode is read-only'),
  noVolt: B('⚠ ยังไม่มีแรงดันเข้าเครื่องวัด (U ≈ 0 V) — ต่อสายวัดแรงดัน L1/L2/L3/N ก่อน ค่า P, PF, THD จึงจะขึ้น', '⚠ No voltage at the analyser (U ≈ 0 V) — connect the L1/L2/L3/N voltage leads; P, PF and THD need them'),
  gwNeed: B('โหมดเกตเวย์ใช้ได้เมื่อเข้าสู่ระบบด้วย CoreDash Gateway (ไม่ใช่โหมดสาธิต) · ตอนนี้แสดงข้อมูลสาธิต', 'Gateway mode needs a CoreDash Gateway sign-in (not demo) · showing demo data'),
  gwErr: B('อ่าน /api/pq จากเกตเวย์ไม่ได้ — ตรวจว่าเปิดบล็อก pq: ใน YAML แล้ว', 'Cannot read /api/pq from the gateway — check the pq: block in the YAML'),
  fileBad: B('อ่านไฟล์นี้ไม่ได้: ไม่พบคอลัมน์ตัวเลข', 'Cannot read this file: no numeric columns found'),
  waveNote: B('สัญญาณจำลองจากสเปกตรัมฮาร์มอนิก 50 ลำดับที่วัดได้', 'Rebuilt from the 50 measured harmonic orders'),
  cycles: B('2 ไซเคิล', '2 cycles'), dpf: B('cos φ', 'cos φ'), thdu: B('THD-U', 'THD-U'), thdi: B('THD-I', 'THD-I'),
  kf: B('K-factor', 'K-factor'), freq: B('ความถี่', 'Frequency'), unb: B('ไม่สมดุล', 'Unbalance'), neutral: B('กระแสนิวทรัล', 'Neutral current'), wp: B('พลังงานสะสม WP+', 'Energy WP+'),
  apfNote: B('ปุ่มเปิด/ปิด APF ใช้ได้เฉพาะข้อมูลจำลอง เครื่องจริงสั่งที่ตัวควบคุม APF', 'The APF switch only drives the simulation; command the real APF on its own controller')
};

const PH = ['#F87171', '#FBBF24', '#60A5FA'];
const GOLD = '#D4B06A';
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const fmtN = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// IEEE 519-2014 current distortion limits (% of IL), Isc/IL 20–50, odd harmonics; even = 25% of odd
function limI(h) { const odd = h < 11 ? 7 : h < 17 ? 3.5 : h < 23 ? 2.5 : h < 35 ? 1 : 0.5; return h % 2 ? odd : odd * 0.25; }
// IEC 61000-2-4 class 2 voltage compatibility levels (%)
const LIMU = { 2: 2, 3: 5, 4: 1, 5: 6, 6: 0.5, 7: 5, 9: 1.5, 11: 3.5, 13: 3, 15: 0.4, 17: 2, 19: 1.5, 21: 0.3, 23: 1.5, 25: 1.5 };
function limU(h) { if (LIMU[h] != null) return LIMU[h]; if (h % 2 === 0) return 0.5; if (h % 3 === 0) return 0.2; return h <= 50 ? Math.max(0.2, 2.27 * 17 / h - 0.27) : 0.2; }

export function createPqView({ lang = () => 'th', live: liveGw = () => null, onToast = () => {} } = {}) {
  const L = () => (lang() === 'en' ? 'en' : 'th');
  const x = (k) => T[k][L()];
  const model = new PqModel();
  const st = {
    imports: [], importSkipped: 0, importFrom: false, bridge: null, bridgeRing: [],
    alarms: null, alSeen: new Set(), alHist: false, alOpen: new Set(), alEng: new PqAlarmEngine({ unom: 230 }),
    mode: 'live', src: 'demo', sel: 'PQ-MAIN', tab: 'meas', hk: 'I', hp: 0, guide: true,
    snap: null, hist: null, histTs: 0, spark: {}, gwErr: null, gwMode: null, files: null, file: null, fileCols: [], hover: null,
    apfFromDemo: Date.now() - 6 * 3600e3
  };
  // live source: a CoreDash Gateway sign-in, or the field tool's local bridge (#pq?live=http://127.0.0.1:port)
  const live = () => (st.bridge ? { base: st.bridge, bridge: true } : liveGw());
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  { const last = lsGet('coredash.pq.src'); if (last === 'gw') { st.src = 'gw'; if (!liveGw()) st.bridge = lsGet('coredash.pq.bridge') || 'http://127.0.0.1:8799'; } }
  const el = document.createElement('section');
  el.className = 'pq';
  let timer = null, raf = 0, built = '', visible = false, audit = null, auditTick = 0;

  // ------------------------------------------------------------ data
  const normalize = (s, gw) => {
    if (gw) {
      const inst = {}, online = {}, meta = {};
      for (const i of s.instruments) {
        const d = i.data || (i.raw ? pw3198Record(i.id, parsePw3198(i.raw)) : null);
        inst[i.id] = d; online[i.id] = !!i.online && !!d; meta[i.id] = i;
      }
      return { ts: Date.now(), apf: s.apf, inst, online, meta, events: s.events || [], mode: s.mode, alarms: s.alarms || null };
    }
    return { ts: s.ts, apf: s.apf, inst: s.instruments, online: { 'PQ-MAIN': true, 'PQ-LOAD': true, 'PQ-APF': true }, meta: {}, events: s.events, mode: 'demo' };
  };
  const api = async (p, opt = {}) => {
    const g = live(); if (!g) throw new Error('no gateway');
    if (g.bridge) {
      if (p.startsWith('/api/pq/history')) return st.bridgeRing;
      if (p.includes('/files')) return [];
      if (p !== '/api/pq') throw new Error(x('bridgeOnly'));
    }
    const r = g.bridge ? await fetch(g.base + p, { cache: 'no-store', targetAddressSpace: 'loopback' })
      : await fetch(g.base + p, { ...opt, headers: { Authorization: 'Bearer ' + g.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return p.includes('/file?') ? r : r.json();
  };
  // the bridge only serves the latest values: keep a 10-s trend here (same row shape as the gateway ring)
  function bridgeRow(ts) {
    const R = st.bridgeRing, last = R[R.length - 1];
    if (last && ts - last.ts < 10000) return;
    const g = st.snap.inst['PQ-MAIN'] || {}, l = st.snap.inst['PQ-LOAD'] || {}, a = st.snap.inst['PQ-APF'] || {};
    const p1 = (r) => (r.ph && r.ph[0]) || {};
    R.push({ ts, apf: (p1(a).I || 0) > 5, gP: g.P, gS: g.S, gPF: g.PF, gIthd: g.Ithd, gUthd: g.Uthd, gI: p1(g).I, gQ: g.Q, lQ: l.Q, lP: l.P, lS: l.S, lPF: l.PF, lIthd: l.Ithd, lI: p1(l).I, aI: p1(a).I });
    if (R.length > 8640) R.shift();
  }
  // ------------------------------------------------------------ alarms
  function notifyNew() {
    const log = (st.alarms && st.alarms.log) || [];
    for (const ev of log) {
      if (st.alSeen.has(ev.id)) continue;
      st.alSeen.add(ev.id);
      if (ev.end != null || Date.now() - ev.start > 120e3 || st.alarms.demo && ev.sev !== 'alarm') continue;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') continue;
      const { title, body } = alarmText(ev, L());
      const opt = { body, tag: ev.id, icon: './icons/icon-192.png', badge: './icons/icon-192.png', requireInteraction: ev.sev === 'alarm', vibrate: [200, 100, 200] };
      (navigator.serviceWorker && navigator.serviceWorker.ready ? navigator.serviceWorker.ready.then((r) => r.showNotification(title, opt)) : Promise.reject())
        .catch(() => { try { new Notification(title, opt); } catch {} });
    }
  }
  function srcStatus() {
    const t = new Date(st.snap.ts).toLocaleTimeString(L() === 'th' ? 'th-TH' : 'en-GB');
    if (st.src === 'demo') return `<span class="pq-st sim">🧪 ${x('stDemo')}</span>`;
    if (st.src === 'file') return `<span class="pq-st file">📁 ${x('stFile')}${st.file ? ' · ' + esc(st.file.name) : ''}</span>`;
    if (!live()) return `<span class="pq-st off">⚠ ${x('gwNeed')}</span>`;
    if (st.gwErr || st.snap.empty) return `<span class="pq-st off">⚠ ${x('stWait')}</span>`;
    const hosts = ROLES.map((r) => st.snap.meta[r.id]).filter((m) => m && m.host).map((m) => `#${m.no} ${esc(m.host)} ${st.snap.online[m.id] ? '●' : '○'}`).join(' · ');
    return `<span class="pq-st real">📡 ${x('stReal')} · ${hosts || '—'} · ${x('stUpd')} ${t}</span>`;
  }
  function alarmsHtml() {
    const A = st.alarms; if (!A) return '';
    const log = A.log || [], act = log.filter((e) => e.end == null), done = log.filter((e) => e.end != null).slice(0, 25);
    const nA = act.filter((e) => e.sev === 'alarm').length, nW = act.length - nA;
    const t = (ms) => new Date(ms).toLocaleTimeString(L() === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dur = (a, b) => { const s = Math.max(0, Math.round((b - a) / 1000)); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : (s / 3600).toFixed(1) + ' h'; };
    const n = (v) => (v == null ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
    const perm = typeof Notification === 'undefined' ? 'na' : Notification.permission;
    const card = (e) => `<div class="pq-al ${e.sev}"><div class="pq-al-h"><b>${e.sev === 'alarm' ? '🔴' : '🟡'} ${esc(e[L()])}</b><span>${esc(e.devName || e.dev)}${e.host ? ' · ' + esc(e.host) : st.alarms.demo ? ' · ' + x('chipSim') : ''}</span></div>
      <div class="pq-al-v"><b>${n(e.worst)}</b><i>${esc(e.unit || '')}</i><small>${x(e.sev === 'alarm' ? 'alAlarm' : 'alWarn')} ${esc(e.op)} ${n(e.limit)} · ${x('alSince')} ${t(e.start)} (${dur(e.start, Date.now())})</small></div>
      <details data-al-id="${esc(e.id)}" ${st.alOpen.has(e.id) ? 'open' : ''}><summary>${x('alWhy')}</summary>${e.why ? `<p><b>${x('alCause')}</b> ${esc(e.why[L()])}</p>` : ''}${e.act ? `<p><b>${x('alAct')}</b> ${esc(e.act[L()])}</p>` : ''}${e.std ? `<p class="muted">📘 ${esc(e.std)}</p>` : ''}</details></div>`;
    return `<section class="pq-alarms ${nA ? 'has-alarm' : nW ? 'has-warn' : 'ok'}">
      <div class="pq-al-top"><b>🔔 ${x('alTitle')}</b>
        <span class="pill ${nA ? 'bad' : ''}">${nA} ${x('alAlarm')}</span><span class="pill ${nW ? 'warn' : ''}">${nW} ${x('alWarn')}</span>
        ${A.demo ? `<span class="pill">${x('sim')}</span>` : ''}
        <span class="sp"></span>
        ${perm === 'granted' ? `<small class="muted">✓ ${x('alNotiOn')}</small>` : perm === 'na' ? '' : `<button class="btn sm" data-pq="alnoti">🔔 ${x('alNoti')}</button>`}
        <small class="muted">📱 ${A.push ? x('alPushOn') : x('alPushOff')}</small></div>
      ${act.length ? `<div class="pq-al-list">${act.map(card).join('')}</div>` : `<div class="pq-al-ok">✓ ${x('alNone')}</div>`}
      ${done.length ? `<details class="pq-al-hist" ${st.alHist ? 'open' : ''} data-pq-alhist><summary>${x('alHist')} (${done.length})</summary><div class="tscroll"><table class="rtable"><thead><tr><th>${x('evTime')}</th><th>${x('evInst')}</th><th>IP</th><th>${x('evKind')}</th><th>${x('alWorst')}</th><th>${x('evDur')}</th></tr></thead><tbody>${done.map((e) => `<tr><td>${t(e.start)}</td><td>${esc(e.devName || e.dev)}</td><td>${esc(e.host || (st.alarms.demo ? x('chipSim') : '—'))}</td><td>${e.sev === 'alarm' ? '🔴' : '🟡'} ${esc(e[L()])}</td><td class="num">${n(e.worst)} ${esc(e.unit || '')}</td><td class="num">${dur(e.start, e.end)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <small class="muted">ⓘ ${x('alNote')}</small></section>`;
  }
  async function pull() {
    const now = Date.now();
    if (st.src === 'gw' && live()) {
      try {
        st.snap = normalize(await api('/api/pq'), true); st.gwErr = null; st.gwMode = st.snap.mode;
        if (st.bridge) bridgeRow(now);
        if (!st.hist || now - st.histTs > 60000) { st.hist = await api('/api/pq/history?hours=24'); st.histTs = now; }
      } catch (e) {
        st.gwErr = x(st.bridge ? 'bridgeErr' : 'gwErr');
        // "real data" selected but nothing arrives: show empty cards, never the simulation
        st.snap = { ts: now, apf: null, inst: {}, online: {}, meta: {}, events: [], mode: 'live', alarms: null, empty: true };
        st.hist = st.bridgeRing; st.alarms = null;
      }
    }
    if (st.src === 'gw' && !live()) { st.snap = { ts: now, apf: null, inst: {}, online: {}, meta: {}, events: [], mode: 'live', alarms: null, empty: true }; st.hist = []; }
    if (st.src === 'file') { st.snap = { ts: now, apf: null, inst: {}, online: {}, meta: {}, events: [], mode: 'file', alarms: null, empty: true }; st.alarms = null; }
    if (st.src === 'demo') {
      st.snap = normalize(model.snapshot(now), false);
      if (!st.hist || now - st.histTs > 60000 || st.hist._apf !== model.apfOn) {
        st.hist = model.history(now, { hours: 24, stepMin: 5, apfFrom: model.apfOn ? st.apfFromDemo : Infinity });
        st.hist._apf = model.apfOn; st.histTs = now;
      }
    }
    // alarms: from the field tool / gateway when live, otherwise the same rules run here on the demo values
    if (st.snap.alarms) st.alarms = st.snap.alarms;
    else if (st.src === 'demo') {
      for (const r of ROLES) { const d = st.snap.inst[r.id]; if (d) st.alEng.feed(r.id, d, now, { name: `#${r.no} ${r.name}` }); }
      st.alarms = { log: st.alEng.log, push: false, demo: true };
    }
    notifyNew();
    for (const r of ROLES) {
      const d = st.snap.inst[r.id]; if (!d) continue;
      const a = (st.spark[r.id] ||= []); a.push(d.P ?? 0); if (a.length > 90) a.shift();
    }
  }

  // ------------------------------------------------------------ static skeleton (rebuilt only on structural change)
  function skeleton() {
    const srcBtn = (k, ic) => `<button class="pq-src ${st.src === k ? 'on' : ''}" data-pq="src" data-arg="${k}">${ic} ${x('src' + k[0].toUpperCase() + k.slice(1))}</button>`;
    const tabs = ['meas', 'wave', 'phasor', 'harm', 'trend', 'events', 'files'].map((k) => `<button class="pq-tab ${st.tab === k ? 'on' : ''}" data-pq="tab" data-arg="${k}">${x('t' + k[0].toUpperCase() + k.slice(1))}</button>`).join('');
    const modes = `<div class="pq-modes"><button class="${st.mode === 'live' ? 'on' : ''}" data-pq="mode" data-arg="live">📈 ${x('mLive')}</button><button class="${st.mode === 'audit' ? 'on' : ''}" data-pq="mode" data-arg="audit">${x('mAudit')}</button></div>`;
    const hero = `<header class="pq-hero">
      <div class="pq-crest"><svg viewBox="0 0 48 48" width="44" height="44"><circle cx="24" cy="24" r="21" fill="none" stroke="${GOLD}" stroke-width="1.5"/><circle cx="24" cy="24" r="16" fill="none" stroke="${GOLD}" stroke-opacity=".45"/><path d="M5 24h6l3-9 5 18 5-22 5 26 4-13h10" fill="none" stroke="#7DD3FC" stroke-width="2" stroke-linejoin="round"/></svg></div>
      <div class="pq-ttl"><h2>${x('title')}</h2><small>${x('sub')}</small></div>
      ${modes}
      <div class="pq-clock" data-r="clock"></div>
    </header>`;
    const bar = `<section class="pq-srcbar"><span class="pq-srcl">${x('srcLabel')}</span><div class="pq-srcs">${srcBtn('demo', '🧪')}${srcBtn('gw', '📡')}${srcBtn('file', '📁')}</div><div class="pq-srcst" data-r="srcst"></div></section>`;
    if (st.mode === 'audit') return hero + bar + `<div class="pq-audit-host"></div>`;
    return `${hero}${bar}
    <div data-r="notice"></div>
    <div data-r="alarms"></div>
    ${st.guide ? guideHtml() : `<button class="pq-guide-open" data-pq="guide">ⓘ ${x('guideShow')}</button>`}
    <div class="pq-insts" data-r="cards">${ROLES.map(cardShell).join('')}</div>
    <section class="pq-exec" data-r="exec"></section>
    <section class="pq-detail">
      <div class="pq-tabs">${tabs}</div>
      <div class="pq-body">${bodyShell()}</div>
    </section>`;
  }
  function guideHtml() {
    const opt = (n, t, d, tags, rec, bad) => `<div class="pq-ch ${rec ? 'rec' : ''} ${bad ? 'bad' : ''}"><div class="pq-chn">${n}</div><div><b>${t}${rec ? ` <em>${x('ch1b')}</em>` : ''}</b><p>${d}</p>${tags ? `<div class="pq-chtags">${tags.map((k) => `<span>✓ ${x(k)}</span>`).join('')}</div>` : ''}</div></div>`;
    return `<section class="pq-guide"><div class="pq-guide-h"><b>${x('guideT')}</b><button class="pq-x" data-pq="guide">${x('guideHide')}</button></div>
      <div class="pq-topo">${topoSvg()}</div>
      <div class="pq-chs">${opt('1', x('ch1'), x('ch1d'), ['live1', 'files1', 'multi', 'noUnplug'], true)}${opt('2', x('ch2'), x('ch2d'))}${opt('3', x('ch3'), x('ch3d'))}${opt('4', x('ch4'), x('ch4d'), null, false, true)}</div>
      <small class="pq-note">ⓘ ${x('chNote')}</small></section>`;
  }
  function topoSvg() {
    const inst = (y, r) => `<g transform="translate(8,${y})"><rect width="118" height="34" rx="6" fill="#141B2E" stroke="${GOLD}" stroke-opacity=".6"/><rect x="6" y="6" width="34" height="22" rx="2" fill="#0B3B4A"/><path d="M9 20l5-7 5 9 5-11 5 8 6-3" stroke="#7DD3FC" fill="none" stroke-width="1.3"/><text x="46" y="15" fill="#E7ECF7" font-size="9.5" font-weight="700">PW3198 #${r.no}</text><text x="46" y="27" fill="${r.color}" font-size="9">${r.name}</text></g>`;
    const line = (y) => `<path d="M126 ${y + 17} H190 V95 H214" stroke="#38BDF8" stroke-width="2" fill="none" class="pq-flow"/>`;
    return `<svg viewBox="0 0 560 190" class="pq-topo-svg" role="img" aria-label="topology">
      ${line(18)}${line(78)}${line(138)}
      ${ROLES.map((r, k) => inst(18 + k * 60, r)).join('')}
      <g transform="translate(214,78)"><rect width="66" height="34" rx="5" fill="#141B2E" stroke="#38BDF8"/><text x="33" y="15" text-anchor="middle" fill="#E7ECF7" font-size="9.5" font-weight="700">LAN</text><text x="33" y="27" text-anchor="middle" fill="#93A4C8" font-size="8.5">switch</text></g>
      <path d="M280 95 H316" stroke="#38BDF8" stroke-width="2" class="pq-flow"/>
      <g transform="translate(316,70)"><rect width="104" height="50" rx="8" fill="#1B1608" stroke="${GOLD}" stroke-width="1.5"/><text x="52" y="20" text-anchor="middle" fill="${GOLD}" font-size="10.5" font-weight="700">CoreDash</text><text x="52" y="33" text-anchor="middle" fill="#F8E7B0" font-size="9.5">Gateway</text><text x="52" y="44" text-anchor="middle" fill="#93A4C8" font-size="7.5">cmd · FTP · API</text></g>
      <g stroke="#A78BFA" fill="none" stroke-width="1.6"><path d="M432 88 q8 7 0 14"/><path d="M440 82 q14 13 0 26"/><path d="M448 76 q20 19 0 38"/></g>
      <g transform="translate(470,52)"><rect width="46" height="86" rx="9" fill="#0E1733" stroke="#E7ECF7" stroke-opacity=".7"/><rect x="5" y="10" width="36" height="62" rx="2" fill="#081028"/><path d="M8 54 l6-10 6 6 6-16 6 9 6-6" stroke="#22C55E" fill="none" stroke-width="1.4"/><circle cx="23" cy="78" r="3" fill="#E7ECF7" fill-opacity=".6"/></g>
      <text x="493" y="156" text-anchor="middle" fill="#93A4C8" font-size="9">Wi-Fi / 4G</text>
      <text x="160" y="184" text-anchor="middle" fill="#64748B" font-size="8.5">Ethernet · fixed IP · FTP/HTTP auth ON</text>
    </svg>`;
  }
  function cardShell(r) {
    const ticks = [];
    for (let k = 0; k <= 10; k++) { const a = (-120 + k * 24) * Math.PI / 180; const r1 = k % 5 === 0 ? 31 : 34; ticks.push(`<line x1="${50 + 38 * Math.sin(a)}" y1="${54 - 38 * Math.cos(a)}" x2="${50 + r1 * Math.sin(a)}" y2="${54 - r1 * Math.cos(a)}" stroke="#2A2116" stroke-width="${k % 5 === 0 ? 1.8 : 1}"/>`); }
    const lab = [[-120, '0.5'], [-72, '0.7'], [-24, '0.85'], [24, '0.95'], [120, '1.0']].map(([d, s]) => { const a = d * Math.PI / 180; return `<text x="${50 + 24 * Math.sin(a)}" y="${57 - 24 * Math.cos(a)}" font-size="6.5" text-anchor="middle" fill="#2A2116">${s}</text>`; }).join('');
    // coloured zones on the dial: red < 0.85, amber 0.85–0.9, green ≥ 0.9  (scale position of a PF value: see pfAngle)
    const arc = (p0, p1, c) => { const a0 = pfAngle(p0) * Math.PI / 180, a1 = pfAngle(p1) * Math.PI / 180; return `<path d="M${50 + 41 * Math.sin(a0)} ${54 - 41 * Math.cos(a0)} A41 41 0 0 1 ${50 + 41 * Math.sin(a1)} ${54 - 41 * Math.cos(a1)}" stroke="${c}" stroke-width="3.2" fill="none"/>`; };
    return `<article class="pq-card ${st.sel === r.id ? 'sel' : ''}" data-pq="sel" data-arg="${r.id}" style="--rc:${r.color}">
      <div class="pq-card-h"><span class="pq-led" data-b="${r.id}.led"></span><b>#${r.no} ${r.name}</b><span class="pq-chip" data-b="${r.id}.chip"></span></div>
      <small class="pq-card-sub">${esc(L() === 'th' ? r.nameTh : r.name)}</small>
      <div class="pq-card-b">
        <svg class="pq-gauge" viewBox="0 0 100 80"><defs><radialGradient id="ivory-${r.id}" cx="50%" cy="80%" r="80%"><stop offset="0" stop-color="#FFF8E6"/><stop offset="1" stop-color="#E8DCC0"/></radialGradient><linearGradient id="brass-${r.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D99A"/><stop offset=".5" stop-color="#9C7A36"/><stop offset="1" stop-color="#E9C77E"/></linearGradient></defs>
          <path d="M4 66 A46 46 0 1 1 96 66 Z" fill="url(#brass-${r.id})"/><path d="M8 64 A42 42 0 1 1 92 64 Z" fill="url(#ivory-${r.id})"/>
          ${arc(0.5, 0.85, '#C2410C')}${arc(0.85, 0.9, '#B45309')}${arc(0.9, 1, '#15803D')}${ticks.join('')}${lab}
          <text x="50" y="40" font-size="6" text-anchor="middle" fill="#6B5A3A" letter-spacing=".6">POWER FACTOR</text>
          <g class="pq-needle" data-needle="${r.id}" style="transform:rotate(-120deg)"><path d="M50 56 L49 20 L50 14 L51 20 Z" fill="#B91C1C"/></g>
          <circle cx="50" cy="54" r="4.2" fill="url(#brass-${r.id})" stroke="#5B4520" stroke-width=".6"/>
          <text x="50" y="77" font-size="7.6" text-anchor="middle" fill="#F3D99A" font-weight="700" letter-spacing=".4" data-b="${r.id}.pfTxt">—</text></svg>
        <div class="pq-nums">
          <div class="pq-big"><span data-b="${r.id}.P">—</span><i>kW</i></div>
          <div class="pq-mini"><span>${x('kva')}</span><p><b data-b="${r.id}.S">—</b><i>kVA</i></p></div>
          <div class="pq-mini"><span>${x('amp')}</span><p><b data-b="${r.id}.I">—</b><i>A</i></p></div>
          <div class="pq-mini"><span>THD-I</span><p><b data-b="${r.id}.Ithd">—</b><i>%</i></p></div>
          <div class="pq-mini"><span>THD-U</span><p><b data-b="${r.id}.Uthd">—</b><i>%</i></p></div>
        </div>
      </div>
      <svg class="pq-spark" viewBox="0 0 200 30" preserveAspectRatio="none"><path data-spark="${r.id}" d="" fill="none" stroke="${r.color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="pq-card-f"><span data-b="${r.id}.f">— Hz</span><span data-b="${r.id}.host"></span></div>
    </article>`;
  }
  function bodyShell() {
    const ph = (k) => `<button class="chip ${st.hp === k ? 'on' : ''}" data-pq="hp" data-arg="${k}">L${k + 1}</button>`;
    switch (st.tab) {
      case 'meas': return `<div data-r="meas"></div>`;
      case 'wave': return `<div class="pq-scope"><canvas class="pq-cv" data-cv="wave"></canvas></div><div class="pq-legend">${legendPh()}<span class="muted">${x('waveNote')} · ${x('cycles')}</span></div>`;
      case 'phasor': return `<div class="pq-phasor"><div class="pq-scope sq"><canvas class="pq-cv" data-cv="phasor"></canvas></div><div data-r="phtab"></div></div>`;
      case 'harm': return `<div class="pq-hbar"><span class="dbtns"><button class="chip ${st.hk === 'I' ? 'on' : ''}" data-pq="hk" data-arg="I">${x('hI')}</button><button class="chip ${st.hk === 'U' ? 'on' : ''}" data-pq="hk" data-arg="U">${x('hU')}</button></span><span class="dbtns">${ph(0)}${ph(1)}${ph(2)}</span><span class="muted" data-r="hsum"></span></div><div class="pq-scope"><canvas class="pq-cv" data-cv="harm"></canvas></div><small class="muted">${st.hk === 'I' ? x('limitI') : x('limitU')}</small>`;
      case 'trend': return `<div class="pq-scope tall"><canvas class="pq-cv" data-cv="trend"></canvas></div><small class="muted">${x('trendHint')}</small>`;
      case 'events': return `<div class="pq-ev"><div class="pq-scope"><canvas class="pq-cv" data-cv="itic"></canvas></div><small class="muted">${x('evHint')}</small><div data-r="evtab"></div></div>`;
      case 'files': return filesHtml();
    }
    return '';
  }
  const legendPh = () => PH.map((c, k) => `<span><i style="background:${c}"></i>L${k + 1}</span>`).join('') + `<span><i style="background:#94A3B8;height:2px"></i>U</span><span><i style="background:#94A3B8;height:2px;border-top:1px dashed #94A3B8;background:none"></i>I</span>`;
  function filesHtml() {
    const g = live() && st.src === 'gw';
    const rows = (st.files || []).map((f) => `<tr><td>${f.dir ? '📁' : '📄'} ${esc(f.name)}</td><td class="num">${f.dir ? '' : (f.size / 1e6).toFixed(2) + ' MB'}</td><td class="muted">${esc(f.date || '')}</td><td>${f.dir ? '' : `<button class="btn sm" data-pq="fplot" data-arg="${esc(f.path)}">📈 ${x('plot')}</button> <button class="btn sm" data-pq="fdl" data-arg="${esc(f.path)}">⬇</button>`}</td></tr>`).join('');
    return `<div class="pq-files">
      <div class="pq-drop" data-pq-drop><b>▤ ${x('imp')}</b><small>${x('impHint')}</small>
        <div class="pq-drop-btns"><label class="btn sm"><input type="file" multiple accept=".csv,.txt,.CSV,.TXT,text/csv,text/plain" data-pq-file hidden>📄 ${x('impFiles')}</label><label class="btn sm"><input type="file" webkitdirectory directory multiple data-pq-file hidden>📁 ${x('impFolder')}</label></div>
        <small>${x('impDrop')}</small></div>
      ${st.imports.length ? `<div class="pq-imps"><small class="muted">${x('impDone')}${st.importFrom ? ' · ' + x('impFrom') : ''}${st.importSkipped ? ` · ${st.importSkipped} ${x('impSkip')}` : ''}</small><div class="pq-chips">${st.imports.map((f, i) => `<button class="chip ${st.file === f ? 'on' : ''}" data-pq="fpick" data-arg="${i}">${esc(f.name)} · ${f.n.toLocaleString()}</button>`).join('')}</div></div>` : ''}
      <small class="muted">ⓘ ${x('binNote')}</small>
      <div class="pq-ftp"><div class="row"><b>${x('ftpT')} · #${roleOf(st.sel).no} ${roleOf(st.sel).name}</b>${g ? '' : `<span class="pill">${x('sim')}</span>`}</div>
        <table class="rtable"><tbody>${rows || `<tr><td class="muted">…</td></tr>`}</tbody></table></div>
      <div data-r="fileview"></div>
      <button class="btn" data-pq="export">⬇ ${x('exportCsv')}</button>
    </div>`;
  }
  const roleOf = (id) => ROLES.find((r) => r.id === id) || ROLES[0];

  // ------------------------------------------------------------ dynamic regions
  function region(name, html) { const r = el.querySelector(`[data-r="${name}"]`); if (r && r.__h !== html) { r.innerHTML = html; r.__h = html; } }
  function bindAll() {
    const s = st.snap; if (!s) return;
    const set = (k, v) => { const n = el.querySelector(`[data-b="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    for (const r of ROLES) {
      const d = s.inst[r.id], on = s.online[r.id] && d;
      const led = el.querySelector(`[data-b="${r.id}.led"]`); if (led) led.className = 'pq-led ' + (on ? (s.mode === 'live' ? 'live' : 'sim') : 'off');
      if (!d) { set(r.id + '.P', '—'); continue; }
      const Iavg = d.ph && d.ph.every((p) => p.I != null) ? (d.ph[0].I + d.ph[1].I + d.ph[2].I) / 3 : null;
      set(r.id + '.P', r.role === 'apf' ? fmt(d.Q != null ? -d.Q : null, 0) : fmtN(d.P, 0));
      if (r.role === 'apf') { const big = el.querySelector(`[data-b="${r.id}.P"]`); if (big) big.nextElementSibling.textContent = 'kvar'; }
      set(r.id + '.S', fmtN(d.S, 0)); set(r.id + '.I', fmtN(Iavg, 0));
      set(r.id + '.Ithd', r.role === 'apf' ? '—' : fmt(d.Ithd, 1)); set(r.id + '.Uthd', fmt(d.Uthd, 2));
      set(r.id + '.f', `${fmt(d.f, 2)} Hz · U ${fmt(d.Uavg, 1)} V`);
      const meta = s.meta[r.id]; set(r.id + '.host', meta && meta.host ? meta.host : s.mode === 'demo' ? 'demo' : '');
      const pf = r.role === 'apf' ? (s.apf ? Math.min(1, (Iavg || 0) / (s.apf.ratingA || 600)) : 0) : d.PF;
      const nd = el.querySelector(`[data-needle="${r.id}"]`);
      if (nd) nd.style.transform = `rotate(${r.role === 'apf' ? -120 + 240 * clamp(pf, 0, 1) : pfAngle(pf)}deg)`;
      set(r.id + '.pfTxt', r.role === 'apf' ? `${x('apfLoad')} ${fmt(pf * 100, 0)}%` : `PF ${fmt(d.PF, 3)}`);
      const sp = el.querySelector(`[data-spark="${r.id}"]`), a = st.spark[r.id] || [];
      if (sp && a.length > 1) { const lo = Math.min(...a), hi = Math.max(...a), span = Math.max(1e-6, hi - lo); sp.setAttribute('d', a.map((v, k) => `${k ? 'L' : 'M'}${(k / 89 * 200).toFixed(1)} ${(27 - (v - lo) / span * 24).toFixed(1)}`).join('')); }
    }
    region('clock', `<span class="pq-led ${s.mode === 'live' ? 'live' : st.src === 'file' ? 'off' : 'sim'}"></span>${s.mode === 'live' ? x('live') : x('sim')} · ${new Date(s.ts).toLocaleTimeString(L() === 'th' ? 'th-TH' : 'en-GB')}`);
    const nv = st.src === 'gw' && live() && !st.gwErr && Object.values(s.inst || {}).some((d) => d && d.live && d.noVoltage);
    region('alarms', alarmsHtml());
    region('srcst', srcStatus());
    for (const r of ROLES) {
      const chip = el.querySelector(`[data-b="${r.id}.chip"]`); if (!chip) continue;
      const host = s.meta && s.meta[r.id] && s.meta[r.id].host, real = st.src === 'gw' && live() && !st.gwErr;
      const txt = st.src === 'demo' ? x('chipSim') : st.src === 'file' ? x('srcFile') : real && host && s.online[r.id] ? '● ' + host : host ? host + ' · ' + x('chipOff') : x('chipOff');
      const cls = 'pq-chip ' + (st.src === 'demo' ? 'sim' : st.src === 'file' ? 'file' : real && s.online[r.id] ? 'real' : 'off');
      if (chip.textContent !== txt) chip.textContent = txt; if (chip.className !== cls) chip.className = cls;
    }
    region('notice', nv ? `<div class="pq-notice bad">${x('noVolt')}</div>` : '');
    region('exec', execHtml());
    if (st.tab === 'meas') region('meas', measHtml());
    if (st.tab === 'phasor') region('phtab', phasorTable());
    if (st.tab === 'events') region('evtab', eventsTable());
    if (st.tab === 'harm') region('hsum', harmSummary());
    if (st.tab === 'files') region('fileview', fileView());
  }
  function execHtml() {
    const s = st.snap, g = s.inst['PQ-MAIN'], l = s.inst['PQ-LOAD'], a = s.inst['PQ-APF'];
    if (!g || !l) return '';
    const Ig = g.ph.reduce((q, p) => q + p.I, 0) / 3, Il = l.ph.reduce((q, p) => q + p.I, 0) / 3;
    const ihG = g.ph.reduce((q, p) => q + p.I * (p.Ithd / 100) / Math.sqrt(1 + (p.Ithd / 100) ** 2), 0), ihL = l.ph.reduce((q, p) => q + p.I * (p.Ithd / 100) / Math.sqrt(1 + (p.Ithd / 100) ** 2), 0);
    const hRed = ihL > 0 ? (1 - ihG / ihL) * 100 : 0, curRed = Il > 0 ? (1 - Ig / Il) * 100 : 0, lossRed = Il > 0 ? (1 - (Ig / Il) ** 2) * 100 : 0;
    const ac = apfCase(st.snap, st.hist, ASSUME, TARIFF);
    const save = ac ? ac.total : 0;
    const cmp = (lab, va, vb, u, d, good) => { const better = good === 'down' ? vb < va : vb > va; return `<div class="pq-cmp"><small>${lab}</small><div><span class="was">${fmt(va, d)}</span><span class="arr">→</span><b class="${Math.abs(vb - va) < 1e-9 ? '' : better ? 'good' : 'bad'}">${fmt(vb, d)}</b><i>${u}</i></div></div>`; };
    const sim = s.mode !== 'live' && s.apf;
    return `<div class="pq-exec-h"><div><b>${x('exec')}</b><small>${x('execSub')}</small></div>
      ${sim ? `<div class="pq-apfsw"><button class="pq-power ${s.apf.on ? 'on' : ''}" data-pq="apf" aria-pressed="${s.apf.on}"><span></span>${s.apf.on ? x('apfOn') : x('apfOff')}</button><label><input type="checkbox" data-pq-react ${s.apf.reactive ? 'checked' : ''}> ${x('apfReact')}</label></div>` : ''}</div>
      <div class="pq-cmps">${cmp('THD-I', l.Ithd, g.Ithd, '%', 1, 'down')}${cmp('PF', l.PF, g.PF, '', 3, 'up')}${cmp('cos φ', l.cos, g.cos, '', 3, 'up')}${cmp('S', l.S, g.S, 'kVA', 0, 'down')}${cmp('Q', l.Q, g.Q, 'kvar', 0, 'down')}${cmp('I', Il, Ig, 'A', 0, 'down')}${cmp('THD-U', l.Uthd, g.Uthd, '%', 2, 'down')}${cmp('K-factor', l.KF, g.KF, '', 2, 'down')}</div>
      <div class="pq-kpis">
        <div><small>${x('hRed')}</small><b class="good">${fmt(hRed, 0)}%</b></div>
        <div><small>${x('curRed')}</small><b>${fmt(curRed, 0)}%</b><span>${fmt(Il - Ig, 0)} A</span></div>
        <div><small>${x('kvaRel')}</small><b>${fmt(l.S - g.S, 0)} kVA</b></div>
        <div><small>${x('lossRed')}</small><b>${fmt(lossRed, 0)}%</b></div>
        <div class="pq-hl ${save < 0 ? 'neg' : ''}"><small>${x('net')}</small><b class="${save < 0 ? 'bad' : 'good'}">${save < 0 ? '−' : ''}฿${fmtN(Math.abs(save), 0)}</b><span>${x('perM')}</span><button class="pq-why" data-pq="audit">${x('why')}</button></div>
      </div>
      <small class="pq-note">${x('saveNote')}${sim ? ' · ' + x('apfNote') : ''}${a ? '' : ''}</small>`;
  }
  function measHtml() {
    const d = st.snap.inst[st.sel], r = roleOf(st.sel); if (!d) return `<div class="muted">—</div>`;
    const row = (lab, f, u, dg = 1, tot) => `<tr><th>${lab}</th>${d.ph.map((p) => `<td class="num">${fmt(f(p), dg)}</td>`).join('')}<td class="num tot">${tot == null ? '' : fmt(tot, dg)}</td><td class="u">${u}</td></tr>`;
    return `<div class="pq-lcd"><div class="pq-lcd-h"><b>#${r.no} ${r.name}</b><span>3P4W · 230/400 V · 50 Hz</span><span>${new Date(st.snap.ts).toLocaleTimeString('en-GB')}</span></div>
      <table><thead><tr><th></th>${[1, 2, 3].map((k) => `<th style="color:${PH[k - 1]}">L${k}</th>`).join('')}<th>${x('total')}</th><th></th></tr></thead><tbody>
      ${row('Urms', (p) => p.U, 'V', 2, d.Uavg)}${row('Irms', (p) => p.I, 'A', 1, d.IN != null ? null : null)}${row('P', (p) => p.P / 1000, 'kW', 2, d.P)}${row('Q', (p) => p.Q / 1000, 'kvar', 2, d.Q)}${row('S', (p) => p.S / 1000, 'kVA', 2, d.S)}${row('PF', (p) => p.PF, '', 3, d.PF)}${row('cos φ', (p) => p.cos, '', 3, d.cos)}${row('THD-U', (p) => p.Uthd, '%', 2, d.Uthd)}${row('THD-I', (p) => Math.min(p.Ithd, 999), '%', 1, d.Ithd)}${row('KF', (p) => p.KF, '', 2, d.KF)}
      </tbody></table>
      <div class="pq-lcd-f"><span>${x('freq')} <b>${fmt(d.f, 3)}</b> Hz</span><span>${x('unb')} <b>${fmt(d.unb, 2)}</b> %</span><span>${x('neutral')} <b>${fmt(d.IN, 1)}</b> A</span><span>${x('wp')} <b>${fmtN(d.WP, 1)}</b> kWh</span></div></div>`;
  }
  function phasorTable() {
    const d = st.snap.inst[st.sel]; if (!d) return '';
    return `<table class="rtable"><thead><tr><th></th><th>U</th><th>∠U</th><th>I</th><th>∠I</th><th>φ</th></tr></thead><tbody>${d.ph.map((p, k) => `<tr><td style="color:${PH[k]}"><b>L${k + 1}</b></td><td class="num">${fmt(p.U1 ?? p.U, 1)}</td><td class="num">${fmt(p.Uang, 1)}°</td><td class="num">${fmt(p.I1 ?? p.I, 1)}</td><td class="num">${fmt(p.Iang, 1)}°</td><td class="num">${p.Uang != null && p.Iang != null ? fmt(((p.Uang - p.Iang + 540) % 360) - 180, 1) + '°' : '—'}</td></tr>`).join('')}</tbody></table>`;
  }
  function harmSummary() {
    const p = (st.snap.inst[st.sel] || {}).ph?.[st.hp]; if (!p) return '';
    const mags = st.hk === 'U' ? p.uh : p.ih; if (!mags) return '';
    const f = mags[0] || 1, lim = st.hk === 'U' ? limU : limI;
    const bad = []; for (let h = 2; h <= mags.length; h++) if (mags[h - 1] / f * 100 > lim(h)) bad.push(h);
    return `THD ${fmt(st.hk === 'U' ? p.Uthd : p.Ithd, 1)}% · ${bad.length ? `<b class="bad">${x('over')}: ${bad.slice(0, 8).map((h) => 'H' + h).join(', ')}</b>` : `<b class="good">${x('within')}</b>`}`;
  }
  function eventsTable() {
    const ev = (st.snap.events || []).slice().sort((a, b) => b.ts - a.ts);
    return `<div class="tscroll"><table class="rtable"><thead><tr><th>${x('evTime')}</th><th>${x('evKind')}</th><th>${x('evInst')}</th><th>${x('evCh')}</th><th>${x('evMag')}</th><th>${x('evDur')}</th><th>${x('evRes')}</th></tr></thead><tbody>${ev.map((e) => { const v = iticVerdict(e.mag * 100, e.ms); return `<tr><td>${new Date(e.ts).toLocaleString(L() === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</td><td>${esc(e[L()])}</td><td>#${roleOf(e.inst).no}</td><td>${e.ch}</td><td class="num">${fmt(e.mag * 100, 0)}%</td><td class="num">${e.ms < 1 ? fmt(e.ms * 1000, 0) + ' µs' : fmt(e.ms, 0) + ' ms'}</td><td><span class="pill ${v === 'ok' ? 'run' : 'bad'}">${v === 'ok' ? x('ok') : x('out')}</span></td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------ files
  function parseCsv(text, name) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const delim = [',', ';', '\t'].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    let hi = 0; // header row: the last row before data where most cells are not numbers
    for (let k = 0; k < Math.min(40, lines.length - 1); k++) { const c = split(lines[k]); const nonNum = c.filter((v) => v && !Number.isFinite(Number(v))).length; const next = split(lines[k + 1]); const nextNum = next.filter((v) => Number.isFinite(Number(v)) && v !== '').length; if (nonNum >= 2 && nextNum >= 1) { hi = k; break; } }
    const head = split(lines[hi]);
    const data = lines.slice(hi + 1).map(split).filter((r) => r.length >= head.length - 1);
    const di = head.findIndex((h) => /date|วันที่/i.test(h)), ti = head.findIndex((h) => /time|เวลา/i.test(h) && !/date/i.test(h));
    const tsOf = (r) => { const s = di >= 0 && ti >= 0 && di !== ti ? `${r[di]} ${r[ti]}` : r[ti >= 0 ? ti : di >= 0 ? di : 0]; const t = Date.parse(String(s).replace(/\//g, '-').replace(' ', 'T')); return Number.isFinite(t) ? t : null; };
    const cols = head.map((h, c) => ({ h: h || 'C' + (c + 1), c })).filter(({ c }) => c !== di && c !== ti && data.slice(0, 20).every((r) => r[c] === '' || Number.isFinite(Number(r[c]))) && data.some((r) => r[c] !== ''));
    if (!cols.length) return null;
    const ts = data.map((r, k) => tsOf(r) ?? k);
    const vals = Object.fromEntries(cols.map(({ h, c }) => [h, data.map((r) => (r[c] === '' ? null : Number(r[c])))]));
    const pref = cols.map((c) => c.h).filter((h) => /^P|THD|PF|I1|U1/i.test(h));
    return { name, ts, vals, cols: cols.map((c) => c.h), n: data.length, timeAxis: ts.some((t) => t > 1e9) };
  }
  function fileView() {
    const f = st.file; if (!f) return `<div class="muted pq-empty">${x('noFile')}</div>`;
    const chips = f.cols.map((h) => `<button class="chip ${st.fileCols.includes(h) ? 'on' : ''}" data-pq="fcol" data-arg="${esc(h)}">${esc(h)}</button>`).join('');
    const stats = st.fileCols.map((h) => { const a = f.vals[h].filter((v) => v != null).sort((p, q) => p - q); if (!a.length) return ''; const avg = a.reduce((p, q) => p + q, 0) / a.length; return `<tr><td><b>${esc(h)}</b></td><td class="num">${fmt(a[0], 3)}</td><td class="num">${fmt(avg, 3)}</td><td class="num">${fmt(a[a.length - 1], 3)}</td><td class="num">${fmt(a[Math.floor(a.length * 0.95)], 3)}</td></tr>`; }).join('');
    return `<div class="pq-fv"><div class="row"><b>▤ ${esc(f.name)}</b><span class="muted">${f.n.toLocaleString()} ${x('rows')}</span></div>
      <small class="muted">${x('cols')}</small><div class="pq-chips">${chips}</div>
      <div class="pq-scope tall"><canvas class="pq-cv" data-cv="file"></canvas></div>
      ${stats ? `<table class="rtable"><thead><tr><th>${x('stat')}</th><th>${x('min')}</th><th>${x('avg')}</th><th>${x('max')}</th><th>${x('p95')}</th></tr></thead><tbody>${stats}</tbody></table>` : ''}</div>`;
  }
  async function loadFiles() {
    try {
      if (st.src === 'gw' && live() && !st.gwErr) st.files = await api(`/api/pq/${st.sel}/files?dir=/`);
      else { const d = new Date(); st.files = [0, 1, 2].map((k) => { const t = new Date(d - k * 864e5); const ymd = t.toISOString().slice(2, 10).replace(/-/g, ''); return { name: `CD${ymd}.CSV`, size: 1.9e6 - k * 1e5, date: t.toISOString().slice(0, 10), path: `demo:${k}` }; }); }
    } catch { st.files = []; }
    if (st.tab === 'files') rebuild(true);
  }
  function demoCsv() {
    const rows = st.hist || [], r = roleOf(st.sel);
    const pick = (q) => (r.role === 'load' ? [q.lP, q.lS, q.lPF, q.lIthd, q.lI] : r.role === 'apf' ? [0, 0, 0, 0, q.aI] : [q.gP, q.gS, q.gPF, q.gIthd, q.gI]);
    return 'Date,Time,P_sum[kW],S_sum[kVA],PF_sum,Ithd_max[%],I1rms[A],Uthd_max[%]\n' + rows.map((q) => { const t = new Date(q.ts); const [P, S, PF, It, I] = pick(q); return [t.toISOString().slice(0, 10), t.toTimeString().slice(0, 8), P.toFixed(1), S.toFixed(1), PF.toFixed(3), It.toFixed(2), I.toFixed(1), q.gUthd.toFixed(2)].join(','); }).join('\n');
  }
  async function plotRemote(p, download) {
    try {
      let text;
      if (p.startsWith('demo:')) text = demoCsv();
      else { const r = await api(`/api/pq/${st.sel}/file?path=${encodeURIComponent(p)}`); if (download) { saveBlob(await r.blob(), p.split('/').pop()); return; } text = await r.text(); }
      if (download) { saveBlob(new Blob([text], { type: 'text/csv' }), (st.files.find((f) => f.path === p) || {}).name || 'pq.csv'); return; }
      useFile(text, (st.files.find((f) => f.path === p) || {}).name || p);
    } catch (e) { onToast(e.message, true); }
  }
  function useFile(text, name) {
    const f = parseCsv(text, name);
    if (!f) { onToast(x('fileBad'), true); return; }
    st.file = f; st.fileCols = f.cols.filter((h) => /P_?sum|^P\b|PF|THD|Ithd/i.test(h)).slice(0, 3);
    if (!st.fileCols.length) st.fileCols = f.cols.slice(0, 2);
    st.tab = 'files'; rebuild(true);
  }
  // several files at once: CSV/TXT are parsed, files with the same columns are joined in time order, raw binaries are counted
  const decode = (buf) => { let t = new TextDecoder('utf-8').decode(buf); if (t.includes('\uFFFD')) t = new TextDecoder('windows-874').decode(buf); return t; };
  function useTexts(list, fromTool) {
    const parsed = [], groups = new Map(); let skipped = 0;
    for (const { name, text } of list) {
      if (!/\.(csv|txt)$/i.test(name)) { skipped++; continue; }
      const f = parseCsv(text, name); if (!f) { skipped++; continue; }
      const key = f.cols.join('|'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f);
    }
    for (const g of groups.values()) {
      if (g.length === 1) { parsed.push(g[0]); continue; }
      const rows = [];
      for (const f of g) for (let i = 0; i < f.n; i++) rows.push([f.ts[i], ...f.cols.map((c) => f.vals[c][i])]);
      rows.sort((a, b) => a[0] - b[0]);
      const cols = g[0].cols;
      parsed.push({ name: `${x('impMerged')} ${g.length} · ${g[0].name}…`, ts: rows.map((r) => r[0]), vals: Object.fromEntries(cols.map((c, k) => [c, rows.map((r) => r[k + 1])])), cols, n: rows.length, timeAxis: g.every((f) => f.timeAxis) });
    }
    st.importSkipped = skipped; st.importFrom = !!fromTool;
    if (!parsed.length) { onToast(skipped ? `${skipped} ${x('impSkip')}` : x('fileBad'), true); st.imports = []; st.mode = 'live'; st.tab = 'files'; rebuild(true); return; }
    st.imports = parsed; st.mode = 'live'; st.src = 'file';
    useParsed(parsed[0]);
  }
  function useParsed(f) {
    st.file = f; st.fileCols = f.cols.filter((h) => /P_?sum|^P\b|PF|THD|Ithd/i.test(h)).slice(0, 3);
    if (!st.fileCols.length) st.fileCols = f.cols.slice(0, 2);
    st.tab = 'files'; rebuild(true);
  }
  async function readEntries(items) {
    const out = [];
    const walk = async (entry, path) => {
      if (!entry) return;
      if (entry.isFile) { const file = await new Promise((res, rej) => entry.file(res, rej)); out.push({ name: path + file.name, file }); }
      else if (entry.isDirectory) { const r = entry.createReader(); let batch; do { batch = await new Promise((res, rej) => r.readEntries(res, rej)); for (const e of batch) await walk(e, path + entry.name + '/'); } while (batch.length); }
    };
    for (const it of items) await walk(it.webkitGetAsEntry && it.webkitGetAsEntry(), '');
    return out;
  }
  async function importFiles(files, fromTool) {
    const list = [];
    for (const { name, file } of files.slice(0, 200)) list.push({ name, text: /\.(csv|txt)$/i.test(name) && file.size < 60e6 ? decode(await file.arrayBuffer()) : '' });
    useTexts(list, fromTool);
  }
  // hand-off from the PW3198 LAN tool (menu 4): it serves the dump folder on http://127.0.0.1:<port>
  async function importFromTool(base) {
    onToast(x('impWait'));
    try {
      const idx = await (await fetch(base + '/files.json', { targetAddressSpace: 'loopback' })).json();
      const list = [];
      for (const f of idx.files.slice(0, 200)) {
        if (!/\.(csv|txt)$/i.test(f.name)) { list.push({ name: f.name, text: '' }); continue; }
        list.push({ name: f.name, text: decode(await (await fetch(`${base}/f/${f.i}`, { targetAddressSpace: 'loopback' })).arrayBuffer()) });
      }
      useTexts(list, true);
    } catch (e) { st.mode = 'live'; st.tab = 'files'; rebuild(true); onToast(x('impFail'), true); }
  }
  function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportNow() {
    const s = st.snap; const lines = ['instrument,phase,U[V],I[A],P[kW],Q[kvar],S[kVA],PF,cos_phi,THD_U[%],THD_I[%],K_factor'];
    for (const r of ROLES) { const d = s.inst[r.id]; if (!d) continue; d.ph.forEach((p, k) => lines.push([`#${r.no} ${r.name}`, 'L' + (k + 1), fmt(p.U, 2), fmt(p.I, 1), fmt(p.P / 1000, 2), fmt(p.Q / 1000, 2), fmt(p.S / 1000, 2), fmt(p.PF, 3), fmt(p.cos, 3), fmt(p.Uthd, 2), fmt(p.Ithd, 2), fmt(p.KF, 2)].join(','))); }
    saveBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }), `CoreDash-PQ-${new Date(s.ts).toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`);
  }

  // ------------------------------------------------------------ canvas drawing
  function canvas(name) {
    const c = el.querySelector(`[data-cv="${name}"]`); if (!c) return null;
    const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h, c };
  }
  function grid(g, x0, y0, w, h, nx, ny) {
    g.strokeStyle = 'rgba(125,211,252,.09)'; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i <= nx; i++) { const xx = Math.round(x0 + w * i / nx) + 0.5; g.moveTo(xx, y0); g.lineTo(xx, y0 + h); }
    for (let i = 0; i <= ny; i++) { const yy = Math.round(y0 + h * i / ny) + 0.5; g.moveTo(x0, yy); g.lineTo(x0 + w, yy); }
    g.stroke();
  }
  function drawWave(now) {
    const k = canvas('wave'); const d = st.snap?.inst[st.sel]; if (!k || !d) return;
    const { g, w, h } = k; const pad = 34, half = (h - 20) / 2;
    const shift = (now / 1000 * 0.25) % 1;
    const N = Math.max(200, Math.round(w));
    const series = (kind) => d.ph.map((p) => { const sp = spectrumOf(p, kind).map(([o, [m, a]]) => [o, [m, a - o * 360 * shift]]); return waveform(sp, N, 2); });
    const U = series('U'), I = series('I');
    const peak = (arr) => Math.max(1e-6, ...arr.map((a) => Math.max(...a.map(Math.abs))));
    const pu = peak(U) * 1.12, pi = peak(I) * 1.12;
    const panel = (y0, arrs, pk, unit, dash) => {
      grid(g, pad, y0, w - pad - 8, half - 6, 8, 4);
      g.fillStyle = '#64748B'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'right';
      g.fillText(`+${Math.round(pk)} ${unit}`, pad - 4, y0 + 10); g.fillText(`−${Math.round(pk)}`, pad - 4, y0 + half - 8);
      arrs.forEach((a, ph) => {
        g.strokeStyle = PH[ph]; g.lineWidth = 1.8; g.shadowColor = PH[ph]; g.shadowBlur = 6; g.setLineDash(dash ? [5, 3] : []);
        g.beginPath(); for (let s = 0; s < a.length; s++) { const xx = pad + (w - pad - 8) * s / (a.length - 1), yy = y0 + (half - 6) / 2 - a[s] / pk * (half - 6) / 2; s ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
      });
      g.shadowBlur = 0; g.setLineDash([]);
    };
    panel(6, U, pu, 'V', false); panel(10 + half, I, pi, 'A', true);
    g.fillStyle = 'rgba(212,176,106,.85)'; g.textAlign = 'left'; g.font = '600 11px Space Grotesk, sans-serif';
    g.fillText(`U · THD ${fmt(d.Uthd, 1)}%`, pad + 60, 20); g.fillText(`I · THD ${fmt(d.Ithd, 1)}%`, pad + 60, 24 + half);
  }
  function drawPhasor() {
    const k = canvas('phasor'); const d = st.snap?.inst[st.sel]; if (!k || !d) return;
    const { g, w, h } = k, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 22;
    g.strokeStyle = 'rgba(212,176,106,.35)'; g.lineWidth = 1;
    for (const f of [1, 0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, R * f, 0, 7); g.stroke(); }
    g.strokeStyle = 'rgba(125,211,252,.12)';
    for (let a = 0; a < 360; a += 30) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(a * Math.PI / 180), cy - R * Math.sin(a * Math.PI / 180)); g.stroke(); }
    g.fillStyle = '#64748B'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'center';
    for (const a of [0, 90, 180, 270]) g.fillText(a + '°', cx + (R + 12) * Math.cos(a * Math.PI / 180), cy - (R + 12) * Math.sin(a * Math.PI / 180) + 3);
    const mu = Math.max(...d.ph.map((p) => p.U1 ?? p.U)), mi = Math.max(1e-6, ...d.ph.map((p) => p.I1 ?? p.I));
    const arrow = (ang, len, col, lw, dash, lab) => {
      const a = ang * Math.PI / 180, x2 = cx + len * Math.cos(a), y2 = cy - len * Math.sin(a);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.setLineDash(dash ? [5, 3] : []); g.shadowColor = col; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 9 * Math.cos(a - 0.35), y2 + 9 * Math.sin(a - 0.35)); g.lineTo(x2 - 9 * Math.cos(a + 0.35), y2 + 9 * Math.sin(a + 0.35)); g.fill(); g.shadowBlur = 0;
      g.font = '600 11px Space Grotesk, sans-serif'; g.fillText(lab, x2 + 12 * Math.cos(a), y2 - 12 * Math.sin(a) + 4);
    };
    d.ph.forEach((p, k2) => { if (p.Uang == null) return; arrow(p.Uang, R * (p.U1 ?? p.U) / mu, PH[k2], 2.6, false, 'U' + (k2 + 1)); });
    d.ph.forEach((p, k2) => { if (p.Iang == null || (p.I1 ?? p.I) < 0.5) return; arrow(p.Iang, R * 0.72 * (p.I1 ?? p.I) / mi, PH[k2], 1.8, true, 'I' + (k2 + 1)); });
    g.fillStyle = GOLD; g.font = '600 12px Space Grotesk, sans-serif'; g.textAlign = 'left'; g.fillText(`cos φ ${fmt(d.cos, 3)}`, 10, 18);
  }
  function drawHarm() {
    const k = canvas('harm'); const p = st.snap?.inst[st.sel]?.ph?.[st.hp]; if (!k || !p) return;
    const mags = st.hk === 'U' ? p.uh : p.ih; const { g, w, h } = k;
    if (!mags) { g.fillStyle = '#64748B'; g.fillText('—', w / 2, h / 2); return; }
    const f = mags[0] || 1, pct = mags.map((m) => m / f * 100), lim = st.hk === 'U' ? limU : limI;
    const pad = 34, bot = h - 22, top = 10, n = 49, bw = (w - pad - 8) / n;
    const ymax = Math.max(8, ...pct.slice(1).map((v, i) => Math.max(v, lim(i + 2)))) * 1.15;
    grid(g, pad, top, w - pad - 8, bot - top, 7, 4);
    g.fillStyle = '#64748B'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'right';
    for (let i = 0; i <= 4; i++) g.fillText(fmt(ymax * i / 4, 0) + '%', pad - 4, bot - (bot - top) * i / 4 + 3);
    g.textAlign = 'center';
    for (let hh = 2; hh <= 50; hh++) {
      const v = pct[hh - 1], xx = pad + (hh - 2) * bw, bh = v / ymax * (bot - top), over = v > lim(hh);
      const grd = g.createLinearGradient(0, bot - bh, 0, bot); grd.addColorStop(0, over ? '#F87171' : PH[st.hp]); grd.addColorStop(1, over ? 'rgba(248,113,113,.25)' : 'rgba(125,211,252,.15)');
      g.fillStyle = grd; g.fillRect(xx + bw * 0.15, bot - bh, bw * 0.7, bh);
      if (hh % 2 === 1 && (hh < 20 || hh % 6 === 1)) { g.fillStyle = '#94A3B8'; g.fillText(hh, xx + bw / 2, bot + 13); }
    }
    g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath();
    for (let hh = 2; hh <= 50; hh++) { const xx = pad + (hh - 2) * bw, yy = Math.round(bot - lim(hh) / ymax * (bot - top)) + 0.5; g.moveTo(xx + 1, yy); g.lineTo(xx + bw - 1, yy); }
    g.stroke(); g.setLineDash([]);
  }
  function drawTrend() {
    const k = canvas('trend'); const rows = st.hist; if (!k || !rows || rows.length < 2) return;
    const { g, w, h } = k; const pad = 40, padR = 10;
    const t0 = rows[0].ts, t1 = rows[rows.length - 1].ts, X = (t) => pad + (w - pad - padR) * (t - t0) / Math.max(1, t1 - t0);
    const panels = [
      { lab: 'kW / kVA', keys: [['gS', '#38BDF8', 'S grid'], ['lS', '#FB923C', 'S load'], ['gP', '#4ADE80', 'P']], lo: 0 },
      { lab: 'PF', keys: [['gPF', '#38BDF8', 'PF grid'], ['lPF', '#FB923C', 'PF load']], lo: 0.7, hi: 1.0 },
      { lab: 'THD-I %', keys: [['gIthd', '#38BDF8', 'grid'], ['lIthd', '#FB923C', 'load']], lo: 0 }
    ];
    const ph = (h - 30) / panels.length;
    // APF-off shading
    g.fillStyle = 'rgba(148,163,184,.10)';
    let s0 = null; rows.forEach((r, i) => { if (!r.apf && s0 == null) s0 = r.ts; if ((r.apf || i === rows.length - 1) && s0 != null) { g.fillRect(X(s0), 4, X(r.ts) - X(s0), h - 30); s0 = null; } });
    panels.forEach((P, pi) => {
      const y0 = 6 + pi * ph, hh = ph - 12;
      const vals = P.keys.flatMap(([kk]) => rows.map((r) => r[kk]).filter(Number.isFinite));
      const lo = P.lo ?? Math.min(...vals), hi = P.hi ?? Math.max(...vals) * 1.08;
      const Y = (v) => y0 + hh - (v - lo) / Math.max(1e-9, hi - lo) * hh;
      grid(g, pad, y0, w - pad - padR, hh, 12, 2);
      g.fillStyle = '#94A3B8'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'right';
      g.fillText(fmt(hi, P.hi ? 2 : 0), pad - 4, y0 + 9); g.fillText(fmt(lo, P.hi ? 2 : 0), pad - 4, y0 + hh);
      g.save(); g.translate(10, y0 + hh / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = GOLD; g.fillText(P.lab, 0, 0); g.restore();
      P.keys.forEach(([kk, col], j) => {
        g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
        rows.forEach((r, i) => { const v = r[kk]; if (!Number.isFinite(v)) return; i ? g.lineTo(X(r.ts), Y(v)) : g.moveTo(X(r.ts), Y(v)); }); g.stroke();
        if (j === 0 && pi === 0) { g.lineTo(X(t1), y0 + hh); g.lineTo(X(t0), y0 + hh); g.closePath(); const gr = g.createLinearGradient(0, y0, 0, y0 + hh); gr.addColorStop(0, 'rgba(56,189,248,.18)'); gr.addColorStop(1, 'rgba(56,189,248,0)'); g.fillStyle = gr; g.fill(); }
      });
      g.textAlign = 'left'; let lx = pad + 6; P.keys.forEach(([, col, lab]) => { g.fillStyle = col; g.fillRect(lx, y0 + 3, 10, 3); g.fillStyle = '#CBD5E1'; g.fillText(lab, lx + 13, y0 + 8); lx += g.measureText(lab).width + 26; });
    });
    g.fillStyle = '#94A3B8'; g.textAlign = 'center';
    for (let i = 0; i <= 6; i++) { const t = t0 + (t1 - t0) * i / 6; g.fillText(new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), X(t), h - 10); }
    if (st.hover != null) {
      const xx = clamp(st.hover, pad, w - padR), t = t0 + (xx - pad) / (w - pad - padR) * (t1 - t0);
      const r = rows.reduce((a, b) => (Math.abs(b.ts - t) < Math.abs(a.ts - t) ? b : a));
      g.strokeStyle = 'rgba(212,176,106,.8)'; g.beginPath(); g.moveTo(X(r.ts), 4); g.lineTo(X(r.ts), h - 26); g.stroke();
      const txt = [new Date(r.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + (r.apf ? '  APF ON' : '  APF OFF'), `S ${fmt(r.lS, 0)} → ${fmt(r.gS, 0)} kVA`, `PF ${fmt(r.lPF, 3)} → ${fmt(r.gPF, 3)}`, `THD-I ${fmt(r.lIthd, 1)} → ${fmt(r.gIthd, 1)} %`];
      g.font = '11px Space Grotesk, sans-serif'; const bw = Math.max(...txt.map((s) => g.measureText(s).width)) + 16, bx = X(r.ts) + 10 + bw > w ? X(r.ts) - bw - 10 : X(r.ts) + 10;
      g.fillStyle = 'rgba(8,12,24,.92)'; g.strokeStyle = GOLD; g.fillRect(bx, 10, bw, 74); g.strokeRect(bx + 0.5, 10.5, bw - 1, 73);
      g.textAlign = 'left'; txt.forEach((s, i) => { g.fillStyle = i ? '#E2E8F0' : GOLD; g.fillText(s, bx + 8, 27 + i * 16); });
    }
  }
  function drawItic() {
    const k = canvas('itic'); if (!k) return; const { g, w, h } = k; const pad = 40, bot = h - 24, top = 10;
    const X = (ms) => pad + (w - pad - 10) * (Math.log10(ms) + 3) / 8, Y = (v) => bot - v / 500 * (bot - top) * 0.999;
    const Yl = (v) => bot - Math.log10(1 + v) / Math.log10(501) * (bot - top);
    grid(g, pad, top, w - pad - 10, bot - top, 8, 5);
    g.fillStyle = '#94A3B8'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'center';
    ['1µs', '10µs', '0.1ms', '1ms', '10ms', '0.1s', '1s', '10s', '100s'].forEach((s, i) => g.fillText(s, pad + (w - pad - 10) * i / 8, h - 8));
    g.textAlign = 'right'; [0, 50, 100, 200, 500].forEach((v) => g.fillText(v + '%', pad - 4, Yl(v) + 3));
    void Y;
    const curve = (pts, col) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); pts.forEach(([ms, v], i) => (i ? g.lineTo(X(ms), Yl(v)) : g.moveTo(X(ms), Yl(v)))); g.stroke(); };
    g.fillStyle = 'rgba(34,197,94,.07)'; g.beginPath(); ITIC_UPPER.forEach(([ms, v], i) => (i ? g.lineTo(X(ms), Yl(v)) : g.moveTo(X(ms), Yl(v)))); ITIC_LOWER.slice().reverse().forEach(([ms, v]) => g.lineTo(X(ms), Yl(v))); g.lineTo(X(0.001), Yl(0)); g.closePath(); g.fill();
    curve(ITIC_UPPER, GOLD); curve(ITIC_LOWER, GOLD);
    g.strokeStyle = 'rgba(148,163,184,.4)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(pad, Yl(100)); g.lineTo(w - 10, Yl(100)); g.stroke(); g.setLineDash([]);
    for (const e of st.snap?.events || []) {
      const ok = iticVerdict(e.mag * 100, e.ms) === 'ok', xx = X(Math.max(0.001, e.ms)), yy = Yl(e.mag * 100);
      g.fillStyle = ok ? '#22C55E' : '#EF4444'; g.shadowColor = g.fillStyle; g.shadowBlur = 8; g.beginPath(); g.arc(xx, yy, 5, 0, 7); g.fill(); g.shadowBlur = 0;
    }
  }
  function drawFile() {
    const k = canvas('file'); const f = st.file; if (!k || !f || !st.fileCols.length) return;
    const { g, w, h } = k, pad = 52, padR = 10, axis = 20;
    const n = f.n, step = Math.max(1, Math.floor(n / 1500));
    const cols = ['#38BDF8', '#FB923C', '#4ADE80', '#A78BFA', '#F87171', '#FBBF24'];
    const X = (i) => pad + (w - pad - padR) * i / Math.max(1, n - 1);
    const m = st.fileCols.length, ph = (h - axis - 6) / m;
    st.fileCols.forEach((hh, si) => {
      const s = f.vals[hh], v = s.filter((q) => q != null); if (!v.length) return;
      let lo = Math.min(...v), hi = Math.max(...v); if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const padv = (hi - lo) * 0.08; lo -= padv; hi += padv;
      const y0 = 4 + si * ph, hh2 = ph - 8, Y = (q) => y0 + hh2 - (q - lo) / (hi - lo) * hh2, col = cols[si % cols.length];
      grid(g, pad, y0, w - pad - padR, hh2, 10, 2);
      g.fillStyle = '#94A3B8'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'right';
      const dg = hi - lo < 5 ? 3 : hi - lo < 50 ? 1 : 0;
      g.fillText(fmt(hi, dg), pad - 4, y0 + 9); g.fillText(fmt(lo, dg), pad - 4, y0 + hh2);
      g.strokeStyle = col; g.lineWidth = 1.6; g.shadowColor = col; g.shadowBlur = 4; g.beginPath(); let on = false;
      for (let i = 0; i < n; i += step) { const q = s[i]; if (q == null) continue; on ? g.lineTo(X(i), Y(q)) : (g.moveTo(X(i), Y(q)), (on = true)); }
      g.stroke(); g.shadowBlur = 0;
      g.lineTo(X(n - 1), y0 + hh2); g.lineTo(X(0), y0 + hh2); g.closePath(); const gr = g.createLinearGradient(0, y0, 0, y0 + hh2); gr.addColorStop(0, col + '33'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fill();
      g.textAlign = 'left'; g.font = '600 11px Space Grotesk, sans-serif'; g.fillStyle = col; g.fillText(hh, pad + 8, y0 + 13);
    });
    g.fillStyle = '#94A3B8'; g.font = '10px Space Grotesk, sans-serif'; g.textAlign = 'center';
    for (let i = 0; i <= 5; i++) { const j = Math.round((n - 1) * i / 5); const t = f.ts[j]; g.fillText(f.timeAxis ? new Date(t).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '#' + j, clamp(X(j), pad + 30, w - 40), h - 6); }
  }
  function frame(now) {
    raf = 0; if (!visible || !el.isConnected) return;
    if (st.snap) {
      if (st.tab === 'wave') drawWave(now);
      else if (st.tab === 'phasor') drawPhasor();
      else if (st.tab === 'harm') drawHarm();
      else if (st.tab === 'trend') drawTrend();
      else if (st.tab === 'events') drawItic();
      else if (st.tab === 'files') drawFile();
    }
    if (st.tab === 'wave') raf = requestAnimationFrame(frame);
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // ------------------------------------------------------------ build / events
  function rebuild(force) {
    const key = [st.mode, st.src, st.sel, st.tab, st.hk, st.hp, st.guide, L(), st.files ? st.files.length : -1, st.file ? st.file.name : ''].join('|');
    if (!force && key === built) return;
    built = key; el.innerHTML = skeleton();
    if (st.mode === 'audit') { audit ||= createAuditView({ lang: () => L(), snapshot: () => st.snap, history: () => st.hist, parseCsv }); el.querySelector('.pq-audit-host').appendChild(audit.el); audit.show(); }
    bindAll(); redraw();
  }
  // keep "why / history" panels open across the 1-s refresh
  el.addEventListener('toggle', (e) => {
    const d = e.target; if (!(d instanceof HTMLDetailsElement)) return;
    if (d.dataset.alId) { if (d.open) st.alOpen.add(d.dataset.alId); else st.alOpen.delete(d.dataset.alId); }
    else if (d.hasAttribute('data-pq-alhist')) st.alHist = d.open;
  }, true);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pq]'); if (!b || !el.contains(b)) return;
    e.stopPropagation();
    const k = b.dataset.pq, arg = b.dataset.arg;
    if (k === 'mode') { st.mode = arg; }
    else if (k === 'audit') { st.mode = 'audit'; if (audit) audit._state.tab = 'apf'; }
    else if (k === 'alnoti') { try { await Notification.requestPermission(); } catch {} region('alarms', alarmsHtml()); }
    else if (k === 'src') {
      if (arg === 'gw' && !liveGw() && !st.bridge) st.bridge = lsGet('coredash.pq.bridge') || 'http://127.0.0.1:8799';
      if (arg !== 'gw' && st.bridge && liveGw()) st.bridge = null;
      lsSet('coredash.pq.src', arg); st.gwErr = null; st.alarms = null; st.src = arg; if (arg === 'file') st.tab = 'files'; st.hist = null; st.files = null; await pull(); if (st.tab === 'files') loadFiles(); }
    else if (k === 'tab') { st.tab = arg; if (arg === 'files' && !st.files) loadFiles(); }
    else if (k === 'sel') { st.sel = arg; st.files = null; if (st.tab === 'files') loadFiles(); el.querySelectorAll('.pq-card').forEach((c) => c.classList.toggle('sel', c.dataset.arg === arg)); }
    else if (k === 'guide') st.guide = !st.guide;
    else if (k === 'hk') st.hk = arg;
    else if (k === 'hp') st.hp = Number(arg);
    else if (k === 'apf') {
      if (st.src === 'gw' && live() && st.snap.mode === 'sim') { try { await api('/api/pq/apf', { method: 'POST', body: JSON.stringify({ on: !st.snap.apf.on }) }); st.histTs = 0; } catch (er) { onToast(er.message, true); } }
      else { model.apfOn = !model.apfOn; if (model.apfOn) st.apfFromDemo = Date.now(); }
      await pull(); bindAll(); redraw(); return;
    } else if (k === 'fplot') { plotRemote(arg, false); return; }
    else if (k === 'fdl') { plotRemote(arg, true); return; }
    else if (k === 'fpick') { useParsed(st.imports[Number(arg)]); return; }
    else if (k === 'fcol') { st.fileCols = st.fileCols.includes(arg) ? st.fileCols.filter((c) => c !== arg) : [...st.fileCols, arg]; bindAll(); redraw(); return; }
    else if (k === 'export') { exportNow(); return; }
    rebuild();
  });
  el.addEventListener('change', async (e) => {
    if (e.target.matches('[data-pq-react]')) { if (st.src === 'gw' && live() && st.snap.mode === 'sim') { try { await api('/api/pq/apf', { method: 'POST', body: JSON.stringify({ on: st.snap.apf.on, reactive: e.target.checked }) }); } catch {} } else model.apfReactive = e.target.checked; st.histTs = 0; await pull(); bindAll(); redraw(); }
    if (e.target.matches('[data-pq-file]')) { const fs = [...e.target.files]; if (!fs.length) return; await importFiles(fs.map((f) => ({ name: f.webkitRelativePath || f.name, file: f }))); }
  });
  el.addEventListener('dragover', (e) => { const d = e.target.closest('[data-pq-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  el.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-pq-drop]'); if (d) d.classList.remove('over'); });
  el.addEventListener('drop', async (e) => {
    const d = e.target.closest('[data-pq-drop]'); if (!d) return; e.preventDefault(); d.classList.remove('over');
    const items = [...(e.dataTransfer.items || [])];
    const files = items.length && items[0].webkitGetAsEntry ? await readEntries(items) : [...e.dataTransfer.files].map((f) => ({ name: f.name, file: f }));
    await importFiles(files);
  });
  const hov = (e) => { const c = e.target.closest('[data-cv="trend"]'); if (!c) return; const r = c.getBoundingClientRect(); st.hover = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; redraw(); };
  el.addEventListener('pointermove', hov); el.addEventListener('pointerdown', hov);
  el.addEventListener('pointerleave', () => { st.hover = null; redraw(); });
  window.addEventListener('resize', () => redraw());

  { const m = /[?&#]live=([^&]+)/.exec(location.hash || '');
    if (m) { const base = decodeURIComponent(m[1]); if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) { const h = /[?&#]host=([^&]+)/.exec(location.hash); st.bridge = base; lsSet('coredash.pq.bridge', base); lsSet('coredash.pq.src', 'gw'); st.bridgeHost = h ? decodeURIComponent(h[1]) : ''; st.src = 'gw'; st.guide = false; st.mode = 'live'; history.replaceState(null, '', location.pathname + location.search + '#pq'); } } }
  { const m = /[?&#]import=([^&]+)/.exec(location.hash || '');
    if (m) { const base = decodeURIComponent(m[1]); if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) { history.replaceState(null, '', location.pathname + location.search + '#pq'); st.tab = 'files'; setTimeout(() => importFromTool(base), 300); } } }
  return {
    el,
    async show() {
      visible = true;
      if (!timer) { await pull(); timer = setInterval(async () => { if (!visible) return; await pull(); bindAll(); redraw(); if (st.mode === 'audit' && audit && ++auditTick % 15 === 0) audit.refresh(); }, 1000); }
      rebuild(); bindAll(); redraw();
    },
    hide() { visible = false; if (timer) { clearInterval(timer); timer = null; } },
    langChanged() { rebuild(true); if (audit) audit.langChanged(); },
    _state: st, _model: model, _parseCsv: parseCsv
  };
}

// PF → needle angle on the PF dial (non-linear scale, like real panel PF meters: more room near 1.0)
function pfAngle(pf) {
  const p = clamp(pf ?? 0.5, 0.5, 1);
  const pts = [[0.5, -120], [0.7, -72], [0.85, -24], [0.95, 24], [1, 120]];
  for (let i = 1; i < pts.length; i++) if (p <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0]); }
  return 120;
}
