// CoreDash Nexus — water-meter test bench (volumetric / proving-tank method). Developed by CoreDash Technology.
// Simulates a bench with meters in series, a reference flowmeter, two proving tanks (20 L and 200 L)
// with narrow graduated necks, point level sensors and an automatic test sequence that
// computes each meter's error and compares it with the maximum permissible error (MPE).
//
// MPE used (ISO 4064 / OIML R 49, accuracy class 2, water ≤ 30 °C):
//   lower zone  Q1 ≤ Q < Q2 : ±5 %      upper zone  Q2 ≤ Q ≤ Q4 : ±2 %
// Flow rates: Q1 = Q3 / R, Q2 = 1.6 · Q1, Q4 = 1.25 · Q3.
// Meter error curves below are SIMULATED for demonstration, not manufacturer data.

// Meter models. On the bench all three positions carry the SAME model (one batch under test);
// each unit gets a small individual offset so three meters of one model never read identically.
const B0 = (th, en) => ({ th, en });
export const MODELS = {
  'SMCV4': { name: 'SMCV4', code: 'SM', kind: B0('มาตรน้ำแบบหน้าปัดแห้ง หลายใบพัด', 'Multi-jet, dry dial'), err: [[-1, 1.6], [0, 0.6], [1, -0.2], [2, -0.5]],
    look: { style: 'subdials', rim: '#1D4ED8', rim2: '#93C5FD', face: '#F8FAFC', ink: '#0F172A', accent: '#DC2626', blk: 5, red: 3 } },
  'GMCV3-V3.5': { name: 'GMCV3-V3.5', code: 'GM', kind: B0('มาตรน้ำทองเหลือง เข็มกวาดกลาง', 'Brass body, centre sweep hand'), err: [[-1, -2.2], [0, -0.8], [1, 0.3], [2, 0.5]],
    look: { style: 'sweep', rim: '#A16207', rim2: '#FDE68A', face: '#FFFBEB', ink: '#3B2F14', accent: '#B91C1C', blk: 5, red: 4 } },
  'ASAHI GMK': { name: 'ASAHI GMK', code: 'AG', kind: B0('มาตรน้ำแบบเฟือง หน้าปัด 3 เข็ม', 'Gear-train dial, three pointers'), err: [[-1, 2.4], [0, 1.0], [1, 0.6], [2, 0.8]],
    look: { style: 'pointers', rim: '#334155', rim2: '#CBD5E1', face: '#FFFFFF', ink: '#111827', accent: '#DC2626', blk: 5, red: 2 } }
};
export const MODEL_NAMES = Object.keys(MODELS);
export const POSITIONS = ['M1', 'M2', 'M3'];
export const POS_COLORS = { M1: '#3B82F6', M2: '#14B8A6', M3: '#F59E0B' };
const UNIT_OFFSET = { M1: [0.35, 0.15, 0.05, 0.05], M2: [-0.5, -0.2, -0.1, 0], M3: [0.9, 0.3, 0.15, 0.2] };
const START_READ = { M1: 1234.5, M2: 876.25, M3: 2210.1 };
// kept for older imports: the default model in each position
export const METERS = POSITIONS.map((id) => ({ id, model: 'SMCV4' }));

// Proving tanks: stacked sections from the bottom. Narrow necks around the nominal volumes give
// high resolution: a neck of Ø50 mm holds 1.96 mL per mm, a body of Ø650 mm holds 332 mL per mm.
export const TANKS = {
  S: { id: 'S', name: 'TK-20', cap: 12, sections: [{ v0: 0, v1: 9.5, w: 64, h: 150 }, { v0: 9.5, v1: 10.5, w: 16, h: 56 }, { v0: 10.5, v1: 12, w: 40, h: 18 }],
    sensors: [{ id: 'LSL-S', v: 0.05, kind: 'low' }, { id: 'LS-10', v: 10, kind: 'target' }, { id: 'LSHH-S', v: 11.2, kind: 'high' }], div: 0.01 },
  L: { id: 'L', name: 'TK-200', cap: 215, sections: [{ v0: 0, v1: 95, w: 132, h: 112 }, { v0: 95, v1: 105, w: 26, h: 44 }, { v0: 105, v1: 195, w: 132, h: 104 }, { v0: 195, v1: 205, w: 26, h: 44 }, { v0: 205, v1: 215, w: 60, h: 16 }],
    sensors: [{ id: 'LSL-L', v: 0.2, kind: 'low' }, { id: 'LS-100', v: 100, kind: 'target' }, { id: 'LS-200', v: 200, kind: 'target' }, { id: 'LSHH-L', v: 210, kind: 'high' }], div: 0.05 }
};

export function flowPoints(q3m3h, R) {
  const Q3 = q3m3h * 1000, Q1 = Q3 / R, Q2 = 1.6 * Q1, Q4 = 1.25 * Q3;
  return { Q1, Q2, Q3, Q4 };
}
export const mpeFor = (Q, pts) => (Q < pts.Q2 ? 5 : 2);

const B = (th, en) => ({ th, en });
export const STEPS = [
  B('ระบายถังจนแห้ง (LSL) + รอหยด 30 วินาที', 'Drain to empty (LSL) + 30 s drip'),
  B('ปิดวาล์วระบาย · อ่านค่าเริ่มต้นหน้าปัดมาตรทุกตัว', 'Close drain · read every meter dial (start)'),
  B('เปิดวาล์วเติม · ไหลที่อัตราทดสอบ', 'Open fill valve · flow at test rate'),
  B('น้ำถึงเซนเซอร์ปริมาตร → ปิดวาล์วเร็ว', 'Volume sensor reached → fast valve close'),
  B('รอน้ำนิ่ง 10 วินาที · อ่านสเกลคอถัง', 'Settle 10 s · read tank neck scale'),
  B('อ่านค่าสิ้นสุดหน้าปัดมาตร · คำนวณค่าผิดพลาด', 'Read every meter dial (end) · compute errors'),
  B('เสร็จสิ้น', 'Done')
];

