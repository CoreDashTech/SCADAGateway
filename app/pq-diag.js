// CoreDash · "วินิจฉัย & แก้ไข" — smart diagnosis view (uses pq-diagnose.js)
//   • data: live analysers / Lab case 13 Nov 2026 / values typed from a screen (analyser not on LAN, APF HMI)
//   • single-line diagram that colours every measuring point by its worst finding
//   • findings with evidence → cause → what to do → standard
//   • kVA split (real / reactive / harmonic), APF performance, what to buy (sized + budget)
//   • beginner wiring guide with live wiring checks
import { diagnose, LAB_CASE, POINTS, PRICES, harmonicOrders, LAB_HARMONICS, IEEE519_I } from './pq-diagnose.js';
import { FIRE_GUIDE, FIRE_KIT, SCENARIOS } from './pq-risk.js';
import { TERMS, CATS, findTerm } from './pq-glossary.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const B = (th, en) => ({ th, en });
const T = {
  title: B('วินิจฉัยอัจฉริยะ · ชี้จุด · บอกวิธีแก้', 'Smart diagnosis · where · how to fix'),
  sub: B('ตรวจการต่อสาย → วิเคราะห์คุณภาพไฟ → แยก PF รีแอกทีฟ/ฮาร์มอนิก → ประเมิน APF → แนะนำสิ่งที่ต้องซื้อ', 'Check wiring → analyse power quality → split reactive/harmonic PF → judge the APF → what to buy'),
  tHarm: B('〰 ฮาร์มอนิกรายลำดับ', '〰 Harmonics by order'), tRisk: B('🔥 เตือนก่อนไฟไหม้/ลัดวงจร', '🔥 Fire / short-circuit early warning'),
  tDiag: B('🧠 ผลวินิจฉัย', '🧠 Diagnosis'), tGuide: B('🧰 คู่มือต่อสาย (มือใหม่)', '🧰 Wiring guide (beginner)'), tManual: B('✍ ป้อนค่าจากหน้าจอ', '✍ Enter screen values'),
  srcLive: B('📡 ค่าปัจจุบัน', '📡 Current data'), srcLab: B('🧪 เคส Lab 13 พ.ย.', '🧪 Lab case 13 Nov'),
  crit: B('ต้องแก้', 'Fix now'), warn: B('ควรแก้', 'Should fix'), info: B('ข้อสังเกต', 'Note'), ok: B('ผ่าน', 'OK'),
  evid: B('หลักฐานจากค่าวัด', 'Evidence'), cause: B('สาเหตุ', 'Cause'), todo: B('ทำอย่างไร', 'What to do'), std: B('มาตรฐาน', 'Standard'),
  none: B('ไม่พบปัญหาที่จุดนี้', 'No issue at this point'), noData: B('ไม่มีข้อมูล', 'no data'),
  split: B('kVA แยกส่วน: ใช้งานจริง / รีแอกทีฟ / ฮาร์มอนิก', 'kVA split: real / reactive / harmonic'),
  P: B('กำลังจริง P', 'Real P'), Q1: B('รีแอกทีฟ Q1 (คาปาซิเตอร์แก้ได้)', 'Reactive Q1 (capacitor-fixable)'), D: B('ฮาร์มอนิก D (ต้อง APF/ฟิลเตอร์)', 'Harmonic D (needs APF/filter)'), N: B('ไม่ทำงานรวม (แยกไม่ได้ — ไม่มี THD-I)', 'Non-active total (no THD-I to split)'),
  apfT: B('APF ทำงานได้ดีแค่ไหน', 'How well is the APF working'), before: B('ก่อน APF (LOAD)', 'Before APF (LOAD)'), after: B('หลัง APF (MAIN)', 'After APF (MAIN)'), target: B('เป้าหมาย', 'Target'),
  cut: B('ลดกำลังไม่ทำงานได้', 'Non-active power removed'), need: B('กระแส APF ที่ต้องใช้', 'APF current needed'), util: B('APF จ่ายจริง', 'APF output'),
  buyT: B('ต้องลงทุนอะไร (ขนาด + งบประมาณการ)', 'What to invest in (size + budget)'), pick: B('แนะนำ', 'Recommended'), budget: B('งบประมาณการ (รวมติดตั้ง ~15%)', 'Budget (incl. ~15 % install)'),
  budgetNote: B('ราคาต่อหน่วยเป็นสมมติฐานแก้ได้ ไม่ใช่ใบเสนอราคา — APF นำเข้า ~US$30–50/A ถึงแบรนด์ UL ~US$420/A · detuned reactor 50 kvar ~฿430/kvar (เฉพาะรีแอกเตอร์)', 'Unit prices are editable assumptions, not quotes — APF from ~US$30–50/A (imports) to ~US$420/A (UL brands) · detuned reactor 50 kvar ~฿430/kvar (reactor only)'),
  step: B('ช่วงเวลา', 'Step'), labNote: B('ค่าจากภาพหน้าจอ PW3198 และหน้าจอ APF ที่ถ่ายใน Lab', 'Values from the PW3198 and APF screens photographed in the Lab'),
  apfRating: B('พิกัด APF ที่ติดตั้ง (A)', 'Installed APF rating (A)'), save: B('บันทึก', 'Save'), clear: B('ล้าง', 'Clear'),
  manHint: B('ใช้เมื่อเครื่องวัดส่งข้อมูลผ่าน LAN ไม่ได้ (เช่น #6 ที่ APF) หรือจะใส่ค่าจากหน้าจอ APF — ค่าจะถูกใช้ในผลวินิจฉัยทันที', 'Use when an analyser cannot send over LAN (e.g. #6 at the APF) or to add the APF screen values — used in the diagnosis right away'),
  manPt: B('ค่าจากเครื่องวัดที่ไม่ได้ต่อ LAN', 'Analyser not on the LAN'), manHmi: B('ค่าจากหน้าจอ APF (Monitor)', 'APF screen (Monitor)'), running: B('APF กำลังทำงาน (Run)', 'APF running (Run)'),
  verdictOk: B('ไม่พบปัญหาที่ต้องแก้', 'Nothing that needs fixing'), top: B('สิ่งที่ต้องทำก่อน', 'Do these first'),
  hintPF: B('Hioki แสดง Q = √(S²−P²) ซึ่งรวมฮาร์มอนิก — ระบบแยกให้ว่าส่วนไหนแก้ด้วยคาปาซิเตอร์ได้', 'Hioki shows Q = √(S²−P²), which includes harmonics — this splits what a capacitor can fix')
};

