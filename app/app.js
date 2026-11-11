// CoreDash Nexus — installable mobile web app (PWA). Developed by CoreDash Technology.
// Data comes from the CoreDash Gateway over WebSocket (live) or from a built-in plant simulator (demo).
import { CoreDashClient } from './coredash-client.mjs';

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
    site: 'โรงงาน A · บางนา', home: 'หน้าหลัก', control: 'ควบคุม', alerts: 'แจ้งเตือน', report: 'รายงาน',
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
    days: ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
  },
  en: {
    site: 'Plant A · Bang Na', home: 'Home', control: 'Control', alerts: 'Alerts', report: 'Reports',
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
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
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
const cmp = (v, op, r) => ({ '>': v > r, '<': v < r, '>=': v >= r, '<=': v <= r, '==': v === r }[op]);

// ---------------------------------------------------------------- demo source: same model as the gateway simulator
class DemoSource {
  constructor() {
    this.mode = 'demo';
    this.user = { id: 'demo', name: 'Demo Operator', role: 'operator' };
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
    // interlock: tank full -> P-01 off
    if (s['T-1.LEVEL'] >= 97 && s['P-01.RUN']) { s['P-01.RUN'] = false; this.addLog(B('Interlock: ตัด P-01 (ถังเต็ม 97%)', 'Interlock: P-01 tripped (tank 97%)'), 'PLC'); }
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
    if (tag === 'P-01.RUN' && value === true && this.s['T-1.LEVEL'] >= 97) throw err('INTERLOCK', 'IL_TANK_HIGH');
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
  activeAlarms() { return this.alarmList.filter((a) => !(a.acked && a.state === 'cleared')); }
  prepare(tag, value) { return this.client.prepare(tag, value); }
  confirm(id) { return this.client.confirm(id); }
  cancel(id) { return this.client.cancel(id).catch(() => {}); }
  ack(id) { return this.client.ack(id); }
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
  view: 'boot', tab: (location.hash || '#home').slice(1), seg: 'machines', sheet: null, settings: false,
  pending: null, toast: null, lang: store.get('lang', 'th'), theme: store.get('theme', 'navy'),
  gw: null, loginErr: '', hist: null, installEvt: null, busy: false
};
if (!['home', 'scada', 'control', 'alerts', 'report'].includes(S.tab)) S.tab = 'home';
let src = null;
const root = typeof document !== 'undefined' ? document.getElementById('app') : null;
const t = () => L[S.lang];
const tr = (o) => (o ? o[S.lang] ?? o.en : '');

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
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', scada: 'M4 6h5v5H4zM15 13h5v5h-5zM9 8.5h4v7h2', control: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  alerts: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0', report: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
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
const canCommand = () => src && src.user && src.user.role !== 'viewer';

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
  const titles = { home: 'CoreDash Nexus', scada: 'SCADA', control: x.control, alerts: x.alerts, report: x.report };
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
  return `<nav class="tabs" aria-label="tabs">${['home', 'scada', 'control', 'alerts', 'report'].map((k) => `<button data-act="tab" data-arg="${k}" aria-current="${S.tab === k ? 'page' : 'false'}">${svg(ICON[k], 24)}<span>${k === 'scada' ? 'SCADA' : x[k]}</span>${k === 'alerts' && open ? '<span class="dot"></span>' : ''}</button>`).join('')}</nav>`;
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
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  if (S.installEvt) return `<div class="install">${svg(ICON.home)}<span style="flex:1">${x.install}</span><button class="btn primary" style="min-height:40px;padding:8px 14px" data-act="install">${x.installBtn}</button></div>`;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return `<div class="install">${svg(ICON.home)}<span style="flex:1">${x.iosInstall}</span></div>`;
  return '';
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
  const lab = (id, left, top, extra) => { const vt = valveText(VALVES.find((v) => v.id === id)); return `<div class="lbl" style="left:${left}px;top:${top}px;${extra || ''}"><b>${id}</b><span style="color:${vt[1]}">${vt[0]}</span></div>`; };
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
  return `<div class="seg" role="tablist">${segs}</div>${canCommand() ? '' : `<div class="banner" style="border-radius:10px">${x.viewOnly}</div>`}${body}`;
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
  <button class="btn primary" data-act="print">${x.exportPdf}</button>`;
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
  const scroll = prevMain ? prevMain.scrollTop : 0;
  const body = { home: viewHome, scada: viewScada, control: viewControl, alerts: viewAlerts, report: viewReport }[S.tab]();
  root.innerHTML = header() + `<main>${body}</main>` + tabs() + viewSheet() + viewSettings() + viewConfirm() +
    (S.toast ? `<div class="toast ${S.toast.bad ? 'bad' : ''}" role="status">${esc(S.toast.text)}</div>` : '');
  const main = root.querySelector('main');
  if (main && S.keepScroll) main.scrollTop = scroll;
  S.keepScroll = true;
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
  const map = { INTERLOCK: B('ถูกบล็อกโดย Interlock (ระบบป้องกัน)', 'Blocked by an interlock'), FORBIDDEN: B('บัญชีนี้ไม่มีสิทธิ์สั่งการ', 'This account cannot command'), OUT_OF_RANGE: B('ค่าเกินช่วงที่อนุญาต', 'Value out of range'), EXPIRED: B('หมดเวลายืนยัน ลองใหม่อีกครั้ง', 'Confirmation expired, try again') };
  return map[e.code] ? tr(map[e.code]) : e.message;
}
async function command(steps, title) {
  steps = steps.filter((s) => has(s.tag) && V(s.tag) !== s.value);
  if (!steps.length) { toast(t().nothingToDo); return; }
  // Step 1: validate everything on the gateway first (role, range, interlocks)
  const cmds = [];
  try { for (const s of steps) cmds.push(await src.prepare(s.tag, s.value)); }
  catch (e) { for (const c of cmds) src.cancel(c.id); toast(t().failed + errorText(e), true); return; }
  const d = describe(steps);
  S.pending = { cmds, steps, text: title ? { th: `${title.th}: ${d.th}`, en: `${title.en}: ${d.en}` } : { th: d.th + ' ?', en: d.en + '?' } };
  S.sheet = null;
  schedule();
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
    case 'view-eq': S.tab = 'scada'; S.sheet = MACHINES.some((m) => m.id === arg) || VALVES.some((v) => v.id === arg) || arg === 'T-1' ? arg : null; break;
    case 'print': window.print(); break;
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
root.addEventListener('pointerdown', (ev) => { if (ev.target.type === 'range') interacting = true; });
window.addEventListener('pointerup', () => { if (interacting) { setTimeout(() => { interacting = false; schedule(); }, 300); } });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; schedule(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== S.tab && ['home', 'scada', 'control', 'alerts', 'report'].includes(h)) { S.tab = h; schedule(); } });

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
