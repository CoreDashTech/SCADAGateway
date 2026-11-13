// CoreDash "smart diagnosis" for power quality — one engine for live data, the Lab case and manual entries.
//
// It answers, point by point (MAIN = grid side, LOAD = load feeder, APF = compensator output):
//   1. Is the analyser wired / set up correctly?       (wiring rules W*)
//   2. What is wrong with the power?                    (quality rules Q*)
//   3. Why is the power factor low — displacement (reactive) or distortion (harmonics)?
//   4. Is the APF working, and if not, what to check?   (APF rules A*)
//   5. What to fix, where, and what to buy.             (recommendations R*)
//
// Engineering basis
//   • Hioki PW3198 reports Q = sign·√(S² − P²), so its "kvar" contains distortion power as well as
//     displacement reactive power (checked on the Lab readings: L1 1.714 kVA, 1.093 kW → 1.320 kvar).
//     A capacitor only fixes the displacement part. With THD-I known: S1 = S/√(1+THD²), DPF = P/S1.
//   • Harmonic current per phase Ih = I·THD/√(1+THD²) — this is what an APF/harmonic filter must supply.
//   • Limits: IEEE 519-2022 (THD-U ≤ 8 % at ≤ 1 kV; TDD by Isc/IL), IEC 61000-2-4 class 2 (THD-U 8 %),
//     EN 50160 (unbalance 2 %, 50 Hz ± 1 %), IEEE C57.110 (K-factor → transformer derating),
//     PEA/MEA kvar charge above 61.97 % of kW (≈ PF 0.85).
// Per-phase P/Q/S are in W/var/VA, totals in kW/kvar/kVA (same shape as pw3198.js / pq-model.js).

const B = (th, en) => ({ th, en });
const r2 = (v) => Math.round(v * 100) / 100;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const max = (a) => (a.length ? Math.max(...a) : null);
const min = (a) => (a.length ? Math.min(...a) : null);
const num = (v) => (v != null && Number.isFinite(v) ? v : null);

export const POINTS = {
  MAIN: { no: 2, th: 'ตู้เมน (ฝั่งการไฟฟ้า)', en: 'Main (grid side)' },
  LOAD: { no: 3, th: 'สายป้อนโหลด', en: 'Load feeder' },
  APF: { no: 6, th: 'สายออก APF', en: 'APF output' }
};
export const APF_SIZES = [15, 30, 50, 75, 100, 150, 200, 300, 400, 600];

// ------------------------------------------------------------------ per-point derived values
export function pointMetrics(rec, { udin = 230 } = {}) {
  if (!rec || !rec.ph) return null;
  const ph = rec.ph.map((p) => ({ ...p }));
  const U = ph.map((p) => num(p.U)).filter((v) => v != null);
  const I = ph.map((p) => num(p.I)).filter((v) => v != null);
  const P = num(rec.P) ?? (ph.every((p) => num(p.P) != null) ? ph.reduce((s, p) => s + p.P, 0) / 1000 : null);
  const S = num(rec.S) ?? (ph.every((p) => num(p.S) != null) ? ph.reduce((s, p) => s + p.S, 0) / 1000 : null);
  const Q = num(rec.Q);
  const PF = num(rec.PF) != null ? Math.abs(rec.PF) : P != null && S ? Math.abs(P / S) : null;
  const ithd = ph.map((p) => num(p.Ithd)).filter((v) => v != null && v > 0);
  const THDI = num(rec.Ithd) ?? max(ithd);
  const THDU = num(rec.Uthd) ?? max(ph.map((p) => num(p.Uthd)).filter((v) => v != null));
  const KF = num(rec.KF) ?? max(ph.map((p) => num(p.KF)).filter((v) => v != null));
  const Iavg = mean(I);
  // displacement vs distortion (needs THD-I)
  let S1 = null, DPF = null, Q1 = null, D = null;
  if (S != null && P != null && THDI != null) {
    S1 = S / Math.sqrt(1 + (THDI / 100) ** 2);
    DPF = Math.min(1, Math.abs(P) / S1);
    Q1 = Math.sqrt(Math.max(0, S1 * S1 - P * P));
    D = Math.sqrt(Math.max(0, S * S - S1 * S1));
  }
  const N = S != null && P != null ? Math.sqrt(Math.max(0, S * S - P * P)) : null; // all non-active power
  const Ih = ph.map((p) => (num(p.I) != null && num(p.Ithd) != null ? p.I * (p.Ithd / 100) / Math.sqrt(1 + (p.Ithd / 100) ** 2) : null));
  const lead = Q != null ? Q < 0 : rec.pfSign != null ? rec.pfSign < 0 : null;
  return {
    U, I, Iavg, Umin: min(U), Umax: max(U), P, Q, S, PF, DPF, S1, Q1, D, N, THDI, THDU, KF,
    Ih, Ihmax: max(Ih.filter((v) => v != null)),
    unb: num(rec.unb), f: num(rec.f), IN: num(rec.IN), lead, ph,
    // mean harmonic order implied by the K-factor: KF = Σh²Ih²/ΣIh² (≈ h² of the dominant orders)
    hEff: KF != null && THDI != null && THDI > 1 ? Math.sqrt(Math.max(1, (KF * (1 + (THDI / 100) ** 2) - 1) / ((THDI / 100) ** 2))) : null,
    udin
  };
}

// ------------------------------------------------------------------ findings
function F(point, sev, cat, id, title, evidence, cause, steps, std, extra = {}) {
  return { point, sev, cat, id, title, evidence, cause, steps, std: std || '', ...extra };
}
const SEV = { crit: 3, warn: 2, info: 1, ok: 0 };

/**
 * @param {object} input
 *   points: { MAIN?, LOAD?, APF? }   records (pw3198Record shape)
 *   setup:  { MAIN?: {wiring, rangeA, sensor}, … }  (optional, from the analyser screen or the wizard)
 *   apf:    { rating: 50, running: true|false|null, hmi: { iout:[a,b,c], iload:[a,b,c], thdL, thdS, s, pf } }
 *   udin:   nominal phase voltage (230)
 *   prices: unit prices for the investment table (optional)
 */
