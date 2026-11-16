/* CoreDash HydroLink — process simulator (demo mode)
 * Mirrors the PLC logic in standard duty/assist pump logic:
 *   - PID pressure control on the lead pump (setpoint from HMI/SCADA)
 *   - Start lag pump when lead cannot reach setpoint within "Interval Start" seconds
 *   - Stop lag pump after pressure is back at setpoint for "Interval Stop" seconds
 *   - Alternate lead/lag every N hours (default 6 h)
 * In production this module is replaced by the live data service (PLC FX5U via Modbus TCP / SLMP).
 */
(function (global) {
  'use strict';

  var RATED_KW = 37, RATED_RPM = 2960, RATED_A = 68, TARIFF = 4.18;
  var A_HEAD = 5.6, B_HEAD = 0.00004; // pump curve at 50 Hz: H(bar) = 5.6 - 0.00004 Q^2  (200 m3/h @ 4.0 bar)

  function lsGet(k, d) { try { var v = localStorage.getItem('cdhl.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('cdhl.' + k, JSON.stringify(v)); } catch (e) { } }

  // ---------- deterministic noise
  function hash(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function smoothNoise(t, period, seed) {
    var k = Math.floor(t / period), f = t / period - k;
    var a = hash(k + seed * 1000), b = hash(k + 1 + seed * 1000);
    var u = f * f * (3 - 2 * f);
    return a + (b - a) * u - 0.5;
  }

  // ---------- demand profile (industrial estate water use, m3/h)
  function demandAt(ms) {
    var d = new Date(ms), h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    var dow = d.getDay(), weekend = dow === 0 || dow === 6;
    var q = 112 + 78 * Math.exp(-Math.pow((h - 9.8) / 2.6, 2)) + 92 * Math.exp(-Math.pow((h - 14.6) / 2.4, 2))
      + 35 * Math.exp(-Math.pow((h - 20) / 2, 2)) - 38 * Math.exp(-Math.pow((h - 3) / 2.4, 2));
    if (weekend) q *= 0.82;
    q *= 1 + 0.06 * smoothNoise(ms / 1000, 900, 3) + 0.03 * smoothNoise(ms / 1000, 97, 5);
    return Math.max(40, q);
  }

  // ---------- pump hydraulics
  function pumpQ(P, f) { var h = A_HEAD * Math.pow(f / 50, 2) - P; return h > 0 ? Math.sqrt(h / B_HEAD) : 0; }
  function solvePressure(freqs, demand) {
    if (!freqs.length) return 0.55; // static head from storage tank
    var lo = 0, hi = 6.5;
    for (var i = 0; i < 40; i++) {
      var P = (lo + hi) / 2, sup = 0;
      for (var j = 0; j < freqs.length; j++) sup += pumpQ(P, freqs[j]);
      var dem = demand * Math.sqrt(Math.max(P, 0.05) / 4);
      if (sup > dem) lo = P; else hi = P;
    }
    return (lo + hi) / 2;
  }
  function efficiency(q) { return Math.max(0.38, Math.min(0.78, 0.76 * (1 - Math.pow((q - 185) / 270, 2)))); }

  // ---------- fault code catalogue (ABB ACS580)
  var FAULTS = {
    '2310': 'Overcurrent — กระแสเกิน',
    '3220': 'DC link undervoltage — แรงดัน DC Bus ต่ำ',
    '4310': 'Excess temperature — อุณหภูมิไดรฟ์สูง',
    '3381': 'Output phase loss — เฟสขาออกขาด',
    '9081': 'External fault 1 — ฟอลต์ภายนอก',
    'A2B1': 'Overcurrent warning — เตือนกระแสสูง',
    'A4A1': 'IGBT overtemperature warning — เตือน IGBT ร้อน'
  };

  function mkPump(i) {
    var seedFaults = i === 1
      ? [{ code: '2310', at: Date.parse('2026-10-12T08:14:00+07:00'), cleared: Date.parse('2026-10-12T08:31:00+07:00') },
        { code: 'A4A1', at: Date.parse('2026-09-21T14:02:00+07:00'), cleared: Date.parse('2026-09-21T14:40:00+07:00') }]
      : [{ code: '3220', at: Date.parse('2026-10-30T02:47:00+07:00'), cleared: Date.parse('2026-10-30T02:49:00+07:00') },
        { code: 'A2B1', at: Date.parse('2026-10-05T10:21:00+07:00'), cleared: Date.parse('2026-10-05T10:25:00+07:00') }];
    return {
      id: i, tag: 'P-0' + i, inv: 'INV-0' + i, pt: 'PT-0' + i,
      run: false, ready: true, fault: null, warn: null,
      freq: 0, speed: 0, current: 0, torque: 0, power: 0, dcbus: 541, vout: 0,
      energy: i === 1 ? 82450.2 : 79312.8, savedKwh: i === 1 ? 18342.6 : 17105.1,
      invHours: i === 1 ? 2140.4 : 2128.9, motorHours: i === 1 ? 1388.2 : 1354.7, fanHours: i === 1 ? 2140.4 : 2128.9,
      pidOut: 0, pressure: 0, faultLog: seedFaults, starts: i === 1 ? 412 : 405, qShare: 0
    };
  }

  var cfg = lsGet('cfg', null) || { sp: 4.0, kp: 0.8, ti: 3.0, intervalStart: 30, intervalStop: 60, altHours: 6, deadband: 0.15, mode: 'AUTO', lowAlarm: 3.5, highAlarm: 5.5, tariff: TARIFF };

  var S = {
    cfg: cfg,
    now: Date.now(),
    lead: lsGet('lead', 1),
    altStart: lsGet('altStart', Date.now() - 2.35 * 3600e3),
    altPausedAt: lsGet('altPausedAt', null),   // set while in MANUAL: the alternation countdown is frozen, not lost
    pumps: [mkPump(1), mkPump(2)],
    pressure: 4.0, flow: 0, demand: 0, demandBoost: 0, boostUntil: 0,
    flowTotal: 1843250.4, kwhTotal: 1258430.7,
    pm: { v: [400, 400, 400], a: [0, 0, 0], hz: [50, 50, 50], kw: 0, pf: 0.95 },
    phaseOK: true,
    src: lsGet('src', 'sim'),
    dev: lsGet('dev', null) || { sv1: true, dv1: true, sv2: true, dv2: true, ph2: false, mccb1: true, mccb2: true, estop: false, fan: true },
    cabTemp: 34, demandMul: lsGet('demandMul', 1),
    comm: { plc: true, hmi: true, inv1: true, inv2: true, pm: true, fm: true, sw: true, ups: true, gw: true },
    lagTimer: 0, stopTimer: 0, lastUpdate: Date.now(),
    trend: [], events: [],
    alarms: [], alarmHistory: lsGet('alarmHistory', []),
    notifyLog: lsGet('notifyLog', []),
    today: { kwh: 0, m3: 0 }
  };

  // seed today's totals from profile so numbers look lived-in
  (function seedToday() {
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var m3 = 0, kwh = 0;
    for (var t = start.getTime(); t < Date.now(); t += 300000) { var q = demandAt(t); m3 += q / 12; kwh += (q * 4 / 36) / (efficiency(q) * 0.95) / 12 + 0.1; }
    S.today.m3 = m3; S.today.kwh = kwh;
  })();

  function avail(p) { var d = S.dev, i = p.id; return !p.fault && S.phaseOK && !d.estop && d['mccb' + i] && d['sv' + i] && d['dv' + i]; }
  function whyNot(p) {
    var d = S.dev, i = p.id, r = [];
    if (p.fault) r.push('Fault ' + p.fault); if (!S.phaseOK) r.push('ไฟขาดเฟส'); if (d.estop) r.push('กด Emergency Stop');
    if (!d['mccb' + i]) r.push('MCCB ปลด'); if (!d['sv' + i]) r.push('วาล์วดูดปิด'); if (!d['dv' + i]) r.push('วาล์วจ่ายปิด');
    return r;
  }
  var listeners = [];
  function emit(type, data) { for (var i = 0; i < listeners.length; i++) try { listeners[i](type, data); } catch (e) { console.error(e); } }

  // ---------- alarm rules
  var RULES = [
    { code: 'PRESS_LOW', sev: 'warning', delay: 20, text: function () { return 'แรงดันจ่ายต่ำกว่ากำหนด (' + S.pressure.toFixed(2) + ' bar < ' + S.cfg.lowAlarm.toFixed(1) + ' bar)'; }, tag: 'PT-01', test: function () { return S.pressure < S.cfg.lowAlarm; } },
    { code: 'PRESS_CRIT', sev: 'critical', delay: 10, text: function () { return 'แรงดันจ่ายต่ำวิกฤต (' + S.pressure.toFixed(2) + ' bar)'; }, tag: 'PT-01', test: function () { return S.pressure < 2.5; } },
    { code: 'PRESS_HIGH', sev: 'critical', delay: 5, text: function () { return 'แรงดันจ่ายสูงเกินกำหนด (' + S.pressure.toFixed(2) + ' bar)'; }, tag: 'PT-01', test: function () { return S.pressure > S.cfg.highAlarm; } },
    { code: 'P1_FAULT', sev: 'critical', delay: 0, text: function () { var p = S.pumps[0]; return 'P-01 Inverter Fault ' + p.fault + ' ' + (FAULTS[p.fault] || ''); }, tag: 'INV-01', test: function () { return !!S.pumps[0].fault; } },
    { code: 'P2_FAULT', sev: 'critical', delay: 0, text: function () { var p = S.pumps[1]; return 'P-02 Inverter Fault ' + p.fault + ' ' + (FAULTS[p.fault] || ''); }, tag: 'INV-02', test: function () { return !!S.pumps[1].fault; } },
    { code: 'P1_CURR', sev: 'warning', delay: 15, text: function () { return 'P-01 กระแสมอเตอร์สูง (' + S.pumps[0].current.toFixed(1) + ' A)'; }, tag: 'INV-01', test: function () { return S.pumps[0].current > RATED_A * 0.97; } },
    { code: 'P2_CURR', sev: 'warning', delay: 15, text: function () { return 'P-02 กระแสมอเตอร์สูง (' + S.pumps[1].current.toFixed(1) + ' A)'; }, tag: 'INV-02', test: function () { return S.pumps[1].current > RATED_A * 0.97; } },
    { code: 'ESTOP', sev: 'critical', delay: 0, text: function () { return 'กด Emergency Stop — หยุดปั๊มทั้งหมด'; }, tag: 'MCC', test: function () { return S.dev.estop; } },
    { code: 'P1_ILK', sev: 'warning', delay: 2, text: function () { return 'P-01 ไม่พร้อมทำงาน: ' + whyNot(S.pumps[0]).join(', '); }, tag: 'P-01', test: function () { var p = S.pumps[0]; return !p.fault && S.phaseOK && !S.dev.estop && !avail(p); } },
    { code: 'P2_ILK', sev: 'warning', delay: 2, text: function () { return 'P-02 ไม่พร้อมทำงาน: ' + whyNot(S.pumps[1]).join(', '); }, tag: 'P-02', test: function () { var p = S.pumps[1]; return !p.fault && S.phaseOK && !S.dev.estop && !avail(p); } },
    // both pumps kept running by hand while one pump would be enough (pump 2 is meant for when pressure cannot be reached)
    { code: 'BOTH_MANUAL', sev: 'warning', delay: 300, text: function () { return 'ปั๊ม 2 ตัวเดินพร้อมกันในโหมด MANUAL ขณะใช้น้ำ ' + S.flow.toFixed(0) + ' ลบ.ม./ชม. ซึ่งปั๊มตัวเดียวรับได้ — แนะนำหยุด 1 ตัว หรือกลับเป็น AUTO'; }, tag: 'SYSTEM', test: function () { return S.cfg.mode === 'MANUAL' && S.pumps[0].run && S.pumps[1].run && S.flow <= 0.9 * pumpQ(S.cfg.sp, 49); } },
    { code: 'CAB_TEMP', sev: 'warning', delay: 5, text: function () { return 'อุณหภูมิตู้ควบคุมสูง (' + S.cabTemp.toFixed(1) + ' °C)'; }, tag: 'MCC', test: function () { return S.cabTemp > 45; } },
    { code: 'NO_PUMP', sev: 'critical', delay: 8, text: function () { return 'ไม่มีปั๊มพร้อมทำงาน — หยุดจ่ายน้ำ'; }, tag: 'SYSTEM', test: function () { return S.cfg.mode === 'AUTO' && !avail(S.pumps[0]) && !avail(S.pumps[1]); } },
    { code: 'COMM_INV1', sev: 'major', delay: 10, text: function () { return 'ขาดการสื่อสาร INV-01 (FMBT-21)'; }, tag: 'INV-01', test: function () { return S.comm.inv1 === false; } },
    { code: 'COMM_INV2', sev: 'major', delay: 10, text: function () { return 'ขาดการสื่อสาร INV-02 (FMBT-21)'; }, tag: 'INV-02', test: function () { return S.comm.inv2 === false; } },
    { code: 'PHASE', sev: 'critical', delay: 0, text: function () { return 'Phase Protection ทำงาน — ไฟฟ้าขาดเฟส/กลับเฟส'; }, tag: 'MCC', test: function () { return !S.phaseOK; } },
    { code: 'COMM_FM', sev: 'major', delay: 10, text: function () { return 'ขาดการสื่อสาร Flowmeter (RS485→TCP)'; }, tag: 'FT-01', test: function () { return !S.comm.fm; } },
    { code: 'COMM_PM', sev: 'major', delay: 10, text: function () { return 'ขาดการสื่อสาร Power Meter M1M 20'; }, tag: 'PM-01', test: function () { return !S.comm.pm; } },
    { code: 'COMM_PLC', sev: 'critical', delay: 10, text: function () { return 'ขาดการสื่อสาร PLC FX5U'; }, tag: 'PLC', test: function () { return !S.comm.plc; } }
  ];
  var ruleTimers = {};
  var aseq = lsGet('aseq', 1000);

  function raise(rule) {
    var a = { id: 'ALM-' + (++aseq), code: rule.code, tag: rule.tag, sev: rule.sev, text: rule.text(), at: S.now, cleared: null, ack: null, notified: [] };
    lsSet('aseq', aseq);
    S.alarms.unshift(a);
    notify(a, 'raise');
    emit('alarm', a);
  }
  function clearAlarm(a) {
    a.cleared = S.now;
    S.alarms = S.alarms.filter(function (x) { return x !== a; });
    S.alarmHistory.unshift(a); S.alarmHistory = S.alarmHistory.slice(0, 300);
    lsSet('alarmHistory', S.alarmHistory);
    notify(a, 'clear');
    emit('alarm-clear', a);
  }
  function evalAlarms(dt) {
    RULES.forEach(function (r) {
      var active = S.alarms.find(function (a) { return a.code === r.code; });
      if (r.test()) {
        ruleTimers[r.code] = (ruleTimers[r.code] || 0) + dt;
        if (!active && ruleTimers[r.code] >= r.delay) raise(r);
      } else {
        ruleTimers[r.code] = 0;
        if (active) clearAlarm(active);
      }
    });
  }

  // ---------- notifications (Email / LINE OA / Telegram) — demo sends are logged, not transmitted
  var notifyCfg = lsGet('notifyCfg', null) || {
    email: { on: true, to: 'ops@hydrolink.example, eng@hydrolink.example', sev: ['critical', 'major', 'warning'] },
    line: { on: true, to: 'LINE OA: Water Ops (กลุ่ม 12 คน)', sev: ['critical', 'major'] },
    telegram: { on: true, to: 'Telegram: @hydrolink_scada_bot → กลุ่มช่างเทคนิค', sev: ['critical', 'major', 'warning'] },
    quietHours: false, repeatMin: 15
  };
  function notify(a, kind) {
    ['email', 'line', 'telegram'].forEach(function (ch) {
      var c = notifyCfg[ch];
      if (!c.on || c.sev.indexOf(a.sev) < 0) return;
      var item = { id: a.id, ch: ch, kind: kind, sev: a.sev, text: a.text, at: S.now, ok: true, ms: 300 + Math.round(Math.random() * 900) };
      a.notified.push({ ch: ch, at: S.now, kind: kind });
      S.notifyLog.unshift(item);
    });
    S.notifyLog = S.notifyLog.slice(0, 200);
    lsSet('notifyLog', S.notifyLog);
    emit('notify', a);
  }

  function logEvent(text, kind) {
    S.events.unshift({ at: S.now, text: text, kind: kind || 'info' });
    S.events = S.events.slice(0, 80);
    emit('event', S.events[0]);
  }

  // ---------- main step
  var ePrev = [0, 0];
  function step(dt) {
    S.now = Date.now();
    var c = S.cfg;
    var lead = S.pumps[S.lead - 1], lag = S.pumps[2 - S.lead];

    // alternation every altHours
    track();
    if (c.mode === 'AUTO' && altElapsed() >= c.altHours * 3600e3) alternate('ครบรอบ ' + c.altHours + ' ชม.');

    // failover: lead faulted → lag becomes lead
    if (!avail(lead) && avail(lag) && c.mode === 'AUTO') { alternate('Failover: ' + lead.tag + (lead.fault ? ' Fault' : ' ไม่พร้อม')); lead = S.pumps[S.lead - 1]; lag = S.pumps[2 - S.lead]; }

    // phase protection trips everything
    if (!S.phaseOK) S.pumps.forEach(function (p) { if (p.run) { p.run = false; } });

    S.demand = demandAt(S.now) * S.demandMul + (S.now < S.boostUntil ? S.demandBoost : 0) + (S.dev.ph2 ? 60 : 0);
    var cabTarget = S.dev.fan ? 33 + S.pm.kw * 0.05 : 52;
    S.cabTemp += (cabTarget - S.cabTemp) * Math.min(1, dt / 12);

    if (c.mode === 'AUTO' && S.phaseOK) {
      if (avail(lead) && !lead.run) { lead.run = true; lead.freq = Math.max(lead.freq, 25); lead.starts++; logEvent(lead.tag + ' เริ่มทำงาน (Lead)', 'run'); }
      // staging
      if (lead.run && !lag.run && avail(lag)) {
        if (lead.freq >= 49.5 && S.pressure < c.sp - c.deadband) {
          S.lagTimer += dt;
          if (S.lagTimer >= c.intervalStart) { lag.run = true; lag.freq = 30; lag.starts++; S.lagTimer = 0; logEvent(lag.tag + ' เริ่มทำงานเสริม — แรงดันไม่ถึง ' + c.sp.toFixed(1) + ' bar ภายใน ' + c.intervalStart + ' วินาที', 'stage'); }
        } else S.lagTimer = 0;
      }
      if (lag.run) {
        var oneCanDo = pumpQ(c.sp, 49) >= S.demand * 1.05;
        if (S.pressure >= c.sp - 0.05 && oneCanDo) {
          S.stopTimer += dt;
          if (S.stopTimer >= c.intervalStop) { lag.run = false; S.stopTimer = 0; logEvent(lag.tag + ' หยุดเสริม — แรงดันถึงค่าที่ตั้งครบ ' + c.intervalStop + ' วินาที', 'stage'); }
        } else S.stopTimer = 0;
      }
    }

    // PID (velocity form), shared speed reference for running pumps
    var e = c.sp - S.pressure;
    var running0 = S.pumps.filter(function (p) { return p.run; }).length;
    S.pumps.forEach(function (p, i) {
      if (p.run && !avail(p)) logEvent(p.tag + ' หยุดโดย Interlock: ' + whyNot(p).join(', '), 'stage');
      if (!p.run || !avail(p)) { p.run = false; p.freq = Math.max(0, p.freq - 5 * dt); return; }
      var df = 5 * (c.kp * (e - ePrev[i]) + c.kp * dt / Math.max(0.2, c.ti) * e) * (running0 > 1 ? 0.6 : 1);
      df = Math.max(-1.2 * dt, Math.min(1.2 * dt, df));
      p.freq = Math.max(25, Math.min(50, p.freq + df));
      ePrev[i] = e;
      p.pidOut = (p.freq - 25) / 25 * 100;
    });
    // keep running pumps near the same speed (multi-pump sync)
    var running = S.pumps.filter(function (p) { return p.run; });
    if (running.length === 2) { var avg = (running[0].freq + running[1].freq) / 2; running.forEach(function (p) { p.freq += (avg - p.freq) * 0.3; }); }

    // hydraulics
    var freqs = S.pumps.map(function (p) { return p.freq > 1 ? p.freq : 0; }).filter(function (f) { return f > 0; });
    var Pt = solvePressure(freqs, S.demand);
    S.pressure += (Pt - S.pressure) * Math.min(1, dt / 1.6);
    var Pm = S.pressure + 0.012 * smoothNoise(S.now / 1000, 3, 7);
    var flowTot = 0;
    S.pumps.forEach(function (p) {
      var q = p.freq > 1 ? pumpQ(S.pressure, p.freq) : 0;
      p.qShare = q; flowTot += q;
      var hyd = q * Math.max(S.pressure, 0) / 36;           // kW
      var shaft = p.freq > 1 ? hyd / efficiency(q) + 1.2 * (p.freq / 50) : 0;
      var elec = shaft / 0.95;
      p.power = elec;
      p.vout = p.freq > 1 ? 400 * p.freq / 50 : 0;
      p.speed = p.freq > 1 ? RATED_RPM * p.freq / 50 - 18 * (shaft / RATED_KW) : 0;
      p.current = p.freq > 1 ? elec * 1000 / (1.732 * Math.max(p.vout, 80) * 0.86) : 0;
      p.torque = p.freq > 1 ? shaft / (RATED_KW * Math.max(p.freq, 5) / 50) * 100 : 0;
      p.dcbus = 540 + 3 * smoothNoise(S.now / 1000, 5, 11 + p.id) - (p.run ? p.power * 0.05 : 0);
      p.pressure = p.run ? Pm + 0.01 * smoothNoise(S.now / 1000, 4, 20 + p.id) : Pm - 0.02;
      p.ready = avail(p);
      if (p.run) {
        p.energy += elec * dt / 3600;
        var saved = Math.max(0, RATED_KW * 0.86 - elec);
        p.savedKwh += saved * dt / 3600;
        p.invHours += dt / 3600; p.motorHours += dt / 3600; p.fanHours += dt / 3600;
      }
      p.warn = p.current > RATED_A * 0.97 ? 'A2B1' : null;
    });
    S.flow = flowTot + (flowTot > 0 ? 0.6 * smoothNoise(S.now / 1000, 2, 9) : 0);
    if (S.comm.fm) S.flowTotal += S.flow * dt / 3600;

    // power meter
    var totalKw = S.pumps.reduce(function (s, p) { return s + p.power; }, 0) + 1.3;
    var iIn = totalKw * 1000 / (1.732 * 400 * 0.95);
    for (var k = 0; k < 3; k++) {
      S.pm.v[k] = S.phaseOK || k < 2 ? 400 + 2.5 * smoothNoise(S.now / 1000, 6, 30 + k) + (k - 1) * 1.2 : 0;
      S.pm.a[k] = iIn * (1 + 0.012 * (k - 1)) + 0.15 * smoothNoise(S.now / 1000, 3, 40 + k);
      S.pm.hz[k] = 50 + 0.02 * smoothNoise(S.now / 1000, 8, 50);
    }
    S.pm.kw = totalKw;
    if (S.comm.pm) S.kwhTotal += totalKw * dt / 3600;
    S.today.kwh += totalKw * dt / 3600; S.today.m3 += S.flow * dt / 3600;

    S.lastUpdate = S.now;
    S.trend.push({ t: S.now, p: Pm, q: S.flow, kw: totalKw, sp: c.sp, f1: S.pumps[0].freq, f2: S.pumps[1].freq });
    if (S.trend.length > 3600) S.trend.shift();

    evalAlarms(dt);
    emit('tick', S);
  }

  // alternation clock pauses in MANUAL and resumes in AUTO; each pump remembers when it started (continuous run time)
  function track() {
    var now = S.now || Date.now();
    if (S.cfg.mode === 'MANUAL' && !S.altPausedAt) { S.altPausedAt = now; lsSet('altPausedAt', now); }
    if (S.cfg.mode !== 'MANUAL' && S.altPausedAt) { S.altStart += now - S.altPausedAt; S.altPausedAt = null; lsSet('altStart', S.altStart); lsSet('altPausedAt', null); }
    S.pumps.forEach(function (p) { if (p.run && !p.runSince) p.runSince = now; if (!p.run) p.runSince = 0; });
  }
  function altElapsed() { return (S.altPausedAt || S.now || Date.now()) - S.altStart; }

  function alternate(reason) {
    var old = S.lead, nl = old === 1 ? 2 : 1;
    if (!avail(S.pumps[nl - 1])) return;
    S.lead = nl; S.altStart = S.now; if (S.altPausedAt) S.altPausedAt = S.now;
    var nlp = S.pumps[nl - 1];
    if (!nlp.run && avail(nlp)) { nlp.run = true; nlp.freq = Math.max(nlp.freq, S.pumps[old - 1].freq || 30); nlp.starts++; }
    // the previous lead stops after hand-over unless staging still needs it
    var op = S.pumps[old - 1];
    if (op.run && pumpQ(S.cfg.sp, 49) >= S.demand) op.run = false;
    lsSet('lead', S.lead); lsSet('altStart', S.altStart); lsSet('altPausedAt', S.altPausedAt);
    logEvent('สลับปั๊มหลัก ' + 'P-0' + old + ' → P-0' + nl + ' (' + reason + ')', 'alt');
  }

  // ---------- commands (from SCADA, role-checked by the app)
  var API = {
    state: S, FAULTS: FAULTS, RATED_KW: RATED_KW, RATED_A: RATED_A,
    on: function (fn) { listeners.push(fn); },
    setConfig: function (patch) { if (S.src === 'live') liveSend('config', patch); Object.keys(patch).forEach(function (k) { S.cfg[k] = patch[k]; }); lsSet('cfg', S.cfg); },
    getNotifyCfg: function () { return notifyCfg; },
    setNotifyCfg: function (n) { notifyCfg = n; lsSet('notifyCfg', n); },
    testNotify: function (ch) {
      var item = { id: 'TEST', ch: ch, kind: 'test', sev: 'info', text: 'ทดสอบการแจ้งเตือนจาก CoreDash HydroLink', at: Date.now(), ok: true, ms: 420 };
      S.notifyLog.unshift(item); lsSet('notifyLog', S.notifyLog.slice(0, 200)); emit('notify', item); return item;
    },
    cmdStart: function (i) { if (S.src === 'live') return liveSend('start', { pump: i }); if (S.src === 'file') return fileCmd('P-0' + i + ' สั่ง Start'); var p = S.pumps[i - 1]; if (!avail(p)) return false; if (!p.run) { p.run = true; p.freq = Math.max(p.freq, 25); p.starts++; } logEvent(p.tag + ' สั่ง Start (DI01) จาก SCADA', 'cmd'); return true; },
    cmdStop: function (i) { if (S.src === 'live') return liveSend('stop', { pump: i }); if (S.src === 'file') return fileCmd('P-0' + i + ' สั่ง Stop'); var p = S.pumps[i - 1]; p.run = false; logEvent(p.tag + ' สั่ง Stop (DI01) จาก SCADA', 'cmd'); return true; },
    cmdReset: function (i) {
      if (S.src === 'live') return liveSend('reset', { pump: i });
      if (S.src === 'file') return fileCmd('P-0' + i + ' Reset Fault');
      var p = S.pumps[i - 1]; if (!p.fault) return false;
      var lf = p.faultLog[0]; if (lf && !lf.cleared) lf.cleared = Date.now();
      p.fault = null; logEvent(p.tag + ' Reset Fault (DI02) จาก SCADA', 'cmd'); return true;
    },
    alternateNow: function () { if (S.src === 'live') return liveSend('alternate', {}); if (S.src === 'file') return fileCmd('สั่งสลับปั๊ม'); alternate('สั่งสลับจาก SCADA'); },
    ack: function (id, user) {
      var a = S.alarms.find(function (x) { return x.id === id; }) || S.alarmHistory.find(function (x) { return x.id === id; });
      if (a && !a.ack) { a.ack = { by: user, at: Date.now() }; lsSet('alarmHistory', S.alarmHistory); emit('ack', a); }
    },
    // demo fault injection for presentations
    inject: function (what) {
      if (what === 'peak') { S.demandBoost = 125; S.boostUntil = Date.now() + 240e3; logEvent('จำลอง: ความต้องการน้ำสูง +125 ลบ.ม./ชม. (4 นาที)', 'demo'); }
      if (what === 'fault1' || what === 'fault2') {
        var p = S.pumps[what === 'fault1' ? 0 : 1];
        p.fault = what === 'fault1' ? '2310' : '4310'; p.run = false;
        p.faultLog.unshift({ code: p.fault, at: Date.now(), cleared: null });
        logEvent('จำลอง: ' + p.tag + ' Fault ' + p.fault, 'demo');
      }
      if (what === 'phase') { S.phaseOK = false; logEvent('จำลอง: Phase Protection ทำงาน', 'demo'); setTimeout(function () { S.phaseOK = true; logEvent('ไฟฟ้ากลับมาปกติ — ระบบเริ่มทำงานอัตโนมัติ', 'info'); }, 25000); }
      if (what === 'comm') { S.comm.fm = false; logEvent('จำลอง: ขาดการสื่อสาร Flowmeter', 'demo'); setTimeout(function () { S.comm.fm = true; logEvent('Flowmeter กลับมาสื่อสารปกติ', 'info'); }, 30000); }
      if (what === 'clear') { S.demandBoost = 0; S.boostUntil = 0; S.phaseOK = true; S.demandMul = 1; lsSet('demandMul', 1); S.dev = { sv1: true, dv1: true, sv2: true, dv2: true, ph2: false, mccb1: true, mccb2: true, estop: false, fan: true }; lsSet('dev', S.dev); S.cabTemp = 34; Object.keys(S.comm).forEach(function (k) { S.comm[k] = true; }); S.pumps.forEach(function (p) { if (p.fault) API.cmdReset(p.id); }); logEvent('จำลอง: คืนค่าระบบปกติ', 'demo'); }
    },
    demandAt: demandAt, avail: avail, whyNot: whyNot, _emit: emit,
    setSource: function (src) { S.src = src; lsSet('src', src); if (src !== 'sim') { S.alarms = []; ruleTimers = {}; } else { S.lastUpdate = Date.now(); S.comm = { plc: true, hmi: true, inv1: true, inv2: true, pm: true, fm: true, sw: true, ups: true, gw: true }; } logEvent({ sim: 'เปลี่ยนเป็นโหมดจำลอง', file: 'เปลี่ยนเป็นโหมดทดสอบด้วยไฟล์ JSON', live: 'เปลี่ยนเป็นโหมดทำงานจริง' }[src], 'info'); emit('source', src); },
    setDevice: function (k, v) {
      if (S.src !== 'sim') return false;
      var NAMES = { sv1: 'วาล์วดูด P-01', dv1: 'วาล์วจ่าย P-01', sv2: 'วาล์วดูด P-02', dv2: 'วาล์วจ่าย P-02', ph2: 'วาล์วสามทางต่อขยาย', mccb1: 'MCCB P-01', mccb2: 'MCCB P-02', estop: 'Emergency Stop', fan: 'พัดลมระบายอากาศตู้', plc: 'PLC FX5U', inv1: 'INV-01 (FMBT-21)', inv2: 'INV-02 (FMBT-21)', pm: 'Power Meter', fm: 'Flowmeter', phase: 'ไฟฟ้า 3 เฟส' };
      if (k === 'phase') S.phaseOK = !!v;
      else if (k in S.comm) S.comm[k] = !!v;
      else if (k === 'demand') { S.demandMul = +v; lsSet('demandMul', S.demandMul); return true; }
      else { S.dev[k] = !!v; lsSet('dev', S.dev); }
      var onWord = /^(sv|dv|ph2)/.test(k) ? (v ? 'เปิด' : 'ปิด') : k === 'estop' ? (v ? 'กด' : 'ปลด') : k === 'mccb1' || k === 'mccb2' ? (v ? 'ต่อ' : 'ปลด') : (v ? 'ON' : 'OFF');
      logEvent('จำลอง: ' + (NAMES[k] || k) + ' → ' + onWord, 'demo');
      emit('device', { k: k, v: v }); return true;
    },
    // synthetic history (deterministic) for trends/reports/API
    historyValue: function (point, t) {
      var q = demandAt(t), hh = new Date(t).getHours();
      var leadIs1 = Math.floor(t / (6 * 3600e3)) % 2 === 0;
      var two = q > 196;
      var f = Math.min(50, 50 * Math.sqrt((4 + B_HEAD * Math.pow(q / (two ? 2 : 1), 2)) / A_HEAD));
      var p = S.cfg.sp + 0.03 * smoothNoise(t / 1000, 120, 2) - (q > 236 ? (q - 236) * 0.01 : 0);
      var kw = (two ? 2 : 1) * ((q / (two ? 2 : 1)) * 4 / 36 / efficiency(q / (two ? 2 : 1)) / 0.95 + 1.2) + 1.3;
      switch (point) {
        case 'PT-01.pressure': case 'PT-02.pressure': case 'system.pressure': return p;
        case 'FT-01.flow': return q;
        case 'PM-01.kw': return kw;
        case 'PM-01.v_l1': return 400 + 3 * smoothNoise(t / 1000, 600, 31);
        case 'PM-01.a_l1': return kw * 1000 / (1.732 * 400 * 0.95);
        case 'P-01.freq': return (leadIs1 || two) ? f : 0;
        case 'P-02.freq': return (!leadIs1 || two) ? f : 0;
        case 'P-01.current': return (leadIs1 || two) ? (kw - 1.3) / (two ? 2 : 1) * 1000 / (1.732 * 400 * f / 50 * 0.86) : 0;
        case 'P-02.current': return (!leadIs1 || two) ? (kw - 1.3) / (two ? 2 : 1) * 1000 / (1.732 * 400 * f / 50 * 0.86) : 0;
        case 'P-01.power': return (leadIs1 || two) ? (kw - 1.3) / (two ? 2 : 1) : 0;
        case 'P-02.power': return (!leadIs1 || two) ? (kw - 1.3) / (two ? 2 : 1) : 0;
        default: return null;
      }
      void hh;
    },
    history: function (point, start, end, intervalMs, agg) {
      var out = [], sub = Math.max(1, Math.min(12, Math.round(intervalMs / 60000)));
      for (var t = start; t < end; t += intervalMs) {
        var vals = [];
        for (var s = 0; s < sub; s++) { var v = API.historyValue(point, t + s * intervalMs / sub); if (v !== null) vals.push(v); }
        if (!vals.length) continue;
        var r = agg === 'min' ? Math.min.apply(null, vals) : agg === 'max' ? Math.max.apply(null, vals) : vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        out.push([t, r]);
      }
      return out;
    },
    dailySummary: function (days) {
      var d0 = new Date(); d0.setHours(0, 0, 0, 0);
      return API.summaryFrom(d0.getTime() - (days - 1) * 86400e3, days);
    },
    summaryFrom: function (from, days) {
      var out = [], nowMs = Date.now();
      for (var i = 0; i < days; i++) {
        var start = from + i * 86400e3, m3 = 0, kwh = 0, h1 = 0, h2 = 0, peak = 0, end = Math.min(start + 86400e3, nowMs);
        if (start > nowMs) break;
        for (var t = start; t < end; t += 900e3) {
          var q = demandAt(t); m3 += q / 4; peak = Math.max(peak, q);
          var two = q > 196, l1 = Math.floor(t / (6 * 3600e3)) % 2 === 0;
          kwh += (API.historyValue('PM-01.kw', t)) / 4;
          if (l1 || two) h1 += 0.25; if (!l1 || two) h2 += 0.25;
        }
        out.push({ date: start, m3: m3, kwh: kwh, sec: kwh / m3, h1: h1, h2: h2, peak: peak, alarms: Math.round(hash(start / 86400e3) * 3) });
      }
      return out;
    },
    points: function () {
      var pts = [
        { id: 'system.pressure', name: 'แรงดันจ่ายระบบ', unit: 'bar' },
        { id: 'PT-01.pressure', name: 'Pressure Transmitter 1 (SIEMENS P220)', unit: 'bar' },
        { id: 'PT-02.pressure', name: 'Pressure Transmitter 2 (SIEMENS P220)', unit: 'bar' },
        { id: 'FT-01.flow', name: 'Flowmeter อัตราการไหล', unit: 'm3/h' },
        { id: 'FT-01.total', name: 'Flowmeter Totalizer', unit: 'm3' },
        { id: 'PM-01.v_l1', name: 'Power Meter Voltage L1', unit: 'V' }, { id: 'PM-01.v_l2', name: 'Power Meter Voltage L2', unit: 'V' }, { id: 'PM-01.v_l3', name: 'Power Meter Voltage L3', unit: 'V' },
        { id: 'PM-01.a_l1', name: 'Power Meter Current L1', unit: 'A' }, { id: 'PM-01.a_l2', name: 'Power Meter Current L2', unit: 'A' }, { id: 'PM-01.a_l3', name: 'Power Meter Current L3', unit: 'A' },
        { id: 'PM-01.hz', name: 'Power Meter Frequency', unit: 'Hz' }, { id: 'PM-01.kw', name: 'Power Meter Active Power', unit: 'kW' }, { id: 'PM-01.kwh', name: 'Power Meter Totalizer', unit: 'kWh' },
        { id: 'MCC.phase', name: 'Phase Protection Status', unit: 'bool' }
      ];
      [1, 2].forEach(function (i) {
        var P = 'P-0' + i;
        [['freq', 'Output Frequency', 'Hz'], ['speed', 'Motor Speed', 'rpm'], ['current', 'Motor Current', 'A'], ['torque', 'Motor Torque', '%'], ['power', 'Output Power', 'kW'],
        ['dcbus', 'DC Bus Voltage', 'V'], ['vout', 'Output Voltage', 'V'], ['energy', 'Output Energy', 'kWh'], ['saved_kwh', 'Saved Energy', 'kWh'], ['saved_thb', 'Saved Amount', 'THB'],
        ['fault', 'Active Fault / Warning', 'code'], ['inv_hours', 'Inverter Run Time', 'h'], ['motor_hours', 'Motor Run Time', 'h'], ['fan_hours', 'Cooling Fan Run Time', 'h'],
        ['pid_sp', 'PID Setpoint', 'bar'], ['pid_fb', 'PID Feedback (Pressure Transmitter)', 'bar'], ['pid_out', 'PID Output', '%'],
        ['run', 'Status Run', 'bool'], ['stop', 'Status Stop', 'bool'], ['ready', 'Status Ready', 'bool']].forEach(function (x) {
          pts.push({ id: P + '.' + x[0], name: P + ' ' + x[1], unit: x[2] });
        });
      });
      return pts;
    },
    latest: function (id) {
      var s = S, m = id.split('.'), dev = m[0], k = m[1];
      if (dev === 'system' || dev === 'PT-01' || dev === 'PT-02') { if (dev === 'PT-01') return s.pumps[0].pressure; if (dev === 'PT-02') return s.pumps[1].pressure; return s.pressure; }
      if (dev === 'FT-01') return k === 'total' ? s.flowTotal : s.flow;
      if (dev === 'PM-01') { if (k[0] === 'v') return s.pm.v[+k.slice(-1) - 1]; if (k[0] === 'a') return s.pm.a[+k.slice(-1) - 1]; if (k === 'hz') return s.pm.hz[0]; if (k === 'kw') return s.pm.kw; if (k === 'kwh') return s.kwhTotal; }
      if (dev === 'MCC') return s.phaseOK;
      if (dev === 'P-01' || dev === 'P-02') {
        var p = s.pumps[dev === 'P-01' ? 0 : 1];
        var map = { freq: p.freq, speed: p.speed, current: p.current, torque: p.torque, power: p.power, dcbus: p.dcbus, vout: p.vout, energy: p.energy, saved_kwh: p.savedKwh, saved_thb: p.savedKwh * s.cfg.tariff, fault: p.fault || p.warn || null, inv_hours: p.invHours, motor_hours: p.motorHours, fan_hours: p.fanHours, pid_sp: s.cfg.sp, pid_fb: p.pressure, pid_out: p.pidOut, run: p.run, stop: !p.run, ready: p.ready };
        return k in map ? map[k] : undefined;
      }
      return undefined;
    }
  };

  // warm-up so the first paint is steady
  S.pressure = 3.9; S.pumps[S.lead - 1].run = true; S.pumps[S.lead - 1].freq = 44;
  for (var w = 0; w < 120; w++) step(0.5);
  S.pumps.forEach(function (p) { p.runSince = p.run ? (p.id === S.lead ? S.altStart : S.now) : 0; });
  S.trend = [];
  // prefill 15 min of live trend from history model
  for (var tt = Date.now() - 900e3; tt < Date.now(); tt += 5000) {
    S.trend.push({ t: tt, p: API.historyValue('system.pressure', tt), q: demandAt(tt), kw: API.historyValue('PM-01.kw', tt), sp: S.cfg.sp, f1: API.historyValue('P-01.freq', tt), f2: API.historyValue('P-02.freq', tt) });
  }
  S.events = [];
  logEvent('เชื่อมต่อ PLC FX5U-32MR/DS (192.168.10.10) สำเร็จ', 'info');
  logEvent('P-0' + S.lead + ' เป็นปั๊มหลัก (Lead) — สลับทุก ' + S.cfg.altHours + ' ชม.', 'alt');

  function fileCmd(text) { logEvent(text + ' — โหมดไฟล์ทดสอบ: บันทึกคำสั่งไว้ ค่าที่แสดงมาจากไฟล์', 'cmd'); return true; }
  function liveSend(cmd, args) { return !!(global.LIVE && global.LIVE.send(cmd, args)); }
  var last = performance.now();
  setInterval(function () { var n = performance.now(); var dt = Math.min(2, (n - last) / 1000); last = n; if (S.src !== 'sim') return; step(dt); }, 1000);   // live: live.js · file: replay.js

  API._step = step;
  API._evalAlarms = evalAlarms;   // used by replay.js so alarms also fire on JSON test files
  API._track = track;
  API.altElapsed = altElapsed;
  global.SIM = API;
})(window);
