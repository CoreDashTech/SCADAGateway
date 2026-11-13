// CoreDash power-quality alarms on live (1-s) values — harmonics, HF noise, surges/spikes, dips, swells,
// interruptions, unbalance, frequency, PF, neutral current, K-factor, lost communication.
//
// The same rule table is used by: the web app (demo data), the CoreDash Gateway (src/pq/service.js) and the
// field tool (tools/pw3198/pq-alarm-rules.json — kept identical by a test).
//
// What 1-s polling can and cannot see: each reading is the analyser's latest 200-ms (10-cycle) window.
// Sustained conditions (harmonics, unbalance, PF, slow sags/swells ≥ 1 s) are caught reliably.
// Sub-second dips and µs transients are caught by the PW3198's own Class-A event recorder (EVENT settings);
// here a spike shows up only if it lands in the window that was read — so the "spike" rule is an early warning.

export const RULES = [
  { id: 'int', metric: 'Umin_pct', op: '<', warn: null, alarm: 10, dur: 1, clr: 3, kind: 'int', needU: true,
    th: 'ไฟดับ (แรงดันหาย)', en: 'Interruption (voltage lost)', unit: '%Udin',
    std: 'IEC 61000-4-30 / EN 50160: interruption < 10% Udin',
    why: B('ไฟดับจากการไฟฟ้า เบรกเกอร์ทริป ฟิวส์ขาด หรือสายวัดหลุด', 'Utility outage, tripped breaker, blown fuse or a loose voltage lead'),
    act: B('ตรวจเบรกเกอร์/ฟิวส์ต้นทาง โทรแจ้งการไฟฟ้า ตรวจสายวัดแรงดัน', 'Check upstream breaker/fuses, call the utility, check the voltage leads') },
  { id: 'dip', metric: 'Umin_pct', op: '<', warn: 90, alarm: 70, dur: 1, clr: 3, kind: 'dip', needU: true,
    th: 'ไฟตก (Dip/Sag)', en: 'Voltage dip / sag', unit: '%Udin',
    std: 'IEC 61000-4-30 Class A: dip < 90% Udin · ITIC/SEMI F47 tolerance curve',
    why: B('มอเตอร์ใหญ่สตาร์ท ลัดวงจรในระบบข้างเคียง สายป้อนยาว/หม้อแปลงโหลดเกิน', 'Large motor starts, faults on nearby feeders, long feeders / overloaded transformer'),
    act: B('ดูว่าตรงกับการสตาร์ทเครื่องจักรไหน ใช้ซอฟต์สตาร์ท/VFD ตรวจขนาดหม้อแปลงและสายป้อน', 'Match to machine starts; use soft starters/VFDs; check transformer and feeder sizing') },
  { id: 'swell', metric: 'Umax_pct', op: '>', warn: 110, alarm: 120, dur: 1, clr: 3, kind: 'swell', needU: true,
    th: 'ไฟเกิน (Swell)', en: 'Voltage swell', unit: '%Udin',
    std: 'IEC 61000-4-30 Class A: swell > 110% Udin · ITIC upper curve',
    why: B('ปลดโหลดใหญ่ทันที คาปาซิเตอร์แบงก์เข้าตอนโหลดน้อย นิวทรัลหลวม/ขาด', 'Large load rejection, capacitor bank switching at light load, loose/broken neutral'),
    act: B('ตรวจขั้วต่อนิวทรัลทันที (อันตรายต่ออุปกรณ์) ตรวจการตัด-ต่อคาปาซิเตอร์', 'Check the neutral connection immediately (equipment damage risk); check capacitor switching') },
  { id: 'spike', metric: 'Upk_pu', op: '>', warn: 1.3, alarm: 1.6, dur: 0, clr: 5, kind: 'tran', needU: true,
    th: 'ไฟกระชาก / สไปก์แรงดัน', en: 'Voltage surge / spike', unit: '× peak',
    std: 'IEC 61000-4-30 transient · ITIC (CBEMA) · IEC 61643 surge protection',
    why: B('ฟ้าผ่าเหนี่ยวนำ การตัด-ต่อคาปาซิเตอร์/โหลดอินดักทีฟ คอนแทคเตอร์ VFD ไม่มีฟิลเตอร์', 'Induced lightning, capacitor/inductive switching, contactors, unfiltered VFDs'),
    act: B('ติดตั้ง/ตรวจ SPD Type 1–2 ที่ตู้เมนและตู้ย่อย ตรวจกราวด์ ดูเหตุการณ์ละเอียดในหน้า EVENT ของ PW3198', 'Fit/check Type 1–2 SPDs at main and sub-boards, check earthing, review the PW3198 EVENT list') },
  { id: 'thdu', metric: 'THDU', op: '>', warn: 5, alarm: 8, dur: 60, clr: 30, needU: true,
    th: 'ฮาร์มอนิกแรงดันสูง (THD-U)', en: 'High voltage harmonics (THD-U)', unit: '%',
    std: 'IEEE 519-2022 (≤ 1 kV: THD-U ≤ 8%) · IEC 61000-2-4 class 2 (8%) · EN 50160 (8%)',
    why: B('โหลดไม่เชิงเส้นจำนวนมาก (VFD, เรกติไฟเออร์, UPS) ร่วมกับหม้อแปลง/สายที่อิมพีแดนซ์สูง หรือเรโซแนนซ์กับคาปาซิเตอร์', 'Many non-linear loads (VFD, rectifier, UPS) on a high-impedance source, or resonance with capacitors'),
    act: B('หาโหลดต้นเหตุจาก THD-I ใส่รีแอกเตอร์/ฟิลเตอร์ ใช้คาปาซิเตอร์แบบ detuned (7%) หรือ APF', 'Find the source load via THD-I; add line reactors/filters; detuned (7%) capacitors or an APF') },
  { id: 'thdi', metric: 'THDI', op: '>', warn: 20, alarm: 40, dur: 60, clr: 30, minI: 5,
    th: 'ฮาร์มอนิกกระแสสูง (THD-I)', en: 'High current harmonics (THD-I)', unit: '%',
    std: 'IEEE 519-2022 ใช้ TDD (เทียบกระแสโหลดสูงสุด IL; ≤ 8% ที่ Isc/IL 20–50) — THD-I เป็นตัวบ่งชี้',
    why: B('VFD/เรกติไฟเออร์ 6 พัลส์ไม่มีรีแอกเตอร์ เครื่องเชื่อม UPS แหล่งจ่ายสวิตชิ่ง', '6-pulse VFDs/rectifiers without reactors, welders, UPS, switch-mode supplies'),
    act: B('ใส่ AC/DC reactor 3–5% ที่ VFD ใช้ฟิลเตอร์ฮาร์มอนิก/APF ตรวจความร้อนหม้อแปลงและสายนิวทรัล', 'Add 3–5% AC/DC reactors on VFDs; harmonic filter/APF; check transformer and neutral heating') },
  { id: 'hf', metric: 'HFU_pct', op: '>', warn: 1, alarm: 3, dur: 10, clr: 10, needU: true,
    th: 'สัญญาณรบกวนความถี่สูง (2–80 kHz)', en: 'High-frequency noise (2–80 kHz)', unit: '%Udin',
    std: 'IEC 61000-2-2:2002+A1:2017 (2–150 kHz) — ยังไม่มีพิกัดเดียวที่ใช้ทั่วไป ตั้งเป็นค่าเฝ้าระวัง',
    why: B('สวิตชิ่งของ VFD/อินเวอร์เตอร์โซลาร์/ไดรเวอร์ LED ที่ฟิลเตอร์ EMC ไม่พอ', 'Switching noise from VFDs, solar inverters, LED drivers with insufficient EMC filtering'),
    act: B('ตรวจฟิลเตอร์ EMC และสายชีลด์ของ VFD/อินเวอร์เตอร์ แยกสายไฟกำลังกับสายสัญญาณ ตรวจกราวด์', 'Check EMC filters and shielded cables on VFDs/inverters, separate power and signal cables, check earthing') },
  { id: 'unb', metric: 'Uunb', op: '>', warn: 2, alarm: 3, dur: 60, clr: 30, needU: true,
    th: 'แรงดันไม่สมดุล', en: 'Voltage unbalance', unit: '%',
    std: 'EN 50160 / IEC 61000-2-4: ≤ 2% · NEMA MG 1: มอเตอร์ต้องลดพิกัดเมื่อ > 1%',
    why: B('โหลด 1 เฟสกระจายไม่เท่ากัน ขั้วต่อหลวม ฟิวส์เฟสใดเฟสหนึ่งเสื่อม', 'Uneven single-phase loads, loose terminals, a degraded fuse on one phase'),
    act: B('ย้ายโหลด 1 เฟสให้สมดุล ขันขั้วต่อ ตรวจด้วยกล้องความร้อน มอเตอร์เสี่ยงร้อนเกิน', 'Rebalance single-phase loads, tighten terminals, thermal-scan; motors risk overheating') },
  { id: 'freq', metric: 'Fdev', op: '>', warn: 0.5, alarm: 1, dur: 10, clr: 10,
    th: 'ความถี่ผิดปกติ', en: 'Frequency out of range', unit: 'Hz',
    std: 'EN 50160: 50 Hz ± 1% (49.5–50.5 Hz)',
    why: B('ระบบไฟการไฟฟ้าแปรปรวน หรือกำลังใช้เครื่องกำเนิดไฟฟ้าสำรอง', 'Grid disturbance, or running on a standby generator'),
    act: B('ถ้าใช้เจนเนอเรเตอร์ ตรวจกัฟเวอร์เนอร์และโหลด ถ้าไฟการไฟฟ้า แจ้งการไฟฟ้า', 'On a generator: check the governor and load; on the grid: notify the utility') },
  { id: 'pf', metric: 'PF', op: '<', warn: 0.85, alarm: null, dur: 300, clr: 60, minI: 5,
    th: 'ค่า PF ต่ำ (เสี่ยงค่าปรับ kvar)', en: 'Low power factor (kvar charge risk)', unit: '',
    std: 'PEA/MEA: เก็บค่า kvar ส่วนที่เกิน 61.97% ของ kW (≈ PF < 0.85)',
    why: B('มอเตอร์โหลดเบา คาปาซิเตอร์แบงก์เสีย/ขั้นไม่เข้า', 'Lightly loaded motors, failed capacitor bank or steps not switching in'),
    act: B('ตรวจตู้คาปาซิเตอร์และคอนโทรลเลอร์ ถ้ามีฮาร์มอนิกใช้แบบ detuned', 'Check the capacitor bank and controller; use detuned steps if harmonics are present') },
  { id: 'neutral', metric: 'IN_pct', op: '>', warn: 50, alarm: 100, dur: 60, clr: 30, minI: 5,
    th: 'กระแสนิวทรัลสูง', en: 'High neutral current', unit: '% of I avg',
    std: 'IEC 60364-5-52 (ลดพิกัดสายเมื่อฮาร์มอนิกลำดับ 3 > 15%)',
    why: B('ฮาร์มอนิกลำดับ 3 จากโหลดอิเล็กทรอนิกส์ 1 เฟส รวมกันในนิวทรัล หรือโหลดไม่สมดุล', 'Triplen harmonics from single-phase electronic loads adding in the neutral, or unbalance'),
    act: B('ตรวจความร้อนสายนิวทรัลและขั้วต่อ พิจารณาเพิ่มขนาดนิวทรัล/ฟิลเตอร์ลำดับศูนย์', 'Check neutral conductor/terminal heating; consider a larger neutral or zero-sequence filter') },
  { id: 'kf', metric: 'KF', op: '>', warn: 4, alarm: 9, dur: 60, clr: 30, minI: 5,
    th: 'K-factor สูง (หม้อแปลงร้อน)', en: 'High K-factor (transformer heating)', unit: '',
    std: 'IEEE C57.110 / UL 1561 (หม้อแปลง K-rated)',
    why: B('ฮาร์มอนิกกระแสลำดับสูงทำให้ eddy-current loss ในหม้อแปลงเพิ่ม', 'High-order current harmonics raise eddy-current losses in the transformer'),
    act: B('ตรวจอุณหภูมิหม้อแปลง ลดฮาร์มอนิกที่ต้นเหตุ หรือลดพิกัดหม้อแปลงตาม IEEE C57.110', 'Check transformer temperature, reduce harmonics at source, or derate per IEEE C57.110') }
];
function B(th, en) { return { th, en }; }