export function diagnose(input = {}) {
  const udin = input.udin || 230;
  const apfIn = input.apf || {};
  const rating = apfIn.rating || 50;
  const M = {};
  for (const k of Object.keys(POINTS)) M[k] = pointMetrics(input.points && input.points[k], { udin });
  const out = [];
  const L = (k) => POINTS[k];

  // ---------------- 1. wiring / set-up checks per point
  for (const k of Object.keys(POINTS)) {
    const m = M[k]; if (!m) continue;
    const set = (input.setup && input.setup[k]) || {};
    // 3-wire system measured as 3P4W (no neutral) → every L-N ≈ Udin/√3
    if (m.U.length === 3 && m.U.every((u) => u > 0.45 * udin && u < 0.7 * udin)) {
      out.push(F(k, 'crit', 'wiring', 'W1', B('ตั้งการต่อสายผิด: จุดนี้เป็นระบบ 3 สาย (ไม่มีนิวทรัล) แต่เครื่องวัดตั้งเป็น 3P4W', 'Wiring set wrong: this is a 3-wire point (no neutral) measured as 3P4W'),
        [`U L-N = ${m.U.map((u) => u.toFixed(1)).join(' / ')} V ≈ ${udin}/√3 = ${(udin / Math.sqrt(3)).toFixed(0)} V`],
        B('สาย N ของเครื่องวัดลอย (ไม่ได้ต่อ) เพราะอุปกรณ์ต่อแบบ Δ/3 สาย เช่น APF รุ่น 3L — ค่า U, P, PF รายเฟสทั้งหมดใช้ไม่ได้', 'The analyser N lead is floating because the equipment is Δ/3-wire (e.g. a 3L APF) — per-phase U, P, PF are all invalid'),
        [B('PW3198: SYSTEM → WIRING เปลี่ยนเป็น 3P3W3M', 'PW3198: SYSTEM → WIRING → 3P3W3M'), B('ต่อสายวัดแรงดันเฉพาะ L1 L2 L3 (ไม่ต่อ N) หรือถ้ามี N จริงให้ต่อ N ที่บัส N', 'Connect only L1 L2 L3 voltage leads (or connect N to the real neutral bar if there is one)'), B('ตรวจซ้ำ: U ต้องขึ้น ~400 V (L-L) หรือ ~230 V (L-N)', 'Re-check: U must read ~400 V (L-L) or ~230 V (L-N)')],
        'IEC 61000-4-30 §4.2 (connection) · Hioki PW3198 manual ch.3'));
    }
    // a missing voltage lead
    if (m.U.length === 3 && m.Umax > 0.7 * udin && m.Umin < 0.2 * udin) {
      const i = m.U.indexOf(m.Umin);
      out.push(F(k, 'crit', 'wiring', 'W2', B(`สายวัดแรงดันเฟส L${i + 1} ไม่ได้ต่อ/หลุด`, `Voltage lead L${i + 1} missing / loose`), [`U L${i + 1} = ${m.Umin.toFixed(1)} V`],
        B('ปากคีบสายวัดแรงดันหลุด หรือฟิวส์ของสายวัดขาด', 'Voltage clip off, or the lead fuse is open'), [B(`ตรวจปากคีบ L${i + 1} และฟิวส์สายวัด`, `Check the L${i + 1} clip and lead fuse`)], ''));
    }
    // current per phase: reversed clamp / no clamp / wrong phase
    m.ph.forEach((p, i) => {
      if (num(p.P) != null && num(p.I) > 0.5 && p.P < -50 && m.ph.filter((q, j) => j !== i && q.P > 50).length >= 1) {
        out.push(F(k, 'crit', 'wiring', 'W3', B(`แคลมป์เฟส L${i + 1} กลับทิศ (P ติดลบ)`, `Clamp L${i + 1} reversed (negative P)`), [`P L${i + 1} = ${(p.P / 1000).toFixed(3)} kW`],
          B('ลูกศรบนแคลมป์ต้องชี้จากแหล่งจ่ายไปหาโหลด', 'The clamp arrow must point from the source to the load'), [B(`กลับแคลมป์ L${i + 1} ให้ลูกศรชี้ไปทางโหลด`, `Turn clamp L${i + 1} so the arrow points to the load`)], 'Hioki PW3198 manual §3.6'));
      }
    });
    if (m.I.length === 3 && max(m.I) > 2 && min(m.I) < 0.05 * max(m.I)) {
      const i = m.I.indexOf(min(m.I));
      out.push(F(k, 'warn', 'wiring', 'W4', B(`เฟส L${i + 1} ไม่มีกระแส — แคลมป์ไม่ได้คล้อง/ปิดไม่สนิท หรือโหลดเฟสนี้ไม่ทำงาน`, `No current on L${i + 1} — clamp not on / not closed, or that phase is unloaded`), [`I = ${m.I.map((v) => v.toFixed(2)).join(' / ')} A`],
        B('แคลมป์ปิดไม่สนิทหรือคล้องผิดสาย', 'Clamp jaw not closed or on the wrong conductor'), [B('ตรวจว่าแคลมป์ปิดสนิทและคล้องสายเฟสเดียว (ห้ามคล้องรวม L+N)', 'Check the jaw is closed around ONE phase conductor (never L+N together)')], ''));
    }
    // phase mismatch: one phase PF far from the others while voltages are balanced
    const pfs = m.ph.map((p) => num(p.PF)).filter((v) => v != null).map(Math.abs);
    if (pfs.length === 3 && (m.THDI == null || m.THDI < 15)) {
      const md = pfs.slice().sort()[1];
      pfs.forEach((v, i) => {
        if (Math.abs(v - md) > 0.45) out.push(F(k, 'warn', 'wiring', 'W5', B(`PF เฟส L${i + 1} ต่างจากเฟสอื่นมาก — อาจคล้องแคลมป์สลับเฟสกับสายวัดแรงดัน`, `PF of L${i + 1} far from the others — clamp may be on a different phase than its voltage lead`),
          [`PF = ${pfs.map((x) => x.toFixed(2)).join(' / ')}`], B('แคลมป์ CH1 ต้องอยู่สายเดียวกับสายวัดแรงดัน L1 (สีแดง) ตามลำดับ', 'Clamp CH1 must sit on the same conductor as voltage lead L1 (red), and so on'),
          [B('ตรวจสีสายวัดแรงดันกับแคลมป์ให้ตรงเฟส: แดง=L1 เหลือง=L2 น้ำเงิน=L3', 'Match colours: red = L1, yellow = L2, blue = L3'), B('ดูหน้า VECTOR ของเครื่องวัด: แรงดันต้องห่าง 120° และกระแสแต่ละเฟสอยู่ใกล้แรงดันเฟสตัวเอง', 'Check the VECTOR screen: voltages 120° apart, each current near its own voltage')], ''));
      });
    }
    // current range far too high for the current (THD-I/K-factor invalid)
    if (set.rangeA && m.Iavg != null && m.Iavg > 0.05 && m.Iavg < 0.02 * set.rangeA) {
      out.push(F(k, 'warn', 'wiring', 'W6', B(`ช่วงกระแสใหญ่เกินไป (${set.rangeA} A สำหรับกระแส ~${m.Iavg.toFixed(1)} A)`, `Current range far too large (${set.rangeA} A for ~${m.Iavg.toFixed(1)} A)`),
        [`I = ${(m.Iavg / set.rangeA * 100).toFixed(1)} % ของช่วง`, set.sensor ? `sensor ${set.sensor}` : ''].filter(Boolean),
        B('กระแสต่ำกว่า ~2% ของช่วงวัด ค่า THD-I, K-factor, PF ผิดพลาดสูง', 'Below ~2 % of range, THD-I, K-factor and PF are unreliable'),
        [B('เลือกแคลมป์/ช่วงให้กระแสจริงอยู่ 10–100% ของช่วง (เช่น 50 A range หรือ 9694 5 A ที่ขั้ว CT)', 'Pick a clamp/range so the current is 10–100 % of range (e.g. 50 A range, or 9694 5 A on a CT secondary)'), B('PW3198: SYSTEM → Clamp Sensor ต้องตรงรุ่นแคลมป์ที่ใช้จริง', 'PW3198: SYSTEM → Clamp Sensor must match the clamp actually used')], 'Hioki sensor accuracy (% of range)'));
    }
    if (m.ph.some((p) => p.lowI)) {
      out.push(F(k, 'warn', 'wiring', 'W7', B('THD-I = 0 แต่ K-factor สูงผิดปกติ — กระแสต่ำเกินช่วงวัด', 'THD-I = 0 with an absurd K-factor — current below the usable range'), [],
        B('เครื่องวัดคำนวณฮาร์มอนิกกระแสไม่ได้เมื่อกระแสเล็กมากเทียบกับช่วง', 'The analyser cannot compute current harmonics this far below range'), [B('ลดช่วงกระแส / เปลี่ยนแคลมป์ให้เล็กลง', 'Lower the current range / use a smaller clamp')], ''));
    }
  }

  // MAIN vs LOAD consistency (Kirchhoff): with the APF off MAIN ≈ LOAD; MAIN can never use less real power than LOAD
  const mm = M.MAIN, ml = M.LOAD;
  if (mm && ml && mm.P != null && ml.P != null) {
    if (mm.P < ml.P * 0.95 - 0.2) {
      out.push(F('MAIN', 'crit', 'wiring', 'W8', B('P ของ MAIN น้อยกว่า LOAD — ตำแหน่งหรือป้ายเครื่องวัดสลับกัน', 'MAIN real power below LOAD — analysers swapped or MAIN not upstream'),
        [`P MAIN ${mm.P.toFixed(2)} kW < P LOAD ${ml.P.toFixed(2)} kW`], B('MAIN ต้องวัดก่อนจุดแยก (ฝั่งแหล่งจ่าย) จึงต้องเห็นกำลังมากกว่าหรือเท่ากับ LOAD เสมอ', 'MAIN must be upstream of the branch, so its kW is always ≥ LOAD'),
        [B('ตรวจว่าเครื่อง #2 อยู่ก่อนจุดแยกไป APF และโหลด', 'Check analyser #2 is before the branch to the APF and the loads'), B('ตรวจทิศแคลมป์ทั้งสองเครื่อง', 'Check clamp direction on both')], ''));
    } else {
      out.push(F('MAIN', 'ok', 'wiring', 'W9', B('ตำแหน่ง MAIN/LOAD สอดคล้องกัน (P MAIN ≥ P LOAD)', 'MAIN/LOAD placement consistent (P MAIN ≥ P LOAD)'), [`P ${mm.P.toFixed(2)} / ${ml.P.toFixed(2)} kW`], B('', ''), [], ''));
    }
  }

  // ---------------- 2. power quality per point
  for (const k of Object.keys(POINTS)) {
    const m = M[k]; if (!m || out.some((f) => f.point === k && f.id === 'W1')) continue;
    if (m.THDU != null && m.THDU > 5) {
      const crit = m.THDU > 8;
      out.push(F(k, crit ? 'crit' : 'warn', 'quality', 'Q1', B(`ฮาร์มอนิกแรงดันสูง THD-U ${m.THDU.toFixed(1)}%`, `High voltage distortion THD-U ${m.THDU.toFixed(1)} %`), [`THD-U = ${m.THDU.toFixed(2)} % (${crit ? '> 8 %' : '> 5 %'})`],
        B('กระแสฮาร์มอนิกจากโหลดไหลผ่านอิมพีแดนซ์ของแหล่งจ่าย (หม้อแปลง/สายยาว/เบรกเกอร์เล็ก) — ถ้ามีคาปาซิเตอร์อาจเกิดเรโซแนนซ์ขยายฮาร์มอนิก', 'Load harmonic currents flowing through the source impedance (transformer / long cable / small breaker) — with capacitors, resonance can amplify it'),
        [B('ลดกระแสฮาร์มอนิกที่ต้นเหตุ (APF/รีแอกเตอร์ที่โหลด)', 'Reduce harmonic current at its source (APF / reactors at the loads)'), B('ห้ามติดคาปาซิเตอร์ธรรมดาเพิ่ม ใช้แบบ detuned เท่านั้น', 'Do not add plain capacitors — detuned only'), B('ถ้า THD-I ที่จุดนี้ต่ำแต่ THD-U สูง แปลว่ามาจากต้นทาง/โหลดอื่น', 'If THD-I here is low but THD-U high, it comes from upstream / other loads')],
        'IEEE 519-2022 Table 1 (≤ 1 kV: 8 %) · IEC 61000-2-4 class 2 (8 %)'));
    }
    if (m.THDI != null && m.THDI > 20 && m.Iavg > 1) {
      out.push(F(k, m.THDI > 40 ? 'crit' : 'warn', 'quality', 'Q2', B(`ฮาร์มอนิกกระแสสูง THD-I ${m.THDI.toFixed(1)}%`, `High current distortion THD-I ${m.THDI.toFixed(1)} %`),
        [`THD-I = ${m.THDI.toFixed(1)} %`, m.Ihmax != null ? `Ih ≈ ${m.Ihmax.toFixed(1)} A/เฟส` : ''].filter(Boolean),
        B('โหลดไม่เชิงเส้น (VFD, เรกติไฟเออร์, UPS, แหล่งจ่ายสวิตชิ่ง, เครื่องกำเนิดฮาร์มอนิก)', 'Non-linear loads (VFD, rectifier, UPS, SMPS, harmonic generator)'),
        [B('ติด AC/DC reactor 3–5% ที่ VFD', 'Fit 3–5 % AC/DC reactors on VFDs'), B('APF ขนาด ≥ 1.25 × Ih', 'APF rated ≥ 1.25 × Ih')], 'IEEE 519-2022 Table 2 (TDD)'));
    }
    if (m.KF != null && m.KF > 4 && m.Iavg > 1) {
      out.push(F(k, m.KF > 9 ? 'crit' : 'warn', 'quality', 'Q3', B(`K-factor ${m.KF.toFixed(1)} — ฮาร์มอนิกลำดับสูง หม้อแปลง/สายร้อนเกิน`, `K-factor ${m.KF.toFixed(1)} — high-order harmonics, transformer/cable heating`),
        [`KF = ${m.KF.toFixed(1)}`, m.hEff ? `ลำดับเด่นเฉลี่ย ≈ ${m.hEff.toFixed(0)}` : ''].filter(Boolean),
        B('KF > 4 หม้อแปลงทั่วไปต้องลดพิกัด; ลำดับสูง (> 25) ตัวกรองแบบพาสซีฟและคาปาซิเตอร์ช่วยไม่ได้', 'KF > 4 needs transformer derating; high orders (> 25) are beyond passive filters and capacitors'),
        [B('ใช้ APF ที่ชดเชยถึงลำดับ 50 และความถี่สวิตช์สูง', 'Use an APF compensating to the 50th with high switching frequency'), B('ตรวจอุณหภูมิหม้อแปลง/สายนิวทรัล', 'Check transformer / neutral temperature')], 'IEEE C57.110 · UL 1561'));
    }
    if (m.unb != null && m.unb > 2) out.push(F(k, m.unb > 3 ? 'crit' : 'warn', 'quality', 'Q4', B(`แรงดันไม่สมดุล ${m.unb.toFixed(2)}%`, `Voltage unbalance ${m.unb.toFixed(2)} %`), [`Uunb = ${m.unb.toFixed(2)} %`], B('โหลด 1 เฟสไม่สมดุล/ขั้วต่อหลวม', 'Uneven single-phase loading / loose terminals'), [B('ย้ายโหลด 1 เฟสให้สมดุล ขันขั้วต่อ', 'Rebalance single-phase loads, tighten terminals')], 'EN 50160 (2 %)'));
    if (m.U.length === 3 && m.U.every((u) => u > 0.7 * udin) && (m.Umin < 0.9 * udin || m.Umax > 1.1 * udin)) out.push(F(k, 'warn', 'quality', 'Q5', B('แรงดันอยู่นอก ±10%', 'Voltage outside ±10 %'), [`U = ${m.U.map((u) => u.toFixed(1)).join(' / ')} V`], B('แหล่งจ่ายอ่อน/โหลดเกิน', 'Weak supply / overload'), [B('ตรวจแทปหม้อแปลงและขนาดสายป้อน', 'Check transformer tap and feeder size')], 'EN 50160'));
  }

  // ---------------- 3. power factor: displacement or distortion?  (main fix decision)
  for (const k of ['MAIN', 'LOAD']) {
    const m = M[k]; if (!m || m.PF == null || m.P == null || m.P < 0.2 || out.some((f) => f.point === k && f.id === 'W1')) continue;
    if (m.PF >= 0.9 && m.lead && Math.abs(m.Q) > 0.2) out.push(F(k, 'info', 'pf', 'P6', B(`มี Q นำหน้า ${Math.abs(m.Q).toFixed(2)} kvar แม้ PF ยังดี`, `Leading Q of ${Math.abs(m.Q).toFixed(2)} kvar although PF is fine`), [`Q = ${m.Q.toFixed(2)} kvar (ค่าลบ = capacitive)`],
      B('มักมาจากตัวเก็บประจุในฟิลเตอร์ของอุปกรณ์อิเล็กทรอนิกส์กำลังที่ต่ออยู่ตอนไม่ทำงาน (APF/ตัวกำเนิดฮาร์มอนิก/UPS ตอน standby ใช้ ~1 kvar ต่อเครื่อง) หรือคาปาซิเตอร์ที่ไม่ได้ปลด', 'Usually filter capacitors in idle power electronics (APF / harmonic generator / UPS in standby draw ~1 kvar each) or a capacitor step left on'),
      [B('ตอนโหลดน้อย ให้ปลดอุปกรณ์ที่ไม่ใช้ หรือให้ตู้คาปาซิเตอร์ปลดขั้น', 'At light load switch idle units off or let the capacitor bank step out')], ''));
    if (m.PF >= 0.9) { out.push(F(k, 'ok', 'pf', 'P0', B(`PF ${m.PF.toFixed(3)} ดี`, `PF ${m.PF.toFixed(3)} good`), [], B('', ''), [], '')); continue; }
    const distShare = m.N && m.D != null ? Math.min(1, (m.D / m.N) ** 2) : null;
    const ev = [`PF = ${m.PF.toFixed(3)}${m.lead ? ' (นำหน้า/capacitive)' : ''}`, `S ${m.S.toFixed(2)} kVA · P ${m.P.toFixed(2)} kW`];
    if (m.DPF != null) ev.push(`DPF (cos φ1) ≈ ${m.DPF.toFixed(3)} · kVA จากฮาร์มอนิก ≈ ${m.D.toFixed(2)}`);
    if (m.DPF != null && m.DPF >= 0.92) {
      out.push(F(k, 'crit', 'pf', 'P1', B('PF ต่ำเพราะฮาร์มอนิก ไม่ใช่รีแอกทีฟ — คาปาซิเตอร์แก้ไม่ได้', 'PF is low because of harmonics, not reactive power — capacitors will not fix it'), ev,
        B('เครื่องวัด Hioki คิด Q = √(S²−P²) จึงรวมกำลังฮาร์มอนิก (distortion) ไว้ด้วย ส่วนที่แก้ด้วยคาปาซิเตอร์ได้ (Q1) มีน้อย', 'Hioki computes Q = √(S²−P²), which includes distortion power; the capacitor-fixable part (Q1) is small'),
        [B('แก้ด้วย APF/ตัวกรองฮาร์มอนิก ที่ต้นเหตุ', 'Fix with an APF / harmonic filter at the source'), B('ห้ามเพิ่มคาปาซิเตอร์ธรรมดา (เสี่ยงเรโซแนนซ์)', 'Do not add plain capacitors (resonance risk)')], 'IEEE 1459-2010 (S² = P² + Q1² + D²)'));
    } else if (m.DPF == null && m.KF != null && m.KF > 10) {
      out.push(F(k, 'crit', 'pf', 'P1', B('PF ต่ำเพราะฮาร์มอนิกเป็นหลัก (ประเมินจาก K-factor) — คาปาซิเตอร์แก้ไม่ได้', 'PF is low mainly because of harmonics (judged from the K-factor) — capacitors will not fix it'),
        [...ev, `KF = ${m.KF.toFixed(1)} (> 10 = กระแสฮาร์มอนิกลำดับสูงจำนวนมาก)`, `กำลังไม่ทำงานรวม √(S²−P²) = ${m.N.toFixed(2)} kVA`],
        B('K-factor สูงเกิน 10 เกิดได้เมื่อกระแสฮาร์มอนิกมีสัดส่วนมากเท่านั้น จึงเป็นส่วนใหญ่ของ kVA ที่เกิน (Hioki รวม distortion ไว้ใน Q)', 'A K-factor above 10 only happens with a large share of harmonic current, so most of the excess kVA is distortion (Hioki includes it in Q)'),
        [B('แก้ด้วย APF/ตัวกรองฮาร์มอนิก', 'Fix with an APF / harmonic filter'), B('ห้ามเพิ่มคาปาซิเตอร์ธรรมดา', 'Do not add plain capacitors'), B('ให้ได้ตัวเลขแยกชัด: ลดช่วงกระแสหรืออ่าน THD-I จากหน้า HARMONICS', 'For an exact split: lower the current range or read THD-I on the HARMONICS screen')], 'IEEE 1459-2010 · IEEE C57.110'));
    } else if (m.lead) {
      out.push(F(k, 'crit', 'pf', 'P2', B('PF นำหน้า (capacitive) — ชดเชยเกิน/มีคาปาซิเตอร์หรือฟิลเตอร์ต่ออยู่ตอนโหลดน้อย', 'Leading PF (capacitive) — over-compensated / capacitors or filters on at light load'), ev,
        B('ตู้คาปาซิเตอร์ไม่ปลดขั้นตอนโหลดลด, ตัวเก็บประจุในฟิลเตอร์ของ APF/UPS/LED, หรือ APF ตั้งโหมดชดเชยผิด', 'Capacitor steps not switching out at light load, filter capacitors in APF/UPS/LED drivers, or wrong APF compensation mode'),
        [B('ตรวจ/ตั้งคอนโทรลเลอร์ตู้คาปาซิเตอร์ (C/k, ดีเลย์, ทิศ CT)', 'Check the capacitor controller (C/k, delay, CT direction)'), B('APF: ตั้งเป้า cos φ = 0.95–1.00 ฝั่ง lag', 'APF: target cos φ 0.95–1.00 lagging'), B('ถ้าต้องการชดเชยสองทาง ใช้ SVG แทนคาปาซิเตอร์', 'For two-way compensation use an SVG instead of capacitors')], 'PEA/MEA kvar billing · IEC 61921'));
    } else if (m.THDI != null && (m.THDI >= 10 || (m.THDU || 0) >= 3)) {
      out.push(F(k, 'warn', 'pf', 'P3', B('PF ต่ำจากรีแอกทีฟจริง แต่มีฮาร์มอนิก — ใช้คาปาซิเตอร์แบบ detuned', 'Real reactive PF problem with harmonics present — use a detuned capacitor bank'), ev,
        B('มอเตอร์/โหลดอินดักทีฟ ร่วมกับโหลดไม่เชิงเส้น', 'Motors / inductive loads plus non-linear loads'), [B('ตู้คาปาซิเตอร์ detuned 7% (189 Hz) หรือ 14% ถ้ามีลำดับ 3 สูง', 'Detuned bank 7 % (189 Hz), or 14 % with high 3rd harmonic')], 'IEC 61921 · IEEE 1036'));
    } else if (m.THDI != null) {
      out.push(F(k, 'warn', 'pf', 'P4', B('PF ต่ำจากรีแอกทีฟ — ตู้คาปาซิเตอร์มาตรฐานแก้ได้', 'Reactive PF problem — a standard capacitor bank fixes it'), ev, B('มอเตอร์โหลดเบา/โหลดอินดักทีฟ', 'Lightly loaded motors / inductive loads'), [B('ตู้คาปาซิเตอร์อัตโนมัติ (APFC) ตามขนาดที่คำนวณ', 'Automatic capacitor bank (APFC) as sized below')], 'IEC 61921'));
    } else {
      out.push(F(k, 'warn', 'pf', 'P5', B('PF ต่ำ — ยังแยกไม่ได้ว่ามาจากรีแอกทีฟหรือฮาร์มอนิก', 'Low PF — cannot yet separate reactive from harmonic'), ev,
        B('ยังไม่มีค่า THD-I ที่ใช้ได้ของจุดนี้', 'No valid THD-I at this point yet'), [B('ลดช่วงกระแสให้เครื่องวัดคำนวณ THD-I ได้ หรือดูหน้า HARMONICS ของเครื่อง', 'Lower the current range so THD-I is valid, or read the HARMONICS screen')], ''));
    }
  }

  // ---------------- 4. APF performance (needs MAIN and LOAD; APF meter / HMI optional)
  let apfEval = null;
  if (mm && ml && mm.S != null && ml.S != null && ml.N != null) {
    const nonActiveCut = ml.N > 0.2 ? 1 - (mm.N || 0) / ml.N : null;
    const Ineed = ml.N * 1000 / (3 * udin);              // APF current needed to cancel all non-active power
    const Iapf = apfIn.hmi && apfIn.hmi.iout ? mean(apfIn.hmi.iout.filter((v) => v != null)) : null;
    const running = apfIn.running ?? (nonActiveCut != null && nonActiveCut > 0.08);
    apfEval = {
      running, rating, Ineed, Iapf, util: Iapf != null ? Iapf / rating : null, nonActiveCut,
      kvaCut: 1 - mm.S / ml.S, IcutPct: ml.Iavg ? 1 - mm.Iavg / ml.Iavg : null,
      before: { S: ml.S, P: ml.P, PF: ml.PF, KF: ml.KF, I: ml.Iavg, N: ml.N, THDI: ml.THDI },
      after: { S: mm.S, P: mm.P, PF: mm.PF, KF: mm.KF, I: mm.Iavg, N: mm.N, THDI: mm.THDI },
      target: { S: Math.max(mm.P, ml.P), PF: 0.98, I: ml.P * 1000 / (3 * udin * 0.98) }
    };
    if (running && nonActiveCut != null && nonActiveCut < 0.6 && ml.N > 0.5) {
      const hyp = [];
      if (Ineed < rating * 0.9) hyp.push(B(`APF พิกัด ${rating} A พอ (ต้องการ ~${Ineed.toFixed(1)} A) — ไม่ใช่ปัญหาขนาด`, `APF rating ${rating} A is enough (needs ~${Ineed.toFixed(1)} A) — not a sizing problem`));
      else hyp.push(B(`APF เล็กเกิน: ต้องการ ~${Ineed.toFixed(0)} A แต่มี ${rating} A`, `APF too small: needs ~${Ineed.toFixed(0)} A, has ${rating} A`));
      out.push(F('APF', 'crit', 'apf', 'A1', B(`APF ชดเชยได้แค่ ${(nonActiveCut * 100).toFixed(0)}% ของกำลังที่ไม่ทำงาน (ควร ≥ 80%)`, `APF removes only ${(nonActiveCut * 100).toFixed(0)} % of the non-active power (should be ≥ 80 %)`),
        [`LOAD ${ml.S.toFixed(2)} kVA, PF ${ml.PF.toFixed(2)}, KF ${ml.KF != null ? ml.KF.toFixed(0) : '—'}`, `MAIN ${mm.S.toFixed(2)} kVA, PF ${mm.PF.toFixed(2)}, KF ${mm.KF != null ? mm.KF.toFixed(0) : '—'}`, Iapf != null ? `APF จ่าย ~${Iapf.toFixed(1)} A = ${(Iapf / rating * 100).toFixed(0)}% ของพิกัด` : '', ...hyp.map((h) => h.th)].filter(Boolean),
        B('ถ้าขนาดพอ สาเหตุมักเป็นการตั้งค่า: ตำแหน่ง/ทิศ/อัตราส่วน CT ของ APF, โหมดชดเชย, เพดานกระแส/สัดส่วนชดเชย, ลำดับฮาร์มอนิกที่เปิดชดเชย หรือฮาร์มอนิกลำดับสูงเกินแบนด์วิดท์ของ APF', 'If the size is enough, it is usually set-up: APF CT position/direction/ratio, compensation mode, current limit / compensation ratio, enabled harmonic orders, or orders above the APF bandwidth'),
        [B('APF → Parameter: CT ratio ต้องตรงกับ CT จริง (เช่น 50/5) และตำแหน่ง CT (ฝั่งโหลด/ฝั่งกริด) ตรงกับที่ติดตั้ง', 'APF → Parameter: CT ratio must match the real CT (e.g. 50/5) and CT position (load-side/grid-side) must match the installation'),
          B('CT ของ APF ต้องคล้องสายที่ไปโหลดทั้งหมด (ไม่คล้องสายออกของ APF เอง) ลูกศร P1 ชี้ไปทางแหล่งจ่าย', 'APF CTs must surround the conductors to ALL the compensated loads (not the APF’s own output); P1 towards the source'),
          B('ตั้งโหมด "ฮาร์มอนิก + รีแอกทีฟ" สัดส่วนชดเชย 100% เปิดลำดับ 2–50', 'Set mode "harmonics + reactive", compensation ratio 100 %, orders 2–50 enabled'),
          B('เทียบหน้าจอ APF: กระแสโหลดที่ APF อ่าน (Ial/Ibl/Icl) ต้องใกล้ค่า LOAD ของ PW3198', 'Compare the APF screen: the load current it reads (Ial/Ibl/Icl) must match the PW3198 LOAD reading')], 'APF manufacturer commissioning · IEEE 519-2022'));
    } else if (running && nonActiveCut != null && nonActiveCut >= 0.6) {
      out.push(F('APF', 'ok', 'apf', 'A0', B(`APF ทำงานดี ลดกำลังไม่ทำงานได้ ${(nonActiveCut * 100).toFixed(0)}%`, `APF working: removes ${(nonActiveCut * 100).toFixed(0)} % of non-active power`), [], B('', ''), [], ''));
    }
  }
  {
    const h = apfIn.hmi;
    // APF HMI cross-check: the load current the APF thinks it sees
    if (h && h.iload && ml && ml.Iavg) {
      const r = mean(h.iload.filter((v) => v != null)) / ml.Iavg;
      if (r > 3 || r < 0.33) out.push(F('APF', 'crit', 'apf', 'A2', B(`APF อ่านกระแสโหลดผิด ${r.toFixed(1)} เท่าของจริง — ตั้ง CT ratio ผิด`, `APF reads ${r.toFixed(1)}× the real load current — CT ratio set wrong`),
        [`APF: ${h.iload.map((v) => v.toFixed(1)).join(' / ')} A`, `PW3198 LOAD: ${ml.I.map((v) => v.toFixed(1)).join(' / ')} A`, h.thdL != null ? `THD_L บนหน้าจอ APF = ${h.thdL}%` : ''].filter(Boolean),
        B('APF คำนวณกระแสชดเชยจาก CT — ถ้าอัตราส่วนผิด APF จะจ่ายผิดขนาดหรือหยุดชดเชย', 'The APF computes its output from the CT — a wrong ratio makes it inject the wrong amount or stop'),
        [B('APF → Parameter → CT ratio = อัตราส่วนบนป้าย CT จริง', 'APF → Parameter → CT ratio = the ratio on the real CT label'), B('ตรวจว่าสาย CT ไม่หลวม/ไม่เปิดวงจร', 'Check CT wiring is tight and not open-circuit')], ''));
      if (h.thdL != null && h.thdL > 300) out.push(F('APF', 'crit', 'apf', 'A3', B(`ค่า THD_L บน APF = ${h.thdL}% ผิดปกติ — สัญญาณ CT ของ APF ผิด`, `APF THD_L = ${h.thdL} % is impossible — APF CT signal wrong`), [], B('สัญญาณ CT เปิดวงจร/ต่อสลับ/อัตราส่วนผิด', 'CT open, swapped or wrong ratio'), [B('ตรวจขั้วต่อ CT ที่ APF และค่า CT ratio', 'Check the CT terminals at the APF and the CT ratio')], ''));
    }
  
  }
  // APF analyser vs APF screen
  if (M.APF && apfIn.hmi && apfIn.hmi.iout && M.APF.Iavg != null) {
    const r = M.APF.Iavg / mean(apfIn.hmi.iout);
    if (apfIn.running !== false && (r < 0.5 || r > 2)) out.push(F('APF', 'warn', 'wiring', 'W10', B('เครื่องวัด #6 อ่านกระแส APF ไม่ตรงกับหน้าจอ APF', 'Analyser #6 disagrees with the APF screen'),
      [`#6: ${M.APF.Iavg.toFixed(2)} A · APF: ${mean(apfIn.hmi.iout).toFixed(2)} A`], B('แคลมป์ของ #6 ไม่ได้คล้องสายออกของ APF หรือเลือกรุ่นเซนเซอร์ไม่ตรง', '#6 clamps are not on the APF output conductors, or the sensor model setting is wrong'),
      [B('คล้องแคลมป์ #6 ที่สาย A/B/C ระหว่างเบรกเกอร์ APF กับขั้ว APF', 'Clamp #6 on the A/B/C cables between the APF breaker and the APF terminals'), B('SYSTEM → Clamp Sensor ให้ตรงรุ่น', 'Set SYSTEM → Clamp Sensor to the actual model')], ''));
  }

  // ---------------- 5. what to buy / do (sized)
  const rec = recommend(M, apfEval, input.prices, out, apfIn);
  // rank
  // root causes first: wrong wiring → APF set-up → PF decision → symptoms
  const CAT = { wiring: 0, apf: 1, pf: 2, quality: 3 };
  out.sort((a, b) => SEV[b.sev] - SEV[a.sev] || CAT[a.cat] - CAT[b.cat]);
  const worst = (k) => out.filter((f) => f.point === k).reduce((w, f) => (SEV[f.sev] > SEV[w] ? f.sev : w), 'ok');
  return { metrics: M, findings: out, apf: apfEval, recommend: rec, status: { MAIN: worst('MAIN'), LOAD: worst('LOAD'), APF: worst('APF') } };
}

