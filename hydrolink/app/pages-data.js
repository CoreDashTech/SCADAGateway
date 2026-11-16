/* CoreDash HydroLink — alarms, history, reports */
(function () {
  'use strict';
  var A = APP, S = SIM.state, $ = A.$, $$ = A.$$, esc = A.esc, fmt = A.fmt;
  var SEV = { critical: 'วิกฤต', major: 'สำคัญ', warning: 'เตือน', info: 'ข้อมูล' };
  var CH = { email: 'Email', line: 'LINE OA', telegram: 'Telegram' };

  // ---------------- alarms
  A.PAGES.alarms = {
    tab: 'active',
    render: function (v) {
      var self = this;
      v.innerHTML = '<div class="row" style="justify-content:space-between;margin-bottom:16px"><div class="tabs" role="tablist">' +
        [['active', 'Alarm ปัจจุบัน'], ['history', 'ประวัติ Alarm'], ['channels', 'ช่องทางแจ้งเตือน'], ['log', 'ประวัติการส่ง']].map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" class="' + (self.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') +
        '</div><div class="row"><span class="pill fault">วิกฤต <b class="num" id="cCrit">0</b></span><span class="pill warn">เตือน <b class="num" id="cWarn">0</b></span></div></div><div id="almBody"></div>';
      $$('[data-tab]', v).forEach(function (b) { b.onclick = function () { self.tab = b.getAttribute('data-tab'); self.render(v); A.bindLive(v); }; });
      this.body(v);
    },
    counts: function (v) {
      var c = $('#cCrit', v); if (!c) return;
      c.textContent = S.alarms.filter(function (a) { return a.sev === 'critical'; }).length;
      $('#cWarn', v).textContent = S.alarms.filter(function (a) { return a.sev !== 'critical'; }).length;
    },
    body: function (v) {
      var b = $('#almBody', v), t = this.tab; this.counts(v);
      if (t === 'active') b.innerHTML = this.active();
      if (t === 'history') b.innerHTML = this.history();
      if (t === 'channels') b.innerHTML = this.channels();
      if (t === 'log') b.innerHTML = this.log();
      this.bind(v);
    },
    active: function () {
      var list = S.alarms;
      var rules = '<div class="card" style="margin-top:16px"><div class="card-h"><h3>เงื่อนไขการแจ้งเตือน</h3><span class="muted">ประเมินทุก 1 วินาที</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>เงื่อนไข</th><th>ระดับ</th><th>หน่วงเวลา</th></tr></thead><tbody>' +
        [['PRESS_LOW', 'แรงดันจ่าย < ' + S.cfg.lowAlarm + ' bar', 'warning', '20 วิ'], ['PRESS_CRIT', 'แรงดันจ่าย < 2.5 bar', 'critical', '10 วิ'], ['PRESS_HIGH', 'แรงดันจ่าย > ' + S.cfg.highAlarm + ' bar', 'critical', '5 วิ'],
        ['Px_FAULT', 'Inverter Active Fault (ABB ACS580)', 'critical', 'ทันที'], ['Px_CURR', 'กระแสมอเตอร์ > 97% พิกัด (66 A)', 'warning', '15 วิ'], ['PHASE', 'Phase Protection ทำงาน', 'critical', 'ทันที'],
        ['COMM_*', 'ขาดการสื่อสาร PLC / Power Meter / Flowmeter', 'major', '10 วิ']].map(function (r) { return '<tr><td class="k-num">' + r[0] + '</td><td>' + r[1] + '</td><td><span class="pill ' + (r[2] === 'critical' ? 'fault' : 'warn') + '">' + SEV[r[2]] + '</span></td><td>' + r[3] + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      if (!list.length) return '<div class="empty">✓ ไม่มี Alarm ค้างอยู่ — ระบบทำงานปกติ<br><span style="font-size:13px">ลองกด "โหมดนำเสนอ" ที่หน้าภาพรวม เพื่อจำลอง Fault และดูการแจ้งเตือน</span></div>' + rules;
      return '<div class="stack" style="gap:10px">' + list.map(function (a) {
        return '<div class="alm sev-' + a.sev + (a.sev === 'critical' && !a.ack ? ' blink-crit' : '') + '"><div><div class="t">' + esc(a.text) + '</div><div class="m">' + a.id + ' · ' + a.tag + ' · เกิดเมื่อ ' + A.dtFmt(a.at) + ' · แจ้งแล้ว: ' + (a.notified.filter(function (n) { return n.kind === 'raise'; }).map(function (n) { return CH[n.ch]; }).join(', ') || '–') + (a.ack ? ' · รับทราบโดย ' + esc(a.ack.by) + ' ' + A.tFmt(a.ack.at) : '') + '</div></div>' +
          '<div class="row"><span class="pill ' + (a.sev === 'critical' ? 'fault' : 'warn') + '">' + SEV[a.sev] + '</span>' + (A.can('ack') && !a.ack ? '<button class="btn sm primary" data-ack="' + a.id + '">รับทราบ</button>' : '') + '</div></div>';
      }).join('') + '</div>' + rules;
    },
    history: function () {
      var h = S.alarmHistory.concat(seedHistory());
      return '<div class="card"><div class="card-h"><h3>ประวัติ Alarm</h3><button class="btn sm" id="almCsv">ส่งออก CSV</button></div><div class="tbl-wrap" style="max-height:560px"><table class="tbl"><thead><tr><th>รหัส</th><th>ระดับ</th><th>อุปกรณ์</th><th>ข้อความ</th><th>เกิด</th><th>สิ้นสุด</th><th>รับทราบ</th></tr></thead><tbody>' +
        h.map(function (a) { return '<tr><td class="num">' + a.id + '</td><td><span class="pill ' + (a.sev === 'critical' ? 'fault' : 'warn') + '">' + SEV[a.sev] + '</span></td><td>' + a.tag + '</td><td>' + esc(a.text) + '</td><td class="num">' + A.dtFmt(a.at) + '</td><td class="num">' + (a.cleared ? A.dtFmt(a.cleared) : '–') + '</td><td>' + (a.ack ? esc(a.ack.by) : '<span class="muted">–</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    },
    channels: function () {
      var n = SIM.getNotifyCfg(), adm = A.can('notifyCfg'), dis = adm ? '' : ' disabled';
      var sample = S.alarms[0] || { text: 'P-01 Inverter Fault 2310 Overcurrent — กระแสเกิน', tag: 'INV-01', sev: 'critical', at: Date.now(), id: 'ALM-1024' };
      function card(ch, title, icon, prev) {
        var c = n[ch];
        return '<div class="card"><div class="card-h"><h3>' + icon + ' ' + title + '</h3><label class="switch"><input type="checkbox" data-ch-on="' + ch + '"' + (c.on ? ' checked' : '') + dis + '><span class="tr"></span></label></div>' +
          '<div class="stack" style="gap:12px"><label>ผู้รับ<input data-ch-to="' + ch + '" value="' + esc(c.to) + '"' + dis + '></label>' +
          '<div><div class="muted" style="font-size:13px;margin-bottom:6px">ส่งเมื่อระดับ</div><div class="row">' + ['critical', 'major', 'warning'].map(function (s) { return '<label class="chk"><input type="checkbox" data-ch-sev="' + ch + '" value="' + s + '"' + (c.sev.indexOf(s) >= 0 ? ' checked' : '') + dis + '>' + SEV[s] + '</label>'; }).join('') + '</div></div>' +
          '<div class="muted" style="font-size:12.5px">ตัวอย่างข้อความ</div>' + prev +
          '<button class="btn sm" data-test="' + ch + '"' + dis + '>ส่งข้อความทดสอบ</button></div></div>';
      }
      var when = A.dtFmt(sample.at);
      var lineP = '<div class="np line"><div class="bub"><div class="hd">🔴 HydroLink SCADA · ' + SEV[sample.sev] + '</div>' + esc(sample.text) + '<br><span style="color:#666">' + sample.tag + ' · ' + when + '</span><div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;color:#06C755;font-weight:700">เปิด Dashboard ›</div></div></div>';
      var tgP = '<div class="np tg"><div class="bub"><b>🚨 HydroLink · Pump Station</b><br>' + esc(sample.text) + '<br><span style="color:#9DB4CC">#' + sample.tag.replace('-', '') + ' · ' + when + '</span><br><span style="color:#6AB2F2">/ack_' + sample.id.replace('-', '') + '</span></div></div>';
      var mailP = '<div class="np mail"><div style="color:#888;font-size:12px">จาก: scada@hydrolink.example · ถึง: ' + esc(n.email.to.split(',')[0]) + '</div><div class="hd" style="margin-top:6px">[' + SEV[sample.sev].toUpperCase() + '] ' + esc(sample.text) + '</div><div style="color:#444">อุปกรณ์ ' + sample.tag + ' · เวลา ' + when + '<br>แรงดัน ' + fmt(S.pressure, 2) + ' bar · การไหล ' + fmt(S.flow, 1) + ' m³/h</div></div>';
      return (adm ? '' : '<div class="lock" style="margin-bottom:16px">🔒 เฉพาะผู้ดูแลระบบที่แก้ไขช่องทางแจ้งเตือนได้</div>') +
        '<div class="grid g3">' + card('line', 'LINE Official Account', '💬', lineP) + card('telegram', 'Telegram Bot', '✈️', tgP) + card('email', 'Email (SMTP)', '✉️', mailP) + '</div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>นโยบายการแจ้งซ้ำ</h3></div><div class="row" style="gap:24px"><label class="chk"><input type="checkbox" id="qh"' + (n.quietHours ? ' checked' : '') + dis + '>งดแจ้ง "เตือน" ช่วง 22:00–06:00 (ยังแจ้ง "วิกฤต")</label><label style="flex-direction:row;align-items:center;gap:10px">แจ้งซ้ำทุก<input type="number" id="rep" value="' + n.repeatMin + '" min="5" max="120" style="width:90px"' + dis + '>นาที หากยังไม่มีผู้รับทราบ</label></div>' +
        (adm ? '<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="saveCh">บันทึกการตั้งค่า</button></div>' : '') + '</div>' +
        '<p class="muted" style="font-size:12.5px;margin-top:12px">ใช้ LINE Messaging API (Official Account) แทน LINE Notify ที่ยุติบริการแล้ว · Telegram Bot API · Email ผ่าน SMTP/TLS ขององค์กร</p>';
    },
    log: function () {
      return '<div class="card"><div class="card-h"><h3>ประวัติการส่งแจ้งเตือน</h3><span class="muted">' + S.notifyLog.length + ' รายการ</span></div>' + (S.notifyLog.length ? '<div class="tbl-wrap" style="max-height:560px"><table class="tbl"><thead><tr><th>เวลา</th><th>ช่องทาง</th><th>ประเภท</th><th>ข้อความ</th><th>ผล</th><th class="r">ใช้เวลา</th></tr></thead><tbody>' +
        S.notifyLog.map(function (x) { return '<tr><td class="num">' + A.dtFmt(x.at) + '</td><td>' + CH[x.ch] + '</td><td>' + ({ raise: 'เกิด Alarm', clear: 'กลับสู่ปกติ', test: 'ทดสอบ' }[x.kind]) + '</td><td>' + esc(x.text) + '</td><td><span class="pill run">ส่งสำเร็จ</span></td><td class="r num">' + x.ms + ' ms</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีการส่งแจ้งเตือนในรอบนี้</div>') + '</div>';
    },
    bind: function (v) {
      var self = this;
      $$('[data-ack]', v).forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-ack'); SIM.ack(id, A.session().u); A.audit('รับทราบ Alarm', id); A.toast('รับทราบแล้ว', id, 'ok'); self.body(v); }; });
      $$('[data-test]', v).forEach(function (b) { b.onclick = function () { var ch = b.getAttribute('data-test'); SIM.testNotify(ch); A.audit('แจ้งเตือน', 'ส่งข้อความทดสอบ ' + CH[ch]); A.toast('ส่งข้อความทดสอบแล้ว', CH[ch] + ' · โหมดสาธิตบันทึกไว้ในประวัติการส่ง', 'ok'); }; });
      var sv = $('#saveCh', v); if (sv) sv.onclick = function () {
        var n = SIM.getNotifyCfg();
        ['email', 'line', 'telegram'].forEach(function (ch) { n[ch].on = $('[data-ch-on="' + ch + '"]', v).checked; n[ch].to = $('[data-ch-to="' + ch + '"]', v).value; n[ch].sev = $$('[data-ch-sev="' + ch + '"]', v).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); });
        n.quietHours = $('#qh', v).checked; n.repeatMin = +$('#rep', v).value || 15;
        SIM.setNotifyCfg(n); A.audit('แจ้งเตือน', 'แก้ไขช่องทางแจ้งเตือน'); A.toast('บันทึกแล้ว', 'การตั้งค่าแจ้งเตือน', 'ok');
      };
      var c = $('#almCsv', v); if (c) c.onclick = function () { var h = S.alarmHistory.concat(seedHistory()); A.csv('alarm-history.csv', [['id', 'severity', 'tag', 'message', 'raised', 'cleared', 'ack_by']].concat(h.map(function (a) { return [a.id, a.sev, a.tag, a.text, A.dtFmt(a.at), a.cleared ? A.dtFmt(a.cleared) : '', a.ack ? a.ack.by : '']; }))); };
    },
    onEvent: function (t, a, v) { if (t === 'alarm' || t === 'alarm-clear' || t === 'ack' || (t === 'notify' && this.tab === 'log')) { if (this.tab === 'active' || this.tab === 'log' || this.tab === 'history') this.body(v); else this.counts(v); } }
  };
  var _seed = null;
  function seedHistory() {
    if (_seed) return _seed;
    var n = Date.now(), H = 3600e3, mk = function (id, sev, tag, text, ago, len, by) { return { id: id, sev: sev, tag: tag, text: text, at: n - ago * H, cleared: n - ago * H + len * 60e3, ack: by ? { by: by, at: n - ago * H + 3 * 60e3 } : null }; };
    _seed = [mk('ALM-0998', 'warning', 'PT-01', 'แรงดันจ่ายต่ำกว่ากำหนด (3.41 bar < 3.5 bar)', 9.2, 6, 'operator2'), mk('ALM-0997', 'major', 'FT-01', 'ขาดการสื่อสาร Flowmeter (RS485→TCP)', 31, 4, 'operator1'),
    mk('ALM-0996', 'critical', 'INV-02', 'P-02 Inverter Fault 3220 DC link undervoltage — แรงดัน DC Bus ต่ำ', 15 * 24 + 2, 2, 'operator2'), mk('ALM-0995', 'warning', 'INV-01', 'P-01 กระแสมอเตอร์สูง (66.4 A)', 18 * 24, 12, 'operator1'),
    mk('ALM-0994', 'critical', 'MCC', 'Phase Protection ทำงาน — ไฟฟ้าขาดเฟส/กลับเฟส', 27 * 24, 3, 'admin')];
    return _seed;
  }

  // ---------------- history
  var TAGS = [
    { id: 'system.pressure', n: 'แรงดันจ่าย', u: 'bar', c: '#5B8CFF', d: 2 }, { id: 'FT-01.flow', n: 'อัตราการไหล', u: 'm³/h', c: '#22C3EE', d: 1 },
    { id: 'PM-01.kw', n: 'กำลังไฟฟ้ารวม', u: 'kW', c: '#F5A524', d: 1 }, { id: 'P-01.freq', n: 'P-01 ความถี่', u: 'Hz', c: '#8B5CF6', d: 1 },
    { id: 'P-02.freq', n: 'P-02 ความถี่', u: 'Hz', c: '#14B8A6', d: 1 }, { id: 'P-01.current', n: 'P-01 กระแส', u: 'A', c: '#EC4899', d: 1 },
    { id: 'P-02.current', n: 'P-02 กระแส', u: 'A', c: '#84CC16', d: 1 }, { id: 'PM-01.v_l1', n: 'แรงดันไฟฟ้า L1', u: 'V', c: '#F97316', d: 1 }
  ];
  var RANGES = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };
  var IVL = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '1d': 86400e3 };
  function toLocalInput(ms) { var d = new Date(ms); return d.getFullYear() + '-' + A.pad(d.getMonth() + 1) + '-' + A.pad(d.getDate()) + 'T' + A.pad(d.getHours()) + ':' + A.pad(d.getMinutes()); }
  A.PAGES.history = {
    st: { tags: ['system.pressure', 'FT-01.flow'], range: '24h', ivl: '5m', agg: 'avg' },
    render: function (v) {
      var st = this.st, self = this;
      var end = Date.now(), start = end - (RANGES[st.range] || 86400e3);
      v.innerHTML = '<div class="card"><div class="stack" style="gap:14px">' +
        '<div><div class="muted" style="font-size:13px;margin-bottom:8px">จุดตรวจวัด (เลือกได้ไม่เกิน 2 หน่วย)</div><div class="chips">' + TAGS.map(function (t) { return '<button class="chip' + (st.tags.indexOf(t.id) >= 0 ? ' on' : '') + '" data-tag="' + t.id + '" aria-pressed="' + (st.tags.indexOf(t.id) >= 0) + '"><i style="background:' + t.c + '"></i>' + t.n + ' <span class="muted">' + t.u + '</span></button>'; }).join('') + '</div></div>' +
        '<div class="row" style="gap:12px;align-items:flex-end">' +
        '<div style="min-width:0;max-width:100%"><div class="muted" style="font-size:13px;margin-bottom:6px">ช่วงเวลา</div><div class="tabs">' + ['1h', '24h', '7d', '30d', 'custom'].map(function (r) { return '<button data-range="' + r + '" class="' + (st.range === r ? 'on' : '') + '">' + { '1h': '1 ชม.', '24h': '24 ชม.', '7d': '7 วัน', '30d': '30 วัน', custom: 'กำหนดเอง' }[r] + '</button>'; }).join('') + '</div></div>' +
        '<label style="min-width:190px">เริ่มต้น<input type="datetime-local" id="hStart" value="' + toLocalInput(st.start || start) + '"' + (st.range === 'custom' ? '' : ' disabled') + '></label>' +
        '<label style="min-width:190px">สิ้นสุด<input type="datetime-local" id="hEnd" value="' + toLocalInput(st.end || end) + '"' + (st.range === 'custom' ? '' : ' disabled') + '></label>' +
        '<label>ช่วงรวมข้อมูล<select id="hIvl">' + Object.keys(IVL).map(function (k) { return '<option' + (st.ivl === k ? ' selected' : '') + ' value="' + k + '">' + k + '</option>'; }).join('') + '</select></label>' +
        '<label>วิธีรวม<select id="hAgg">' + [['avg', 'เฉลี่ย'], ['min', 'ต่ำสุด'], ['max', 'สูงสุด']].map(function (k) { return '<option value="' + k[0] + '"' + (st.agg === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></label>' +
        '<button class="btn primary" id="hGo">แสดงข้อมูล</button><button class="btn" id="hCsv">ส่งออก CSV</button></div></div></div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3 id="hTitle">แนวโน้ม</h3><div class="legend" id="hLegend"></div></div><div id="hChart"></div></div>' +
        '<div class="grid g2" style="margin-top:16px"><div class="card"><div class="card-h"><h3>สถิติช่วงที่เลือก</h3></div><div id="hStats"></div></div>' +
        '<div class="card"><div class="card-h"><h3>ไทม์ไลน์การทำงานของปั๊ม · 24 ชม.</h3></div><div id="gantt"></div></div></div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>ตารางข้อมูล</h3><span class="muted" id="hCount"></span></div><div class="tbl-wrap" style="max-height:420px" id="hTable"></div></div>';
      $$('[data-tag]', v).forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-tag'), i = st.tags.indexOf(id); if (i >= 0) { if (st.tags.length > 1) st.tags.splice(i, 1); } else { var units = {}; st.tags.concat([id]).forEach(function (t) { units[TAGS.find(function (x) { return x.id === t; }).u] = 1; }); if (Object.keys(units).length > 2) { A.toast('เลือกได้ไม่เกิน 2 หน่วย', 'เพื่อให้แกนกราฟอ่านง่าย', 'warning'); return; } st.tags.push(id); } self.render(v); }; });
      $$('[data-range]', v).forEach(function (b) { b.onclick = function () { st.range = b.getAttribute('data-range'); if (st.range !== 'custom') { st.start = st.end = null; st.ivl = { '1h': '1m', '24h': '5m', '7d': '1h', '30d': '1h' }[st.range]; } self.render(v); }; });
      $('#hGo', v).onclick = function () { st.ivl = $('#hIvl', v).value; st.agg = $('#hAgg', v).value; if (st.range === 'custom') { st.start = new Date($('#hStart', v).value).getTime(); st.end = new Date($('#hEnd', v).value).getTime(); } self.draw(v); A.audit('ดูข้อมูลย้อนหลัง', st.tags.join(', ') + ' · ' + st.range + ' · ' + st.ivl + ' ' + st.agg); };
      $('#hCsv', v).onclick = function () { var d = self.data; if (!d) return; var rows = [['timestamp'].concat(d.map(function (s) { return s.t.id + ' (' + s.t.u + ')'; }))]; d[0].pts.forEach(function (p, i) { rows.push([new Date(p[0]).toISOString()].concat(d.map(function (s) { return s.pts[i] ? s.pts[i][1].toFixed(3) : ''; }))); }); A.csv('history-' + st.range + '.csv', rows); };
      this.draw(v);
    },
    draw: function (v) {
      var st = this.st, end = st.range === 'custom' && st.end ? st.end : Date.now(), start = st.range === 'custom' && st.start ? st.start : end - RANGES[st.range];
      if (!(end > start)) { A.toast('ช่วงเวลาไม่ถูกต้อง', 'เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น', 'warning'); return; }
      var ivl = IVL[st.ivl]; if ((end - start) / ivl > 3000) { ivl = (end - start) / 3000; }
      var units = [];
      this.data = st.tags.map(function (id) { var t = TAGS.find(function (x) { return x.id === id; }); if (units.indexOf(t.u) < 0) units.push(t.u); return { t: t, pts: SIM.history(id, start, end, ivl, st.agg) }; });
      var bands = []; for (var d = new Date(start).setHours(0, 0, 0, 0); d < end; d += 86400e3) { bands.push([d, d + 6 * 3600e3, 'rgba(120,140,200,.07)']); bands.push([d + 18 * 3600e3, d + 24 * 3600e3, 'rgba(120,140,200,.07)']); }
      A.lineChart($('#hChart', v), { height: 320, yLabel: units[0], y2: units[1], bands: (end - start) <= 8 * 86400e3 ? bands : null, series: this.data.map(function (s) { return { name: s.t.n, unit: s.t.u, color: s.t.c, dec: s.t.d, axis: units.indexOf(s.t.u) === 1 ? 'r' : 'l', data: s.pts, area: s === this.data ? false : false }; }, this) });
      $('#hLegend', v).innerHTML = this.data.map(function (s) { return '<span><i style="background:' + s.t.c + '"></i>' + s.t.n + ' (' + s.t.u + ')</span>'; }).join('');
      $('#hTitle', v).textContent = 'แนวโน้ม ' + A.dtFmt(start).slice(0, -3) + ' – ' + A.dtFmt(end).slice(0, -3);
      $('#hStats', v).innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>จุดตรวจวัด</th><th class="r">ต่ำสุด</th><th class="r">เฉลี่ย</th><th class="r">สูงสุด</th><th class="r">ล่าสุด</th></tr></thead><tbody>' + this.data.map(function (s) {
        var vs = s.pts.map(function (p) { return p[1]; }), avg = vs.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, vs.length);
        return '<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + s.t.c + ';margin-right:8px"></i>' + s.t.n + '</td><td class="r num">' + fmt(Math.min.apply(null, vs), s.t.d) + '</td><td class="r num">' + fmt(avg, s.t.d) + '</td><td class="r num">' + fmt(Math.max.apply(null, vs), s.t.d) + '</td><td class="r num">' + fmt(vs[vs.length - 1], s.t.d) + ' ' + s.t.u + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      var rows = this.data[0].pts.slice(-300).reverse();
      $('#hCount', v).textContent = this.data[0].pts.length + ' แถว · แสดง 300 แถวล่าสุด';
      $('#hTable', v).innerHTML = '<table class="tbl"><thead><tr><th>เวลา</th>' + this.data.map(function (s) { return '<th class="r">' + s.t.n + ' (' + s.t.u + ')</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (p) {
        var t = p[0]; return '<tr><td class="num">' + A.dtFmt(t) + '</td>' + this.data.map(function (s) { var q = s.pts.find(function (x) { return x[0] === t; }); return '<td class="r num">' + (q ? fmt(q[1], s.t.d) : '–') + '</td>'; }).join('') + '</tr>';
      }, this).join('') + '</tbody></table>';
      this.gantt(v);
    },
    gantt: function (v) {
      var el = $('#gantt', v), W = Math.max(300, el.clientWidth || 500), end = Date.now(), start = end - 86400e3, step = 300e3;
      var X = function (t) { return 70 + (t - start) / 86400e3 * (W - 80); };
      var s = '<svg viewBox="0 0 ' + W + ' 150" width="' + W + '" height="150" role="img" aria-label="ไทม์ไลน์การทำงานของปั๊ม 24 ชั่วโมง">';
      [1, 2].forEach(function (id, i) {
        var y = 20 + i * 48; s += '<text x="0" y="' + (y + 20) + '" style="font-family:var(--num);font-size:13px;font-weight:700;fill:var(--text)">P-0' + id + '</text><rect x="70" y="' + y + '" width="' + (W - 80) + '" height="30" rx="6" fill="var(--bg2)"/>';
        var seg = null;
        for (var t = start; t <= end; t += step) {
          var on = SIM.historyValue('P-0' + id + '.freq', t) > 0;
          if (on && seg === null) seg = t;
          if ((!on || t + step > end) && seg !== null) { s += '<rect x="' + X(seg).toFixed(1) + '" y="' + y + '" width="' + Math.max(2, X(t) - X(seg)).toFixed(1) + '" height="30" rx="6" fill="' + (id === 1 ? '#5B8CFF' : '#22C3EE') + '"><title>P-0' + id + ' ทำงาน ' + A.tFmt(seg) + '–' + A.tFmt(t) + '</title></rect>'; seg = null; }
        }
      });
      for (var h = 0; h <= 24; h += 6) { var tt = start + h * 3600e3; s += '<text x="' + X(tt) + '" y="140" text-anchor="middle" style="font-family:var(--num);font-size:11px;fill:var(--muted)">' + A.tFmt(tt) + '</text>'; }
      el.innerHTML = '<div class="chart">' + s + '</svg></div><div class="legend" style="margin-top:6px"><span><i style="background:#5B8CFF"></i>P-01 ทำงาน</span><span><i style="background:#22C3EE"></i>P-02 ทำงาน</span><span>สลับปั๊มหลักทุก ' + S.cfg.altHours + ' ชม. · ช่วงที่ทำงานพร้อมกัน = ความต้องการสูง</span></div>';
    },
    resize: function (v) { this.draw(v); }
  };

  // ---------------- reports
  A.PAGES.reports = {
    m: null,
    render: function (v) {
      var now = new Date(), self = this, opts = [];
      for (var i = 0; i < 6; i++) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); opts.push(d); }
      var sel = this.m || opts[0].getTime(), md = new Date(sel), days = new Date(md.getFullYear(), md.getMonth() + 1, 0).getDate();
      var rows = SIM.summaryFrom(sel, days);
      var sum = function (k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0); };
      var tot = { m3: sum('m3'), kwh: sum('kwh'), h1: sum('h1'), h2: sum('h2'), al: sum('alarms') }, peak = Math.max.apply(null, rows.map(function (r) { return r.peak; }));
      var mname = A.isEn() ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'], yOff = A.isEn() ? 0 : 543;
      v.innerHTML = '<div class="row no-print" style="margin-bottom:16px"><label style="flex-direction:row;align-items:center;gap:10px">เดือน<select id="rM" style="width:auto">' + opts.map(function (d) { return '<option value="' + d.getTime() + '"' + (d.getTime() === sel ? ' selected' : '') + '>' + mname[d.getMonth()] + ' ' + (d.getFullYear() + yOff) + '</option>'; }).join('') + '</select></label><span class="spacer"></span><button class="btn" id="rCsv">ส่งออก CSV</button><button class="btn primary" id="rPrint">พิมพ์ / บันทึก PDF</button></div>' +
        '<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:16px"><div><div class="eyebrow">รายงานการทำงานประจำเดือน</div><h2 style="margin:4px 0 0;font-family:var(--num)">สถานีสูบจ่ายน้ำ · ' + mname[md.getMonth()] + ' ' + (md.getFullYear() + yOff) + '</h2><div class="muted" style="font-size:13px">สถานีสาธิต CoreDash HydroLink · ข้อมูล ' + rows.length + ' วัน · ออกรายงาน ' + A.dtFmt(Date.now()) + '</div></div></div>' +
        '<div class="grid g6" style="gap:12px">' + [['น้ำจ่ายรวม', fmt(tot.m3, 0), 'm³'], ['พลังงานรวม', fmt(tot.kwh, 0), 'kWh'], ['พลังงานต่อน้ำ', fmt(tot.kwh / tot.m3, 3), 'kWh/m³'], ['อัตราไหลสูงสุด', fmt(peak, 0), 'm³/h'], ['ชม.ทำงาน P-01 / P-02', fmt(tot.h1, 0) + ' / ' + fmt(tot.h2, 0), 'ชม.'], ['Alarm ทั้งเดือน', fmt(tot.al, 0), 'ครั้ง']].map(function (k) { return '<div class="card flat kpi"><div class="lbl">' + k[0] + '</div><div class="val" style="font-size:22px">' + k[1] + '<small>' + k[2] + '</small></div></div>'; }).join('') + '</div>' +
        '<div style="margin-top:16px" id="rChart"></div>' +
        '<div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>วันที่</th><th class="r">น้ำจ่าย (m³)</th><th class="r">พลังงาน (kWh)</th><th class="r">kWh/m³</th><th class="r">ไหลสูงสุด (m³/h)</th><th class="r">P-01 (ชม.)</th><th class="r">P-02 (ชม.)</th><th class="r">Alarm</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td class="num">' + A.dFmt(r.date) + '</td><td class="r num">' + fmt(r.m3, 0) + '</td><td class="r num">' + fmt(r.kwh, 0) + '</td><td class="r num">' + fmt(r.sec, 3) + '</td><td class="r num">' + fmt(r.peak, 0) + '</td><td class="r num">' + fmt(r.h1, 1) + '</td><td class="r num">' + fmt(r.h2, 1) + '</td><td class="r num">' + r.alarms + '</td></tr>'; }).join('') +
        '<tr><td><b>รวม</b></td><td class="r k-num">' + fmt(tot.m3, 0) + '</td><td class="r k-num">' + fmt(tot.kwh, 0) + '</td><td class="r k-num">' + fmt(tot.kwh / tot.m3, 3) + '</td><td class="r k-num">' + fmt(peak, 0) + '</td><td class="r k-num">' + fmt(tot.h1, 1) + '</td><td class="r k-num">' + fmt(tot.h2, 1) + '</td><td class="r k-num">' + tot.al + '</td></tr></tbody></table></div>' +
        '<div class="row" style="justify-content:space-between;margin-top:28px;font-size:13px;color:var(--muted)"><span>ผู้จัดทำ ............................................</span><span>ผู้ตรวจสอบ ............................................</span></div></div>';
      this.rows = rows;
      A.barChart($('#rChart', v), { height: 240, labels: rows.map(function (r) { return String(new Date(r.date).getDate()); }), series: [{ name: 'น้ำจ่าย', unit: 'm³', color: '#22C3EE', values: rows.map(function (r) { return r.m3; }) }], line: { name: 'kWh/m³', color: '#F5A524', values: rows.map(function (r) { return r.sec; }) } });
      $('#rM', v).onchange = function () { self.m = +this.value; self.render(v); };
      $('#rPrint', v).onclick = function () { A.audit('ส่งออก', 'รายงานประจำเดือน (PDF)'); window.print(); };
      $('#rCsv', v).onclick = function () { A.csv('monthly-report.csv', [['date', 'm3', 'kwh', 'kwh_per_m3', 'peak_m3h', 'p01_hours', 'p02_hours', 'alarms']].concat(self.rows.map(function (r) { return [new Date(r.date).toISOString().slice(0, 10), r.m3.toFixed(1), r.kwh.toFixed(1), r.sec.toFixed(4), r.peak.toFixed(1), r.h1.toFixed(2), r.h2.toFixed(2), r.alarms]; }))); };
    },
    resize: function (v) { this.render(v); }
  };
})();
