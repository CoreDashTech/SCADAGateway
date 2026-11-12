'use strict';
// Real CCTV: owner PIN lock, signed camera sessions, ffmpeg MJPEG fan-out, ONVIF PTZ, HTTP routes.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { CamService, OnvifPtz } = require('../src/cams/service');
const SRC = 'lavfi:testsrc=size=320x180:rate=10';
const quiet = { log() {}, warn() {}, error() {}, info() {} };

test('owner PIN: wrong PINs counted, lockout after 5, signed session token', () => {
  const s = new CamService([{ id: 'CAM-A', name: 'โรงรถ', rtsp: SRC }], { env: { CAM_OWNER_PASSWORD: '123/45Test' }, log: quiet });
  assert.ok(s.enabled);
  assert.throws(() => s.unlock('123', 'u'), (e) => e.code === 'BAD_PIN' && e.left === 4, 'house number alone is not enough');
  assert.throws(() => s.unlock('123/45test', 'u'), (e) => e.code === 'BAD_PIN', 'case-sensitive');
  const ok = s.unlock('123/45Test', 'u');
  assert.ok(ok.exp > Date.now() && ok.cameras[0].id === 'CAM-A');
  assert.ok(s.check(ok.token));
  assert.throws(() => s.check(ok.token.slice(0, -2) + 'xx'), (e) => e.code === 'CAM_LOCKED');
  assert.throws(() => s.check('cam.1.abc'), (e) => e.code === 'CAM_LOCKED');
  for (let i = 0; i < 5; i++) assert.throws(() => s.unlock('000', 'v'));
  assert.throws(() => s.unlock('123/45Test', 'v'), (e) => e.code === 'LOCKED', 'locked even with the right PIN');
  assert.throws(() => new CamService([], { env: {} }).unlock('555', 'x'), (e) => e.code === 'NO_PIN');
});

test('ffmpeg turns the camera feed into JPEG frames', async () => {
  const s = new CamService([{ id: 'CAM-A', name: 'A', rtsp: SRC }], { env: { CAM_OWNER_PIN: '123' }, log: quiet });
  const jpg = await s.cam('CAM-A').stream.snapshot(15000);
  assert.strictEqual(jpg[0], 0xff); assert.strictEqual(jpg[1], 0xd8); assert.ok(jpg.length > 1000);
  s.stop();
});

test('ONVIF PTZ: GetProfiles then ContinuousMove / Stop with a digest UsernameToken', async () => {
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { seen.push({ path: req.url, b }); res.end(b.includes('GetProfiles') ? '<trt:Profiles token="Profile_1" fixed="true"></trt:Profiles>' : '<ok/>'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = new OnvifPtz({ host: '127.0.0.1', port: srv.address().port, user: 'admin', password: 'x' });
  await p.move('left'); await p.move('stop');
  assert.match(seen[0].b, /GetProfiles/); assert.match(seen[0].b, /PasswordDigest/);
  assert.match(seen[1].b, /ContinuousMove[\s\S]*Profile_1[\s\S]*PanTilt x="-0.5" y="0"/);
  assert.match(seen[2].b, /<tptz:Stop>/);
  srv.close();
});

test('gateway: /api/cams unlock → MJPEG stream → snapshot; stream refused without the camera token', async () => {
  const fs = require('fs'), os = require('os');
  const { loadConfig } = require('../src/config');
  const { createGateway } = require('../src/gateway');
  process.env.CAM_OWNER_PASSWORD = '123/45Test';
  const cfg = loadConfig(path.join(__dirname, '..', 'config', 'plant-a.yaml'), { SIMULATE: '1', DEMO_TOKENS: '1', CD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cdcam-')), PORT: '0' });
  cfg.cameras = [{ id: 'CAM-GARAGE', name: 'โรงรถ', rtsp: SRC }];
  const gw = createGateway(cfg, { log: quiet, simTickMs: 200 });
  await gw.start();
  const base = `http://127.0.0.1:${gw.server.address().port}`;
  const post = (u, body, tok = 'demo-viewer') => fetch(base + u, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.strictEqual((await post('/api/cams/unlock', { password: '123/45Test' }, 'nope')).status, 401, 'needs a gateway login');
    assert.strictEqual((await post('/api/cams/unlock', { password: '123' })).status, 401);
    assert.strictEqual((await fetch(base + '/api/cams/CAM-GARAGE/stream')).status, 401);
    const { token, cameras } = await (await post('/api/cams/unlock', { password: '123/45Test' })).json();
    assert.strictEqual(cameras[0].id, 'CAM-GARAGE');
    const ac = new AbortController();
    const r = await fetch(`${base}/api/cams/CAM-GARAGE/stream?t=${token}`, { signal: ac.signal });
    assert.match(r.headers.get('content-type'), /multipart\/x-mixed-replace/);
    const rd = r.body.getReader(); let got = Buffer.alloc(0);
    while (got.length < 3000) { const { value } = await rd.read(); got = Buffer.concat([got, Buffer.from(value)]); }
    assert.match(got.toString('latin1'), /--frame\r\nContent-Type: image\/jpeg/);
    ac.abort();
    const snap = await fetch(`${base}/api/cams/CAM-GARAGE/snapshot?t=${token}`);
    assert.strictEqual(snap.headers.get('content-type'), 'image/jpeg');
    assert.strictEqual((await post('/api/cams/CAM-GARAGE/ptz', { t: token, dir: 'left' })).status, 409, 'no PTZ configured');
  } finally { delete process.env.CAM_OWNER_PASSWORD; await gw.stop(); }
});
