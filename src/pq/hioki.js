'use strict';
// Hioki PW3198 (and PQ3198/PQ3100-class) power-quality analysers over LAN — no USB, no SD-card swapping.
//
//   live values  : "communication commands" over a TCP socket (text lines, CR+LF)  → HiokiCmdClient
//   recorded data: the analyser's built-in FTP server (internal memory / SD card)   → FtpClient
//   remote screen: the analyser's built-in HTTP server (open http://<ip>/ in a browser on the same LAN)
//
// The command strings and the TCP port are NOT hard-coded: copy them from Hioki's
// "Communication Command Instruction Manual" for your model/firmware into the YAML (see config/pq-hioki.example.yaml).
// The response parser accepts plain numbers ("230.1,229.8,…") or header+value pairs ("U1 230.1;U2 229.8").
const net = require('net');

class HiokiCmdClient {
  constructor({ host, port, timeoutMs = 3000, eol = '\r\n' }, log = console) {
    Object.assign(this, { host, port, timeoutMs, eol, log });
    this.sock = null; this.buf = ''; this.waiters = []; this.chain = Promise.resolve();
  }
  connect() {
    if (this.sock && !this.sock.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      const fail = (e) => { s.destroy(); reject(e); };
      s.setTimeout(this.timeoutMs, () => fail(new Error('connect timeout')));
      s.once('error', fail);
      s.once('connect', () => {
        s.setTimeout(0); s.removeListener('error', fail);
        s.on('error', (e) => this.drop(e));
        s.on('close', () => this.drop(new Error('closed')));
        s.on('data', (d) => this.onData(d));
        this.sock = s; resolve();
      });
    });
  }
  drop(e) { this.sock = null; this.buf = ''; this.ready = false; for (const w of this.waiters.splice(0)) w.reject(e); }
  onData(d) {
    this.buf += d.toString('latin1');
    let i;
    while ((i = this.buf.search(/\r?\n/)) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(this.buf[i] === '\r' ? i + 2 : i + 1);
      const w = this.waiters.shift(); if (w) w.resolve(line.trim());
    }
  }
  // queries are serialised: one command on the wire at a time
  query(cmd) {
    const run = async () => {
      await this.connect();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.waiters = this.waiters.filter((w) => w.resolve !== ok); reject(new Error('timeout: ' + cmd)); }, this.timeoutMs);
        const ok = (v) => { clearTimeout(timer); resolve(v); };
        this.waiters.push({ resolve: ok, reject: (e) => { clearTimeout(timer); reject(e); } });
        this.sock.write(cmd + this.eol);
      });
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
  // a setting command (no reply expected), serialised with the queries
  send(cmd) {
    const run = async () => { await this.connect(); this.sock.write(cmd + this.eol); await new Promise((r) => setTimeout(r, 60)); };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
  close() { if (this.sock) this.sock.destroy(); this.sock = null; }
}

// "230.1,229.8" | "U1 230.1;U2 229.8" | ":MEAS:U1 230.1E+00" → { values:[…], named:{U1:230.1,…} }
function parseResponse(line) {
  const parts = String(line).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const values = [], named = {};
  for (const p of parts) {
    const m = p.match(/^(?::?[A-Z]+:)*([A-Za-z][\w+\-]*)\s+([-+]?[\d.]+(?:E[-+]?\d+)?)$/i);
    if (m) { const v = Number(m[2]), ok = Number.isFinite(v) && Math.abs(v) < 9e37 ? v : null; named[m[1].toUpperCase()] = ok; values.push(ok); continue; }
    const n = Number(p);
    values.push(Number.isFinite(n) && Math.abs(n) < 9e37 ? n : null); // Hioki returns ±9.9E+99 style for "no data"
  }
  return { values, named };
}

// flat field map → the record shape the CoreDash screens use (same as app/pq-model.js measure())
function toRecord(id, f) {
  const g = (k, d = null) => (f[k] != null ? f[k] : d);
  const ph = [1, 2, 3].map((n) => {
    const U = g('U' + n), I = g('I' + n), P = g('P' + n), Q = g('Q' + n), S = g('S' + n) ?? (U != null && I != null ? U * I : null);
    return { U, I, P, Q, S, PF: g('PF' + n) ?? (P != null && S ? Math.abs(P) / S : null), cos: g('DPF' + n), Uthd: g('UTHD' + n), Ithd: g('ITHD' + n), KF: g('KF' + n) };
  });
  const sum = (k) => (ph.every((p) => p[k] != null) ? ph.reduce((a, p) => a + p[k], 0) : null);
  const P = g('P') ?? sum('P'), Q = g('Q') ?? sum('Q'), S = g('S') ?? sum('S');
  const max = (k) => { const v = ph.map((p) => p[k]).filter((x) => x != null); return v.length ? Math.max(...v) : null; };
  const kilo = (v) => (v == null ? null : Math.abs(v) > 5000 ? v / 1000 : v); // instruments report W; screens use kW
  return {
    id, ph, P: kilo(P), Q: kilo(Q), S: kilo(S), PF: g('PF') ?? (P != null && S ? Math.abs(P) / S : null), cos: g('DPF'),
    f: g('F'), Uavg: g('UAVG') ?? (ph.every((p) => p.U != null) ? (ph[0].U + ph[1].U + ph[2].U) / 3 : null),
    unb: g('UUNB'), IN: g('I4'), Ithd: g('ITHD') ?? max('Ithd'), Uthd: g('UTHD') ?? max('Uthd'), KF: g('KF') ?? max('KF'), WP: g('WP')
  };
}