// ---------------------------------------------------------------- simulator
export class BenchSim {
  constructor() {
    this.speed = 60;
    this.q3 = 2.5; this.R = 160;
    this.selected = { M1: true, M2: true, M3: true };
    this.model = 'SMCV4';
    this.serials = {};
    this.fault = null;               // meter id with an injected fault
    this.reset();
    this.listeners = [];
  }
  reset() {
    this.t = 0;
    this.mode = 'manual';
    this.step = -1;
    this.Qset = 0; this.Q = 0;
    this.v = { in: false, s: false, l: false, ds: false, dl: false };
    this.tank = { S: 0, L: 0 };
    this.meters = POSITIONS.map((id) => ({ id, model: this.model, err: [], reading: START_READ[id] }));
    this.setModel(this.model, true);
    this.temp = 28.4; this.p1 = 3.2; this.p2 = 2.9;
    this.alarm = null;
    this.run = null; this.queue = []; this.results = this.results || [];
    this.log = [];
  }
  setModel(name, quiet) {
    if (!MODELS[name] || (this.mode === 'auto' && this.run)) return;
    this.model = name;
    const M = MODELS[name], yymm = new Date().toISOString().slice(2, 7).replace('-', '');
    for (const [i, m] of this.meters.entries()) {
      m.model = name;
      m.err = M.err.map(([x, e], k) => [x, e + UNIT_OFFSET[m.id][k]]);
      this.serials[m.id] = `${M.code}${yymm}-${String(1041 + i * 7).padStart(5, '0')}`;
    }
    if (!quiet) this.emit();
  }
  on(fn) { this.listeners.push(fn); }
  emit() { for (const f of this.listeners) f(); }
  points() { return flowPoints(this.q3, this.R); }
  meterError(m, Q) {
    // interpolate the simulated curve on log(Q / Q2) (−1 ≈ Q1, 0 = Q2, 1 ≈ Q3, 2 ≈ Q4)
    const p = this.points();
    const x = Q <= p.Q1 ? -1 : Q <= p.Q2 ? -1 + Math.log(Q / p.Q1) / Math.log(p.Q2 / p.Q1) : Q <= p.Q3 ? Math.log(Q / p.Q2) / Math.log(p.Q3 / p.Q2) : 1 + Math.log(Q / p.Q3) / Math.log(p.Q4 / p.Q3);
    const c = m.err;
    let e = c[c.length - 1][1];
    for (let i = 0; i < c.length - 1; i++) if (x <= c[i + 1][0]) { const k = (x - c[i][0]) / (c[i + 1][0] - c[i][0]); e = c[i][1] + clamp(k, 0, 1) * (c[i + 1][1] - c[i][1]); break; }
    if (this.fault === m.id) e += x < 0 ? 6.5 : 2.8; // worn meter: over-registers, worst at low flow
    return e;
  }
  sensorWet(tankId, sid) { const s = TANKS[tankId].sensors.find((q) => q.id === sid); return this.tank[tankId] >= s.v; }

  // ---- manual controls
  setValve(k, open) { if (this.mode === 'auto' && this.step >= 0 && this.step < 6) return false; this.v[k] = open; if (k === 'in' && !open) this.Qset = 0; this.emit(); return true; }
  setFlow(Q) { if (this.mode === 'auto' && this.run) return; this.Qset = Q; this.v.in = Q > 0; this.emit(); }

  // ---- automatic test
  start(points) {
    // points: [{ key, Q, V }]
    this.alarm = null;
    this.queue = points.slice();
    this.lastRead = null;
    this.mode = 'auto';
    this.next();
  }
  next() {
    const p = this.queue.shift();
    if (!p) { this.mode = 'manual'; this.step = 6; this.run = null; this.emit(); return; }
    const tank = p.V <= 10.5 ? 'S' : 'L';
    this.run = { ...p, tank, t0: this.t, st: this.t, start: {}, end: {}, vread: null };
    this.v = { in: false, s: false, l: false, ds: tank === 'S', dl: tank === 'L' };
    this.Qset = 0;
    this.step = 0;
    this.emit();
  }
  stop() { this.queue = []; this.run = null; this.mode = 'manual'; this.step = -1; this.v = { in: false, s: false, l: false, ds: false, dl: false }; this.Qset = 0; this.emit(); }
  injectFault(id) { this.fault = this.fault === id ? null : id; this.emit(); }
  clearResults() { this.results = []; this.emit(); }

  tick(realDt) {
    // split into small sub-steps so fast-forward stays accurate near the volume sensors
    let rest = realDt * this.speed;
    while (rest > 0) { const d = Math.min(rest, 0.25); this.step1(d); rest -= d; }
  }
  step1(dt) {
    this.t += dt;
    // flow dynamics: valve train + flow control valve, time constant ~1.5 s
    const path = this.v.in && (this.v.s || this.v.l);
    const target = path ? this.Qset : 0;
    const tau = target < this.Q ? 0.12 : 1.5; // fast-closing valve, slower flow build-up
    this.Q += (target - this.Q) * (1 - Math.exp(-dt / tau));
    if (this.Q < 0.01) this.Q = 0;
    const Qn = this.Q * (1 + (Math.random() - 0.5) * 0.002);
    const dV = Qn * dt / 3600;
    // fill tanks
    if (path) {
      const n = (this.v.s ? 1 : 0) + (this.v.l ? 1 : 0);
      if (this.v.s) this.tank.S += dV / n;
      if (this.v.l) this.tank.L += dV / n;
    }
    // meters in series all see the flow
    for (const m of this.meters) m.reading += dV * (1 + this.meterError(m, Math.max(this.Q, 0.001)) / 100);
    // drains (≈ 3 m³/h)
    for (const k of ['S', 'L']) if (this.v['d' + k.toLowerCase()]) this.tank[k] = Math.max(0, this.tank[k] - 3000 * dt / 3600);
    // sensors, overflow protection (LSHH): close everything
    for (const k of ['S', 'L']) {
      const hh = TANKS[k].sensors.find((s) => s.kind === 'high');
      if (this.tank[k] >= hh.v && (this.v.in || this.v.s || this.v.l)) {
        this.v.in = false; this.v.s = false; this.v.l = false; this.Qset = 0;
        this.alarm = { sensor: hh.id, text: B(`${hh.id} ทำงาน: ถัง ${TANKS[k].name} ใกล้ล้น — ปิดวาล์วทั้งหมด`, `${hh.id} tripped: ${TANKS[k].name} about to overflow — all valves closed`) };
        if (this.mode === 'auto') this.stop();
      }
      this.tank[k] = Math.min(this.tank[k], TANKS[k].cap);
    }
    // instruments
    this.temp += (28.4 - this.temp) * 0.01 + (Math.random() - 0.5) * 0.02;
    const q = this.Q / 3125;
    this.p1 = 3.2 - 0.25 * q * q + (Math.random() - 0.5) * 0.01;
    this.p2 = this.p1 - 0.55 * q * q; // pressure loss across the meters grows with Q²
    if (this.mode === 'auto' && this.run) this.sequence();
  }