export const COMM = { id: 'comm', th: 'ขาดการเชื่อมต่อเครื่องวัด', en: 'Lost connection to the analyser', after: 10 };

// record (pw3198Record / pq-model measure shape) → alarm metrics
export function metricsOf(rec, unom = 230) {
  if (!rec || !rec.ph) return {};
  const vals = (k) => rec.ph.map((p) => p[k]).filter((v) => v != null && Number.isFinite(v));
  const U = vals('U'), I = vals('I');
  const mx = (a) => (a.length ? Math.max(...a) : null), mn = (a) => (a.length ? Math.min(...a) : null);
  const Iavg = I.length ? I.reduce((s, v) => s + v, 0) / I.length : null;
  const pk = vals('Upk').map(Math.abs).concat(vals('UpkN').map(Math.abs));
  return {
    Umin_pct: U.length ? mn(U) / unom * 100 : null,
    Umax_pct: U.length ? mx(U) / unom * 100 : null,
    Upk_pu: pk.length ? mx(pk) / (Math.SQRT2 * unom) : null,
    THDU: rec.Uthd ?? mx(vals('Uthd')),
    THDI: rec.Ithd ?? mx(vals('Ithd')),
    HFU_pct: vals('Uhf').length ? mx(vals('Uhf')) / unom * 100 : null,
    Uunb: rec.unb ?? null,
    Fdev: rec.f != null ? Math.abs(rec.f - 50) : null,
    PF: rec.PF ?? null,
    IN_pct: rec.IN != null && Iavg ? rec.IN / Iavg * 100 : null,
    KF: rec.KF ?? mx(vals('KF')),
    Iavg, Umax: mx(U)
  };
}