// ------------------------------------------------------------------ investment options
// Budget unit prices (THB) are editable assumptions, not quotations:
//   APF: imported module ≈ US$30–50/A (Alibaba listings) up to ≈ US$420/A for UL-listed brands (Hammond 50 A ≈ US$21k)
//   detuned reactor 7 %: Schneider 50 kvar ≈ Rp 10.2 M ≈ ฿430/kvar (reactor only) → bank incl. capacitors, steps, panel ≈ ฿1,500–2,500/kvar
export const PRICES = { usd: 35, apfPerA: [2500, 6000], capPerKvar: [800, 1500], detunedPerKvar: [1500, 2500], svgPerKvar: [2500, 4500], reactorPerKw: [300, 700], install: 0.15 };

export function recommend(M, apfEval, prices = {}, findings = [], apfIn = {}) {
  const p = { ...PRICES, ...prices };
  const out = [];
  const m = M.LOAD || M.MAIN; if (!m || m.P == null) return out;
  const tgt = 0.95, tanT = Math.tan(Math.acos(tgt));
  const harmonicCase = findings.some((f) => ['P1', 'Q2', 'Q3'].includes(f.id)) || (m.THDI || 0) > 20 || (m.KF || 0) > 4;
  const reactiveCase = m.DPF != null && m.DPF < 0.9 && !m.lead;
  const range = (a, q) => [Math.round(a[0] * q * (1 + p.install) / 1000) * 1000, Math.round(a[1] * q * (1 + p.install) / 1000) * 1000];
  // APF size: harmonic current (or all non-active current when THD-I is not known) × 1.25 margin
  const Ih = m.Ihmax ?? (m.N != null ? m.N * 1000 / (3 * (m.U.length ? mean(m.U) : 230)) : null);
  if (Ih != null && harmonicCase) {
    const need = Ih * 1.25, size = APF_SIZES.find((s) => s >= need) || need;
    out.push({ id: 'apf', pick: true, th: `Active Power Filter (APF) ${size} A`, en: `Active Power Filter (APF) ${size} A`, size, unit: 'A',
      why: B(`ต้องชดเชย ~${Ih.toFixed(1)} A/เฟส × 1.25 สำรอง — แก้ได้ทั้งฮาร์มอนิกถึงลำดับ 50, PF และไม่เสี่ยงเรโซแนนซ์`, `Needs ~${Ih.toFixed(1)} A/phase × 1.25 margin — fixes harmonics up to the 50th, PF, no resonance risk`),
      result: B('THD-I < 5–8% ที่ MAIN, PF ≥ 0.95, KF < 4', 'THD-I < 5–8 % at MAIN, PF ≥ 0.95, KF < 4'), budget: range(p.apfPerA, size),
      note: apfIn.rating && size <= apfIn.rating ? B('มี APF อยู่แล้วและขนาดพอ — แก้การตั้งค่าก่อนซื้อใหม่ (งบ ≈ 0)', 'An APF is already installed and big enough — fix its set-up before buying (≈ ฿0)') : null });
  }
  const Qc = m.P * (Math.tan(Math.acos(Math.min(0.999, m.DPF ?? m.PF))) - tanT);
  if (reactiveCase && Qc > 0.5) {
    const detuned = (m.THDI || 0) >= 10 || (m.THDU || 0) >= 3;
    const q = Math.ceil(Qc / 5) * 5;
    out.push({ id: detuned ? 'detuned' : 'cap', pick: !harmonicCase, th: detuned ? `ตู้คาปาซิเตอร์ detuned 7% ${q} kvar` : `ตู้คาปาซิเตอร์อัตโนมัติ ${q} kvar`, en: detuned ? `Detuned 7 % capacitor bank ${q} kvar` : `Automatic capacitor bank ${q} kvar`, size: q, unit: 'kvar',
      why: B(`Qc = P(tanφ1 − tanφ2) = ${m.P.toFixed(2)} × (${Math.tan(Math.acos(Math.min(0.999, m.DPF ?? m.PF))).toFixed(2)} − ${tanT.toFixed(2)}) = ${Qc.toFixed(1)} kvar`, `Qc = P(tanφ1 − tanφ2) = ${Qc.toFixed(1)} kvar`),
      result: B('cos φ ≥ 0.95, ไม่โดนค่าปรับ kvar', 'cos φ ≥ 0.95, no kvar charge'), budget: range(detuned ? p.detunedPerKvar : p.capPerKvar, q) });
  }
  if (m.lead && m.N > 0.5 && findings.some((f) => f.id === 'P2')) {
    const q = Math.ceil(m.N / 5) * 5;
    out.push({ id: 'svg', pick: false, th: `SVG (static var generator) ${q} kvar — ถ้าต้องชดเชยทั้งนำหน้า/ล้าหลัง`, en: `SVG ${q} kvar — for two-way (leading/lagging) compensation`, size: q, unit: 'kvar',
      why: B('PF นำหน้า: ปลดคาปาซิเตอร์ก่อน (งบ 0) ถ้ายังนำหน้า ใช้ SVG ซึ่งชดเชยได้สองทิศ', 'Leading PF: switch capacitors off first (฿0); if still leading, an SVG compensates both ways'), result: B('PF 0.98–1.00', 'PF 0.98–1.00'), budget: range(p.svgPerKvar, q) });
  }
  if (harmonicCase && m.P > 0) {
    out.push({ id: 'reactor', pick: false, th: 'AC/DC reactor 3–5% ที่ VFD แต่ละตัว (ลดที่ต้นเหตุ)', en: '3–5 % AC/DC reactor on each VFD (reduce at source)', size: Math.round(m.P), unit: 'kW',
      why: B('ลด THD-I ของ VFD 6 พัลส์จาก ~80–100% เหลือ ~35–45% ราคาถูก ใช้ร่วมกับ APF ทำให้ APF เล็กลง', 'Cuts 6-pulse VFD THD-I from ~80–100 % to ~35–45 %, cheap, lets the APF be smaller'), result: B('THD-I ลด ~50%', 'THD-I ≈ −50 %'), budget: range(p.reactorPerKw, m.P) });
  }
  const own = out.find((o) => o.id === 'apf' && o.note);
  if (own) own.pick = false;
  out.push({ id: 'cfg', pick: !!own || !out.some((o) => o.pick), th: 'ตั้งค่า/ติดตั้งให้ถูก (CT, โหมดชดเชย, ช่วงวัด)', en: 'Correct set-up (CT, compensation mode, ranges)', size: null, unit: '', why: B('แก้จุดที่ระบบวินิจฉัยชี้ก่อนลงทุน — หลายกรณีหายโดยไม่ต้องซื้อ', 'Fix the items flagged above before investing — many cases need no purchase'), result: B('ได้ค่าที่วัดถูกต้องและ APF ทำงานเต็มที่', 'Correct readings and a fully working APF'), budget: [0, 0] });
  return out;
}

