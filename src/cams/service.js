'use strict';
// Real CCTV for the house page (V380 / any RTSP camera): owner-PIN lock, live MJPEG to the browser, snapshot, ONVIF PTZ.
//
//  camera (RTSP, LAN) ──► ffmpeg on the gateway ──► multipart MJPEG ──► <img> in the CoreDash web app
//
// Browsers cannot play RTSP, and V380's own cloud protocol is closed, so the camera must have RTSP turned on
// (V380: "ONVIF" switch in the V380 Pro app, or ceshi.ini on the SD card) and the gateway must be on the same LAN.
// Secrets never reach the web page: RTSP URLs (with the camera password) and the owner PIN come from env vars.
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

class CamStream {
  constructor(cam, { ffmpeg = 'ffmpeg', log = console, idleMs = 15000 } = {}) {
    Object.assign(this, { cam, ffmpeg, log, idleMs });
    this.clients = new Set(); this.last = null; this.lastTs = 0; this.proc = null; this.idle = null; this.error = null;
  }
  args() {
    const c = this.cam, out = ['-an', '-vf', `scale='min(${c.width || 1280},iw)':-2,fps=${c.fps || 10}`, '-q:v', String(c.quality || 6), '-f', 'mjpeg', 'pipe:1'];
    if (c.source.startsWith('lavfi:')) return ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', c.source.slice(6), ...out];
    return ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', c.transport || 'tcp', '-timeout', '8000000', '-i', c.source, ...out];
  }
  start() {
    if (this.proc) return;
    const p = spawn(this.ffmpeg, this.args(), { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = p; this.error = null;
    let buf = Buffer.alloc(0), err = '';
    p.stdout.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      for (;;) { // split JPEG frames on SOI (FFD8) … EOI (FFD9)
        const s = buf.indexOf(Buffer.from([0xff, 0xd8])); if (s < 0) { buf = Buffer.alloc(0); break; }
        const e = buf.indexOf(Buffer.from([0xff, 0xd9]), s + 2); if (e < 0) { buf = buf.subarray(s); break; }
        this.frame(buf.subarray(s, e + 2)); buf = buf.subarray(e + 2);
      }
      if (buf.length > 8e6) buf = Buffer.alloc(0);
    });
    p.stderr.on('data', (d) => { err = (err + d).slice(-600); });
    p.on('error', (e) => { this.error = e.code === 'ENOENT' ? 'ffmpeg not installed on the gateway' : e.message; });
    p.on('close', () => {
      this.proc = null;
      if (err.trim()) this.error = err.trim().split('\n').pop();
      if (this.clients.size) setTimeout(() => this.clients.size && this.start(), 3000); // camera rebooted / Wi-Fi hiccup → retry
    });
  }
  frame(jpg) {
    this.last = Buffer.from(jpg); this.lastTs = Date.now(); this.error = null;
    for (const res of this.clients) {
      if (res.writableNeedDrain) continue; // slow phone: drop frames instead of buffering
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`); res.write(jpg); res.write('\r\n');
    }
  }
  attach(res) {
    clearTimeout(this.idle);
    res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store', Connection: 'close', 'X-Accel-Buffering': 'no' });
    this.clients.add(res);
    if (this.last && Date.now() - this.lastTs < 5000) this.frame(this.last);
    this.start();
    res.on('close', () => { this.clients.delete(res); if (!this.clients.size) this.idle = setTimeout(() => this.stop(), this.idleMs); });
  }
  async snapshot(timeoutMs = 10000) {
    if (this.last && Date.now() - this.lastTs < 3000) return this.last;
    clearTimeout(this.idle); this.start();
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { await new Promise((r) => setTimeout(r, 150)); if (this.last && this.lastTs >= t0) break; }
    if (!this.clients.size) this.idle = setTimeout(() => this.stop(), this.idleMs);
    if (!this.last || this.lastTs < t0) throw Object.assign(new Error(this.error || 'camera did not answer'), { status: 504, code: 'CAM_TIMEOUT' });
    return this.last;
  }
  stop() { if (this.proc) this.proc.kill('SIGKILL'); this.proc = null; }
}

// ONVIF PTZ (ContinuousMove / Stop) with WS-Security UsernameToken digest
class OnvifPtz {
  constructor({ host, port = 8899, user = 'admin', password = '', path = '/onvif/ptz_service', mediaPath = '/onvif/media_service' }) { Object.assign(this, { host, port, user, password, path, mediaPath }); this.profile = null; }
  envelope(body) {
    const nonce = crypto.randomBytes(16), created = new Date().toISOString();
    const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(this.password)])).digest('base64');
    return `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken><Username>${this.user}</Username><Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password><Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</Nonce><Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created></UsernameToken></Security></s:Header><s:Body>${body}</s:Body></s:Envelope>`;
  }
  post(path, body) {
    const data = this.envelope(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ host: this.host, port: this.port, path, method: 'POST', timeout: 5000, headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => (res.statusCode < 300 ? resolve(t) : reject(Object.assign(new Error('ONVIF ' + res.statusCode + ': ' + (t.match(/<[^>]*Text[^>]*>([^<]+)/) || [])[1]), { status: 502, code: 'ONVIF' }))));
      });
      req.on('timeout', () => req.destroy(new Error('ONVIF timeout'))); req.on('error', (e) => reject(Object.assign(e, { status: 502, code: 'ONVIF' })));
      req.end(data);
    });
  }
  async token() {
    if (this.profile) return this.profile;
    const xml = await this.post(this.mediaPath, '<trt:GetProfiles/>');
    const m = xml.match(/Profiles[^>]*token="([^"]+)"/); if (!m) throw Object.assign(new Error('no ONVIF media profile'), { status: 502, code: 'ONVIF' });
    return (this.profile = m[1]);
  }
  async move(dir, speed = 0.5) {
    const p = await this.token();
    if (dir === 'stop') return this.post(this.path, `<tptz:Stop><tptz:ProfileToken>${p}</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`);
    const v = { left: [-speed, 0, 0], right: [speed, 0, 0], up: [0, speed, 0], down: [0, -speed, 0], zoomin: [0, 0, speed], zoomout: [0, 0, -speed] }[dir];
    if (!v) throw Object.assign(new Error('bad direction'), { status: 400, code: 'BAD_DIR' });
    const vel = (v[2] ? `<tt:Zoom x="${v[2]}"/>` : `<tt:PanTilt x="${v[0]}" y="${v[1]}"/>`);
    return this.post(this.path, `<tptz:ContinuousMove><tptz:ProfileToken>${p}</tptz:ProfileToken><tptz:Velocity>${vel}</tptz:Velocity><tptz:Timeout>PT2S</tptz:Timeout></tptz:ContinuousMove>`);
  }
}

class CamService {
  constructor(cameras = [], { env = process.env, log = console, ffmpeg, sessionMin = 10 } = {}) {
    this.log = log; this.sessionMs = sessionMin * 60000;
    const pw = env.CAM_OWNER_PASSWORD || env.CAM_OWNER_PIN;
    this.pinHash = pw ? sha('coredash-cam:' + pw) : null;
    this.secret = crypto.randomBytes(32);
    this.fails = new Map(); // key → {n, until}
    this.cams = cameras.map((c) => {
      const source = c.rtspEnv ? env[c.rtspEnv] : c.rtsp;
      const on = c.onvif && c.onvif.host ? { ...c.onvif, user: c.onvif.userEnv ? env[c.onvif.userEnv] : c.onvif.user, password: c.onvif.passwordEnv ? env[c.onvif.passwordEnv] : c.onvif.password } : null;
      return { id: c.id, name: c.name, nameEn: c.nameEn, source, stream: source ? new CamStream({ ...c, source }, { ffmpeg, log }) : null, ptz: on ? new OnvifPtz(on) : null };
    });
  }
  get enabled() { return Boolean(this.pinHash && this.cams.some((c) => c.stream)); }
  list() { return this.cams.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn || c.name, ready: Boolean(c.stream), ptz: Boolean(c.ptz), error: c.stream && c.stream.error })); }
  status() { return { enabled: this.enabled, pinSet: Boolean(this.pinHash), cameras: this.cams.map((c) => ({ id: c.id, name: c.name, ready: Boolean(c.stream) })) }; }

  // 5 wrong PINs → locked for 5 minutes (per user + address)
  unlock(pin, who) {
    if (!this.pinHash) throw Object.assign(new Error('owner password not set on the gateway (CAM_OWNER_PASSWORD)'), { status: 503, code: 'NO_PIN' });
    const f = this.fails.get(who) || { n: 0, until: 0 };
    if (f.until > Date.now()) throw Object.assign(new Error('too many wrong passwords'), { status: 429, code: 'LOCKED', retryAfter: Math.ceil((f.until - Date.now()) / 1000) });
    const ok = crypto.timingSafeEqual(sha('coredash-cam:' + String(pin || '')), this.pinHash);
    if (!ok) {
      f.n += 1; if (f.n >= 5) { f.until = Date.now() + 5 * 60000; f.n = 0; }
      this.fails.set(who, f);
      throw Object.assign(new Error('wrong password'), { status: 401, code: 'BAD_PIN', left: f.until > Date.now() ? 0 : 5 - f.n });
    }
    this.fails.delete(who);
    const exp = Date.now() + this.sessionMs;
    return { token: this.sign(exp), exp, cameras: this.list() };
  }
  sign(exp) { const p = `cam.${exp}`; return `${p}.${crypto.createHmac('sha256', this.secret).update(p).digest('base64url')}`; }
  check(token) {
    const m = /^cam\.(\d+)\.([\w-]+)$/.exec(String(token || ''));
    const bad = () => Object.assign(new Error('camera session expired — enter the password again'), { status: 401, code: 'CAM_LOCKED' });
    if (!m || Number(m[1]) < Date.now()) throw bad();
    const want = crypto.createHmac('sha256', this.secret).update(`cam.${m[1]}`).digest();
    const got = Buffer.from(m[2], 'base64url');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw bad();
    return Number(m[1]);
  }
  cam(id) { const c = this.cams.find((x) => x.id === id); if (!c || !c.stream) throw Object.assign(new Error('unknown camera'), { status: 404, code: 'NOT_FOUND' }); return c; }
  stop() { for (const c of this.cams) if (c.stream) c.stream.stop(); }
}

module.exports = { CamService, CamStream, OnvifPtz };
