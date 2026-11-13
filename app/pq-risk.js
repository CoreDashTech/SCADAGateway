// CoreDash · early-warning analysis on the 1-second live values: intermittent supply, dips/swells/spikes,
// rapid voltage changes (flicker), loose / hot connections, arcing signature, overload, neutral overload,
// single-phasing, earth leakage (if CH4 is on PE). Every event says WHERE, WHY and WHAT TO DO.
//
// What an electrical fire or short circuit usually looks like before it happens (and what a power analyser can see):
//   • loose / corroded joint → resistance rises → extra voltage drop on one phase under load, voltage jitter,
//     later arcing (HF noise bursts) → heat → insulation fails → short circuit / fire        (seen: yes, indirectly)
//   • overload / harmonic heating of cables, neutral and transformer (THD-I, K-factor, I > rating)  (seen: yes)
//   • neutral overloaded by triplen harmonics — the neutral has no breaker                          (seen: yes, CH4)
//   • insulation ageing / moisture → leakage current to earth                                       (seen: only with a clamp on PE/residual)
//   • surges (lightning, switching) puncture weak insulation                                        (seen: partly, peaks every second)
//   • the temperature of a lug itself                                                               (not seen: needs thermography / sensors)
// Standards: IEC 61000-4-30 (dips/swells/interruptions/RVC), EN 50160, IEC 61000-4-15 (flicker),
// IEC 62606 (AFDD arc detection), IEC 60364-4-42 & -5-53 (300 mA RCD for fire protection), IEC 60364-6 (verification),
// NFPA 70B (thermography), IEEE C57.110 (harmonic heating).