// ------------------------------------------------------------------ Lab case 13 Nov 2026 (transcribed from the analyser screens)
// Bench: building 20 A breaker → MAIN (#2) → branch: LOAD feeder (#3: heat guns + NANCAL "Harmonics Gen")
//        and APF branch (#6: NANCAL NC AH-3L-400-50/H, 400 V 50 A 35 kVA, 3-wire Δ). PW3198 3P4W, Udin 230 V, 50 A range.
const rec = (U, I, P, S, Q, PF, KF, extra = {}) => ({
  ph: [0, 1, 2].map((i) => ({ U: U[i], I: I[i], P: P[i] * 1000, S: S[i] * 1000, Q: Q[i] * 1000, PF: Math.abs(PF[i]), pfSign: Math.sign(PF[i]), KF: KF ? KF[i] : null, Ithd: extra.Ithd ? extra.Ithd[i] : null, Uthd: extra.Uthd ? extra.Uthd[i] : null })),
  P: P.reduce((s, v) => s + v, 0), S: S.reduce((s, v) => s + v, 0), Q: Q.reduce((s, v) => s + v, 0), PF: Math.abs(PF[3]), pfSign: Math.sign(PF[3]), f: extra.f || 50, unb: extra.unb ?? null
});
export const LAB_CASE = {
  title: B('Lab 13 พ.ย. 2026 — เครื่องกำเนิดฮาร์มอนิก + APF NANCAL 50 A', 'Lab 13 Nov 2026 — harmonic generator + NANCAL 50 A APF'),
  apf: { rating: 50, model: 'NANCAL NC AH-3L-400-50/H (400 V, 50 A, 35 kVA, 3L)' },
  steps: [
    { t: '11:22–11:27', th: 'ต่อเครื่องวัด #6 ที่ APF (ก่อนแก้การตั้งค่า)', en: 'Analyser #6 on the APF (before fixing its set-up)',
      points: { LOAD: rec([228.50, 233.77, 233.58], [7.502, 9.771, 10.353], [1.093, 1.718, 1.976], [1.714, 2.284, 2.418], [-1.320, -1.505, -1.394], [-0.6377, -0.7523, -0.8170, -0.7461], [28.18, 19.04, 16.67], { f: 49.95 }),
        APF: rec([134.06, 132.99, 135.44], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0, 0], null, { f: 49.96, Uthd: [4.69, 3.67, 4.22] }) },
      setup: { APF: { wiring: '3P4W', rangeA: 500, sensor: '9661' } }, apf: { running: false } },
    { t: '11:28–11:29', th: 'โหลดฮีตเตอร์อย่างเดียว (ยังไม่เปิดตัวกำเนิดฮาร์มอนิก)', en: 'Heaters only (harmonic generator off)',
      points: { MAIN: rec([229.05, 237.17, 237.61], [4.925, 7.796, 8.494], [1.071, 1.722, 1.986], [1.129, 1.849, 2.018], [-0.355, -0.673, -0.360], [-0.9493, -0.9314, -0.9839, -0.9567], [2.70, 1.99, 1.20], { f: 50.018 }),
        LOAD: rec([228.74, 234.56, 235.81], [4.946, 7.803, 8.492], [1.075, 1.723, 1.968], [1.131, 1.830, 2.002], [-0.352, -0.616, -0.369], [-0.9503, -0.9413, -0.9828, -0.9601], [2.58, 1.96, 1.19], { f: 50.004 }) }, apf: { running: false } },
    { t: '11:30–11:33', th: 'เปิดตัวกำเนิดฮาร์มอนิกเต็มที่ · APF ยังไม่ชดเชย', en: 'Harmonic generator full · APF not compensating',
      points: { MAIN: rec([228.22, 236.87, 237.45], [11.783, 13.532, 13.988], [1.098, 1.737, 2.078], [2.689, 3.205, 3.322], [-2.455, -2.694, -2.591], [-0.4084, -0.5420, -0.6256, -0.5331], [38.45, 32.35, 29.87], { f: 50.005 }),
        LOAD: rec([231.05, 235.83, 231.58], [11.734, 13.514, 13.888], [1.106, 1.763, 1.967], [2.711, 3.187, 3.216], [-2.475, -2.655, -2.545], [-0.4080, -0.5533, -0.6115, -0.5306], [37.46, 31.31, 29.22], { f: 50.014 }) }, apf: { running: false } },
    { t: '11:33–11:39', th: 'สั่ง APF ทำงาน (APF จ่าย ~7.5 A, เห็นกระแสโหลด 11–13 A ถูกต้อง)', en: 'APF started (APF ~7.5 A out, sees 11–13 A load correctly)',
      points: { MAIN: rec([230.86, 236.12, 235.00], [9.142, 10.586, 11.182], [1.333, 1.698, 1.965], [2.111, 2.500, 2.628], [-1.636, -1.834, -1.745], [-0.6317, -0.6793, -0.7477, -0.6903], [19.77, 16.62, 13.33], { f: 49.973 }),
        LOAD: rec([231.05, 235.83, 231.58], [11.734, 13.514, 13.888], [1.106, 1.763, 1.967], [2.711, 3.187, 3.216], [-2.475, -2.655, -2.545], [-0.4080, -0.5533, -0.6115, -0.5306], [37.46, 31.31, 29.22], { f: 50.014 }),
        APF: rec([229.76, 234.64, 235.58], [1.615, 1.588, 1.605], [0, 0, 0], [0.371, 0.373, 0.378], [-0.371, -0.373, -0.378], [-0.0001, -0.0001, -0.0001, -0.0001], null, { f: 49.98, Uthd: [9.54, 8.47, 8.38] }) },
      setup: { APF: { wiring: '3P4W', rangeA: 50, sensor: '9661' } },
      apf: { running: true, hmi: { s: 4.735, pf: 0.875, iout: [8.04, 7.217, 7.345], iload: [11.618, 11.041, 13.249], thdL: null } } },
    { t: '12:12', th: 'หน้าจอ APF หลังมีการแก้ Parameter', en: 'APF screen after Parameter changes',
      points: { LOAD: rec([231.05, 235.83, 231.58], [11.734, 13.514, 13.888], [1.106, 1.763, 1.967], [2.711, 3.187, 3.216], [-2.475, -2.655, -2.545], [-0.4080, -0.5533, -0.6115, -0.5306], [37.46, 31.31, 29.22], { f: 50.014 }) },
      apf: { running: true, hmi: { s: 1.293, pf: 0.647, iout: [15.73, 15.716, 15.759], iload: [440.157, 434.12, 428.93], thdL: 826340.62, thdS: 8.251 } },
      note: B('ค่า LOAD ใช้ค่าล่าสุดที่ถ่ายไว้ (11:33) — ตอน 12:12 ไม่มีภาพหน้าจอ LOAD', 'LOAD values are the latest photographed (11:33) — no LOAD screen at 12:12') }
  ]
};

