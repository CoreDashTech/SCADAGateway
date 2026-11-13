// CoreDash Nexus — power-quality savings engine (pure functions, shared by the screens and the tests).
//
// What a power-factor / harmonic fix can save on a PEA bill, and how each baht is worked out:
//   1. PF charge      PEA bills every kvar above 61.97 % of the month's maximum kW demand (15-min) at 56.07 THB/kvar.
//                     → capacitors / APF lower the kvar at the PEA meter.             [real, billed, monthly]
//   2. Loss energy    less current (fundamental + harmonics) → less I²R heat in the customer's transformer and cables.
//                     Transformer per IEEE C57.110: P_LL = P_dc,R·(I/I_R)²·(1 + F_HL·P_EC,R).   [real, small]
//   3. Loss demand    the same lower losses also trim the peak kW a little (× demand charge).          [real, small]
//   4. Real energy    only fixes that change the process (idle running, leaks, set-points) cut kWh of the machine.
//   Capacitors and filters do NOT reduce a machine's kW — they cut kvar, kVA, amps, heat and harmonics.
//   Released kVA is capacity (avoided transformer upgrade), not a monthly saving.

export const TARIFF = { pfRate: 56.07, pfFree: 0.6197, demand: 210, energy: 4.2 };
export const ASSUME = {
  voltage: 400, hoursMonth: 500,             // site production hours / month
  trafoKVA: 1000, trafoLL: 10500, pec: 0.1,  // transformer rating, load loss at rated (W), winding-eddy share of I²R
  trafoOwned: true,                          // HV-metered customer owns the transformer → its losses are on the bill
  diversity: 0.85,                           // harmonic currents of several sources do not add in phase
  rho: 0.0225,                               // Ω·mm²/m, copper at ~70 °C
  cost: { capPlain: 900, capDetuned: 1600, reactorPerKW: 220, compCtl: 25000 },  // THB — placeholders, put real quotes in
  selfLoss: { capPlain: 0.5, capDetuned: 5, reactorPct: 0.6, apfPct: 2.5 }        // W/kvar · W/kvar · % of drive kW · % of APF output kVA
};
const SQ3 = Math.sqrt(3);
const tan = (pf) => Math.tan(Math.acos(Math.min(1, Math.max(0.05, pf))));

// harmonic current spectra (% of fundamental) by load type — scaled to the measured THD-I
export const SPECTRA = {
  thy6: { 5: 22, 7: 11, 11: 7, 13: 5, 17: 3, 19: 2.4, 23: 1.6, 25: 1.3 },          // thyristor rectifier / DC drive
  vfd6: { 5: 65, 7: 42, 11: 9, 13: 6, 17: 4, 19: 3, 23: 2, 25: 1.6 },              // diode-bridge VFD, no choke
  vfd6r: { 5: 30, 7: 12, 11: 6.5, 13: 4, 17: 2.5, 19: 2, 23: 1.3, 25: 1 },         // same with 5 % line reactor
  motor: { 5: 3, 7: 1.5, 11: 0.8 },
  scr: { 3: 6, 5: 8, 7: 4, 11: 2 },
  mixed: { 3: 12, 5: 8, 7: 4, 9: 2, 11: 1.5 }
};
export function spectrum(type, thd) {
  const s = SPECTRA[type] || SPECTRA.motor;
  const base = Math.sqrt(Object.values(s).reduce((a, v) => a + v * v, 0));
  const k = base > 0 ? thd / base : 0, out = {};
  for (const [h, v] of Object.entries(s)) out[h] = v * k;
  return out; // % of I1
}
// IEEE C57.110 harmonic loss factor for winding eddy-current loss
export function fhl(spec) {
  let num = 1, den = 1; // h = 1 term (100 %)
  for (const [h, v] of Object.entries(spec)) { const r = (v / 100) ** 2; num += r * h * h; den += r; }
  return num / den;
}
export const thdOf = (spec) => Math.sqrt(Object.values(spec).reduce((a, v) => a + v * v, 0));

export function pfPenalty(kWmax, kvarMax, t = TARIFF) { return Math.max(0, kvarMax - t.pfFree * kWmax) * t.pfRate; }
export function trafoLossW(Irms, F, a = ASSUME) {
  const Ir = a.trafoKVA * 1000 / (SQ3 * a.voltage);
  const pdc = a.trafoLL / (1 + a.pec);
  return pdc * (Irms / Ir) ** 2 * (1 + F * a.pec);
}
export function cableLossW(Irms, lengthM, mm2, a = ASSUME) { return 3 * Irms * Irms * (a.rho * lengthM / mm2); }

