/* CoreDash HydroLink — core: auth, roles, router, live binding, charts */
(function (g) {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function ls(k, d) { try { var v = localStorage.getItem('cdhl.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('cdhl.' + k, JSON.stringify(v)); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { if (n == null || isNaN(n)) return '–'; return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function tFmt(ms, withSec) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + (withSec ? ':' + pad(d.getSeconds()) : ''); }
  var TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var EN_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function isEn() { return !!(window.I18N && I18N.lang() === 'en'); }
  function dFmt(ms) { var d = new Date(ms); return isEn() ? d.getDate() + ' ' + EN_M[d.getMonth()] + ' ' + d.getFullYear() : d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2); }
  function dtFmt(ms) { return dFmt(ms) + ' ' + tFmt(ms, true); }
  function dur(sec) { sec = Math.max(0, Math.round(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return pad(h) + ':' + pad(m) + ':' + pad(s); }

  // ---------- icons
  var IC = {
    overview: '<path d="M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 3v8h8V3z"/>',
    pumps: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 3M4 12H2M22 12h-2"/>',
    power: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    control: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    alarms: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    history: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
    reports: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    devices: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    api: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    station: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
  };
  function ic(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>'; }

  // ---------- roles & users
  var ROLES = { admin: 'ผู้ดูแลระบบ', operator: 'ผู้ปฏิบัติงาน', viewer: 'ผู้ดูข้อมูล' };
  var PERM = {
    view: ['admin', 'operator', 'viewer'],
    ack: ['admin', 'operator'], command: ['admin', 'operator'], setpoint: ['admin', 'operator'],
    alternate: ['admin'], notifyCfg: ['admin'], users: ['admin'], audit: ['admin'], apiKeys: ['admin'], demo: ['admin', 'operator'], export: ['admin', 'operator', 'viewer']
  };
  var PERM_LABEL = [
    ['view', 'ดู Dashboard / ประวัติ / รายงาน'], ['export', 'ส่งออกข้อมูล CSV / PDF'], ['ack', 'รับทราบ Alarm'], ['command', 'สั่ง Start / Stop / Reset Fault'],
    ['setpoint', 'ตั้งค่า PID / Interval'], ['alternate', 'สั่งสลับปั๊ม / ตั้งรอบสลับ'], ['notifyCfg', 'ตั้งค่าช่องทางแจ้งเตือน'], ['apiKeys', 'จัดการ API Key'], ['users', 'จัดการผู้ใช้และสิทธิ์'], ['audit', 'ดู Log การทำงานของผู้ใช้']
  ];
  var DEFAULT_USERS = [
    { u: 'admin', name: 'สมชาย ผู้ดูแล', role: 'admin', email: 'admin@hydrolink.example', active: true, last: Date.now() - 3600e3 },
    { u: 'operator1', name: 'วิชัย กะเช้า', role: 'operator', email: 'op1@hydrolink.example', active: true, last: Date.now() - 7200e3 },
    { u: 'operator2', name: 'ประเสริฐ กะดึก', role: 'operator', email: 'op2@hydrolink.example', active: true, last: Date.now() - 50000e3 },
    { u: 'viewer', name: 'ผู้จัดการฝ่ายสิ่งแวดล้อมฯ', role: 'viewer', email: 'mgr@hydrolink.example', active: true, last: Date.now() - 86400e3 },
    { u: 'auditor', name: 'ฝ่ายตรวจสอบภายใน', role: 'viewer', email: 'audit@hydrolink.example', active: false, last: Date.now() - 20 * 86400e3 }
  ];
  var users = ls('users', null) || DEFAULT_USERS;
  var auditLog = ls('audit', null) || (function () {
    var n = Date.now(), H = 3600e3;
    return [
      { at: n - 1.2 * H, u: 'operator1', role: 'operator', act: 'แก้ไขค่า', det: 'PID Setpoint 3.8 → 4.0 bar', ip: '10.20.1.31' },
      { at: n - 1.25 * H, u: 'operator1', role: 'operator', act: 'เข้าสู่ระบบ', det: 'Web · Chrome / Windows', ip: '10.20.1.31' },
      { at: n - 5 * H, u: 'admin', role: 'admin', act: 'แจ้งเตือน', det: 'เพิ่มผู้รับ LINE OA กลุ่มช่างเทคนิค', ip: '10.20.1.10' },
      { at: n - 9 * H, u: 'operator2', role: 'operator', act: 'รับทราบ Alarm', det: 'ALM-0998 แรงดันจ่ายต่ำกว่ากำหนด', ip: '10.20.1.44' },
      { at: n - 26 * H, u: 'admin', role: 'admin', act: 'API Key', det: 'สร้างคีย์ "ระบบ ERP ฝ่ายบัญชี" (read:latest, read:history)', ip: '10.20.1.10' },
      { at: n - 30 * H, u: 'viewer', role: 'viewer', act: 'ส่งออก', det: 'รายงานประจำเดือน ต.ค. 69 (PDF)', ip: '172.16.4.8' }
    ];
  })();

  var session = ls('session', null);
  function can(p) { return !!session && PERM[p].indexOf(session.role) >= 0; }
  function audit(act, det) {
    auditLog.unshift({ at: Date.now(), u: session ? session.u : '-', role: session ? session.role : '-', act: act, det: det, ip: '10.20.1.' + (session ? (session.u.length * 7 % 200 + 10) : 1) });
    auditLog = auditLog.slice(0, 500); lsSet('audit', auditLog);
  }
  function saveUsers() { lsSet('users', users); }

  // ---------- toast / modal
  function toast(title, msg, sev) {
    var el = document.createElement('div');
    el.className = 'toast sev-' + (sev || 'info');
    el.style.setProperty('--c', sev === 'critical' ? 'var(--red)' : sev === 'major' ? '#FB7A3C' : sev === 'warning' ? 'var(--amber)' : sev === 'ok' ? 'var(--green)' : 'var(--blue2)');
    el.innerHTML = '<div><b>' + esc(title) + '</b><small>' + esc(msg || '') + '</small></div>';
    $('#toasts').appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(function () { el.remove(); }, 400); }, 5200);
  }
  function modal(html, onMount) {
    var m = $('#modal'), c = $('#modalCard');
    c.innerHTML = html; m.hidden = false;
    var close = function () { m.hidden = true; c.innerHTML = ''; document.removeEventListener('keydown', key); };
    var key = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    m.onclick = function (e) { if (e.target === m) close(); };
    $$('[data-close]', c).forEach(function (b) { b.onclick = close; });
    var f = c.querySelector('input,select,button'); if (f) f.focus();
    if (onMount) onMount(c, close);
    return close;
  }
  function confirmBox(title, body, okLabel, danger) {
    return new Promise(function (res) {
      modal('<h3>' + esc(title) + '</h3><div class="muted" style="margin-bottom:18px">' + body + '</div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" id="cfOk">' + esc(okLabel || 'ยืนยัน') + '</button></div>',
        function (c, close) { $('#cfOk', c).onclick = function () { close(); res(true); }; $$('[data-close]', c).forEach(function (b) { b.addEventListener('click', function () { res(false); }); }); });
    });
  }
  function csv(name, rows) {
    var s = '﻿' + rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
    audit('ส่งออก', name);
  }

  // ---------- live values
  var S = SIM.state;
  function pumpVal(p, k) {
    var d = { freq: [p.freq, 1], speed: [p.speed, 0], current: [p.current, 1], torque: [p.torque, 1], power: [p.power, 1], dcbus: [p.dcbus, 0], vout: [p.vout, 0], energy: [p.energy, 1], saved: [p.savedKwh, 1], savedThb: [p.savedKwh * S.cfg.tariff, 0], inv: [p.invHours, 1], motor: [p.motorHours, 1], fan: [p.fanHours, 1], pid: [p.pidOut, 1], pt: [p.pressure, 2], starts: [p.starts, 0], q: [p.qShare, 1] }[k];
    if (d) return fmt(d[0], d[1]);
    if (k === 'fault') return p.fault ? p.fault + ' · ' + (SIM.FAULTS[p.fault] || '') : p.warn ? p.warn + ' · ' + (SIM.FAULTS[p.warn] || '') : 'ไม่มี';
    if (k === 'role') return S.lead === p.id ? 'Lead' : 'Lag';
    return '–';
  }
  function offline() { return S.src === 'live' && !(window.LIVE && LIVE.connected()); }
  var KEEP = { clock: 1, alarmCount: 1, mode: 1, sp: 1 };
  function val(key) {
    if (offline() && !KEEP[key]) return '—';
    var c = S.cfg;
    if (/^p[12]\.(runFor|role|hrs)$/.test(key)) {
      var pp = S.pumps[key[1] - 1], k2 = key.slice(3);
      if (k2 === 'role') return pp.fault ? 'FAULT' : (pp.id === S.lead ? 'Lead' : 'Lag') + (pp.run ? ' · เดิน' : ' · พัก');
      if (k2 === 'runFor') return pp.run && pp.runSince ? dur((S.now - pp.runSince) / 1000) : '—';
      return fmt(pp.motorHours, 1) + ' ชม.';
    }
    if (key.indexOf('p1.') === 0 || key.indexOf('p2.') === 0) return pumpVal(S.pumps[key[1] - 1], key.slice(3));
    switch (key) {
      case 'pressure': return fmt(S.pressure, 2);
      case 'sp': return fmt(c.sp, 1);
      case 'flow': return S.comm.fm ? fmt(S.flow, 1) : '— —';
      case 'demand': return fmt(S.demand, 0);
      case 'kw': return fmt(S.pm.kw, 1);
      case 'todayKwh': return fmt(S.today.kwh, 0);
      case 'todayM3': return fmt(S.today.m3, 0);
      case 'sec': return fmt(S.today.kwh / Math.max(1, S.today.m3), 3);
      case 'flowTotal': return fmt(S.flowTotal, 0);
      case 'kwhTotal': return fmt(S.kwhTotal, 0);
      case 'lead': return 'P-0' + S.lead;
      case 'lag': return 'P-0' + (3 - S.lead);
      case 'altLeft': return dur(c.altHours * 3600 - SIM.altElapsed() / 1000);   // alternation clock: counts in AUTO, frozen (not reset) in MANUAL
      case 'altLabel': return c.mode === 'MANUAL' ? 'สลับปั๊มหลัก · หยุดนับไว้ที่' : 'สลับปั๊มหลักครั้งถัดไปใน';
      case 'altNote': return c.mode === 'MANUAL' ? 'โหมด MANUAL — นับต่อเมื่อกลับเป็น AUTO' : 'รอบสลับทุก ' + c.altHours + ' ชม.';
      case 'lagTimer': return fmt(S.lagTimer, 0) + ' / ' + c.intervalStart + ' วิ';
      case 'stopTimer': return fmt(S.stopTimer, 0) + ' / ' + c.intervalStop + ' วิ';
      case 'mode': return c.mode;
      case 'pm.v1': return fmt(S.pm.v[0], 1); case 'pm.v2': return fmt(S.pm.v[1], 1); case 'pm.v3': return fmt(S.pm.v[2], 1);
      case 'pm.a1': return fmt(S.pm.a[0], 1); case 'pm.a2': return fmt(S.pm.a[1], 1); case 'pm.a3': return fmt(S.pm.a[2], 1);
      case 'pm.hz1': return fmt(S.pm.hz[0], 2); case 'pm.hz2': return fmt(S.pm.hz[1], 2); case 'pm.hz3': return fmt(S.pm.hz[2], 2);
      case 'pm.kw': return fmt(S.pm.kw, 1); case 'pm.pf': return fmt(S.pm.pf, 2);
      case 'phase': return S.phaseOK ? 'ปกติ' : 'ผิดปกติ';
      case 'clock': var d = new Date(); return dFmt(d) + ' · ' + tFmt(d, true);
      case 'ago': return Math.max(0, Math.round((Date.now() - S.lastUpdate) / 1000)) + ' วิ';
      case 'alarmCount': return String(S.alarms.length);
      case 'running': return String(S.pumps.filter(function (p) { return p.run; }).length) + ' / 2';
      case 'savedThbTotal': return fmt((S.pumps[0].savedKwh + S.pumps[1].savedKwh) * c.tariff, 0);
    }
    return '';
  }
  function statusOf(p) {
    if (offline()) return { cls: 'stop', t: '—' };
    if (!p.fault && !p.ready && !p.run) return { cls: 'warn', t: 'NOT READY' };
    if (p.fault) return { cls: 'fault', t: 'FAULT' };
    if (p.run) return { cls: 'run', t: 'RUN' };
    if (p.ready) return { cls: 'stop', t: 'READY' };
    return { cls: 'stop', t: 'STOP' };
  }
  function bindLive(root) {
    var TR = window.I18N ? I18N.tr : function (x) { return x; };
    $$('[data-v]', root).forEach(function (el) { var v = TR(val(el.getAttribute('data-v'))); if (el.textContent !== v) el.textContent = v; });
    $$('[data-st]', root).forEach(function (el) {
      var p = S.pumps[+el.getAttribute('data-st') - 1], st = statusOf(p);
      el.className = 'pill ' + st.cls; el.textContent = st.t;
    });
    $$('[data-role-pill]', root).forEach(function (el) {
      var p = S.pumps[+el.getAttribute('data-role-pill') - 1];
      var lead = S.lead === p.id; el.className = 'pill ' + (lead ? 'lead' : 'info'); el.textContent = lead ? 'LEAD' : 'LAG';
    });
    $$('[data-needle]', root).forEach(function (el) {
      var k = el.getAttribute('data-needle'), mn = +el.getAttribute('data-min'), mx = +el.getAttribute('data-max');
      var raw = parseFloat(val(k).replace(/,/g, '')); if (isNaN(raw)) raw = mn;
      var a = -120 + 240 * Math.max(0, Math.min(1, (raw - mn) / (mx - mn)));
      el.style.transform = 'rotate(' + a.toFixed(1) + 'deg)';
    });
    $$('[data-barw]', root).forEach(function (el) {
      var k = el.getAttribute('data-barw'), mx = +el.getAttribute('data-max');
      var raw = parseFloat(val(k).replace(/,/g, '')); el.style.width = Math.max(0, Math.min(100, raw / mx * 100)) + '%';
    });
    var lp = $('#livePill');
    if (lp) { var st = S.src === 'sim' ? ['warn', 'โหมดจำลอง'] : S.src === 'file' ? ['warn', 'ไฟล์ทดสอบ'] : offline() ? ['bad', 'ไม่ได้เชื่อมต่อ'] : ['ok', 'PLC ออนไลน์']; var d = lp.querySelector('.dot'); d.className = 'dot pulse ' + st[0]; var t = lp.querySelector('.lp-t'); if (t.getAttribute('data-k') !== st[1]) { t.setAttribute('data-k', st[1]); t.textContent = st[1]; } }
    drawModebar();
    var b = $('.bell .badge'); if (b) b.hidden = S.alarms.length === 0;
    $$('.nav-a[data-r="alarms"] .cnt, .bottom [data-r="alarms"] .cnt').forEach(function (el) { el.textContent = S.alarms.length; el.hidden = !S.alarms.length; });
  }

  // ---------- mode bar (Simulation / JSON test file / Live)
  var mbState = '';
  var SAMPLES = [['scenario-peak.json', 'ช่วงพีคเช้า · ปั๊มตัวที่ 2 เดินเสริม'], ['scenario-p01-fault.json', 'P-01 Fault → ปั๊มสำรองรับงาน'], ['scenario-power-estop.json', 'ไฟขาดเฟส + Emergency Stop']];
  function mmss(x) { x = Math.max(0, Math.round(x)); return Math.floor(x / 60) + ':' + ('0' + x % 60).slice(-2); }
  function drawModebar() {
    var mb = $('#modebar'); if (!mb) return;
    var src = S.src, conn = src === 'live' && window.LIVE && LIVE.connected();
    var info = src === 'file' && window.REPLAY ? REPLAY.info() : null;
    var key = src + (conn ? 1 : 0) + (window.LIVE ? LIVE.cfg().url : '') + (info ? info.name + info.playing + info.speed : '');
    if (key !== mbState) {
      mbState = key;
      mb.className = 'modebar ' + (src === 'sim' ? 'is-sim' : src === 'file' ? 'is-file' : conn ? 'is-live' : 'is-off');
      var right;
      if (src === 'sim') right = '<span class="mb-msg"><b>โหมดจำลอง</b> · ข้อมูลจากตัวจำลอง สั่งเปิด/ปิดปั๊ม วาล์ว และอุปกรณ์ทุกตัวได้ ระบบตอบสนองเหมือนจริง</span><a class="btn sm" href="#/station">🧪 แผงจำลองอุปกรณ์</a>';
      else if (src === 'file') right = info
        ? '<span class="mb-msg"><b>ไฟล์ทดสอบ</b> · ' + esc(info.name) + ' <span class="muted" id="rpNoteW" hidden>· <span id="rpNote"></span></span></span>' +
          '<div class="rp"><button class="btn sm" data-rp="play" aria-label="เล่น/หยุด">' + (info.playing ? '⏸ หยุด' : '▶ เล่น') + '</button>' +
          '<div class="tabs rp-spd" role="group" aria-label="ความเร็ว">' + [1, 5, 20].map(function (x) { return '<button data-rp-spd="' + x + '" class="' + (info.speed === x ? 'on' : '') + '">×' + x + '</button>'; }).join('') + '</div>' +
          '<input type="range" id="rpBar" min="0" max="' + info.duration + '" step="1" value="0" aria-label="ตำแหน่ง"><span class="rp-t" id="rpT"></span>' +
          '<button class="btn sm" data-rp="open">📂 เลือกไฟล์</button></div>'
        : '<span class="mb-msg"><b>ไฟล์ทดสอบ</b> · อัปโหลดไฟล์ JSON เพื่อให้หน้าจอทั้งหมดแสดงค่าตามไฟล์ — ทดสอบหน้าจอ ค่าตั้ง และ Alarm ได้โดยไม่ต้องต่ออุปกรณ์</span><button class="btn sm primary" data-rp="open">📂 เลือกไฟล์ JSON</button>';
      else right = conn ? '<span class="mb-msg"><b>ทำงานจริง</b> · เชื่อมต่อ Edge Gateway ' + esc(LIVE.cfg().url) + ' แล้ว คำสั่งจะส่งไปยัง PLC จริง</span><button class="btn sm" data-livecfg>ตั้งค่าการเชื่อมต่อ</button>'
        : '<span class="mb-msg"><b>ทำงานจริง</b> · ' + (LIVE && LIVE.cfg().url ? 'เชื่อมต่อ Edge Gateway ไม่ได้' : 'ยังไม่ได้ตั้งค่า Edge Gateway') + ' — ค่าจะแสดงเมื่อเชื่อมต่ออุปกรณ์จริง สั่งงานไม่ได้</span><button class="btn sm primary" data-livecfg>ตั้งค่าการเชื่อมต่อ</button>';
      var tab = function (k, label) { return '<button data-src="' + k + '" class="' + (src === k ? 'on' : '') + '" aria-pressed="' + (src === k) + '">' + label + '</button>'; };
      mb.innerHTML = '<div class="tabs mb-tabs" role="group" aria-label="แหล่งข้อมูล">' + tab('sim', '🧪 จำลอง') + tab('file', '📄 ไฟล์ทดสอบ') + tab('live', '⚡ ทำงานจริง') + '</div>' + right;
      var bar = $('#rpBar', mb); if (bar) bar.oninput = function () { REPLAY.seek(Number(bar.value)); };
    }
    if (info) {
      var bar2 = $('#rpBar', mb), tt = $('#rpT', mb), nt = $('#rpNote', mb);
      if (bar2 && document.activeElement !== bar2) bar2.value = Math.round(info.t);
      if (tt) tt.textContent = mmss(info.t) + ' / ' + mmss(info.duration);
      if (nt) { if (nt.getAttribute('data-n') !== info.note) { nt.setAttribute('data-n', info.note); nt.textContent = info.note; } nt.parentNode.hidden = !info.note; }
    }
  }
  // file picker + samples for the JSON test mode
  function fileModal() {
    modal('<h3>ทดสอบด้วยไฟล์ JSON</h3><p class="muted" style="margin-top:0">ค่าในไฟล์จะแสดงบนแดชบอร์ด สถานี 3 มิติ กราฟ และตรวจ Alarm เหมือนข้อมูลจาก PLC จริง ไฟล์เดียวกันใช้ทดสอบ Edge Gateway ได้ด้วย</p>' +
      '<label class="drop" id="rpDrop"><input type="file" id="rpFile" accept=".json,application/json" hidden><b>📂 เลือกไฟล์ หรือลากไฟล์มาวางที่นี่</b><small>รูปแบบ coredash.scenario/v1 · ขนาดไม่เกิน 5 MB</small></label>' +
      '<div id="rpErr" class="muted" role="alert"></div>' +
      '<div class="card-h" style="margin-top:14px"><h3 style="font-size:17px">หรือใช้ไฟล์ตัวอย่าง</h3></div><div class="stack" style="gap:8px">' +
      SAMPLES.map(function (x) { return '<div class="row" style="justify-content:space-between"><span>' + esc(x[1]) + '</span><span class="row" style="gap:6px"><button class="btn sm primary" data-sample="' + x[0] + '">ทดสอบ</button><a class="btn sm" href="samples/' + x[0] + '" download>ดาวน์โหลด</a></span></div>'; }).join('') +
      '</div><div class="row" style="justify-content:space-between;margin-top:18px"><button class="btn sm ghost" id="rpTpl">⬇ แม่แบบไฟล์ (จากค่าปัจจุบัน)</button><button class="btn ghost" data-close>ปิด</button></div>',
      function (el, close) {
        function done(r) {
          if (!r.ok) { $('#rpErr', el).innerHTML = '<span style="color:var(--red);font-weight:800">✕ ใช้ไฟล์นี้ไม่ได้</span><ul style="margin:6px 0 0 18px">' + r.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'; return; }
          if (S.src !== 'file') SIM.setSource('file');
          audit('ทดสอบ', 'โหลดไฟล์ทดสอบ JSON (' + r.frames + ' frames, ' + r.duration + ' วินาที)');
          toast('โหลดไฟล์ทดสอบแล้ว', r.frames + ' ช่วงเวลา · ' + mmss(r.duration) + ' นาที' + (r.unknown.length ? ' · ไม่รู้จัก ' + r.unknown.length + ' จุด: ' + r.unknown.slice(0, 3).join(', ') : ''), r.unknown.length ? 'warning' : 'ok');
          mbState = ''; close(); route();
        }
        function read(f) {
          if (!f) return; if (f.size > 5e6) return done({ ok: false, errors: ['ไฟล์ใหญ่เกิน 5 MB'] });
          var fr = new FileReader(); fr.onload = function () { done(REPLAY.loadText(fr.result, f.name)); }; fr.readAsText(f);
        }
        var inp = $('#rpFile', el), drop = $('#rpDrop', el);
        inp.onchange = function () { read(inp.files[0]); };
        drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
        drop.ondragleave = function () { drop.classList.remove('over'); };
        drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); read(e.dataTransfer.files[0]); };
        $$('[data-sample]', el).forEach(function (b) { b.onclick = function () { REPLAY.loadSample(b.getAttribute('data-sample')).then(done).catch(function (e) { done({ ok: false, errors: ['โหลดตัวอย่างไม่ได้: ' + e.message] }); }); }; });
        $('#rpTpl', el).onclick = function () { REPLAY.sampleTemplate(); };
      });
  }
  function liveCfgModal() {
    var c = LIVE.cfg();
    modal('<h3>เชื่อมต่อ Edge Gateway</h3><p class="muted" style="margin-top:0">ใส่ที่อยู่ของ CoreDash Edge Gateway ที่ติดตั้งในตู้ควบคุม และ API Key ที่ได้จากผู้ดูแลระบบ</p><div class="stack" style="gap:12px"><label>ที่อยู่ Gateway (URL)<input id="lcU" placeholder="https://192.168.10.5" value="' + esc(c.url) + '"></label><label>API Key<input id="lcK" placeholder="cdhl_live_..." value="' + esc(c.key) + '"></label><div id="lcR" class="muted"></div></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="lcT">ทดสอบการเชื่อมต่อ</button><button class="btn primary" id="lcS">บันทึก</button></div>',
      function (el, close) {
        $('#lcT', el).onclick = function () {
          var r = $('#lcR', el); r.textContent = 'กำลังทดสอบ…';
          LIVE.test({ url: $('#lcU', el).value, key: $('#lcK', el).value }).then(function (j) { r.innerHTML = '<span style="color:var(--green);font-weight:800">✓ เชื่อมต่อสำเร็จ</span> · อัปเดตล่าสุด ' + esc(j.last_update || ''); })
            .catch(function (e) { r.innerHTML = '<span style="color:var(--red);font-weight:800">✕ เชื่อมต่อไม่ได้</span> · ' + esc(e.message || e); });
        };
        $('#lcS', el).onclick = function () { LIVE.setCfg({ url: $('#lcU', el).value, key: $('#lcK', el).value }); audit('ตั้งค่า', 'เชื่อมต่อ Edge Gateway ' + $('#lcU', el).value); mbState = ''; close(); toast('บันทึกแล้ว', 'การเชื่อมต่อ Edge Gateway', 'ok'); };
      });
  }
  function setSource(src) {
    if (src === S.src) return;
    var T = { sim: ['เปลี่ยนเป็นโหมดจำลอง', 'ทดลองสั่งอุปกรณ์ได้ทุกตัว ไม่กระทบระบบจริง'], file: ['เปลี่ยนเป็นโหมดทดสอบด้วยไฟล์ JSON', 'หน้าจอแสดงค่าตามไฟล์ที่อัปโหลด'], live: ['เปลี่ยนเป็นโหมดทำงานจริง', 'อ่านค่าและสั่งงานผ่าน Edge Gateway'] }[src];
    SIM.setSource(src); audit('ตั้งค่า', T[0]);
    toast(T[0], T[1], 'info');
    if (src === 'live' && window.LIVE) LIVE.poll();
    if (src === 'file' && window.REPLAY) { REPLAY.restore(); if (!REPLAY.loaded()) setTimeout(fileModal, 50); }
    mbState = ''; route();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-src]'); if (b && b.closest('#modebar')) setSource(b.getAttribute('data-src'));
    if (e.target.closest('[data-livecfg]')) liveCfgModal();
    var rp = e.target.closest('[data-rp]');
    if (rp) { var k = rp.getAttribute('data-rp'); if (k === 'open') fileModal(); if (k === 'play') { REPLAY.play(); mbState = ''; drawModebar(); } }
    var sp = e.target.closest('[data-rp-spd]'); if (sp) { REPLAY.setSpeed(Number(sp.getAttribute('data-rp-spd'))); mbState = ''; drawModebar(); }
  });

  // ---------- gauge (240° arc)
  function gauge(key, min, max, unit, label, bands) {
    var R = 80, cx = 100, cy = 100;
    function pt(a, r) { var rad = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; }
    function arc(a0, a1, r) { var p0 = pt(a0, r), p1 = pt(a1, r); return 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); }
    var s = '<svg class="gauge" viewBox="0 0 200 170" role="img" aria-label="' + esc(label) + '">';
    s += '<path d="' + arc(-120, 120, R) + '" stroke="var(--line)" stroke-width="12" fill="none" stroke-linecap="round"/>';
    (bands || [[min, max, 'var(--blue)']]).forEach(function (b) {
      var a0 = -120 + 240 * (b[0] - min) / (max - min), a1 = -120 + 240 * (b[1] - min) / (max - min);
      s += '<path d="' + arc(a0, a1, R) + '" stroke="' + b[2] + '" stroke-width="12" fill="none" opacity=".9"/>';
    });
    for (var i = 0; i <= 10; i++) {
      var a = -120 + 24 * i, p0 = pt(a, R - 14), p1 = pt(a, R - (i % 5 ? 19 : 24));
      s += '<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) + '" stroke="var(--muted)" stroke-width="' + (i % 5 ? 1 : 1.8) + '"/>';
      if (i % 5 === 0) { var pl = pt(a, R - 36); s += '<text x="' + pl[0].toFixed(1) + '" y="' + (pl[1] + 4).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + fmt(min + (max - min) * i / 10, max - min < 10 ? 1 : 0) + '</text>'; }
    }
    s += '<g class="needle" data-needle="' + key + '" data-min="' + min + '" data-max="' + max + '" style="transform:rotate(-120deg)"><path d="M97 100 L100 30 L103 100 Z" fill="var(--amber)"/></g>';
    s += '<circle cx="100" cy="100" r="8" fill="var(--panel)" stroke="var(--amber)" stroke-width="3"/>';
    s += '<text x="100" y="140" text-anchor="middle" font-size="24" font-weight="700" fill="var(--text)" data-v="' + key + '">–</text>';
    s += '<text x="100" y="160" text-anchor="middle" font-size="11.5" fill="var(--muted)">' + esc(unit) + ' · ' + esc(label) + '</text></svg>';
    return s;
  }

  // ---------- line chart (SVG, multi-series, dual axis, hover tooltip)
  function lineChart(el, opt) {
    var W = Math.max(280, el.clientWidth || 600), H = opt.height || 260, m = { l: 46, r: opt.y2 ? 50 : 16, t: 14, b: 28 };
    var series = opt.series.filter(function (s) { return s.data && s.data.length; });
    if (!series.length) { el.innerHTML = '<div class="empty">ไม่มีข้อมูลในช่วงที่เลือก</div>'; return; }
    var t0 = Infinity, t1 = -Infinity, ax = { l: [Infinity, -Infinity], r: [Infinity, -Infinity] };
    series.forEach(function (s) { var a = ax[s.axis === 'r' ? 'r' : 'l']; s.data.forEach(function (d) { t0 = Math.min(t0, d[0]); t1 = Math.max(t1, d[0]); a[0] = Math.min(a[0], d[1]); a[1] = Math.max(a[1], d[1]); }); });
    function nice(a, fixed) { if (fixed) return fixed; if (a[0] === Infinity) return [0, 1]; var pad = (a[1] - a[0]) * 0.12 || Math.abs(a[1]) * 0.1 || 1; var lo = a[0] - pad, hi = a[1] + pad; var minSpan = Math.max(0.4, Math.abs(a[1]) * 0.1); if (hi - lo < minSpan) { var mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; } if (a[0] >= 0 && lo < 0) lo = 0; return [lo, hi]; }
    var yl = nice(ax.l, opt.yRange), yr = nice(ax.r, opt.y2Range);
    var X = function (t) { return m.l + (t - t0) / Math.max(1, t1 - t0) * (W - m.l - m.r); };
    var Y = function (v, r) { var a = r ? yr : yl; return m.t + (1 - (v - a[0]) / (a[1] - a[0] || 1)) * (H - m.t - m.b); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opt.label || 'กราฟแนวโน้ม') + '">';
    if (opt.bands) opt.bands.forEach(function (b) { var x0 = X(Math.max(t0, b[0])), x1 = X(Math.min(t1, b[1])); if (x1 > x0) s += '<rect x="' + x0 + '" y="' + m.t + '" width="' + (x1 - x0) + '" height="' + (H - m.t - m.b) + '" fill="' + b[2] + '"/>'; });
    for (var i = 0; i <= 4; i++) {
      var yv = yl[0] + (yl[1] - yl[0]) * i / 4, yy = Y(yv);
      s += '<line class="grid-l" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + fmt(yv, yl[1] - yl[0] < 1 ? 2 : yl[1] - yl[0] < 5 ? 1 : 0) + '</text>';
      if (opt.y2) { var yv2 = yr[0] + (yr[1] - yr[0]) * i / 4; s += '<text x="' + (W - m.r + 8) + '" y="' + (yy + 4) + '">' + fmt(yv2, yr[1] - yr[0] < 5 ? 1 : 0) + '</text>'; }
    }
    var span = t1 - t0, nt = Math.max(2, Math.min(8, Math.floor(W / 110)));
    for (var j = 0; j <= nt; j++) {
      var tt = t0 + span * j / nt, xx = X(tt);
      s += '<text x="' + xx + '" y="' + (H - 8) + '" text-anchor="' + (j === 0 ? 'start' : j === nt ? 'end' : 'middle') + '">' + (span > 2 * 86400e3 ? dFmt(tt) : tFmt(tt)) + '</text>';
    }
    if (opt.yLabel) s += '<text x="' + m.l + '" y="' + (m.t - 2) + '" font-size="10.5">' + esc(opt.yLabel) + '</text>';
    if (opt.y2) s += '<text x="' + (W - m.r) + '" y="' + (m.t - 2) + '" text-anchor="end" font-size="10.5">' + esc(opt.y2) + '</text>';
    series.forEach(function (sr, si) {
      var r = sr.axis === 'r', d = '';
      sr.data.forEach(function (p, k) { d += (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1], r).toFixed(1); });
      if (sr.area) {
        var gid = 'g' + Math.random().toString(36).slice(2, 7);
        s += '<defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + sr.color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + sr.color + '" stop-opacity="0"/></linearGradient></defs>';
        s += '<path d="' + d + 'L' + X(sr.data[sr.data.length - 1][0]).toFixed(1) + ' ' + (H - m.b) + 'L' + X(sr.data[0][0]).toFixed(1) + ' ' + (H - m.b) + 'Z" fill="url(#' + gid + ')"/>';
      }
      s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '" stroke-width="' + (sr.width || 2) + '"' + (sr.dash ? ' stroke-dasharray="' + sr.dash + '"' : '') + ' stroke-linejoin="round"/>';
    });
    s += '<line class="xh" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>';
    s += '<rect class="hov" x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '" fill="transparent"/></svg>';
    el.innerHTML = '<div class="chart">' + s + '<div class="tip" hidden></div></div>';
    var hov = el.querySelector('.hov'), tip = el.querySelector('.tip'), xh = el.querySelector('.xh');
    function move(ev) {
      var rect = el.querySelector('svg').getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left, t = t0 + (x - m.l) / (W - m.l - m.r) * span;
      var rows = series.map(function (sr) { var best = sr.data[0]; sr.data.forEach(function (p) { if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; }); return [sr, best]; });
      var bt = rows[0][1][0];
      xh.setAttribute('x1', X(bt)); xh.setAttribute('x2', X(bt)); xh.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '<div class="muted" style="margin-bottom:4px">' + (span > 2 * 86400e3 ? dFmt(bt) + ' ' : '') + tFmt(bt, span < 3600e3) + '</div>' + rows.map(function (r) { return '<div><i style="display:inline-block;width:10px;height:3px;background:' + r[0].color + ';margin-right:6px;vertical-align:middle"></i>' + esc(r[0].name) + ' <b>' + fmt(r[1][1], r[0].dec == null ? 2 : r[0].dec) + '</b> ' + esc(r[0].unit || '') + '</div>'; }).join('');
      var tx = X(bt) + 14; if (tx + 200 > W) tx = X(bt) - 214; tip.style.left = Math.max(0, tx) + 'px'; tip.style.top = (m.t + 6) + 'px';
    }
    hov.addEventListener('mousemove', move); hov.addEventListener('touchstart', move, { passive: true }); hov.addEventListener('touchmove', move, { passive: true });
    hov.addEventListener('mouseleave', function () { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
  }

  function barChart(el, opt) {
    var W = Math.max(280, el.clientWidth || 600), H = opt.height || 240, m = { l: 50, r: opt.line ? 50 : 12, t: 14, b: 30 };
    var n = opt.labels.length, max = 0;
    opt.series.forEach(function (s) { s.values.forEach(function (v, i) { if (opt.stacked) { var tot = opt.series.reduce(function (a, ss) { return a + ss.values[i]; }, 0); max = Math.max(max, tot); } else max = Math.max(max, v); }); });
    max *= 1.12;
    var bw = (W - m.l - m.r) / n, inner = opt.stacked ? bw * 0.6 : bw * 0.7 / opt.series.length;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opt.label || 'กราฟแท่ง') + '">';
    for (var i = 0; i <= 4; i++) { var v = max * i / 4, y = m.t + (1 - i / 4) * (H - m.t - m.b); s += '<line class="grid-l" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(v, 0) + '</text>'; }
    var every = Math.ceil(n / Math.max(1, Math.floor(W / 56)));
    opt.labels.forEach(function (lb, i) {
      var x0 = m.l + i * bw, acc = 0;
      opt.series.forEach(function (sr, k) {
        var v = sr.values[i], h = v / max * (H - m.t - m.b), x, y;
        if (opt.stacked) { x = x0 + (bw - inner) / 2; y = H - m.b - acc - h; acc += h; }
        else { x = x0 + bw * 0.15 + k * inner; y = H - m.b - h; }
        s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(2, inner - 2).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="3" fill="' + sr.color + '"><title>' + esc(lb + ' · ' + sr.name + ': ' + fmt(v, sr.dec || 0) + ' ' + (sr.unit || '')) + '</title></rect>';
      });
      if (i % every === 0) s += '<text x="' + (x0 + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(lb) + '</text>';
    });
    if (opt.line) {
      var lmax = Math.max.apply(null, opt.line.values) * 1.15, lmin = Math.min.apply(null, opt.line.values) * 0.85, d = '';
      opt.line.values.forEach(function (v, i) { var x = m.l + i * bw + bw / 2, y = m.t + (1 - (v - lmin) / (lmax - lmin)) * (H - m.t - m.b); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="' + opt.line.color + '"><title>' + esc(opt.labels[i] + ' · ' + opt.line.name + ': ' + fmt(v, 3)) + '</title></circle>'; });
      s += '<path d="' + d + '" fill="none" stroke="' + opt.line.color + '" stroke-width="2"/>';
      for (var j = 0; j <= 4; j++) { var y2 = m.t + (1 - j / 4) * (H - m.t - m.b); s += '<text x="' + (W - m.r + 6) + '" y="' + (y2 + 4) + '">' + fmt(lmin + (lmax - lmin) * j / 4, 3) + '</text>'; }
    }
    el.innerHTML = '<div class="chart">' + s + '</svg></div>';
  }

  function spark(data, color, w, h) {
    w = w || 96; h = h || 30;
    if (!data.length) return '';
    if (data.length === 1) data = [data[0], data[0]];   // one point (just after a test file loads) → flat line
    var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), d = '';
    data.forEach(function (v, i) { d += (i ? 'L' : 'M') + (i / (data.length - 1) * w).toFixed(1) + ' ' + (h - 2 - (v - mn) / ((mx - mn) || 1) * (h - 4)).toFixed(1); });
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  // ---------- router / pages
  var PAGES = {}, NAV = [
    { grp: 'ปฏิบัติการ' },
    { r: 'overview', t: 'ภาพรวมสถานี', s: 'Realtime Dashboard', i: 'overview' },
    { r: 'station', t: 'สถานี 3 มิติ', s: 'ภาพเคลื่อนไหว · สั่ง ON/OFF · ค่าเรียลไทม์', i: 'station' },
    { r: 'pumps', t: 'เครื่องสูบน้ำ & Inverter', s: 'P-01 / P-02 · ABB ACS580 37 kW', i: 'pumps' },
    { r: 'power', t: 'ไฟฟ้า & มิเตอร์', s: 'Power Meter M1M 20 · Flowmeter', i: 'power' },
    { r: 'control', t: 'ตั้งค่าการควบคุม', s: 'PID · Interval · สลับปั๊ม 6 ชม.', i: 'control' },
    { r: 'alarms', t: 'แจ้งเตือน', s: 'Alarm · Email · LINE OA · Telegram', i: 'alarms' },
    { grp: 'ข้อมูล' },
    { r: 'history', t: 'ประวัติ & แนวโน้ม', s: 'ข้อมูลย้อนหลังตามช่วงเวลา', i: 'history' },
    { r: 'reports', t: 'รายงาน', s: 'รายวัน / รายเดือน', i: 'reports' },
    { r: 'devices', t: 'อุปกรณ์ & เครือข่าย', s: 'สถานะการสื่อสาร', i: 'devices' },
    { grp: 'การดูแลระบบ' },
    { r: 'users', t: 'ผู้ใช้ & สิทธิ์', s: '3 ระดับ · Log การทำงาน', i: 'users' },
    { r: 'api', t: 'REST API', s: 'API Key · เอกสาร · ทดลองเรียก', i: 'api' },
    { grp: 'การตั้งค่า' },
    { r: 'settings', t: 'การแสดงผล & ภาษา', s: 'พื้นหลัง · สีหลัก · สีสถานี 3D · ไทย/English', i: 'settings' }
  ];
  var BOTTOM = ['overview', 'station', 'pumps', 'alarms'];
  var current = null, cleanup = null;

  function buildNav() {
    $('#sideNav').innerHTML = NAV.map(function (n) {
      if (n.grp) return '<div class="grp">' + n.grp + '</div>';
      return '<a class="nav-a" data-r="' + n.r + '" href="#/' + n.r + '">' + ic(n.i) + '<span>' + n.t + '</span>' + (n.r === 'alarms' ? '<span class="cnt" hidden></span>' : '') + '</a>';
    }).join('');
    $('#bottomNav').innerHTML = BOTTOM.map(function (r) {
      var n = NAV.find(function (x) { return x.r === r; });
      return '<a data-r="' + r + '" href="#/' + r + '">' + ic(n.i) + '<span>' + n.t.split(' ')[0].replace('เครื่องสูบน้ำ', 'ปั๊ม').replace('ภาพรวมสถานี', 'ภาพรวม').replace('สถานี', 'สถานี 3D') + '</span>' + (r === 'alarms' ? '<span class="cnt" hidden></span>' : '') + '</a>';
    }).join('') + '<button data-r="more" id="moreBtn">' + ic('more') + '<span>เมนู</span></button>';
    $('#sheetNav').innerHTML = NAV.filter(function (n) { return n.r; }).map(function (n) { return '<a class="nav-a" data-r="' + n.r + '" href="#/' + n.r + '">' + ic(n.i) + '<span>' + n.t + '</span></a>'; }).join('');
    $('#moreBtn').onclick = function () { $('#sheet').hidden = false; };
    $('#menuBtn').onclick = function () { $('#sheet').hidden = false; };
    $('#sheet').onclick = function (e) { if (e.target.id === 'sheet' || e.target.closest('a')) $('#sheet').hidden = true; };
  }

  function route() {
    if (!session) return;
    var r = (location.hash.replace(/^#\//, '') || 'overview').split('?')[0];
    if (!PAGES[r]) r = 'overview';
    var n = NAV.find(function (x) { return x.r === r; });
    $('#pageTitle').textContent = n.t; $('#pageSub').textContent = n.s;
    document.title = n.t + ' · CoreDash HydroLink';
    $$('[data-r]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-r') === r); });
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    current = PAGES[r];
    var v = $('#view'); v.innerHTML = '';
    cleanup = current.render(v) || null;
    bindLive(v); v.focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  SIM.on(function (type, a) {
    if (!session) return;
    if (type === 'tick') { bindLive(document); if (current && current.tick) current.tick($('#view')); }
    if (type === 'alarm') { toast('🔔 ' + a.text, a.tag + ' · แจ้งทาง ' + a.notified.map(function (n) { return n.ch === 'line' ? 'LINE OA' : n.ch === 'email' ? 'Email' : 'Telegram'; }).join(', '), a.sev); if (navigator.vibrate) try { navigator.vibrate(200); } catch (e) { } }
    if (type === 'alarm-clear') toast('กลับสู่ปกติ', a.text, 'ok');
    if (current && current.onEvent) current.onEvent(type, a, $('#view'));
  });

  // ---------- login
  function login(u, role) {
    var usr = users.find(function (x) { return x.u === u; });
    if (!usr) usr = { u: u, name: u, role: role || 'viewer', email: '', active: true };
    if (role) usr = users.find(function (x) { return x.role === role && x.active; }) || usr;
    if (!usr.active) { toast('บัญชีถูกระงับ', 'ติดต่อผู้ดูแลระบบ', 'warning'); return; }
    session = { u: usr.u, name: usr.name, role: usr.role, at: Date.now() };
    usr.last = Date.now(); saveUsers(); lsSet('session', session);
    audit('เข้าสู่ระบบ', (window.matchMedia('(max-width:720px)').matches ? 'Mobile' : 'Web') + ' · ' + ROLES[usr.role]);
    enter();
  }
  function enter() {
    $('#login').hidden = true; $('#shell').hidden = false;
    $('#userName').textContent = session.name; $('#userRole').textContent = ROLES[session.role];
    $('#umName').textContent = session.name; $('#umRole').textContent = ROLES[session.role] + ' · @' + session.u;
    $('#userAvatar').textContent = session.name.trim()[0];
    if (!location.hash) location.hash = '#/overview'; else route();
  }
  function logout() { if (window.CTRL) CTRL.lock(); audit('ออกจากระบบ', ''); session = null; lsSet('session', null); $('#shell').hidden = true; $('#login').hidden = false; $('#userMenu').hidden = true; }

  // ---------- theme & PWA
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); lsSet('theme', t); var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#EEF2FA' : '#081230'; if (current) route(); }
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; if (!ls('installDismissed', false) && window.matchMedia('(max-width:720px)').matches) $('#installBar').hidden = false; });

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.setAttribute('data-theme', ls('theme', 'light'));
    buildNav();
    $('#loginForm').onsubmit = function (e) { e.preventDefault(); var u = $('#lgUser').value.trim().toLowerCase(); login(u); };
    $$('[data-demo]').forEach(function (b) { b.onclick = function () { login(null, b.getAttribute('data-demo')); }; });
    $('#logoutBtn').onclick = logout;
    var lb = $('#langBtn'); if (lb) lb.onclick = function () { if (window.I18N) I18N.set(I18N.lang() === 'en' ? 'th' : 'en'); };
    $$('[data-login-lang]').forEach(function (b) { b.onclick = function () { if (window.I18N) I18N.set(b.getAttribute('data-login-lang')); }; });
    $('#themeBtn').onclick = function () { if (APP.toggleTheme) APP.toggleTheme(); else setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };
    $('#userBtn').onclick = function (e) { e.stopPropagation(); $('#userMenu').hidden = !$('#userMenu').hidden; };
    document.addEventListener('click', function (e) { if (!e.target.closest('#userMenu')) $('#userMenu').hidden = true; });
    var doInstall = function () { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; } $('#installBar').hidden = true; };
    $('#installBtn').onclick = doInstall; $('#installYes').onclick = doInstall;
    $('#installNo').onclick = function () { $('#installBar').hidden = true; lsSet('installDismissed', true); };
    window.addEventListener('hashchange', route);
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (current && current.resize) current.resize($('#view')); }, 200); });
    if (session) enter();
  });

  g.APP = {
    $: $, $$: $$, esc: esc, fmt: fmt, tFmt: tFmt, dFmt: dFmt, dtFmt: dtFmt, dur: dur, ic: ic, pad: pad,
    PAGES: PAGES, isEn: isEn, offline: offline, liveCfgModal: function () { liveCfgModal(); }, EN_M: EN_M, ROLES: ROLES, PERM: PERM, PERM_LABEL: PERM_LABEL, can: can, audit: audit, session: function () { return session; },
    users: function () { return users; }, setUsers: function (u) { users = u; saveUsers(); }, auditLog: function () { return auditLog; },
    fileModal: fileModal, setTheme: setTheme, route: function () { route(); }, buildNav: function () { buildNav(); }, toast: toast, modal: modal, confirmBox: confirmBox, csv: csv, val: val, bindLive: bindLive, gauge: gauge, lineChart: lineChart, barChart: barChart, spark: spark, statusOf: statusOf, ls: ls, lsSet: lsSet
  };
})(window);