export function createDiagView({ lang = () => 'th', snapshot = () => null, risk = () => null, setRiskSim = () => {}, riskSim = () => null, onRiskOpts = () => {} } = {}) {
  const L = () => (lang() === 'en' ? 'en' : 'th');
  const x = (k) => T[k][L()];
  const tr = (o) => (o ? o[L()] ?? o.th : '');
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const st = { q: '', focus: '', harm: ls.get('coredash.diag.harm', { scr: 15, ilRatio: 1, txKva: '', txZ: 4, capKvar: '', paste: '' }), riskOpt: ls.get('coredash.risk.opt', { udin: 230, rating: { MAIN: '', LOAD: '', APF: '' }, ch4: 'neutral' }), tab: 'diag', src: ls.get('coredash.diag.src', 'lab'), step: 3, pt: null, open: new Set(), man: ls.get('coredash.diag.manual', { point: 'APF', running: true, rating: 50 }), prices: { ...PRICES, ...ls.get('coredash.diag.prices', {}) }, guide: 0 };
  const el = document.createElement('div');
  el.className = 'dg';

  // ---------------------------------------------------------------- input assembly
  function manualRecord() {
    const m = st.man, n = (v) => (v === '' || v == null ? null : Number(v));
    const U = [n(m.U1), n(m.U2), n(m.U3)], I = [n(m.I1), n(m.I2), n(m.I3)];
    if (U.every((v) => v == null) && I.every((v) => v == null)) return null;
    return { ph: [0, 1, 2].map((i) => ({ U: U[i], I: I[i], P: null, Q: null, S: null, PF: null })), P: n(m.P), S: n(m.S), Q: n(m.Q), PF: n(m.PF) != null ? Math.abs(n(m.PF)) : null, pfSign: n(m.Q) != null ? Math.sign(n(m.Q)) : null, KF: n(m.KF), Uthd: n(m.THDU), Ithd: n(m.THDI) };
  }
  function manualHmi() {
    const m = st.man, n = (v) => (v === '' || v == null ? null : Number(v));
    const iout = [n(m.Iea), n(m.Ieb), n(m.Iec)], iload = [n(m.Ial), n(m.Ibl), n(m.Icl)];
    if (iout.every((v) => v == null) && iload.every((v) => v == null)) return null;
    return { iout: iout.every((v) => v != null) ? iout : null, iload: iload.every((v) => v != null) ? iload : null, thdL: n(m.thdL), s: n(m.hS), pf: n(m.hPF) };
  }
  function input() {
    if (st.src === 'lab') {
      const s = LAB_CASE.steps[st.step];
      return { points: s.points, setup: s.setup, apf: { rating: LAB_CASE.apf.rating, ...s.apf }, prices: st.prices, label: s.t + ' · ' + tr(s), note: s.note };
    }
    const snap = snapshot() || { inst: {} }, inst = snap.inst || {};
    const points = { MAIN: inst['PQ-MAIN'] || null, LOAD: inst['PQ-LOAD'] || null, APF: inst['PQ-APF'] || null };
    const mr = manualRecord();
    if (mr && st.man.point && !points[st.man.point]) points[st.man.point] = mr;
    const setup = mr && st.man.wiring ? { [st.man.point]: { wiring: st.man.wiring, rangeA: Number(st.man.rangeA) || null } } : {};
    return { points, setup, apf: { rating: Number(st.man.rating) || 50, running: st.man.running ?? null, hmi: manualHmi() }, prices: st.prices, label: snap.mode === 'sim' || snap.mode === undefined ? (L() === 'th' ? 'ข้อมูลจำลอง/ค่าปัจจุบัน' : 'Simulated/current data') : (L() === 'th' ? 'ค่าสดจากเครื่องวัด' : 'Live analyser data') };
  }

  // ---------------------------------------------------------------- pieces
  const SC = { crit: '#EF4444', warn: '#F59E0B', info: '#38BDF8', ok: '#22C55E', none: '#64748B' };
  const n2 = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const baht = (v) => '฿' + Math.round(v).toLocaleString('en-US');

  function sld(r, inp) {
    const s = r.status, has = (k) => !!(inp.points && inp.points[k]);
    const col = (k) => (has(k) ? SC[s[k]] : SC.none);
    const cnt = (k) => r.findings.filter((f) => f.point === k && (f.sev === 'crit' || f.sev === 'warn')).length;
    const meter = (k, cx, cy) => `<g class="dg-m ${st.pt === k ? 'sel' : ''}" data-dg="pt" data-arg="${k}" role="button" tabindex="0">
      <circle cx="${cx}" cy="${cy}" r="25" fill="#0B1222" stroke="${col(k)}" stroke-width="4"/>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="dg-mn">#${POINTS[k].no}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" class="dg-ms">${k}</text>
      ${has(k) && cnt(k) ? `<circle cx="${cx + 20}" cy="${cy - 20}" r="11" fill="${col(k)}"/><text x="${cx + 20}" y="${cy - 16}" text-anchor="middle" class="dg-badge">${cnt(k)}</text>` : ''}
      ${!has(k) ? `<text x="${cx}" y="${cy + 42}" text-anchor="middle" class="dg-nd">${x('noData')}</text>` : ''}</g>`;
    return `<svg viewBox="0 0 760 290" class="dg-sld" role="img" aria-label="single line diagram">
      <defs><marker id="dgA" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#D4B06A"/></marker></defs>
      <text x="20" y="30" class="dg-l">${L() === 'th' ? 'การไฟฟ้า / หม้อแปลง' : 'Utility / transformer'}</text>
      <circle cx="60" cy="70" r="16" class="dg-tx"/><circle cx="60" cy="92" r="16" class="dg-tx"/>
      <line x1="60" y1="108" x2="60" y2="145" class="dg-w"/><line x1="60" y1="145" x2="250" y2="145" class="dg-w"/>
      <rect x="95" y="133" width="22" height="24" rx="3" class="dg-br"/><text x="106" y="176" text-anchor="middle" class="dg-s">MAIN</text>
      ${meter('MAIN', 185, 145)}
      <line x1="250" y1="80" x2="250" y2="225" class="dg-bus"/>
      <line x1="250" y1="95" x2="700" y2="95" class="dg-w"/><rect x="290" y="83" width="22" height="24" rx="3" class="dg-br"/><text x="301" y="76" text-anchor="middle" class="dg-s">LOAD</text>
      ${meter('LOAD', 395, 95)}
      <ellipse cx="490" cy="95" rx="9" ry="18" class="dg-ct"/><text x="490" y="132" text-anchor="middle" class="dg-ctl">CT APF</text>
      <line x1="470" y1="70" x2="512" y2="70" class="dg-arr" marker-end="url(#dgA)"/><text x="491" y="62" text-anchor="middle" class="dg-s">P1→</text>
      <rect x="560" y="70" width="70" height="50" rx="8" class="dg-ld"/><text x="595" y="92" text-anchor="middle" class="dg-s">${L() === 'th' ? 'โหลด' : 'Loads'}</text><text x="595" y="108" text-anchor="middle" class="dg-s2">VFD · heater</text>
      <rect x="650" y="70" width="80" height="50" rx="8" class="dg-hg"/><text x="690" y="92" text-anchor="middle" class="dg-s">Harmonic</text><text x="690" y="108" text-anchor="middle" class="dg-s2">generator</text>
      <line x1="250" y1="215" x2="560" y2="215" class="dg-w"/><rect x="290" y="203" width="22" height="24" rx="3" class="dg-br"/><text x="301" y="245" text-anchor="middle" class="dg-s">APF</text>
      ${meter('APF', 395, 215)}
      <rect x="560" y="185" width="110" height="60" rx="8" class="dg-apf"/><text x="615" y="210" text-anchor="middle" class="dg-s">APF 3L (Δ)</text><text x="615" y="228" text-anchor="middle" class="dg-s2">${inp.apf && inp.apf.rating ? inp.apf.rating + ' A' : ''}</text>
      <path d="M 490 113 C 490 170, 560 170, 600 185" class="dg-sig"/><text x="540" y="160" class="dg-s2">${L() === 'th' ? 'สัญญาณ CT → APF' : 'CT signal → APF'}</text>
      <text x="20" y="280" class="dg-s2">${L() === 'th' ? '● สีที่วงกลม = สถานะแย่สุดของจุดนั้น · แตะเพื่อดูเฉพาะจุด' : '● circle colour = worst finding at that point · tap to filter'}</text></svg>`;
  }

  function splitBars(r) {
    const rows = ['MAIN', 'LOAD', 'APF'].map((k) => [k, r.metrics[k]]).filter(([, m]) => m && m.S > 0.05);
    if (!rows.length) return '';
    const mx = Math.max(...rows.map(([, m]) => m.S));
    const bar = (m) => {
      // S² = P² + Q1² + D² (IEEE 1459): each part's share of S², bar length ∝ S
      const P = Math.abs(m.P || 0), parts = m.D != null ? [[P * P, 'p'], [m.Q1 * m.Q1, 'q'], [m.D * m.D, 'd']] : [[P * P, 'p'], [Math.max(0, m.S * m.S - P * P), 'n']];
      const tot = parts.reduce((s, [v]) => s + v, 0) || 1;
      return parts.map(([v, c]) => `<i class="dg-b ${c}" style="width:${(v / tot) * (m.S / mx) * 100}%"></i>`).join('');
    };
    return `<section class="dg-card"><h4>${x('split')}</h4><p class="muted dg-small">${x('hintPF')}</p>
      ${rows.map(([k, m]) => `<div class="dg-split"><b>#${POINTS[k].no} ${k}</b><div class="dg-bar">${bar(m)}</div>
        <span class="dg-nums">S ${n2(m.S)} kVA · P ${n2(m.P)} kW · PF ${n2(m.PF, 3)}${m.DPF != null ? ` · DPF ${n2(m.DPF, 3)}` : ''}${m.KF != null ? ` · KF ${n2(m.KF, 1)}` : ''}</span></div>`).join('')}
      <div class="dg-legend"><span><i class="dg-b p"></i>${x('P')}</span><span><i class="dg-b q"></i>${x('Q1')}</span><span><i class="dg-b d"></i>${x('D')}</span><span><i class="dg-b n"></i>${x('N')}</span></div></section>`;
  }

  function apfPanel(r) {
    const a = r.apf; if (!a) return '';
    const row = (lab, f, d) => `<tr><th>${lab}</th><td>${f(a.before)}</td><td>${f(a.after)}</td><td class="tg">${d}</td></tr>`;
    const pct = (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
    const good = a.nonActiveCut != null && a.nonActiveCut >= 0.6;
    return `<section class="dg-card"><h4>${x('apfT')}</h4>
      <div class="dg-kpis"><div><small>${x('cut')}</small><b style="color:${good ? SC.ok : SC.crit}">${pct(a.nonActiveCut)}</b><i>${L() === 'th' ? 'ควร ≥ 80%' : 'should be ≥ 80 %'}</i></div>
        <div><small>${x('need')}</small><b>${n2(a.Ineed, 1)} A</b><i>${L() === 'th' ? 'พิกัด' : 'rating'} ${a.rating} A</i></div>
        <div><small>${x('util')}</small><b>${a.Iapf != null ? n2(a.Iapf, 1) + ' A' : '—'}</b><i>${a.util != null ? pct(a.util) + (L() === 'th' ? ' ของพิกัด' : ' of rating') : (L() === 'th' ? 'ใส่ค่าจากหน้าจอ APF' : 'enter APF screen values')}</i></div>
        <div><small>kVA</small><b>${pct(a.kvaCut)}</b><i>${L() === 'th' ? 'ลดลง' : 'reduction'}</i></div></div>
      <div class="tscroll"><table class="rtable dg-t"><thead><tr><th></th><th>${x('before')}</th><th>${x('after')}</th><th>${x('target')}</th></tr></thead><tbody>
        ${row('S (kVA)', (o) => n2(o.S), n2(a.target.S))}${row('I avg (A)', (o) => n2(o.I, 1), n2(a.target.I, 1))}${row('PF', (o) => n2(o.PF, 3), '≥ 0.95')}${row('K-factor', (o) => n2(o.KF, 1), '< 4')}${row(L() === 'th' ? 'ไม่ทำงาน √(S²−P²)' : 'Non-active √(S²−P²)', (o) => n2(o.N), '≈ 0')}
      </tbody></table></div></section>`;
  }

  function buyPanel(r) {
    if (!r.recommend.length) return '';
    return `<section class="dg-card"><h4>${x('buyT')}</h4><div class="dg-buy">${r.recommend.map((o) => `<div class="dg-opt ${o.pick ? 'pick' : ''}">
      <div class="dg-opt-h"><b>${esc(tr(o))}</b>${o.pick ? `<span class="pill ok">${x('pick')}</span>` : ''}</div>
      <p>${esc(tr(o.why))}</p><p class="dg-res">→ ${esc(tr(o.result))}</p>
      ${o.note ? `<p class="dg-note">💡 ${esc(tr(o.note))}</p>` : ''}
      <div class="dg-bud"><small>${x('budget')}</small><b>${o.budget && o.budget[1] ? baht(o.budget[0]) + ' – ' + baht(o.budget[1]) : '฿0'}</b></div></div>`).join('')}</div>
      <p class="muted dg-small">ⓘ ${x('budgetNote')}</p>
      <details class="dg-prices"><summary>${L() === 'th' ? 'แก้ราคาต่อหน่วย' : 'Edit unit prices'}</summary><div class="dg-pf">
        ${[['apfPerA', 'APF ฿/A'], ['capPerKvar', 'Capacitor ฿/kvar'], ['detunedPerKvar', 'Detuned ฿/kvar'], ['svgPerKvar', 'SVG ฿/kvar'], ['reactorPerKw', 'Reactor ฿/kW']].map(([k, lab]) => `<label>${lab}<span><input data-dgp="${k}" data-i="0" value="${st.prices[k][0]}" inputmode="numeric"> – <input data-dgp="${k}" data-i="1" value="${st.prices[k][1]}" inputmode="numeric"></span></label>`).join('')}
      </div></details></section>`;
  }

  function finding(f) {
    const id = f.point + f.id;
    return `<article class="dg-f ${f.sev}"><div class="dg-fh"><span class="dg-sev">${x(f.sev)}</span><span class="dg-pt">#${POINTS[f.point].no} ${f.point}</span><b>${esc(tr(f.title))}</b></div>
      ${f.evidence && f.evidence.length ? `<div class="dg-ev">${f.evidence.map((e) => `<code>${esc(e)}</code>`).join('')}</div>` : ''}
      ${f.sev !== 'ok' ? `<details data-dgo="${id}" ${st.open.has(id) || (f.sev === 'crit' && (f.cat === 'wiring' || f.cat === 'apf')) ? 'open' : ''}><summary>${x('cause')} · ${x('todo')}${f.std ? ' · ' + x('std') : ''}</summary>
        ${tr(f.cause) ? `<p><b>${x('cause')}:</b> ${esc(tr(f.cause))}</p>` : ''}
        ${f.steps && f.steps.length ? `<ol>${f.steps.map((s) => `<li>${esc(tr(s))}</li>`).join('')}</ol>` : ''}
        ${f.std ? `<p class="muted">📘 ${esc(f.std)}</p>` : ''}</details>` : ''}</article>`;
  }

  function diagTab() {
    const inp = input(), r = diagnose(inp);
    const fs = r.findings.filter((f) => !st.pt || f.point === st.pt);
    const top = r.findings.filter((f) => f.sev === 'crit').slice(0, 3);
    const labBar = st.src === 'lab' ? `<div class="dg-steps"><small>${x('step')}</small>${LAB_CASE.steps.map((s, i) => `<button class="${i === st.step ? 'on' : ''}" data-dg="step" data-arg="${i}"><b>${esc(s.t)}</b><span>${esc(tr(s))}</span></button>`).join('')}</div>
      <p class="muted dg-small">ⓘ ${x('labNote')} · ${esc(LAB_CASE.apf.model)}${inp.note ? ' · ' + esc(tr(inp.note)) : ''}</p>` : '';
    return `${labBar}
      <div class="dg-top"><div class="dg-sldw">${sld(r, inp)}</div>
        <div class="dg-sum"><h4>${top.length ? x('top') : x('verdictOk')}</h4>${top.length ? `<ol>${top.map((f) => `<li><span class="dg-pt">#${POINTS[f.point].no}</span> ${esc(tr(f.title))}</li>`).join('')}</ol>` : `<p class="dg-okmsg">✓ ${x('verdictOk')}</p>`}
          <div class="dg-chips">${['crit', 'warn', 'info', 'ok'].map((s) => `<span class="dg-chip ${s}">${r.findings.filter((f) => f.sev === s).length} ${x(s)}</span>`).join('')}</div>
          ${st.pt ? `<button class="btn sm" data-dg="pt" data-arg="">✕ ${L() === 'th' ? 'ดูทุกจุด' : 'all points'}</button>` : ''}</div></div>
      <section class="dg-fs">${fs.length ? fs.map(finding).join('') : `<p class="muted">${x('none')}</p>`}</section>
      ${apfPanel(r)}${splitBars(r)}${buyPanel(r)}`;
  }

  // ---------------------------------------------------------------- manual entry
  function manualTab() {
    const m = st.man, f = (k, lab, ph = '') => `<label>${lab}<input data-dgm="${k}" value="${esc(m[k] ?? '')}" placeholder="${esc(ph)}" inputmode="decimal"></label>`;
    return `<p class="muted">${x('manHint')}</p>
      <section class="dg-card"><h4>${x('manPt')}</h4>
        <div class="dg-form"><label>${L() === 'th' ? 'จุด' : 'Point'}<select data-dgm="point">${['APF', 'LOAD', 'MAIN'].map((k) => `<option value="${k}" ${m.point === k ? 'selected' : ''}>#${POINTS[k].no} ${k}</option>`).join('')}</select></label>
          <label>WIRING<select data-dgm="wiring"><option value="">—</option>${['3P4W', '3P3W3M', '3P3W2M'].map((w) => `<option ${m.wiring === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
          ${f('rangeA', 'I Range (A)', '50')}</div>
        <div class="dg-form">${f('U1', 'U1 (V)')}${f('U2', 'U2 (V)')}${f('U3', 'U3 (V)')}${f('I1', 'I1 (A)')}${f('I2', 'I2 (A)')}${f('I3', 'I3 (A)')}</div>
        <div class="dg-form">${f('P', 'P sum (kW)')}${f('S', 'S sum (kVA)')}${f('Q', 'Q sum (kvar)', '-1.04')}${f('PF', 'PF sum', '-0.69')}${f('KF', 'KF max')}${f('THDU', 'THD-U max %')}${f('THDI', 'THD-I max %')}</div></section>
      <section class="dg-card"><h4>${x('manHmi')}</h4>
        <div class="dg-form">${f('rating', x('apfRating'), '50')}<label class="dg-cb"><input type="checkbox" data-dgm="running" ${m.running ? 'checked' : ''}> ${x('running')}</label></div>
        <div class="dg-form">${f('Iea', 'Iea (A)')}${f('Ieb', 'Ieb (A)')}${f('Iec', 'Iec (A)')}${f('Ial', 'Ial (A)')}${f('Ibl', 'Ibl (A)')}${f('Icl', 'Icl (A)')}${f('thdL', 'THD_L %')}${f('hS', 'S (kVA)')}${f('hPF', 'PF')}</div></section>
      <div class="dg-row"><button class="btn" data-dg="mansave">✓ ${x('save')}</button><button class="btn sm" data-dg="manclear">${x('clear')}</button></div>`;
  }

  // ---------------------------------------------------------------- beginner wiring guide
  const svgClamp = `<svg viewBox="0 0 320 120" class="dg-ill"><line x1="10" y1="60" x2="310" y2="60" class="dg-w"/><text x="12" y="48" class="dg-s2">${'แหล่งจ่าย / source'}</text><text x="250" y="48" class="dg-s2">${'โหลด / load'}</text>
    <ellipse cx="160" cy="60" rx="22" ry="34" class="dg-ct"/><line x1="130" y1="102" x2="196" y2="102" class="dg-arr" marker-end="url(#dgA2)"/><text x="160" y="118" text-anchor="middle" class="dg-s2">➜ ${'ลูกศรบนแคลมป์ชี้ไปโหลด'}</text>
    <defs><marker id="dgA2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#D4B06A"/></marker></defs></svg>`;
  const svgWires = `<svg viewBox="0 0 320 130" class="dg-ill">${[['L1', '#EF4444', 20], ['L2', '#EAB308', 45], ['L3', '#3B82F6', 70], ['N', '#94A3B8', 95]].map(([n, c, y]) => `<line x1="10" y1="${y}" x2="200" y2="${y}" stroke="${c}" stroke-width="5"/><text x="210" y="${y + 5}" class="dg-s">${n}</text>`).join('')}
    <text x="240" y="40" class="dg-s2">4 สาย → 3P4W</text><text x="240" y="60" class="dg-s2">3 สาย → 3P3W3M</text><text x="240" y="80" class="dg-s2">L-N ≈ 230 V</text><text x="240" y="100" class="dg-s2">L-L ≈ 400 V</text></svg>`;
  const GUIDE = [
    { t: B('1 · ความปลอดภัยก่อนแตะตู้ไฟ', '1 · Safety before you touch the panel'), b: [
      B('ใส่ถุงมือฉนวนไฟฟ้า (Class 0, 1000 V) แว่นตานิรภัย รองเท้าหุ้มส้น ยืนบนแผ่นยาง', 'Insulating gloves (Class 0, 1000 V), safety glasses, closed shoes, stand on a rubber mat'),
      B('ใช้สายวัดและแคลมป์ CAT IV 600 V ที่ให้มากับเครื่องเท่านั้น ตรวจสายไม่แตก/ไม่ลอก', 'Only the CAT IV 600 V leads and clamps of the analyser; check for damage'),
      B('ต่อสายวัดแรงดันเข้าเครื่องวัดก่อน แล้วค่อยหนีบปลายที่ตู้ — ถอดกลับกัน', 'Plug the leads into the analyser first, then clip at the panel — remove in reverse'),
      B('ห้ามเปิดวงจรขั้ว secondary ของ CT ขณะมีกระแส (แรงดันสูงอันตราย) — ใช้ terminal ลัดวงจร', 'Never open a live CT secondary (dangerous voltage) — use a shorting terminal'),
      B('ถ้าไม่แน่ใจ ให้ช่างไฟที่มีใบอนุญาตทำ', 'If unsure, let a licensed electrician do it')] },
    { t: B('2 · รู้จักระบบไฟที่จะวัด', '2 · Know the system you measure'), svg: svgWires, b: [
      B('นับสายที่เข้าอุปกรณ์: มี L1 L2 L3 + N = 3P4W (ตู้เมน/โหลดทั่วไป)', 'Count the conductors: L1 L2 L3 + N = 3P4W (main board / normal loads)'),
      B('มีแค่ L1 L2 L3 (ไม่มี N) = 3P3W3M — เช่น APF รุ่น 3L, มอเตอร์ต่อ Δ', 'Only L1 L2 L3 = 3P3W3M — e.g. a 3L APF, a Δ motor'),
      B('ใน Lab: ตั้ง #6 (APF) เป็น 3P4W ทำให้ U อ่านได้ 134 V แทน 230 V → ค่าทั้งหมดใช้ไม่ได้', 'In the Lab: #6 (APF) set to 3P4W read 134 V instead of 230 V → every value invalid')] },
    { t: B('3 · เลือกแคลมป์และช่วงกระแส', '3 · Pick the clamp and current range'), b: [
      B('ประเมินกระแสก่อน (ดูขนาดเบรกเกอร์/ป้ายเครื่อง) ให้กระแสจริงอยู่ 10–100% ของช่วง', 'Estimate the current first (breaker size / nameplate) so it is 10–100 % of range'),
      B('≤ 5 A ที่ขั้ว CT ตู้เมน → 9694 (5 A) + ตั้ง CT ratio · ≤ 50 A → ช่วง 50 A · ≤ 500 A → 9661 · > 500 A → CT9667 (สายอ่อน)', '≤ 5 A on a CT secondary → 9694 + CT ratio · ≤ 50 A → 50 A range · ≤ 500 A → 9661 · > 500 A → CT9667 flex'),
      B('SYSTEM → Clamp Sensor ต้องตรงรุ่นแคลมป์ที่ใช้จริง (ใน Lab #6 ตั้ง 500 A กับกระแส ~2–8 A → ค่าเพี้ยน)', 'SYSTEM → Clamp Sensor must match the real clamp (Lab #6 was 500 A for ~2–8 A → wrong values)')] },
    { t: B('4 · ตั้งค่าเครื่อง PW3198', '4 · Set up the PW3198'), b: [
      B('SYSTEM → WIRING: 3P4W หรือ 3P3W3M ตามข้อ 2', 'SYSTEM → WIRING: 3P4W or 3P3W3M (step 2)'), B('U din = 230 V · fnom = 50 Hz · VT ratio = 1', 'U din = 230 V · fnom = 50 Hz · VT ratio = 1'),
      B('Clamp Sensor / I Range / CT ratio ตามข้อ 3', 'Clamp Sensor / I Range / CT ratio (step 3)'), B('ทุกเครื่องตั้งเหมือนกัน (MAIN/LOAD/APF) เพื่อเทียบกันได้', 'Same settings on every analyser (MAIN/LOAD/APF) so they compare')] },
    { t: B('5 · ต่อสายวัดแรงดันและคล้องแคลมป์', '5 · Voltage leads and clamps'), svg: svgClamp, b: [
      B('สายวัดแรงดัน: N (ดำ/เทา) ก่อน แล้ว L1 แดง · L2 เหลือง · L3 น้ำเงิน', 'Voltage: N (black/grey) first, then L1 red · L2 yellow · L3 blue'),
      B('แคลมป์ CH1 คล้องสายเดียวกับปากคีบ L1 (CH2→L2, CH3→L3) ลูกศรชี้ไปทางโหลด', 'Clamp CH1 on the same conductor as the L1 clip (CH2→L2, CH3→L3), arrow toward the load'),
      B('คล้องทีละ 1 สาย ปิดปากแคลมป์สนิท ห้ามคล้องรวมหลายสาย', 'One conductor per clamp, jaw fully closed, never around several conductors'),
      B('ตรวจหน้า VECTOR: แรงดันห่างกัน 120°, P ทุกเฟสเป็นบวก', 'Check VECTOR: voltages 120° apart, every phase P positive')] },
    { t: B('6 · วาง 3 จุดวัดให้ถูกตำแหน่ง', '6 · Place the three measuring points'), b: [
      B('#2 MAIN: ก่อนจุดแยกไป APF และโหลด (ฝั่งแหล่งจ่าย) — เห็นผลหลังชดเชย', '#2 MAIN: before the branch to the APF and loads (source side) — sees the result after compensation'),
      B('#3 LOAD: สายป้อนโหลด (ไม่มี APF) — เห็นปัญหาของโหลดจริง', '#3 LOAD: the load feeder (no APF) — sees what the load really draws'),
      B('#6 APF: สาย A/B/C ระหว่างเบรกเกอร์ APF กับขั้ว APF ตั้ง 3P3W3M', '#6 APF: A/B/C between the APF breaker and its terminals, set 3P3W3M'),
      B('ไม่มี #6 ก็ได้: ระบบคำนวณผล APF จาก MAIN เทียบ LOAD และค่าที่ป้อนจากหน้าจอ APF', 'No #6? The system judges the APF from MAIN vs LOAD plus the APF screen values')] },
    { t: B('7 · ต่อ APF และตัวกำเนิดฮาร์มอนิก', '7 · Connect the APF and the harmonic generator'), b: [
      B('APF ต่อขนาน (shunt) ผ่านเบรกเกอร์ของตัวเอง ต่อ A B C (+N ถ้าเป็นรุ่น 4L) และสายดิน PE', 'The APF is connected in parallel (shunt) through its own breaker: A B C (+N for 4L models) and PE'),
      B('CT ของ APF: คล้องสายที่ไปโหลดทั้งหมดที่ต้องการชดเชย (ฝั่งโหลด) — ห้ามคล้องสายออกของ APF เอง · P1 ชี้ไปแหล่งจ่าย', 'APF CTs around the conductors to ALL compensated loads (load side) — never the APF’s own output · P1 toward the source'),
      B('ตั้งใน APF → Parameter: CT ratio ตามป้าย CT, ตำแหน่ง CT (load/grid side), โหมด ฮาร์มอนิก+รีแอกทีฟ, สัดส่วนชดเชย 100%, ลำดับ 2–50', 'APF → Parameter: CT ratio from the CT label, CT position (load/grid side), mode harmonics+reactive, ratio 100 %, orders 2–50'),
      B('ตัวกำเนิดฮาร์มอนิก (เครื่องทดสอบ) ต่อเป็นโหลดบนสายป้อน LOAD หลังจุด CT ของ APF เพื่อให้ทั้ง #3 และ APF มองเห็น', 'The harmonic generator (test unit) goes on the LOAD feeder after the APF CT so both #3 and the APF see it'),
      B('ลำดับเปิด: โหลด → ตัวกำเนิดฮาร์มอนิก → APF Start · ตรวจหน้าจอ APF: Ial/Ibl/Icl ต้องใกล้ค่า #3', 'Order: loads → generator → APF Start · check the APF screen: Ial/Ibl/Icl must match #3'),
      B('ใน Lab 12:12: APF อ่านกระแสโหลด 440 A (จริง ~13 A) และ THD_L 826340% → CT ratio ผิด ต้องแก้ก่อน', 'Lab 12:12: the APF read 440 A load (real ~13 A) and THD_L 826340 % → wrong CT ratio, fix first')] },
    { t: B('8 · ให้ระบบตรวจอัตโนมัติ', '8 · Let the system check it'), live: true, b: [
      B('เปิด 📡 ข้อมูลจริง แล้วกลับมาหน้านี้ — รายการด้านล่างจะเปลี่ยนเป็น ✓ เมื่อถูกต้อง', 'Turn on 📡 Real data and come back — the list below turns ✓ when correct')] }
  ];
  function guideTab() {
    const g = GUIDE[st.guide];
    let live = '';
    if (g.live) {
      const r = diagnose(input()), w = r.findings.filter((f) => f.cat === 'wiring');
      const pts = ['MAIN', 'LOAD', 'APF'].map((k) => [k, r.metrics[k]]);
      live = `<ul class="dg-check">${pts.map(([k, m]) => `<li class="${m ? 'ok' : 'nd'}">${m ? '✓' : '○'} #${POINTS[k].no} ${k} ${m ? (L() === 'th' ? 'มีข้อมูล' : 'has data') : x('noData')}</li>`).join('')}
        ${w.map((f) => `<li class="${f.sev === 'ok' ? 'ok' : 'bad'}">${f.sev === 'ok' ? '✓' : '✖'} #${POINTS[f.point].no} ${esc(tr(f.title))}</li>`).join('')}
        ${!w.some((f) => f.sev !== 'ok') && pts.some(([, m]) => m) ? `<li class="ok">✓ ${L() === 'th' ? 'ไม่พบการต่อสายผิด' : 'No wiring error found'}</li>` : ''}</ul>`;
    }
    return `<div class="dg-gnav">${GUIDE.map((s, i) => `<button class="${i === st.guide ? 'on' : ''}" data-dg="guide" data-arg="${i}">${i + 1}</button>`).join('')}</div>
      <section class="dg-card dg-gs"><h4>${esc(tr(g.t))}</h4>${g.svg || ''}<ol>${g.b.map((b) => `<li>${esc(tr(b))}</li>`).join('')}</ol>${live}
      <div class="dg-row">${st.guide > 0 ? `<button class="btn sm" data-dg="guide" data-arg="${st.guide - 1}">← ${L() === 'th' ? 'ก่อนหน้า' : 'Back'}</button>` : ''}${st.guide < GUIDE.length - 1 ? `<button class="btn" data-dg="guide" data-arg="${st.guide + 1}">${L() === 'th' ? 'ถัดไป' : 'Next'} →</button>` : ''}</div></section>`;
  }

  // ---------------------------------------------------------------- harmonics by order
  function parsePaste(txt) {
    // "5:15.55 7:7.23 …" or 51 numbers (order 0…50) or one number per line starting at order 1
    const ih = new Array(51).fill(null); ih[1] = 100;
    const pairs = [...String(txt).matchAll(/(\d{1,2})\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)];
    if (pairs.length) { for (const [, h, v] of pairs) if (+h <= 50) ih[+h] = +v; return ih; }
    const nums = String(txt).split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    if (nums.length >= 51) { for (let h = 0; h <= 50; h++) ih[h] = nums[h]; } else nums.forEach((v, j) => { if (j + 1 <= 50) ih[j + 1] = v; });
    return ih;
  }
  function harmTab() {
    const H = st.harm, n = (v) => (v === '' || v == null ? null : Number(v));
    const src = H.paste && H.paste.trim() ? { ih: parsePaste(H.paste), where: L() === 'th' ? 'ค่าที่วาง' : 'pasted values', t: '' } : LAB_HARMONICS;
    const r = harmonicOrders(src.ih, src.uh || [], { scr: Number(H.scr), ilRatio: n(H.ilRatio) ?? 1, txKva: n(H.txKva), txZ: n(H.txZ), capKvar: n(H.capKvar) });
    const W = 760, Hh = 230, padL = 34, padB = 34, top = 12, bw = (W - padL - 8) / 49;
    const vmax = Math.max(4, ...r.rows.map((x) => Math.max(x.iL || 0, x.il)));
    const Y = (v) => top + (1 - Math.min(v, vmax) / vmax) * (Hh - top - padB);
    const bars = r.rows.map((x, j) => {
      const X = padL + j * bw, over = x.iRatio != null && x.iRatio > 1;
      return `${x.iL != null ? `<rect x="${X + 1.5}" y="${Y(x.iL)}" width="${bw - 3}" height="${Y(0) - Y(x.iL)}" rx="2" class="${over ? 'hb-over' : 'hb-ok'}"><title>h${x.h} · ${x.f} Hz · ${x.i}% (limit ${x.il}%)</title></rect>` : ''}
        <line x1="${X + 1}" x2="${X + bw - 1}" y1="${Y(x.il)}" y2="${Y(x.il)}" class="hb-lim"/>${x.h % 2 === 1 && (x.h <= 13 || x.h % 6 === 1) ? `<text x="${X + bw / 2}" y="${Hh - padB + 13}" text-anchor="middle" class="hb-x">${x.h}</text>` : ''}`;
    }).join('');
    const yt = [0, vmax / 2, vmax].map((v) => `<text x="${padL - 6}" y="${Y(v) + 4}" text-anchor="end" class="hb-x">${v.toFixed(0)}</text><line x1="${padL}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" class="hb-grid"/>`).join('');
    const famTxt = { six: B('6k±1 ลำดับ 5–13: เรกติไฟเออร์/VFD 6 พัลส์ — แก้ด้วยรีแอกเตอร์ 3–5%, ตัวกรองจูน 5th/7th, APF', '6k±1 orders 5–13: 6-pulse rectifiers / VFDs — 3–5 % reactors, 5th/7th tuned filters, APF'),
      high: B('ลำดับ 17–25: VFD ไม่มีรีแอกเตอร์, active front end, เครื่องกำเนิดฮาร์มอนิก — ตัวกรองพาสซีฟไม่ได้ผล ใช้ APF', 'Orders 17–25: VFDs without reactors, active front ends, harmonic generator — passive filters are ineffective, use an APF'),
      vhigh: B('ลำดับ > 25: การสวิตช์ PWM/อินเวอร์เตอร์ — APF ต้องชดเชยถึงลำดับ 50 และ/หรือฟิลเตอร์ EMC/sine filter', 'Orders > 25: PWM/inverter switching — APF covering up to the 50th and/or EMC / sine filters'),
      triplen: B('ลำดับ 3, 9, 15…: โหลด 1 เฟส (คอม, LED, UPS) — รวมในสาย N, แก้ด้วย APF 4 สาย/ตัวกรองลำดับศูนย์ · คาปาซิเตอร์ detuned ต้องใช้ 14%', 'Triplen 3, 9, 15…: single-phase loads (PCs, LED, UPS) — add up in N; 4-wire APF / zero-sequence filter; detuned capacitors need 14 %'),
      even: B('ลำดับคู่: วงจรเรียงกระแสเสีย/ไม่สมมาตร หรือ DC ไหลในระบบ', 'Even orders: faulty / asymmetric rectifiers or DC in the system') };
    const fams = Object.entries(r.share).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);
    const scrOpts = [[15, '< 20'], [35, '20–50'], [75, '50–100'], [500, '100–1000'], [2000, '> 1000']];
    return `<section class="dg-card"><h4>${L() === 'th' ? 'ต้องแก้ที่ความถี่ไหน — เทียบทุกลำดับกับเกณฑ์' : 'Which frequencies must be fixed — every order vs its limit'}</h4>
      <p class="muted dg-small">${esc(src.where)} ${esc(src.t || '')} · ${L() === 'th' ? 'ลำดับ h = ความถี่ h × 50 Hz · เส้นทอง = เกณฑ์ IEEE 519-2022 (กระแส % ของ IL) · แท่งแดง = เกิน' : 'order h = h × 50 Hz · gold line = IEEE 519-2022 limit (current, % of IL) · red bar = over'}</p>
      <svg viewBox="0 0 ${W} ${Hh}" class="dg-hb">${yt}${bars}<text x="${padL}" y="${Hh - 4}" class="hb-x">${L() === 'th' ? 'ลำดับฮาร์มอนิก →' : 'harmonic order →'}</text></svg>
      <div class="dg-kpis"><div><small>THD-I</small><b>${n2(r.THDI, 1)}%</b><i>${L() === 'th' ? 'จากลำดับ 2–50' : 'orders 2–50'}</i></div>
        <div><small>TDD</small><b style="color:${r.TDD > r.tddLimit ? SC.crit : SC.ok}">${n2(r.TDD, 1)}%</b><i>${L() === 'th' ? 'เกณฑ์' : 'limit'} ${r.tddLimit}% (Isc/IL ${scrOpts.find(([v]) => v === Number(H.scr))?.[1] || ''})</i></div>
        <div><small>${L() === 'th' ? 'ลำดับที่เกิน' : 'Orders over'}</small><b style="color:${r.over.length ? SC.crit : SC.ok}">${r.over.length}</b><i>${r.over.slice(0, 8).map((o) => o.h).join(', ')}${r.over.length > 8 ? '…' : ''}</i></div>
        <div><small>DC</small><b style="color:${r.dcBad ? SC.crit : SC.ok}">${n2(r.dc, 2)}%</b><i>${r.dcBad ? (L() === 'th' ? 'IEEE 519 ไม่อนุญาต DC offset' : 'IEEE 519: no DC offset allowed') : 'OK'}</i></div></div>
      ${r.worst.length ? `<div class="tscroll"><table class="rtable dg-t"><thead><tr><th>h</th><th>${L() === 'th' ? 'ความถี่' : 'Freq.'}</th><th>${L() === 'th' ? 'วัดได้' : 'Measured'} (% IL)</th><th>${L() === 'th' ? 'เกณฑ์' : 'Limit'}</th><th>${L() === 'th' ? 'เกิน' : 'Over'}</th></tr></thead><tbody>
        ${r.worst.map((w) => `<tr><td><b>${w.h}</b></td><td>${w.f} Hz</td><td>${n2(w.iL, 2)}</td><td>${w.il}</td><td style="color:${SC.crit}">×${n2(w.iRatio, 1)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h4 style="margin-top:12px">${L() === 'th' ? 'ฮาร์มอนิกมาจากอะไร และแก้แบบไหน' : 'Where it comes from and how to fix it'}</h4>
      <ul class="dg-fam">${fams.map(([k, v]) => `<li><b>${(v * 100).toFixed(0)}%</b> ${esc(tr(famTxt[k] || B(k, k)))}</li>`).join('')}</ul>
      <p class="dg-small muted">${L() === 'th' ? 'สรุป: ต้องแก้ทุกลำดับที่แท่งเป็นสีแดง (เกินเกณฑ์ของลำดับนั้น) และเมื่อ TDD เกินเกณฑ์รวม — ไม่มีความถี่เดียวที่ตายตัว ในโรงงานทั่วไปตัวหลักคือ 250 Hz (5th) และ 350 Hz (7th) ส่วนเคส Lab ตัวกำเนิดฮาร์มอนิกปล่อยลำดับสูงถึง 1,550–2,450 Hz ด้วย' : 'Fix every red order (above its own limit) and whenever TDD is above the total limit — there is no single frequency. In typical plants the main ones are 250 Hz (5th) and 350 Hz (7th); the Lab generator also produced 1,550–2,450 Hz.'}</p>
      <div class="dg-form"><label>Isc/IL<select data-dgh="scr">${scrOpts.map(([v, l]) => `<option value="${v}" ${Number(H.scr) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>I1 / IL<input data-dgh="ilRatio" value="${esc(H.ilRatio)}" inputmode="decimal" title="I fundamental now ÷ max demand current"></label></div></section>
    <section class="dg-card"><h4>${L() === 'th' ? 'เรโซแนนซ์กับคาปาซิเตอร์ (จะขยายฮาร์มอนิกที่ความถี่ไหน)' : 'Capacitor resonance (which frequency gets amplified)'}</h4>
      <div class="dg-form"><label>${L() === 'th' ? 'หม้อแปลง kVA' : 'Transformer kVA'}<input data-dgh="txKva" value="${esc(H.txKva)}" placeholder="1000" inputmode="decimal"></label><label>Z %<input data-dgh="txZ" value="${esc(H.txZ)}" inputmode="decimal"></label><label>${L() === 'th' ? 'คาปาซิเตอร์ kvar' : 'Capacitor kvar'}<input data-dgh="capKvar" value="${esc(H.capKvar)}" placeholder="300" inputmode="decimal"></label></div>
      ${r.res ? `<div class="au-verdict ${r.res.danger ? 'warn' : 'ok'}">h<sub>r</sub> = √(S<sub>k</sub>/Q<sub>c</sub>) = √(${n2(r.res.Sk, 0)} / ${H.capKvar}) = <b>${n2(r.res.hr, 2)}</b> → <b>${n2(r.res.fr, 0)} Hz</b>. ${r.res.danger ? (L() === 'th' ? `ใกล้ลำดับ ${r.res.near.join(', ') || '5–13'} ที่มีกระแสจริง — คาปาซิเตอร์ธรรมดาจะขยายฮาร์มอนิก (แรงดันเพี้ยน คาปาซิเตอร์ร้อน/ระเบิด) ใช้ detuned 7% (189 Hz) หรือ 14% (134 Hz) ถ้ามีลำดับ 3` : `Close to order ${r.res.near.join(', ') || '5–13'} that is present — a plain capacitor bank amplifies it (distortion, capacitor overheating/burst). Use detuned 7 % (189 Hz), or 14 % (134 Hz) with 3rd harmonic`) : (L() === 'th' ? 'ไม่ตรงกับลำดับที่มีอยู่ — ความเสี่ยงต่ำ' : 'Not on a present order — low risk')}</div>` : `<p class="muted dg-small">${L() === 'th' ? 'ใส่ขนาดหม้อแปลง, Z% (ป้ายหม้อแปลง ~4–6%) และ kvar ของตู้คาปาซิเตอร์' : 'Enter transformer kVA, Z % (nameplate ~4–6 %) and capacitor kvar'}</p>`}</section>
    <section class="dg-card"><h4>${L() === 'th' ? 'วางค่าฮาร์มอนิกของคุณเอง' : 'Paste your own harmonic values'}</h4>
      <p class="muted dg-small">${L() === 'th' ? 'จากหน้า HARMONICS → LIST ของ PW3198 (กระแส %ofFND) เช่น "3:3.1 5:15.5 7:7.2" หรือเรียงตัวเลขลำดับ 0–50 · เว้นว่าง = ใช้ค่าจาก Lab' : 'From the PW3198 HARMONICS → LIST (current %ofFND), e.g. "3:3.1 5:15.5 7:7.2" or 51 numbers (orders 0–50) · empty = Lab values'}</p>
      <textarea data-dgh="paste" rows="3" class="dg-ta">${esc(H.paste || '')}</textarea>
      <div class="dg-row"><button class="btn sm" data-dg="harmapply">✓ ${L() === 'th' ? 'คำนวณ' : 'Analyse'}</button></div></section>`;
  }

  // ---------------------------------------------------------------- fire / short-circuit early warning
  function riskTab() {
    const eng = risk(), O = st.riskOpt, sim = riskSim();
    const act = eng ? [...eng.active.values()] : [], hist = eng ? eng.events.filter((e) => e.end).slice(0, 20) : [];
    const loc = eng ? eng.locate() : null;
    const t = (ms) => new Date(ms).toLocaleTimeString(L() === 'th' ? 'th-TH' : 'en-GB');
    const card = (e) => `<article class="dg-f ${e.sev}"><div class="dg-fh"><span class="dg-sev">${x(e.sev)}</span><span class="dg-pt">📍 ${esc(e.where)}</span><b>${esc(tr(e.title))}</b></div>
      ${e.evidence.length ? `<div class="dg-ev">${e.evidence.map((v) => `<code>${esc(v)}</code>`).join('')}</div>` : ''}
      <details data-dgo="${esc(e.key)}" ${st.open.has(e.key) || e.sev === 'crit' ? 'open' : ''}><summary>${x('cause')} · ${x('todo')}</summary><p><b>${x('cause')}:</b> ${esc(tr(e.cause))}</p><ol>${e.steps.map((s2) => `<li>${esc(tr(s2))}</li>`).join('')}</ol>${e.std ? `<p class="muted">📘 ${esc(e.std)}</p>` : ''}</details>
      <small class="muted">${L() === 'th' ? 'ตั้งแต่' : 'since'} ${t(e.start)}</small></article>`;
    return `<section class="dg-card"><h4>${L() === 'th' ? 'สัญญาณเตือนล่วงหน้า (วิเคราะห์ค่าสดย้อนหลัง 10 นาที)' : 'Early warnings (live values, last 10 minutes)'}</h4>
        ${sim ? `<div class="au-verdict warn">🧪 ${L() === 'th' ? 'กำลังจำลองฝึก' : 'Training scenario'}: <b>${esc(tr(SCENARIOS[sim]))}</b> <button class="btn sm" data-dg="sim" data-arg="">✕ ${L() === 'th' ? 'หยุดจำลอง' : 'stop'}</button></div>` : ''}
        ${loc ? `<div class="au-verdict info">📍 ${esc(tr(loc))}</div>` : ''}
        ${act.length ? `<div class="dg-fs">${act.map(card).join('')}</div>` : `<p class="dg-okmsg">✓ ${L() === 'th' ? 'ยังไม่พบสัญญาณเสี่ยง — ระบบจะเด้งเตือนทันทีที่พบ' : 'No risk signal yet — you get a pop-up the moment one appears'}</p>`}
        ${hist.length ? `<details><summary>${L() === 'th' ? 'ประวัติ' : 'History'} (${hist.length})</summary><div class="tscroll"><table class="rtable"><tbody>${hist.map((e) => `<tr><td>${t(e.start)}</td><td>${esc(e.where)}</td><td>${esc(tr(e.title))}</td><td>${Math.round((e.end - e.start) / 1000)} s</td></tr>`).join('')}</tbody></table></div></details>` : ''}</section>
      <section class="dg-card"><h4>${L() === 'th' ? 'ตั้งค่าที่ระบบต้องรู้' : 'What the system needs to know'}</h4>
        <div class="dg-form"><label>Udin (V)<input data-dgr="udin" value="${esc(O.udin)}" inputmode="decimal"></label>
          ${['MAIN', 'LOAD', 'APF'].map((k) => `<label>${L() === 'th' ? 'เบรกเกอร์' : 'Breaker'} #${POINTS[k].no} ${k} (A)<input data-dgr="rating.${k}" value="${esc(O.rating[k] ?? '')}" placeholder="${k === 'MAIN' ? '20' : ''}" inputmode="decimal"></label>`).join('')}
          <label>CH4<select data-dgr="ch4"><option value="neutral" ${O.ch4 === 'neutral' ? 'selected' : ''}>${L() === 'th' ? 'สายนิวทรัล N' : 'Neutral N'}</option><option value="leak" ${O.ch4 === 'leak' ? 'selected' : ''}>${L() === 'th' ? 'กระแสรั่ว (คล้องรวม/PE)' : 'Leakage (residual / PE)'}</option></select></label></div>
        <div class="dg-row"><button class="btn sm" data-dg="risksave">✓ ${x('save')}</button></div></section>
      <section class="dg-card"><h4>${L() === 'th' ? 'ทดลองเหตุการณ์ (ฝึกดูการเตือน)' : 'Try an event (training)'}</h4><p class="muted dg-small">${L() === 'th' ? 'ใส่ความผิดปกติลงบนข้อมูลปัจจุบันชั่วคราว เพื่อดูว่าระบบเด้งเตือนอย่างไร (ไม่ได้ส่งเข้าเครื่องวัด)' : 'Temporarily adds a fault pattern on top of the current data to see the pop-ups (nothing is sent to the analysers)'}</p>
        <div class="dg-row">${Object.entries(SCENARIOS).map(([k, v]) => `<button class="btn sm ${sim === k ? 'on' : ''}" data-dg="sim" data-arg="${k}">${esc(tr(v))}</button>`).join('')}</div></section>
      <section class="dg-card"><h4>${L() === 'th' ? 'ลัดวงจร/ไฟไหม้เกิดจากอะไร — และระบบเห็นได้แค่ไหน' : 'What causes shorts / fires — and what the system can see'}</h4>
        <div class="dg-buy">${FIRE_GUIDE.map((g) => `<div class="dg-opt"><div class="dg-opt-h"><b>${g.icon} ${esc(tr(g.t))}</b><span class="pill ${g.see === 'yes' ? 'ok' : ''}">${g.see === 'yes' ? (L() === 'th' ? 'ระบบเห็น' : 'seen') : g.see === 'partly' ? (L() === 'th' ? 'เห็นบางส่วน' : 'partly') : (L() === 'th' ? 'ต้องใช้เซนเซอร์เพิ่ม' : 'needs a sensor')}</span></div><p>${esc(tr(g.d))}</p></div>`).join('')}</div>
        <h4 style="margin-top:12px">${L() === 'th' ? 'อุปกรณ์ที่ควรมีเพิ่มเพื่อกันไฟไหม้' : 'Add these to prevent fires'}</h4><ul class="dg-fam">${FIRE_KIT.map((k) => `<li>${esc(tr(k))}</li>`).join('')}</ul></section>`;
  }

  // ---------------------------------------------------------------- learning: concepts + searchable glossary
  function learnTab() {
    const th = L() === 'th', q = st.q.trim().toLowerCase();
    const hit = (t) => !q || [t.k, ...(t.re || []), t.s.th, t.s.en].some((v) => String(v).toLowerCase().includes(q));
    const tri = `<svg viewBox="0 0 300 170" class="dg-ill" data-nogl><line x1="20" y1="150" x2="200" y2="150" stroke="#22C55E" stroke-width="5"/><text x="90" y="166" class="dg-s">P ${th ? '(ทำงานจริง)' : '(real)'}</text>
      <line x1="200" y1="150" x2="200" y2="95" stroke="#38BDF8" stroke-width="5"/><text x="208" y="128" class="dg-s">Q1</text>
      <line x1="200" y1="95" x2="200" y2="40" stroke="#E879F9" stroke-width="5"/><text x="208" y="70" class="dg-s">D</text>
      <line x1="20" y1="150" x2="200" y2="40" stroke="#F3D99A" stroke-width="3" stroke-dasharray="6 4"/><text x="60" y="84" class="dg-s">S ${th ? '(ที่สายต้องรับ)' : '(carried)'}</text>
      <text x="20" y="20" class="dg-s2">S² = P² + Q1² + D² · PF = P/S · DPF = P/S1</text></svg>`;
    const tdd = `<svg viewBox="0 0 320 120" class="dg-ill" data-nogl><text x="0" y="14" class="dg-s2">${th ? 'ตอนโหลดน้อย 20 A (IL = 100 A), ฮาร์มอนิก 6 A' : 'Light load 20 A (IL = 100 A), 6 A of harmonics'}</text>
      <rect x="0" y="26" width="60" height="22" fill="#38BDF8"/><rect x="0" y="26" width="18" height="22" fill="#EF4444"/><text x="68" y="42" class="dg-s">THD-I = 6/20 = 30% ${th ? '(ดูน่ากลัว)' : '(looks bad)'}</text>
      <rect x="0" y="64" width="300" height="22" fill="#1E293B"/><rect x="0" y="64" width="18" height="22" fill="#EF4444"/><text x="24" y="80" class="dg-s">TDD = 6/100 = 6% ${th ? '(ค่าที่ IEEE 519 ใช้)' : '(what IEEE 519 uses)'}</text>
      <text x="0" y="110" class="dg-s2">${th ? 'กระแสฮาร์มอนิกเท่ากัน 6 A — ต่างกันแค่ตัวหาร' : 'Same 6 A of harmonics — only the divisor differs'}</text></svg>`;
    const concepts = [
      [th ? '1 · ทำไม PF ต่ำ แต่ติดคาปาซิเตอร์แล้วไม่หาย' : '1 · Why PF stays low after adding capacitors', tri, th ? 'กระแสที่สายต้องรับ (S) มี 3 ส่วน: P ทำงานจริง, Q1 รีแอกทีฟของมอเตอร์ (คาปาซิเตอร์แก้ได้) และ D จากฮาร์มอนิก (ต้อง APF/ตัวกรอง) เครื่อง Hioki รวม Q1 กับ D ไว้ใน Q ระบบจึงแยกให้ว่าเป็นส่วนไหน — ใน Lab D เป็นส่วนใหญ่ จึงต้องใช้ APF ไม่ใช่คาปาซิเตอร์' : 'The current a cable carries (S) has three parts: P real, Q1 motor reactive (capacitor-fixable) and D from harmonics (needs an APF/filter). Hioki puts Q1 and D together in Q, so the system splits them — in the Lab D dominates, so an APF, not capacitors'],
      [th ? '2 · THD-I กับ TDD ต่างกันอย่างไร' : '2 · THD-I vs TDD', tdd, th ? 'THD-I หารด้วยกระแส "ตอนนี้" จึงสูงเกินจริงตอนโหลดน้อย ส่วน TDD หารด้วยกระแสสูงสุดของโรงงาน (IL) ซึ่ง IEEE 519 ใช้ตัดสิน ถ้าวัดตอนโหลดเต็ม (I1 = IL) ทั้งสองค่าเท่ากัน ในหน้าฮาร์มอนิกใส่ "I1/IL" เพื่อแปลง' : 'THD-I divides by the current NOW, so it is inflated at light load; TDD divides by the plant’s maximum demand current (IL), which IEEE 519 judges. At full load (I1 = IL) they are equal; set "I1/IL" on the harmonics page to convert'],
      [th ? '3 · ลำดับฮาร์มอนิก = ความถี่อะไร มาจากไหน' : '3 · Harmonic orders, frequencies, sources', '', th ? 'h3 150 Hz · h5 250 Hz · h7 350 Hz · h11 550 Hz · h13 650 Hz · h25 1,250 Hz — 5, 7, 11, 13 มาจาก VFD/เรกติไฟเออร์ 6 พัลส์ (พบบ่อยที่สุดในโรงงาน) · 3, 9, 15 มาจากโหลด 1 เฟส (คอม LED UPS) และไปรวมในสายนิวทรัล · ลำดับสูงกว่า 25 มาจากการสวิตช์ของอินเวอร์เตอร์' : 'h3 150 Hz · h5 250 Hz · h7 350 Hz · h11 550 Hz · h13 650 Hz · h25 1,250 Hz — 5, 7, 11, 13 from 6-pulse VFDs/rectifiers (most common) · 3, 9, 15 from single-phase loads (PCs, LED, UPS), adding up in N · above 25 from inverter switching'],
      [th ? '4 · K-factor บอกอะไร' : '4 · What the K-factor tells you', '', th ? 'ความร้อนสูญเสียในหม้อแปลงเพิ่มตามกำลังสองของลำดับ (h²) ฮาร์มอนิกลำดับ 25 จึงทำให้ร้อนกว่าลำดับ 5 ถึง 25 เท่า KF = 1 ไม่มีฮาร์มอนิก, > 4 ต้องใช้หม้อแปลง K-rated หรือลดพิกัด · Lab วัดได้ 38 เพราะเครื่องกำเนิดฮาร์มอนิกปล่อยลำดับสูงมาก' : 'Transformer eddy losses grow with h², so the 25th heats 25× more than the 5th. KF = 1 means none, > 4 needs a K-rated or derated transformer · the Lab read 38 because the generator produced very high orders'],
      [th ? '5 · อ่านหน้าจอ PW3198' : '5 · Reading the PW3198 screen', '', th ? 'Urms แรงดัน · Irms กระแส · P kW · S kVA · Q kvar (ค่าลบ = นำหน้า) · PF (ค่าลบ = นำหน้า) · KF K-factor · WP+/WP− พลังงาน · Uthd-F/Ithd-F = THD เทียบความถี่หลัก · Uunb ไม่สมดุล · Upk ยอดคลื่น · UharmH สัญญาณรบกวน 2–80 kHz · 3P4W/3P3W3M การต่อสาย · Udin แรงดันอ้างอิง' : 'Urms voltage · Irms current · P kW · S kVA · Q kvar (negative = leading) · PF (negative = leading) · KF K-factor · WP+/WP− energy · Uthd-F/Ithd-F = THD vs fundamental · Uunb unbalance · Upk peak · UharmH 2–80 kHz noise · 3P4W/3P3W3M wiring · Udin reference voltage']
    ];
    const cats = Object.keys(CATS);
    return `<section class="dg-card"><h4>${th ? 'เข้าใจใน 5 เรื่อง' : 'Understand it in 5 ideas'}</h4><div class="dg-learn">${concepts.map(([t, svg, d]) => `<details class="dg-lc" ${t.startsWith('1') ? 'open' : ''}><summary>${esc(t)}</summary>${svg}<p>${esc(d)}</p></details>`).join('')}</div></section>
      <section class="dg-card"><h4>${th ? 'คำศัพท์และตัวย่อ' : 'Terms & abbreviations'} <small class="muted">(${TERMS.length})</small></h4>
        <p class="muted dg-small">${th ? 'แตะ/ชี้ตัวย่อที่มีเส้นประใต้ในทุกหน้าเพื่อดูความหมายได้ทันที' : 'Tap / hover any dotted abbreviation on any page for its meaning'}</p>
        <input class="dg-search" data-dgq placeholder="${th ? 'ค้นหา เช่น TDD, PF, ไฟตก' : 'Search e.g. TDD, PF, dip'}" value="${esc(st.q)}" data-nogl>
        ${cats.map((c) => { const list = TERMS.filter((t) => t.c === c && hit(t)); return list.length ? `<h5 class="dg-cat">${esc(tr(CATS[c]))}</h5><div class="dg-terms">${list.map((t) => `<article class="dg-term ${st.focus && st.focus === t.k ? 'focus' : ''}" id="gl-${esc(t.k.replace(/[^\w-]/g, '_'))}" data-nogl>
          <div class="dg-term-h"><b>${esc(t.k)}</b>${t.re && t.re.length ? `<span>${esc(t.re.slice(0, 3).join(' · '))}</span>` : ''}</div><p>${esc(tr(t.s))}</p>
          ${t.f ? `<code>${esc(t.f)}</code>` : ''}${t.ex ? `<p class="dg-ex">🧪 ${esc(tr(t.ex))}</p>` : ''}${t.lim ? `<p class="dg-lim">📘 ${esc(tr(t.lim))}</p>` : ''}</article>`).join('')}</div>` : ''; }).join('')}
      </section>`;
  }

  // ---------------------------------------------------------------- shell
  function render() {
    const tabs = [['learn', '📚 ' + (L() === 'th' ? 'เรียนรู้' : 'Learn')], ['diag', x('tDiag')], ['harm', x('tHarm')], ['risk', x('tRisk')], ['guide', x('tGuide')], ['manual', x('tManual')]];
    el.innerHTML = `<header class="dg-head"><div><h3>${x('title')}</h3><p class="muted">${x('sub')}</p></div>
      <div class="dg-src">${[['lab', x('srcLab')], ['live', x('srcLive')]].map(([k, l]) => `<button class="${st.src === k ? 'on' : ''}" data-dg="src" data-arg="${k}">${l}</button>`).join('')}</div></header>
      <nav class="au-tabs">${tabs.map(([k, l]) => `<button class="au-tab ${st.tab === k ? 'on' : ''}" data-dg="tab" data-arg="${k}">${l}</button>`).join('')}</nav>
      <div class="dg-body">${st.tab === 'learn' ? learnTab() : st.tab === 'diag' ? diagTab() : st.tab === 'harm' ? harmTab() : st.tab === 'risk' ? riskTab() : st.tab === 'guide' ? guideTab() : manualTab()}</div>`;
  }
  el.addEventListener('toggle', (e) => { const d = e.target; if (d instanceof HTMLDetailsElement && d.dataset.dgo) { if (d.open) st.open.add(d.dataset.dgo); else st.open.delete(d.dataset.dgo); } }, true);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dg]'); if (!b) return;
    const k = b.dataset.dg, a = b.dataset.arg;
    if (k === 'tab') st.tab = a;
    else if (k === 'src') { st.src = a; ls.set('coredash.diag.src', a); }
    else if (k === 'step') st.step = Number(a);
    else if (k === 'pt') st.pt = a && st.pt !== a ? a : null;
    else if (k === 'guide') st.guide = Number(a);
    else if (k === 'harmapply') { el.querySelectorAll('[data-dgh]').forEach((i) => { st.harm[i.dataset.dgh] = i.value; }); ls.set('coredash.diag.harm', st.harm); }
    else if (k === 'risksave') {
      el.querySelectorAll('[data-dgr]').forEach((i) => { const [a, b] = i.dataset.dgr.split('.'); if (b) st.riskOpt[a][b] = i.value; else st.riskOpt[a] = i.value; });
      ls.set('coredash.risk.opt', st.riskOpt); onRiskOpts(st.riskOpt);
    }
    else if (k === 'sim') setRiskSim(a || null);
    else if (k === 'mansave') { el.querySelectorAll('[data-dgm]').forEach((i) => { st.man[i.dataset.dgm] = i.type === 'checkbox' ? i.checked : i.value; }); ls.set('coredash.diag.manual', st.man); st.tab = 'diag'; if (st.src === 'lab') st.src = 'live'; }
    else if (k === 'manclear') { st.man = { point: 'APF', running: true, rating: 50 }; ls.set('coredash.diag.manual', st.man); }
    else return;
    render();
  });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-dg="pt"]')) { e.preventDefault(); e.target.closest('[data-dg="pt"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  el.addEventListener('input', (e) => {
    const q = e.target.closest('[data-dgq]'); if (!q) return;
    st.q = q.value; const pos = q.selectionStart; render();
    const n = el.querySelector('[data-dgq]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }
  });
  el.addEventListener('change', (e) => {
    const hh = e.target.closest('[data-dgh]');
    if (hh && hh.dataset.dgh !== 'paste') { st.harm[hh.dataset.dgh] = hh.value; ls.set('coredash.diag.harm', st.harm); render(); return; }
    const i = e.target.closest('[data-dgp]'); if (!i) return;
    const v = Number(i.value); if (!Number.isFinite(v) || v < 0) return;
    const arr = st.prices[i.dataset.dgp].slice(); arr[Number(i.dataset.i)] = v; st.prices[i.dataset.dgp] = arr;
    ls.set('coredash.diag.prices', Object.fromEntries(Object.entries(st.prices).filter(([k]) => Array.isArray(st.prices[k])))); render();
  });
  return {
    el,
    show() { render(); },
    // live data: refresh the diagnosis (not the forms or the guide text while someone is typing)
    refresh() { if ((st.src === 'live' && (st.tab === 'diag' || (st.tab === 'guide' && GUIDE[st.guide].live))) || st.tab === 'risk') { if (!el.contains(document.activeElement) || !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) render(); } },
    openRisk() { st.tab = 'risk'; render(); },
    openLearn(term) {
      st.tab = 'learn'; const t = term ? findTerm(term) : null; st.focus = t ? t.k : ''; st.q = ''; render();
      if (t) setTimeout(() => { const n = el.querySelector('#gl-' + t.k.replace(/[^\w-]/g, '_')); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
      else el.scrollIntoView({ behavior: 'smooth' });
    },
    _state: st
  };
}