// -------------------------------------------------------------------------------- machines (7-day PW3198 survey)
// P = average kW while running, dpf = cos φ (displacement), thd = THD-I %, hours = running h / month,
// cf = share of the machine running at the site's monthly peak, feeder = MDB→machine cable
export const MACHINES = [
  { id: 'RECT-01', th: 'เรกติไฟเออร์ชุบนิกเกิล', en: 'Nickel plating rectifier', area: 'plating', type: 'thy6', rated: 90, P: 62, dpf: 0.72, thd: 31, hours: 520, cf: 0.9, feeder: { L: 45, mm2: 50 } },
  { id: 'RECT-02', th: 'เรกติไฟเออร์ชุบโครเมียม', en: 'Chrome plating rectifier', area: 'plating', type: 'thy6', rated: 120, P: 85, dpf: 0.68, thd: 29, hours: 520, cf: 0.9, feeder: { L: 50, mm2: 70 } },
  { id: 'RECT-03', th: 'เรกติไฟเออร์ชุบทองแดง', en: 'Copper plating rectifier', area: 'plating', type: 'thy6', rated: 60, P: 40, dpf: 0.75, thd: 33, hours: 480, cf: 0.8, feeder: { L: 40, mm2: 35 } },
  { id: 'MILL-01', th: 'แท่นรีดทองเหลือง (DC drive)', en: 'Brass rolling mill (DC drive)', area: 'rolling', type: 'thy6', rated: 250, P: 160, dpf: 0.78, thd: 28, hours: 450, cf: 0.85, feeder: { L: 70, mm2: 150 } },
  { id: 'MILL-02', th: 'แท่นรีดละเอียด (VFD 110 kW)', en: 'Finishing mill (VFD 110 kW)', area: 'rolling', type: 'vfd6', rated: 110, P: 75, dpf: 0.96, thd: 72, hours: 450, cf: 0.8, feeder: { L: 65, mm2: 70 } },
  { id: 'FURN-01', th: 'เตาอบอ่อน (SCR heater)', en: 'Annealing furnace (SCR)', area: 'rolling', type: 'scr', rated: 150, P: 120, dpf: 0.9, thd: 12, hours: 560, cf: 0.9, feeder: { L: 55, mm2: 95 } },
  { id: 'COMP-01', th: 'ปั๊มลม 37 kW × 2', en: 'Air compressors 37 kW × 2', area: 'utility', type: 'motor', rated: 74, P: 52, dpf: 0.8, thd: 4, hours: 600, cf: 1, feeder: { L: 30, mm2: 35 }, unload: { kw: 13, share: 0.4 } },
  { id: 'UTIL-01', th: 'ปั๊มบำบัดน้ำเสีย + พัดลมดูดไอกรด', en: 'Waste-water pumps + fume fans', area: 'utility', type: 'motor', rated: 60, P: 45, dpf: 0.82, thd: 5, hours: 620, cf: 1, feeder: { L: 60, mm2: 25 } },
  { id: 'BLDG-01', th: 'เครน แสงสว่าง สำนักงาน', en: 'Cranes, lighting, office', area: 'building', type: 'mixed', rated: 45, P: 30, dpf: 0.93, thd: 15, hours: 400, cf: 0.8, feeder: { L: 35, mm2: 25 } }
];

// electrical state of one machine from (P, dpf, thd)
export function measure(m, a = ASSUME) {
  const I1 = m.P * 1000 / (SQ3 * a.voltage * m.dpf), I = I1 * Math.sqrt(1 + (m.thd / 100) ** 2);
  const S = SQ3 * a.voltage * I / 1000, Q = m.P * tan(m.dpf);
  return { ...m, I1, I, S, Q, PF: m.P / S, spec: spectrum(m.type, m.thd) };
}

