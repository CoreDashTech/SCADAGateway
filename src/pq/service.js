'use strict';
// Power-quality service: polls the LAN analysers (or simulates them) and serves /api/pq/* to the screens.
const path = require('path');
const { pathToFileURL } = require('url');
const { HiokiCmdClient, FtpClient, parseResponse, toRecord } = require('./hioki');

const DEFAULT_INSTRUMENTS = [
  { id: 'PQ-MAIN', no: 2, role: 'grid', name: 'MAIN GRID' },
  { id: 'PQ-LOAD', no: 3, role: 'load', name: 'LOAD' },
  { id: 'PQ-APF', no: 6, role: 'apf', name: 'APF' }
];

class PqService {
  constructor(cfg = {}, { simulate = false, log = console, tickMs = 1000 } = {}) {
    this.cfg = cfg;
    this.simulate = simulate || cfg.simulate === true;
    this.log = log; this.tickMs = tickMs;
    this.instruments = (cfg.instruments && cfg.instruments.length ? cfg.instruments : DEFAULT_INSTRUMENTS).map((i) => ({ pollMs: 1000, ...i }));
    this.latest = {}; this.status = {}; this.ring = []; this.timers = [];
    this.clients = {};
  }
  async start() {
    const al = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'pq-alarms.js')).href);
    this.alarmText = al.alarmText;
    this.alarms = new al.PqAlarmEngine({ unom: this.cfg.unom || 230, onEvent: (kind, ev) => { try { this.onAlarm && this.onAlarm(kind, ev); } catch (e) { this.log.warn && this.log.warn('[pq-alarm] ' + e.message); } } });
    const metaOf = (i) => ({ name: `#${i.no} ${i.name}`, host: i.host || null });
    this.feedAlarm = (inst, rec, ts) => this.alarms.feed(inst.id, rec, ts, metaOf(inst));
    this.offAlarm = (inst, ts, error) => this.alarms.offline(inst.id, ts, { ...metaOf(inst), error });
    if (this.simulate) {
      const mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'pq-model.js')).href);
      this.model = new mod.PqModel();
      const tick = () => {
        const s = this.model.snapshot(Date.now());
        for (const i of this.instruments) { const r = s.instruments[i.id]; if (r) { this.latest[i.id] = { ts: s.ts, ...r }; this.status[i.id] = { online: true, ts: s.ts }; this.feedAlarm(i, r, s.ts); } }
        this.pushRing(s.ts);
      };
      tick(); this.timers.push(setInterval(tick, this.tickMs));
      return;
    }
    const pw = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'pw3198.js')).href);
    const meters = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'pq-meters.js')).href);
    for (const inst of this.instruments) {
      if (inst.driver === 'modbus' || inst.profile || (inst.registers && inst.registers.length)) { this.startModbus(inst, meters); continue; }
      if (!inst.host) continue;
      // PW3198 preset: verified command set (app/pw3198.js) unless the YAML gives its own queries
      const preset = !(inst.queries && inst.queries.length) && (inst.protocol || inst.model || 'pw3198').toLowerCase().includes('3198');
      const c = new HiokiCmdClient({ host: inst.host, port: inst.commandPort || pw.PW3198.port, timeoutMs: inst.timeoutMs || 3000 }, this.log);
      this.clients[inst.id] = c;
      const poll = async () => {
        try {
          if (preset) {
            if (!c.ready) { for (const cmd of pw.PW3198.init) await c.send(cmd); c.ready = true; }
            const line = await c.query(pw.PW3198.query);
            const named = pw.parsePw3198(line);
            if (!('FREQ' in named) && !('U1RMS' in named)) { c.ready = false; throw new Error('unexpected reply: ' + line.slice(0, 60)); }
            const ts = Date.now();
            this.latest[inst.id] = { ts, ...pw.pw3198Record(inst.id, named), raw: named };
            this.status[inst.id] = { online: true, ts };
            this.feedAlarm(inst, this.latest[inst.id], ts);
            this.pushRing(ts);
            return;
          }
          const f = {};
          for (const q of inst.queries || []) {
            const r = parseResponse(await c.query(q.cmd));
            Object.assign(f, r.named);
            (q.fields || []).forEach((name, k) => { if (r.values[k] != null) f[name.toUpperCase()] = r.values[k]; });
          }
          const ts = Date.now();
          this.latest[inst.id] = { ts, ...toRecord(inst.id, f), raw: f };
          this.status[inst.id] = { online: true, ts };
          this.feedAlarm(inst, this.latest[inst.id], ts);
          this.pushRing(ts);
        } catch (e) {
          this.status[inst.id] = { online: false, ts: Date.now(), error: e.message };
          this.offAlarm(inst, Date.now(), e.message);
          c.close();
        }
      };
      let busy = false;
      const tick = async () => { if (busy) return; busy = true; try { await poll(); } finally { busy = false; } };
      tick(); this.timers.push(setInterval(tick, inst.pollMs));
    }
  }
  // Modbus panel meter → same record shape as a PW3198 → same alarms / diagnosis
  startModbus(inst, meters) {
    const { ModbusMeterClient, profileOf } = require('./modbus-meter');
    const c = new ModbusMeterClient(inst, profileOf(inst, meters.MODBUS), this.log);
    this.clients[inst.id] = c;
    let busy = false;
    const tick = async () => {
      if (busy) return; busy = true;
      try {
        const named = await c.read(meters);
        const ts = Date.now();
        this.latest[inst.id] = { ts, ...meters.toRecord(inst.id, named, { via: 'modbus', meter: inst.profile || 'custom' }), raw: named };
        this.status[inst.id] = { online: true, ts };
        this.feedAlarm(inst, this.latest[inst.id], ts);
        this.pushRing(ts);
      } catch (e) {
        this.status[inst.id] = { online: false, ts: Date.now(), error: e.message };
        this.offAlarm(inst, Date.now(), e.message);
        c.close();
      } finally { busy = false; }
    };
    tick(); this.timers.push(setInterval(tick, inst.pollMs));
  }
  stop() { for (const t of this.timers) clearInterval(t); this.timers = []; for (const c of Object.values(this.clients)) c.close(); }

  // 1 point / 10 s, 24 h
  pushRing(ts) {
    const last = this.ring[this.ring.length - 1];
    if (last && ts - last.ts < 10000) return;
    const g = this.latest['PQ-MAIN'] || {}, l = this.latest['PQ-LOAD'] || {}, a = this.latest['PQ-APF'] || {};
    const ph = (r) => (r.ph && r.ph[0]) || {};
    this.ring.push({ ts, apf: this.model ? this.model.apfOn : (ph(a).I || 0) > 5, gP: g.P, gS: g.S, gPF: g.PF, gIthd: g.Ithd, gUthd: g.Uthd, gI: ph(g).I, gQ: g.Q, lQ: l.Q, lP: l.P, lS: l.S, lPF: l.PF, lIthd: l.Ithd, lI: ph(l).I, aI: ph(a).I });
    if (this.ring.length > 8640) this.ring.shift();
  }

  summary() {
    return {
      mode: this.simulate ? 'sim' : 'live',
      apf: this.model ? { on: this.model.apfOn, reactive: this.model.apfReactive, ratingA: this.model.apfA } : null,
      instruments: this.instruments.map((i) => ({
        id: i.id, no: i.no, role: i.role, name: i.name, host: i.host || i.path || null, model: i.profile || i.model || null,
        remoteScreen: i.host && !i.profile ? `http://${i.host}/` : null, ...this.status[i.id], data: this.latest[i.id] || null
      })),
      events: (this.model ? this.model.events : []).concat(this.alarms ? this.alarms.iticEvents() : []),
      alarms: this.alarms ? { unom: this.alarms.unom, push: Boolean(this.cfg.notify && this.cfg.notify.length), log: this.alarms.log.slice(0, 150) } : null
    };
  }
  history(hours = 24) {
    if (this.model) return this.model.history(Date.now(), { hours, stepMin: 5, apfFrom: Date.now() - 6 * 3600e3 });
    const from = Date.now() - hours * 3600e3;
    return this.ring.filter((r) => r.ts >= from);
  }
  setApf(on, reactive) {
    if (!this.model) { const e = new Error('APF switching is a demo-only control; command the real APF through its own controller'); e.code = 'NOT_SIMULATED'; e.status = 409; throw e; }
    this.model.apfOn = Boolean(on);
    if (reactive != null) this.model.apfReactive = Boolean(reactive);
    return this.summary().apf;
  }
  ftp(id) {
    const i = this.instruments.find((x) => x.id === id);
    if (!i) { const e = new Error('unknown instrument'); e.code = 'NOT_FOUND'; e.status = 404; throw e; }
    if (!i.host) { const e = new Error('instrument has no host'); e.code = 'NO_HOST'; e.status = 409; throw e; }
    return new FtpClient({ host: i.host, port: (i.ftp && i.ftp.port) || 21, user: (i.ftp && i.ftp.user) || 'anonymous', password: (i.ftp && i.ftp.password) || '' });
  }
  async files(id, dir = '/') {
    if (this.simulate) {
      const d = new Date(); const ymd = (k) => { const x = new Date(d - k * 864e5); return `${String(x.getFullYear()).slice(2)}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`; };
      return [0, 1, 2].map((k) => ({ name: `CD${ymd(k)}.CSV`, size: 1.9e6 - k * 1e5, dir: false, date: new Date(d - k * 864e5).toISOString().slice(0, 10), path: `/SD/${id}/CD${ymd(k)}.CSV` }));
    }
    return this.ftp(id).list(dir);
  }
  async file(id, p) {
    if (this.simulate) {
      const rows = this.history(24);
      const head = 'Date,Time,Freq,U1rms,I1rms,P_sum,S_sum,PF_sum,Uthd_max,Ithd_max\n';
      const role = (this.instruments.find((i) => i.id === id) || {}).role;
      return Buffer.from(head + rows.map((r) => {
        const t = new Date(r.ts); const P = role === 'load' ? r.lP : r.gP, S = role === 'load' ? r.lS : r.gS, PF = role === 'load' ? r.lPF : r.gPF, I = role === 'load' ? r.lI : role === 'apf' ? r.aI : r.gI;
        return [t.toISOString().slice(0, 10), t.toTimeString().slice(0, 8), '50.00', '230.0', I.toFixed(1), (P * 1000).toFixed(0), (S * 1000).toFixed(0), PF.toFixed(3), r.gUthd.toFixed(2), (role === 'load' ? r.lIthd : r.gIthd).toFixed(2)].join(',');
      }).join('\n'));
    }
    return this.ftp(id).get(p);
  }
}

module.exports = { PqService, DEFAULT_INSTRUMENTS };
