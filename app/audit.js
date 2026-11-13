// CoreDash Nexus — "วิเคราะห์ความคุ้มค่า": where every baht comes from, which machine to fix, and a pilot that proves it.
import { ASSUME, TARIFF, MACHINES, measure, diagnose, plan, apfCase, pilotData, mvStat, mvPerUnit, compare, siteState, applyFixes } from './audit-engine.js';

const B = (th, en) => ({ th, en });
const T = {
  tApf: B('ที่มาของตัวเลข ฿', 'Where the ฿ comes from'), tSurvey: B('สำรวจเครื่องจักร', 'Machine survey'), tPilot: B('ทดลองนำร่อง (พิสูจน์ผล)', 'Pilot (prove it)'), tOwner: B('สรุปสำหรับเจ้าของ', 'Owner summary'),
  sim: B('ข้อมูลตัวอย่าง (จำลอง) — แทนที่ด้วยไฟล์จาก PW3198 ได้', 'Example data (simulated) — replace with PW3198 files'),
  netApf: B('ผลต่อบิลค่าไฟสุทธิของ APF', 'Net bill effect of the APF'), perMonth: B('บาท/เดือน', 'THB/month'),
  apfQ: B('คำตอบสั้น ๆ: ตัวเลขนี้มาจากไหน', 'Short answer: where this number comes from'),
  apfA: B('เทียบเครื่องวัด #3 (ฝั่งโหลด = เหมือนไม่มี APF) กับ #2 (แผงเมน = หลัง APF ชดเชย) ณ ช่วงเวลาเดียวกัน แล้วแปลงความต่างเป็นเงินตามโครงสร้างค่าไฟ กฟภ. ทีละรายการด้านล่าง ไม่ได้แก้เครื่องจักรตัวใด — APF ตัวเดียวติดที่แผงเมนชดเชยให้ทั้งโรงงาน',
    'Meter #3 (load side = as if there were no APF) is compared with #2 (main board = after the APF) at the same moments, and the difference is priced item by item with the PEA tariff below. No machine was changed — one APF at the main board compensates the whole plant.'),
  waterfall: B('แยกทีละรายการ (บาท/เดือน)', 'Item by item (THB/month)'),
  notMoney: B('สิ่งที่ APF ให้ ที่ไม่ใช่เงินในบิล', 'What the APF gives that is not on the bill'),
  verdictNeg: B('สรุปทางวิศวกรรม: APF ไม่คืนทุนจากค่าไฟ เพราะความสูญเสียในตัว APF เองมากกว่าความสูญเสียที่ลดได้ และค่าปรับ PF ของโรงงานนี้น้อย — APF คุ้มเมื่อต้องแก้ฮาร์มอนิก (ผ่านเกณฑ์ IEEE 519 / กฟภ., หม้อแปลงร้อน, เบรกเกอร์ทริป, คาปาซิเตอร์เสีย) ถ้าเป้าหมายคือลดค่าไฟ ให้ใช้ตู้คาปาซิเตอร์แบบ detuned ที่เครื่องจักร (ดูแท็บสำรวจเครื่องจักร)',
    'Engineering verdict: the APF does not pay back on the bill — its own losses exceed the losses it removes and this plant\'s PF charge is small. An APF is justified by harmonics (IEEE 519 / PEA limits, transformer heating, nuisance trips, capacitor failures). To cut the bill, use detuned capacitor banks at the machines (see Machine survey).'),
  verdictPos: B('สรุปทางวิศวกรรม: APF คืนทุนได้จากค่าไฟ และยังแก้ฮาร์มอนิกด้วย', 'Engineering verdict: the APF pays back on the bill and also fixes harmonics'),
  assume: B('สมมติฐาน (แก้ได้ — ใส่ค่าจริงของโรงงาน)', 'Assumptions (edit — use your plant\'s values)'),
  aHours: B('ชั่วโมงผลิต/เดือน', 'Production h/month'), aKva: B('หม้อแปลง kVA', 'Transformer kVA'), aLL: B('Load loss หม้อแปลง (W)', 'Transformer load loss (W)'), aPec: B('P_EC,R (สัดส่วน eddy)', 'P_EC,R (eddy share)'),
  aEnergy: B('ค่าพลังงาน บาท/kWh', 'Energy THB/kWh'), aDemand: B('ค่าดีมานด์ บาท/kW', 'Demand THB/kW'), aApf: B('ความสูญเสีย APF % ของ kVA', 'APF loss % of kVA'), aOwned: B('หม้อแปลงเป็นของโรงงาน (มิเตอร์ด้าน 22 kV)', 'Plant owns the transformer (22 kV metering)'),
  howMeasure: B('วัดอย่างไร — ใช้ PW3198 จับที่ไหน', 'How to measure — where to clamp the PW3198'),
  m1: B('จับ PW3198 ที่สายป้อนของเครื่องจักรแต่ละตัวในตู้ MDB/MCC (CT 3 เฟส + นิวทรัล, แรงดันจากบัสบาร์) ตั้ง 3P4W, บันทึกทุก 1–10 นาที พร้อมฮาร์มอนิก', 'Clamp the PW3198 on each machine feeder in the MDB/MCC (3 phase CTs + neutral, voltage from the busbar), 3P4W, record every 1–10 min with harmonics'),
  m2: B('วัดเครื่องละอย่างน้อย 1 รอบการผลิตเต็ม (แนะนำ 7 วันรวมกะกลางคืน/วันหยุด) — เครื่องที่ทำงานคงที่ 2–3 วันพอ', 'At least one full production cycle per machine (ideally 7 days incl. nights/weekend) — steady machines 2–3 days'),
  m3: B('จดตัวเลขการผลิตช่วงเดียวกัน (kAh ชุบ, ตันรีด) เพื่อเทียบพลังงานต่อหน่วย', 'Log production for the same period (plating kAh, rolled tons) to compare energy per unit'),
  m4: B('ดึงไฟล์จาก PW3198 ผ่าน LAN/FTP (แท็บมอนิเตอร์ → ไฟล์) แล้วระบบจัดอันดับให้อัตโนมัติ', 'Pull the PW3198 files over LAN/FTP (Monitor → Files) and the ranking is automatic'),
  pareto: B('จัดอันดับต้นเหตุ (Pareto)', 'Root-cause ranking (Pareto)'), kvarBar: B('kvar ที่ดึงจากระบบ', 'kvar drawn'), harmBar: B('กระแสฮาร์มอนิก (A)', 'Harmonic current (A)'),
  fixes: B('ต้องแก้อะไร ที่เครื่องไหน', 'What to fix, on which machine'), noFix: B('ไม่ต้องแก้ — ค่าอยู่ในเกณฑ์', 'No fix needed — within limits'),
  planT: B('แผนที่เลือก', 'Selected plan'), saving: B('ประหยัด', 'Saving'), invest: B('เงินลงทุน (ราคาสมมติ)', 'Investment (placeholder prices)'), payback: B('คืนทุน', 'Payback'), months: B('เดือน', 'months'),
  sitePf: B('PF ทั้งโรงงาน', 'Site PF'), kvaFree: B('คืนพิกัดหม้อแปลง', 'Transformer capacity freed'), costNote: B('ราคาอุปกรณ์เป็นค่าตั้งต้นเพื่อคำนวณเท่านั้น — ใส่ราคาจริงจากใบเสนอราคาก่อนตัดสินใจ', 'Equipment prices are placeholders — enter real quotes before deciding'),
  pilotWhy: B('ทำไมต้องนำร่อง: พิสูจน์กับเครื่องจริง 1 ตัวก่อนลงทุนทั้งโรงงาน — วัดก่อนแก้ 3 วัน ติดตั้ง วัดหลังแก้ 3 วัน ในสภาพการผลิตเดียวกัน (IPMVP Option B: แยกวัดเฉพาะเครื่อง)', 'Why a pilot: prove it on one real machine before investing plant-wide — 3 days before, install, 3 days after, same production (IPMVP Option B: retrofit isolation)'),
  st1: B('วัดก่อนแก้ (baseline)', 'Measure baseline'), st2: B('ติดตั้งอุปกรณ์', 'Install'), st3: B('วัดหลังแก้', 'Measure after'), st4: B('สรุปผลทางสถิติ', 'Statistical verdict'),
  machine: B('เครื่องจักร', 'Machine'), fix: B('วิธีแก้', 'Fix'), before: B('ก่อนแก้', 'Before'), after: B('หลังแก้', 'After'), change: B('เปลี่ยนแปลง', 'Change'), verdict: B('ผล', 'Result'),
  real: B('ลดจริง', 'Real reduction'), notSig: B('ไม่ต่างอย่างมีนัยสำคัญ', 'No significant change'), up: B('เพิ่มขึ้นจริง', 'Real increase'),
  ci: B('± ช่วงความเชื่อมั่น 95% · เฉพาะช่วงเวลาผลิต', '± 95 % confidence · production hours only'),
  pilotMoney: B('ผลนำร่องคิดเป็นเงิน (ทั้งโรงงานเมื่อแก้เครื่องนี้)', 'Pilot result in money (plant-wide, this machine fixed)'),
  perUnit: B('พลังงานต่อหน่วยการผลิต', 'Energy per production unit'),
  kwNote: B('kW ของเครื่องไม่ลด — ถูกต้องตามหลัก: คาปาซิเตอร์ลด kvar, kVA, กระแส และความร้อนในสาย แต่ไม่ลดงานจริงที่เครื่องใช้ เงินที่ประหยัดมาจากค่าปรับ PF และความสูญเสียในระบบ', 'Machine kW does not drop — as physics says: capacitors cut kvar, kVA, amps and cable heat, not the real work the machine does. The money comes from the PF charge and system losses.'),
  impB: B('นำเข้าไฟล์ "ก่อนแก้"', 'Import "before" file'), impA: B('นำเข้าไฟล์ "หลังแก้"', 'Import "after" file'), impNote: B('ไฟล์ CSV จาก PW3198 / PQ ONE ที่มีคอลัมน์ P, Q, I, PF หรือ THD — ใช้แทนข้อมูลตัวอย่างทันที', 'CSV from PW3198 / PQ ONE with P, Q, I, PF or THD columns — replaces the example data'),
  useDemo: B('กลับไปใช้ข้อมูลตัวอย่าง', 'Back to example data'), fileMissing: B('ยังต้องมีอีกไฟล์', 'Still need the other file'),
  ownerT: B('สรุปผลการวิเคราะห์คุณภาพไฟฟ้า', 'Power-quality analysis summary'),
  print: B('พิมพ์ / บันทึก PDF', 'Print / save PDF'),
  o1: B('ปัญหาหลักของโรงงาน', 'Main findings'), o2: B('ข้อเสนอเรียงตามความคุ้มค่า', 'Recommendations by payback'), o3: B('สิ่งที่ไม่แนะนำ', 'Not recommended'), o4: B('ขั้นต่อไป', 'Next steps'),
  next1: B('นำร่องที่ {m} ตามแท็บ "ทดลองนำร่อง" (1 สัปดาห์)', 'Pilot on {m} as in the "Pilot" tab (1 week)'),
  next2: B('ขอใบเสนอราคาจริง 2–3 ราย แล้วใส่ราคาแทนค่าตั้งต้น', 'Get 2–3 real quotes and replace the placeholder prices'),
  next3: B('วัดซ้ำทั้งโรงงาน 7 วันหลังติดตั้งครบ และเทียบบิล กฟภ. 3 เดือน', 'Re-measure the plant for 7 days after installation and compare 3 PEA bills'),
  noApf: B('ใช้ APF เพื่อหวังลดค่าไฟ — ความสูญเสียของ APF มากกว่าที่ประหยัด ใช้เมื่อต้องแก้ฮาร์มอนิกเท่านั้น', 'An APF to cut the bill — its own losses exceed the saving; use it only to fix harmonics'),
  perNote: B('เงินประหยัดรายเครื่องคิดทีละเครื่อง (ถ้าแก้เครื่องนั้นเครื่องเดียว) จึงรวมกันได้มากกว่ายอดทั้งแผน เพราะค่าปรับ PF ของโรงงานหายหมดได้จากการแก้บางเครื่องก็พอ', 'Per-machine savings assume that machine alone is fixed, so they add up to more than the plan total — the plant PF charge can vanish after fixing just a few machines'),
  noCap: B('คาปาซิเตอร์ธรรมดา (ไม่มีรีแอกเตอร์) กับเครื่องที่มีฮาร์มอนิก — เสี่ยงเรโซแนนซ์ คาปาซิเตอร์บวม/ระเบิด', 'Plain capacitors (no reactor) on harmonic loads — resonance risk, swollen/exploding capacitors')
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'));
const f = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const baht = (v) => (v < 0 ? '−฿' : '฿') + n0(Math.abs(v));

export function createAuditView({ lang = () => 'th', snapshot = () => null, history = () => null, parseCsv = null } = {}) {
  const L = () => (lang() === 'en' ? 'en' : 'th');
  const x = (k) => T[k][L()];
  const tr = (o) => o[L()] ?? o.th;
  const st = {
    tab: 'apf', a: structuredClone(ASSUME), t: { ...TARIFF },
    sel: Object.fromEntries(MACHINES.map((m) => [m.id, diagnose(m).map((q) => q.key)])),
    pm: 'RECT-02', pfix: null, files: { before: null, after: null }
  };
  { const sel0 = Object.fromEntries(MACHINES.map((m) => [m.id, diagnose(m)])); for (const q of plan(sel0).per) if (q.payback > 60) st.sel[q.id] = []; }
  const el = document.createElement('div');
  el.className = 'au';

  const selected = () => Object.fromEntries(MACHINES.map((m) => [m.id, diagnose(m, st.a).filter((q) => st.sel[m.id].includes(q.key))]));

  // ---------------------------------------------------------------- SVG charts
  function waterfall(items, total) {
    const W = 640, H = 250, padL = 8, padB = 66, top = 18, slot = (W - 60) / (items.length + 1), bw = Math.min(90, slot - 18);
    let run = 0; const bars = items.map((i) => { const y0 = run; run += i.thb; return { ...i, y0, y1: run }; });
    const vals = [0, ...bars.flatMap((b) => [b.y0, b.y1]), total];
    const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
    const Y = (v) => top + (hi - v) / span * (H - top - padB);
    const X = (k) => padL + 30 + k * ((W - 60) / (items.length + 1));
    const g = bars.map((b, k) => {
      const y = Y(Math.max(b.y0, b.y1)), h = Math.max(2, Math.abs(Y(b.y0) - Y(b.y1)));
      const c = b.thb >= 0 ? 'url(#auG)' : 'url(#auR)';
      return `<rect x="${X(k)}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${c}"/><text x="${X(k) + bw / 2}" y="${y - 5}" text-anchor="middle" class="au-v ${b.thb < 0 ? 'neg' : ''}">${baht(b.thb)}</text>
        ${k < bars.length ? `<line x1="${X(k) + bw}" x2="${X(k + 1)}" y1="${Y(b.y1)}" y2="${Y(b.y1)}" class="au-link"/>` : ''}
        <foreignObject x="${X(k) - (slot - bw) / 2 + 2}" y="${H - padB + 6}" width="${slot - 4}" height="${padB - 6}"><div class="au-lab">${esc(tr(b))}</div></foreignObject>`;
    }).join('');
    const kT = items.length, yT = Y(Math.max(0, total)), hT = Math.max(2, Math.abs(Y(0) - Y(total)));
    return `<svg viewBox="0 0 ${W} ${H}" class="au-svg" role="img"><defs><linearGradient id="auG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ADE80"/><stop offset="1" stop-color="#15803D"/></linearGradient><linearGradient id="auR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F87171"/><stop offset="1" stop-color="#B91C1C"/></linearGradient><linearGradient id="auT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8E7B0"/><stop offset="1" stop-color="#B48B3E"/></linearGradient></defs>
      <line x1="10" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" class="au-zero"/>${g}
      <rect x="${X(kT)}" y="${total >= 0 ? yT : Y(0)}" width="${bw}" height="${hT}" rx="4" fill="${total >= 0 ? 'url(#auT)' : 'url(#auR)'}"/><text x="${X(kT) + bw / 2}" y="${(total >= 0 ? yT : Y(0)) - 5}" text-anchor="middle" class="au-v big ${total < 0 ? 'neg' : ''}">${baht(total)}</text>
      <foreignObject x="${X(kT) - (slot - bw) / 2 + 2}" y="${H - padB + 6}" width="${slot - 4}" height="${padB - 6}"><div class="au-lab"><b>${L() === 'th' ? 'สุทธิ' : 'Net'}</b></div></foreignObject></svg>`;
  }
  function hbars(rows, key, unit, color) {
    const W = 420, rh = 26, H = rows.length * rh + 8, mx = Math.max(1, ...rows.map((r) => r[key]));
    return `<svg viewBox="0 0 ${W} ${H}" class="au-svg">${rows.map((r, k) => { const w = (W - 170) * r[key] / mx; return `<text x="0" y="${k * rh + 17}" class="au-t">${esc(r.id)}</text><rect x="74" y="${k * rh + 5}" width="${Math.max(2, w)}" height="${rh - 10}" rx="4" fill="${color}" opacity="${0.45 + 0.55 * r[key] / mx}"/><text x="${80 + w}" y="${k * rh + 17}" class="au-t b">${n0(r[key])} ${unit}</text><title>${esc(tr(r))}</title>`; }).join('')}</svg>`;
  }
  function lines(rows, keys) {
    const W = 680, H = 210, padL = 44, padB = 22, top = 10;
    const t0 = rows[0].ts, t1 = rows[rows.length - 1].ts, X = (t) => padL + (W - padL - 8) * (t - t0) / Math.max(1, t1 - t0);
    const vals = keys.flatMap(([k]) => rows.map((r) => r[k])).filter(Number.isFinite), hi = Math.max(...vals) * 1.08, lo = 0;
    const Y = (v) => top + (hi - v) / (hi - lo) * (H - top - padB);
    const bStart = rows.find((r) => r.phase === 'after');
    const shade = bStart ? `<rect x="${X(bStart.ts)}" y="${top}" width="${W - 8 - X(bStart.ts)}" height="${H - top - padB}" class="au-after"/><text x="${X(bStart.ts) + 6}" y="${top + 14}" class="au-t gold">${x('after')} →</text><text x="${padL + 6}" y="${top + 14}" class="au-t">← ${x('before')}</text>` : '';
    const paths = keys.map(([k, c]) => { let d = '', prev = null; for (const r of rows) { if (!Number.isFinite(r[k])) continue; const gap = prev && r.ts - prev > 3 * 3600e3; d += `${d && !gap ? 'L' : 'M'}${X(r.ts).toFixed(1)} ${Y(r[k]).toFixed(1)}`; prev = r.ts; } return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`; }).join('');
    const ticks = [0, 0.5, 1].map((p) => `<text x="${padL - 6}" y="${Y(hi * p) + 4}" text-anchor="end" class="au-t m">${n0(hi * p)}</text><line x1="${padL}" x2="${W - 8}" y1="${Y(hi * p)}" y2="${Y(hi * p)}" class="au-grid"/>`).join('');
    const days = []; for (let t = t0; t <= t1; t += 864e5) days.push(`<text x="${X(t)}" y="${H - 6}" class="au-t m">${new Date(t).toLocaleDateString(L() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' })}</text>`);
    const leg = keys.map(([, c, lab], i) => `<g transform="translate(${padL + 150 + i * 110},${top + 4})"><rect width="12" height="3" y="5" fill="${c}"/><text x="16" y="10" class="au-t">${lab}</text></g>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="au-svg">${ticks}${shade}${paths}${days.join('')}${leg}</svg>`;
  }
  function sld() {
    const ms = MACHINES.slice(0, 7);
    return `<svg viewBox="0 0 680 190" class="au-svg sld">
      <text x="10" y="18" class="au-t gold">22 kV · PEA meter</text><rect x="10" y="26" width="58" height="26" rx="5" class="au-box"/><text x="39" y="43" text-anchor="middle" class="au-t">kWh/kvar</text>
      <circle cx="110" cy="39" r="13" class="au-tr"/><circle cx="126" cy="39" r="13" class="au-tr"/><text x="118" y="70" text-anchor="middle" class="au-t m">1000 kVA</text>
      <line x1="68" y1="39" x2="97" y2="39" class="au-w"/><line x1="139" y1="39" x2="170" y2="39" class="au-w"/>
      <rect x="170" y="30" width="490" height="16" rx="3" class="au-bus"/><text x="176" y="42" class="au-t b">MDB 400 V</text>
      ${ms.map((m, k) => { const xx = 205 + k * 66; return `<line x1="${xx}" y1="46" x2="${xx}" y2="150" class="au-w"/><g class="au-clamp" transform="translate(${xx - 11},${70})"><rect width="22" height="30" rx="4"/><text x="11" y="13" text-anchor="middle">PW</text><text x="11" y="24" text-anchor="middle">3198</text></g><rect x="${xx - 30}" y="150" width="60" height="30" rx="6" class="au-box ${m.id === st.pm ? 'on' : ''}"/><text x="${xx}" y="165" text-anchor="middle" class="au-t b">${m.id}</text><text x="${xx}" y="176" text-anchor="middle" class="au-t m">${n0(m.P)} kW</text>`; }).join('')}
      <text x="10" y="110" class="au-t m">${L() === 'th' ? 'จับ PW3198' : 'clamp PW3198'}</text><text x="10" y="123" class="au-t m">${L() === 'th' ? 'ทีละสายป้อน →' : 'feeder by feeder →'}</text></svg>`;
  }

  // ---------------------------------------------------------------- tabs
  function assumptions(keys) {
    const inp = (k, lab, val, step, obj) => `<label><span>${x(lab)}</span><input type="number" step="${step}" value="${val}" data-au-a="${obj}.${k}"></label>`;
    const map = {
      hours: inp('hoursMonth', 'aHours', st.a.hoursMonth, 10, 'a'), kva: inp('trafoKVA', 'aKva', st.a.trafoKVA, 50, 'a'), ll: inp('trafoLL', 'aLL', st.a.trafoLL, 100, 'a'), pec: inp('pec', 'aPec', st.a.pec, 0.01, 'a'),
      energy: inp('energy', 'aEnergy', st.t.energy, 0.05, 't'), demand: inp('demand', 'aDemand', st.t.demand, 1, 't'), apf: inp('apfPct', 'aApf', st.a.selfLoss.apfPct, 0.1, 'a.selfLoss'),
      owned: `<label class="chk"><input type="checkbox" data-au-owned ${st.a.trafoOwned ? 'checked' : ''}> <span>${x('aOwned')}</span></label>`
    };
    return `<details class="au-assume"><summary>⚙ ${x('assume')}</summary><div class="au-grid-in">${keys.map((k) => map[k]).join('')}</div></details>`;
  }
  function itemCards(r) {
    return `<div class="au-items">${r.items.map((i) => `<div class="au-item ${i.thb < 0 ? 'neg' : ''}"><div><b>${esc(tr(i))}</b><span class="${i.thb < 0 ? 'neg' : 'pos'}">${baht(i.thb)}</span></div><small>${esc(L() === 'th' ? i.how : i.howEn)}</small></div>`).join('')}</div>`;
  }
  function tabApf() {
    const s = snapshot(), r = s && apfCase(s, history(), st.a, st.t);
    if (!r) return `<div class="muted">—</div>`;
    const l = s.inst['PQ-LOAD'], g = s.inst['PQ-MAIN'];
    return `<section class="au-hero ${r.total < 0 ? 'neg' : ''}"><div><small>${x('netApf')}</small><b>${baht(r.total)}</b><span>${x('perMonth')}</span></div><p><b>${x('apfQ')}</b><br>${x('apfA')}</p></section>
      <h4>${x('waterfall')}</h4><div class="au-scroll">${waterfall(r.items, r.total)}</div>${itemCards(r)}
      <div class="au-verdict ${r.total < 0 ? 'warn' : 'ok'}">${r.total < 0 ? x('verdictNeg') : x('verdictPos')}</div>
      <h4>${x('notMoney')}</h4><div class="au-kpis">
        <div><small>THD-I</small><b>${f(l.Ithd, 1)}% → ${f(g.Ithd, 1)}%</b><span>IEEE 519: ≤ 8% TDD</span></div>
        <div><small>${L() === 'th' ? 'กระแสเฉลี่ยช่วงผลิต' : 'Avg production current'}</small><b>${n0(r.amps[0])} → ${n0(r.amps[1])} A</b></div>
        <div><small>${x('kvaFree')}</small><b>${n0(l.S - g.S)} kVA</b></div>
        <div><small>K-factor</small><b>${f(l.KF, 2)} → ${f(g.KF, 2)}</b><span>${L() === 'th' ? 'หม้อแปลงร้อนน้อยลง' : 'cooler transformer'}</span></div>
      </div>${assumptions(['hours', 'kva', 'll', 'pec', 'energy', 'demand', 'apf', 'owned'])}`;
  }
  function tabSurvey() {
    const xs = MACHINES.map((m) => ({ ...measure(m, st.a), Ih: 0 })).map((q) => ({ ...q, Ih: q.I1 * q.thd / 100 }));
    const byQ = [...xs].sort((a, b) => b.Q - a.Q), byH = [...xs].sort((a, b) => b.Ih - a.Ih);
    const p = plan(selected(), st.a, st.t);
    const per = Object.fromEntries(p.per.map((q) => [q.id, q]));
    const cards = xs.map((m) => {
      const dx = diagnose(m, st.a), pp = per[m.id];
      return `<article class="au-m ${dx.length ? '' : 'ok'}"><header><b>${m.id}</b><span>${esc(tr(m))}</span>${pp ? `<em>${baht(pp.thb)}/${L() === 'th' ? 'ด.' : 'mo'} · ${L() === 'th' ? 'คืนทุน' : 'payback'} ${f(pp.payback, 1)} ${x('months')}</em>` : ''}</header>
        <div class="au-mstats"><span>P <b>${n0(m.P)}</b> kW</span><span>cos φ <b class="${m.dpf < 0.9 ? 'bad' : ''}">${f(m.dpf, 2)}</b></span><span>THD-I <b class="${m.thd > 20 ? 'bad' : ''}">${f(m.thd, 0)}%</b></span><span>Q <b>${n0(m.Q)}</b> kvar</span><span>I <b>${n0(m.I)}</b> A</span><span>${n0(m.hours)} h/${L() === 'th' ? 'ด.' : 'mo'}</span></div>
        ${dx.length ? dx.map((q) => `<label class="au-fix"><input type="checkbox" data-au-fix="${m.id}" value="${q.key}" ${st.sel[m.id].includes(q.key) ? 'checked' : ''}><div><b>${esc(tr(q))}</b><small>${esc(L() === 'th' ? q.whyTh : q.whyEn)}</small><small class="gold">${L() === 'th' ? 'ราคาตั้งต้น' : 'placeholder'} ฿${n0(q.cost)}</small></div></label>`).join('') : `<div class="au-okmsg">✓ ${x('noFix')}</div>`}</article>`;
    }).join('');
    return `<h4>${x('howMeasure')}</h4><div class="au-scroll">${sld()}</div><ol class="au-steps">${['m1', 'm2', 'm3', 'm4'].map((k) => `<li>${x(k)}</li>`).join('')}</ol>
      <div class="au-two"><div><h4>${x('pareto')} · ${x('kvarBar')}</h4>${hbars(byQ, 'Q', 'kvar', '#38BDF8')}</div><div><h4>${x('pareto')} · ${x('harmBar')}</h4>${hbars(byH, 'Ih', 'A', '#FB923C')}</div></div>
      <section class="au-plan"><div class="au-plan-h"><b>${x('planT')}</b><div class="au-kpis">
        <div class="hl"><small>${x('saving')}</small><b>${baht(p.all.total)}</b><span>${x('perMonth')}</span></div>
        <div><small>${x('invest')}</small><b>฿${n0(p.cost)}</b></div><div><small>${x('payback')}</small><b>${f(p.payback, 1)} ${x('months')}</b></div>
        <div><small>${x('sitePf')}</small><b>${f(p.all.pf[0], 2)} → ${f(p.all.pf[1], 2)}</b></div><div><small>${x('kvaFree')}</small><b>${n0(p.all.kvaFreed)} kVA</b></div></div></div>
        <div class="au-scroll">${waterfall(p.all.items, p.all.total)}</div>${itemCards(p.all)}<small class="muted">${x('costNote')}</small></section>
      <h4>${x('fixes')}</h4><div class="au-ms">${cards}</div>${assumptions(['hours', 'kva', 'll', 'energy', 'demand', 'owned'])}`;
  }
  function pilotRows() {
    if (st.files.before && st.files.after) return [...st.files.before.map((r) => ({ ...r, phase: 'before' })), ...st.files.after.map((r) => ({ ...r, phase: 'after' }))];
    const m = MACHINES.find((q) => q.id === st.pm), dx = diagnose(m, st.a), fx = dx.find((q) => q.key === st.pfix) || dx[0];
    return pilotData(m, fx);
  }
  function tabPilot() {
    const m = MACHINES.find((q) => q.id === st.pm), dx = diagnose(m, st.a), fx = dx.find((q) => q.key === st.pfix) || dx[0];
    const rows = pilotRows(), real = st.files.before && st.files.after;
    const keys = [['P', 'kW'], ['Q', 'kvar'], ['S', 'kVA'], ['I', 'A'], ['PF', ''], ['thd', '%']].filter(([k]) => rows.some((r) => Number.isFinite(r[k])));
    const tbl = keys.map(([k, u]) => { const s = mvStat(rows, k); const v = !s.significant ? 'ns' : (s.diff < 0) === (k !== 'PF') ? 'good' : 'bad'; return `<tr><th>${k === 'thd' ? 'THD-I' : k}</th><td class="num">${f(s.before, k === 'PF' ? 3 : 1)} ${u}</td><td class="num">${f(s.after, k === 'PF' ? 3 : 1)} ${u}</td><td class="num">${s.pct > 0 ? '+' : ''}${f(s.pct, 1)}% <small>± ${f(Math.abs(s.ci / (s.before || 1) * 100), 1)}%</small></td><td><span class="au-chip ${v}">${v === 'ns' ? x('notSig') : s.diff < 0 ? x('real') : x('up')}</span></td></tr>`; }).join('');
    const pu = rows.some((r) => r.prod) ? mvPerUnit(rows) : null;
    const opts = MACHINES.filter((q) => diagnose(q, st.a).length).map((q) => `<option value="${q.id}" ${q.id === st.pm ? 'selected' : ''}>${q.id} · ${esc(tr(q))}</option>`).join('');
    const fopts = dx.map((q) => `<option value="${q.key}" ${q.key === (fx && fx.key) ? 'selected' : ''}>${esc(tr(q))}</option>`).join('');
    const chartKeys = [['Q', '#38BDF8', 'kvar'], ['P', '#4ADE80', 'kW'], ['I', '#FB923C', 'A']].filter(([k]) => rows.some((r) => Number.isFinite(r[k])));
    return `<p class="au-why">${x('pilotWhy')}</p>
      <div class="au-tl">${['st1', 'st2', 'st3', 'st4'].map((k, i) => `<div><span>${i + 1}</span><b>${x(k)}</b><small>${['3 ' + (L() === 'th' ? 'วัน' : 'days'), '½ ' + (L() === 'th' ? 'วัน' : 'day'), '3 ' + (L() === 'th' ? 'วัน' : 'days'), (L() === 'th' ? 'อัตโนมัติ' : 'automatic')][i]}</small></div>`).join('')}</div>
      <div class="au-pick"><label>${x('machine')} <select data-au-pm>${opts}</select></label><label>${x('fix')} <select data-au-pfix>${fopts}</select></label></div>
      ${real ? `<div class="au-real">▤ ${esc(st.files.before.name)} → ${esc(st.files.after.name)} <button class="btn sm" data-au="demo">${x('useDemo')}</button></div>` : `<small class="muted">${x('sim')}</small>`}
      <div class="au-scroll">${lines(rows, chartKeys)}</div>
      <table class="au-tbl"><thead><tr><th></th><th>${x('before')}</th><th>${x('after')}</th><th>${x('change')}</th><th>${x('verdict')}</th></tr></thead><tbody>${tbl}</tbody></table>
      <small class="muted">${x('ci')}</small>
      ${pu ? `<div class="au-pu"><b>${x('perUnit')}</b> ${f(pu.before, 2)} → ${f(pu.after, 2)} kWh/${L() === 'th' ? 'หน่วย' : 'unit'}</div>` : ''}
      ${(() => { if (real || !fx) return ''; const one = plan({ [m.id]: [fx] }, st.a, st.t).per[0]; return one ? `<div class="au-money"><div><small>${x('pilotMoney')}</small><b>${baht(one.thb)}</b><span>${x('perMonth')}</span></div><div><small>${x('invest')}</small><b>฿${n0(one.cost)}</b></div><div><small>${x('payback')}</small><b>${f(one.payback, 1)} ${x('months')}</b></div><p>${one.r.items.filter((i) => Math.abs(i.thb) >= 1).map((i) => `${esc(tr(i))} <b>${baht(i.thb)}</b>`).join(' · ')}</p></div>` : ''; })()}
      <div class="au-verdict info">ⓘ ${x('kwNote')}</div>
      <div class="au-imp"><label class="btn"><input type="file" accept=".csv,.txt" data-au-file="before" hidden>📥 ${x('impB')}${st.files.before ? ' ✓' : ''}</label><label class="btn"><input type="file" accept=".csv,.txt" data-au-file="after" hidden>📥 ${x('impA')}${st.files.after ? ' ✓' : ''}</label><small class="muted">${x('impNote')}${(st.files.before || st.files.after) && !real ? ' · ' + x('fileMissing') : ''}</small></div>`;
  }
  function tabOwner() {
    const p = plan(selected(), st.a, st.t), s = snapshot(), apf = s && apfCase(s, history(), st.a, st.t);
    const ranked = [...p.per].sort((a, b) => a.payback - b.payback);
    const worst = [...MACHINES].map((m) => measure(m, st.a)).sort((a, b) => b.Q - a.Q).slice(0, 3);
    const top = ranked[0] && MACHINES.find((m) => m.id === ranked[0].id);
    const pilotM = MACHINES.find((m) => m.id === st.pm);
    return `<section class="au-owner"><header><div><small>CoreDash Nexus · ${new Date().toLocaleDateString(L() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</small><h3>${x('ownerT')}</h3></div><button class="btn" data-au="print">🖨 ${x('print')}</button></header>
      <div class="au-kpis big"><div class="hl"><small>${x('saving')}</small><b>${baht(p.all.total)}</b><span>${x('perMonth')}</span></div><div><small>${x('invest')}</small><b>฿${n0(p.cost)}</b></div><div><small>${x('payback')}</small><b>${f(p.payback, 1)} ${x('months')}</b></div><div><small>${x('sitePf')}</small><b>${f(p.all.pf[0], 2)} → ${f(p.all.pf[1], 2)}</b></div></div>
      <h4>1 · ${x('o1')}</h4><ul>
        <li>${L() === 'th' ? `PF ทั้งโรงงาน ${f(p.base.PF, 2)} · kvar ช่วงพีค ${n0(p.base.Q)} เกินเกณฑ์ไม่เสียค่าปรับ ${n0(Math.max(0, p.base.Q - 0.6197 * p.base.P))} kvar` : `Site PF ${f(p.base.PF, 2)} · peak ${n0(p.base.Q)} kvar, ${n0(Math.max(0, p.base.Q - 0.6197 * p.base.P))} kvar above the free allowance`}</li>
        <li>${L() === 'th' ? 'ต้นเหตุ kvar 3 อันดับแรก: ' : 'Top 3 kvar sources: '}${worst.map((m) => `${m.id} (${n0(m.Q)} kvar)`).join(', ')}</li>
        <li>${L() === 'th' ? `THD-I ทั้งโรงงาน ~${f(p.base.thd, 0)}% จากเรกติไฟเออร์และไดรฟ์ · หม้อแปลงรับภาระฮาร์มอนิก F_HL ${f(p.base.F, 1)}` : `Site THD-I ~${f(p.base.thd, 0)}% from rectifiers and drives · transformer F_HL ${f(p.base.F, 1)}`}</li></ul>
      <h4>2 · ${x('o2')}</h4><table class="au-tbl"><thead><tr><th>${x('machine')}</th><th>${x('fix')}</th><th>${x('saving')}</th><th>${x('invest')}</th><th>${x('payback')}</th></tr></thead><tbody>
        ${ranked.map((q) => { const m = MACHINES.find((z) => z.id === q.id); return `<tr><td><b>${q.id}</b><br><small>${esc(tr(m))}</small></td><td>${selected()[q.id].map((z) => esc(tr(z))).join('<br>')}</td><td class="num">${baht(q.thb)}</td><td class="num">฿${n0(q.cost)}</td><td class="num">${f(q.payback, 1)} ${x('months')}</td></tr>`; }).join('')}</tbody></table>
      <small class="muted">${x('perNote')}</small>
      <h4>3 · ${x('o3')}</h4><ul><li>${x('noApf')}${apf ? ` (${L() === 'th' ? 'ผลสุทธิ' : 'net'} ${baht(apf.total)}/${L() === 'th' ? 'เดือน' : 'month'})` : ''}</li><li>${x('noCap')}</li></ul>
      <h4>4 · ${x('o4')}</h4><ol><li>${x('next1').replace('{m}', `${pilotM.id} ${tr(pilotM)}`)}</li><li>${x('next2')}</li><li>${x('next3')}</li></ol>
      <small class="muted">${x('costNote')} · ${x('sim')}${top ? '' : ''}</small></section>`;
  }

  function render() {
    const tabs = ['apf', 'survey', 'pilot', 'owner'].map((k) => `<button class="au-tab ${st.tab === k ? 'on' : ''}" data-au="tab" data-arg="${k}">${x('t' + k[0].toUpperCase() + k.slice(1))}</button>`).join('');
    const body = st.tab === 'apf' ? tabApf() : st.tab === 'survey' ? tabSurvey() : st.tab === 'pilot' ? tabPilot() : tabOwner();
    const keepOpen = el.querySelector('details.au-assume[open]');
    el.innerHTML = `<nav class="au-tabs">${tabs}</nav><div class="au-body">${body}</div>`;
    if (keepOpen) { const d = el.querySelector('details.au-assume'); if (d) d.open = true; }
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-au]'); if (!b) return; e.stopPropagation();
    if (b.dataset.au === 'tab') { st.tab = b.dataset.arg; render(); }
    else if (b.dataset.au === 'print') { document.body.classList.add('au-printing'); setTimeout(() => { window.print(); document.body.classList.remove('au-printing'); }, 50); }
    else if (b.dataset.au === 'demo') { st.files = { before: null, after: null }; render(); }
  });
  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-au-a]')) {
      const [obj, ...path] = t.dataset.auA.split('.'); const v = Number(t.value); if (!Number.isFinite(v)) return;
      const root = obj === 't' ? st.t : st.a; let o = root; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = v; render();
    } else if (t.matches('[data-au-owned]')) { st.a.trafoOwned = t.checked; render(); }
    else if (t.matches('[data-au-fix]')) { const id = t.dataset.auFix; st.sel[id] = t.checked ? [...new Set([...st.sel[id], t.value])] : st.sel[id].filter((k) => k !== t.value); render(); }
    else if (t.matches('[data-au-pm]')) { st.pm = t.value; st.pfix = null; render(); }
    else if (t.matches('[data-au-pfix]')) { st.pfix = t.value; render(); }
    else if (t.matches('[data-au-file]') && parseCsv) {
      const file = t.files[0]; if (!file) return;
      const parsed = parseCsv(await file.text(), file.name); if (!parsed) return;
      const col = (re) => parsed.cols.find((h) => re.test(h));
      const cP = col(/^P(_?sum)?\b|P_sum|kW/i), cQ = col(/^Q|kvar/i), cS = col(/^S(_?sum)?\b|kVA/i), cI = col(/^I1?(rms)?\b|I_?avg|\[A\]/i), cPF = col(/^PF/i), cT = col(/thd.*i|ithd/i);
      const pick = (c, i) => (c ? parsed.vals[c][i] : null);
      const rows = parsed.ts.map((ts, i) => ({ ts: typeof ts === 'number' && ts > 1e9 ? ts : Date.now() + i * 60000, P: pick(cP, i), Q: pick(cQ, i), S: pick(cS, i), I: pick(cI, i), PF: pick(cPF, i), thd: pick(cT, i) }));
      const mx = Math.max(...rows.map((r) => r.P || r.I || 0));
      for (const r of rows) r.on = (r.P ?? r.I ?? 0) > 0.3 * mx;
      rows.name = file.name; st.files[t.dataset.auFile] = rows; render();
    }
  });
  return { el, show() { render(); }, refresh() { if (st.tab === 'apf' && !el.querySelector('details.au-assume[open]')) render(); }, langChanged() { render(); }, _state: st };
}