// ------------------------------------------------------------------ per-order harmonics (which frequencies must be fixed)
// Voltage, LV: IEC 61000-2-2 / 61000-2-4 class 2 compatibility levels (% of fundamental); IEEE 519-2022 ≤ 1 kV: 5 % each, THD 8 %.
export function uLimitIEC(h) {
  if (h % 2 === 1) {
    if (h % 3 === 0) return ({ 3: 5, 9: 1.5, 15: 0.4, 21: 0.3 })[h] ?? 0.2;
    return ({ 5: 6, 7: 5, 11: 3.5, 13: 3 })[h] ?? (h <= 49 ? 2.27 * 17 / h - 0.27 : 0.2);
  }
  return ({ 2: 2, 4: 1, 6: 0.5, 8: 0.5 })[h] ?? 0.25 * 10 / h + 0.25;
}
// Current: IEEE 519-2022 Table 2 (120 V–69 kV), % of IL (maximum demand current), by short-circuit ratio Isc/IL.
// Even orders: h ≤ 6 → 50 % of the value, h > 6 → 100 % (2022 rule).
export const IEEE519_I = [
  { scr: 20, b: [4.0, 2.0, 1.5, 0.6, 0.3], tdd: 5 }, { scr: 50, b: [7.0, 3.5, 2.5, 1.0, 0.5], tdd: 8 },
  { scr: 100, b: [10.0, 4.5, 4.0, 1.5, 0.7], tdd: 12 }, { scr: 1000, b: [12.0, 5.5, 5.0, 2.0, 1.0], tdd: 15 }, { scr: Infinity, b: [15.0, 7.0, 6.0, 2.5, 1.4], tdd: 20 }
];
export function iLimitIEEE(h, scr = 15) {
  const row = IEEE519_I.find((r) => scr < r.scr) || IEEE519_I[IEEE519_I.length - 1];
  const band = h < 11 ? 0 : h < 17 ? 1 : h < 23 ? 2 : h < 35 ? 3 : 4;
  return row.b[band] * (h % 2 === 0 && h <= 6 ? 0.5 : 1);
}
const FAMILY = (h) => (h % 2 === 0 ? 'even' : h % 3 === 0 ? 'triplen' : (h % 6 === 1 || h % 6 === 5) ? (h <= 13 ? 'six' : h <= 25 ? 'high' : 'vhigh') : 'other');

