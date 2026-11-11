'use strict';
// Built-in plant simulator (SIMULATE=1). Serves every tag of every device so the
// web and mobile screens can be demonstrated without hardware.
const { DeviceHealth } = require('./health');

class SimDriver {
  constructor(devices, tags, store, { tickMs = 1000 } = {}) {
    this.devices = devices;
    this.tags = tags;
    this.store = store;
    this.tickMs = tickMs;
    this.healths = new Map(devices.map((d) => [d.id, new DeviceHealth(d.id)]));
    this.s = {
      'P-01.RUN': true, 'P-01.FAULT': false, 'P-02.RUN': true, 'P-02.VIB': 7.6, 'CHL-01.RUN': true,
      'V-101.POS': 100, 'V-102.POS': 60, 'V-103.POS': 0, 'V-201.POS': 100,
      'T-1.LEVEL': 62, 'CHL-01.SUPPLY_T': 7.4, 'INJ-01.MOLD_T': 44.5,
      'L-A.ON': true, 'L-A.LEVEL': 80, 'L-O.ON': false,
      'MDB-1.KWH': 182340.5, 'WM-01.TOTAL': 48211.4, p02Fault: true
    };
    this.targets = {};
    for (const t of tags) if (!(t.id in this.s)) this.s[t.id] = t.dataType === 'bool' ? false : 0;
  }

  get health() { return this.healths.values().next().value; }
  healthOf(id) { return this.healths.get(id); }

  start() { this.tick(); this.timer = setInterval(() => this.tick(), this.tickMs); }
  stop() { clearInterval(this.timer); }

  // test hook: force a process value
  force(id, v) { this.s[id] = v; this.publish(); }

  tick() {
    const s = this.s;
    const dt = this.tickMs / 1000;
    for (const [id, target] of Object.entries(this.targets)) {
      const cur = s[id];
      s[id] = cur < target ? Math.min(target, cur + 25) : Math.max(target, cur - 25);
      if (s[id] === target) delete this.targets[id];
    }
    const flow = (id, max) => max * s[id] / 100;
    const raw = s['P-01.RUN'] ? flow('V-101.POS', 20) : 0;
    const out = s['T-1.LEVEL'] > 2 ? flow('V-102.POS', 15) + flow('V-103.POS', 25) : 0;
    s['T-1.LEVEL'] = clamp(s['T-1.LEVEL'] + (raw - out) * 0.03 * dt, 0, 100);
    s['P-01.AMPS'] = s['P-01.RUN'] ? 25 + Math.random() * 2.5 : 0;
    s['P-02.VIB'] = s['P-02.RUN'] ? (s.p02Fault ? 7.4 + Math.random() * 0.8 : 1.8 + Math.random() * 0.6) : 0;
    const cool = s['CHL-01.RUN'] && s['P-02.RUN'] && s['V-201.POS'] > 0;
    s['CHL-01.SUPPLY_T'] += ((s['CHL-01.RUN'] ? 7 : 18) - s['CHL-01.SUPPLY_T']) * 0.08 + (Math.random() - 0.5) * 0.1;
    const moldTarget = cool ? 42 + s['CHL-01.SUPPLY_T'] * 0.3 + (100 - s['V-201.POS']) * 0.15 : 78;
    s['INJ-01.MOLD_T'] += (moldTarget - s['INJ-01.MOLD_T']) * 0.05;
    const kw = 40 + 21.6 + 19.5 + 44 + 25 + (s['CHL-01.RUN'] ? 45 : 0) + (s['P-01.RUN'] ? 12.3 : 0) + (s['P-02.RUN'] ? 9.7 : 0)
      + (s['L-A.ON'] ? 3.6 * s['L-A.LEVEL'] / 100 : 0) + (s['L-O.ON'] ? 2.4 : 0) + (Math.random() - 0.5) * 8;
    s['MDB-1.KW'] = kw;
    s['MDB-1.KWH'] += kw * dt / 3600;
    s['MDB-1.PF'] = 0.92 + Math.random() * 0.02;
    s['MDB-1.HZ'] = 49.95 + Math.random() * 0.1;
    for (const p of ['MDB-1.V_L1', 'MDB-1.V_L2', 'MDB-1.V_L3']) s[p] = 228 + Math.random() * 5;
    s['WM-01.FLOW'] = raw;
    s['WM-01.TOTAL'] += raw * dt / 3600;
    this.publish();
    for (const h of this.healths.values()) h.ok(3 + Math.round(Math.random() * 20));
  }

  publish() {
    for (const t of this.tags) {
      let v = this.s[t.id];
      if (typeof v === 'number' && t.dataType !== 'bool') v = Math.round(v * 100) / 100;
      this.store.update(t.id, v, 'good');
    }
  }

  async write(tag, value) {
    if (/\.POS$/.test(tag.id)) this.targets[tag.id] = Number(value);
    else this.s[tag.id] = tag.dataType === 'bool' ? Boolean(value) : Number(value);
    this.publish();
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

module.exports = { SimDriver };
