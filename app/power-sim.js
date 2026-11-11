// CoreDash Nexus — plant power simulation: electroplating shop + brass melting/rolling mill.
// Developed by CoreDash Technology.
//
// Each machine is modelled the way power electronics textbooks describe it:
//   P   active power (kW)                       — does the work
//   Q   fundamental reactive power (kvar)        — Q = P·tan φ1 (displacement)
//   D   distortion power (kVA)                   — from harmonic currents, D = √3·V·I_h
//   S   apparent power (kVA)                     — S = √(P² + Q² + D²)   (Budeanu)
//   cos φ1  displacement power factor            — what a capacitor can fix
//   THD-I   current total harmonic distortion    — what a filter can fix
//   true PF = P / S = cos φ1 / √(1 + THD²)       (sinusoidal supply voltage)
// Typical behaviour used below:
//   • 6-pulse SCR rectifier (plating): cos φ1 ≈ 0.955·Vdc/Vd0 (firing angle α) — poor when a 24 V unit runs at 8–12 V; THD ≈ 30 %
//   • SCR phase-angle heater control: true PF ≈ √(power fraction); burst (zero-cross) firing gives PF ≈ 1
//   • DC thyristor mill drive: cos φ1 ∝ armature voltage ∝ speed — very poor while threading at low speed
//   • Diode-front VFD: cos φ1 ≈ 0.96 but THD 35–45 %;  Active Front End (AFE): PF ≈ 0.99, THD < 5 %, regenerates when braking
//   • Induction motors: PF falls sharply at light load (unloaded compressor ≈ 0.4)
// Figures are SIMULATED for demonstration; they follow typical published values, not measurements of a real plant.

