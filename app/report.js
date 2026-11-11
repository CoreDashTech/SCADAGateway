// CoreDash Nexus — water-meter test report: summary, charts, printable A4 page and Excel (.xlsx) export.
// Developed by CoreDash Technology. No external libraries: the .xlsx is written here (Office Open XML in a ZIP).
import { MODELS, POS_COLORS, flowPoints } from './bench.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = (v) => v.toFixed(1);
const sgn = (e) => `${e >= 0 ? '+' : ''}${e.toFixed(2)}`;
const fmtQ = (q) => (q >= 1000 ? (q / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' m³/h' : (Math.round(q * 100) / 100) + ' L/h');
const ORDER = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

export const RT = {
  th: {
    title: 'รายงานผลการทดสอบมาตรวัดน้ำ', sub: 'วิธีปริมาตร (ถังตวง) · ISO 4064-2 / OIML R 49-2', docNo: 'เลขที่รายงาน', date: 'วันที่ทดสอบ', site: 'สถานที่', bench: 'แท่นทดสอบ', operator: 'ผู้ทดสอบ',
    model: 'รุ่นมาตร', kind: 'ชนิด', size: 'ขนาด', rating: 'พิกัด', points: 'อัตราไหลทดสอบ', temp: 'อุณหภูมิน้ำเฉลี่ย', tanks: 'ถังตวงอ้างอิง', mpe: 'เกณฑ์ (MPE)', mpeText: 'Q1 ≤ Q < Q2 : ±5 % · Q2 ≤ Q ≤ Q4 : ±2 %',
    verdict: 'สรุปผลรายเครื่อง', pass: 'ผ่าน', fail: 'ไม่ผ่าน', passAll: 'ผ่านทุกจุด', failSome: 'ไม่ผ่าน', ptsPassed: 'จุดที่ผ่าน', maxErr: 'ค่าผิดพลาดสูงสุด',
    kMeters: 'มาตรที่ทดสอบ', kPoints: 'จุดทดสอบ', kPass: 'อัตราผ่าน', kWater: 'น้ำที่ใช้', kTime: 'เวลาทดสอบรวม',
    chartCurve: 'กราฟค่าผิดพลาดเทียบเกณฑ์', chartBar: 'ค่าผิดพลาดแต่ละจุด', detail: 'ข้อมูลการทดสอบรายจุด',
    cPos: 'ตำแหน่ง', cSn: 'หมายเลขเครื่อง', cPt: 'จุด', cQ: 'อัตราไหล', cStart: 'ค่าเริ่มต้น (L)', cEnd: 'ค่าสิ้นสุด (L)', cVm: 'มาตรวัดได้ (L)', cVref: 'ถังตวง (L)', cT: '°C', cE: 'ผิดพลาด (%)', cMpe: 'เกณฑ์ (%)', cRes: 'ผล', cTime: 'เวลา', cTank: 'ถัง', cModel: 'รุ่น',
    note: 'หมายเหตุ: ปริมาตรอ้างอิงอ่านจากสเกลคอถังตวง แก้ค่าเป็น 20 °C · ค่าผิดพลาด = (มาตรวัดได้ − ถังตวง) ÷ ถังตวง × 100 · ค่าเริ่มต้นและค่าสิ้นสุดอ่านจากหน้าปัดมาตรขณะน้ำหยุดนิ่ง',
    sim: 'ข้อมูลจำลองเพื่อการสาธิต', tester: 'ผู้ทดสอบ', checker: 'ผู้ตรวจสอบ', approver: 'ผู้อนุมัติ', devBy: 'พัฒนาโดย', page: 'หน้า',
    xSummary: 'สรุป', xResults: 'ผลรายจุด', xChart: 'ข้อมูลกราฟ', upper: 'เกณฑ์บน', lower: 'เกณฑ์ล่าง', flowAxis: 'อัตราไหล (L/h)', errAxis: 'ค่าผิดพลาด (%)'
  },
  en: {
    title: 'Water-meter test report', sub: 'Volumetric method (proving tank) · ISO 4064-2 / OIML R 49-2', docNo: 'Report no.', date: 'Test date', site: 'Site', bench: 'Test bench', operator: 'Tested by',
    model: 'Meter model', kind: 'Type', size: 'Size', rating: 'Rating', points: 'Test flow rates', temp: 'Mean water temp.', tanks: 'Reference tanks', mpe: 'MPE', mpeText: 'Q1 ≤ Q < Q2 : ±5 % · Q2 ≤ Q ≤ Q4 : ±2 %',
    verdict: 'Verdict per meter', pass: 'PASS', fail: 'FAIL', passAll: 'Passed all points', failSome: 'Failed', ptsPassed: 'Points passed', maxErr: 'Largest error',
    kMeters: 'Meters tested', kPoints: 'Test points', kPass: 'Pass rate', kWater: 'Water used', kTime: 'Total test time',
    chartCurve: 'Error curve against MPE', chartBar: 'Error at each point', detail: 'Point-by-point data',
    cPos: 'Pos.', cSn: 'Serial no.', cPt: 'Point', cQ: 'Flow', cStart: 'Start (L)', cEnd: 'End (L)', cVm: 'Meter vol. (L)', cVref: 'Tank vol. (L)', cT: '°C', cE: 'Error (%)', cMpe: 'MPE (%)', cRes: 'Result', cTime: 'Time', cTank: 'Tank', cModel: 'Model',
    note: 'Note: reference volume read on the proving-tank neck scale, corrected to 20 °C · Error = (meter − tank) ÷ tank × 100 · Start and end readings taken from the meter dial with the water at rest.',
    sim: 'Simulated data for demonstration', tester: 'Tested by', checker: 'Checked by', approver: 'Approved by', devBy: 'Developed by', page: 'Page',
    xSummary: 'Summary', xResults: 'Results', xChart: 'Chart data', upper: 'Upper MPE', lower: 'Lower MPE', flowAxis: 'Flow (L/h)', errAxis: 'Error (%)'
  }
};

// ---------------------------------------------------------------- summary
export function summarize(results) {
  const rows = results.slice().sort((a, b) => a.meter.localeCompare(b.meter) || ORDER[a.key] - ORDER[b.key] || a.ts - b.ts);
  const meters = {};
  for (const r of rows) {
    const m = meters[r.meter] || (meters[r.meter] = { id: r.meter, serial: r.serial, model: r.model, rows: [], pass: true, maxAbs: 0, maxE: 0 });
    m.rows.push(r); if (!r.pass) m.pass = false;
    if (Math.abs(r.e) >= m.maxAbs) { m.maxAbs = Math.abs(r.e); m.maxE = r.e; }
  }
  const list = Object.values(meters);
  const runs = {}; for (const r of rows) runs[r.key + '@' + Math.round(r.ts / 60000)] = r;
  const water = Object.values(runs).reduce((s, r) => s + r.vref, 0);
  const time = Object.values(runs).reduce((s, r) => s + (r.dur || 0), 0);
  const first = rows[0] || {};
  const temps = rows.map((r) => r.temp).filter((v) => v != null);
  return {
    rows, meters: list, nPass: rows.filter((r) => r.pass).length, nRows: rows.length,
    keys: [...new Set(rows.map((r) => r.key))].sort((a, b) => ORDER[a] - ORDER[b]),
    water, time, model: first.model, q3: first.q3 ?? 2.5, R: first.R ?? 160,
    temp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    t0: rows.length ? Math.min(...rows.map((r) => r.ts)) : Date.now(), allPass: list.every((m) => m.pass)
  };
}

// ---------------------------------------------------------------- charts (SVG strings)
export function curveChart(results, pts, opt = {}) {
  const light = !!opt.light, ink = light ? '#334155' : '#8B97B3', grid = light ? '#E2E8F0' : '#1C2850', zero = light ? '#94A3B8' : '#5F6B86';
  const W = 640, H = 290, L = 48, Rr = 24, T = 14, Bm = 62;
  const lx = (Q) => L + (Math.log10(Q) - Math.log10(pts.Q1 * 0.8)) / (Math.log10(pts.Q4 * 1.15) - Math.log10(pts.Q1 * 0.8)) * (W - L - Rr);
  const lim = Math.max(6, Math.ceil(Math.max(0, ...results.map((r) => Math.abs(r.e))) + 1));
  const ly = (e) => T + (lim - Math.max(-lim, Math.min(lim, e))) / (2 * lim) * (H - T - Bm);
  const env = (sg) => `M${f1(lx(pts.Q1))},${f1(ly(sg * 5))} L${f1(lx(pts.Q2))},${f1(ly(sg * 5))} L${f1(lx(pts.Q2))},${f1(ly(sg * 2))} L${f1(lx(pts.Q4))},${f1(ly(sg * 2))}`;
  const band = `M${f1(lx(pts.Q1))},${f1(ly(5))} L${f1(lx(pts.Q2))},${f1(ly(5))} L${f1(lx(pts.Q2))},${f1(ly(2))} L${f1(lx(pts.Q4))},${f1(ly(2))} L${f1(lx(pts.Q4))},${f1(ly(-2))} L${f1(lx(pts.Q2))},${f1(ly(-2))} L${f1(lx(pts.Q2))},${f1(ly(-5))} L${f1(lx(pts.Q1))},${f1(ly(-5))} Z`;
  const step = lim > 8 ? 4 : 2, yt = []; for (let e = -lim + (lim % step); e <= lim; e += step) yt.push(e);
  const ticks = yt.map((e) => `<line x1="${L}" x2="${W - Rr}" y1="${f1(ly(e))}" y2="${f1(ly(e))}" stroke="${e === 0 ? zero : grid}" stroke-width="1"/><text x="${L - 8}" y="${f1(ly(e) + 4)}" font-size="11" fill="${ink}" text-anchor="end">${e > 0 ? '+' : ''}${e}%</text>`).join('');
  const qs = [['Q1', pts.Q1], ['Q2', pts.Q2], ['Q3', pts.Q3], ['Q4', pts.Q4]].map(([k, q]) => `<line x1="${f1(lx(q))}" x2="${f1(lx(q))}" y1="${T}" y2="${H - Bm}" stroke="${grid}" stroke-dasharray="3 4"/><text x="${f1(lx(q))}" y="${H - Bm + 16}" font-size="11" font-weight="700" fill="${ink}" text-anchor="middle">${k}</text><text x="${f1(lx(q))}" y="${H - Bm + (k === 'Q4' ? 43 : 30)}" font-size="10" fill="${ink}" opacity="0.8" text-anchor="${k === 'Q4' || k === 'Q3' ? 'end' : 'middle'}">${fmtQ(q)}</text>`).join('');
  const series = Object.keys(POS_COLORS).map((id) => {
    const r = results.filter((x) => x.meter === id).sort((a, b) => a.Q - b.Q);
    if (!r.length) return '';
    const c = POS_COLORS[id];
    return `<polyline points="${r.map((x) => `${f1(lx(x.Q))},${f1(ly(x.e))}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.4"/>${r.map((x) => `<circle cx="${f1(lx(x.Q))}" cy="${f1(ly(x.e))}" r="5.5" fill="${x.pass ? c : '#DC2626'}" stroke="${light ? '#FFFFFF' : '#0B1430'}" stroke-width="1.5"><title>${id} ${x.key}: ${sgn(x.e)} %</title></circle>`).join('')}`;
  }).join('');
  const legend = Object.keys(POS_COLORS).filter((id) => results.some((r) => r.meter === id)).map((id, i) => `<g transform="translate(${L + 8 + i * 70},${H - 8})"><rect width="14" height="4" y="-5" rx="2" fill="${POS_COLORS[id]}"/><text x="19" y="0" font-size="11" fill="${ink}">${id}</text></g>`).join('')
    + `<g transform="translate(${L + 230},${H - 8})"><line x1="0" x2="16" y1="-3" y2="-3" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5 3"/><text x="21" y="0" font-size="11" fill="${ink}">MPE</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="error curve" class="err-chart" font-family="'IBM Plex Sans Thai','Space Grotesk',sans-serif"><path d="${band}" fill="#16A34A" opacity="${light ? 0.07 : 0.1}"/>${ticks}${qs}<path d="${env(1)}" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 4"/><path d="${env(-1)}" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 4"/>${series}${legend}</svg>`;
}

export function barChart(results, opt = {}) {
  const light = !!opt.light, ink = light ? '#334155' : '#8B97B3', grid = light ? '#E2E8F0' : '#1C2850';
  const keys = [...new Set(results.map((r) => r.key))].sort((a, b) => ORDER[a] - ORDER[b]);
  const ids = Object.keys(POS_COLORS).filter((id) => results.some((r) => r.meter === id));
  const W = 640, H = 280, L = 48, Rr = 14, T = 18, Bm = 40;
  const lim = Math.max(6, Math.ceil(Math.max(0, ...results.map((r) => Math.abs(r.e))) + 1));
  const ly = (e) => T + (lim - Math.max(-lim, Math.min(lim, e))) / (2 * lim) * (H - T - Bm);
  const gw = (W - L - Rr) / Math.max(1, keys.length), bw = Math.min(46, (gw - 30) / Math.max(1, ids.length));
  const step = lim > 8 ? 4 : 2, yt = []; for (let e = -lim + (lim % step); e <= lim; e += step) yt.push(e);
  const ticks = yt.map((e) => `<line x1="${L}" x2="${W - Rr}" y1="${f1(ly(e))}" y2="${f1(ly(e))}" stroke="${e === 0 ? (light ? '#94A3B8' : '#5F6B86') : grid}"/><text x="${L - 8}" y="${f1(ly(e) + 4)}" font-size="11" fill="${ink}" text-anchor="end">${e > 0 ? '+' : ''}${e}%</text>`).join('');
  const groups = keys.map((k, gi) => {
    const x0 = L + gi * gw + (gw - bw * ids.length) / 2, mpe = k === 'Q1' ? 5 : 2;
    const lines = [mpe, -mpe].map((m) => `<line x1="${f1(L + gi * gw + 8)}" x2="${f1(L + (gi + 1) * gw - 8)}" y1="${f1(ly(m))}" y2="${f1(ly(m))}" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 4"/>`).join('');
    const bars = ids.map((id, i) => {
      const r = results.filter((x) => x.meter === id && x.key === k).pop(); if (!r) return '';
      const y = ly(Math.max(0, r.e)), h = Math.abs(ly(r.e) - ly(0)), x = x0 + i * bw;
      return `<rect x="${f1(x + 3)}" y="${f1(y)}" width="${f1(bw - 6)}" height="${f1(Math.max(1, h))}" rx="3" fill="${r.pass ? POS_COLORS[id] : '#DC2626'}"/><text x="${f1(x + bw / 2)}" y="${f1(r.e >= 0 ? y - 4 : y + h + 11)}" font-size="10" font-weight="700" fill="${ink}" text-anchor="middle">${sgn(r.e)}</text>`;
    }).join('');
    return `${lines}${bars}<text x="${f1(L + gi * gw + gw / 2)}" y="${H - Bm + 18}" font-size="12" font-weight="700" fill="${ink}" text-anchor="middle">${k}</text>`;
  }).join('');
  const legend = ids.map((id, i) => `<g transform="translate(${L + 8 + i * 70},${H - 6})"><rect width="12" height="10" y="-9" rx="2" fill="${POS_COLORS[id]}"/><text x="17" y="0" font-size="11" fill="${ink}">${id}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="error by point" class="err-chart" font-family="'IBM Plex Sans Thai','Space Grotesk',sans-serif">${ticks}${groups}${legend}</svg>`;
}

// ---------------------------------------------------------------- A4 report page (HTML string)
export function docNumber(t0) { const d = new Date(t0); const p = (n) => String(n).padStart(2, '0'); return `CD-WM-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

export function reportHTML(results, meta, lang, badge) {
  const x = RT[lang] || RT.th, S = summarize(results), pts = flowPoints(S.q3, S.R), M = MODELS[S.model] || {};
  const dt = new Date(S.t0).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const info = [
    [x.docNo, docNumber(S.t0)], [x.date, dt], [x.site, meta.site], [x.bench, meta.bench], [x.operator, meta.operator],
    [x.model, `${S.model || '—'}${M.kind ? ' · ' + M.kind[lang] : ''}`], [x.size, 'DN15 · Class 2'], [x.rating, `Q3 = ${S.q3} m³/h · R${S.R}`],
    [x.points, `Q1 ${fmtQ(pts.Q1)} · Q2 ${fmtQ(pts.Q2)} · Q3 ${fmtQ(pts.Q3)} · Q4 ${fmtQ(pts.Q4)}`], [x.temp, S.temp != null ? S.temp.toFixed(1) + ' °C' : '—'],
    [x.tanks, 'TK-20 (10 L) · TK-200 (100 / 200 L)'], [x.mpe, x.mpeText]
  ].map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('');
  const tiles = S.meters.map((m) => `<div class="rp-tile ${m.pass ? 'ok' : 'ng'}"><div class="rp-tl"><b>${m.id}</b><span>SN ${esc(m.serial)}</span></div><div class="rp-vd">${m.pass ? '✓ ' + x.pass : '✕ ' + x.fail}</div><div class="rp-tm">${x.ptsPassed} ${m.rows.filter((r) => r.pass).length}/${m.rows.length} · ${x.maxErr} ${sgn(m.maxE)} %</div></div>`).join('');
  const kpi = [[x.kMeters, S.meters.length], [x.kPoints, S.keys.join(' · ') || '—'], [x.kPass, `${S.nPass}/${S.nRows}`], [x.kWater, S.water.toFixed(1) + ' L'], [x.kTime, Math.round(S.time / 60) + ' min']]
    .map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('');
  const rows = S.rows.map((r) => `<tr><td><b style="color:${POS_COLORS[r.meter]}">${r.meter}</b></td><td>${esc(r.serial)}</td><td><b>${r.key}</b></td><td>${fmtQ(r.Q)}</td><td>${r.start.toFixed(2)}</td><td>${r.end.toFixed(2)}</td><td>${r.vm.toFixed(2)}</td><td>${r.vref.toFixed(3)}</td><td>${r.temp != null ? r.temp.toFixed(1) : '—'}</td><td class="${r.pass ? 'ok' : 'ng'}"><b>${sgn(r.e)}</b></td><td>±${r.mpe}</td><td><span class="rp-pill ${r.pass ? 'ok' : 'ng'}">${r.pass ? x.pass : x.fail}</span></td></tr>`).join('');
  return `<div class="rp-page">
    <header class="rp-head">${badge || ''}<div class="rp-ht"><h1>${x.title}</h1><p>${x.sub}</p></div><div class="rp-overall ${S.allPass ? 'ok' : 'ng'}">${S.allPass ? '✓ ' + x.pass : '✕ ' + x.fail}<small>${S.nPass}/${S.nRows}</small></div></header>
    <section class="rp-info">${info}</section>
    <h2>${x.verdict}</h2><section class="rp-tiles">${tiles}</section>
    <section class="rp-kpi">${kpi}</section>
    <section class="rp-charts"><div><h3>${x.chartCurve}</h3>${curveChart(S.rows, pts, { light: true })}</div><div><h3>${x.chartBar}</h3>${barChart(S.rows, { light: true })}</div></section>
    <h2>${x.detail}</h2>
    <table class="rp-table"><thead><tr><th>${x.cPos}</th><th>${x.cSn}</th><th>${x.cPt}</th><th>${x.cQ}</th><th>${x.cStart}</th><th>${x.cEnd}</th><th>${x.cVm}</th><th>${x.cVref}</th><th>${x.cT}</th><th>${x.cE}</th><th>${x.cMpe}</th><th>${x.cRes}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="rp-note">${x.note}${meta.simulated ? ' · ' + x.sim : ''}</p>
    <section class="rp-sign">${[x.tester, x.checker, x.approver].map((s) => `<div><span></span><b>${s}</b><small>(......................................)</small><small>${lang === 'th' ? 'วันที่' : 'Date'} ....../....../......</small></div>`).join('')}</section>
    <footer class="rp-foot"><span>${x.devBy} <b>CoreDash Technology</b> · CoreDash Nexus</span><span>${docNumber(S.t0)}</span></footer>
  </div>`;
}

// ---------------------------------------------------------------- Excel (.xlsx) writer
const xe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (n) => { let s = ''; n += 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const excelDate = (ms) => ms / 86400000 + 25569 - new Date(ms).getTimezoneOffset() / 1440;

// cell: { v, s (style), f (formula), t: 'n'|'s'|'d' }
function sheetXml(rows, { widths = [], merges = [], freeze = null, drawing = false } = {}) {
  const out = rows.map((cells, ri) => `<row r="${ri + 1}"${cells && cells.ht ? ` ht="${cells.ht}" customHeight="1"` : ''}>${(cells || []).map((c, ci) => {
    if (c == null) return '';
    const ref = col(ci) + (ri + 1), s = c.s ? ` s="${c.s}"` : '';
    if (c.f != null) {
      const isStr = typeof c.v === 'string';
      return `<c r="${ref}"${s}${isStr ? ' t="str"' : ''}><f>${xe(c.f)}</f>${c.v != null ? `<v>${xe(c.v)}</v>` : ''}</c>`;
    }
    if (typeof c.v === 'number') return `<c r="${ref}"${s}><v>${Number.isFinite(c.v) ? c.v : 0}</v></c>`;
    if (c.v == null || c.v === '') return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xe(c.v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const pane = freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const mg = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${out}</sheetData>${mg}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${drawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="0.000"/><numFmt numFmtId="166" formatCode="+0.00;-0.00;0.00"/><numFmt numFmtId="167" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="7"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><b/><sz val="18"/><color rgb="FF0B1430"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FF0B1430"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FF15803D"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="Tahoma"/></font><font><sz val="10"/><color rgb="FF64748B"/><name val="Tahoma"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F5FFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2A22"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const ST = { head: 1, txt: 2, n2: 3, n3: 4, pct: 5, pass: 6, fail: 7, title: 8, label: 9, date: 10, note: 11, ctr: 12 };

function chartXml(x, series, mpe) {
  const num = (ref, vals) => `<c:numRef><c:f>${xe(ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
  const ser = (i, name, color, xs, ys, dash) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xe(name)}</c:v></c:tx>
    <c:spPr><a:ln w="${dash ? 22225 : 28575}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}</a:ln></c:spPr>
    <c:marker>${dash ? '<c:symbol val="none"/>' : `<c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>`}</c:marker>
    <c:xVal>${num(xs.ref, xs.vals)}</c:xVal><c:yVal>${num(ys.ref, ys.vals)}</c:yVal><c:smooth val="0"/></c:ser>`;
  const all = [...series.map((s, i) => ser(i, s.name, s.color, s.x, s.y, false)), ser(series.length, x.upper, 'F59E0B', mpe.x, mpe.up, true), ser(series.length + 1, x.lower, 'F59E0B', mpe.x, mpe.lo, true)];
  const title = (t, sz = 1400) => `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="${sz}" b="1"/></a:pPr><a:r><a:rPr lang="th-TH" sz="${sz}" b="1"/><a:t>${xe(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/><c:chart>${title(x.chartCurve)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>
<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${all.join('')}<c:axId val="5001"/><c:axId val="5002"/></c:scatterChart>
<c:valAx><c:axId val="5001"/><c:scaling><c:logBase val="10"/><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${title(x.flowAxis, 1000)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln><a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill></a:ln></c:spPr><c:crossAx val="5002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>
<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/><c:max val="${mpe.lim}"/><c:min val="${-mpe.lim}"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>${title(x.errAxis, 1000)}<c:numFmt formatCode="+0;-0;0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/><c:majorUnit val="2"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

export function buildXlsx(results, meta, lang) {
  const x = RT[lang] || RT.th, S = summarize(results), pts = flowPoints(S.q3, S.R), M = MODELS[S.model] || {};
  const T = (v, s = ST.txt) => ({ v, s }), N = (v, s = ST.n2) => ({ v, s });
  const sh1 = x.xSummary, sh2 = x.xResults, sh3 = x.xChart, q = (n) => `'${n}'`;
  // --- results sheet
  const head = [x.cTime, x.cPos, x.cSn, x.cModel, x.cPt, x.cQ + ' (L/h)', x.cTank, x.cStart, x.cEnd, x.cVm, x.cVref, x.cT, x.cE, x.cMpe, x.cRes];
  const r2 = [[T(`${x.title} — ${x.detail}`, ST.title)], [T(`${x.docNo} ${docNumber(S.t0)} · ${S.model} · Q3 ${S.q3} m³/h · R${S.R}`, ST.note)], [], head.map((h) => T(h, ST.head))];
  r2[3].ht = 34;
  S.rows.forEach((r, i) => {
    const n = 5 + i;
    r2.push([N(excelDate(r.ts), ST.date), T(r.meter, ST.ctr), T(r.serial), T(r.model), T(r.key, ST.ctr), N(Math.round(r.Q * 100) / 100), T(r.tank, ST.ctr), N(r.start), N(r.end),
      { f: `I${n}-H${n}`, v: +(r.end - r.start).toFixed(4), s: ST.n2 }, N(+r.vref.toFixed(4), ST.n3), N(r.temp != null ? +r.temp.toFixed(1) : 0),
      { f: `(J${n}-K${n})/K${n}*100`, v: +r.e.toFixed(4), s: ST.pct }, N(r.mpe), { f: `IF(ABS(M${n})<=N${n},"${x.pass}","${x.fail}")`, v: r.pass ? x.pass : x.fail, s: r.pass ? ST.pass : ST.fail }]);
  });
  // --- chart data sheet
  const ids = Object.keys(POS_COLORS).filter((id) => S.rows.some((r) => r.meter === id));
  const r3 = [[T(x.chartCurve, ST.label)], [T(x.cPos, ST.head), T(x.cPt, ST.head), T(x.cQ + ' (L/h)', ST.head), T(x.cE, ST.head)]];
  const series = [];
  for (const id of ids) {
    const rs = S.rows.filter((r) => r.meter === id).sort((a, b) => a.Q - b.Q), from = r3.length + 1;
    for (const r of rs) r3.push([T(id, ST.ctr), T(r.key, ST.ctr), N(Math.round(r.Q * 100) / 100), N(+r.e.toFixed(3), ST.pct)]);
    const to = r3.length;
    series.push({ name: `${id} · ${rs[0].serial}`, color: POS_COLORS[id].slice(1), x: { ref: `${q(sh3)}!$C$${from}:$C$${to}`, vals: rs.map((r) => Math.round(r.Q * 100) / 100) }, y: { ref: `${q(sh3)}!$D$${from}:$D$${to}`, vals: rs.map((r) => +r.e.toFixed(3)) } });
  }
  r3.push([]);
  const mStart = r3.length + 3;
  r3.push([T('MPE', ST.label)], [T(x.cQ + ' (L/h)', ST.head), T(x.upper, ST.head), T(x.lower, ST.head)]);
  const env = [[pts.Q1, 5], [pts.Q2 * 0.9999, 5], [pts.Q2, 2], [pts.Q4, 2]];
  for (const [Q, m] of env) r3.push([N(+Q.toFixed(3)), N(m, ST.pct), N(-m, ST.pct)]);
  const mEnd = r3.length;
  const lim = Math.max(6, Math.ceil(Math.max(0, ...S.rows.map((r) => Math.abs(r.e))) + 1));
  const mpe = { lim: lim % 2 ? lim + 1 : lim, x: { ref: `${q(sh3)}!$A$${mStart}:$A$${mEnd}`, vals: env.map((e) => +e[0].toFixed(3)) }, up: { ref: `${q(sh3)}!$B$${mStart}:$B$${mEnd}`, vals: env.map((e) => e[1]) }, lo: { ref: `${q(sh3)}!$C$${mStart}:$C$${mEnd}`, vals: env.map((e) => -e[1]) } };
  // --- summary sheet
  const r1 = [[T(x.title, ST.title)], [T(x.sub, ST.note)], []];
  r1[0].ht = 30;
  const infoRows = [[x.docNo, docNumber(S.t0)], [x.date, new Date(S.t0).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')], [x.site, meta.site], [x.bench, meta.bench], [x.operator, meta.operator],
    [x.model, `${S.model}${M.kind ? ' · ' + M.kind[lang] : ''}`], [x.rating, `DN15 · Q3 = ${S.q3} m³/h · R${S.R} · Class 2`], [x.points, `Q1 ${fmtQ(pts.Q1)} · Q2 ${fmtQ(pts.Q2)} · Q3 ${fmtQ(pts.Q3)} · Q4 ${fmtQ(pts.Q4)}`],
    [x.temp, S.temp != null ? S.temp.toFixed(1) + ' °C' : '—'], [x.mpe, x.mpeText]];
  for (const [k, v] of infoRows) r1.push([T(k, ST.label), T(v), null, null, null, null]);
  r1.push([]);
  const vh = r1.length + 1;
  r1.push([x.cPos, x.cSn, x.cModel, x.ptsPassed, x.maxErr + ' (%)', x.cRes].map((h) => T(h, ST.head)));
  for (const m of S.meters) {
    const n = m.rows.length, ok = m.rows.filter((r) => r.pass).length;
    r1.push([T(m.id, ST.ctr), T(m.serial), T(m.model), T(`${ok}/${n}`, ST.ctr), N(+m.maxE.toFixed(3), ST.pct), T(m.pass ? x.pass : x.fail, m.pass ? ST.pass : ST.fail)]);
  }
  r1.push([], [T(`${x.kPass}: ${S.nPass}/${S.nRows} · ${x.kWater}: ${S.water.toFixed(1)} L · ${x.kTime}: ${Math.round(S.time / 60)} min`, ST.label)]);
  const chartRow = r1.length + 1;
  r1.push([]);
  const merges1 = ['A1:F1', 'A2:F2', ...infoRows.map((_, i) => `B${4 + i}:F${4 + i}`)];
  for (let i = 0; i < r1.length; i++) if (i >= vh) { /* no merges in table */ }
  const sum = sheetXml(r1, { widths: [22, 22, 20, 16, 20, 16], merges: merges1, drawing: true });
  const res = sheetXml(r2, { widths: [17, 7, 16, 14, 7, 12, 9, 12, 12, 13, 13, 7, 11, 9, 10], merges: ['A1:O1', 'A2:O2'], freeze: 4 });
  const dat = sheetXml(r3, { widths: [16, 12, 16, 14] });
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chartRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chartRow + 22}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="ErrorCurve"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(x.title)}</dc:title><dc:creator>CoreDash Nexus</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CoreDash Nexus</Application><Company>CoreDash Technology</Company></Properties>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${xe(sh1)}" sheetId="1" r:id="rId1"/><sheet name="${xe(sh2)}" sheetId="2" r:id="rId2"/><sheet name="${xe(sh3)}" sheetId="3" r:id="rId3"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': sum,
    'xl/worksheets/sheet2.xml': res,
    'xl/worksheets/sheet3.xml': dat,
    'xl/worksheets/_rels/sheet1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
    'xl/drawings/drawing1.xml': drawing,
    'xl/drawings/_rels/drawing1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`,
    'xl/charts/chart1.xml': chartXml(x, series, mpe)
  };
  return zip(files);
}

// ---------------------------------------------------------------- minimal ZIP (stored, no compression)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, text] of Object.entries(files)) {
    const nb = enc.encode(name), data = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dosT, true); h.setUint16(12, dosD, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dosT, true); c.setUint16(14, dosD, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cSize = central.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true); e.setUint32(12, cSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}
