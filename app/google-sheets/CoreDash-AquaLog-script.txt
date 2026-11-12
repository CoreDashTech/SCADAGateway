/**
 * CoreDash AquaLog — บันทึกค่ามาตรวัดน้ำจากแอป CoreDash Nexus ลง Google Sheets
 * Developed by CoreDash Technology
 *
 * วิธีติดตั้ง (ทำครั้งเดียว ~3 นาที):
 *  1. สร้าง Google Sheet ใหม่ ตั้งชื่อ "CoreDash AquaLog – บันทึกมาตรน้ำ"
 *  2. เมนู ส่วนขยาย → Apps Script → ลบโค้ดเดิม วางไฟล์นี้ทั้งหมด → บันทึก
 *  3. แก้ API_KEY ด้านล่างเป็นรหัสลับของคุณเอง (อย่างน้อย 8 ตัวอักษร)
 *  4. เลือกฟังก์ชัน setup → กด ▶ เรียกใช้ → อนุญาตสิทธิ์ (ครั้งแรก)
 *     ระบบจะสร้างแผ่นงาน "บันทึกมาตร", "สรุปรายเดือน", "แดชบอร์ด" พร้อมกราฟ
 *  5. ทำให้ใช้งานได้ (Deploy) → การทำให้ใช้งานได้รายการใหม่ → ประเภท "เว็บแอป"
 *     เรียกใช้ในฐานะ: ฉัน · ผู้มีสิทธิ์เข้าถึง: ทุกคน → ทำให้ใช้งานได้ → คัดลอก URL (ลงท้าย /exec)
 *  6. ในแอป: บ้านพักอาศัย → มาตรน้ำ → Google Sheets → วาง URL และรหัสลับ → ทดสอบการเชื่อมต่อ
 */