// -------------------------------------------------------------------------------- diagnosis: what to fix, and why
export function diagnose(m, a = ASSUME) {
  const x = measure(m, a), out = [];
  if (x.dpf < 0.92) {
    const target = 0.96, kvar = Math.ceil(x.P * (tan(x.dpf) - tan(target)) / 5) * 5;
    const detuned = x.thd >= 8;
    out.push({
      key: detuned ? 'dcap' : 'cap', kvar, cost: kvar * (detuned ? a.cost.capDetuned : a.cost.capPlain),
      th: detuned ? `ตู้คาปาซิเตอร์แบบ detuned (รีแอกเตอร์ 7 %, 189 Hz) ${kvar} kvar ติดที่เครื่อง` : `ตู้คาปาซิเตอร์อัตโนมัติ ${kvar} kvar ติดที่เครื่อง`,
      en: detuned ? `Detuned capacitor bank (7 % reactor, 189 Hz) ${kvar} kvar at the machine` : `Automatic capacitor bank ${kvar} kvar at the machine`,
      whyTh: `cos φ ${x.dpf.toFixed(2)} ต่ำกว่า 0.92 → ดึงกำลังรีแอกทีฟ ${x.Q.toFixed(0)} kvar` + (detuned ? ` · THD-I ${x.thd}% ห้ามใช้คาปาซิเตอร์ธรรมดา เพราะเสี่ยงเรโซแนนซ์ฮาร์มอนิกที่ 5/7` : ''),
      whyEn: `cos φ ${x.dpf.toFixed(2)} below 0.92 → draws ${x.Q.toFixed(0)} kvar` + (detuned ? ` · THD-I ${x.thd}%: plain capacitors would risk 5th/7th harmonic resonance` : ''),
      after: { dpf: target, thd: x.thd * (detuned ? 0.92 : 1) }
    });
  }
  if (x.type === 'vfd6' && x.thd > 45) {
    out.push({
      key: 'reactor', cost: Math.round(x.rated * a.cost.reactorPerKW / 1000) * 1000,
      th: `รีแอกเตอร์ด้านไฟเข้า 5 % (หรือ DC choke) สำหรับอินเวอร์เตอร์ ${x.rated} kW`, en: `5 % AC line reactor (or DC choke) for the ${x.rated} kW VFD`,
      whyTh: `THD-I ${x.thd}% สูงมาก (ไดโอดบริดจ์ไม่มีโช้ก) → กระแส rms เกินจำเป็น ${((x.I / x.I1 - 1) * 100).toFixed(0)}%, ร้อนสาย/หม้อแปลง`, whyEn: `THD-I ${x.thd}% (diode bridge without choke) → rms current ${((x.I / x.I1 - 1) * 100).toFixed(0)}% above the fundamental; heats cables and transformer`,
      after: { dpf: x.dpf - 0.01, thd: 33, type: 'vfd6r' }
    });
  }
  if (x.unload) {
    out.push({
      key: 'comp', cost: a.cost.compCtl,
      th: 'ตั้งเวลาหยุดอัตโนมัติขณะเดินตัวเปล่า + ลดแรงดันตั้ง 0.5 bar + ซ่อมรอยรั่ว', en: 'Auto-stop when unloaded + 0.5 bar lower set-point + fix leaks',
      whyTh: `กราฟ kW จาก PW3198 เห็นช่วงเดินตัวเปล่า (unload) ${x.unload.kw} kW ประมาณ ${(x.unload.share * 100).toFixed(0)}% ของเวลาเดิน → เสียพลังงานจริงโดยไม่ได้ลม`,
      whyEn: `The PW3198 kW trend shows unloaded running at ${x.unload.kw} kW for ~${(x.unload.share * 100).toFixed(0)}% of run time → real energy with no air delivered`,
      after: { kwh: x.unload.kw * x.hours * x.unload.share * 0.6 }
    });
  }
  return out;
}
export function selfLossKwh(m, f, a = ASSUME) {
  const w = f.key === 'cap' ? f.kvar * a.selfLoss.capPlain : f.key === 'dcap' ? f.kvar * a.selfLoss.capDetuned : f.key === 'reactor' ? m.rated * 1000 * a.selfLoss.reactorPct / 100 * (m.P / m.rated) : 0;
  return w * m.hours / 1000;
}
export function applyFixes(m, fixes) {
  let n = { ...m };
  for (const f of fixes) { if (f.after.dpf) n.dpf = f.after.dpf; if (f.after.thd != null) n.thd = f.after.thd; if (f.after.type) n.type = f.after.type; }
  return n;
}

