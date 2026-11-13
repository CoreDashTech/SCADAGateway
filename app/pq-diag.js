// CoreDash · "วินิจฉัย & แก้ไข" — smart diagnosis view (uses pq-diagnose.js)
//   • data: live analysers / Lab case 13 Nov 2026 / values typed from a screen (analyser not on LAN, APF HMI)
//   • single-line diagram that colours every measuring point by its worst finding
//   • findings with evidence → cause → what to do → standard
//   • kVA split (real / reactive / harmonic), APF performance, what to buy (sized + budget)
//   • beginner wiring guide with live wiring checks
import { diagnose, LAB_CASE, POINTS, PRICES } from './pq-diagnose.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const B = (th, en) => ({ th, en });
const T = {
  title: B('วินิจฉัยอัจฉริยะ · ชี้จุด · บอกวิธีแก้', 'Smart diagnosis · where · how to fix'),
  sub: B('ตรวจการต่อสาย → วิเคราะห์คุณภาพไฟ → แยก PF รีแอกทีฟ/ฮาร์มอนิก → ประเมิน APF → แนะนำสิ่งที่ต้องซื้อ', 'Check wiring → analyse power quality → split reactive/harmonic PF → judge the APF → what to buy'),
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

export function createDiagView({ lang = () => 'th', snapshot = () => null } = {}) {
  const L = () => (lang() === 'en' ? 'en' : 'th');
  const x = (k) => T[k][L()];
  const tr = (o) => (o ? o[L()] ?? o.th : '');
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const st = { tab: 'diag', src: ls.get('coredash.diag.src', 'lab'), step: 3, pt: null, open: new Set(), man: ls.get('coredash.diag.manual', { point: 'APF', running: true, rating: 50 }), prices: { ...PRICES, ...ls.get('coredash.diag.prices', {}) }, guide: 0 };
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

  // ---------------------------------------------------------------- shell
  function render() {
    const tabs = [['diag', x('tDiag')], ['guide', x('tGuide')], ['manual', x('tManual')]];
    el.innerHTML = `<header class="dg-head"><div><h3>${x('title')}</h3><p class="muted">${x('sub')}</p></div>
      <div class="dg-src">${[['lab', x('srcLab')], ['live', x('srcLive')]].map(([k, l]) => `<button class="${st.src === k ? 'on' : ''}" data-dg="src" data-arg="${k}">${l}</button>`).join('')}</div></header>
      <nav class="au-tabs">${tabs.map(([k, l]) => `<button class="au-tab ${st.tab === k ? 'on' : ''}" data-dg="tab" data-arg="${k}">${l}</button>`).join('')}</nav>
      <div class="dg-body">${st.tab === 'diag' ? diagTab() : st.tab === 'guide' ? guideTab() : manualTab()}</div>`;
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
    else if (k === 'mansave') { el.querySelectorAll('[data-dgm]').forEach((i) => { st.man[i.dataset.dgm] = i.type === 'checkbox' ? i.checked : i.value; }); ls.set('coredash.diag.manual', st.man); st.tab = 'diag'; if (st.src === 'lab') st.src = 'live'; }
    else if (k === 'manclear') { st.man = { point: 'APF', running: true, rating: 50 }; ls.set('coredash.diag.manual', st.man); }
    else return;
    render();
  });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-dg="pt"]')) { e.preventDefault(); e.target.closest('[data-dg="pt"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  el.addEventListener('change', (e) => {
    const i = e.target.closest('[data-dgp]'); if (!i) return;
    const v = Number(i.value); if (!Number.isFinite(v) || v < 0) return;
    const arr = st.prices[i.dataset.dgp].slice(); arr[Number(i.dataset.i)] = v; st.prices[i.dataset.dgp] = arr;
    ls.set('coredash.diag.prices', Object.fromEntries(Object.entries(st.prices).filter(([k]) => Array.isArray(st.prices[k])))); render();
  });
  return {
    el,
    show() { render(); },
    // live data: refresh the diagnosis (not the forms or the guide text while someone is typing)
    refresh() { if (st.src === 'live' && (st.tab === 'diag' || (st.tab === 'guide' && GUIDE[st.guide].live))) render(); },
    _state: st
  };
}