const B = (th, en) => ({ th, en });
const med = (a) => { const s = a.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const mean = (a) => { const s = a.filter((v) => v != null && Number.isFinite(v)); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
const NAMES = { MAIN: '#2 MAIN', LOAD: '#3 LOAD', APF: '#6 APF' };

export const RISK_DEFAULTS = { udin: 230, window: 600, rating: { MAIN: null, LOAD: null, APF: null }, ch4: 'neutral' };

export class PqRiskEngine {
  constructor(opt = {}) {
    this.o = { ...RISK_DEFAULTS, ...opt, rating: { ...RISK_DEFAULTS.rating, ...(opt.rating || {}) } };
    this.ring = { MAIN: [], LOAD: [], APF: [] };
    this.events = []; this.active = new Map(); this.seq = 0; this.onEvent = opt.onEvent || (() => {});
  }
  setOptions(o) { Object.assign(this.o, o, { rating: { ...this.o.rating, ...(o.rating || {}) } }); }

  // rec = pw3198Record / pq-model shape
  feed(point, rec, ts = Date.now()) {
    if (!rec || !rec.ph) return;
    const s = { ts, U: rec.ph.map((p) => p.U ?? null), I: rec.ph.map((p) => p.I ?? null), P: rec.ph.map((p) => p.P ?? null),
      Upk: rec.ph.map((p) => Math.max(Math.abs(p.Upk ?? 0), Math.abs(p.UpkN ?? 0)) || null), Uhf: rec.ph.map((p) => p.Uhf ?? null), Ihf: rec.ph.map((p) => p.Ihf ?? null),
      IN: rec.IN ?? null, KF: rec.KF ?? null, f: rec.f ?? null };
    const R = this.ring[point]; R.push(s);
    while (R.length && ts - R[0].ts > this.o.window * 1000) R.shift();
  }

  // run every second (or less often); returns the current list of active risks
  analyse(now = Date.now()) {
    const out = [], u = this.o.udin;
    for (const k of Object.keys(this.ring)) {
      const R = this.ring[k]; if (R.length < 5) continue;
      const last = R[R.length - 1];
      if (now - last.ts > 15000) continue;
      const hadU = R.some((s) => s.U.some((v) => v > 0.5 * u)); if (!hadU) continue;
      // 1. interruptions / dips / swells counted per phase (each change of state = one event)
      const cnt = { int: [0, 0, 0], dip: [0, 0, 0], swell: [0, 0, 0], rvc: [0, 0, 0], rvcLoad: [0, 0, 0], spike: [0, 0, 0] };
      for (let i = 1; i < R.length; i++) {
        const a = R[i - 1], b = R[i];
        for (let p = 0; p < 3; p++) {
          const ua = a.U[p], ub = b.U[p]; if (ua == null || ub == null) continue;
          const st = (v) => (v < 0.1 * u ? 'int' : v < 0.9 * u ? 'dip' : v > 1.1 * u ? 'swell' : 'ok');
          if (st(ub) !== 'ok' && st(ub) !== st(ua)) cnt[st(ub)][p]++;
          // rapid voltage change: ≥ 3 % Udin step between seconds while staying inside ±10 % (IEC 61000-4-30 RVC idea)
          if (st(ua) === 'ok' && st(ub) === 'ok' && Math.abs(ub - ua) >= 0.03 * u) {
            const di = Math.abs((b.I[p] ?? 0) - (a.I[p] ?? 0)), ib = Math.max(1, a.I[p] ?? 0, b.I[p] ?? 0);
            if (di / ib > 0.2) cnt.rvcLoad[p]++; else cnt.rvc[p]++;
          }
          if (b.Upk[p] != null && b.Upk[p] > 1.3 * Math.SQRT2 * u && !(a.Upk[p] > 1.3 * Math.SQRT2 * u)) cnt.spike[p]++;
        }
      }
      const tot = (a) => a.reduce((x, y) => x + y, 0), ph = (a) => a.map((v, i) => (v ? `L${i + 1}×${v}` : '')).filter(Boolean).join(' ');
      const mins = Math.max(1, Math.round((last.ts - R[0].ts) / 60000));
      if (tot(cnt.int) + tot(cnt.dip) >= 3) {
        out.push(ev(k, 'intermittent', tot(cnt.int) ? 'crit' : 'warn', B('ไฟขาดๆ หายๆ (ไฟตก/ดับซ้ำ)', 'Intermittent supply (repeated dips/interruptions)'),
          [`${tot(cnt.int)} ดับ · ${tot(cnt.dip)} ตก ใน ${mins} นาที`, ph(cnt.int.map((v, i) => v + cnt.dip[i]))],
          B('ถ้าเกิดเฉพาะบางเฟส: ขั้วต่อ/เบรกเกอร์/คอนแทคเตอร์ของเฟสนั้นหลวมหรือหน้าสัมผัสไหม้ · ถ้าเกิดทุกเฟสและ MAIN ก็เห็น: มาจากการไฟฟ้า (รีโคลสเซอร์) หรือเบรกเกอร์เมน', 'Some phases only: loose/burnt terminal, breaker or contactor on that phase · all phases and MAIN too: utility (recloser) or main breaker'),
          [B('ดูว่า MAIN เห็นด้วยไหม (ระบบเทียบให้ด้านล่าง) เพื่อแยกต้นทาง/ปลายทาง', 'See whether MAIN sees it too (compared below) to split upstream / downstream'), B('ตัดไฟ ขันขั้วต่อด้วยประแจทอร์กตามค่าผู้ผลิต ตรวจรอยไหม้ที่หน้าสัมผัส', 'Isolate, re-torque terminals to the maker’s value, inspect contacts for burn marks'), B('สแกนกล้องความร้อนขณะมีโหลด (ΔT > 15 °C เทียบเฟสอื่น = แก้ทันที)', 'Thermal-scan under load (ΔT > 15 °C vs other phases = fix now)')],
          'IEC 61000-4-30 · EN 50160 · NFPA 70B'));
      }
      if (tot(cnt.rvc) >= 5) {
        out.push(ev(k, 'jitter', 'warn', B('แรงดันกระตุก/วูบ โดยกระแสไม่เปลี่ยน — สัญญาณจุดต่อหลวม', 'Voltage jumps while current is steady — loose-joint signature'),
          [`${tot(cnt.rvc)} ครั้ง (ΔU ≥ 3%) ใน ${mins} นาที`, ph(cnt.rvc)],
          B('เมื่อกระแสคงที่แต่แรงดันกระโดด แปลว่าความต้านทานในทางเดินไฟเปลี่ยนเอง — จุดต่อหลวม/ออกไซด์/เริ่มอาร์ก', 'Steady current but jumping voltage means the path resistance changes by itself — loose/oxidised joint, starting to arc'),
          [B('ไล่ตรวจจุดต่อของเฟสที่ระบุ: บัส → เบรกเกอร์ → คอนแทคเตอร์ → ขั้วโหลด', 'Trace the joints of that phase: busbar → breaker → contactor → load terminal'), B('พิจารณาติด AFDD (IEC 62606) ที่วงจรเสี่ยง', 'Consider an AFDD (IEC 62606) on that circuit')], 'IEC 61000-4-30 RVC · IEC 62606'));
      }
      if (tot(cnt.rvcLoad) >= 10) {
        out.push(ev(k, 'flicker', 'info', B('แรงดันแกว่งตามโหลด (ไฟกระพริบ)', 'Voltage swings with the load (flicker)'), [`${tot(cnt.rvcLoad)} ครั้ง ใน ${mins} นาที`],
          B('โหลดกระชาก (มอเตอร์สตาร์ท เครื่องเชื่อม คอมเพรสเซอร์) บนแหล่งจ่ายอ่อน', 'Pulsing loads (motor starts, welders, compressors) on a weak supply'), [B('ดูค่า Pst/Plt บน PW3198 (เกณฑ์ Plt ≤ 1)', 'Read Pst/Plt on the PW3198 (Plt ≤ 1)'), B('ซอฟต์สตาร์ท/VFD, แยกวงจรโหลดกระชาก', 'Soft starter / VFD, separate the pulsing load circuit')], 'IEC 61000-4-15 · EN 50160'));
      }
      if (tot(cnt.spike) >= 1) {
        out.push(ev(k, 'spike', tot(cnt.spike) >= 3 ? 'crit' : 'warn', B('ไฟกระชาก (แรงดันยอดสูงผิดปกติ)', 'Voltage surges (abnormal peak voltage)'), [`${tot(cnt.spike)} ครั้ง`, ph(cnt.spike), `ยอดสูงสุด ${Math.max(...R.flatMap((s) => s.Upk.filter((v) => v != null))).toFixed(0)} V`],
          B('สวิตชิ่งคาปาซิเตอร์/โหลดอินดักทีฟ ฟ้าผ่าเหนี่ยวนำ — ไฟกระชากซ้ำๆ ทำให้ฉนวนอ่อนแอจนลัดวงจรได้', 'Capacitor/inductive switching, induced lightning — repeated surges weaken insulation until it shorts'),
          [B('ติด/ตรวจ SPD Type 1+2 ที่ตู้เมน Type 2 ที่ตู้ย่อย (ไฟแสดงสถานะ SPD)', 'Fit/check SPD Type 1+2 at the main, Type 2 at sub-boards (status window)'), B('ตรวจกราวด์ < 5 Ω', 'Check earthing < 5 Ω')], 'IEC 61643-11 · IEC 60364-4-44'));
      }
      // 2. overload & harmonic heating
      const rating = this.o.rating[k];
      const Imax = Math.max(...last.I.filter((v) => v != null), 0);
      if (rating) {
        const recent = R.slice(-60), hot = recent.filter((s) => Math.max(...s.I.filter((v) => v != null), 0) > 0.8 * rating).length;
        if (Imax > rating && R.slice(-10).every((s) => Math.max(...s.I.filter((v) => v != null), 0) > rating)) out.push(ev(k, 'overload', 'crit', B(`โหลดเกินพิกัด ${(Imax / rating * 100).toFixed(0)}% ของเบรกเกอร์ ${rating} A`, `Overload ${(Imax / rating * 100).toFixed(0)} % of the ${rating} A breaker`), [`I สูงสุด ${Imax.toFixed(1)} A`],
          B('สาย/ขั้วต่อร้อนเกิน ฉนวนเสื่อมเร็ว — เบรกเกอร์อาจยังไม่ตัดถ้าเกินไม่มาก (เส้นโค้งความร้อน)', 'Cables/terminals overheat, insulation ages fast — the breaker may not trip yet for a small overload (thermal curve)'), [B('ลดโหลด/ย้ายโหลด หรือเพิ่มขนาดสายและเบรกเกอร์ตามมาตรฐาน', 'Shed/move load, or upsize cable and breaker to code'), B('ถ้ามีฮาร์มอนิกสูง กระแส rms จริงสูงกว่าที่คิด — แก้ฮาร์มอนิกด้วย', 'With high harmonics the true rms is higher than expected — fix harmonics too')], 'IEC 60364-4-43'));
        else if (hot >= 50) out.push(ev(k, 'load80', 'warn', B(`ใช้งานใกล้พิกัด (> 80% ของ ${rating} A)`, `Near full load (> 80 % of ${rating} A)`), [`I ${Imax.toFixed(1)} A`, last.KF ? `KF ${last.KF.toFixed(1)}` : ''].filter(Boolean),
          B('ทำงานต่อเนื่องเกิน 80% + ฮาร์มอนิก ทำให้สายและขั้วร้อนสะสม', 'Continuous > 80 % plus harmonics heats cables and lugs'), [B('สแกนความร้อนที่ขั้วเบรกเกอร์/บัส', 'Thermal-scan breaker lugs / busbar')], 'IEC 60364-5-52 · IEEE C57.110'));
      }
      // 3. neutral
      if (this.o.ch4 === 'neutral' && last.IN != null && Imax > 2 && last.IN > Imax) out.push(ev(k, 'neutral', 'crit', B('กระแสนิวทรัลสูงกว่ากระแสเฟส', 'Neutral current above phase current'), [`IN ${last.IN.toFixed(1)} A > I ${Imax.toFixed(1)} A`],
        B('ฮาร์มอนิกลำดับ 3 จากโหลด 1 เฟส (คอม/LED/UPS) รวมกันในสาย N ซึ่งไม่มีเบรกเกอร์ป้องกัน — จุดเสี่ยงไฟไหม้', 'Triplen harmonics from single-phase loads add up in N, which has no breaker — a fire risk point'), [B('ตรวจความร้อนสาย N และขั้ว N บาร์', 'Check N conductor and N-bar temperature'), B('ขนาดสาย N ≥ สายเฟส (หรือ 1.73×) ใช้ตัวกรองลำดับศูนย์/APF 4 สาย', 'N ≥ phase size (or 1.73×), zero-sequence filter / 4-wire APF')], 'IEC 60364-5-52 §523.6.3'));
      if (this.o.ch4 === 'leak' && last.IN != null) {
        const mA = last.IN * 1000;
        if (mA > 300) out.push(ev(k, 'leak', 'crit', B(`กระแสรั่วลงดิน ${mA.toFixed(0)} mA — เสี่ยงไฟไหม้`, `Earth leakage ${mA.toFixed(0)} mA — fire risk`), [], B('ฉนวนเสื่อม/ความชื้น/สายถลอกแตะโครงโลหะ', 'Degraded insulation / moisture / chafed cable touching metal'), [B('ทดสอบความต้านทานฉนวน (เมกเกอร์ 500 V ≥ 1 MΩ) ไล่ทีละวงจร', 'Insulation test (500 V megger ≥ 1 MΩ) circuit by circuit'), B('ติด RCD 300 mA ป้องกันไฟไหม้ / 30 mA ป้องกันคน', 'Fit RCD 300 mA (fire) / 30 mA (people)')], 'IEC 60364-4-42 · IEC 60364-6'));
        else if (mA > 30) out.push(ev(k, 'leak', 'warn', B(`กระแสรั่ว ${mA.toFixed(0)} mA`, `Leakage ${mA.toFixed(0)} mA`), [], B('ฉนวนเริ่มเสื่อม หรือฟิลเตอร์ EMC จำนวนมาก', 'Insulation starting to degrade, or many EMC filters'), [B('ทดสอบฉนวน', 'Insulation test')], 'IEC 60364-6'));
      }
      // 4. single-phasing (one phase low) — motors overheat
      const Ul = last.U;
      const low = (s) => s.U.every((v) => v != null) && Math.max(...s.U) > 0.9 * u && Math.min(...s.U) < 0.85 * u && Math.min(...s.U) > 0.1 * u;
      if (R.length >= 3 && R.slice(-3).every(low)) out.push(ev(k, 'phaseloss', 'crit', B(`แรงดันเฟส L${Ul.indexOf(Math.min(...Ul)) + 1} ต่ำมาก — เสี่ยงมอเตอร์ไหม้ (ไฟขาดเฟส)`, `Phase L${Ul.indexOf(Math.min(...Ul)) + 1} very low — motors at risk (single-phasing)`), [`U = ${Ul.map((v) => v.toFixed(0)).join(' / ')} V`],
        B('ฟิวส์ขาด 1 เฟส ขั้วต่อหลวม หรือหน้าสัมผัสคอนแทคเตอร์ไหม้', 'One fuse open, loose terminal or burnt contactor contact'), [B('ปลดมอเตอร์ 3 เฟสก่อน ตรวจฟิวส์และหน้าสัมผัส', 'Stop 3-phase motors first, check fuses and contacts'), B('ใช้รีเลย์ป้องกันเฟส (phase-failure relay)', 'Use a phase-failure relay')], 'IEC 60034-1 · NEMA MG 1'));
      // 5. arcing signature: HF-noise bursts against its own baseline
      for (let p = 0; p < 3; p++) {
        const hf = R.map((s) => s.Uhf[p]).filter((v) => v != null);
        if (hf.length < 30) continue;
        const base = med(hf.slice(0, Math.floor(hf.length / 2))), recent = hf.slice(-30);
        const bursts = recent.filter((v) => base != null && v > Math.max(3 * base, 0.5)).length;
        if (bursts >= 5) out.push(ev(k, 'arc' + p, 'warn', B(`สัญญาณรบกวนความถี่สูงเป็นช่วงๆ ที่ L${p + 1} — ลักษณะคล้ายอาร์ก`, `Bursts of HF noise on L${p + 1} — arc-like signature`), [`${bursts}/30 วินาที สูงกว่าปกติ ${base != null ? '(ปกติ ' + base.toFixed(2) + ' V)' : ''}`],
          B('อาร์กที่จุดต่อหลวม/สายถลอก สร้างสัญญาณความถี่สูงเป็นช่วงๆ (อาจเกิดจาก VFD สวิตช์ได้เช่นกัน)', 'Arcing at a loose joint / damaged cable creates bursts of HF noise (VFD switching can look similar)'),
          [B('ตรวจด้วยกล้องความร้อน/ฟังเสียงซ่าที่ตู้ ดมกลิ่นไหม้', 'Thermal camera, listen for crackling, smell for burning'), B('AFDD (IEC 62606) ยืนยันและตัดวงจรได้จริง', 'An AFDD (IEC 62606) confirms and disconnects')], 'IEC 62606'));
      }
    }
    // 6. loose / hot joint between MAIN and LOAD: extra voltage drop on one phase, proportional to current
    const M = this.ring.MAIN, Ld = this.ring.LOAD;
    if (M.length > 20 && Ld.length > 20) {
      const pairs = [];
      for (const s of Ld) { const m = M.find((x) => Math.abs(x.ts - s.ts) < 1500); if (m) pairs.push([m, s]); }
      if (pairs.length > 20) {
        const Rph = [0, 1, 2].map((p) => med(pairs.map(([m, s]) => (s.I[p] > 1 && m.U[p] != null && s.U[p] != null ? (m.U[p] - s.U[p]) / s.I[p] : null))));
        const drop = [0, 1, 2].map((p) => med(pairs.map(([m, s]) => (m.U[p] != null && s.U[p] != null ? m.U[p] - s.U[p] : null))));
        const ok = Rph.filter((v) => v != null);
        if (ok.length === 3) {
          const i = Rph.indexOf(Math.max(...Rph)), others = Rph.filter((_, j) => j !== i), ref = Math.max(0.001, mean(others));
          const firstHalf = pairs.slice(0, pairs.length >> 1), secondHalf = pairs.slice(pairs.length >> 1);
          const Rof = (arr) => med(arr.map(([m, s]) => (s.I[i] > 1 ? (m.U[i] - s.U[i]) / s.I[i] : null)));
          const trend = Rof(firstHalf) > 0 ? Rof(secondHalf) / Rof(firstHalf) : null;
          if (Rph[i] > 2 * ref && drop[i] > 0.01 * this.o.udin) out.push(ev('LOAD', 'joint', trend && trend > 1.3 ? 'crit' : 'warn', B(`จุดต่อเฟส L${i + 1} ระหว่างตู้เมนกับสายป้อนโหลด มีความต้านทานสูงผิดปกติ — เสี่ยงร้อน/ไหม้`, `Joint on L${i + 1} between the main board and the load feeder has abnormal resistance — overheating / fire risk`),
            [`แรงดันตก L1/L2/L3 = ${drop.map((v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1)).join(' / ')} V`, `R ประมาณ = ${Rph.map((v) => Math.max(0, v * 1000).toFixed(0)).join(' / ')} mΩ`, trend ? `แนวโน้ม ×${trend.toFixed(2)} ในช่วงที่วัด` : ''].filter(Boolean),
            B('เฟสนี้มีแรงดันตกมากกว่าเฟสอื่นหลายเท่าที่กระแสเท่าๆ กัน แปลว่ามีความต้านทานเพิ่มที่จุดต่อ (หลวม/ออกไซด์/หน้าสัมผัสไหม้) ความร้อนที่จุดนั้น = I²R ซึ่งเป็นต้นเหตุไฟไหม้ตู้ไฟอันดับต้นๆ', 'This phase drops several times more voltage than the others at similar current — extra resistance at a joint (loose / oxidised / burnt contact). Heat there = I²R, a leading cause of panel fires'),
            [B(`ตัดไฟ แล้วตรวจทุกจุดต่อของ L${i + 1} ตั้งแต่บัสตู้เมน → เบรกเกอร์ LOAD → ขั้วสาย`, `Isolate and check every L${i + 1} joint: main busbar → LOAD breaker → cable lugs`), B('ขันด้วยประแจทอร์ก เปลี่ยนหางปลาที่ไหม้/เปลี่ยนสี', 'Torque-wrench re-tighten, replace discoloured lugs'), B('สแกนกล้องความร้อนเทียบก่อน/หลัง', 'Thermal scan before / after')], 'IEC 60364-6 · NFPA 70B'));
        }
      }
    }
    // events: open / close
    const now2 = now, keys = new Set(out.map((e) => e.key));
    for (const e of out) {
      const a = this.active.get(e.key);
      if (!a) {
        // the same warning coming back within 2 minutes continues the previous one (no new pop-up)
        const prev = this.events.find((x) => x.key === e.key && x.end && now2 - x.end < 120000);
        if (prev) { prev.end = null; Object.assign(prev, { evidence: e.evidence }); this.active.set(e.key, prev); continue; }
        e.id = 'RK' + (++this.seq); e.start = now2; this.active.set(e.key, e); this.events.unshift(e); if (this.events.length > 200) this.events.pop(); this.onEvent('raise', e);
      }
      else { Object.assign(a, { evidence: e.evidence, sev: e.sev === 'crit' ? 'crit' : a.sev }); }
    }
    for (const [key, a] of this.active) if (!keys.has(key)) { a.end = now2; this.active.delete(key); this.onEvent('clear', a); }
    return [...this.active.values()];
  }
  // where does the intermittent supply come from? compares MAIN and LOAD at the same moments
  locate() {
    const m = this.ring.MAIN, l = this.ring.LOAD, u = this.o.udin;
    const bad = (R) => R.filter((s) => s.U.some((v) => v != null && v < 0.9 * u)).map((s) => s.ts);
    const bm = bad(m), bl = bad(l);
    if (!bl.length && !bm.length) return null;
    const both = bl.filter((t) => bm.some((x) => Math.abs(x - t) < 1500)).length;
    if (bm.length && both >= Math.min(bl.length, bm.length) * 0.7) return B('ไฟตก/ดับเกิดพร้อมกันทั้ง MAIN และ LOAD → ต้นเหตุอยู่ต้นทาง (การไฟฟ้า/หม้อแปลง/เบรกเกอร์เมน)', 'Seen at MAIN and LOAD together → the cause is upstream (utility / transformer / main breaker)');
    if (bl.length && !bm.length) return B('ไฟตก/ดับเห็นเฉพาะที่ LOAD → ต้นเหตุอยู่ระหว่างตู้เมนกับโหลด (เบรกเกอร์ LOAD, สายป้อน, ขั้วต่อ)', 'Seen at LOAD only → the cause is between the main board and the load (LOAD breaker, feeder, joints)');
    return null;
  }
}
function ev(point, kind, sev, title, evidence, cause, steps, std) {
  return { key: point + ':' + kind, point, kind, sev, title, evidence: evidence.filter(Boolean), cause, steps, std, where: NAMES[point] };
}

// what a short circuit / electrical fire is caused by, and what to install to see it coming
export const FIRE_GUIDE = [
  { icon: '🔩', t: B('จุดต่อหลวม/ออกไซด์ (สาเหตุอันดับ 1)', 'Loose / oxidised joints (no. 1 cause)'), see: 'yes', d: B('ความต้านทานเพิ่ม → ร้อน (I²R) → อาร์ก → ฉนวนไหม้ → ลัดวงจร · ระบบเห็นจากแรงดันตกเฉพาะเฟส แรงดันกระตุก และสัญญาณรบกวนเป็นช่วงๆ', 'Resistance rises → heat (I²R) → arcing → insulation burns → short · seen as one-phase extra drop, voltage jitter, HF-noise bursts') },
  { icon: '🌡', t: B('โหลดเกิน + ฮาร์มอนิก', 'Overload + harmonics'), see: 'yes', d: B('กระแส rms จริงสูงกว่าที่คิด (ฮาร์มอนิกเพิ่มความร้อนในสาย/หม้อแปลง) · ระบบเห็นจาก I เทียบพิกัดเบรกเกอร์, THD-I, K-factor', 'True rms is higher than expected; harmonics add heat · seen as I vs breaker rating, THD-I, K-factor') },
  { icon: 'Ⓝ', t: B('สายนิวทรัลรับกระแสเกิน', 'Overloaded neutral'), see: 'yes', d: B('ฮาร์มอนิกลำดับ 3 รวมกันในสาย N ที่ไม่มีเบรกเกอร์ · ระบบเห็นถ้าคล้อง CH4 ที่สาย N', 'Triplen harmonics add in N, which has no breaker · seen if CH4 is on N') },
  { icon: '💧', t: B('ฉนวนเสื่อม/ความชื้น/หนูกัด', 'Insulation ageing / moisture / rodents'), see: 'partly', d: B('เริ่มจากกระแสรั่วลงดินเล็กน้อยแล้วเพิ่มขึ้น · ระบบเห็นถ้าคล้อง CH4 รอบสายทั้งหมด (residual) หรือสาย PE แล้วตั้ง CH4 = กระแสรั่ว', 'Starts as a small rising leakage to earth · seen if CH4 is clamped around all conductors (residual) or on PE, with CH4 = leakage') },
  { icon: '⚡', t: B('ไฟกระชาก/ฟ้าผ่า', 'Surges / lightning'), see: 'partly', d: B('ทำให้ฉนวนอ่อนแอทีละน้อย · ระบบเห็นยอดแรงดันทุกวินาที ส่วนทรานเซียนต์ระดับไมโครวินาทีดูจาก EVENT ของ PW3198', 'Weakens insulation step by step · peaks are seen every second; µs transients in the PW3198 EVENT list') },
  { icon: '🔋', t: B('คาปาซิเตอร์บวม/เรโซแนนซ์', 'Capacitor failure / resonance'), see: 'yes', d: B('ฮาร์มอนิกทำให้คาปาซิเตอร์ร้อนจนระเบิด/ไหม้ · ระบบเห็นจาก THD-U และการคำนวณความถี่เรโซแนนซ์', 'Harmonics overheat capacitors until they burst/burn · seen via THD-U and the resonance calculation') },
  { icon: '🔥', t: B('อุณหภูมิที่ขั้วต่อเอง', 'The temperature of the lug itself'), see: 'no', d: B('เครื่องวัดไฟฟ้าวัดไม่ได้ ต้องใช้กล้องความร้อน (NFPA 70B ปีละครั้ง) หรือเซนเซอร์อุณหภูมิไร้สายติดหางปลา (ต่อเข้า CoreDash ได้)', 'An electrical analyser cannot see it: thermography (NFPA 70B yearly) or wireless lug temperature sensors (can feed CoreDash)') }
];
export const FIRE_KIT = [
  B('AFDD ตัดอาร์ก (IEC 62606) ที่วงจรเสี่ยง', 'AFDD arc-fault breaker (IEC 62606) on high-risk circuits'),
  B('RCD 300 mA ป้องกันไฟไหม้ (IEC 60364-4-42) / 30 mA ป้องกันคน', 'RCD 300 mA fire protection (IEC 60364-4-42) / 30 mA for people'),
  B('SPD Type 1+2 ตู้เมน, Type 2 ตู้ย่อย (IEC 61643-11)', 'SPD Type 1+2 main, Type 2 sub-boards (IEC 61643-11)'),
  B('เซนเซอร์อุณหภูมิไร้สายที่หางปลา/บัส + แจ้งเตือนเข้า CoreDash', 'Wireless lug/busbar temperature sensors + alerts into CoreDash'),
  B('กล้องถ่ายภาพความร้อนตรวจทุกปี (NFPA 70B)', 'Yearly thermography (NFPA 70B)'),
  B('เครื่องทดสอบความต้านทานฉนวน 500/1000 V (IEC 60364-6)', '500/1000 V insulation tester (IEC 60364-6)'),
  B('ประแจทอร์กและตารางแรงขันของผู้ผลิต', 'Torque wrench and the maker’s torque table')
];

// ------------------------------------------------------------------ training scenarios (applied on top of real or demo values)
export const SCENARIOS = {
  loose: B('จุดต่อหลวมเฟส L2 (สายป้อนโหลด)', 'Loose joint on L2 (load feeder)'),
  intermittent: B('ไฟขาดๆ หายๆ ที่สายป้อนโหลด', 'Intermittent supply on the load feeder'),
  overload: B('โหลดเกินพิกัดเบรกเกอร์', 'Overload above the breaker rating'),
  neutral: B('นิวทรัลรับกระแสเกิน', 'Overloaded neutral'),
  arc: B('สัญญาณอาร์กที่ L1', 'Arc signature on L1'),
  spike: B('ไฟกระชากซ้ำ', 'Repeated surges')
};
export function applyScenario(name, point, rec, t, opt = {}) {
  if (!name || !rec || !rec.ph) return rec;
  const r = { ...rec, ph: rec.ph.map((p) => ({ ...p })) }, u = opt.udin || 230, sec = Math.floor(t / 1000);
  const I = (i) => r.ph[i].I || 10;
  if (name === 'loose' && point === 'LOAD') { const Im = Math.max(1, (I(0) + I(1) + I(2)) / 3), grow = 1 + (sec % 600) / 600; r.ph[1].U = (r.ph[1].U || u) - 0.025 * u * grow * (I(1) / Im) - (sec % 7 === 0 ? 0.03 * u : 0); }
  if (name === 'intermittent' && point === 'LOAD') { const k = sec % 20; if (k === 3) r.ph[0].U = 0.6 * u; if (k === 11) r.ph[2].U = 5; if (k === 12) r.ph[2].U = 0.7 * u; }
  if (name === 'overload' && point === 'LOAD') { const f = (opt.rating && opt.rating.LOAD ? opt.rating.LOAD * 1.15 : 120) / Math.max(1, I(0)); r.ph.forEach((p) => { p.I = (p.I || 10) * f; }); }
  if (name === 'neutral' && point === 'LOAD') r.IN = Math.max(...r.ph.map((p) => p.I || 0)) * 1.35;
  if (name === 'arc' && point === 'LOAD') { r.ph[0].Uhf = sec % 3 === 0 ? 2.5 + (sec % 5) : 0.3; if (sec % 4 === 0) r.ph[0].U = (r.ph[0].U || u) - 8; }
  if (name === 'spike' && point === 'MAIN' && sec % 9 === 0) r.ph[sec % 3].Upk = 1.55 * Math.SQRT2 * u;
  return r;
}
