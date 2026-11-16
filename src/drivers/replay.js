'use strict';
// Replays a JSON test file (scenario) into the tag store: SIM_FILE=examples/scenario-peak.json
// The same file format is accepted by the web app (โหมดทดสอบด้วยไฟล์ JSON).
//
// {
//   "format": "coredash.scenario/v1",
//   "site": "STATION-01",
//   "description": "ช่วงพีคเช้า + P-01 Fault",
//   "loop": true,
//   "interpolate": true,
//   "settings": { "CTRL.sp": 4.0 },                       // optional starting set-points
//   "frames": [ { "t": 0,  "values": { "system.pressure": 4.02, "P-01.run": 1 } },
//               { "t": 60, "values": { "system.pressure": 3.4,  "P-01.fault": 2310 } } ]
// }
// t = seconds from the start. A point keeps its last value until a later frame changes it.
// Numbers are interpolated between frames when "interpolate" is true; 0/1 flags and fault codes jump.
const fs = require('fs');
const { DeviceHealth } = require('./health');

function validateScenario(sc) {
  const errors = [];
  if (!sc || typeof sc !== 'object') return ['ไฟล์ต้องเป็น JSON object'];
  if (sc.format !== 'coredash.scenario/v1') errors.push('format ต้องเป็น "coredash.scenario/v1"');
  if (!Array.isArray(sc.frames) || !sc.frames.length) errors.push('ต้องมี frames อย่างน้อย 1 รายการ');
  else {
    let last = -1;
    sc.frames.forEach((f, i) => {
      if (typeof f.t !== 'number' || f.t < 0) errors.push(`frames[${i}].t ต้องเป็นตัวเลข ≥ 0`);
      else if (f.t < last) errors.push(`frames[${i}].t ต้องเรียงจากน้อยไปมาก`);
      else last = f.t;
      if (!f.values || typeof f.values !== 'object') errors.push(`frames[${i}].values ต้องเป็น object`);
    });
  }
  return errors;
}

// Builds a per-point timeline and returns value-at(t) for every point.
function compile(sc) {
  const points = new Map();
  const base = Object.assign({}, sc.settings || {});
  for (const [k, v] of Object.entries(base)) points.set(k, [[0, v]]);
  for (const f of sc.frames) for (const [k, v] of Object.entries(f.values)) {
    if (!points.has(k)) points.set(k, []);
    points.get(k).push([f.t, v]);
  }
  const duration = sc.frames[sc.frames.length - 1].t;
  const smooth = sc.interpolate !== false;
  const isStep = (k) => /\.(run|ready|fault|phase|estop|mode|lead)$/.test(k) || k.startsWith('CMD.');
  function at(t) {
    const out = {};
    for (const [k, line] of points) {
      let i = line.length - 1;
      while (i > 0 && line[i][0] > t) i--;
      const [t0, v0] = line[i], nx = line[i + 1];
      if (line[0][0] > t) { out[k] = line[0][1]; continue; }
      if (smooth && nx && typeof v0 === 'number' && typeof nx[1] === 'number' && !isStep(k) && nx[0] > t0) out[k] = v0 + (nx[1] - v0) * (t - t0) / (nx[0] - t0);
      else out[k] = v0;
    }
    return out;
  }
  return { at, duration, points: [...points.keys()] };
}

class ReplayDriver {
  constructor(devices, tags, store, { file, scenario, tickMs = 1000, log = console } = {}) {
    this.tags = tags; this.store = store; this.tickMs = tickMs; this.log = log;
    this.healths = new Map(devices.map((d) => [d.id, new DeviceHealth(d.id)]));
    this.load(scenario || JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  load(sc) {
    const errs = validateScenario(sc);
    if (errs.length) throw new Error('Scenario: ' + errs.join('; '));
    this.sc = sc; this.prog = compile(sc); this.t = 0; this.overrides = {};
    const known = new Set(this.tags.map((t) => t.id));
    const unknown = this.prog.points.filter((p) => !known.has(p));
    if (unknown.length) this.log.warn('[replay] ไม่รู้จักจุดตรวจวัด: ' + unknown.join(', '));
  }
  get health() { return this.healths.values().next().value; }
  healthOf(id) { return this.healths.get(id); }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), this.tickMs); }
  stop() { clearInterval(this.timer); }
  tick() {
    const vals = Object.assign(this.prog.at(this.t), this.overrides);
    for (const tag of this.tags) if (tag.id in vals) this.store.update(tag.id, vals[tag.id], 'good');
    for (const h of this.healths.values()) h.ok(1);
    this.t += this.tickMs / 1000;
    if (this.t > this.prog.duration) { if (this.sc.loop !== false) this.t = 0; else this.t = this.prog.duration; }
  }
  // Commands during a replay are recorded (audit) and set-points are kept, but the recorded process does not react.
  async write(tag, value) { if (!tag.id.startsWith('CMD.')) this.overrides[tag.id] = value; }
}

module.exports = { ReplayDriver, validateScenario, compile };