const B = (th, en) => ({ th, en });
export const V_LL = 400;                 // low-voltage bus, 3-phase
export const TR_KVA = 1600;              // transformer 22 kV / 400 V
export const SQ3 = Math.sqrt(3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => x * x * (3 - 2 * x);
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// area: plating | rolling | utility ;  kind decides the electrical model
export const MACHINES = [
  { id: 'REC-1', area: 'plating', kind: 'scr', rated: 60, name: B('เรกติไฟเออร์ชุบนิกเกิล', 'Nickel plating rectifier'), spec: '6-pulse SCR · 24 V / 3,000 A', Vd0: 24, Vset: 11, Idc: 3000, tank: 2, phase: 0 },
  { id: 'REC-2', area: 'plating', kind: 'scr', rated: 120, name: B('เรกติไฟเออร์ชุบโครเมียม', 'Chrome plating rectifier'), spec: '6-pulse SCR · 18 V / 6,000 A', Vd0: 18, Vset: 9, Idc: 6000, tank: 4, phase: 30 },
  { id: 'REC-3', area: 'plating', kind: 'scr', rated: 24, name: B('เรกติไฟเออร์ชุบทองเหลือง', 'Brass plating rectifier'), spec: '6-pulse SCR · 12 V / 2,000 A', Vd0: 12, Vset: 5, Idc: 2000, tank: 5, phase: 60 },
  { id: 'HTR-1', area: 'plating', kind: 'heater', rated: 45, name: B('ฮีตเตอร์บ่อชุบ', 'Bath heaters'), spec: '3 × 15 kW · thermostat', phase: 10 },
  { id: 'SCB-1', area: 'plating', kind: 'motor', rated: 18.5, name: B('พัดลมสครับเบอร์ดูดไอกรด', 'Fume scrubber fan'), spec: 'IE1 motor · DOL', load: 0.62, cosR: 0.84, eff: 0.88 },
  { id: 'PMP-1', area: 'plating', kind: 'motor', rated: 15, name: B('ปั๊มกรองน้ำยา (4 ตัว)', 'Bath filter pumps (4)'), spec: '4 × 3.7 kW · oversized', load: 0.34, cosR: 0.8, eff: 0.84 },
  { id: 'IF-1', area: 'rolling', kind: 'furnace', rated: 350, name: B('เตาหลอมเหนี่ยวนำทองเหลือง', 'Induction melting furnace'), spec: 'Thyristor, 6-pulse · 350 kW' },
  { id: 'MILL-1', area: 'rolling', kind: 'mill', rated: 250, name: B('มอเตอร์ลูกรีด (แท่นรีดกลับทาง)', 'Reversing mill main drive'), spec: 'DC motor · thyristor converter' },
  { id: 'CL-1', area: 'rolling', kind: 'coiler', rated: 110, name: B('ม้วนเข้า/ม้วนออก (2 ตัว)', 'Coiler + uncoiler'), spec: '2 × 55 kW VFD, diode front end' },
  { id: 'ANN-1', area: 'rolling', kind: 'phase', rated: 150, name: B('เตาอบอ่อน (Annealing)', 'Annealing furnace'), spec: 'SCR phase-angle control · 150 kW' },
  { id: 'HYD-1', area: 'rolling', kind: 'motor', rated: 37, name: B('ชุดไฮดรอลิกแท่นรีด', 'Mill hydraulic unit'), spec: 'IE1 motor', load: 0.45, cosR: 0.85, eff: 0.9 },
  { id: 'CMP-1', area: 'utility', kind: 'comp', rated: 75, name: B('ปั๊มลม (โหลด/อันโหลด)', 'Air compressor (load/unload)'), spec: 'Fixed speed · 75 kW' },
  { id: 'CHL-1', area: 'utility', kind: 'motor', rated: 90, name: B('ชิลเลอร์ + คูลลิ่งทาวเวอร์', 'Chiller + cooling tower'), spec: 'Screw chiller', load: 0.72, cosR: 0.86, eff: 0.93 },
  { id: 'LGT-1', area: 'utility', kind: 'led', rated: 30, name: B('แสงสว่าง + สำนักงาน', 'Lighting + offices'), spec: 'LED drivers' }
];

// Improvements the management can switch on. cost in THB (rough budgetary figures, editable in the app)
export const FIXES = [
  { id: 'cap', cost: 840000, name: B('ตู้คาปาซิเตอร์อัตโนมัติ + รีแอคเตอร์ 7%', 'Automatic capacitor bank, 7 % detuned'), what: B('ชดเชย kvar ที่แผงเมน ตั้งเป้า cos φ 0.97 แบบสเต็ป 12 × 25 kvar รีแอคเตอร์ 7% กันเรโซแนนซ์ฮาร์มอนิก', 'Compensates kvar at the main board to cos φ 0.97 in 12 × 25 kvar steps; 7 % reactors prevent harmonic resonance') },
  { id: 'ahf', cost: 1500000, name: B('แอคทีฟฮาร์มอนิกฟิลเตอร์ 300 A', 'Active harmonic filter 300 A'), what: B('ฉีดกระแสหักล้างฮาร์มอนิก ลด THD-I ทั้งโรงงาน เพิ่ม PF จริง ลดความร้อนหม้อแปลง/สาย', 'Injects cancelling current, cuts plant THD-I, raises true PF, cools the transformer and cables') },
  { id: 'igbt', cost: 2400000, name: B('เปลี่ยนเรกติไฟเออร์ชุบเป็น IGBT สวิตชิ่ง', 'Switch-mode IGBT plating rectifiers'), what: B('แทน SCR 6 พัลส์: PF ≈ 0.99, THD < 5%, ประสิทธิภาพ 82% → 92% และคุมกระแสชุบได้นิ่งกว่า', 'Replaces 6-pulse SCR: PF ≈ 0.99, THD < 5 %, efficiency 82 % → 92 %, steadier plating current') },
  { id: 'afe', cost: 4500000, name: B('ไดรฟ์แท่นรีด AC + Active Front End', 'Mill AC drive with Active Front End'), what: B('แทนไดรฟ์ DC ไทริสเตอร์: PF ≈ 0.99 ทุกความเร็ว คืนพลังงานตอนเบรก (Regenerative)', 'Replaces the DC thyristor drive: PF ≈ 0.99 at any speed, returns energy while braking') },
  { id: 'vsd', cost: 950000, name: B('ปั๊มลมแบบปรับรอบ (VSD)', 'Variable-speed compressor'), what: B('ตัดช่วงเดินตัวเปล่า (unload) ที่กินไฟ 30% ที่ PF 0.4', 'Removes unloaded running that draws 30 % power at PF 0.4') },
  { id: 'burst', cost: 120000, name: B('เตาอบ: เปลี่ยนเป็นจุดชนวนแบบ Zero-cross', 'Annealing: zero-cross (burst) firing'), what: B('เปลี่ยนวิธีคุม SCR จาก phase-angle เป็น burst firing: PF ≈ 1, ไม่สร้างฮาร์มอนิก', 'SCR control from phase-angle to burst firing: PF ≈ 1, no harmonics') },
  { id: 'ie3', cost: 380000, name: B('มอเตอร์ IE3 + เลือกขนาดให้พอดีงาน', 'IE3 motors, right-sized'), what: B('ปั๊ม/พัดลม/ไฮดรอลิก ใช้มอเตอร์ประสิทธิภาพสูงขนาดพอดี: PF และประสิทธิภาพสูงขึ้น', 'Pumps, fans, hydraulics on right-sized premium motors: higher PF and efficiency') }
];

export const TARIFF_DEFAULT = { energy: 4.2, demand: 210, pf: 56.07, hours: 600, pfLimit: 0.6197 };

// ---------------------------------------------------------------- one machine at time t
// returns { P (kW, may be < 0 when regenerating), cos (displacement), thd (0..), act (0..1 visual activity), extra }
export function machineAt(m, t, fx) {
  const n = (k) => 1 + 0.015 * Math.sin(t * 1.7 + k) + 0.01 * Math.sin(t * 5.3 + k * 2);
  switch (m.kind) {
    case 'scr': {
      // hoist cycle 90 s: rack in this tank for ~45 s; current soft-starts, then holds
      const c = (t + m.phase) % 90, inBath = c > 8 && c < 58;
      const k = inBath ? smooth(ramp(c, 8, 12)) * (1 - smooth(ramp(c, 54, 58))) : 0;
      const I = m.Idc * (0.06 + 0.9 * k) * n(m.tank);
      const Vdc = m.Vset * (0.35 + 0.65 * k);
      const Pdc = Vdc * I / 1000;
      if (fx.igbt) return { P: Pdc / 0.92 + 0.3, cos: 0.99, thd: 0.045, act: k, extra: { I, Vdc } };
      return { P: Pdc / 0.82 + 0.6, cos: clamp(0.955 * Vdc / m.Vd0, 0.12, 0.95), thd: 0.31, act: k, extra: { I, Vdc } };
    }
    case 'heater': {
      const on = ((t + m.phase) % 40) < 26;
      return { P: on ? m.rated * n(1) : 0, cos: 1, thd: 0, act: on ? 1 : 0 };
    }
    case 'motor': {
      let load = m.load * n(m.rated);
      if (m.id === 'HYD-1') { const c = t % 24; load = c > 4 && c < 14 ? 0.78 : 0.3; }
      let cosR = m.cosR, eff = m.eff, rated = m.rated;
      if (fx.ie3 && m.id !== 'CHL-1') { cosR += 0.03; eff = Math.min(0.96, eff + 0.04); if (m.id === 'PMP-1') { rated = 7.5; load = Math.min(1, load * 2); } }
      const cos = cosR * clamp((load * 1.12) / (load + 0.12), 0.15, 1);
      return { P: rated * load / eff, cos: clamp(cos, 0.15, 0.95), thd: 0.03, act: load };
    }
    case 'furnace': {
      // melt cycle 120 s: charge → melt → hold → pour
      const c = t % 120;
      const k = c < 15 ? 0.15 : c < 80 ? 0.98 : c < 105 ? 0.32 : 0.06;
      const st = c < 15 ? 'charge' : c < 80 ? 'melt' : c < 105 ? 'hold' : 'pour';
      return { P: m.rated * k * n(3), cos: 0.94, thd: 0.27, act: k, extra: { st, pour: st === 'pour' ? (c - 105) / 15 : 0 } };
    }
    case 'mill': {
      // reversing pass 24 s: accel 0–4, roll 4–14, decel 14–17, reverse / thread 17–24 (slow)
      const c = t % 24, dir = Math.floor(t / 24) % 2 ? -1 : 1;
      const s = c < 4 ? smooth(c / 4) : c < 14 ? 1 : c < 17 ? 1 - smooth((c - 14) / 3) : 0.1;
      const tq = c < 4 ? 0.55 : c < 14 ? 0.92 * n(4) : c < 17 ? -0.45 : 0.18;
      let P = m.rated * s * tq / 0.9 + 4;
      if (fx.afe) return { P: P < 0 ? P * 0.85 : P / 0.97 * 0.9, cos: 0.99, thd: 0.04, act: s, extra: { s: s * dir, tq } };
      if (P < 0) P = 3; // single thyristor bridge cannot regenerate: braking energy is burnt in a resistor
      return { P, cos: clamp(0.9 * Math.max(s, 0.06), 0.06, 0.88), thd: 0.29, act: s, extra: { s: s * dir, tq } };
    }
    case 'coiler': {
      const c = t % 24, s = c < 4 ? smooth(c / 4) : c < 14 ? 1 : c < 17 ? 1 - smooth((c - 14) / 3) : 0.1;
      const P = m.rated * (0.08 + 0.55 * s) * n(5);
      return fx.afe ? { P: P * 0.97, cos: 0.99, thd: 0.04, act: s } : { P, cos: 0.96, thd: 0.42, act: s };
    }
    case 'phase': {
      const k = clamp(0.5 + 0.22 * Math.sin(t / 7) + 0.05 * Math.sin(t * 1.3), 0.2, 1); // PID output (power fraction)
      if (fx.burst) return { P: m.rated * k, cos: 1, thd: 0.01, act: k, extra: { k } };
      // phase-angle on a resistive load: true PF ≈ √k, split into displacement and distortion
      const cos = clamp(Math.sqrt(k) * 1.04, 0.2, 0.99), pf = Math.sqrt(k);
      const thd = Math.sqrt(Math.max(0, (cos / pf) ** 2 - 1));
      return { P: m.rated * k, cos, thd, act: k, extra: { k } };
    }
    case 'comp': {
      if (fx.vsd) { const k = 0.58 + 0.06 * Math.sin(t / 5); return { P: m.rated * k / 0.93, cos: 0.97, thd: 0.33, act: k, extra: { loaded: true } }; }
      const loaded = (t % 40) < 22;
      return loaded ? { P: m.rated * 0.92 / 0.93, cos: 0.86, thd: 0.03, act: 1, extra: { loaded } } : { P: m.rated * 0.3, cos: 0.42, thd: 0.04, act: 0.3, extra: { loaded } };
    }
    case 'led': return { P: m.rated * 0.9, cos: 0.95, thd: 0.14, act: 0.9 };
    default: return { P: 0, cos: 1, thd: 0, act: 0 };
  }
}

// ---------------------------------------------------------------- whole plant at time t
// cap: { kvar } currently switched in (state of the automatic controller)
export function plantAt(t, fx, capKvar = 0) {
  const ms = MACHINES.map((m) => {
    const r = machineAt(m, t, fx);
    const P = r.P, Pa = Math.abs(P), cos = r.cos, thd = r.thd;
    const Q = Pa * Math.tan(Math.acos(clamp(cos, 0.05, 1)));
    const S1 = Math.hypot(Pa, Q);                  // fundamental apparent power
    const D = S1 * thd;                            // distortion power (V sinusoidal)
    const S = Math.sqrt(Pa * Pa + Q * Q + D * D);
    const I = S * 1000 / (SQ3 * V_LL);
    return { m, ...r, P, Q, D, S, I, I1: S1 * 1000 / (SQ3 * V_LL), pf: S > 0.01 ? Pa / S : 1 };
  });
  const P = ms.reduce((s, x) => s + x.P, 0);
  const Qload = ms.reduce((s, x) => s + x.Q, 0);
  // harmonic currents of 6-pulse-type loads are largely in phase → partial arithmetic sum
  const IhSum = ms.reduce((s, x) => s + x.I1 * x.thd, 0), IhRss = Math.sqrt(ms.reduce((s, x) => s + (x.I1 * x.thd) ** 2, 0));
  let Ih = 0.7 * IhSum + 0.3 * IhRss;
  const Q = Qload - capKvar;
  const I1 = Math.hypot(P, Q) * 1000 / (SQ3 * V_LL);
  const capShare = capKvar / Math.max(1, Math.hypot(P, Qload));
  let resonance = 0;
  if (fx.cap && fx.capPlain) { resonance = clamp(capShare * 2.2, 0, 1.4); Ih *= 1 + resonance; }   // plain capacitors amplify the 5th/7th
  else if (fx.cap) Ih *= 0.92;                                                                    // detuned bank absorbs a little
  let ahfA = 0;
  if (fx.ahf) { const target = 0.05 * I1; ahfA = clamp(Ih - target, 0, 300); Ih -= ahfA; }
  const thd = I1 > 1 ? Ih / I1 : 0;
  const D = SQ3 * V_LL * Ih / 1000;
  const S = Math.sqrt(P * P + Q * Q + D * D);
  const I = S * 1000 / (SQ3 * V_LL);
  const Irated = TR_KVA * 1000 / (SQ3 * V_LL);
  const loss = 17 * (I / Irated) ** 2 * (1 + 4 * thd * thd) + 1.6;   // transformer + cable copper loss with harmonic heating (kW)
  return { ms, P, Q, Qload, D, S, I, I1, thd, cos: Math.hypot(P, Q) > 0 ? Math.abs(P) / Math.hypot(P, Q) : 1, pf: S > 0 ? Math.abs(P) / S : 1, load: S / TR_KVA, loss, ahfA, resonance };
}

// automatic capacitor controller: target cos φ 0.97, 25 kvar steps, max 12
export const CAP_STEP = 25, CAP_STEPS = 12;
export function capNeed(P, Qload, target = 0.97) { return Math.max(0, Qload - Math.abs(P) * Math.tan(Math.acos(target))); }

// averages over the slowest cycle (120 s) — used for "before / after" and money
export function averages(fx, tariff = TARIFF_DEFAULT) {
  let n = 0; const acc = { P: 0, Q: 0, D: 0, S: 0, loss: 0, thd: 0, Pmax: 0, Qmax: 0, Smax: 0, I: 0 };
  const per = Object.fromEntries(MACHINES.map((m) => [m.id, { P: 0, Pa: 0, Q: 0, D: 0, S: 0 }]));
  for (let t = 0; t < 240; t += 1) {
    const pre = plantAt(t, fx, 0);
    const cap = fx.cap ? Math.min(CAP_STEPS, Math.round(capNeed(pre.P, pre.Qload) / CAP_STEP)) * CAP_STEP : 0;
    const x = fx.cap ? plantAt(t, fx, cap) : pre;
    for (const k of ['P', 'Q', 'D', 'S', 'loss', 'thd', 'I']) acc[k] += x[k];
    for (const r of x.ms) { const q = per[r.m.id]; q.P += r.P; q.Pa += Math.abs(r.P); q.Q += r.Q; q.D += r.D; q.S += r.S; }
    n++;
  }
  for (const k of ['P', 'Q', 'D', 'S', 'loss', 'thd', 'I']) acc[k] /= n;
  for (const q of Object.values(per)) for (const k of ['P', 'Pa', 'Q', 'D', 'S']) q[k] /= n;
  // 15-minute demand ≈ average × 1.06 (cycles are far shorter than 15 minutes)
  const kW = acc.P * 1.06, kvar = Math.max(0, acc.Q * 1.06);
  const pfCharge = Math.max(0, Math.round(kvar - tariff.pfLimit * kW)) * tariff.pf;
  const kWh = (acc.P + acc.loss) * tariff.hours;
  const bill = { energy: kWh * tariff.energy, demand: kW * tariff.demand, pf: pfCharge };
  bill.total = bill.energy + bill.demand + bill.pf;
  return { ...acc, kW, kvar, kWh, bill, pf: acc.P / acc.S, cos: acc.P / Math.hypot(acc.P, acc.Q), per };
}

export const fixKey = (fx) => FIXES.map((f) => (fx[f.id] ? 1 : 0)).join('') + (fx.capPlain ? 'p' : '');

// ---------------------------------------------------------------- waveforms for the oscilloscope
// harmonic spectrum (fraction of the fundamental) for a given THD and load type
export function spectrum(kind, thd) {
  const shape = kind === 'phase' ? { 3: 0.0, 5: 0.6, 7: 0.45, 9: 0, 11: 0.3, 13: 0.25 }
    : kind === 'led' ? { 3: 0.7, 5: 0.5, 7: 0.35, 9: 0.2, 11: 0.12, 13: 0.08 }
      : { 5: 1 / 5, 7: 1 / 7, 11: 1 / 11, 13: 1 / 13, 17: 1 / 17, 19: 1 / 19 };
  const keys = Object.keys(shape).map(Number), norm = Math.sqrt(keys.reduce((s, h) => s + shape[h] ** 2, 0)) || 1;
  return keys.map((h) => ({ h, a: thd * shape[h] / norm }));
}
// current sample at phase θ (rad) for fundamental lag φ: i = sin(θ − φ) + Σ a_h sin(h(θ − φ) + ψ_h)
export function currentAt(theta, phi, spec, kind) {
  let i = Math.sin(theta - phi);
  for (const { h, a } of spec) i += a * Math.sin(h * (theta - phi) + (kind === 'phase' ? 0 : Math.PI)) ;
  return i;
}
