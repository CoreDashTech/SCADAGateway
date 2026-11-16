/* CoreDash HydroLink — devices, users, API */
(function () {
  'use strict';
  var A = APP, S = SIM.state, $ = A.$, $$ = A.$$, esc = A.esc, fmt = A.fmt;

  function iso(ms) { var d = new Date(ms), o = -d.getTimezoneOffset(), sg = o >= 0 ? '+' : '-'; o = Math.abs(o); return d.getFullYear() + '-' + A.pad(d.getMonth() + 1) + '-' + A.pad(d.getDate()) + 'T' + A.pad(d.getHours()) + ':' + A.pad(d.getMinutes()) + ':' + A.pad(d.getSeconds()) + sg + A.pad(Math.floor(o / 60)) + ':' + A.pad(o % 60); }

  var DEVICES = [
    { id: 'PLC', name: 'PLC Mitsubishi FX5U-32MR/DS', ip: '192.168.10.10', proto: 'SLMP (MC) / Modbus TCP', poll: '1 วิ', comm: 'plc' },
    { id: 'HMI', name: 'HMI 10″ (หน้าตู้ควบคุม)', ip: '192.168.10.11', proto: 'Ethernet ↔ PLC', poll: '—', comm: 'hmi' },
    { id: 'INV-01', name: 'ABB ACS580-01-073A-4 + FMBT-21', ip: '192.168.10.21', proto: 'Modbus TCP :502', poll: '1 วิ', comm: 'inv1' },
    { id: 'INV-02', name: 'ABB ACS580-01-073A-4 + FMBT-21', ip: '192.168.10.22', proto: 'Modbus TCP :502', poll: '1 วิ', comm: 'inv2' },
    { id: 'PM-01', name: 'Power Meter M1M 20', ip: '192.168.10.30', proto: 'Modbus TCP :502', poll: '1 วิ', comm: 'pm' },
    { id: 'FT-01', name: 'Flowmeter ผ่าน RS485 → TCP', ip: '192.168.10.40', proto: 'Modbus RTU over TCP', poll: '1 วิ', comm: 'fm' },
    { id: 'PT-01/02', name: 'SIEMENS P220 0–10 bar × 2', ip: '→ INV-01 / INV-02 AI', proto: '4–20 mA', poll: '—', comm: 'plc' },
    { id: 'SW-01', name: 'TP-Link Omada Gigabit 8 Port', ip: '192.168.10.2', proto: 'Ethernet / SNMP', poll: '30 วิ', comm: 'sw' },
    { id: 'UPS', name: 'UPS 1000VA (PLC, HMI)', ip: '— (สถานะผ่าน PLC)', proto: 'Dry contact', poll: '1 วิ', comm: 'ups' },
    { id: 'EDGE', name: 'CoreDash Edge Gateway', ip: '192.168.10.5', proto: 'MQTT/TLS → Cloud · REST API', poll: '1 วิ', comm: 'gw' }
  ];
  function devOnline(d) { return d.comm === 'fm' ? S.comm.fm : d.comm === 'pm' ? S.comm.pm : S.comm[d.comm] !== false; }

  // ---------------- devices
  A.PAGES.devices = {
    render: function (v) {
      v.innerHTML = '<div class="card"><div class="card-h"><h3>แผนผังเครือข่ายควบคุม</h3><span class="muted">อัปเดตทุก 1 วินาที</span></div><div id="topo"></div></div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>สถานะการสื่อสารของอุปกรณ์</h3><span class="muted">' + DEVICES.length + ' อุปกรณ์</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>อุปกรณ์</th><th>IP / การเชื่อมต่อ</th><th>โปรโตคอล</th><th>รอบอ่าน</th><th>สถานะ</th><th class="r">อัปเดตล่าสุด</th></tr></thead><tbody id="devBody"></tbody></table></div></div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>อุปกรณ์ในตู้ควบคุม</h3><span class="muted">ตู้ W900 × H1800 × D600</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>การติดตามใน SCADA</th></tr></thead><tbody>' +
        [['MCCB Main Breaker 200A (ตู้ MDB 1 ตัว)', '2', 'ผ่าน Power Meter'], ['MCCB Sub Breaker 100A', '2', 'สถานะ Ready ของ Inverter'], ['Surge Protection Device Type1 ≥ 275V AC', '1', '—'], ['Phase Protection', '1', '✓ สถานะผ่าน PLC'],
        ['Fuse Control 4A แยกทุกอุปกรณ์', 'ชุด', '—'], ['PLC FX5U 32MR/DS', '1', '✓ Online / Heartbeat'], ['HMI 10″', '1', '✓ Online'], ['Inverter ABB ACS580-01-073A-4+J400 37 kW', '2', '✓ อ่านครบ 18 ค่า'],
        ['Modbus TCP FMBT-21', '2', '✓ Online'], ['Power Meter M1M 20 Modbus TCP/IP', '1', '✓ V, A, Hz, Totalizer'], ['Breaker 16A + Plug 2 Port', '1', '—'], ['UPS 1000VA (PLC, HMI)', '1', '✓ สถานะ'],
        ['LED สถานะ 3 Phase, LED STOP', 'ชุด', 'แสดงบน Mimic'], ['Emergency Stop', '1', '✓ สถานะผ่าน PLC'], ['Pressure Transmitter SIEMENS P220 0–10 bar', '2', '✓ ค่าแรงดัน'], ['Gigabit Switch Omada TP-Link ≥ 8 Port', '1', '✓ Online'],
        ['Temperature Switch + พัดลมระบายอากาศ + Filter', '1', '✓ สถานะผ่าน PLC'], ['RS485 to TCP สำหรับ Flowmeter', '1', '✓ Flow Rate, Totalizer']].map(function (r, i) { return '<tr><td class="num">' + (i + 2) + '</td><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + (r[2][0] === '✓' ? '<span style="color:var(--green)">' + r[2] + '</span>' : '<span class="muted">' + r[2] + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      this.topo(v); this.tick(v);
    },
    topo: function (v) {
      var el = $('#topo', v);
      var node = function (x, y, w, t, sub, ok) { return '<g class="node ' + (ok ? 'ok' : 'bad') + '" transform="translate(' + x + ' ' + y + ')"><rect width="' + w + '" height="52" rx="10"/><circle cx="14" cy="16" r="4.5" fill="' + (ok ? 'var(--green)' : 'var(--red)') + '"/><text x="26" y="20" style="font-weight:700">' + t + '</text><text x="12" y="40" class="sm">' + sub + '</text></g>'; };
      var link = function (d) { return '<path class="link" d="' + d + '"/><path class="pkt" d="' + d + '"/>'; };
      var s = '<svg class="topo" viewBox="0 0 1000 330" style="width:100%;height:auto" role="img" aria-label="แผนผังเครือข่าย PLC, Inverter, Power Meter, Flowmeter, Switch, Edge Gateway และ Cloud">' +
        link('M500 78 V120') + link('M500 172 V214 H90 V244') + link('M500 214 H250 V244') + link('M500 214 H410 V244') + link('M500 214 H590 V244') + link('M500 214 H750 V244') + link('M500 214 H910 V244') + link('M610 146 H740') + link('M860 146 H900 V78') +
        '<g transform="translate(400 18)"><rect width="200" height="60" rx="30" fill="var(--panel2)" stroke="var(--cyan)"/><text x="100" y="27" text-anchor="middle" style="font-weight:700">CoreDash Cloud</text><text x="100" y="45" text-anchor="middle" class="sm">Web · Mobile App · REST API</text></g>' +
        node(390, 120, 220, 'Edge Gateway', '192.168.10.5 · MQTT/TLS', S.comm.gw) +
        node(740, 120, 120, 'Switch', 'Omada 8 Port', S.comm.sw) +
        '<g transform="translate(830 18)"><rect width="150" height="60" rx="12" fill="var(--panel2)" stroke="var(--line2)"/><text x="75" y="27" text-anchor="middle" style="font-weight:700">Internet</text><text x="75" y="45" text-anchor="middle" class="sm">Fiber / 4G Backup</text></g>' +
        node(20, 244, 140, 'PLC FX5U', '.10 · SLMP', S.comm.plc) + node(180, 244, 140, 'HMI 10″', '.11', S.comm.hmi) + node(340, 244, 140, 'INV-01', '.21 · FMBT-21', S.comm.inv1) +
        node(520, 244, 140, 'INV-02', '.22 · FMBT-21', S.comm.inv2) + node(680, 244, 140, 'Power Meter', '.30 · M1M 20', S.comm.pm) + node(840, 244, 140, 'Flowmeter', '.40 · RS485→TCP', S.comm.fm) +
        '</svg>';
      el.innerHTML = s;
    },
    tick: function (v) {
      var b = $('#devBody', v); if (!b) return;
      b.innerHTML = DEVICES.map(function (d) { var on = devOnline(d); return '<tr><td class="k-num">' + d.id + '</td><td>' + d.name + '</td><td class="num">' + d.ip + '</td><td>' + d.proto + '</td><td>' + d.poll + '</td><td>' + (on ? '<span class="pill run">ออนไลน์</span>' : '<span class="pill fault">ขาดการสื่อสาร</span>') + '</td><td class="r num">' + (on ? A.tFmt(S.lastUpdate, true) : '—') + '</td></tr>'; }).join('');
      if (!this._last || this._last !== JSON.stringify(S.comm)) { this._last = JSON.stringify(S.comm); this.topo(v); }
    }
  };

  // ---------------- users
  A.PAGES.users = {
    render: function (v) {
      var adm = A.can('users'), me = A.session();
      var matrix = '<div class="card" style="margin-top:16px"><div class="card-h"><h3>สิทธิ์การใช้งาน 3 ระดับ</h3><span class="muted">Viewer · Operator · Admin</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ความสามารถ</th><th style="text-align:center">ผู้ดูแลระบบ</th><th style="text-align:center">ผู้ปฏิบัติงาน</th><th style="text-align:center">ผู้ดูข้อมูล</th></tr></thead><tbody>' +
        A.PERM_LABEL.map(function (p) { return '<tr><td>' + p[1] + '</td>' + ['admin', 'operator', 'viewer'].map(function (r) { return '<td style="text-align:center">' + (A.PERM[p[0]].indexOf(r) >= 0 ? '<span style="color:var(--green);font-weight:700">✓</span>' : '<span class="muted">—</span>') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>';
      if (!adm) {
        v.innerHTML = '<div class="card"><div class="card-h"><h3>บัญชีของฉัน</h3></div><div class="kv"><div>ชื่อ</div><div>' + esc(me.name) + '</div><div>ชื่อผู้ใช้</div><div>@' + esc(me.u) + '</div><div>ระดับสิทธิ์</div><div>' + A.ROLES[me.role] + '</div><div>เข้าสู่ระบบเมื่อ</div><div>' + A.dtFmt(me.at) + '</div></div></div><div class="lock" style="margin-top:16px">🔒 การจัดการผู้ใช้และ Log การทำงานของผู้ใช้ เปิดให้เฉพาะผู้ดูแลระบบ</div>' + matrix;
        return;
      }
      var us = A.users();
      v.innerHTML = '<div class="card"><div class="card-h"><h3>ผู้ใช้งาน <span class="muted" style="font-weight:400">' + us.length + ' บัญชี</span></h3><button class="btn primary sm" id="addU">+ เพิ่มผู้ใช้</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>ระดับสิทธิ์</th><th>อีเมล</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th></th></tr></thead><tbody>' +
        us.map(function (u, i) { return '<tr><td><b>' + esc(u.name) + '</b></td><td class="num">@' + esc(u.u) + '</td><td><select data-role-sel="' + i + '" style="min-height:34px;width:auto"' + (u.u === me.u ? ' disabled' : '') + '>' + Object.keys(A.ROLES).map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + A.ROLES[r] + '</option>'; }).join('') + '</select></td><td>' + esc(u.email) + '</td><td><label class="switch"><input type="checkbox" data-act="' + i + '"' + (u.active ? ' checked' : '') + (u.u === me.u ? ' disabled' : '') + '><span class="tr"></span></label></td><td class="num">' + (u.last ? A.dtFmt(u.last) : '–') + '</td><td><button class="btn sm ghost" data-rst="' + i + '">รีเซ็ตรหัสผ่าน</button><button class="btn sm ghost" data-pinrst="' + i + '" title="ล้าง PIN สั่งงาน ผู้ใช้จะตั้งใหม่เมื่อปลดล็อกครั้งถัดไป">' + (u.pinHash ? 'รีเซ็ต PIN' : 'ยังไม่ตั้ง PIN') + '</button></td></tr>'; }).join('') + '</tbody></table></div></div>' + matrix +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>Log การทำงานของผู้ใช้</h3><div class="row"><select id="auF" style="width:auto;min-height:36px"><option value="">ทุกการกระทำ</option>' + uniq(A.auditLog().map(function (a) { return a.act; })).map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select><button class="btn sm" id="auCsv">ส่งออก CSV</button></div></div><div class="tbl-wrap" style="max-height:480px" id="auTbl"></div></div>';
      var drawAudit = function () { var f = $('#auF', v).value; $('#auTbl', v).innerHTML = '<table class="tbl"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>ระดับ</th><th>การกระทำ</th><th>รายละเอียด</th><th>IP</th></tr></thead><tbody>' + A.auditLog().filter(function (a) { return !f || a.act === f; }).map(function (a) { return '<tr><td class="num">' + A.dtFmt(a.at) + '</td><td>@' + esc(a.u) + '</td><td>' + (A.ROLES[a.role] || '-') + '</td><td><span class="pill info">' + esc(a.act) + '</span></td><td>' + esc(a.det) + '</td><td class="num">' + a.ip + '</td></tr>'; }).join('') + '</tbody></table>'; };
      drawAudit(); $('#auF', v).onchange = drawAudit;
      $('#auCsv', v).onclick = function () { A.csv('user-audit-log.csv', [['time', 'user', 'role', 'action', 'detail', 'ip']].concat(A.auditLog().map(function (a) { return [iso(a.at), a.u, a.role, a.act, a.det, a.ip]; }))); };
      $$('[data-role-sel]', v).forEach(function (s) { s.onchange = function () { var u = us[+s.getAttribute('data-role-sel')], old = u.role; u.role = s.value; A.setUsers(us); A.audit('ผู้ใช้', '@' + u.u + ' ระดับสิทธิ์ ' + A.ROLES[old] + ' → ' + A.ROLES[u.role]); A.toast('บันทึกแล้ว', '@' + u.u + ' เป็น ' + A.ROLES[u.role], 'ok'); drawAudit(); }; });
      $$('[data-act]', v).forEach(function (s) { s.onchange = function () { var u = us[+s.getAttribute('data-act')]; u.active = s.checked; A.setUsers(us); A.audit('ผู้ใช้', '@' + u.u + (u.active ? ' เปิดใช้งาน' : ' ระงับการใช้งาน')); drawAudit(); }; });
      $$('[data-pinrst]', v).forEach(function (b) { b.onclick = function () { var u = us[+b.getAttribute('data-pinrst')]; if (!u.pinHash) return; A.confirmBox('รีเซ็ต PIN สั่งงานของ @' + u.u + '?', 'ผู้ใช้จะต้องตั้ง PIN ใหม่เมื่อปลดล็อกการสั่งงานครั้งถัดไป', 'รีเซ็ต PIN', true).then(function (ok) { if (!ok) return; delete u.pinHash; A.setUsers(us); A.audit('ความปลอดภัย', 'รีเซ็ต PIN สั่งงาน @' + u.u); A.toast('รีเซ็ต PIN แล้ว', '@' + u.u, 'ok'); A.PAGES.users.render(v); }); }; });
      $$('[data-rst]', v).forEach(function (b) { b.onclick = function () { var u = us[+b.getAttribute('data-rst')]; A.audit('ผู้ใช้', 'รีเซ็ตรหัสผ่าน @' + u.u); A.toast('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว', u.email, 'ok'); drawAudit(); }; });
      $('#addU', v).onclick = function () {
        A.modal('<h3>เพิ่มผู้ใช้</h3><p class="muted" style="margin-top:0">ระบบจะส่งลิงก์ตั้งรหัสผ่านไปทางอีเมล</p><div class="stack" style="gap:12px"><label>ชื่อ-นามสกุล<input id="nuN" required></label><label>ชื่อผู้ใช้<input id="nuU" required></label><label>อีเมล<input id="nuE" type="email"></label><label>ระดับสิทธิ์<select id="nuR">' + Object.keys(A.ROLES).map(function (r) { return '<option value="' + r + '"' + (r === 'viewer' ? ' selected' : '') + '>' + A.ROLES[r] + '</option>'; }).join('') + '</select></label></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" id="nuOk">เพิ่มผู้ใช้</button></div>',
          function (c, close) {
            $('#nuOk', c).onclick = function () {
              var n = $('#nuN', c).value.trim(), u = $('#nuU', c).value.trim().toLowerCase();
              if (!n || !u) { A.toast('กรอกข้อมูลไม่ครบ', 'ต้องมีชื่อและชื่อผู้ใช้', 'warning'); return; }
              if (us.some(function (x) { return x.u === u; })) { A.toast('ชื่อผู้ใช้ซ้ำ', '@' + u, 'warning'); return; }
              us.push({ u: u, name: n, role: $('#nuR', c).value, email: $('#nuE', c).value, active: true, last: null }); A.setUsers(us);
              A.audit('ผู้ใช้', 'เพิ่ม @' + u + ' (' + A.ROLES[$('#nuR', c).value] + ')'); close(); A.PAGES.users.render(v); A.toast('เพิ่มผู้ใช้แล้ว', '@' + u, 'ok');
            };
          });
      };
    }
  };
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------------- API (simulated gateway)
  var SCOPES = { 'read:latest': 'ค่าล่าสุด', 'read:history': 'ข้อมูลย้อนหลัง', 'read:status': 'สถานะอุปกรณ์', 'read:alarms': 'รายการ Alarm' };
  var keys = A.ls('apiKeys', null) || [
    { id: 'k1', name: 'ระบบ ERP ฝ่ายบัญชี', key: 'cdhl_live_7Hk2pQ9xTb4mW1zRf8LsYc3N', scopes: ['read:latest', 'read:history'], rate: 60, created: Date.now() - 26 * 3600e3, last: Date.now() - 300e3, revoked: false },
    { id: 'k2', name: 'Power BI ผู้บริหาร', key: 'cdhl_live_Q4dVn8Gm2Ka7Xr5Pw0Je6Tb', scopes: ['read:latest', 'read:history', 'read:status', 'read:alarms'], rate: 120, created: Date.now() - 12 * 86400e3, last: Date.now() - 3600e3, revoked: false },
    { id: 'k3', name: 'ทดสอบผู้รับเหมาเดิม', key: 'cdhl_live_Zz1Yy2Xx3Ww4Vv5Uu6Tt7Ss', scopes: ['read:latest'], rate: 30, created: Date.now() - 40 * 86400e3, last: Date.now() - 20 * 86400e3, revoked: true }
  ];
  var rl = {};
  function saveKeys() { A.lsSet('apiKeys', keys); }
  function mask(k) { return k.slice(0, 10) + '••••••••' + k.slice(-4); }
  function apiCall(method, path, q, auth) {
    var now = Date.now(), base = { 'Content-Type': 'application/json; charset=utf-8', 'X-Request-Id': Math.random().toString(16).slice(2, 10) };
    function err(st, code, msg, hdr) { return { status: st, headers: Object.assign(base, hdr || {}), body: { error: { status: st, code: code, message: msg } } }; }
    var k = keys.find(function (x) { return x.key === auth; });
    if (!auth) return err(401, 'UNAUTHORIZED', 'ต้องระบุ API Key ใน header X-API-Key หรือ Authorization: Bearer <token>');
    if (!k || k.revoked) return err(401, 'INVALID_API_KEY', 'API Key ไม่ถูกต้องหรือถูกยกเลิกสิทธิ์แล้ว');
    var win = Math.floor(now / 60000), b = rl[k.id] && rl[k.id].w === win ? rl[k.id] : (rl[k.id] = { w: win, n: 0 });
    b.n++;
    var hdr = { 'X-RateLimit-Limit': String(k.rate), 'X-RateLimit-Remaining': String(Math.max(0, k.rate - b.n)), 'X-RateLimit-Reset': String((win + 1) * 60) };
    if (b.n > k.rate) return err(429, 'RATE_LIMITED', 'เกินจำนวนการเรียกที่กำหนด ' + k.rate + ' ครั้ง/นาที', Object.assign(hdr, { 'Retry-After': String(60 - Math.floor(now / 1000) % 60) }));
    k.last = now; saveKeys();
    var need = { '/api/v1/latest': 'read:latest', '/api/v1/points': 'read:latest', '/api/v1/history': 'read:history', '/api/v1/devices/status': 'read:status', '/api/v1/alarms': 'read:alarms', '/api/v1/meta/last-update': 'read:latest' }[path];
    if (!need) return err(404, 'NOT_FOUND', 'ไม่พบ endpoint ' + path, hdr);
    if (k.scopes.indexOf(need) < 0) return err(403, 'FORBIDDEN', 'API Key นี้ไม่มีสิทธิ์ ' + need, hdr);
    var pts = SIM.points(), meta = { site: 'DEMO-01', generated_at: iso(now) }, body;
    if (path === '/api/v1/points') body = { data: pts.map(function (p) { return { point: p.id, name: p.name, unit: p.unit }; }), count: pts.length, meta: meta };
    if (path === '/api/v1/latest') {
      var ids = (q.points || 'system.pressure,FT-01.flow,PM-01.kw').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var bad = ids.filter(function (id) { return !pts.some(function (p) { return p.id === id; }); });
      if (bad.length) return err(404, 'POINT_NOT_FOUND', 'ไม่พบจุดตรวจวัด: ' + bad.join(', '), hdr);
      body = { data: ids.map(function (id) { var p = pts.find(function (x) { return x.id === id; }), val = SIM.latest(id); return { point: id, value: typeof val === 'number' ? +val.toFixed(3) : val, unit: p.unit, quality: (id.indexOf('FT-01') === 0 && !S.comm.fm) ? 'bad_comm' : 'good', ts: iso(S.lastUpdate) }; }), meta: meta };
    }
    if (path === '/api/v1/history') {
      var pid = q.point || 'system.pressure', P = pts.find(function (x) { return x.id === pid; });
      if (!P) return err(404, 'POINT_NOT_FOUND', 'ไม่พบจุดตรวจวัด: ' + pid, hdr);
      var st = Date.parse(q.start), en = Date.parse(q.end), iv = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '1d': 86400e3 }[q.interval || '5m'], agg = q.agg || 'avg';
      if (isNaN(st) || isNaN(en) || en <= st) return err(400, 'INVALID_PARAMETER', 'start/end ต้องเป็น ISO 8601 และ end > start', hdr);
      if (!iv) return err(400, 'INVALID_PARAMETER', 'interval ต้องเป็น 1m, 5m, 15m, 1h หรือ 1d', hdr);
      if (['avg', 'min', 'max'].indexOf(agg) < 0) return err(400, 'INVALID_PARAMETER', 'agg ต้องเป็น avg, min หรือ max', hdr);
      if ((en - st) / iv > 10000) return err(400, 'RANGE_TOO_LARGE', 'จำนวนจุดข้อมูลเกิน 10,000 — เพิ่ม interval หรือย่อช่วงเวลา', hdr);
      var h = SIM.history(pid, st, en, iv, agg);
      if (!h.length) h = [];
      body = { point: pid, unit: P.unit, start: iso(st), end: iso(en), interval: q.interval || '5m', agg: agg, count: h.length, data: h.slice(0, 500).map(function (r) { return { ts: iso(r[0]), value: +r[1].toFixed(3) }; }), truncated: h.length > 500, meta: meta };
    }
    if (path === '/api/v1/devices/status') body = { devices: DEVICES.map(function (d) { var on = devOnline(d); return { id: d.id, name: d.name, address: d.ip, protocol: d.proto, online: on, last_update: on ? iso(S.lastUpdate) : null }; }), pumps: S.pumps.map(function (p) { return { id: p.tag, status: p.fault ? 'FAULT' : p.run ? 'RUN' : 'STOP', ready: p.ready, role: S.lead === p.id ? 'LEAD' : 'LAG', frequency_hz: +p.freq.toFixed(2), active_fault: p.fault || p.warn || null }; }), control: { mode: S.cfg.mode, setpoint_bar: S.cfg.sp, alternation_hours: S.cfg.altHours, next_alternation: iso(S.altStart + S.cfg.altHours * 3600e3) }, meta: meta };
    if (path === '/api/v1/alarms') {
      var state = q.state || 'active', list = state === 'active' ? S.alarms : S.alarms.concat(S.alarmHistory);
      body = { state: state, count: list.length, data: list.slice(0, 200).map(function (a) { return { id: a.id, code: a.code || null, severity: a.sev, tag: a.tag, message: a.text, raised_at: iso(a.at), cleared_at: a.cleared ? iso(a.cleared) : null, ack_by: a.ack ? a.ack.by : null, ack_at: a.ack ? iso(a.ack.at) : null }; }), meta: meta };
    }
    if (path === '/api/v1/meta/last-update') body = { last_update: iso(S.lastUpdate), age_seconds: Math.round((now - S.lastUpdate) / 1000), source: 'PLC FX5U-32MR/DS', meta: meta };
    return { status: 200, headers: Object.assign(base, hdr), body: body };
  }
  window.CDPS_API = apiCall;

  var EPS = [
    { p: '/api/v1/latest', d: 'ค่าล่าสุดของจุดตรวจวัด', params: [['points', 'system.pressure,FT-01.flow,PM-01.kw,P-01.freq,P-01.current']] },
    { p: '/api/v1/history', d: 'ข้อมูลย้อนหลังตามช่วงเวลา', params: [['point', 'FT-01.flow'], ['start', ''], ['end', ''], ['interval', '1h'], ['agg', 'avg']] },
    { p: '/api/v1/devices/status', d: 'สถานะอุปกรณ์และปั๊ม', params: [] },
    { p: '/api/v1/alarms', d: 'รายการ Alarm', params: [['state', 'active']] },
    { p: '/api/v1/meta/last-update', d: 'เวลาอัปเดตล่าสุด', params: [] },
    { p: '/api/v1/points', d: 'รายการจุดตรวจวัดทั้งหมด', params: [] }
  ];

  A.PAGES.api = {
    ep: 0,
    render: function (v) {
      var adm = A.can('apiKeys'), self = this;
      var activeKey = (keys.find(function (k) { return !k.revoked; }) || {}).key || '';
      v.innerHTML =
        '<div class="grid g4" style="margin-bottom:16px">' + [['มาตรฐาน', 'REST · JSON'], ['ยืนยันตัวตน', 'API Key / Bearer Token'], ['จำกัดการเรียก', 'กำหนดต่อคีย์ (ครั้ง/นาที)'], ['เอกสาร', 'OpenAPI 3.0 + ตัวอย่าง']].map(function (k) { return '<div class="card kpi"><div class="lbl">' + k[0] + '</div><div class="val" style="font-size:18px">' + k[1] + '</div></div>'; }).join('') + '</div>' +
        '<div class="card"><div class="card-h"><h3>API Keys</h3>' + (adm ? '<button class="btn primary sm" id="newKey">+ สร้าง API Key</button>' : '<span class="muted">🔒 จัดการได้เฉพาะผู้ดูแลระบบ</span>') + '</div>' +
        (adm ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชื่อ</th><th>คีย์</th><th>สิทธิ์ (Scopes)</th><th class="r">จำกัด/นาที</th><th>สร้างเมื่อ</th><th>ใช้ล่าสุด</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
          keys.map(function (k, i) { return '<tr><td><b>' + esc(k.name) + '</b></td><td class="num" style="font-size:12.5px">' + mask(k.key) + '</td><td>' + k.scopes.map(function (s) { return '<span class="pill info" style="margin:0 4px 4px 0">' + s + '</span>'; }).join('') + '</td><td class="r num">' + k.rate + '</td><td class="num">' + A.dFmt(k.created) + '</td><td class="num">' + (k.last ? A.dtFmt(k.last) : '–') + '</td><td>' + (k.revoked ? '<span class="pill fault">ยกเลิกแล้ว</span>' : '<span class="pill run">ใช้งาน</span>') + '</td><td>' + (k.revoked ? '' : '<button class="btn sm danger" data-rev="' + i + '">ยกเลิกสิทธิ์</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted" style="margin:0">ติดต่อผู้ดูแลระบบเพื่อขอ API Key สำหรับเชื่อมต่อระบบภายนอก</p>') + '</div>' +
        '<div class="main-side" style="margin-top:16px"><div class="card"><div class="card-h"><h3>ทดลองเรียก API</h3><span class="muted">จำลองคำตอบจริงจากข้อมูลสด</span></div><div class="stack" style="gap:12px">' +
        '<label>Endpoint<select id="apEp">' + EPS.map(function (e, i) { return '<option value="' + i + '"' + (i === self.ep ? ' selected' : '') + '>GET ' + e.p + ' — ' + e.d + '</option>'; }).join('') + '</select></label>' +
        '<div class="grid g2" id="apParams" style="gap:12px"></div>' +
        '<label>X-API-Key<input id="apKey" value="' + (adm ? activeKey : '') + '" placeholder="cdhl_live_..."></label>' +
        '<div class="row"><button class="btn primary" id="apSend">ส่งคำขอ</button><a class="btn" href="../docs/api.html" target="_blank" rel="noopener">เอกสาร API</a><a class="btn ghost" href="../api/openapi.yaml" target="_blank" rel="noopener">openapi.yaml</a></div>' +
        '<div><div class="muted" style="font-size:12.5px;margin-bottom:6px">cURL</div><div class="code" id="apCurl"></div></div>' +
        '<div><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="muted" style="font-size:12.5px">Response</span><span id="apStatus"></span></div><div class="code" id="apRes">// กด "ส่งคำขอ"</div></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>รหัสข้อผิดพลาด</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>HTTP</th><th>code</th><th>ความหมาย</th></tr></thead><tbody>' +
        [['400', 'INVALID_PARAMETER', 'พารามิเตอร์ไม่ถูกต้อง'], ['400', 'RANGE_TOO_LARGE', 'ช่วงข้อมูลใหญ่เกิน'], ['401', 'UNAUTHORIZED', 'ไม่ได้ส่ง API Key'], ['401', 'INVALID_API_KEY', 'คีย์ผิด/ถูกยกเลิก'], ['403', 'FORBIDDEN', 'คีย์ไม่มีสิทธิ์ (scope)'], ['404', 'POINT_NOT_FOUND', 'ไม่พบจุดตรวจวัด'], ['429', 'RATE_LIMITED', 'เกินจำนวนเรียก/นาที'], ['503', 'DEVICE_OFFLINE', 'อุปกรณ์ขาดการสื่อสาร']].map(function (r) { return '<tr><td class="k-num">' + r[0] + '</td><td class="num" style="font-size:12.5px">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="muted" style="font-size:12.5px;margin:12px 0 0">เจ้าของระบบใช้งาน API ได้โดยไม่ผูกขาดกับผู้พัฒนา · มี OpenAPI Spec และเอกสารครบ</p></div></div>';
      var drawParams = function () {
        var e = EPS[self.ep], now = Date.now();
        $('#apParams', v).innerHTML = e.params.map(function (p) { var val = p[1]; if (p[0] === 'start') val = iso(now - 24 * 3600e3); if (p[0] === 'end') val = iso(now); return '<label>' + p[0] + '<input data-ap="' + p[0] + '" value="' + esc(val) + '"></label>'; }).join('') || '<div class="muted" style="font-size:13px">ไม่มีพารามิเตอร์</div>';
        drawCurl();
      };
      var getQ = function () { var q = {}; $$('[data-ap]', v).forEach(function (i) { if (i.value) q[i.getAttribute('data-ap')] = i.value; }); return q; };
      var drawCurl = function () {
        var e = EPS[self.ep], q = getQ(), qs = Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
        $('#apCurl', v).textContent = 'curl -s "https://scada.hydrolink.example' + e.p + (qs ? '?' + qs : '') + '" \\\n  -H "X-API-Key: ' + ($('#apKey', v).value ? mask($('#apKey', v).value) : '<YOUR_API_KEY>') + '"';
      };
      $('#apEp', v).onchange = function () { self.ep = +this.value; drawParams(); };
      $('.main-side', v).addEventListener('input', function (e) { if (e.target.matches('[data-ap],#apKey')) drawCurl(); });
      $('#apSend', v).onclick = function () {
        var e = EPS[self.ep], r = apiCall('GET', e.p, getQ(), $('#apKey', v).value.trim());
        $('#apStatus', v).innerHTML = '<span class="pill ' + (r.status === 200 ? 'run' : r.status === 429 ? 'warn' : 'fault') + '">HTTP ' + r.status + '</span>';
        var hs = Object.keys(r.headers).map(function (h) { return h + ': ' + r.headers[h]; }).join('\n');
        $('#apRes', v).textContent = hs + '\n\n' + JSON.stringify(r.body, null, 2);
      };
      drawParams();
      $$('[data-rev]', v).forEach(function (b) { b.onclick = function () { var k = keys[+b.getAttribute('data-rev')]; A.confirmBox('ยกเลิกสิทธิ์ API Key?', 'คีย์ "' + esc(k.name) + '" จะใช้งานไม่ได้ทันที และย้อนคืนไม่ได้', 'ยกเลิกสิทธิ์', true).then(function (ok) { if (!ok) return; k.revoked = true; saveKeys(); A.audit('API Key', 'ยกเลิกสิทธิ์ "' + k.name + '"'); self.render(v); }); }; });
      var nk = $('#newKey', v); if (nk) nk.onclick = function () {
        A.modal('<h3>สร้าง API Key</h3><div class="stack" style="gap:12px;margin-top:10px"><label>ชื่อระบบที่เชื่อมต่อ<input id="nkN" placeholder="เช่น ระบบ BMS ส่วนกลาง"></label><div><div class="muted" style="font-size:13.5px;margin-bottom:6px">สิทธิ์ (Scopes)</div><div class="stack" style="gap:6px">' + Object.keys(SCOPES).map(function (s) { return '<label class="chk"><input type="checkbox" value="' + s + '" data-sc checked>' + s + ' <span class="muted">· ' + SCOPES[s] + '</span></label>'; }).join('') + '</div></div><label>จำกัดการเรียก<select id="nkR"><option value="30">30 ครั้ง/นาที</option><option value="60" selected>60 ครั้ง/นาที</option><option value="120">120 ครั้ง/นาที</option><option value="600">600 ครั้ง/นาที</option></select></label></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn primary" id="nkOk">สร้างคีย์</button></div>',
          function (c, close) {
            $('#nkOk', c).onclick = function () {
              var n = $('#nkN', c).value.trim(); if (!n) { A.toast('ระบุชื่อระบบ', '', 'warning'); return; }
              var sc = $$('[data-sc]', c).filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
              var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', key = 'cdhl_live_'; var arr = new Uint32Array(24); (window.crypto || window.msCrypto).getRandomValues(arr); for (var i = 0; i < 24; i++) key += chars[arr[i] % chars.length];
              keys.unshift({ id: 'k' + Date.now(), name: n, key: key, scopes: sc, rate: +$('#nkR', c).value, created: Date.now(), last: null, revoked: false }); saveKeys();
              A.audit('API Key', 'สร้างคีย์ "' + n + '" (' + sc.join(', ') + ')');
              c.innerHTML = '<h3>สร้าง API Key แล้ว</h3><p class="muted">คัดลอกเก็บไว้ตอนนี้ ระบบจะแสดงคีย์เต็มเพียงครั้งเดียว</p><div class="code" style="white-space:normal;word-break:break-all">' + key + '</div><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="cpK">คัดลอก</button><button class="btn primary" id="dnK">เสร็จสิ้น</button></div>';
              $('#cpK', c).onclick = function () { try { navigator.clipboard.writeText(key); A.toast('คัดลอกแล้ว', '', 'ok'); } catch (e) { } };
              $('#dnK', c).onclick = function () { close(); self.render(v); };
            };
          });
      };
    }
  };
})();
