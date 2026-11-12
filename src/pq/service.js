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
    if (this.simulate) {
      const mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'pq-model.js')).href);
      this.model = new mod.PqModel();
      const tick = () => {
        const s = this.model.snapshot(Date.now());
        for (const i of this.instruments) { const r = s.instruments[i.id]; if (r) { this.latest[i.id] = { ts: s.ts, ...r }; this.status[i.id] = { online: true, ts: s.ts }; } }
        this.pushRing(s.ts);
      };
      tick(); this.timers.push(setInterval(tick, this.tickMs));
      return;
    }
    for (const inst of this.instruments) {
      if (!inst.host) continue;
      const c = new HiokiCmdClient({ host: inst.host, port: inst.commandPort || 3390, timeoutMs: inst.timeoutMs || 3000 }, this.log);
      this.clients[inst.id] = c;
      const poll = async () => {
        try {
          const f = {};
          for (const q of inst.queries || []) {
            const r = parseResponse(await c.query(q.cmd));
            Object.assign(f, r.named);
            (q.fields || []).forEach((name, k) => { if (r.values[k] != null) f[name.toUpperCase()] = r.values[k]; });
          }
          const ts = Date.now();
          this.latest[inst.id] = { ts, ...toRecord(inst.id, f), raw: f };
          this.status[inst.id] = { online: true, ts };
          this.pushRing(ts);
        } catch (e) {
          this.status[inst.id] = { online: false, ts: Date.now(), error: e.message };
          c.close();
        }
      };
      poll(); this.timers.push(setInterval(poll, inst.pollMs));
    }
  }
  stop() { for (const t of this.timers) clearInterval(t); this.timers = []; for (const c of Object.values(this.clients)) c.close(); }

  // 1 point / 10 s, 24 h
  pushRing(ts) {
    const last = this.ring[this.ring.length - 1];
    if (last && ts - last.ts < 10000) return;
    const g = this.latest['PQ-MAIN'] || {}, l = this.latest['PQ-LOAD'] || {}, a = this.latest['PQ-APF'] || {};
    const ph = (r) => (r.ph && r.ph[0]) || {};
    this.ring.push({ ts, apf: this.model ? this.model.apfOn : (ph(a).I || 0) > 5, gP: g.P, gS: g.S, gPF: g.PF, gIthd: g.Ithd, gUthd: g.Uthd, gI: ph(g).I, lP: l.P, lS: l.S, lPF: l.PF, lIthd: l.Ithd, lI: ph(l).I, aI: ph(a).I });
    if (this.ring.length > 8640) this.ring.shift();
  }

  summary() {
    return {
      mode: this.simulate ? 'sim' : 'live',
      apf: this.model ? { on: this.model.apfOn, reactive: this.model.apfReactive, ratingA: this.model.apfA } : null,
      instruments: this.instruments.map((i) => ({
        id: i.id, no: i.no, role: i.role, name: i.name, host: i.host || null,
        remoteScreen: i.host ? `http://${i.host}/` : null, ...this.status[i.id], data: this.latest[i.id] || null
      })),
      events: this.model ? this.model.events : []
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