// ---------------------------------------------------------------- minimal passive-mode FTP client (LIST / RETR)
class FtpClient {
  constructor({ host, port = 21, user = 'anonymous', password = '', timeoutMs = 8000 }) { Object.assign(this, { host, port, user, password, timeoutMs }); }
  async session(fn) {
    const ctl = net.createConnection({ host: this.host, port: this.port });
    ctl.setTimeout(this.timeoutMs, () => ctl.destroy(new Error('FTP timeout')));
    let buf = ''; const q = [];
    const next = () => new Promise((resolve, reject) => {
      const tryLine = () => {
        const m = buf.match(/^(\d{3}) [^\r\n]*\r?\n/m);
        if (!m) return false;
        const end = buf.indexOf(m[0]) + m[0].length;
        const text = buf.slice(0, end); buf = buf.slice(end);
        resolve({ code: Number(m[1]), text: text.trim() }); return true;
      };
      if (!tryLine()) q.push({ tryLine, reject });
    });
    ctl.on('data', (d) => { buf += d.toString('utf8'); while (q.length && q[0].tryLine()) q.shift(); });
    ctl.on('error', (e) => { for (const w of q.splice(0)) w.reject(e); });
    const cmd = async (c, ok) => { ctl.write(c + '\r\n'); const r = await next(); if (ok && !ok.includes(Math.floor(r.code / 100))) throw new Error(`FTP ${c.split(' ')[0]}: ${r.text}`); return r; };
    try {
      await new Promise((res, rej) => { ctl.once('connect', res); ctl.once('error', rej); });
      const hi = await next(); if (hi.code !== 220) throw new Error('FTP greeting: ' + hi.text);
      const u = await cmd('USER ' + this.user, [2, 3]);
      if (u.code === 331) await cmd('PASS ' + this.password, [2]);
      await cmd('TYPE I', [2]);
      return await fn({ cmd, next, data: (c) => this.pasv(cmd, next, c) });
    } finally { ctl.end(); ctl.destroy(); }
  }
  async pasv(cmd, next, c) {
    const r = await cmd('PASV', [2]);
    const m = r.text.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/); if (!m) throw new Error('bad PASV reply');
    const port = Number(m[5]) * 256 + Number(m[6]);
    const chunks = [];
    const sock = net.createConnection({ host: this.host, port });
    const done = new Promise((res, rej) => { sock.on('data', (d) => chunks.push(d)); sock.on('end', res); sock.on('close', res); sock.on('error', rej); });
    await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
    const start = await cmd(c, [1, 2]);
    await done;
    if (Math.floor(start.code / 100) === 1) { const fin = await next(); if (Math.floor(fin.code / 100) !== 2) throw new Error('FTP transfer: ' + fin.text); }
    return Buffer.concat(chunks);
  }
  list(dir = '/') { return this.session(async ({ data }) => parseList((await data('LIST ' + dir)).toString('utf8'), dir)); }
  get(file) { return this.session(({ data }) => data('RETR ' + file)); }
}

// unix- or DOS-style listing → [{name, size, dir, date, path}]
function parseList(text, dir) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let m = line.match(/^([d-])[rwx-]{9}\s+\S+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d+\s+[\d:]+)\s+(.+)$/);
    if (m) { out.push({ name: m[4], size: Number(m[2]), dir: m[1] === 'd', date: m[3] }); continue; }
    m = line.match(/^(\d{2}-\d{2}-\d{2,4})\s+(\d{2}:\d{2}[AP]M)\s+(<DIR>|\d+)\s+(.+)$/i);
    if (m) out.push({ name: m[4], size: m[3] === '<DIR>' ? 0 : Number(m[3]), dir: m[3] === '<DIR>', date: m[1] + ' ' + m[2] });
  }
  const base = dir.endsWith('/') ? dir : dir + '/';
  return out.filter((f) => f.name !== '.' && f.name !== '..').map((f) => ({ ...f, path: base + f.name }));
}

module.exports = { HiokiCmdClient, FtpClient, parseResponse, toRecord, parseList };
