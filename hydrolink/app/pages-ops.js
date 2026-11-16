/* CoreDash HydroLink — operations pages */
(function () {
  'use strict';
  var A = APP, S = SIM.state, $ = A.$, $$ = A.$$, esc = A.esc, fmt = A.fmt;

  // ---------------- P&ID mimic
  function mimicSVG() {
    function valve(x, y, vert) { return vert ? '<path d="M' + (x - 9) + ' ' + (y - 9) + ' L' + (x + 9) + ' ' + (y - 9) + ' L' + (x - 9) + ' ' + (y + 9) + ' L' + (x + 9) + ' ' + (y + 9) + ' Z" fill="var(--panel)" stroke="var(--muted)" stroke-width="1.6"/>' : '<path d="M' + (x - 9) + ' ' + (y - 9) + ' L' + (x + 9) + ' ' + (y + 9) + ' L' + (x + 9) + ' ' + (y - 9) + ' L' + (x - 9) + ' ' + (y + 9) + ' Z" fill="var(--panel)" stroke="var(--muted)" stroke-width="1.6"/>'; }
    function check(x, y) { return '<g><circle cx="' + x + '" cy="' + y + '" r="9" fill="var(--panel)" stroke="var(--muted)" stroke-width="1.6"/><path d="M' + (x - 4) + ' ' + (y - 5) + ' L' + (x + 5) + ' ' + y + ' L' + (x - 4) + ' ' + (y + 5) + 'Z" fill="var(--muted)"/></g>'; }
    function inst(x, y, tag, key, unit) {
      return '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y - 34) + '" stroke="var(--muted)" stroke-width="1.5"/>' +
        '<circle cx="' + x + '" cy="' + (y - 50) + '" r="16" fill="var(--panel2)" stroke="var(--cyan)" stroke-width="1.8"/>' +
        '<text x="' + x + '" y="' + (y - 46) + '" text-anchor="middle" class="lbl" style="font-size:10.5px;fill:var(--cyan)">' + tag + '</text>' +
        '<rect class="tagbox" x="' + (x - 40) + '" y="' + (y - 102) + '" width="80" height="28" rx="6"/>' +
        '<text x="' + x + '" y="' + (y - 83) + '" text-anchor="middle"><tspan class="val" data-v="' + key + '">–</tspan><tspan class="lbl"> ' + unit + '</tspan></text>';
    }
    function pump(id, y) {
      var x = 352;
      return '<g class="pid-pump" data-fpid="' + id + '" tabindex="0" role="button" aria-label="P-0' + id + ' — เปิดแผงควบคุม"><title>คลิกเพื่อเปิดแผงควบคุม P-0' + id + '</title>' +
        '<rect class="pid-hit" x="' + (x - 66) + '" y="' + (y - 88) + '" width="158" height="124" rx="12"/>' +
        '<rect x="' + (x - 36) + '" y="' + (y + 22) + '" width="112" height="10" rx="2" fill="var(--pipe)"/>' +
        '<rect x="' + (x + 22) + '" y="' + (y - 16) + '" width="52" height="32" rx="6" fill="var(--panel2)" stroke="var(--line2)"/>' +
        '<text x="' + (x + 48) + '" y="' + (y + 4) + '" text-anchor="middle" class="lbl" style="font-size:10px">37 kW</text>' +
        '<circle class="pumpbody" data-pb="' + id + '" cx="' + x + '" cy="' + y + '" r="24" fill="url(#gRun)" stroke="var(--line2)" stroke-width="1.5"/>' +
        '<g class="imp" data-imp="' + id + '"><path d="M' + x + ' ' + (y - 15) + ' L' + (x + 4) + ' ' + y + ' L' + x + ' ' + (y + 15) + ' L' + (x - 4) + ' ' + y + 'Z M' + (x - 15) + ' ' + y + ' L' + x + ' ' + (y + 4) + ' L' + (x + 15) + ' ' + y + ' L' + x + ' ' + (y - 4) + 'Z" fill="#E6EEFF"/></g>' +
        '<rect class="tagbox" x="' + (x - 62) + '" y="' + (y - 84) + '" width="150" height="44" rx="8"/>' +
        '<text x="' + (x - 52) + '" y="' + (y - 66) + '" class="val" style="font-size:13px">P-0' + id + ' · INV-0' + id + '</text>' +
        '<rect data-mst="' + id + '" x="' + (x + 40) + '" y="' + (y - 79) + '" width="42" height="17" rx="8" fill="var(--green)"/>' +
        '<text data-mstt="' + id + '" x="' + (x + 61) + '" y="' + (y - 67) + '" text-anchor="middle" style="font-family:var(--num);font-size:10px;font-weight:700;fill:#fff">RUN</text>' +
        '<text x="' + (x - 52) + '" y="' + (y - 48) + '" class="lbl"><tspan class="val" style="font-size:12px" data-v="p' + id + '.freq">–</tspan> Hz · <tspan class="val" style="font-size:12px" data-v="p' + id + '.current">–</tspan> A · <tspan data-v="p' + id + '.role" style="fill:var(--cyan);font-weight:700">–</tspan></text>' +
        '</g>';
    }
    var s = '<svg class="mimic" viewBox="0 0 920 430" role="img" aria-label="ไดอะแกรมกระบวนการ สถานีสูบจ่ายน้ำ">' +
      '<defs><linearGradient id="gRun" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4A86FF"/><stop offset="1" stop-color="#1B47C9"/></linearGradient>' +
      '<linearGradient id="gStop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5D6A8C"/><stop offset="1" stop-color="#36405C"/></linearGradient>' +
      '<linearGradient id="gFault" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset="1" stop-color="#B91C1C"/></linearGradient>' +
      '<linearGradient id="gWater" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3FD0F5" stop-opacity=".55"/><stop offset="1" stop-color="#1C7FD6" stop-opacity=".75"/></linearGradient></defs>' +
      // tank
      '<rect x="22" y="70" width="130" height="250" rx="8" fill="var(--panel2)" stroke="var(--line2)" stroke-width="1.5"/>' +
      '<path d="M24 140 Q 55 132 87 140 T 150 140 V 318 H24 Z" fill="url(#gWater)"><animate attributeName="d" dur="5s" repeatCount="indefinite" values="M24 140 Q 55 132 87 140 T 150 140 V 318 H24 Z;M24 140 Q 55 148 87 140 T 150 140 V 318 H24 Z;M24 140 Q 55 132 87 140 T 150 140 V 318 H24 Z"/></path>' +
      '<text x="87" y="98" text-anchor="middle" class="val" style="font-size:13px">ถังเก็บน้ำใส</text><text x="87" y="116" text-anchor="middle" class="lbl">Storage Water Tank</text>' +
      // suction header 14"
      '<path class="pipe" stroke-width="16" d="M152 290 H232 V130"/>' +
      '<path class="water" data-w="suction" stroke-width="5" d="M152 290 H232 V130"/>' +
      '<text x="160" y="278" class="lbl">Header 14″ (Ø350)</text>' +
      // future phase-2 tee
      '<path class="pipe future" stroke-width="10" d="M192 298 V392 H120"/>' + valve(192, 352, true) +
      '<text x="20" y="410" class="lbl">จุดต่อขยายในอนาคต · Tee + Gate Valve 14″</text>' +
      // P-02 row (y 150) & P-01 row (y 290)
      ['p2', 'p1'].map(function (p, i) {
        var y = i === 0 ? 150 : 290, id = i === 0 ? 2 : 1;
        return '<path class="pipe" stroke-width="12" d="M232 ' + y + ' H328"/><path class="water" data-w="' + p + 's" stroke-width="4" d="M232 ' + y + ' H328"/>' + valve(275, y) +
          '<text x="245" y="' + (y + 26) + '" class="lbl" style="font-size:10.5px">ดูด 10″</text>' +
          '<path class="pipe" stroke-width="10" d="M376 ' + y + ' H560"/><path class="water" data-w="' + p + 'd" stroke-width="4" d="M376 ' + y + ' H560"/>' + check(420, y) + valve(462, y) +
          '<text x="400" y="' + (y + 26) + '" class="lbl" style="font-size:10.5px">จ่าย 8″ · Flex · Check · Gate</text>' +
          inst(508, y, 'PT', 'p' + id + '.pt', 'bar') + pump(id, y);
      }).join('') +
      // discharge header 12"
      '<path class="pipe" stroke-width="14" d="M560 150 V290 M560 220 H900"/>' +
      '<path class="water" data-w="header" stroke-width="5" d="M560 150 V290 M560 220 H900"/>' +
      '<text x="570" y="246" class="lbl">ท่อจ่าย 12″ (Sch.40)</text>' +
      // flowmeter
      '<rect x="680" y="204" width="54" height="32" rx="8" fill="var(--panel2)" stroke="var(--cyan)" stroke-width="1.8"/>' +
      '<text x="707" y="225" text-anchor="middle" style="font-family:var(--num);font-size:11px;font-weight:700;fill:var(--cyan)">FT-01</text>' +
      '<rect class="tagbox" x="652" y="252" width="140" height="52" rx="8"/>' +
      '<text x="664" y="274"><tspan class="val" data-v="flow">–</tspan><tspan class="lbl"> m³/h</tspan></text>' +
      '<text x="664" y="294" class="lbl">Σ <tspan data-v="flowTotal">–</tspan> m³</text>' +
      '<path d="M880 210 l14 10 -14 10" fill="none" stroke="var(--cyan)" stroke-width="2.5"/>' +
      '<text x="900" y="196" text-anchor="end" class="val" style="font-size:12.5px">จ่ายผู้ใช้น้ำ</text><text x="900" y="180" text-anchor="end" class="lbl">ระบบจ่ายน้ำ</text>' +
      // control panel
      '<g transform="translate(760 300)"><rect width="150" height="106" rx="10" fill="var(--panel2)" stroke="var(--line2)"/>' +
      '<text x="12" y="22" class="val" style="font-size:12px">ตู้ควบคุม MCC</text>' +
      '<text x="12" y="42" class="lbl" style="font-size:10.5px">PLC FX5U · HMI 10″</text>' +
      '<text x="12" y="58" class="lbl" style="font-size:10.5px">PM M1M 20 · UPS 1kVA</text>' +
      '<circle cx="18" cy="80" r="5" data-phase-dot fill="var(--green)"/><text x="30" y="84" class="lbl" style="font-size:10.5px">Phase: <tspan data-v="phase">–</tspan></text>' +
      '<text x="12" y="99" class="lbl" style="font-size:10.5px">โหลด <tspan class="val" style="font-size:11px" data-v="kw">–</tspan> kW</text></g>' +
      // header pressure label
      '<rect class="tagbox" x="580" y="120" width="160" height="56" rx="10"/>' +
      '<text x="592" y="142" class="lbl">แรงดันจ่าย (SP <tspan data-v="sp">–</tspan>)</text>' +
      '<text x="592" y="166"><tspan class="val" style="font-size:20px" data-v="pressure">–</tspan><tspan class="lbl"> bar</tspan></text>' +
      '</svg>';
    return s;
  }
  function tickMimic(root) {
    var running = S.pumps.map(function (p) { return p.run && p.freq > 1; });
    var anyRun = running[0] || running[1];
    var dur = Math.max(0.35, Math.min(3, 140 / Math.max(10, S.flow))) + 's';
    function w(name, on) { $$('[data-w="' + name + '"]', root).forEach(function (el) { el.classList.toggle('on', !!on); el.style.setProperty('--dur', dur); }); }
    w('suction', anyRun); w('header', anyRun && S.comm.fm !== null);
    w('p1s', running[0]); w('p1d', running[0]); w('p2s', running[1]); w('p2d', running[1]);
    S.pumps.forEach(function (p) {
      var b = $('[data-pb="' + p.id + '"]', root), im = $('[data-imp="' + p.id + '"]', root), r = $('[data-mst="' + p.id + '"]', root), t = $('[data-mstt="' + p.id + '"]', root);
      if (!b) return;
      var st = A.statusOf(p);
      b.setAttribute('fill', p.fault ? 'url(#gFault)' : p.run ? 'url(#gRun)' : 'url(#gStop)');
      im.classList.toggle('on', p.run && p.freq > 1); im.style.setProperty('--spd', (0.5 * 50 / Math.max(10, p.freq)).toFixed(2) + 's');
      r.setAttribute('fill', p.fault ? 'var(--red)' : p.run ? 'var(--green)' : '#64748B'); t.textContent = st.t;
    });
    var pd = $('[data-phase-dot]', root); if (pd) pd.setAttribute('fill', S.phaseOK ? 'var(--green)' : 'var(--red)');
  }

  function logicCard() {
    return '<div class="card"><div class="card-h"><h3>ลอจิกควบคุม (PLC)</h3><span class="pill info" data-v="mode">AUTO</span></div>' +
      '<div class="row" style="gap:16px;align-items:center;margin-bottom:12px">' +
      '<svg width="92" height="92" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" stroke-width="9"/><circle id="altRing" cx="50" cy="50" r="42" fill="none" stroke="var(--cyan)" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 264" transform="rotate(-90 50 50)"/><text x="50" y="47" text-anchor="middle" style="font-family:var(--num);font-size:17px;font-weight:700;fill:var(--text)" data-v="lead">P-01</text><text x="50" y="63" text-anchor="middle" style="font-size:10px;fill:var(--muted)">LEAD</text></svg>' +
      '<div class="stack" style="gap:2px"><span class="muted" style="font-size:12.5px" data-v="altLabel">สลับปั๊มหลักครั้งถัดไปใน</span><b class="k-num" style="font-size:22px" data-v="altLeft">–</b><span class="muted" style="font-size:12.5px" data-v="altNote"></span></div></div>' +
      '<table class="runtab"><tr><th>ปั๊ม</th><th>สถานะ</th><th>เดินต่อเนื่อง</th><th>ชั่วโมงสะสม</th></tr>' +
      [1, 2].map(function (i) { return '<tr><td><b>P-0' + i + '</b></td><td data-v="p' + i + '.role"></td><td class="num" data-v="p' + i + '.runFor"></td><td class="num" data-v="p' + i + '.hrs"></td></tr>'; }).join('') + '</table>' +
      '<div class="stack" style="gap:10px">' +
      '<div><div class="row" style="justify-content:space-between;font-size:13px"><span class="muted">หน่วงก่อนสั่ง Lag Start</span><b class="num" data-v="lagTimer"></b></div><div class="bar"><i id="lagBar" style="width:0;background:var(--amber)"></i></div></div>' +
      '<div><div class="row" style="justify-content:space-between;font-size:13px"><span class="muted">หน่วงก่อนสั่ง Lag Stop</span><b class="num" data-v="stopTimer"></b></div><div class="bar"><i id="stopBar" style="width:0;background:var(--green)"></i></div></div>' +
      '<div class="kv" style="margin-top:4px"><div>PID Setpoint</div><div><span data-v="sp"></span> bar</div><div>PID Feedback (PT Lead)</div><div><span data-v="pressure"></span> bar</div><div>PID Output (Lead)</div><div><span id="pidOut">–</span> %</div></div>' +
      '</div></div>';
  }
  function tickLogic(root) {
    var ring = $('#altRing', root); if (!ring) return;
    var frac = Math.min(1, SIM.altElapsed() / (S.cfg.altHours * 3600e3));
    ring.setAttribute('stroke-dasharray', (264 * frac).toFixed(1) + ' 264');
    ring.setAttribute('stroke', S.cfg.mode === 'MANUAL' ? 'var(--amber)' : 'var(--cyan)');   // amber = paused
    var al = $('.k-num[data-v="altLeft"]', root); if (al) al.style.color = S.cfg.mode === 'MANUAL' ? '#B7791F' : '';
    $('#lagBar', root).style.width = Math.min(100, S.lagTimer / S.cfg.intervalStart * 100) + '%';
    $('#stopBar', root).style.width = Math.min(100, S.stopTimer / S.cfg.intervalStop * 100) + '%';
    $('#pidOut', root).textContent = A.offline() ? '—' : fmt(S.pumps[S.lead - 1].pidOut, 1);
  }

  function alarmMini() {
    if (!S.alarms.length) return '<div class="empty" style="padding:18px">ไม่มี Alarm ที่ค้างอยู่ · ระบบทำงานปกติ</div>';
    return S.alarms.slice(0, 4).map(function (a) {
      return '<div class="alm sev-' + a.sev + (a.sev === 'critical' && !a.ack ? ' blink-crit' : '') + '"><div><div class="t">' + esc(a.text) + '</div><div class="m">' + a.tag + ' · ' + A.tFmt(a.at, true) + (a.ack ? ' · รับทราบโดย ' + esc(a.ack.by) : '') + '</div></div>' +
        (A.can('ack') && !a.ack ? '<button class="btn sm" data-ack="' + a.id + '">รับทราบ</button>' : '<span class="pill ' + (a.ack ? 'info' : 'warn') + '">' + (a.ack ? 'ACK' : 'ใหม่') + '</span>') + '</div>';
    }).join('');
  }
  function bindAck(root) {
    $$('[data-ack]', root).forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-ack'); SIM.ack(id, A.session().u); A.audit('รับทราบ Alarm', id); A.toast('รับทราบแล้ว', id, 'ok'); var box = $('#almMini', root); if (box) { box.innerHTML = alarmMini(); bindAck(root); } };
    });
  }

  function feedHTML() {
    return S.events.slice(0, 30).map(function (e) {
      var c = { run: 'ok', stage: 'warn', alt: 'info', cmd: 'info', demo: 'warn', info: 'ok' }[e.kind] || 'info';
      return '<div class="feed-i"><time>' + A.tFmt(e.at, true) + '</time><div><span class="dot ' + c + '" style="margin:0 6px 0 0;vertical-align:1px"></span>' + esc(e.text) + '</div></div>';
    }).join('') || '<div class="empty">ยังไม่มีเหตุการณ์</div>';
  }

  function liveTrend(el) {
    var tr = S.trend;
    A.lineChart(el, {
      height: 250, label: 'แนวโน้มสด 15 นาที', yLabel: 'bar', y2: 'm³/h', yRange: [0, 6], y2Range: [0, 320],
      series: [
        { name: 'แรงดัน', unit: 'bar', color: '#5B8CFF', data: tr.map(function (d) { return [d.t, d.p]; }), area: true },
        { name: 'Setpoint', unit: 'bar', color: '#F5A524', dash: '5 4', width: 1.5, data: tr.map(function (d) { return [d.t, d.sp]; }) },
        { name: 'อัตราการไหล', unit: 'm³/h', color: '#22C3EE', axis: 'r', dec: 1, data: tr.map(function (d) { return [d.t, d.q]; }) }
      ]
    });
  }

  A.PAGES.overview = {
    render: function (v) {
      var tq = S.trend.slice(-60);
      v.innerHTML =
        '<div class="grid g6">' +
        kpi('แรงดันจ่าย', 'pressure', 'bar', 'SP <b data-v="sp"></b> bar', '#5B8CFF', tq.map(function (d) { return d.p; })) +
        kpi('อัตราการไหล', 'flow', 'm³/h', 'ความต้องการ <b data-v="demand"></b>', '#22C3EE', tq.map(function (d) { return d.q; })) +
        kpi('กำลังไฟฟ้ารวม', 'kw', 'kW', 'Power Meter M1M 20', '#F5A524', tq.map(function (d) { return d.kw; })) +
        kpi('ปั๊มทำงาน', 'running', '', 'Lead <b data-v="lead"></b> · <b data-v="mode"></b>', '#22C55E') +
        kpi('น้ำจ่ายวันนี้', 'todayM3', 'm³', 'สะสม <b data-v="flowTotal"></b> m³', '#8B5CF6') +
        kpi('พลังงานต่อน้ำ', 'sec', 'kWh/m³', 'วันนี้ <b data-v="todayKwh"></b> kWh', '#14B8A6') +
        '</div>' +
        '<div class="main-side" style="margin-top:16px">' +
        '<div class="card"><div class="card-h"><h3>ไดอะแกรมกระบวนการ <span class="muted" style="font-weight:400">· P&amp;ID แบบเรียลไทม์</span></h3><span class="pid-hint">👆 คลิกที่ปั๊มเพื่อดูและสั่งงาน</span><div class="legend"><span><i style="background:var(--cyan)"></i>น้ำไหล</span><span><i style="background:var(--green)"></i>RUN</span><span><i style="background:#64748B"></i>STOP/READY</span><span><i style="background:var(--red)"></i>FAULT</span></div></div><div class="mimic-wrap">' + mimicSVG() + '</div><div class="muted only-m" style="font-size:12px;margin-top:6px">← เลื่อนดูไดอะแกรม →</div></div>' +
        '<div class="stack">' + logicCard() +
        '<div class="card"><div class="card-h"><h3>Alarm ที่ค้างอยู่</h3><a href="#/alarms" class="muted" style="font-size:13px">ดูทั้งหมด →</a></div><div class="stack" id="almMini" style="gap:8px">' + alarmMini() + '</div></div>' +
        '</div></div>' +
        '<div class="main-side" style="margin-top:16px">' +
        '<div class="card"><div class="card-h"><h3>แนวโน้มสด 15 นาที</h3><div class="legend"><span><i style="background:#5B8CFF"></i>แรงดัน (bar)</span><span><i style="background:#F5A524"></i>Setpoint</span><span><i style="background:#22C3EE"></i>อัตราการไหล (m³/h)</span></div></div><div id="liveChart"></div></div>' +
        '<div class="card"><div class="card-h"><h3>บันทึกเหตุการณ์</h3><span class="muted">ล่าสุด</span></div><div class="feed" id="feed">' + feedHTML() + '</div></div>' +
        '</div>' +
        (A.can('demo') && S.src === 'sim' ? '<div class="card no-print" style="margin-top:16px"><div class="card-h"><h3>โหมดนำเสนอ · จำลองเหตุการณ์</h3><span class="muted">ใช้สาธิตการทำงานของลอจิกและการแจ้งเตือน (เฉพาะโหมดสาธิต)</span></div><div class="row">' +
          '<button class="btn sm" data-inj="peak">💧 ความต้องการน้ำสูง (ดู Lag Start)</button>' +
          '<button class="btn sm" data-inj="fault1">⚠️ P-01 Fault 2310</button><button class="btn sm" data-inj="fault2">⚠️ P-02 Fault 4310</button>' +
          '<button class="btn sm" data-inj="phase">⚡ ไฟขาดเฟส 25 วิ</button><button class="btn sm" data-inj="comm">📡 Flowmeter ขาดการสื่อสาร</button>' +
          '<button class="btn sm success" data-inj="clear">✓ คืนค่าปกติ</button>' + (A.can('alternate') ? '<button class="btn sm" id="altNow">⇄ สลับปั๊มหลักทันที</button>' : '') + '</div></div>' : '');
      liveTrend($('#liveChart', v));
      bindAck(v);
      $$('[data-inj]', v).forEach(function (b) { b.onclick = function () { SIM.inject(b.getAttribute('data-inj')); A.audit('โหมดสาธิต', b.textContent.trim()); A.toast('จำลองเหตุการณ์', b.textContent.trim(), 'info'); }; });
      var an = $('#altNow', v); if (an) an.onclick = function () { CTRL.run({ perm: 'alternate', title: 'สลับปั๊มหลักทันที?', body: 'ระบบจะส่งต่อการทำงานจาก ' + A.val('lead') + ' ไป ' + A.val('lag') + ' และเริ่มนับรอบ ' + S.cfg.altHours + ' ชม. ใหม่', okLabel: 'สลับปั๊ม', exec: function () { SIM.alternateNow(); }, audit: 'สลับปั๊มหลักทันที → ' + A.val('lag') }); };
      tickMimic(v); tickLogic(v);
      this._n = 0;
    },
    tick: function (v) {
      tickMimic(v); tickLogic(v);
      if (++this._n % 5 === 0) liveTrend($('#liveChart', v));
    },
    onEvent: function (type, a, v) {
      if (type === 'event') { var f = $('#feed', v); if (f) f.innerHTML = feedHTML(); }
      if (type === 'alarm' || type === 'alarm-clear' || type === 'ack') { var m = $('#almMini', v); if (m) { m.innerHTML = alarmMini(); bindAck(v); } }
    },
    resize: function (v) { liveTrend($('#liveChart', v)); }
  };
  function kpi(lbl, key, unit, sub, color, sp) {
    return '<div class="card kpi" style="--accent:' + color + '"><div class="lbl">' + lbl + '</div><div class="val"><span data-v="' + key + '">–</span><small>' + unit + '</small></div><div class="sub">' + sub + '</div>' + (sp ? A.spark(sp, color, 90, 28) : '') + '</div>';
  }

  // ---------------- pumps
  function pumpCard(id) {
    var p = 'p' + id, canCmd = A.can('command');
    return '<div class="card"><div class="card-h"><h3>P-0' + id + ' <span data-st="' + id + '" class="pill">–</span><span data-role-pill="' + id + '" class="pill">–</span></h3>' +
      '<span class="muted">ABB ACS580-01-073A-4+J400 · 37 kW · FMBT-21 @ 192.168.10.2' + id + '</span></div>' +
      '<div class="grid g3" style="gap:8px;margin-bottom:8px">' +
      A.gauge(p + '.freq', 0, 50, 'Hz', 'Output Frequency', [[0, 45, 'var(--blue)'], [45, 50, 'var(--amber)']]) +
      A.gauge(p + '.current', 0, 80, 'A', 'Motor Current', [[0, 60, 'var(--blue)'], [60, 68, 'var(--amber)'], [68, 80, 'var(--red)']]) +
      A.gauge(p + '.pt', 0, 10, 'bar', 'Pressure Transmitter ' + id, [[0, 3.5, 'var(--amber)'], [3.5, 5.5, 'var(--green)'], [5.5, 10, 'var(--red)']]) +
      '</div>' +
      '<div class="row no-print" style="margin-bottom:14px">' +
      '<button class="btn success sm" data-cmd="start" data-p="' + id + '"' + (canCmd ? '' : ' disabled') + '>▶ Start (DI01)</button>' +
      '<button class="btn danger sm" data-cmd="stop" data-p="' + id + '"' + (canCmd ? '' : ' disabled') + '>■ Stop (DI01)</button>' +
      '<button class="btn sm" data-cmd="reset" data-p="' + id + '"' + (canCmd ? '' : ' disabled') + '>↺ Reset Fault (DI02)</button>' +
      (canCmd ? '' : '<span class="muted" style="font-size:12.5px">🔒 สิทธิ์ผู้ดูข้อมูล — สั่งงานไม่ได้</span>') + '</div>' +
      '<div class="grid g2" style="gap:18px">' +
      '<div><div class="muted" style="font-size:12.5px;font-weight:700;margin-bottom:4px">มอเตอร์ & ไฟฟ้า</div><div class="kv">' +
      kv('Output Frequency', p + '.freq', 'Hz') + kv('Motor Speed', p + '.speed', 'rpm') + kv('Motor Current', p + '.current', 'A') + kv('Motor Torque', p + '.torque', '%') +
      kv('Output Power', p + '.power', 'kW') + kv('DC Bus Voltage', p + '.dcbus', 'V') + kv('Output Voltage', p + '.vout', 'V') + kv('Current Pressure Transmitter', p + '.pt', 'bar') +
      '</div></div>' +
      '<div><div class="muted" style="font-size:12.5px;font-weight:700;margin-bottom:4px">พลังงาน · ชั่วโมงทำงาน · PID</div><div class="kv">' +
      kv('Output Energy', p + '.energy', 'kWh') + kv('Saved Energy', p + '.saved', 'kWh') + kv('Saved Amount', p + '.savedThb', '฿') +
      kv('Inverter Run Time', p + '.inv', 'h') + kv('Motor Run Time', p + '.motor', 'h') + kv('Cooling Fan Run Time', p + '.fan', 'h') +
      kv('PID Setpoint / Output', 'sp', 'bar', p + '.pid', '%') + kv('จำนวนครั้งที่สตาร์ท', p + '.starts', 'ครั้ง') +
      '</div></div></div>' +
      '<div class="row" style="margin-top:14px;justify-content:space-between"><div><span class="muted" style="font-size:12.5px">Active Faults / Warnings</span><div class="k-num" data-v="' + p + '.fault">–</div></div>' +
      '<div class="row" style="gap:6px"><span class="muted" style="font-size:12.5px">Status</span><span class="pill" id="sRun' + id + '">Run</span><span class="pill" id="sStop' + id + '">Stop</span><span class="pill" id="sReady' + id + '">Ready</span></div></div>' +
      '<div class="muted" style="font-size:12.5px;font-weight:700;margin:16px 0 6px">Fault History (Fault Log)</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>เวลาเกิด</th><th>รหัส</th><th>รายละเอียด</th><th>เคลียร์</th></tr></thead><tbody id="flog' + id + '"></tbody></table></div>' +
      '</div>';
  }
  function kv(lbl, key, unit, key2, unit2) { return '<div>' + lbl + '</div><div><span data-v="' + key + '">–</span> ' + unit + (key2 ? ' / <span data-v="' + key2 + '">–</span> ' + unit2 : '') + '</div>'; }
  function renderFaultLog(v) {
    S.pumps.forEach(function (p) {
      var tb = $('#flog' + p.id, v); if (!tb) return;
      tb.innerHTML = p.faultLog.map(function (f) { return '<tr><td class="num">' + A.dtFmt(f.at) + '</td><td class="k-num">' + f.code + '</td><td>' + esc(SIM.FAULTS[f.code] || '') + '</td><td>' + (f.cleared ? '<span class="muted num">' + A.dtFmt(f.cleared) + '</span>' : '<span class="pill fault">ค้างอยู่</span>') + '</td></tr>'; }).join('');
    });
  }
  function tickStatus(v) {
    S.pumps.forEach(function (p) {
      var r = $('#sRun' + p.id, v); if (!r) return;
      r.className = 'pill ' + (p.run ? 'run' : 'stop'); $('#sStop' + p.id, v).className = 'pill ' + (!p.run ? 'warn' : 'stop'); $('#sReady' + p.id, v).className = 'pill ' + (p.ready ? 'run' : 'fault');
    });
  }
  A.PAGES.pumps = {
    render: function (v) {
      v.innerHTML = '<div class="grid g2">' + pumpCard(1) + pumpCard(2) + '</div>' +
        '<div class="card" style="margin-top:16px"><div class="card-h"><h3>ความถี่ขาออก P-01 / P-02 · 15 นาที</h3><div class="legend"><span><i style="background:#5B8CFF"></i>P-01 Hz</span><span><i style="background:#22C3EE"></i>P-02 Hz</span></div></div><div id="fChart"></div></div>';
      renderFaultLog(v); tickStatus(v); this.chart(v);
      $$('[data-cmd]', v).forEach(function (b) {
        b.onclick = function () { CTRL.pumpCmd(+b.getAttribute('data-p'), { start: 'on', stop: 'off', reset: 'reset' }[b.getAttribute('data-cmd')], function () { renderFaultLog(v); }, 'หน้าเครื่องสูบน้ำ'); };
      });
      this._n = 0;
    },
    chart: function (v) {
      var tr = S.trend;
      A.lineChart($('#fChart', v), { height: 220, yRange: [0, 55], yLabel: 'Hz', series: [{ name: 'P-01', unit: 'Hz', dec: 1, color: '#5B8CFF', data: tr.map(function (d) { return [d.t, d.f1]; }) }, { name: 'P-02', unit: 'Hz', dec: 1, color: '#22C3EE', data: tr.map(function (d) { return [d.t, d.f2]; }) }] });
    },
    tick: function (v) { tickStatus(v); if (++this._n % 5 === 0) this.chart(v); },
    onEvent: function (t, a, v) { if (t === 'alarm' || t === 'event') renderFaultLog(v); },
    resize: function (v) { this.chart(v); }
  };

  // ---------------- power & meters
  function odo(key) { return '<span class="k-num" style="font-size:26px;letter-spacing:1px;padding:6px 12px;border-radius:10px;background:var(--bg2);border:1px solid var(--line2);display:inline-block" data-v="' + key + '">–</span>'; }
  A.PAGES.power = {
    render: function (v) {
      var ph = function (n) { return '<tr><td><b>L' + n + '</b></td><td class="r num"><span data-v="pm.v' + n + '"></span> V</td><td style="width:22%"><div class="bar"><i data-barw="pm.v' + n + '" data-max="440" style="background:var(--blue)"></i></div></td><td class="r num"><span data-v="pm.a' + n + '"></span> A</td><td style="width:22%"><div class="bar"><i data-barw="pm.a' + n + '" data-max="160" style="background:var(--amber)"></i></div></td><td class="r num"><span data-v="pm.hz' + n + '"></span> Hz</td></tr>'; };
      v.innerHTML = '<div class="grid g2">' +
        '<div class="card"><div class="card-h"><h3>Power Meter · M1M 20 (Modbus TCP)</h3><span class="muted">192.168.10.30 · อ่านทุก 1 วินาที</span></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>เฟส</th><th class="r">Voltage</th><th></th><th class="r">Current</th><th></th><th class="r">Frequency</th></tr></thead><tbody>' + ph(1) + ph(2) + ph(3) + '</tbody></table></div>' +
        '<div class="grid g3" style="margin-top:14px;gap:12px"><div><div class="muted" style="font-size:12.5px">กำลังไฟฟ้า</div><div class="k-num" style="font-size:24px"><span data-v="pm.kw"></span> <small class="muted">kW</small></div></div><div><div class="muted" style="font-size:12.5px">Power Factor</div><div class="k-num" style="font-size:24px" data-v="pm.pf"></div></div><div><div class="muted" style="font-size:12.5px">Phase Protection</div><div id="phaseBox"></div></div></div>' +
        '<div style="margin-top:14px"><div class="muted" style="font-size:12.5px;margin-bottom:6px">Totalizer (kWh)</div>' + odo('kwhTotal') + '</div></div>' +
        '<div class="card"><div class="card-h"><h3>Flowmeter FT-01 · RS485 → TCP</h3><span class="muted">192.168.10.40 · Modbus RTU over TCP</span></div>' +
        '<div class="grid g2" style="align-items:center">' + A.gauge('flow', 0, 300, 'm³/h', 'Flow Rate', [[0, 200, 'var(--cyan)'], [200, 260, 'var(--amber)'], [260, 300, 'var(--red)']]) +
        '<div class="stack" style="gap:12px"><div><div class="muted" style="font-size:12.5px;margin-bottom:6px">Totalizer (m³)</div>' + odo('flowTotal') + '</div><div class="kv"><div>น้ำจ่ายวันนี้</div><div><span data-v="todayM3"></span> m³</div><div>ความต้องการปัจจุบัน</div><div><span data-v="demand"></span> m³/h</div><div>ค่าพลังงานจำเพาะ</div><div><span data-v="sec"></span> kWh/m³</div></div></div></div></div>' +
        '</div>' +
        '<div class="main-side" style="margin-top:16px"><div class="card"><div class="card-h"><h3>พลังงานและน้ำจ่าย 14 วันล่าสุด</h3><div class="legend"><span><i style="background:#5B8CFF"></i>kWh</span><span><i style="background:#F5A524"></i>kWh/m³</span></div></div><div id="eChart"></div></div>' +
        '<div class="card"><div class="card-h"><h3>พลังงานที่ประหยัดได้ (Inverter)</h3></div><div class="kv">' +
        '<div>P-01 Saved Energy</div><div><span data-v="p1.saved"></span> kWh</div><div>P-02 Saved Energy</div><div><span data-v="p2.saved"></span> kWh</div>' +
        '<div>รวมมูลค่าที่ประหยัด</div><div>฿ <span data-v="savedThbTotal"></span></div><div>อัตราค่าไฟที่ใช้คำนวณ</div><div>' + fmt(S.cfg.tariff, 2) + ' ฿/kWh</div></div>' +
        '<p class="muted" style="font-size:12.5px;margin:12px 0 0">คำนวณโดย Inverter ABB (Saved energy / Saved amount) เทียบกับการเดินมอเตอร์ตรงที่พิกัด อ่านผ่าน Modbus TCP FMBT-21</p></div></div>';
      this.chart(v); this.tick(v);
    },
    chart: function (v) {
      var d = SIM.dailySummary(14);
      A.barChart($('#eChart', v), { height: 240, labels: d.map(function (x) { return A.dFmt(x.date).split(' ').slice(0, 2).join(' '); }), series: [{ name: 'พลังงาน', unit: 'kWh', color: '#5B8CFF', values: d.map(function (x) { return x.kwh; }) }], line: { name: 'kWh/m³', color: '#F5A524', values: d.map(function (x) { return x.sec; }) } });
    },
    tick: function (v) { var b = $('#phaseBox', v); if (b) b.innerHTML = S.phaseOK ? '<span class="pill run">ปกติ</span>' : '<span class="pill fault">ทำงาน (ขาดเฟส)</span>'; },
    resize: function (v) { this.chart(v); }
  };

  // ---------------- control
  A.PAGES.control = {
    render: function (v) {
      var c = S.cfg, ok = A.can('setpoint'), adm = A.can('alternate');
      function num(id, lbl, val, min, max, step, unit, dis) { return '<label>' + lbl + '<div class="row" style="flex-wrap:nowrap"><input type="number" id="' + id + '" value="' + val + '" min="' + min + '" max="' + max + '" step="' + step + '"' + (dis ? ' disabled' : '') + '><span class="muted" style="min-width:42px">' + unit + '</span></div></label>'; }
      v.innerHTML =
        '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>ลำดับการทำงานของ PLC</h3><span class="muted">PLC FX5U-32MR/DS · สั่งงาน/ตั้งค่าได้ทั้งจาก HMI 10″ และ SCADA</span></div><div class="logic">' +
        '<div><b>PID รักษาแรงดัน</b>Lead pump ปรับรอบด้วย PID ให้แรงดันเท่ากับ Setpoint <span class="k-num">' + fmt(c.sp, 1) + ' bar</span></div>' +
        '<div><b>Lag Start</b>ถ้า Lead เดินเต็มรอบแล้วแรงดันยังไม่ถึงค่า ภายใน <span class="k-num">' + c.intervalStart + ' วินาที</span> → สั่ง Run ปั๊มตัวที่ 2</div>' +
        '<div><b>Lag Stop</b>เมื่อแรงดันถึง Setpoint ต่อเนื่อง <span class="k-num">' + c.intervalStop + ' วินาที</span> → สั่งปิดปั๊มตัวที่ 2</div>' +
        '<div><b>สลับปั๊ม</b>สลับ Lead/Lag ทุก <span class="k-num">' + c.altHours + ' ชม.</span> เพื่อกระจายชั่วโมงทำงาน · Fault → สลับอัตโนมัติ</div></div></div>' +
        (ok ? '' : '<div class="lock" style="margin-bottom:16px">🔒 สิทธิ์ "' + A.ROLES[A.session().role] + '" ดูค่าได้อย่างเดียว · การแก้ไขต้องเป็นผู้ปฏิบัติงานหรือผู้ดูแลระบบ</div>') +
        '<div class="grid g2">' +
        '<div class="card"><div class="card-h"><h3>PID ควบคุมแรงดัน</h3><span class="muted">ค่าปัจจุบัน <b class="num" data-v="pressure"></b> bar</span></div><div class="stack">' +
        '<label>Setpoint แรงดัน (bar)<input type="range" id="spR" min="2" max="6" step="0.1" value="' + c.sp + '"' + (ok ? '' : ' disabled') + ' style="accent-color:var(--blue)"></label>' +
        '<div class="grid g3" style="gap:12px">' + num('sp', 'Setpoint', c.sp, 2, 6, 0.1, 'bar', !ok) + num('kp', 'Kp (Gain)', c.kp, 0.1, 5, 0.1, '', !ok) + num('ti', 'Ti (Integral)', c.ti, 0.5, 30, 0.5, 'วิ', !ok) + '</div>' +
        '<div class="grid g2" style="gap:12px">' + num('deadband', 'Deadband', c.deadband, 0.05, 0.5, 0.05, 'bar', !ok) + '<label>โหมดการทำงาน<select id="mode"' + (ok ? '' : ' disabled') + '><option' + (c.mode === 'AUTO' ? ' selected' : '') + '>AUTO</option><option' + (c.mode === 'MANUAL' ? ' selected' : '') + '>MANUAL</option></select></label></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>Interval & การสลับปั๊ม</h3></div><div class="stack">' +
        '<div class="grid g2" style="gap:12px">' + num('intervalStart', 'Interval สั่ง Run ปั๊ม 2', c.intervalStart, 5, 600, 5, 'วิ', !ok) + num('intervalStop', 'Interval สั่งปิดปั๊ม 2', c.intervalStop, 5, 900, 5, 'วิ', !ok) + '</div>' +
        '<div class="grid g2" style="gap:12px">' + num('altHours', 'รอบสลับ Lead/Lag', c.altHours, 1, 48, 1, 'ชม.', !adm) + '<div><div class="muted" style="font-size:13.5px;margin-bottom:6px">ปั๊มหลักตอนนี้</div><div class="row"><span class="pill lead" data-v="lead"></span><span class="muted">สลับในอีก <b class="num" data-v="altLeft"></b></span></div></div></div>' +
        '<div class="grid g2" style="gap:12px">' + num('lowAlarm', 'แจ้งเตือนแรงดันต่ำ', c.lowAlarm, 1, 6, 0.1, 'bar', !ok) + num('highAlarm', 'แจ้งเตือนแรงดันสูง', c.highAlarm, 3, 9, 0.1, 'bar', !ok) + '</div>' +
        '</div></div></div>' +
        '<div class="row no-print" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" id="ctlReset"' + (ok ? '' : ' disabled') + '>คืนค่าเดิม</button><button class="btn primary" id="ctlSave"' + (ok ? '' : ' disabled') + '>บันทึกและส่งไป PLC</button></div>';
      var spR = $('#spR', v), sp = $('#sp', v);
      spR.oninput = function () { sp.value = spR.value; }; sp.oninput = function () { spR.value = sp.value; };
      $('#ctlReset', v).onclick = function () { A.PAGES.control.render(v); A.bindLive(v); };
      $('#ctlSave', v).onclick = function () {
        var keys = ['sp', 'kp', 'ti', 'deadband', 'intervalStart', 'intervalStop', 'altHours', 'lowAlarm', 'highAlarm'], patch = {}, diff = [];
        var names = { sp: 'PID Setpoint', kp: 'Kp', ti: 'Ti', deadband: 'Deadband', intervalStart: 'Interval Start', intervalStop: 'Interval Stop', altHours: 'รอบสลับปั๊ม', lowAlarm: 'Alarm แรงดันต่ำ', highAlarm: 'Alarm แรงดันสูง', mode: 'โหมด' };
        keys.forEach(function (k) { var el = $('#' + k, v); if (!el || el.disabled) return; var nv = parseFloat(el.value); if (isNaN(nv)) return; if (nv !== S.cfg[k]) { patch[k] = nv; diff.push(names[k] + ': ' + S.cfg[k] + ' → ' + nv); } });
        var md = $('#mode', v).value; if (md !== S.cfg.mode) { patch.mode = md; diff.push('โหมด: ' + S.cfg.mode + ' → ' + md); }
        if (patch.sp && (patch.sp < 2 || patch.sp > 6)) { A.toast('ค่าไม่ถูกต้อง', 'Setpoint ต้องอยู่ระหว่าง 2–6 bar', 'warning'); return; }
        if (!diff.length) { A.toast('ไม่มีการเปลี่ยนแปลง', '', 'info'); return; }
        CTRL.run({ perm: 'setpoint', title: 'ยืนยันการเปลี่ยนค่าควบคุม', body: '<ul style="margin:0;padding-left:18px">' + diff.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul><p style="margin:12px 0 0">ค่าจะถูกเขียนลง PLC และบันทึกใน Log การทำงานของผู้ใช้</p>', okLabel: 'บันทึก',
          exec: function () { SIM.setConfig(patch); diff.slice(1).forEach(function (d) { A.audit('แก้ไขค่า', d); }); }, audit: 'แก้ไขค่า ' + diff[0] + (diff.length > 1 ? ' และอีก ' + (diff.length - 1) + ' รายการ' : ''),
          after: function () { A.PAGES.control.render(v); A.bindLive(v); } });
      };
    }
  };
})();
