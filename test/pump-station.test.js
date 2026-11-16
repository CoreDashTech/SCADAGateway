'use strict';
// End-to-end tests of the STATION-01 gateway: REST API, control, scopes, rate limit, encryption, JSON test files.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../src/config');
const { createGateway } = require('../src/gateway');
const secure = require('../src/secure');

const keys = secure.keygen();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pump-station-'));
const env = { SIMULATE: '1', DEMO_TOKENS: '1', CD_DATA_DIR: dataDir, API_KEY_ERP: 'erp-key', ...keys };

let gw, base;
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const get = (p, key = 'demo-key', h = {}) => fetch(base + p, { headers: { 'X-API-Key': key, ...h } });
const post = (p, body, key = 'demo-key') => fetch(base + p, { method: 'POST', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test.before(async () => {
  const cfg = loadConfig(path.join(__dirname, '..', 'config', 'pump-station.yaml'), env);
  cfg.server.port = 0;
  Object.assign(process.env, keys); // secure.loadKeys reads process.env
  gw = createGateway(cfg, { log: quiet, simTickMs: 100 });
  await gw.start();
  base = `http://127.0.0.1:${gw.server.address().port}`;
  await new Promise((r) => setTimeout(r, 400));
});
test.after(async () => { await gw.stop(); });

test('latest returns JSON values for the SCADA screen', async () => {
  const r = await get('/api/v1/latest?points=system.pressure,FT-01.flow,P-01.run,P-01.freq,NOPE');
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('x-ratelimit-limit'));
  const j = await r.json();
  const p = j.data.find((d) => d.point === 'system.pressure');
  assert.ok(p.value > 0 && p.unit === 'bar' && p.quality === 'good' && p.ts);
  assert.deepStrictEqual(j.missing, ['NOPE']);
});

test('unknown key → 401, missing scope → 403', async () => {
  assert.strictEqual((await get('/api/v1/latest', 'wrong')).status, 401);
  assert.strictEqual((await get('/api/v1/alarms', 'erp-key')).status, 403);
  assert.strictEqual((await post('/api/v1/control', { command: 'alternate' }, 'erp-key')).status, 403);
});

test('points, status, last-update and export', async () => {
  const pts = await (await get('/api/v1/points')).json();
  assert.ok(pts.count > 50 && !pts.data.some((d) => d.point.startsWith('CMD.')));
  const st = await (await get('/api/v1/devices/status')).json();
  assert.strictEqual(st.pumps.length, 2);
  assert.strictEqual(st.control.mode, 'AUTO');
  const lu = await (await get('/api/v1/meta/last-update')).json();
  assert.ok(lu.age_seconds <= 2);
  const ex = await (await get('/api/v1/export')).json();
  assert.strictEqual(ex.format, 'coredash.snapshot/v1');
  assert.strictEqual(ex.settings['CTRL.sp'], 4);
});

test('control: config, mode, start/stop, alternate — audited', async () => {
  let r = await post('/api/v1/control', { command: 'config', args: { sp: 4.2, intervalStart: 20 } });
  assert.strictEqual(r.status, 202);
  await new Promise((res) => setTimeout(res, 150));
  let j = await (await get('/api/v1/latest?points=CTRL.sp,CTRL.int_start')).json();
  assert.deepStrictEqual(j.data.map((d) => d.value), [4.2, 20]);
  r = await post('/api/v1/control', { command: 'config', args: { sp: 9 } });
  assert.strictEqual(r.status, 400); // out of range 2–6 bar
  assert.strictEqual((await post('/api/v1/control', { command: 'mode', args: { mode: 'MANUAL' } })).status, 202);
  assert.strictEqual((await post('/api/v1/control', { command: 'start', args: { pump: 2 } })).status, 202);
  await new Promise((res) => setTimeout(res, 150));
  j = await (await get('/api/v1/latest?points=P-02.run,CTRL.mode')).json();
  assert.deepStrictEqual(j.data.map((d) => d.value), [1, 1]);
  assert.strictEqual((await post('/api/v1/control', { command: 'stop', args: { pump: 2 } })).status, 202);
  assert.strictEqual((await post('/api/v1/control', { command: 'mode', args: { mode: 'AUTO' } })).status, 202);
  const audit = fs.readFileSync(path.join(dataDir, 'audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(audit.some((a) => a.user === 'api:demo-key' && a.tag === 'CTRL.sp' && a.value === 4.2));
});

test('E-Stop interlock blocks a start command', async () => {
  gw.simSwitch.cur.force('MCC.estop', 1);
  await post('/api/v1/control', { command: 'mode', args: { mode: 'MANUAL' } });
  const r = await post('/api/v1/control', { command: 'start', args: { pump: 1 } });
  assert.strictEqual(r.status, 409);
  gw.simSwitch.cur.force('MCC.estop', 0);
  await post('/api/v1/control', { command: 'mode', args: { mode: 'AUTO' } });
});

test('alarms: phase loss raises PHASE (critical)', async () => {
  gw.simSwitch.cur.force('MCC.phase', 0);
  await new Promise((res) => setTimeout(res, 1300));
  const j = await (await get('/api/v1/alarms')).json();
  const a = j.data.find((x) => x.code === 'PHASE');
  assert.ok(a && a.severity === 'critical' && a.raised_at);
  gw.simSwitch.cur.force('MCC.phase', 1);
});

test('history aggregates by interval', async () => {
  const end = new Date(Date.now() + 1000).toISOString(), start = new Date(Date.now() - 60e3).toISOString();
  const j = await (await get(`/api/v1/history?point=system.pressure&start=${start}&end=${end}&interval=1s&agg=avg`)).json();
  assert.ok(j.count >= 1 && j.data[0].ts && typeof j.data[0].value === 'number');
  const bad = await get(`/api/v1/history?point=system.pressure&start=${start}&end=${end}&interval=9x`);
  assert.strictEqual(bad.status, 400);
});

test('payload encryption: AES-256-GCM round-trip and tamper detected; 3DES off by default', async () => {
  const k = secure.loadKeys({}, keys);
  const env = await (await get('/api/v1/latest?points=system.pressure', 'demo-key', { 'X-CD-Encrypt': 'aes-256-gcm' })).json();
  assert.strictEqual(env.enc, 'aes-256-gcm');
  assert.strictEqual(secure.decrypt(env, k).data[0].point, 'system.pressure');
  const bytes = Buffer.from(env.data, 'base64'); bytes[0] ^= 1; env.data = bytes.toString('base64');
  assert.throws(() => secure.decrypt(env, k));                         // GCM tag catches any change
  const off = await get('/api/v1/latest', 'demo-key', { 'X-CD-Encrypt': '3des' });
  assert.strictEqual(off.status, 400);
  assert.strictEqual((await off.json()).error.code, 'ENCRYPTION_NOT_ALLOWED');
  gw.cfg.security.allow3des = true;                                    // optional legacy mode still works when switched on
  const d = await (await get('/api/v1/latest', 'demo-key', { 'X-CD-Encrypt': '3des' })).json();
  assert.strictEqual(secure.decrypt(d, k).data.length, 3);
  gw.cfg.security.allow3des = false;
});

test('upload a JSON test file (scenario) and switch back to the model', async () => {
  const sc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'scenario-p01-fault.json'), 'utf8'));
  let r = await post('/api/v1/sim/scenario', { scenario: { format: 'x', frames: [] } });
  assert.strictEqual(r.status, 400);
  r = await post('/api/v1/sim/scenario', { scenario: sc });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(gw.simSwitch.mode, 'scenario');
  r = await post('/api/v1/sim/scenario', { reset: true });
  assert.strictEqual(gw.simSwitch.mode, 'model');
});

test('rate limit returns 429 with Retry-After', async () => {
  gw.cfg.api.keys.find((k) => k.id === 'erp').rateLimitPerMin = 3;
  let last;
  for (let i = 0; i < 5; i++) last = await get('/api/v1/latest', 'erp-key');
  assert.strictEqual(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});