const API_KEY = 'เปลี่ยนเป็นรหัสลับของคุณ';
const LOG = 'บันทึกมาตร';
const MONTH = 'สรุปรายเดือน';
const DASH = 'แดชบอร์ด';
const HEAD = ['รหัสรายการ', 'วันเวลา', 'วันที่', 'เวลา', 'สถานที่', 'รุ่นมาตร', 'หมายเลขมาตร', 'ค่ามาตร (m³)', 'ค่ามาตร (ลิตร)',
  'ใช้ไป (m³)', 'ช่วงเวลา (วัน)', 'เฉลี่ย (ลิตร/วัน)', 'ค่าน้ำโดยประมาณ (บาท)', 'วิธีอ่าน', 'ความมั่นใจต่ำสุด (%)', 'แก้ตัวเลขเอง', 'อุปกรณ์', 'หมายเหตุ', 'รับเข้าเมื่อ'];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Bangkok');
  // --- log sheet
  const log = ss.getSheetByName(LOG) || ss.insertSheet(LOG, 0);
  log.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0B3954').setWrap(true).setVerticalAlignment('middle');
  log.setFrozenRows(1); log.setRowHeight(1, 42);
  log.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
  log.getRange('C:C').setNumberFormat('yyyy-mm-dd');
  log.getRange('D:D').setNumberFormat('hh:mm');
  log.getRange('H:H').setNumberFormat('#,##0.000');
  log.getRange('I:I').setNumberFormat('#,##0');
  log.getRange('J:J').setNumberFormat('#,##0.000');
  log.getRange('K:K').setNumberFormat('0.0');
  log.getRange('L:M').setNumberFormat('#,##0');
  log.setColumnWidths(1, HEAD.length, 110); log.setColumnWidth(1, 150);
  log.hideColumns(1);
  if (log.getBandings().length === 0) log.getRange(1, 1, 1000, HEAD.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  // flag uncertain readings
  const rules = log.getConditionalFormatRules().filter((r) => !r.getRanges().some((x) => x.getA1Notation() === 'O2:O'));
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(70).setBackground('#FDE68A').setRanges([log.getRange('O2:O')]).build());
  log.setConditionalFormatRules(rules);
  // --- monthly summary (formulas update by themselves)
  const mon = ss.getSheetByName(MONTH) || ss.insertSheet(MONTH, 1);
  mon.clear();
  mon.getRange('A1').setFormula(`=IFERROR(QUERY({ARRAYFORMULA(IF(LEN('${LOG}'!C2:C),TEXT('${LOG}'!C2:C,"yyyy-mm"),)),'${LOG}'!J2:J,'${LOG}'!M2:M,'${LOG}'!H2:H},` +
    `"select Col1, sum(Col2), sum(Col3), max(Col4), count(Col4) where Col1 is not null group by Col1 order by Col1 ` +
    `label Col1 'เดือน', sum(Col2) 'ใช้น้ำ (m³)', sum(Col3) 'ค่าน้ำ (บาท)', max(Col4) 'ค่ามาตรล่าสุด (m³)', count(Col4) 'จำนวนครั้งที่อ่าน'",1),"ยังไม่มีข้อมูล")`);
  mon.getRange('A1:E1').setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0B3954');
  mon.getRange('B:B').setNumberFormat('#,##0.000'); mon.getRange('C:C').setNumberFormat('#,##0'); mon.getRange('D:D').setNumberFormat('#,##0.000');
  mon.setFrozenRows(1); mon.setColumnWidths(1, 5, 140);
  // --- dashboard with KPIs and charts
  const dash = ss.getSheetByName(DASH) || ss.insertSheet(DASH, 0);
  dash.clear(); dash.getCharts().forEach((c) => dash.removeChart(c));
  dash.getRange('A1').setValue('CoreDash AquaLog · แดชบอร์ดการใช้น้ำ').setFontSize(18).setFontWeight('bold').setFontColor('#0B3954');
  const kpi = [
    ['ค่ามาตรล่าสุด (m³)', `=IFERROR(INDEX(SORT(FILTER('${LOG}'!H2:H,'${LOG}'!B2:B<>""),FILTER('${LOG}'!B2:B,'${LOG}'!B2:B<>""),FALSE),1),"-")`, '#,##0.000'],
    ['อ่านล่าสุดเมื่อ', `=IFERROR(MAX('${LOG}'!B2:B),"-")`, 'd mmm yyyy hh:mm'],
    ['ใช้น้ำเดือนนี้ (m³)', `=SUMIFS('${LOG}'!J2:J,'${LOG}'!C2:C,">="&EOMONTH(TODAY(),-1)+1)`, '#,##0.000'],
    ['เฉลี่ยต่อวัน 30 วันล่าสุด (ลิตร)', `=IFERROR(SUMIFS('${LOG}'!J2:J,'${LOG}'!C2:C,">="&TODAY()-30)*1000/30,0)`, '#,##0'],
    ['ค่าน้ำเดือนนี้ (บาท)', `=SUMIFS('${LOG}'!M2:M,'${LOG}'!C2:C,">="&EOMONTH(TODAY(),-1)+1)`, '#,##0'],
    ['จำนวนครั้งที่อ่านทั้งหมด', `=COUNTA('${LOG}'!B2:B)`, '0']
  ];
  kpi.forEach(([label, f, fmt], i) => {
    const col = 1 + (i % 3) * 2, row = 3 + Math.floor(i / 3) * 3;
    dash.getRange(row, col).setValue(label).setFontColor('#64748B');
    dash.getRange(row + 1, col).setFormula(f).setNumberFormat(fmt).setFontSize(16).setFontWeight('bold').setFontColor('#0F172A');
  });
  dash.setColumnWidths(1, 6, 150);
  const last = Math.max(2, log.getMaxRows());
  dash.insertChart(dash.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(mon.getRange('A1:B60')).setNumHeaders(1).setPosition(10, 1, 0, 0)
    .setOption('title', 'ปริมาณน้ำที่ใช้รายเดือน (m³)').setOption('legend', { position: 'none' }).setOption('colors', ['#38BDF8']).setOption('width', 620).setOption('height', 320).build());
  dash.insertChart(dash.newChart().setChartType(Charts.ChartType.LINE)
    .addRange(log.getRange(`B1:B${last}`)).addRange(log.getRange(`L1:L${last}`)).setNumHeaders(1).setPosition(10, 5, 0, 0)
    .setOption('title', 'เฉลี่ยลิตรต่อวัน ในแต่ละช่วงที่อ่าน').setOption('legend', { position: 'none' }).setOption('colors', ['#16A34A']).setOption('pointSize', 5).setOption('width', 620).setOption('height', 320).build());
  dash.insertChart(dash.newChart().setChartType(Charts.ChartType.LINE)
    .addRange(log.getRange(`B1:B${last}`)).addRange(log.getRange(`H1:H${last}`)).setNumHeaders(1).setPosition(27, 1, 0, 0)
    .setOption('title', 'ค่ามาตรสะสม (m³)').setOption('legend', { position: 'none' }).setOption('colors', ['#0B3954']).setOption('pointSize', 4).setOption('width', 620).setOption('height', 300).build());
  dash.insertChart(dash.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(mon.getRange('A1:A60')).addRange(mon.getRange('C1:C60')).setNumHeaders(1).setPosition(27, 5, 0, 0)
    .setOption('title', 'ค่าน้ำโดยประมาณรายเดือน (บาท)').setOption('legend', { position: 'none' }).setOption('colors', ['#F59E0B']).setOption('width', 620).setOption('height', 300).build());
  ss.setActiveSheet(dash);
  return 'ตั้งค่าเรียบร้อย';
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function keyOk_(k) { return API_KEY && API_KEY.length >= 8 && k === API_KEY; }