  sequence() {
    const r = this.run, k = r.tank, dk = 'd' + k.toLowerCase(), since = this.t - r.st;
    const go = (n) => { this.step = n; r.st = this.t; this.emit(); };
    switch (this.step) {
      case 0: // drain until LSL dry, then drip time
        this.v[dk] = true;
        if (this.tank[k] <= 0.0001) { if (r.dry == null) r.dry = this.t; if (this.t - r.dry >= 30) go(1); } else r.dry = null;
        break;
      case 1:
        this.v[dk] = false;
        for (const m of this.meters) r.start[m.id] = quant(m.reading, 0.05);
        this.lastRead = { kind: 'start', key: r.key, at: performance.now() };
        go(2);
        break;
      case 2:
        this.Qset = r.Q; this.v.in = true; this.v[k.toLowerCase()] = true;
        if (this.tank[k] >= r.V) { this.v[k.toLowerCase()] = false; this.v.in = false; this.Qset = 0; r.closeAt = this.tank[k]; go(3); }
        break;
      case 3: // valve closing time 0.4 s lets a little more water in (overshoot)
        if (since >= 0.4) go(4);
        break;
      case 4:
        if (since >= 10) {
          const div = TANKS[k].div;
          r.vread = quant(this.tank[k], div);
          r.temp = this.temp;
          r.vref = r.vread * (1 + 0.000051 * (this.temp - 20)); // steel tank volume at 20 °C
          go(5);
        }
        break;
      case 5: {
        const pts = this.points();
        for (const m of this.meters) {
          r.end[m.id] = quant(m.reading, 0.05);
          this.lastRead = { kind: 'end', key: r.key, at: performance.now() };
          if (!this.selected[m.id]) continue;
          const vm = r.end[m.id] - r.start[m.id];
          const e = (vm - r.vref) / r.vref * 100;
          const mpe = mpeFor(r.Q, pts);
          this.results.push({ ts: Date.now(), meter: m.id, model: m.model, serial: this.serials[m.id], start: r.start[m.id], end: r.end[m.id], q3: this.q3, R: this.R, key: r.key, Q: r.Q, V: r.V, tank: TANKS[k].name, vref: r.vref, vread: r.vread, vm, e, mpe, pass: Math.abs(e) <= mpe, temp: r.temp, dur: this.t - r.t0, fault: this.fault === m.id });
        }
        this.v[dk] = true; // start draining for the next point
        go(6);
        setTimeout(() => this.next(), 600);
        break;
      }
      default: break;
    }
  }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const quant = (v, d) => +(Math.round(v / d) * d).toFixed(6);


// ---------------------------------------------------------------- meter dial faces
// Each model gets its own dial: drawn in a 200 × 200 box. Ids are prefixed so several dials can live in one page.
// Register: black drums = whole m³, red drums = litres (and 0.1 L for 4 red drums). Pointers turn with the litres.
const r1 = (v) => v.toFixed(1);
function ticks(cx, cy, r0, r1x, n, color, w = 1.2, every = 0, long = 0) {
  let o = '';
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = every && k % every === 0 ? r0 - long : r0; o += `<line x1="${r1(cx + Math.sin(a) * rr)}" y1="${r1(cy - Math.cos(a) * rr)}" x2="${r1(cx + Math.sin(a) * r1x)}" y2="${r1(cy - Math.cos(a) * r1x)}" stroke="${color}" stroke-width="${w}"/>`; }
  return o;
}
function subdial(p, i, cx, cy, r, L, label) {
  const nums = Array.from({ length: 10 }, (_, k) => { const a = k / 10 * Math.PI * 2; return `<text x="${r1(cx + Math.sin(a) * (r - 6))}" y="${r1(cy - Math.cos(a) * (r - 6) + 2.4)}" font-size="5.6" text-anchor="middle" fill="${L.ink}">${k}</text>`; }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="${L.ink}" stroke-width="0.8"/>${ticks(cx, cy, r - 1.5, r, 10, L.ink, 0.6)}${nums}
    <g id="${p}-sub${i}"><path d="M${cx},${cy - r + 4} L${cx + 2.2},${cy} L${cx},${cy + 3} L${cx - 2.2},${cy} Z" fill="${L.accent}"/></g><circle cx="${cx}" cy="${cy}" r="1.6" fill="${L.ink}"/>
    <text x="${cx}" y="${cy + r + 7}" font-size="5.2" text-anchor="middle" fill="${L.ink}">${label}</text>`;
}
export function dialSvg(p, modelName, info = {}) {
  const M = MODELS[modelName] || MODELS.SMCV4, L = M.look;
  const nb = L.blk, nr = L.red, cw = 12, wTot = (nb + nr) * cw, x0 = 100 - wTot / 2, ry = L.style === 'pointers' ? 58 : 64;
  const drums = Array.from({ length: nb + nr }, (_, k) => `<rect x="${x0 + k * cw + 0.6}" y="${ry}" width="${cw - 1.2}" height="17" rx="1.5" fill="${k < nb ? '#111827' : '#B91C1C'}"/>`).join('');
  const digits = `<text id="${p}-blk" x="${x0 + nb * cw / 2}" y="${ry + 13.4}" font-family="'Space Mono','DejaVu Sans Mono',monospace" font-size="13.5" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="3.2">${'0'.repeat(nb)}</text>
    <text id="${p}-red" x="${x0 + nb * cw + nr * cw / 2}" y="${ry + 13.4}" font-family="'Space Mono','DejaVu Sans Mono',monospace" font-size="13.5" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="3.2">${'0'.repeat(nr)}</text>`;
  const rim = `<defs><linearGradient id="${p}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L.rim2}"/><stop offset="0.5" stop-color="${L.rim}"/><stop offset="1" stop-color="${L.rim2}"/></linearGradient>
      <radialGradient id="${p}-gl" cx="0.35" cy="0.25" r="0.8"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.06"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>
    <circle cx="100" cy="100" r="98" fill="url(#${p}-g)"/>
    ${L.style === 'sweep' ? Array.from({ length: 8 }, (_, k) => { const a = k / 8 * Math.PI * 2; return `<circle cx="${r1(100 + Math.sin(a) * 92)}" cy="${r1(100 - Math.cos(a) * 92)}" r="3.4" fill="${L.rim}" stroke="${L.rim2}" stroke-width="1"/>`; }).join('') : ''}
    <circle cx="100" cy="100" r="84" fill="${L.face}" stroke="#00000033" stroke-width="2"/>`;
  const label = `<text x="100" y="${L.style === 'pointers' ? 40 : 44}" font-size="11" font-weight="700" text-anchor="middle" fill="${L.ink}" font-family="'Space Grotesk',sans-serif">${M.name}</text>
    <text x="100" y="${L.style === 'pointers' ? 51 : 56}" font-size="6.4" text-anchor="middle" fill="${L.ink}" opacity="0.8">m³ · Q3 ${info.q3 ?? 2.5} · R${info.R ?? 160} · DN15 · Class 2</text>
    <text x="${x0 + wTot + 4}" y="${ry + 12}" font-size="7" fill="${L.ink}">m³</text>
    <text x="100" y="${L.style === 'pointers' ? 29 : 32}" font-size="6" text-anchor="middle" fill="${L.ink}" opacity="0.8">SN ${info.serial || ''}</text>
    <path d="M86,186 L114,186 M108,182 L114,186 L108,190" stroke="${L.ink}" stroke-width="1.4" fill="none" opacity="0.7"/>`;
  let body = '';
  if (L.style === 'subdials') {
    body = subdial(p, 0, 70, 116, 17, L, '×0.0001') + subdial(p, 1, 130, 116, 17, L, '×0.00001')
      + `<g transform="translate(100,150)"><g id="${p}-star">${[0, 60, 120, 180, 240, 300].map((a) => `<path d="M0,0 L2.4,-10 L-2.4,-10 Z" fill="${L.accent}" transform="rotate(${a})"/>`).join('')}</g><circle r="2" fill="${L.ink}"/></g>`;
  } else if (L.style === 'sweep') {
    const nums = Array.from({ length: 10 }, (_, k) => { const a = k / 10 * Math.PI * 2; return `<text x="${r1(100 + Math.sin(a) * 66)}" y="${r1(100 - Math.cos(a) * 66 + 3.6)}" font-size="10" text-anchor="middle" fill="${L.ink}" font-weight="600">${k}</text>`; }).join('');
    body = ticks(100, 100, 75, 81, 50, L.ink, 0.8, 5, 4) + nums
      + `<text x="100" y="132" font-size="6.4" text-anchor="middle" fill="${L.ink}">×0.0001 m³</text>`
      + `<g transform="translate(100,148)"><g id="${p}-star">${[0, 90, 180, 270].map((a) => `<path d="M0,0 L2.6,-8 L-2.6,-8 Z" fill="${L.accent}" transform="rotate(${a})"/>`).join('')}</g></g>`
      + `<g id="${p}-sub0"><path d="M100,30 L103,100 L100,118 L97,100 Z" fill="${L.accent}"/></g><circle cx="100" cy="100" r="5" fill="${L.accent}"/><circle cx="100" cy="100" r="2" fill="#FFFFFF"/>`;
  } else {
    const lab = ['×0.001', '×0.0001', '×0.00001'];
    body = [0, 1, 2].map((i) => subdial(p, i, 58 + i * 42, 114, 16, L, lab[i])).join('')
      + `<g transform="translate(100,152)"><g id="${p}-star"><path d="M-9,0 L9,0 M0,-9 L0,9" stroke="${L.accent}" stroke-width="3" stroke-linecap="round"/><circle r="9" fill="none" stroke="${L.accent}" stroke-width="1"/></g></g>`;
  }
  return `${rim}${label}${drums}${digits}${body}<circle cx="100" cy="100" r="84" fill="url(#${p}-gl)" pointer-events="none"/>`;
}
// Turn the drums and pointers. reading in litres.
export function updateDial(root, p, modelName, reading) {
  const L = (MODELS[modelName] || MODELS.SMCV4).look, q = (id) => root.querySelector('#' + p + '-' + id);
  const m3 = Math.floor(reading / 1000), litres = reading - m3 * 1000;
  const b = q('blk'), rd = q('red');
  if (!b) return;
  b.textContent = String(m3 % 10 ** L.blk).padStart(L.blk, '0');
  rd.textContent = L.red === 4 ? String(Math.floor(litres * 10)).padStart(4, '0') : L.red === 2 ? String(Math.floor(litres / 10)).padStart(2, '0') : String(Math.floor(litres)).padStart(3, '0');
  const rot = (el, deg, cx, cy) => { if (el) el.setAttribute('transform', `rotate(${(deg % 360).toFixed(1)} ${cx} ${cy})`); };
  const frac = (v) => v - Math.floor(v);
  if (L.style === 'subdials') {
    rot(q('sub0'), frac(reading / 1) * 360, 70, 116);       // 1 L per turn  (0.1 L per division)
    rot(q('sub1'), frac(reading / 0.1) * 360, 130, 116);    // 0.1 L per turn
  } else if (L.style === 'sweep') {
    rot(q('sub0'), frac(reading) * 360, 100, 100);          // 1 L per turn
  } else {
    [10, 1, 0.1].forEach((d, i) => rot(q('sub' + i), frac(reading / d) * 360, 58 + i * 42, 114));
  }
  const st = q('star'); if (st) st.setAttribute('transform', `rotate(${(frac(reading / 0.05) * 360).toFixed(1)})`);
}

// ---------------------------------------------------------------- animated schematic
const f1 = (v) => v.toFixed(1);
export function createBenchView(opts = {}) {
  const lang = opts.lang || (() => 'th');
  const host = document.createElement('div');
  host.className = 'bench';
  const s = [];
  const HY = 150; // header pipe y
  const pipe = (pts, id) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#0B1224" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#3A4A6E" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><polyline id="${id}" class="bn-flow" points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#8FD0FF" stroke-width="3.5" stroke-dasharray="7 13" stroke-linecap="round" opacity="0"/>`;
  const valve = (id, x, y, vertical, label) => `<g class="bn-valve" data-bench="valve" data-arg="${id}" transform="translate(${x},${y})${vertical ? ' rotate(90)' : ''}"><rect x="-20" y="-20" width="40" height="40" fill="transparent"/><path id="bn-v-${id}" d="M-14,-10 L0,0 L-14,10 Z M14,-10 L0,0 L14,10 Z" fill="#475569" stroke="#E6EEF8" stroke-width="1.8" stroke-linejoin="round"/><line x1="0" y1="0" x2="0" y2="-14" stroke="#E6EEF8" stroke-width="2"/><rect x="-9" y="-19" width="18" height="5" rx="2" fill="#F5B820"/></g><text x="${x + (vertical ? 22 : 0)}" y="${y + (vertical ? 4 : 30)}" class="bn-tag" text-anchor="${vertical ? 'start' : 'middle'}">${label}</text>`;
  s.push(`<defs>
    <linearGradient id="bn-water" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0E4FD8"/><stop offset="0.5" stop-color="#3B82F6"/><stop offset="1" stop-color="#0A3BA8"/></linearGradient>
    <linearGradient id="bn-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9D8F0" stop-opacity="0.10"/><stop offset="0.35" stop-color="#F2F7FF" stop-opacity="0.28"/><stop offset="1" stop-color="#C9D8F0" stop-opacity="0.08"/></linearGradient>
    <linearGradient id="bn-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#55627E"/><stop offset="0.45" stop-color="#B9C6DE"/><stop offset="1" stop-color="#3A4560"/></linearGradient>
    <radialGradient id="bn-hot"><stop offset="0" stop-color="#FFB020" stop-opacity="0.9"/><stop offset="1" stop-color="#FF7A00" stop-opacity="0"/></radialGradient>
    <pattern id="bn-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1B2742" stroke-width="1"/></pattern>
  </defs>
  <rect x="0" y="0" width="1345" height="620" fill="url(#bn-grid)"/>`);
  // supply tank + pump
  s.push(`<rect x="28" y="330" width="104" height="175" rx="10" fill="#141C2E" stroke="#5B6680" stroke-width="2"/><rect id="bn-supply" x="31" y="372" width="98" height="130" rx="7" fill="url(#bn-water)" opacity="0.85"/><text x="80" y="322" class="bn-tag" text-anchor="middle">TK-SUP</text>`);
  s.push(pipe([[132, 480], [190, 480]], 'bn-f-suc'));
  s.push(pipe([[190, 480], [190, HY], [960, HY], [1185, HY]], 'bn-f-main'));
  s.push(`<g data-bench="info" data-arg="pump"><circle cx="190" cy="480" r="26" fill="#1F5FFF" stroke="#E6EEF8" stroke-width="2"/><g transform="translate(190,480)"><g id="bn-imp">${[0, 60, 120, 180, 240, 300].map((a) => `<line x1="0" y1="0" x2="17" y2="0" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" transform="rotate(${a})"/>`).join('')}</g></g></g><text x="190" y="525" class="bn-tag" text-anchor="middle">PU-01 · VFD</text>`);
  // instruments on header
  const gauge = (x, id, label) => `<g data-bench="info" data-arg="${id}"><line x1="${x}" y1="${HY}" x2="${x}" y2="${HY - 34}" stroke="#8B97B3" stroke-width="3"/><circle cx="${x}" cy="${HY - 50}" r="18" fill="#E6EEF8" stroke="#8B97B3" stroke-width="3"/><line id="bn-n-${id}" x1="${x}" y1="${HY - 50}" x2="${x}" y2="${HY - 64}" stroke="#C2410C" stroke-width="2.5" stroke-linecap="round"/></g><text x="${x}" y="${HY - 76}" class="bn-tag" text-anchor="middle">${label}</text><text id="bn-t-${id}" x="${x}" y="${HY - 92}" class="bn-val" text-anchor="middle">—</text>`;
  s.push(gauge(250, 'PT-01', 'PT-01'));
  s.push(`<g><path d="M285,${HY - 12} L315,${HY - 12} L322,${HY} L315,${HY + 12} L285,${HY + 12} L278,${HY} Z" fill="#55627E" stroke="#8B97B3" stroke-width="1.5"/><path d="M300,${HY + 12} L300,${HY + 30} L292,${HY + 30} L308,${HY + 30}" stroke="#8B97B3" stroke-width="3" fill="none"/></g><text x="300" y="${HY + 50}" class="bn-tag" text-anchor="middle">STRAINER</text>`);
  // meters under test
  [[370, 'M1'], [500, 'M2'], [630, 'M3']].forEach(([x, id]) => {
    s.push(`<g class="bn-meter" data-bench="meter" data-arg="${id}"><rect x="${x - 40}" y="${HY - 13}" width="80" height="26" rx="6" fill="url(#bn-steel)"/><rect x="${x - 46}" y="${HY - 11}" width="8" height="22" rx="2" fill="#8B97B3"/><rect x="${x + 38}" y="${HY - 11}" width="8" height="22" rx="2" fill="#8B97B3"/><g id="bn-dial-${id}" transform="translate(${x - 37},${HY - 104}) scale(0.37)"></g><rect x="${x - 50}" y="${HY + 22}" width="100" height="26" rx="5" fill="#05080F" stroke="#3A4A6E"/><text id="bn-reg-${id}" x="${x}" y="${HY + 41}" class="bn-reg" text-anchor="middle">0000.00</text><rect id="bn-sel-${id}" x="${x - 58}" y="${HY - 112}" width="116" height="166" rx="12" fill="none" stroke="#5B9BFF" stroke-width="2" stroke-dasharray="6 5"/></g><text id="bn-lbl-${id}" x="${x}" y="${HY + 70}" class="bn-tag" text-anchor="middle">${id}</text><text id="bn-e-${id}" x="${x}" y="${HY + 88}" class="bn-val" text-anchor="middle"></text>`);
  });
  s.push(gauge(720, 'PT-02', 'PT-02'));
  s.push(`<g data-bench="info" data-arg="FT-01"><rect x="770" y="${HY - 18}" width="64" height="36" rx="8" fill="#2B3A5E" stroke="#8B97B3" stroke-width="2"/><rect x="782" y="${HY - 64}" width="40" height="46" rx="6" fill="#1A2234" stroke="#8B97B3" stroke-width="2"/><rect x="772" y="${HY - 104}" width="60" height="36" rx="6" fill="#05080F" stroke="#3A4A6E"/><text id="bn-ft" x="802" y="${HY - 82}" class="bn-reg" text-anchor="middle" style="font-size:13px">0.0</text></g><text x="802" y="${HY + 34}" class="bn-tag" text-anchor="middle">FT-01 (REF)</text><text x="802" y="${HY + 50}" class="bn-tag" text-anchor="middle" style="opacity:0.7">L/h</text>`);
  s.push(`<g data-bench="info" data-arg="FCV"><path d="M858,${HY - 12} L880,${HY} L858,${HY + 12} Z M902,${HY - 12} L880,${HY} L902,${HY + 12} Z" fill="#3B82F6" stroke="#E6EEF8" stroke-width="1.8"/><line x1="880" y1="${HY}" x2="880" y2="${HY - 26}" stroke="#E6EEF8" stroke-width="2"/><path d="M866,${HY - 26} A14,10 0 0 1 894,${HY - 26} Z" fill="#8B97B3"/></g><text x="880" y="${HY + 34}" class="bn-tag" text-anchor="middle">FCV-01</text><text id="bn-fcv" x="880" y="${HY - 38}" class="bn-val" text-anchor="middle">0%</text>`);
  s.push(gauge(925, 'TT-01', 'TT-01'));
  // branch to small tank + large tank
  s.push(pipe([[960, HY], [960, 282]], 'bn-f-s'));
  s.push(pipe([[1185, HY], [1185, 190]], 'bn-f-l'));
  s.push(valve('in', 230, HY, false, 'XV-IN'));
  s.push(valve('s', 960, 215, true, 'XV-S'));
  s.push(valve('l', 1185, 172, true, 'XV-L'));
  // tanks
  const tankSvg = (k, cx, bottom, side = 'left') => {
    const T = TANKS[k]; let y = bottom; const parts = [], water = [], scale = [];
    for (const [i, sec] of T.sections.entries()) {
      const yTop = y - sec.h;
      parts.push(`<rect x="${f1(cx - sec.w / 2)}" y="${f1(yTop)}" width="${sec.w}" height="${sec.h}" fill="#101828"/>`);
      water.push(`<rect class="bn-w" data-tank="${k}" data-i="${i}" data-y0="${y}" data-h="${sec.h}" data-v0="${sec.v0}" data-v1="${sec.v1}" x="${f1(cx - sec.w / 2 + 1)}" y="${y}" width="${sec.w - 2}" height="0" fill="url(#bn-water)"/>`);
      if (sec.w < 40 && i < T.sections.length - 1) {
        // graduated neck scale
        const steps = 10;
        const sx = side === 'left' ? cx + sec.w / 2 : cx - sec.w / 2, dir = side === 'left' ? 1 : -1;
        for (let j = 0; j <= steps; j++) { const yy = y - sec.h * j / steps; scale.push(`<line x1="${f1(sx)}" y1="${f1(yy)}" x2="${f1(sx + dir * (j % 5 === 0 ? 12 : 6))}" y2="${f1(yy)}" stroke="#C3CEE0" stroke-width="1"/>`); }
      }
      y = yTop;
    }
    const outline = (() => { // outline path around stacked sections
      let yy = bottom; const left = [], right = [];
      for (const sec of T.sections) { left.push([cx - sec.w / 2, yy], [cx - sec.w / 2, yy - sec.h]); right.push([cx + sec.w / 2, yy], [cx + sec.w / 2, yy - sec.h]); yy -= sec.h; }
      const pts = [...left, ...right.reverse()];
      return `<polygon points="${pts.map((p) => p.map(f1).join(',')).join(' ')}" fill="url(#bn-glass)" stroke="#9FB0CE" stroke-width="2"/>`;
    })();
    const sens = T.sensors.map((sn) => {
      const yy = volToY(T, bottom, sn.v), sec = secAt(T, sn.v), d = side === 'left' ? -1 : 1, xs = cx + d * (sec.w / 2 + 6);
      return `<g data-bench="sensor" data-arg="${sn.id}"><line x1="${f1(xs + d * 30)}" y1="${f1(yy)}" x2="${f1(xs)}" y2="${f1(yy)}" stroke="#8B97B3" stroke-width="2"/><circle class="bn-sensor" data-tank="${k}" data-v="${sn.v}" data-kind="${sn.kind}" cx="${f1(xs + d * 34)}" cy="${f1(yy)}" r="7" fill="#334155" stroke="#E6EEF8" stroke-width="1.5"/><text x="${f1(xs + d * 46)}" y="${f1(yy + 4)}" class="bn-tag" text-anchor="${side === 'left' ? 'end' : 'start'}">${sn.id}</text></g>`;
    }).join('');
    const total = T.sections.reduce((a, q) => a + q.h, 0);
    return `<g data-bench="tank" data-arg="${k}">${parts.join('')}${water.join('')}${outline}${scale.join('')}${sens}<rect x="${f1(cx - 8)}" y="${bottom}" width="16" height="14" fill="#55627E"/></g>
      ${side === 'left'
        ? `<text x="${cx}" y="${f1(bottom - total - 28)}" class="bn-tag" text-anchor="middle">${T.name}</text><text id="bn-vol-${k}" x="${cx}" y="${f1(bottom - total - 12)}" class="bn-val" text-anchor="middle">0.00 L</text>`
        : `<text x="${f1(cx - T.sections[0].w / 2 - 10)}" y="${f1(bottom - 80)}" class="bn-tag" text-anchor="end">${T.name}</text><text id="bn-vol-${k}" x="${f1(cx - T.sections[0].w / 2 - 10)}" y="${f1(bottom - 62)}" class="bn-val" text-anchor="end">0.00 L</text>`}`;
  };
  s.push(tankSvg('S', 960, 506));
  s.push(tankSvg('L', 1185, 506, 'right'));
  // LT radar on large tank
  s.push(`<g data-bench="info" data-arg="LT-01"><rect x="1204" y="168" width="26" height="16" rx="3" fill="#8B97B3"/><path d="M1210,184 L1224,184 L1220,196 L1214,196 Z" fill="#55627E"/></g><text x="1236" y="172" class="bn-tag">LT-01</text>`);
  // drains back to supply
  s.push(pipe([[960, 520], [960, 548], [80, 548], [80, 505]], 'bn-f-ds'));
  s.push(pipe([[1185, 520], [1185, 548], [960, 548]], 'bn-f-dl'));
  s.push(valve('ds', 905, 548, false, 'XV-DS'));
  s.push(valve('dl', 1110, 548, false, 'XV-DL'));
  // overflow alarm glow
  s.push(`<circle id="bn-alarm" cx="1185" cy="200" r="60" fill="url(#bn-hot)" opacity="0"/>`);
  host.innerHTML = `<div class="bench-scroll"><svg class="bench-svg" viewBox="0 20 1345 580" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Water meter test bench">${s.join('')}</svg></div>`;
  const svg = host.querySelector('svg');
  const $ = (id) => svg.querySelector('#' + id);
  let raf = 0, alive = true, sim = null, last = performance.now(), imp = 0;
  // big dial panel (mounted separately by the app)
  const dials = document.createElement('div');
  dials.className = 'dials';
  let dialKey = '';
  const TX = { th: { start: 'ค่าเริ่มต้น', now: 'ค่าขณะนี้', end: 'ค่าสิ้นสุด', vm: 'มาตรวัดได้', ref: 'ถังตวง (อ้างอิง)', err: 'ค่าผิดพลาด', off: 'ไม่ได้ทดสอบ', readS: 'อ่านค่าเริ่มต้นแล้ว', readE: 'อ่านค่าสิ้นสุดแล้ว', unit: 'ลิตร' },
    en: { start: 'Start', now: 'Now', end: 'End', vm: 'Meter volume', ref: 'Proving tank (ref.)', err: 'Error', off: 'Not under test', readS: 'Start read', readE: 'End read', unit: 'L' } };
  function rebuild() {
    const L = TX[lang()] || TX.th;
    for (const m of sim.meters) {
      const g = $('bn-dial-' + m.id);
      g.innerHTML = dialSvg('bd' + m.id, m.model, { q3: sim.q3, R: sim.R, serial: sim.serials[m.id] });
      $('bn-lbl-' + m.id).textContent = `${m.id} · ${m.model}`;
    }
    dials.innerHTML = sim.meters.map((m) => `<div class="dcard" data-pos="${m.id}">
      <div class="dhead"><b style="color:${POS_COLORS[m.id]}">${m.id}</b><span>${m.model}</span><small>SN ${sim.serials[m.id]}</small></div>
      <div class="dflash" id="df-${m.id}"></div>
      <svg viewBox="0 0 200 200" class="dial-svg" role="img" aria-label="${m.id} ${m.model}">${dialSvg('dd' + m.id, m.model, { q3: sim.q3, R: sim.R, serial: sim.serials[m.id] })}</svg>
      <dl class="dread">
        <dt>${L.start}</dt><dd id="ds-${m.id}">—</dd>
        <dt id="dnl-${m.id}">${L.now}</dt><dd id="dn-${m.id}">—</dd>
        <dt>${L.vm}</dt><dd id="dv-${m.id}">—</dd>
        <dt>${L.ref}</dt><dd id="dr-${m.id}">—</dd>
        <dt>${L.err}</dt><dd id="de-${m.id}">—</dd>
      </dl></div>`).join('');
  }
  function updatePanel() {
    const L = TX[lang()] || TX.th, r = sim.run, q = (id) => dials.querySelector('#' + id);
    const last = {}; for (const x of sim.results) last[x.meter] = x;
    for (const m of sim.meters) {
      updateDial(dials, 'dd' + m.id, m.model, m.reading);
      const card = q(`df-${m.id}`).parentElement; card.classList.toggle('off', !sim.selected[m.id]);
      const res = !r ? last[m.id] : null;
      const start = r ? r.start[m.id] : res ? res.start : null;
      const end = r ? r.end[m.id] : res ? res.end : null;
      q('ds-' + m.id).textContent = start != null ? start.toFixed(2) + ' ' + L.unit : '—';
      q('dnl-' + m.id).textContent = end != null ? L.end : L.now;
      q('dn-' + m.id).textContent = (end != null ? end : quant(m.reading, 0.05)).toFixed(2) + ' ' + L.unit;
      const vm = start != null ? (end != null ? end : m.reading) - start : null;
      q('dv-' + m.id).textContent = vm != null ? vm.toFixed(2) + ' ' + L.unit : '—';
      const ref = r ? (r.vref != null ? r.vref : sim.tank[r.tank]) : res ? res.vref : null;
      q('dr-' + m.id).textContent = ref != null ? ref.toFixed(3) + ' ' + L.unit : '—';
      const e = r && r.vref != null && end != null ? (vm - r.vref) / r.vref * 100 : !r && res ? res.e : null;
      const de = q('de-' + m.id);
      de.textContent = !sim.selected[m.id] ? L.off : e != null ? `${e >= 0 ? '+' : ''}${e.toFixed(2)} %` : '—';
      de.className = e == null ? '' : res && !res.pass ? 'bad' : 'good';
      const fl = q('df-' + m.id), lr = sim.lastRead, on = lr && performance.now() - lr.at < 2200;
      fl.textContent = on ? `📷 ${lr.kind === 'start' ? L.readS : L.readE} · ${lr.key}` : '';
      fl.classList.toggle('on', !!on);
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!sim) return;
    sim.tick(dt);
    const key = [sim.model, sim.q3, sim.R, lang(), ...sim.meters.map((m) => sim.serials[m.id])].join('|');
    if (key !== dialKey) { dialKey = key; rebuild(); }
    if (dials.isConnected) updatePanel();
    if (!host.isConnected) return;
    const t = now / 1000, flowing = sim.Q > 0.5;
    imp = (imp + (sim.v.in ? 900 : 0) * dt) % 360;
    $('bn-imp').setAttribute('transform', `rotate(${imp.toFixed(1)})`);
    const off = (-t * 40).toFixed(1);
    const fl = { 'bn-f-suc': flowing, 'bn-f-main': flowing, 'bn-f-s': flowing && sim.v.s, 'bn-f-l': flowing && sim.v.l, 'bn-f-ds': sim.v.ds && sim.tank.S > 0 || sim.v.dl && sim.tank.L > 0, 'bn-f-dl': sim.v.dl && sim.tank.L > 0 };
    for (const [id, on] of Object.entries(fl)) { const el = $(id); el.setAttribute('opacity', on ? '1' : '0'); el.setAttribute('stroke-dashoffset', off); }
    for (const [k, id] of [['in', 'in'], ['s', 's'], ['l', 'l'], ['ds', 'ds'], ['dl', 'dl']]) $('bn-v-' + id).setAttribute('fill', sim.v[k] ? '#1F5FFF' : '#475569');
    // water in tanks
    for (const r of svg.querySelectorAll('.bn-w')) {
      const V = sim.tank[r.dataset.tank], v0 = +r.dataset.v0, v1 = +r.dataset.v1, h = +r.dataset.h, y0 = +r.dataset.y0;
      const k = clamp((V - v0) / (v1 - v0), 0, 1);
      r.setAttribute('y', f1(y0 - h * k)); r.setAttribute('height', f1(h * k));
    }
    for (const c of svg.querySelectorAll('.bn-sensor')) {
      const wet = sim.tank[c.dataset.tank] >= +c.dataset.v;
      const kind = c.dataset.kind;
      c.setAttribute('fill', wet ? (kind === 'high' ? '#F59E0B' : kind === 'target' ? '#22D3EE' : '#3B82F6') : '#334155');
      c.style.filter = wet ? `drop-shadow(0 0 5px ${kind === 'high' ? '#F59E0B' : '#22D3EE'})` : 'none';
    }
    $('bn-vol-S').textContent = sim.tank.S.toFixed(2) + ' L';
    $('bn-vol-L').textContent = sim.tank.L.toFixed(2) + ' L';
    $('bn-supply').setAttribute('opacity', (0.8 + 0.05 * Math.sin(t * 2)).toFixed(2));
    // meters
    for (const m of sim.meters) {
      updateDial(svg, 'bd' + m.id, m.model, m.reading);
      $('bn-reg-' + m.id).textContent = quant(m.reading, 0.05).toFixed(2).padStart(8, '0');
      $('bn-sel-' + m.id).setAttribute('opacity', sim.selected[m.id] ? '1' : '0');
      $('bn-e-' + m.id).textContent = sim.Q > 0.5 ? `${sim.meterError(m, sim.Q) >= 0 ? '+' : ''}${sim.meterError(m, sim.Q).toFixed(2)} %*` : '';
    }
    $('bn-ft').textContent = sim.Q.toFixed(1);
    $('bn-fcv').textContent = Math.round(clamp(sim.Qset / 3125, 0, 1) * 100) + '%';
    $('bn-t-PT-01').textContent = sim.p1.toFixed(2) + ' bar';
    $('bn-t-PT-02').textContent = sim.p2.toFixed(2) + ' bar';
    $('bn-t-TT-01').textContent = sim.temp.toFixed(1) + ' °C';
    for (const [id, v, max] of [['PT-01', sim.p1, 6], ['PT-02', sim.p2, 6], ['TT-01', sim.temp, 50]]) {
      const a = -120 + clamp(v / max, 0, 1) * 240, x = { 'PT-01': 250, 'PT-02': 720, 'TT-01': 925 }[id];
      $('bn-n-' + id).setAttribute('transform', `rotate(${a.toFixed(1)} ${x} ${150 - 50})`);
    }
    $('bn-alarm').setAttribute('opacity', sim.alarm ? (0.5 + 0.5 * Math.sin(t * 9)).toFixed(2) : '0');
  }
  raf = requestAnimationFrame(frame);
  return { el: host, dials, attach(s2) { sim = s2; }, destroy() { alive = false; cancelAnimationFrame(raf); } };
}
function secAt(T, v) { return T.sections.find((s) => v >= s.v0 && v <= s.v1) || T.sections[T.sections.length - 1]; }
function volToY(T, bottom, v) { let y = bottom; for (const s of T.sections) { if (v <= s.v1) return y - s.h * (v - s.v0) / (s.v1 - s.v0); y -= s.h; } return y; }

// Error curve chart (SVG string): MPE envelope + one series per meter
export function errorChart(results, pts, lang) {
  const W = 640, H = 276, L = 46, Rr = 40, T = 14, Bm = 50;
  const lx = (Q) => L + (Math.log10(Q) - Math.log10(pts.Q1 * 0.8)) / (Math.log10(pts.Q4 * 1.1) - Math.log10(pts.Q1 * 0.8)) * (W - L - Rr);
  const ly = (e) => T + (6 - clamp(e, -6, 6)) / 12 * (H - T - Bm);
  const env = (sign) => `M${f1(lx(pts.Q1))},${f1(ly(sign * 5))} L${f1(lx(pts.Q2))},${f1(ly(sign * 5))} L${f1(lx(pts.Q2))},${f1(ly(sign * 2))} L${f1(lx(pts.Q4))},${f1(ly(sign * 2))}`;
  const colors = { M1: '#3B82F6', M2: '#22D3EE', M3: '#F5B820' };
  const series = Object.keys(colors).map((id) => {
    const r = results.filter((x) => x.meter === id).sort((a, b) => a.Q - b.Q);
    if (!r.length) return '';
    return `<polyline points="${r.map((x) => `${f1(lx(x.Q))},${f1(ly(x.e))}`).join(' ')}" fill="none" stroke="${colors[id]}" stroke-width="2"/>${r.map((x) => `<circle cx="${f1(lx(x.Q))}" cy="${f1(ly(x.e))}" r="5" fill="${x.pass ? colors[id] : '#DC2626'}" stroke="#0B1430" stroke-width="1.5"/>`).join('')}`;
  }).join('');
  const ticks = [-6, -4, -2, 0, 2, 4, 6].map((e) => `<line x1="${L}" x2="${W - Rr}" y1="${f1(ly(e))}" y2="${f1(ly(e))}" stroke="${e === 0 ? '#5F6B86' : '#1C2850'}" stroke-width="1"/><text x="${L - 8}" y="${f1(ly(e) + 4)}" class="ch-t" text-anchor="end">${e > 0 ? '+' : ''}${e}%</text>`).join('');
  const qs = [['Q1', pts.Q1], ['Q2', pts.Q2], ['Q3', pts.Q3], ['Q4', pts.Q4]].map(([k, q]) => `<line x1="${f1(lx(q))}" x2="${f1(lx(q))}" y1="${T}" y2="${H - Bm}" stroke="#1C2850" stroke-dasharray="3 4"/><text x="${f1(lx(q))}" y="${H - Bm + 16}" class="ch-t" text-anchor="middle">${k}</text><text x="${f1(lx(q))}" y="${H - Bm + (k === 'Q4' ? 44 : 30)}" class="ch-t" text-anchor="middle" style="opacity:0.7">${q >= 1000 ? (q / 1000).toFixed(2) + ' m³/h' : q.toFixed(1) + ' L/h'}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${lang === 'th' ? 'กราฟค่าผิดพลาดเทียบเกณฑ์' : 'Error curve versus MPE'}" class="err-chart">${ticks}${qs}<path d="${env(1)}" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 4"/><path d="${env(-1)}" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 4"/>${series}</svg>`;
}
