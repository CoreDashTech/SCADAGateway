/* CoreDash HydroLink — one list of measurement points (JSON names) shared by
 *  • live.js     (values from the Edge Gateway REST API /api/v1/latest)
 *  • replay.js   (values from an uploaded JSON test file)
 *  • export      (snapshot / recorded test file)
 * The names are identical to the gateway tag ids and the PLC register map (config/hydrolink.yaml).
 */
(function (g) {
  'use strict';
  var S = SIM.state;
  var LIST = ['system.pressure', 'FT-01.flow', 'FT-01.total', 'PM-01.kw', 'PM-01.kwh', 'PM-01.v_l1', 'PM-01.v_l2', 'PM-01.v_l3', 'PM-01.a_l1', 'PM-01.a_l2', 'PM-01.a_l3', 'PM-01.hz', 'PM-01.pf',
    'MCC.phase', 'MCC.estop', 'MCC.cab_temp', 'CTRL.mode', 'CTRL.lead', 'CTRL.alt_remain_min'];
  var PF = ['freq', 'speed', 'current', 'torque', 'power', 'dcbus', 'vout', 'energy', 'saved_kwh', 'inv_hours', 'motor_hours', 'fan_hours', 'pid_fb', 'pid_out', 'run', 'ready', 'fault'];
  [1, 2].forEach(function (i) { PF.forEach(function (k) { LIST.push('P-0' + i + '.' + k); }); });
  // set-points: JSON name ↔ S.cfg key
  var CFG = { 'CTRL.sp': 'sp', 'CTRL.kp': 'kp', 'CTRL.ti': 'ti', 'CTRL.deadband': 'deadband', 'CTRL.int_start': 'intervalStart', 'CTRL.int_stop': 'intervalStop', 'CTRL.alt_hours': 'altHours', 'CTRL.low_alarm': 'lowAlarm', 'CTRL.high_alarm': 'highAlarm' };
  var SETTINGS = Object.keys(CFG);

  // values {point: value} → screen state
  function apply(m) {
    function n(k, d) { return typeof m[k] === 'number' ? m[k] : d; }
    S.pressure = n('system.pressure', S.pressure); S.flow = n('FT-01.flow', S.flow); S.flowTotal = n('FT-01.total', S.flowTotal);
    S.pm.kw = n('PM-01.kw', S.pm.kw); S.kwhTotal = n('PM-01.kwh', S.kwhTotal); S.pm.pf = n('PM-01.pf', S.pm.pf);
    S.pm.v = [n('PM-01.v_l1', S.pm.v[0]), n('PM-01.v_l2', S.pm.v[1]), n('PM-01.v_l3', S.pm.v[2])];
    S.pm.a = [n('PM-01.a_l1', S.pm.a[0]), n('PM-01.a_l2', S.pm.a[1]), n('PM-01.a_l3', S.pm.a[2])];
    var hz = n('PM-01.hz', S.pm.hz[0]); S.pm.hz = [hz, hz, hz];
    if ('MCC.phase' in m) S.phaseOK = !!m['MCC.phase'];
    if ('MCC.estop' in m) S.dev.estop = !!m['MCC.estop'];
    if ('MCC.cab_temp' in m) S.cabTemp = n('MCC.cab_temp', S.cabTemp);
    if ('CTRL.lead' in m && (m['CTRL.lead'] === 1 || m['CTRL.lead'] === 2)) S.lead = m['CTRL.lead'];
    if ('CTRL.mode' in m) S.cfg.mode = m['CTRL.mode'] ? 'MANUAL' : 'AUTO';
    SETTINGS.forEach(function (k) { if (typeof m[k] === 'number') S.cfg[CFG[k]] = m[k]; });
    S.pumps.forEach(function (p) {
      var P = 'P-0' + p.id + '.';
      p.freq = n(P + 'freq', 0); p.speed = n(P + 'speed', 0); p.current = n(P + 'current', 0); p.torque = n(P + 'torque', 0); p.power = n(P + 'power', 0); p.dcbus = n(P + 'dcbus', p.dcbus); p.vout = n(P + 'vout', 0);
      p.energy = n(P + 'energy', p.energy); p.savedKwh = n(P + 'saved_kwh', p.savedKwh); p.invHours = n(P + 'inv_hours', p.invHours); p.motorHours = n(P + 'motor_hours', p.motorHours); p.fanHours = n(P + 'fan_hours', p.fanHours);
      p.pressure = n(P + 'pid_fb', S.pressure); p.pidOut = n(P + 'pid_out', 0); p.run = !!m[P + 'run'];
      p.ready = P + 'ready' in m ? !!m[P + 'ready'] : p.ready;
      var f = m[P + 'fault']; p.fault = f && f !== '0' ? String(f) : null;
    });
    // the gateway/PLC counts the alternation itself (and freezes it in MANUAL): mirror its remaining time
    if (typeof m['CTRL.alt_remain_min'] === 'number') { S.altStart = Date.now() - (S.cfg.altHours * 60 - m['CTRL.alt_remain_min']) * 60e3; if (S.altPausedAt) S.altPausedAt = Date.now(); }
    SIM._track();
    S.trend.push({ t: Date.now(), p: S.pressure, q: S.flow, kw: S.pm.kw, sp: S.cfg.sp, f1: S.pumps[0].freq, f2: S.pumps[1].freq });
    if (S.trend.length > 3600) S.trend.shift();
  }
  function applyList(list) { var m = {}; (list || []).forEach(function (d) { m[d.point] = d.value; }); apply(m); }

  // screen state → values {point: value} (for export and recording)
  var r = function (v, d) { var k = Math.pow(10, d == null ? 3 : d); return Math.round(v * k) / k; };
  function snapshot() {
    var v = {
      'system.pressure': r(S.pressure), 'FT-01.flow': r(S.flow, 1), 'FT-01.total': r(S.flowTotal, 1), 'PM-01.kw': r(S.pm.kw, 2), 'PM-01.kwh': r(S.kwhTotal, 1),
      'PM-01.v_l1': r(S.pm.v[0], 1), 'PM-01.v_l2': r(S.pm.v[1], 1), 'PM-01.v_l3': r(S.pm.v[2], 1), 'PM-01.a_l1': r(S.pm.a[0], 1), 'PM-01.a_l2': r(S.pm.a[1], 1), 'PM-01.a_l3': r(S.pm.a[2], 1),
      'PM-01.hz': r(S.pm.hz[0], 2), 'PM-01.pf': r(S.pm.pf || 0.95, 2), 'MCC.phase': S.phaseOK ? 1 : 0, 'MCC.estop': S.dev.estop ? 1 : 0, 'MCC.cab_temp': r(S.cabTemp, 1),
      'CTRL.mode': S.cfg.mode === 'MANUAL' ? 1 : 0, 'CTRL.lead': S.lead
    };
    S.pumps.forEach(function (p) {
      var P = 'P-0' + p.id + '.';
      v[P + 'freq'] = r(p.freq, 2); v[P + 'speed'] = Math.round(p.speed); v[P + 'current'] = r(p.current, 1); v[P + 'torque'] = r(p.torque, 1); v[P + 'power'] = r(p.power, 2);
      v[P + 'dcbus'] = r(p.dcbus, 1); v[P + 'vout'] = Math.round(p.vout); v[P + 'energy'] = r(p.energy, 1); v[P + 'saved_kwh'] = r(p.savedKwh, 1);
      v[P + 'inv_hours'] = r(p.invHours, 1); v[P + 'motor_hours'] = r(p.motorHours, 1); v[P + 'fan_hours'] = r(p.fanHours, 1);
      v[P + 'pid_fb'] = r(p.pressure); v[P + 'pid_out'] = r(p.pidOut || 0, 1); v[P + 'run'] = p.run ? 1 : 0; v[P + 'ready'] = SIM.avail(p) ? 1 : 0; v[P + 'fault'] = p.fault ? Number(p.fault) || p.fault : 0;
    });
    return v;
  }
  function settings() { var o = {}; SETTINGS.forEach(function (k) { o[k] = S.cfg[CFG[k]]; }); return o; }
  // settings {CTRL.sp: 4.0, …} → S.cfg patch
  function toCfg(obj) { var p = {}; Object.keys(obj || {}).forEach(function (k) { if (CFG[k] && typeof obj[k] === 'number') p[CFG[k]] = obj[k]; }); return p; }

  g.POINTS = { list: LIST.concat(SETTINGS), values: LIST, settingNames: SETTINGS, apply: apply, applyList: applyList, snapshot: snapshot, settings: settings, toCfg: toCfg, CFG: CFG };
})(window);
