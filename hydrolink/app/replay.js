/* CoreDash HydroLink — โหมดทดสอบด้วยไฟล์ JSON (data source "file")
 * Upload a test file (format "coredash.scenario/v1") and the dashboard, gauges, 3D station, trends and
 * alarms replay it as if it came from the PLC. The same file can be loaded into the Edge Gateway
 * (SIM_FILE=... or POST /api/v1/sim/scenario), so a test prepared here also tests the API.
 *
 *  { "format": "coredash.scenario/v1", "description": "...", "loop": true, "interpolate": true,
 *    "settings": { "CTRL.sp": 4.0 },
 *    "frames": [ { "t": 0, "values": { "system.pressure": 4.02, "P-01.run": 1 }, "note": "..." }, … ] }
 */
(function (g) {
  'use strict';
  var S = SIM.state;
  var sc = null, prog = null, name = '', t = 0, playing = true, speed = 1, rec = null;
  var STEP = /\.(run|ready|fault|phase|estop|mode|lead)$/;

  function validate(x) {
    var e = [];
    if (!x || typeof x !== 'object' || Array.isArray(x)) return ['ไฟล์ต้องเป็น JSON object { … }'];
    if (x.format !== 'coredash.scenario/v1') e.push('"format" ต้องเป็น "coredash.scenario/v1"');
    if (!Array.isArray(x.frames) || !x.frames.length) e.push('ต้องมี "frames" อย่างน้อย 1 รายการ');
    else {
      var last = -1;
      x.frames.forEach(function (f, i) {
        if (typeof f.t !== 'number' || f.t < 0) e.push('frames[' + i + '].t ต้องเป็นตัวเลข ≥ 0 (วินาที)');
        else if (f.t < last) e.push('frames[' + i + '].t ต้องเรียงจากน้อยไปมาก');
        else last = f.t;
        if (!f.values || typeof f.values !== 'object') e.push('frames[' + i + '].values ต้องเป็น object');
      });
    }
    if (x.settings && typeof x.settings !== 'object') e.push('"settings" ต้องเป็น object');
    return e.slice(0, 6);
  }
  function compile(x) {
    var pts = {}, notes = [];
    Object.keys(x.settings || {}).forEach(function (k) { pts[k] = [[0, x.settings[k]]]; });
    x.frames.forEach(function (f) {
      Object.keys(f.values).forEach(function (k) { (pts[k] = pts[k] || []).push([f.t, f.values[k]]); });
      if (f.note) notes.push([f.t, f.note]);
    });
    var smooth = x.interpolate !== false, dur = x.frames[x.frames.length - 1].t;
    function at(tt) {
      var out = {};
      Object.keys(pts).forEach(function (k) {
        var line = pts[k], i = line.length - 1;
        while (i > 0 && line[i][0] > tt) i--;
        var a = line[i], b = line[i + 1];
        if (line[0][0] > tt) out[k] = line[0][1];
        else if (smooth && b && typeof a[1] === 'number' && typeof b[1] === 'number' && !STEP.test(k) && k.indexOf('CMD.') !== 0 && b[0] > a[0]) out[k] = a[1] + (b[1] - a[1]) * (tt - a[0]) / (b[0] - a[0]);
        else out[k] = a[1];
      });
      return out;
    }
    function noteAt(tt) { var n = ''; notes.forEach(function (x) { if (x[0] <= tt) n = x[1]; }); return n; }
    var known = POINTS.list, unknown = Object.keys(pts).filter(function (k) { return known.indexOf(k) < 0; });
    return { at: at, noteAt: noteAt, duration: dur, points: Object.keys(pts).length, unknown: unknown };
  }

  function load(x, fileName) {
    var errs = validate(x);
    if (errs.length) return { ok: false, errors: errs };
    sc = x; prog = compile(x); name = fileName || x.description || 'ไฟล์ทดสอบ'; t = 0; playing = true;
    if (x.settings) SIM.setConfig(POINTS.toCfg(x.settings));
    try { var s = JSON.stringify(x); if (s.length < 1.5e6) { localStorage.setItem('cdhl.scenario', s); localStorage.setItem('cdhl.scenarioName', JSON.stringify(name)); } } catch (e) { }
    S.alarms = []; S.trend = [];
    tick(0);
    return { ok: true, frames: x.frames.length, duration: prog.duration, points: prog.points, unknown: prog.unknown };
  }
  function tick(dt) {
    if (!prog || S.src !== 'file') return;
    if (playing) {
      t += dt * speed;
      if (t > prog.duration) { if (sc.loop !== false) { t = 0; S.trend = []; } else { t = prog.duration; playing = false; } }
    }
    var vals = prog.at(t);
    S.comm = { plc: true, hmi: true, inv1: true, inv2: true, pm: true, fm: true, sw: true, ups: true, gw: true };
    POINTS.apply(vals);
    S.demand = S.flow;   // the file has no separate demand: what was delivered is what was used
    S.now = Date.now(); S.lastUpdate = S.now;
    SIM._evalAlarms(dt * speed);
    SIM._emit('tick', S);
  }
  setInterval(function () { tick(1); }, 1000);

  function download(obj, file) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
    a.download = file; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }
  function stamp() { return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, ''); }

  g.REPLAY = {
    validate: validate, load: load,
    loadText: function (text, fileName) {
      var x; try { x = JSON.parse(text); } catch (e) { return { ok: false, errors: ['อ่าน JSON ไม่ได้: ' + e.message] }; }
      return load(x, fileName);
    },
    loadSample: function (file) {
      return fetch('samples/' + file).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (x) { return load(x, file); });
    },
    restore: function () { try { var s = localStorage.getItem('cdhl.scenario'); if (s && !sc) load(JSON.parse(s), JSON.parse(localStorage.getItem('cdhl.scenarioName') || '""')); } catch (e) { } },
    loaded: function () { return !!prog; },
    info: function () { return prog ? { name: name, description: sc.description || '', t: t, duration: prog.duration, playing: playing, speed: speed, note: prog.noteAt(t), frames: sc.frames.length, loop: sc.loop !== false } : null; },
    play: function (on) { playing = on == null ? !playing : !!on; },
    setSpeed: function (x) { speed = x; },
    seek: function (sec) { if (prog) { t = Math.max(0, Math.min(prog.duration, sec)); S.trend = []; tick(0); } },
    // ---- exports ----
    exportSnapshot: function () {
      download({ format: 'coredash.snapshot/v1', site: 'DEMO-01', generated_at: new Date().toISOString(), source: S.src, values: POINTS.snapshot(), settings: POINTS.settings(), alarms_active: S.alarms.map(function (a) { return a.code; }) }, 'hydrolink-snapshot-' + stamp() + '.json');
    },
    exportSettings: function () {
      download({ format: 'coredash.settings/v1', site: 'DEMO-01', generated_at: new Date().toISOString(), settings: POINTS.settings() }, 'hydrolink-settings-' + stamp() + '.json');
    },
    importSettings: function (text) {
      var x; try { x = JSON.parse(text); } catch (e) { return { ok: false, errors: ['อ่าน JSON ไม่ได้: ' + e.message] }; }
      var p = POINTS.toCfg(x.settings || x);
      if (!Object.keys(p).length) return { ok: false, errors: ['ไม่พบค่าตั้งในไฟล์ (ต้องมี settings เช่น "CTRL.sp": 4.0)'] };
      SIM.setConfig(p);
      return { ok: true, count: Object.keys(p).length };
    },
    sampleTemplate: function () {
      var v = POINTS.snapshot();
      download({ format: 'coredash.scenario/v1', site: 'DEMO-01', description: 'ไฟล์ตัวอย่าง — แก้ค่าใน frames แล้วอัปโหลดกลับมาทดสอบ', loop: true, interpolate: true, settings: POINTS.settings(),
        frames: [{ t: 0, values: v, note: 'เริ่มต้น' }, { t: 60, values: { 'system.pressure': 3.4, 'P-01.freq': 50 }, note: 'แรงดันตก' }, { t: 120, values: { 'system.pressure': v['system.pressure'] }, note: 'กลับสู่ปกติ' }] }, 'hydrolink-scenario-template.json');
    },
    // record the running screen (simulator or live) into a new test file
    recording: function () { return rec ? { frames: rec.frames.length, sec: Math.round((Date.now() - rec.start) / 1000) } : null; },
    startRecord: function (everySec) {
      if (rec) return;
      rec = { start: Date.now(), frames: [], timer: null };
      var grab = function () { rec.frames.push({ t: Math.round((Date.now() - rec.start) / 1000), values: POINTS.snapshot() }); };
      grab(); rec.timer = setInterval(grab, (everySec || 2) * 1000);
    },
    stopRecord: function () {
      if (!rec) return null;
      clearInterval(rec.timer);
      var out = { format: 'coredash.scenario/v1', site: 'DEMO-01', description: 'บันทึกจากหน้าจอ ' + new Date().toLocaleString('th-TH'), loop: true, interpolate: true, settings: POINTS.settings(), frames: rec.frames };
      var n = rec.frames.length; rec = null;
      download(out, 'hydrolink-recorded-' + stamp() + '.json');
      return n;
    }
  };
  // page opened in file mode: bring back the last test file (or the first sample)
  if (S.src === 'file') { g.REPLAY.restore(); if (!prog) g.REPLAY.loadSample('scenario-peak.json').catch(function () { }); }
})(window);