/**
 * ih / uh: arrays indexed by order (0 = DC, 1 = fundamental = 100) in % of fundamental.
 * opt: { scr (Isc/IL), ilRatio (I1/IL, 1 = at full demand), f0 (50), txKva, txZ (%), capKvar }
 */
export function harmonicOrders(ih = [], uh = [], opt = {}) {
  const f0 = opt.f0 || 50, scr = opt.scr ?? 15, k = opt.ilRatio ?? 1;
  const rows = [];
  for (let h = 2; h <= 50; h++) {
    const i = ih[h] ?? null, u = uh[h] ?? null;
    const iL = i != null ? i * k : null, il = iLimitIEEE(h, scr), ul = uLimitIEC(h);
    rows.push({ h, f: h * f0, fam: FAMILY(h), i, iL, il, iRatio: iL != null ? iL / il : null, u, ul, uRatio: u != null ? u / ul : null });
  }
  const thd = (arr) => { const v = arr.slice(2, 51).filter((x) => x != null); return v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0)) : null; };
  const THDI = thd(ih), THDU = thd(uh), TDD = THDI != null ? THDI * k : null;
  const row = IEEE519_I.find((r) => scr < r.scr) || IEEE519_I[IEEE519_I.length - 1];
  const over = rows.filter((r) => (r.iRatio != null && r.iRatio > 1) || (r.uRatio != null && r.uRatio > 1));
  const fam = {}; for (const r of rows) if (r.i != null) fam[r.fam] = (fam[r.fam] || 0) + r.i * r.i;
  const share = Object.fromEntries(Object.entries(fam).map(([a, v]) => [a, THDI ? v / (THDI * THDI) : 0]));
  // capacitor resonance with the supply transformer: hr = √(Sk / Qc), Sk = S_tx / Z
  let res = null;
  if (opt.txKva && opt.txZ && opt.capKvar) {
    const Sk = opt.txKva / (opt.txZ / 100), hr = Math.sqrt(Sk / opt.capKvar);
    const near = rows.filter((r) => Math.abs(r.h - hr) <= 0.6 && ((r.i ?? 0) > 1 || (r.u ?? 0) > 0.5 || [5, 7, 11, 13].includes(r.h)));
    res = { Sk, hr, fr: hr * f0, near: near.map((r) => r.h), danger: near.length > 0 || (hr > 4.2 && hr < 14) };
  }
  const dc = ih[0] ?? null;
  return { rows, THDI, THDU, TDD, tddLimit: row.tdd, scr, over, worst: over.slice().sort((a, b) => Math.max(b.iRatio || 0, b.uRatio || 0) - Math.max(a.iRatio || 0, a.uRatio || 0)).slice(0, 6), share, res, dc, dcBad: dc != null && dc > 0.5 };
}

// Lab 13 Nov 2026, analyser #3 LOAD, current CH2, 11:20 (HARMONICS → LIST, % of fundamental; orders 34–35 hidden by glare)
export const LAB_HARMONICS = {
  t: '11:20', where: '#3 LOAD · I CH2 (L2)', I1: 9.8,
  ih: [2.15, 100, 0.52, 3.13, 0.53, 15.55, 0.54, 7.23, 0.48, 2.60, 0.60, 8.93, 0.73, 5.31, 0.54, 6.05, 0.41, 6.80, 0.56, 5.26, 0.58, 4.03, 0.39, 2.05, 0.56, 7.94, 0.75, 3.24, 0.34, 5.63, 0.65, 5.82, 0.26, 3.21, null, null, 0.28, 3.15, 0.18, 1.99, 0.17, 0.88, 0.21, 1.30, 0.09, 1.87, 0.17, 1.21, 0.18, 1.04, 0.08]
};