// GET ?key=…&action=ping  → test the connection;  &action=list&limit=50 → recent rows for the app
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!keyOk_(p.key)) return json_({ ok: false, error: 'BAD_KEY' });
  const ss = SpreadsheetApp.getActiveSpreadsheet(), log = ss.getSheetByName(LOG);
  if (!log) return json_({ ok: false, error: 'RUN_SETUP' });
  if (p.action === 'list') {
    const n = Math.min(500, Number(p.limit) || 50), last = log.getLastRow();
    const rows = last < 2 ? [] : log.getRange(Math.max(2, last - n + 1), 1, Math.min(n, last - 1), HEAD.length).getValues();
    return json_({ ok: true, rows: rows.map((r) => ({ id: r[0], ts: new Date(r[1]).getTime(), m3: r[7], used: r[9], how: r[13] })) });
  }
  return json_({ ok: true, sheet: ss.getName(), url: ss.getUrl(), rows: Math.max(0, log.getLastRow() - 1) });
}

// POST body (text/plain JSON): { key, rows: [ { id, ts, place, model, meterId, m3, usedM3, days, perDay, cost, method, minConf, edited, device, note } ] }
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'BAD_JSON' }); }
  if (!keyOk_(body.key)) return json_({ ok: false, error: 'BAD_KEY' });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let log = ss.getSheetByName(LOG); if (!log) { setup(); log = ss.getSheetByName(LOG); }
    const last = log.getLastRow();
    const have = new Set(last > 1 ? log.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])) : []);
    const now = new Date(), out = [], saved = [];
    for (const r of body.rows || []) {
      const id = String(r.id || ''); if (!id) continue;
      saved.push(id);
      if (have.has(id)) continue; // already stored: the app may resend after a timeout
      const d = new Date(Number(r.ts) || Date.now());
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      out.push([id, d, day, d, r.place || '', r.model || '', r.meterId || '', Number(r.m3) || 0, Math.round((Number(r.m3) || 0) * 1000),
        r.usedM3 == null ? '' : Number(r.usedM3), r.days == null ? '' : Number(r.days), r.perDay == null ? '' : Number(r.perDay), r.cost == null ? '' : Number(r.cost),
        r.method || '', r.minConf == null ? '' : Number(r.minConf), r.edited ? 'ใช่' : '', r.device || '', r.note || '', now]);
      have.add(id);
    }
    if (out.length) log.getRange(log.getLastRow() + 1, 1, out.length, HEAD.length).setValues(out);
    return json_({ ok: true, saved, added: out.length, rows: log.getLastRow() - 1, url: ss.getUrl() });
  } finally { lock.releaseLock(); }
}
