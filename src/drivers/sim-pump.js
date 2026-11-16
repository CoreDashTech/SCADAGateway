'use strict';
// Pump-station simulator (SIMULATE=1 with `simulator: pump-station`).
// Serves the same tags as the real PLC register map so every screen, alarm and API call
// can be tested without hardware. Mirrors standard duty/assist PLC logic:
//   PID on discharge pressure · lag pump started/stopped by intervals · lead/lag alternation · failover.
const { DeviceHealth } = require('./health');

// pump curve at 50 Hz: H(bar) = 5.6 − 0.00004·Q²  → one pump = 200 m³/h at 4 bar, same as the web app
const A_HEAD = 5.6, B_HEAD = 0.00004;
const PMAX = A_HEAD;
const RATED_A = 66; // A

function pumpQ(p, f) {
  if (f <= 1) return 0;
  const h = A_HEAD * (f / 50) ** 2 - p;
  return h > 0 ? Math.sqrt(h / B_HEAD) : 0;
}
function demandAt(ts) {
  const h = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
  return 110 + 95 * Math.exp(-((h - 8) ** 2) / 6) + 75 * Math.exp(-((h - 18) ** 2) / 5) - 40 * Math.exp(-((h - 3) ** 2) / 8);
}

class SimPump {
  constructor(devices, tags, store, { tickMs = 1000, now = () => Date.now() } = {}) {
    this.devices = devices; this.tags = tags; this.store = store; this.tickMs = tickMs; this.now = now;
    this.healths = new Map(devices.map((d) => [d.id, new DeviceHealth(d.id)]));
    const s = this.s = {};
    for (const t of tags) s[t.id] = 0;
    Object.assign(s, {
      'system.pressure': 4.0, 'FT-01.total': 128450.2, 'PM-01.kwh': 86520.4, 'PM-01.pf': 0.93, 'MCC.cab_temp': 34,
      'MCC.phase': 1, 'MCC.estop': 0, 'CTRL.mode': 0, 'CTRL.lead': 1,
      'CTRL.sp': 4.0, 'CTRL.kp': 0.8, 'CTRL.ti': 3.0, 'CTRL.deadband': 0.15, 'CTRL.int_start': 30, 'CTRL.int_stop': 60,
      'CTRL.alt_hours': 6, 'CTRL.low_alarm': 3.5, 'CTRL.high_alarm': 5.5,
      'P-01.energy': 41250, 'P-02.energy': 39870, 'P-01.inv_hours': 8120, 'P-02.inv_hours': 8075,
      'P-01.motor_hours': 8010, 'P-02.motor_hours': 7968, 'P-01.fan_hours': 7900, 'P-02.fan_hours': 7850,
      'P-01.ready': 1, 'P-02.ready': 1, 'P-01.run': 1, 'P-01.freq': 44   // warm start: lead pump already running
    });
    this.x = { altStart: now(), lagTimer: 0, stopTimer: 0, F: 44, ePrev: 0, demandMul: 1 };
  }