// -------------------------------------------------------------------------------- site before/after → baht per month
export function siteState(machines, a = ASSUME) {
  const xs = machines.map((m) => measure(m, a));
  const P = xs.reduce((s, x) => s + x.P * x.cf, 0), Q = xs.reduce((s, x) => s + x.Q * x.cf, 0);
  const I1 = Math.hypot(P, Q) * 1000 / (SQ3 * a.voltage);
  const spec = {};
  for (const x of xs) for (const [h, v] of Object.entries(x.spec)) spec[h] = (spec[h] || 0) + x.I1 * x.cf * v / 100 * a.diversity;
  const specPct = Object.fromEntries(Object.entries(spec).map(([h, A]) => [h, A / I1 * 100]));
  const I = I1 * Math.sqrt(1 + (thdOf(specPct) / 100) ** 2);
  const F = fhl(specPct);
  return { xs, P, Q, I1, I, F, thd: thdOf(specPct), S: SQ3 * a.voltage * I / 1000, PF: P / (SQ3 * a.voltage * I / 1000) };
}
export function compare(before, after, a = ASSUME, t = TARIFF, extraKwh = 0, selfKwh = 0) {
  const pf0 = pfPenalty(before.P, before.Q, t), pf1 = pfPenalty(after.P, after.Q, t);
  const tr0 = a.trafoOwned ? trafoLossW(before.I, before.F, a) : 0, tr1 = a.trafoOwned ? trafoLossW(after.I, after.F, a) : 0;
  const cab = (st) => st.xs.reduce((s, x) => s + cableLossW(x.I, x.feeder.L, x.feeder.mm2, a) * x.hours, 0); // Wh / month
  const cab0 = cab(before), cab1 = cab(after);
  const lossKwh = ((tr0 - tr1) * a.hoursMonth + (cab0 - cab1)) / 1000;
  const peakKw = ((tr0 - tr1) + before.xs.reduce((s, x, i) => s + (cableLossW(x.I, x.feeder.L, x.feeder.mm2, a) - cableLossW(after.xs[i].I, x.feeder.L, x.feeder.mm2, a)) * x.cf, 0)) / 1000;
  const items = [
    { key: 'pf', th: 'ค่าปรับเพาเวอร์แฟกเตอร์ (กฟภ.)', en: 'PF charge (PEA)', before: pf0, after: pf1, thb: pf0 - pf1,
      how: `kvar สูงสุด ${before.Q.toFixed(0)} → ${after.Q.toFixed(0)} · ส่วนที่ไม่เสียค่าปรับ = 61.97% × ${before.P.toFixed(0)} kW = ${(t.pfFree * before.P).toFixed(0)} kvar · × ${t.pfRate} บาท/kvar`,
      howEn: `peak kvar ${before.Q.toFixed(0)} → ${after.Q.toFixed(0)} · free allowance 61.97% × ${before.P.toFixed(0)} kW = ${(t.pfFree * before.P).toFixed(0)} kvar · × ${t.pfRate} THB/kvar` },
    { key: 'loss', th: 'ค่าไฟจากความสูญเสียในหม้อแปลง + สายป้อน', en: 'Energy lost in transformer + feeders', before: null, after: null, thb: lossKwh * t.energy, kwh: lossKwh,
      how: `หม้อแปลง ${(tr0 / 1000).toFixed(2)} → ${(tr1 / 1000).toFixed(2)} kW (F_HL ${before.F.toFixed(1)} → ${after.F.toFixed(1)}) × ${a.hoursMonth} ชม. + สายป้อน ${(cab0 / 1000).toFixed(0)} → ${(cab1 / 1000).toFixed(0)} kWh · × ${t.energy} บาท/kWh`,
      howEn: `transformer ${(tr0 / 1000).toFixed(2)} → ${(tr1 / 1000).toFixed(2)} kW (F_HL ${before.F.toFixed(1)} → ${after.F.toFixed(1)}) × ${a.hoursMonth} h + feeders ${(cab0 / 1000).toFixed(0)} → ${(cab1 / 1000).toFixed(0)} kWh · × ${t.energy} THB/kWh` },
    { key: 'demand', th: 'ค่าความต้องการพลังไฟฟ้า (kW สูงสุดลดจากความสูญเสีย)', en: 'Demand charge (peak kW of losses)', thb: Math.max(0, peakKw) * t.demand, kw: peakKw,
      how: `ความสูญเสียช่วงพีคลด ${peakKw.toFixed(2)} kW × ${t.demand} บาท/kW`, howEn: `peak losses down ${peakKw.toFixed(2)} kW × ${t.demand} THB/kW` }
  ];
  if (extraKwh) items.push({ key: 'kwh', th: 'พลังงานจริงของเครื่องจักรที่ลดได้', en: 'Real machine energy saved', thb: extraKwh * t.energy, kwh: extraKwh, how: `${extraKwh.toFixed(0)} kWh × ${t.energy} บาท/kWh`, howEn: `${extraKwh.toFixed(0)} kWh × ${t.energy} THB/kWh` });
  if (selfKwh) items.push({ key: 'self', th: 'ความสูญเสียของอุปกรณ์ที่ติดเพิ่มเอง (หักออก)', en: 'Own losses of the added equipment (deducted)', thb: -selfKwh * t.energy, kwh: -selfKwh,
    how: `${selfKwh.toFixed(0)} kWh/เดือน × ${t.energy} บาท/kWh — คาปาซิเตอร์ detuned ~${a.selfLoss.capDetuned} W/kvar, รีแอกเตอร์ ~${a.selfLoss.reactorPct}% ของ kW ไดรฟ์, APF ~${a.selfLoss.apfPct}% ของ kVA ที่จ่าย`,
    howEn: `${selfKwh.toFixed(0)} kWh/month × ${t.energy} THB/kWh — detuned capacitors ~${a.selfLoss.capDetuned} W/kvar, reactor ~${a.selfLoss.reactorPct}% of drive kW, APF ~${a.selfLoss.apfPct}% of output kVA` });
  const total = items.reduce((s, i) => s + i.thb, 0);
  return { items, total, kvaFreed: before.S - after.S, ampsDown: before.I - after.I, thd: [before.thd, after.thd], pf: [before.PF, after.PF] };
}

