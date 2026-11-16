/* CoreDash HydroLink — appearance & language settings */
(function () {
  'use strict';
  var A = APP, $ = A.$, $$ = A.$$, esc = A.esc, S = SIM.state;
  var LIGHT = ['cream', 'pearl', 'softwhite', 'sage'];
  var BGS = [
    { id: 'cream', name: 'ครีม', sub: 'Classic Cream', light: true },
    { id: 'pearl', name: 'ขาวมุก', sub: 'Pearl White', light: true },
    { id: 'softwhite', name: 'ขาวนวล', sub: 'Soft White', light: true },
    { id: 'sage', name: 'เขียวถนอมสายตา', sub: 'Soft Sage', light: true },
    { id: 'grid', name: 'ตารางน้ำเงิน', sub: 'Navy Grid' },
    { id: 'aurora', name: 'ออโรร่า', sub: 'Aurora Glow' },
    { id: 'ocean', name: 'มหาสมุทร', sub: 'Deep Ocean' },
    { id: 'carbon', name: 'คาร์บอน', sub: 'Carbon Steel' },
    { id: 'plain', name: 'เรียบ', sub: 'Plain' }
  ];
  var ACCENTS = [['#2F6BFF', 'Blue'], ['#0891B2', 'Cyan'], ['#16A34A', 'Green'], ['#7C3AED', 'Violet'], ['#EA580C', 'Orange'], ['#E11D48', 'Rose']];
  function get() { return A.ls('appearance2', null) || { bg: 'cream', accent: '#2F6BFF', station: { preset: 'navy', custom: {} }, lastLight: 'cream', lastDark: 'grid' }; }
  function save(a) { if (LIGHT.indexOf(a.bg) >= 0) a.lastLight = a.bg; else a.lastDark = a.bg; A.lsSet('appearance2', a); apply(a); }
  function lighten(hex, amt) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
  function apply(a) {
    a = a || get();
    var b = document.body; BGS.forEach(function (x) { b.classList.remove('bg-' + x.id); }); b.classList.add('bg-' + (a.bg || 'cream'));
    var light = LIGHT.indexOf(a.bg || 'cream') >= 0, th = light ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', th); A.lsSet('theme', th);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(b).getPropertyValue('--bg').trim() || (light ? '#F7F2E7' : '#081230');
    var r = document.documentElement.style; r.setProperty('--blue', a.accent || '#2F6BFF'); r.setProperty('--blue2', lighten(a.accent || '#2F6BFF', 0.28));
    $$('.st-scene, .st-preview').forEach(function (el) { STATION.apply(el); });
  }
  A.applyAppearance = apply;
  A.toggleTheme = function () { var a = get(); a.bg = LIGHT.indexOf(a.bg) >= 0 ? (a.lastDark || 'grid') : (a.lastLight || 'cream'); save(a); if (A.route) A.route(); };
  document.addEventListener('DOMContentLoaded', function () { apply(); });

  function miniScene(colors) {
    // small 2-pump preview drawn flat-iso, uses the colours directly
    var c = colors;
    return '<svg viewBox="0 0 160 90" aria-hidden="true" style="width:100%;height:auto;display:block">' +
      '<polygon points="80,12 152,48 80,84 8,48" fill="' + c.floor + '"/><polygon points="80,12 152,48 80,84 8,48" fill="none" stroke="' + c.line + '" stroke-opacity=".35"/>' +
      '<rect x="26" y="20" width="22" height="34" rx="4" fill="' + c.tank + '"/><rect x="29" y="34" width="16" height="16" rx="2" fill="' + c.water + '" opacity=".7"/>' +
      '<path d="M48 48 L70 58 L104 42" fill="none" stroke="' + c.pipe + '" stroke-width="5" stroke-linecap="round"/><path d="M48 48 L70 58 L104 42" fill="none" stroke="' + c.water + '" stroke-width="2" stroke-dasharray="4 4"/>' +
      '<rect x="64" y="44" width="18" height="10" rx="2" fill="' + c.pump + '"/><rect x="86" y="34" width="18" height="10" rx="2" fill="' + c.pump + '"/>' +
      '<circle cx="64" cy="49" r="5" fill="' + c.casing + '"/><circle cx="86" cy="39" r="5" fill="' + c.casing + '"/>' +
      '<rect x="118" y="26" width="16" height="28" rx="2" fill="' + c.cabinet + '"/><rect x="121" y="32" width="10" height="7" fill="#071233"/></svg>';
  }

  A.PAGES.settings = {
    render: function (v) {
      var a = get(), self = this, lang = (window.I18N && I18N.lang()) || 'th', theme = LIGHT.indexOf(a.bg) >= 0 ? 'light' : 'dark';
      var st = a.station || { preset: 'navy', custom: {} }, cols = STATION.colors();
      function bgBtn(b) { return '<button class="bg-opt' + (a.bg === b.id ? ' on' : '') + '" data-bg="' + b.id + '" aria-pressed="' + (a.bg === b.id) + '"><span class="bg-sw bgsw-' + b.id + '"></span><b>' + b.name + '</b><small>' + b.sub + '</small></button>'; }
      v.innerHTML =
        '<div class="grid g2">' +
        '<div class="card"><div class="card-h"><h3>ภาษา / Language</h3></div><div class="tabs" role="group" aria-label="ภาษา"><button data-lang="th" class="' + (lang === 'th' ? 'on' : '') + '">ไทย</button><button data-lang="en" class="' + (lang === 'en' ? 'on' : '') + '">English</button></div><p class="muted" style="font-size:13px;margin:10px 0 0">เปลี่ยนภาษาทั้งระบบทันที รวมถึงแจ้งเตือนบนหน้าจอและรายงาน</p></div>' +
        '<div class="card"><div class="card-h"><h3>ธีม</h3></div><div class="tabs" role="group" aria-label="ธีม"><button data-theme-set="dark" class="' + (theme === 'dark' ? 'on' : '') + '">มืด</button><button data-theme-set="light" class="' + (theme === 'light' ? 'on' : '') + '">สว่าง</button></div><p class="muted" style="font-size:13px;margin:10px 0 0">ธีมมืดเหมาะกับห้องควบคุม ธีมสว่างเหมาะกับการพิมพ์รายงาน</p></div>' +
        '</div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>พื้นหลัง</h3></div><div class="bg-group">โทนสว่าง · สบายตา</div><div class="bg-pick">' +
        BGS.filter(function (b) { return b.light; }).map(bgBtn).join('') + '</div><div class="bg-group">โทนมืด · ห้องควบคุม</div><div class="bg-pick">' +
        BGS.filter(function (b) { return !b.light; }).map(function (b) { return '<button class="bg-opt' + (a.bg === b.id ? ' on' : '') + '" data-bg="' + b.id + '" aria-pressed="' + (a.bg === b.id) + '"><span class="bg-sw bgsw-' + b.id + '"></span><b>' + b.name + '</b><small>' + b.sub + '</small></button>'; }).join('') + '</div></div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>สีหลักของระบบ</h3></div><div class="row">' +
        ACCENTS.map(function (c) { return '<button class="acc' + (a.accent === c[0] ? ' on' : '') + '" data-acc="' + c[0] + '" style="--c:' + c[0] + '" aria-label="' + c[1] + '" aria-pressed="' + (a.accent === c[0]) + '"></button>'; }).join('') +
        '<label class="row" style="flex-direction:row;align-items:center;gap:8px;margin-left:8px">กำหนดเอง <input type="color" id="accCustom" value="' + (a.accent || '#2F6BFF') + '" style="width:48px;height:40px;padding:2px;border-radius:10px"></label></div></div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>สีสถานี 3 มิติ</h3><a class="btn sm" href="#/station">ดูสถานี 3D →</a></div>' +
        '<div class="preset-pick">' + Object.keys(STATION.PRESETS).map(function (k) { var p = STATION.PRESETS[k]; return '<button class="preset' + (st.preset === k ? ' on' : '') + '" data-preset="' + k + '" aria-pressed="' + (st.preset === k) + '">' + miniScene(p) + '<b>' + p.name + '</b></button>'; }).join('') + '</div>' +
        '<div class="muted" style="font-size:13px;margin:16px 0 8px">ปรับสีทีละส่วน</div><div class="col-pick">' +
        STATION.KEYS.map(function (k) { return '<label class="colk"><input type="color" data-ck="' + k + '" value="' + cols[k] + '"><span>' + STATION.KEY_LABEL[k] + '</span></label>'; }).join('') + '</div>' +
        '<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost sm" id="stReset">คืนค่าสีเริ่มต้น</button></div></div>';
      // ---- JSON files: export / import / record a test file ----
      var recInfo = window.REPLAY && REPLAY.recording();
      v.insertAdjacentHTML('beforeend', '<div class="card" style="margin-top:16px" id="jsonCard"><div class="card-h"><h3>ไฟล์ข้อมูล JSON</h3><a class="btn sm" href="#/api">REST API →</a></div>' +
        '<p class="muted" style="margin-top:0">ข้อมูลทุกจุดใช้ชื่อเดียวกับ REST API และ Edge Gateway (เช่น system.pressure, P-01.freq, CTRL.sp) เปิดไฟล์ด้วยโปรแกรมใดก็ได้</p>' +
        '<div class="json-grid">' +
        '<div><b>ส่งออกภาพรวม</b><small>ค่าล่าสุดทุกจุด + ค่าตั้ง + Alarm ที่ค้างอยู่</small><button class="btn sm" id="jsSnap">⬇ ดาวน์โหลด JSON</button></div>' +
        '<div><b>ส่งออกค่าตั้ง</b><small>Setpoint, PID, Interval, รอบสลับ, เกณฑ์ Alarm</small><button class="btn sm" id="jsCfgOut">⬇ ดาวน์โหลด JSON</button></div>' +
        '<div><b>นำเข้าค่าตั้ง</b><small>' + (A.can('setpoint') ? 'โหลดค่าตั้งจากไฟล์ (มีหน้ายืนยันก่อนใช้)' : 'เฉพาะผู้มีสิทธิ์ตั้งค่า PID / Interval') + '</small><label class="btn sm' + (A.can('setpoint') ? '' : ' disabled') + '">⬆ เลือกไฟล์<input type="file" id="jsCfgIn" accept=".json" hidden' + (A.can('setpoint') ? '' : ' disabled') + '></label></div>' +
        '<div><b>บันทึกเป็นไฟล์ทดสอบ</b><small>อัดค่าจากหน้าจอทุก 2 วินาที แล้วนำไปเล่นซ้ำในโหมดไฟล์ทดสอบ</small><button class="btn sm' + (recInfo ? ' primary' : '') + '" id="jsRec">' + (recInfo ? '⏹ หยุดและดาวน์โหลด (' + recInfo.frames + ')' : '⏺ เริ่มบันทึก') + '</button></div>' +
        '<div><b>ทดสอบด้วยไฟล์</b><small>อัปโหลดไฟล์ JSON ให้ทุกหน้าจอแสดงค่าตามไฟล์</small><button class="btn sm" id="jsOpen">📂 เปิดโหมดไฟล์ทดสอบ</button></div>' +
        '</div></div>');
      $('#jsSnap', v).onclick = function () { REPLAY.exportSnapshot(); A.toast('ดาวน์โหลดแล้ว', 'ภาพรวมระบบ (JSON)', 'ok'); };
      $('#jsCfgOut', v).onclick = function () { REPLAY.exportSettings(); A.toast('ดาวน์โหลดแล้ว', 'ค่าตั้ง (JSON)', 'ok'); };
      $('#jsCfgIn', v).onchange = function () {
        var f = this.files[0]; if (!f) return; var fr = new FileReader();
        fr.onload = function () {
          var x; try { x = JSON.parse(fr.result); } catch (e) { return A.toast('อ่านไฟล์ไม่ได้', e.message, 'warning'); }
          var p = POINTS.toCfg(x.settings || x), keys = Object.keys(p);
          if (!keys.length) return A.toast('ไม่พบค่าตั้งในไฟล์', 'ต้องมี settings เช่น "CTRL.sp": 4.0', 'warning');
          A.confirmBox('นำเข้าค่าตั้ง ' + keys.length + ' รายการ?', keys.map(function (k) { return esc(k) + ': <b>' + esc(S.cfg[k]) + '</b> → <b>' + esc(p[k]) + '</b>'; }).join('<br>'), 'นำเข้า').then(function (ok) {
            if (!ok) return;
            REPLAY.importSettings(fr.result); A.audit('ตั้งค่า', 'นำเข้าค่าตั้งจากไฟล์ JSON ' + keys.length + ' รายการ');
            A.toast('นำเข้าค่าตั้งแล้ว', keys.length + ' รายการ' + (S.src === 'live' ? ' · ส่งไป PLC แล้ว' : ''), 'ok');
          });
        };
        fr.readAsText(f);
      };
      $('#jsRec', v).onclick = function () {
        if (REPLAY.recording()) { var n = REPLAY.stopRecord(); A.toast('บันทึกไฟล์ทดสอบแล้ว', n + ' ช่วงเวลา', 'ok'); }
        else { REPLAY.startRecord(2); A.toast('เริ่มบันทึก', 'กดอีกครั้งเพื่อหยุดและดาวน์โหลด', 'info'); }
        self.render(v);
      };
      $('#jsOpen', v).onclick = function () { A.fileModal(); };
      $$('[data-lang]', v).forEach(function (b) { b.onclick = function () { if (window.I18N) I18N.set(b.getAttribute('data-lang')); self.render(v); }; });
      $$('[data-theme-set]', v).forEach(function (b) { b.onclick = function () { var want = b.getAttribute('data-theme-set'), x = get(), isL = LIGHT.indexOf(x.bg) >= 0; if ((want === 'light') !== isL) { x.bg = want === 'light' ? (x.lastLight || 'cream') : (x.lastDark || 'grid'); save(x); } self.render(v); }; });
      $$('[data-bg]', v).forEach(function (b) { b.onclick = function () { var x = get(); x.bg = b.getAttribute('data-bg'); save(x); self.render(v); }; });
      $$('[data-acc]', v).forEach(function (b) { b.onclick = function () { var x = get(); x.accent = b.getAttribute('data-acc'); save(x); self.render(v); }; });
      $('#accCustom', v).oninput = function () { var x = get(); x.accent = this.value; save(x); };
      $$('[data-preset]', v).forEach(function (b) { b.onclick = function () { var x = get(); x.station = { preset: b.getAttribute('data-preset'), custom: {} }; save(x); self.render(v); A.toast('เปลี่ยนสีสถานีแล้ว', STATION.PRESETS[x.station.preset].name, 'ok'); }; });
      $$('[data-ck]', v).forEach(function (i) { i.oninput = function () { var x = get(); x.station = x.station || { preset: 'navy', custom: {} }; x.station.custom = x.station.custom || {}; x.station.custom[i.getAttribute('data-ck')] = i.value; save(x); }; });
      $('#stReset', v).onclick = function () { var x = get(); x.station = { preset: 'navy', custom: {} }; save(x); self.render(v); };
    }
  };
})();
