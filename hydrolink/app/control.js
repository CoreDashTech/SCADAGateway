/* CoreDash HydroLink — safe operator control (ISA-101 style)
 *
 *  • Click a pump on the P&ID → a faceplate opens with live values and ON / OFF / Reset.
 *    No bare one-click buttons on the drawing: a stray click only opens the faceplate.
 *  • Commands are locked by default. "ปลดล็อกการสั่งงาน" asks for the user's control PIN (4–6 digits)
 *    and keeps control open for 5 minutes (extended by every command), then locks itself.
 *  • Every command still has a confirm step and is written to the user log. Viewers can only look.
 *  • 3 wrong PINs → 60 s lock-out (logged).
 * Used by the overview P&ID, the pumps page and the 3D station so all three behave the same.
 */
(function (g) {
  'use strict';
  var A = APP, S = SIM.state, $ = A.$, $$ = A.$$, esc = A.esc;
  var UNLOCK_MIN = 5, until = 0, fails = 0, blockedUntil = 0, timer = null;

  function sha(text) {
    if (g.crypto && crypto.subtle && g.isSecureContext) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      });
    }
    var h = 5381; for (var i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);   // fallback for plain http previews
    return Promise.resolve('d' + (h >>> 0).toString(16));
  }
  function me() { var s = A.session(); return s && A.users().find(function (u) { return u.u === s.u; }); }
  function unlocked() { return Date.now() < until; }
  function left() { return Math.max(0, Math.round((until - Date.now()) / 1000)); }
  function extend() { until = Date.now() + UNLOCK_MIN * 60e3; draw(); }
  function lock(reason) { if (!until) return; until = 0; draw(); if (reason) A.toast('ล็อกการสั่งงานแล้ว', reason, 'info'); }

  // ---------- top-bar lock chip
  function draw() {
    var host = $('.top-right'); if (!host) return;
    var chip = $('#ctrlChip');
    if (!chip) {
      chip = document.createElement('button'); chip.id = 'ctrlChip'; chip.className = 'ctrl-chip';
      host.insertBefore(chip, $('#livePill').nextSibling);
      chip.onclick = function () { unlocked() ? lock('ล็อกด้วยตนเอง') : unlock().catch(function () { }); };
    }
    var can = A.can('command');
    chip.hidden = !can;
    var on = unlocked(), s = left();
    chip.className = 'ctrl-chip ' + (on ? 'on' : 'off');
    var label = on ? 'สั่งงานได้ ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) : 'ล็อกการสั่งงาน';
    if (chip.getAttribute('data-l') !== label) { chip.setAttribute('data-l', label); chip.innerHTML = '<span aria-hidden="true">' + (on ? '🔓' : '🔒') + '</span><span class="hide-s">' + label + '</span>'; }
    chip.setAttribute('aria-label', on ? 'ปลดล็อกอยู่ — กดเพื่อล็อก' : 'การสั่งงานล็อกอยู่ — กดเพื่อปลดล็อกด้วย PIN');
    if (on && !timer) timer = setInterval(function () { if (!unlocked()) { clearInterval(timer); timer = null; lock('ครบ ' + UNLOCK_MIN + ' นาที — ล็อกอัตโนมัติ'); } else draw(); }, 1000);
  }

  // ---------- PIN dialog (set on first use, then verify)
  function unlock() {
    return new Promise(function (res, rej) {
      var u = me();
      if (!u || !A.can('command')) { A.toast('ไม่มีสิทธิ์สั่งงาน', 'บัญชีนี้ดูได้อย่างเดียว', 'warning'); return rej(); }
      if (Date.now() < blockedUntil) { A.toast('ใส่ PIN ผิดหลายครั้ง', 'ลองใหม่ในอีก ' + Math.ceil((blockedUntil - Date.now()) / 1000) + ' วินาที', 'warning'); return rej(); }
      var first = !u.pinHash, ok = false;
      A.modal('<h3>' + (first ? 'ตั้ง PIN สำหรับสั่งงาน' : 'ปลดล็อกการสั่งงาน') + '</h3>' +
        '<p class="muted" style="margin-top:0">' + (first ? 'ตั้งรหัส 4–6 หลักของคุณ (' + esc(u.name) + ') ใช้ทุกครั้งก่อนสั่งเปิด/ปิดอุปกรณ์ กันการกดโดยไม่ตั้งใจ' : 'ใส่ PIN ของ ' + esc(u.name) + ' — สั่งงานได้ ' + UNLOCK_MIN + ' นาที แล้วล็อกเอง') + '</p>' +
        '<form id="pinF" class="stack" style="gap:12px"><label>PIN<input id="pin1" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]{4,6}" class="pin-in" required></label>' +
        (first ? '<label>ยืนยัน PIN อีกครั้ง<input id="pin2" type="password" inputmode="numeric" autocomplete="off" maxlength="6" class="pin-in" required></label>' : '') +
        '<div id="pinErr" role="alert" style="color:var(--red);font-weight:700;min-height:1.2em"></div>' +
        '<div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>ยกเลิก</button><button class="btn primary">' + (first ? 'ตั้ง PIN และปลดล็อก' : 'ปลดล็อก') + '</button></div></form>',
        function (el, close) {
          $$('[data-close]', el).forEach(function (b) { b.addEventListener('click', function () { if (!ok) rej(); }); });
          $('#pin1', el).focus();
          $('#pinF', el).onsubmit = function (e) {
            e.preventDefault();
            var p1 = $('#pin1', el).value, err = $('#pinErr', el);
            if (!/^\d{4,6}$/.test(p1)) { err.textContent = 'PIN ต้องเป็นตัวเลข 4–6 หลัก'; return; }
            if (first) {
              if (p1 !== $('#pin2', el).value) { err.textContent = 'PIN สองช่องไม่ตรงกัน'; return; }
              if (/^(\d)\1+$/.test(p1) || '0123456789'.indexOf(p1) >= 0) { err.textContent = 'PIN ง่ายเกินไป (เช่น 1111, 1234) เลือกใหม่'; return; }
              sha(u.u + ':' + p1).then(function (h) {
                var us = A.users(); us.forEach(function (x) { if (x.u === u.u) x.pinHash = h; }); A.setUsers(us);
                A.audit('ความปลอดภัย', 'ตั้ง PIN สั่งงาน'); ok = true; close(); extend(); res();
              });
              return;
            }
            sha(u.u + ':' + p1).then(function (h) {
              if (h === u.pinHash) { fails = 0; ok = true; A.audit('ความปลอดภัย', 'ปลดล็อกการสั่งงาน ' + UNLOCK_MIN + ' นาที'); close(); extend(); res(); return; }
              fails++; A.audit('ความปลอดภัย', 'ใส่ PIN สั่งงานผิด (' + fails + ')');
              if (fails >= 3) { blockedUntil = Date.now() + 60e3; fails = 0; A.audit('ความปลอดภัย', 'ระงับการปลดล็อก 60 วินาที (PIN ผิด 3 ครั้ง)'); close(); rej(); A.toast('ใส่ PIN ผิด 3 ครั้ง', 'ระงับการปลดล็อก 60 วินาที', 'warning'); return; }
              err.textContent = 'PIN ไม่ถูกต้อง (เหลือ ' + (3 - fails) + ' ครั้ง)'; $('#pin1', el).value = ''; $('#pin1', el).focus();
            });
          };
        });
    });
  }

  // ---------- one path for every command: permission → unlock → confirm → send → log
  function run(o) {
    // o = { perm, title, body, okLabel, danger, exec: fn → boolean, audit, after }
    if (!A.can(o.perm || 'command')) { A.toast('ไม่มีสิทธิ์สั่งงาน', 'บัญชีนี้ดูได้อย่างเดียว', 'warning'); return; }
    var go = function () {
      A.confirmBox(o.title, o.body, o.okLabel, o.danger).then(function (yes) {
        if (yes) {
          var r = o.exec();
          extend();
          A.audit('สั่งงาน', o.audit + (r === false ? ' (ไม่สำเร็จ)' : ''));
          A.toast(r === false ? 'ไม่สามารถสั่งงานได้' : 'ส่งคำสั่งสำเร็จ', o.audit, r === false ? 'warning' : 'ok');
        }
        if (o.after) o.after();
      });
    };
    if (unlocked()) go(); else unlock().then(go).catch(function () { if (o.after) o.after(); });
  }
  function pumpCmd(id, c, after, where) {
    var p = S.pumps[id - 1];
    var label = { on: 'ON · Start (DI01)', off: 'OFF · Stop (DI01)', reset: 'Reset Fault (DI02)' }[c];
    var note = c === 'off' && S.cfg.mode === 'AUTO' && S.lead === id ? '<br><br><b>โหมด AUTO:</b> ปั๊มนี้เป็นปั๊มหลัก PLC จะสั่งกลับมาทำงานเพื่อรักษาแรงดัน — เปลี่ยนเป็น MANUAL ถ้าต้องการหยุดค้างไว้' : '';
    run({
      title: 'ยืนยันสั่ง ' + label + ' · P-0' + id,
      body: 'คำสั่งจะส่งไปยัง PLC FX5U → INV-0' + id + ' และบันทึกใน Log การทำงานของผู้ใช้' + note,
      okLabel: label, danger: c === 'off',
      exec: function () { return c === 'on' ? SIM.cmdStart(id) : c === 'off' ? SIM.cmdStop(id) : SIM.cmdReset(id); },
      audit: 'P-0' + id + ' ' + label + (where ? ' (' + where + ')' : ''),
      after: after
    });
  }

  // ---------- faceplate (opened by clicking a pump on the P&ID)
  function faceplate(id) {
    var p = S.pumps[id - 1], can = A.can('command');
    function body() {
      var st = A.statusOf(p), why = A.offline() ? [] : SIM.whyNot(p), on = unlocked();
      var dis = !can || !on ? ' disabled' : '';
      return '<div class="row" style="gap:6px;margin-bottom:10px;flex-wrap:wrap"><span class="pill ' + st.cls + '">' + st.t + '</span><span class="pill ' + (S.lead === id ? 'lead' : 'info') + '">' + (S.lead === id ? 'LEAD · ปั๊มหลัก' : 'LAG · ปั๊มเสริม') + '</span><span class="pill info">' + S.cfg.mode + '</span></div>' +
        '<div class="fp-grid">' +
        ['ความถี่', A.val('p' + id + '.freq') + ' Hz', 'กระแส', A.val('p' + id + '.current') + ' A', 'กำลัง', A.val('p' + id + '.power') + ' kW', 'แรงดันจ่าย', A.val('pressure') + ' bar', 'เดินต่อเนื่อง', A.val('p' + id + '.runFor'), 'ชั่วโมงสะสม', A.val('p' + id + '.hrs')]
          .reduce(function (h, x, i, a) { return i % 2 ? h : h + '<div><small>' + a[i] + '</small><b>' + esc(a[i + 1]) + '</b></div>'; }, '') + '</div>' +
        (why.length ? '<div class="fp-warn">⚠ ไม่พร้อม: ' + esc(why.join(', ')) + '</div>' : '') +
        (S.cfg.mode === 'AUTO' ? '<p class="muted" style="font-size:13.5px;margin:8px 0 0">โหมด AUTO: PLC เป็นผู้เปิด/ปิดปั๊มตามแรงดัน การสั่งจากที่นี่ใช้เมื่อจำเป็น</p>' : '') +
        (!can ? '<div class="fp-lock">👁 บัญชีนี้ดูได้อย่างเดียว</div>'
          : !on ? '<div class="fp-lock">🔒 การสั่งงานล็อกอยู่ <button class="btn sm primary" data-fp-unlock>ปลดล็อกด้วย PIN</button></div>'
            : '<div class="fp-lock on">🔓 สั่งงานได้อีก ' + Math.floor(left() / 60) + ':' + ('0' + left() % 60).slice(-2) + ' นาที</div>') +
        '<div class="row fp-btns"><button class="btn success" data-fp="on"' + dis + (p.run ? ' aria-pressed="true"' : '') + '>▶ ON</button><button class="btn danger" data-fp="off"' + dis + '>■ OFF</button>' +
        (p.fault ? '<button class="btn" data-fp="reset"' + dis + '>↺ Reset Fault</button>' : '') + '</div>';
    }
    A.modal('<div class="row" style="justify-content:space-between"><h3 style="margin:0">P-0' + id + ' · INV-0' + id + '</h3><button class="icon-btn" data-close aria-label="ปิด"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div id="fpBody" style="margin-top:12px"></div>' +
      '<div class="row" style="justify-content:space-between;margin-top:14px"><a class="btn sm ghost" href="#/pumps" data-close>รายละเอียด Inverter →</a><button class="btn ghost" data-close>ปิด</button></div>',
      function (el) {
        var bodyEl = $('#fpBody', el), last = '';
        var paint = function () { var h = body(); if (h !== last) { last = h; bodyEl.innerHTML = h; } };
        paint();
        var iv = setInterval(function () { if (!document.body.contains(bodyEl)) return clearInterval(iv); paint(); }, 1000);
        el.addEventListener('click', function (e) {
          var b = e.target.closest('[data-fp]'), u = e.target.closest('[data-fp-unlock]');
          if (u) { clearInterval(iv); unlock().then(function () { faceplate(id); }).catch(function () { faceplate(id); }); }
          if (b && !b.disabled) { clearInterval(iv); pumpCmd(id, b.getAttribute('data-fp'), function () { faceplate(id); }, 'ไดอะแกรม'); }
        });
      });
  }

  // P&ID: a click (or Enter) on a pump opens its faceplate
  document.addEventListener('click', function (e) { var g2 = e.target.closest('.pid-pump'); if (g2) faceplate(+g2.getAttribute('data-fpid')); });
  document.addEventListener('keydown', function (e) { var g2 = e.target.closest && e.target.closest('.pid-pump'); if (g2 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); faceplate(+g2.getAttribute('data-fpid')); } });
  // lock again on logout / when the tab is hidden for a long time
  document.addEventListener('visibilitychange', function () { if (document.hidden) g._hiddenAt = Date.now(); else if (g._hiddenAt && Date.now() - g._hiddenAt > 60e3) lock('หน้าจอถูกพักไว้ — ล็อกอัตโนมัติ'); });
  setInterval(draw, 2000);
  setTimeout(draw, 0); document.addEventListener('DOMContentLoaded', draw); window.addEventListener('hashchange', function () { setTimeout(draw, 50); });

  g.CTRL = { unlocked: unlocked, unlock: unlock, lock: lock, run: run, pumpCmd: pumpCmd, faceplate: faceplate, draw: draw, UNLOCK_MIN: UNLOCK_MIN };
})(window);