// plan = selected fixes per machine → per-machine attribution of savings (marginal, one machine at a time)
export function plan(selected, a = ASSUME, t = TARIFF, machines = MACHINES) {
  const base = siteState(machines, a);
  const fixed = machines.map((m) => applyFixes(m, (selected[m.id] || [])));
  const sumOf = (m, fn) => (selected[m.id] || []).reduce((q, f) => q + fn(f), 0);
  const extra = machines.reduce((s, m) => s + sumOf(m, (f) => f.after.kwh || 0), 0);
  const self = machines.reduce((s, m) => s + sumOf(m, (f) => selfLossKwh(m, f, a)), 0);
  const all = compare(base, siteState(fixed, a), a, t, extra, self);
  const per = machines.map((m, i) => {
    const fx = selected[m.id] || []; if (!fx.length) return null;
    const one = machines.map((q, j) => (j === i ? fixed[i] : q));
    const r = compare(base, siteState(one, a), a, t, sumOf(m, (f) => f.after.kwh || 0), sumOf(m, (f) => selfLossKwh(m, f, a)));
    const cost = fx.reduce((q, f) => q + f.cost, 0);
    return { id: m.id, thb: r.total, cost, payback: r.total > 0 ? cost / r.total : Infinity, r };
  }).filter(Boolean);
  const cost = per.reduce((s, p) => s + p.cost, 0);
  return { base, all, per, cost, payback: all.total > 0 ? cost / all.total : Infinity };
}

// -------------------------------------------------------------------------------- pilot (measurement & verification)
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
// 3 days before + 3 days after, 10-min records, the same production pattern (two shifts, weekend-free)
export function pilotData(m, fix, { days = 3, stepMin = 10, seed = 11, t0 = Date.now() - 7 * 864e5 } = {}) {
  const r = rng(seed), rows = [];
  const after = fix ? applyFixes(m, [fix]) : m;
  for (const [phase, mm, start] of [['before', m, t0], ['after', after, t0 + (days + 1) * 864e5]]) {
    for (let k = 0; k < days * 24 * 60 / stepMin; k++) {
      const ts = start + k * stepMin * 60000, h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
      const on = (h >= 8 && h < 12) || (h >= 13 && h < 20.5);
      const load = on ? 0.85 + 0.15 * Math.sin(k / 7) + 0.06 * gauss(r) : 0.08 + 0.02 * r();
      const P = mm.P * load;
      const dpf = Math.min(0.995, mm.dpf + (on ? 0 : -0.15) + 0.01 * gauss(r));
      const thd = Math.max(1, mm.thd * (on ? 1 : 1.4) * (1 + 0.05 * gauss(r)));
      const x = measure({ ...mm, P, dpf, thd });
      const prod = on ? load * (mm.area === 'plating' ? 1.0 : 0.9) : 0; // production units / 10 min (e.g. kAh or tons)
      rows.push({ ts, phase, on, P: x.P, Q: x.Q, S: x.S, I: x.I, PF: x.PF, dpf, thd, prod });
    }
  }
  return rows;
}
// difference of means with 95 % confidence (Welch), production hours only
export function mvStat(rows, key) {
  const pick = (ph) => rows.filter((r) => r.phase === ph && r.on).map((r) => r[key]);
  const a = pick('before'), b = pick('after');
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const vari = (v, m) => v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
  const m0 = mean(a), m1 = mean(b), se = Math.sqrt(vari(a, m0) / a.length + vari(b, m1) / b.length);
  const d = m1 - m0, ci = 1.96 * se;
  return { before: m0, after: m1, diff: d, ci, pct: m0 ? d / m0 * 100 : 0, significant: Math.abs(d) > ci, n: [a.length, b.length] };
}
// energy normalised to production (kWh per unit) — the fair before/after for real-energy claims
export function mvPerUnit(rows) {
  const sum = (ph, k) => rows.filter((r) => r.phase === ph).reduce((s, r) => s + r[k], 0);
  const e = (ph) => sum(ph, 'P') / 6, u = (ph) => sum(ph, 'prod');
  return { before: e('before') / u('before'), after: e('after') / u('after') };
}