  get health() { return this.healths.values().next().value; }
  healthOf(id) { return this.healths.get(id); }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), this.tickMs); }
  stop() { clearInterval(this.timer); }

  // test hooks
  force(id, v) { this.s[id] = v; this.publish(); }
  setDemand(mul) { this.x.demandMul = mul; }

  avail(i) { const s = this.s, P = `P-0${i}.`; return !s[P + 'fault'] && s['MCC.phase'] === 1 && s['MCC.estop'] === 0; }

  alternate() { this.s['CTRL.lead'] = this.s['CTRL.lead'] === 1 ? 2 : 1; this.x.altStart = this.now(); if (this.x.altPaused) this.x.altPaused = this.x.altStart; }

  tick() {
    const s = this.s, x = this.x, dt = this.tickMs / 1000, now = this.now();
    const lead = s['CTRL.lead'], lag = lead === 1 ? 2 : 1, L = `P-0${lead}.`, G = `P-0${lag}.`;
    for (const i of [1, 2]) s[`P-0${i}.ready`] = this.avail(i) ? 1 : 0;
    if (!s['MCC.phase'] || s['MCC.estop']) { s['P-01.run'] = 0; s['P-02.run'] = 0; }
    // alternation clock: counts in AUTO, frozen in MANUAL (resumes where it stopped)
    if (s['CTRL.mode'] === 1 && !x.altPaused) x.altPaused = now;
    if (s['CTRL.mode'] === 0 && x.altPaused) { x.altStart += now - x.altPaused; x.altPaused = null; }
    const altElapsed = (x.altPaused || now) - x.altStart;
    if (s['CTRL.mode'] === 0) {
      if (altElapsed >= s['CTRL.alt_hours'] * 3600e3) this.alternate();
      if (!this.avail(lead) && this.avail(lag)) { this.alternate(); s[L + 'run'] = 0; }
      const ld = `P-0${s['CTRL.lead']}.`, lg = `P-0${s['CTRL.lead'] === 1 ? 2 : 1}.`;
      if (this.avail(s['CTRL.lead'])) s[ld + 'run'] = 1;
      if (!s[lg + 'run']) {
        if (s[ld + 'freq'] >= 49.5 && s['system.pressure'] < s['CTRL.sp'] - s['CTRL.deadband']) {
          x.lagTimer += dt;
          if (x.lagTimer >= s['CTRL.int_start'] && this.avail(s['CTRL.lead'] === 1 ? 2 : 1)) { s[lg + 'run'] = 1; x.lagTimer = 0; }
        } else x.lagTimer = 0;
      } else {
        // pressure satisfied and the flow fits one pump (≤ 90 % of one pump at the set-point) → stop the lag pump
        if (s['system.pressure'] >= s['CTRL.sp'] - 0.05 && s['FT-01.flow'] <= 0.9 * pumpQ(s['CTRL.sp'], 49)) {
          x.stopTimer += dt;
          if (x.stopTimer >= s['CTRL.int_stop']) { s[lg + 'run'] = 0; x.stopTimer = 0; }
        } else x.stopTimer = 0;
      }
    }
    for (const i of [1, 2]) if (!this.avail(i)) s[`P-0${i}.run`] = 0;
    s['CTRL.alt_remain_min'] = Math.max(0, Math.round((s['CTRL.alt_hours'] * 3600e3 - ((x.altPaused || now) - x.altStart)) / 60000));

    // PI controller (velocity form) shared by the running pumps — they run at the same speed F
    this.demand = demandAt(now) * x.demandMul;
    const running = [1, 2].filter((i) => s[`P-0${i}.run`]);
    const e = s['CTRL.sp'] - s['system.pressure'];
    if (running.length) {
      const kc = 8 * s['CTRL.kp'] * (running.length > 1 ? 0.6 : 1);           // Hz per bar
      let dF = kc * ((e - x.ePrev) + dt / s['CTRL.ti'] * e);
      dF = Math.max(-1.2 * dt, Math.min(1.2 * dt, dF));                         // ramp 1.2 Hz/s
      x.F = Math.max(25, Math.min(50, x.F + dF));
    }
    x.ePrev = e;
    for (const i of [1, 2]) {
      const P = `P-0${i}.`;
      if (s[P + 'run']) s[P + 'freq'] = s[P + 'freq'] < 24 ? Math.min(x.F, s[P + 'freq'] + 6 * dt + 25 * (s[P + 'freq'] < 1)) : x.F;
      else s[P + 'freq'] = Math.max(0, s[P + 'freq'] - 5 * dt);
    }
    // hydraulics: find pressure where pumps meet demand curve q = D·sqrt(P/4)
    const freqs = [1, 2].map((i) => (s[`P-0${i}.run`] ? s[`P-0${i}.freq`] : 0));
    let lo = 0, hi = PMAX;
    for (let n = 0; n < 40; n++) {
      const m = (lo + hi) / 2, sup = freqs.reduce((a, f) => a + pumpQ(m, f), 0), dem = this.demand * Math.sqrt(m / 4);
      if (sup > dem) lo = m; else hi = m;
    }
    s['system.pressure'] += (lo - s['system.pressure']) * Math.min(1, dt / 1.6);
    let flow = 0, kw = 1.3;
    for (const i of [1, 2]) {
      const P = `P-0${i}.`, f = freqs[i - 1], q = pumpQ(s['system.pressure'], f);
      flow += q;
      const hyd = q * s['system.pressure'] / 36, pw = f > 1 ? hyd / 0.72 + 0.6 : 0;
      s[P + 'power'] = pw; kw += pw;
      s[P + 'speed'] = f * 29.6; s[P + 'current'] = f > 1 ? Math.min(RATED_A * 1.05, 8 + pw * 1.55) : 0;
      s[P + 'torque'] = f > 1 ? Math.min(110, pw / Math.max(1, f) * 50 / 37 * 100) : 0;
      s[P + 'dcbus'] = 540 - pw * 0.05; s[P + 'vout'] = f * 8; s[P + 'pid_fb'] = s['system.pressure']; s[P + 'pid_out'] = f * 2;
      s[P + 'energy'] += pw * dt / 3600; s[P + 'saved_kwh'] += Math.max(0, 37 * (f / 50) - pw) * 0.3 * dt / 3600;
      if (f > 1) { s[P + 'inv_hours'] += dt / 3600; s[P + 'motor_hours'] += dt / 3600; s[P + 'fan_hours'] += dt / 3600; }
    }
    s['FT-01.flow'] = flow; s['FT-01.total'] += flow * dt / 3600;
    s['PM-01.kw'] = kw; s['PM-01.kwh'] += kw * dt / 3600;
    const amps = kw * 1000 / (Math.sqrt(3) * 400 * 0.93);
    for (const k of [1, 2, 3]) { s[`PM-01.v_l${k}`] = s['MCC.phase'] || k < 3 ? 400 + (k - 2) * 1.2 + Math.random() : 0; s[`PM-01.a_l${k}`] = amps * (1 + (k - 2) * 0.012); }
    s['PM-01.hz'] = 50 + (Math.random() - 0.5) * 0.04;
    s['MCC.cab_temp'] += (33 + kw * 0.05 - s['MCC.cab_temp']) * Math.min(1, dt / 12);
    this.publish();
    for (const h of this.healths.values()) h.ok(4 + Math.round(Math.random() * 12));
  }

  publish() {
    for (const t of this.tags) {
      let v = this.s[t.id];
      if (typeof v === 'number') v = t.dataType === 'float32' ? Math.round(v * 1000) / 1000 : Math.round(v);
      this.store.update(t.id, v, 'good');
    }
  }

  // Writes behave like the PLC: command words act once, settings are stored.
  async write(tag, value) {
    const s = this.s, v = Number(value), m = /^CMD\.(P-0([12]))\.(start|stop|reset)$/.exec(tag.id);
    if (m && v === 1) {
      const P = m[1] + '.';
      if (m[3] === 'reset') s[P + 'fault'] = 0;
      else if (s['CTRL.mode'] === 1 || m[3] === 'stop') s[P + 'run'] = m[3] === 'start' && this.avail(Number(m[2])) ? 1 : 0;
    } else if (tag.id === 'CMD.alternate' && v === 1) this.alternate();
    else if (tag.id === 'CMD.mode') s['CTRL.mode'] = v ? 1 : 0;
    else if (tag.id.startsWith('CTRL.')) s[tag.id] = v;
    else s[tag.id] = v;
    if (tag.id.startsWith('CMD.') && tag.id !== 'CMD.mode') s[tag.id] = 0; // PLC clears the command word
    this.publish();
  }
}

module.exports = { SimPump, pumpQ, demandAt };