const crossed = (op, v, lim) => (lim != null && v != null && (op === '>' ? v > lim : v < lim));

export class PqAlarmEngine {
  constructor({ unom = 230, rules = RULES, onEvent = () => {}, maxLog = 300 } = {}) {
    Object.assign(this, { unom, rules, onEvent, maxLog });
    this.state = {}; this.log = []; this.lastU = {}; this.lastSeen = {}; this.seq = 0;
  }
  // one reading of one instrument
  feed(dev, rec, ts = Date.now(), meta = {}) {
    const m = metricsOf(rec, this.unom);
    this.lastSeen[dev] = ts;
    this.clearComm(dev, ts, meta);
    if (m.Umax != null && m.Umax > 0.5 * this.unom) this.lastU[dev] = ts;
    const hadU = this.lastU[dev] != null && ts - this.lastU[dev] < 600e3;
    for (const r of this.rules) {
      const key = dev + '|' + r.id, s = (this.state[key] ||= { since: null, okSince: null, ev: null });
      let v = m[r.metric];
      if (r.needU && !hadU) v = null;
      if (r.minI && !(m.Iavg >= r.minI)) v = null;
      const lvl = crossed(r.op, v, r.alarm) ? 'alarm' : crossed(r.op, v, r.warn) ? 'warn' : null;
      if (lvl) {
        s.okSince = null;
        if (s.since == null) s.since = ts;
        if (!s.ev && ts - s.since >= r.dur * 1000) {
          s.ev = this.open(r, dev, lvl, v, s.since, meta);
        } else if (s.ev) {
          const worse = r.op === '>' ? v > s.ev.worst : v < s.ev.worst;
          if (worse) s.ev.worst = v;
          if (lvl === 'alarm' && s.ev.sev === 'warn') { s.ev.sev = 'alarm'; s.ev.limit = r.alarm; this.onEvent('escalate', s.ev); }
          s.ev.value = v;
        }
        if (s.ev) s.ev.lastBad = ts;
      } else {
        s.since = null;
        if (s.ev) {
          if (s.okSince == null) s.okSince = ts;
          if (ts - s.okSince >= r.clr * 1000) { this.close(s.ev, ts); s.ev = null; s.okSince = null; }
        }
      }
    }
    return m;
  }
  // call every second with the instruments that did not answer
  offline(dev, ts = Date.now(), meta = {}) {
    const key = dev + '|comm', s = (this.state[key] ||= { ev: null });
    const last = this.lastSeen[dev];
    if (!s.ev && last != null && ts - last >= COMM.after * 1000) {
      s.ev = this.open({ ...COMM, std: '', unit: 's', why: B('สาย LAN หลุด เครื่องวัดปิด/ดับ IP เปลี่ยน', 'LAN cable unplugged, analyser off, IP changed'), act: B('ตรวจสาย LAN ไฟเลี้ยงเครื่องวัด และ IP', 'Check the LAN cable, the analyser power and its IP') }, dev, 'alarm', Math.round((ts - last) / 1000), last, meta);
    }
  }
  clearComm(dev, ts, meta) { const s = this.state[dev + '|comm']; if (s && s.ev) { this.close(s.ev, ts); s.ev = null; } }
  open(r, dev, sev, v, start, meta) {
    const ev = { id: 'AL' + (++this.seq) + '-' + start, rule: r.id, dev, devName: meta.name || dev, host: meta.host || null, sev, th: r.th, en: r.en,
      value: v, worst: v, lastBad: start, limit: sev === 'alarm' ? r.alarm : r.warn, op: r.op, unit: r.unit, std: r.std, why: r.why, act: r.act, kind: r.kind || null, start, end: null };
    this.log.unshift(ev); if (this.log.length > this.maxLog) this.log.pop();
    this.onEvent('raise', ev);
    return ev;
  }
  close(ev, ts) { ev.end = Math.min(ts, (ev.lastBad ?? ts) + 1000); this.onEvent('clear', ev); }
  active() { return this.log.filter((e) => e.end == null); }
  // dips/swells/spikes/interruptions in the shape of the ITIC "events" tab
  iticEvents() {
    return this.log.filter((e) => e.kind).map((e) => ({
      id: e.id, ts: e.start, kind: e.kind, th: e.th, en: e.en, ch: 'U', inst: e.dev,
      mag: e.kind === 'tran' ? e.worst : e.worst / 100, ms: Math.max(1000, (e.end ?? Date.now()) - e.start), live: true
    }));
  }
}

// short text for a phone notification
export function alarmText(ev, lang = 'th', kind = 'raise') {
  const L = lang === 'en' ? 'en' : 'th';
  const head = kind === 'clear' ? '✅' : ev.sev === 'alarm' ? '🔴' : '🟡';
  const sev = kind === 'clear' ? (L === 'th' ? 'กลับสู่ปกติ' : 'cleared') : ev.sev === 'alarm' ? (L === 'th' ? 'แจ้งเตือน' : 'ALARM') : (L === 'th' ? 'เฝ้าระวัง' : 'WATCH');
  const n = (v) => (v == null ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const title = `${head} ${sev}: ${ev[L]} · ${ev.devName}`;
  const body = `${L === 'th' ? 'ค่า' : 'Value'} ${n(ev.worst)} ${ev.unit} (${ev.op} ${n(ev.limit)})` +
    (kind === 'clear' ? ` · ${L === 'th' ? 'นาน' : 'lasted'} ${Math.round((ev.end - ev.start) / 1000)} s` : '') +
    (ev.std ? `\n${ev.std}` : '') + (kind !== 'clear' && ev.act ? `\n→ ${ev.act[L]}` : '');
  return { title, body };
}