// APF case for the live screen: load side (#3) is "without APF", MAIN GRID (#2) is "with APF"
export function apfCase(snap, hist, a = ASSUME, t = TARIFF) {
  const g = snap.inst['PQ-MAIN'], l = snap.inst['PQ-LOAD'];
  if (!g || !l || !g.ph || !l.ph) return null;
  const Iavg = (rec) => rec.ph.reduce((s, p) => s + p.I, 0) / 3;
  // "after" is scaled from rows where #2 and #3 were measured at the same moment with the APF running,
  // so a night-time-only APF period cannot fake a big saving
  const rows = hist || [], onRows = rows.filter((r) => r.apf && r.lI > 0 && r.lQ != null);
  const ratio = (num, den, fallback) => { const v = onRows.filter((r) => Math.abs(r[den]) > 1e-6).map((r) => Math.abs(r[num]) / Math.abs(r[den])); return v.length ? v.reduce((q, z) => q + z, 0) / v.length : fallback; };
  const rI = ratio('gI', 'lI', Iavg(g) / Math.max(1e-6, Iavg(l))), rQ = ratio('gQ', 'lQ', Math.abs(g.Q) / Math.max(1e-6, Math.abs(l.Q)));
  const peak = (kP, kQ) => { let best = null; for (const r of rows) if (r[kP] != null && (!best || r[kP] > best[kP])) best = r; return best ? { P: best[kP], Q: Math.abs(best[kQ] ?? 0) } : null; };
  const pkL = peak('lP', 'lQ') || { P: l.P, Q: Math.abs(l.Q) };
  const pkG = { P: pkL.P, Q: pkL.Q * rQ };
  const specOf = (rec) => { const p = rec.ph[0]; if (!p.ih) return spectrum('thy6', rec.Ithd || 0); const f = p.ih[0] || 1, o = {}; p.ih.forEach((v, i) => { if (i > 0 && v > 0) o[i + 1] = v / f * 100; }); return o; };
  // loss energy uses the average current over production hours (from the trend), not one instant
  const prodAvg = (rows, kP, kI) => { const mx = Math.max(0, ...rows.map((r) => r[kP] || 0)); const v = rows.filter((r) => r[kP] > 0.5 * mx && r[kI] != null).map((r) => r[kI]); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const iL = prodAvg(rows, 'lP', 'lI') ?? Iavg(l), iG = iL * rI;
  const st = (rec, pk, Ip) => ({ P: pk.P, Q: pk.Q, I: Ip, F: fhl(specOf(rec)), thd: rec.Ithd, S: rec.S, PF: rec.PF, xs: [{ I: Ip, feeder: { L: 25, mm2: 4 * 240 }, hours: a.hoursMonth, cf: 1 }] });
  const apf = snap.inst['PQ-APF'];
  const rA = ratio('aI', 'lI', apf && apf.ph ? Iavg(apf) / Math.max(1e-6, Iavg(l)) : 0);
  const apfKva = iL * rA * SQ3 * a.voltage / 1000; // APF output at the average production load
  const r = compare(st(l, pkL, iL), st(g, pkG, iG), a, t, 0, apfKva * a.selfLoss.apfPct / 100 * a.hoursMonth);
  r.peak = { load: pkL, grid: pkG }; r.amps = [iL, iG];
  return r;
}
