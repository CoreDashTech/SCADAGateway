'use strict';
// End-to-end: the whole gateway in simulator mode, over real HTTP and WebSocket.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('../src/config');
const { createGateway } = require('../src/gateway');
const { AuditLog } = require('../src/engine/audit');

const quiet = { log() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; };

let gw, base, dataDir;
const notified = [];

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-'));
  const cfg = loadConfig(path.join(__dirname, '..', 'config', 'plant-a.yaml'), { SIMULATE: '1', DEMO_TOKENS: '1', CD_DATA_DIR: dataDir, PORT: '0' });
  const fetchImpl = async (url, opts) => { notified.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; };
  gw = createGateway(cfg, { log: quiet, fetchImpl, simTickMs: 100 });
  await gw.start();
  base = `http://127.0.0.1:${gw.server.address().port}`;
});
test.after(async () => { await gw.stop(); });

const api = async (method, url, token, body) => {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

test('auth: no token 401, viewer cannot command 403', async () => {
  assert.strictEqual((await api('GET', '/api/tags')).status, 401);
  assert.strictEqual((await api('GET', '/api/tags', 'demo-viewer')).status, 200);
  assert.strictEqual((await api('POST', '/api/commands', 'demo-viewer', { tag: 'V-103.POS', value: 50 })).status, 403);
  assert.strictEqual((await api('GET', '/api/audit', 'demo-operator')).status, 403);
});

test('two-step command: prepare, other user cannot confirm, owner confirms, value moves', async () => {
  const prep = await api('POST', '/api/commands', 'demo-operator', { tag: 'V-103.POS', value: 50 });
  assert.strictEqual(prep.status, 200);
  assert.strictEqual(prep.body.value, 50);
  assert.strictEqual((await api('POST', `/api/commands/${prep.body.id}/confirm`, 'demo-engineer')).status, 403);
  const conf = await api('POST', `/api/commands/${prep.body.id}/confirm`, 'demo-operator');
  assert.strictEqual(conf.status, 200);
  assert.strictEqual(conf.body.result, 'ok');
  assert.ok(await until(() => gw.store.value('V-103.POS') === 50));
  assert.strictEqual((await api('POST', `/api/commands/${prep.body.id}/confirm`, 'demo-operator')).status, 404, 'a command can be used once');
});

test('validation: read-only tag, out of range, wrong type', async () => {
  assert.strictEqual((await api('POST', '/api/commands', 'demo-operator', { tag: 'T-1.LEVEL', value: 10 })).body.error, 'READ_ONLY');
  assert.strictEqual((await api('POST', '/api/commands', 'demo-operator', { tag: 'V-101.POS', value: 150 })).body.error, 'OUT_OF_RANGE');
  assert.strictEqual((await api('POST', '/api/commands', 'demo-operator', { tag: 'P-01.RUN', value: 'yes' })).body.error, 'BAD_VALUE');
});

test('interlock: tank at 98% forces P-01 off and blocks a start command', async () => {
  gw.sim.force('V-102.POS', 0); gw.sim.force('V-103.POS', 0);
  gw.sim.force('T-1.LEVEL', 98);
  assert.ok(await until(() => gw.store.value('P-01.RUN') === false), 'P-01 forced off');
  const r = await api('POST', '/api/commands', 'demo-operator', { tag: 'P-01.RUN', value: true });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.error, 'INTERLOCK');
  const il = await api('GET', '/api/interlocks', 'demo-viewer');
  assert.ok(il.body.find((x) => x.id === 'IL_TANK_HIGH').active);
});

test('interlock help: details + fixes, engineer bypass with reason lets the command through, LSHH never bypassable', async () => {
  gw.sim.force('V-102.POS', 0); gw.sim.force('V-103.POS', 0); gw.sim.force('T-1.LEVEL', 98);
  assert.ok(await until(() => gw.store.value('P-01.RUN') === false));
  const r = await api('POST', '/api/commands', 'demo-operator', { tag: 'P-01.RUN', value: true });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.details.id, 'IL_TANK_HIGH');
  assert.strictEqual(r.body.details.limit, 97);
  assert.strictEqual(r.body.details.bypassable, true);
  assert.deepStrictEqual(r.body.details.fixes[0].set, [{ tag: 'V-103.POS', value: 100 }]);

  const url = '/api/interlocks/IL_TANK_HIGH/bypass';
  assert.strictEqual((await api('POST', url, 'demo-operator', { minutes: 15, reason: 'pump test' })).status, 403, 'operator cannot bypass');
  assert.strictEqual((await api('POST', url, 'demo-engineer', { minutes: 15 })).body.error, 'REASON_REQUIRED');
  assert.strictEqual((await api('POST', url, 'demo-engineer', { minutes: 120, reason: 'pump test' })).body.error, 'BAD_VALUE', 'max 30 min');
  const ok = await api('POST', url, 'demo-engineer', { minutes: 15, reason: 'pump test after repair' });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.body.until > Date.now() + 14 * 60000);

  const prep = await api('POST', '/api/commands', 'demo-operator', { tag: 'P-01.RUN', value: true });
  assert.strictEqual(prep.status, 200, 'command allowed while bypassed');
  assert.strictEqual((await api('POST', `/api/commands/${prep.body.id}/confirm`, 'demo-operator')).body.result, 'ok');
  assert.ok(await until(() => gw.store.value('P-01.RUN') === true), 'P-01 runs');
  await sleep(400);
  assert.strictEqual(gw.store.value('P-01.RUN'), true, 'not forced off again while bypassed');

  // the final cut-off still trips and cannot be bypassed
  gw.sim.force('T-1.LEVEL', 99.8);
  assert.ok(await until(() => gw.store.value('P-01.RUN') === false), 'LSHH trips P-01');
  const no = await api('POST', '/api/interlocks/IL_TANK_LSHH/bypass', 'demo-admin', { minutes: 5, reason: 'try to bypass' });
  assert.strictEqual(no.status, 409);
  assert.strictEqual(no.body.error, 'NOT_BYPASSABLE');

  // expiry restores the interlock and is audited
  gw.sim.force('T-1.LEVEL', 98);
  gw.interlocks.bypasses.get('IL_TANK_HIGH').until = Date.now() - 1;
  gw.interlocks.expire();
  assert.strictEqual((await api('GET', '/api/interlocks', 'demo-viewer')).body.find((x) => x.id === 'IL_TANK_HIGH').bypass, null);
  const acts = gw.audit.list(50).map((e) => e.action);
  assert.ok(acts.includes('interlock.bypass') && acts.includes('interlock.restore'), 'bypass and restore audited');
  assert.strictEqual((await api('POST', '/api/commands', 'demo-operator', { tag: 'P-01.RUN', value: true })).status, 409, 'blocked again after expiry');
});

test('alarm: overflow raises, notifies LINE/SMS/push channels, operator acknowledges', async () => {
  assert.ok(await until(async () => (await api('GET', '/api/alarms', 'demo-viewer')).body.active.some((a) => a.rule === 'TANK_OVERFLOW')));
  const a = (await api('GET', '/api/alarms', 'demo-viewer')).body.active.find((x) => x.rule === 'TANK_OVERFLOW');
  assert.strictEqual(a.severity, 'critical');
  assert.ok(await until(() => notified.some((n) => n.body.alarm && n.body.alarm.rule === 'TANK_OVERFLOW')), 'webhook channels called');
  assert.strictEqual((await api('POST', `/api/alarms/${a.id}/ack`, 'demo-viewer')).status, 403);
  const ack = await api('POST', `/api/alarms/${a.id}/ack`, 'demo-operator');
  assert.strictEqual(ack.body.acked, true);
  assert.strictEqual(ack.body.ackedBy, 'demo-operator');
});

test('WebSocket: snapshot, live tag stream, prepare + confirm', async () => {
  const { CoreDashClient } = await import('../client/coredash-client.mjs');
  const cd = new CoreDashClient(base.replace('http', 'ws') + '/ws', 'demo-operator');
  try {
    assert.ok(await until(() => cd.user && cd.user.role === 'operator'));
    assert.ok(cd.value('MDB-1.KW') > 0);
    let updates = 0;
    cd.on('tags', () => updates++);
    assert.ok(await until(() => updates >= 2), 'live updates arrive');
    const cmd = await cd.prepare('L-A.LEVEL', 40);
    const entry = await cd.confirm(cmd.id);
    assert.strictEqual(entry.result, 'ok');
    assert.ok(await until(() => cd.value('L-A.LEVEL') === 40));
    await assert.rejects(cd.prepare('T-1.LEVEL', 1), /read-only/);
  } finally { cd.close(); }
});

test('WebSocket: bad token is rejected', async () => {
  const { CoreDashClient } = await import('../client/coredash-client.mjs');
  const cd = new CoreDashClient(base.replace('http', 'ws') + '/ws', 'nope');
  let err = null;
  cd.on('error', (e) => { err = e; });
  assert.ok(await until(() => err && err.error === 'UNAUTHORIZED'));
  cd.close();
});

test('historian returns a trend for a tag', async () => {
  await sleep(300);
  gw.historian.sampleMs = 0;
  await sleep(500);
  const r = await api('GET', `/api/history?tag=MDB-1.KW&from=${Date.now() - 60000}`, 'demo-viewer');
  assert.ok(r.body.points.length > 0);
  assert.strictEqual(r.body.points[0].length, 2);
});

test('audit log is hash-chained and detects tampering', async () => {
  const v = await api('GET', '/api/audit/verify', 'demo-admin');
  assert.strictEqual(v.body.ok, true);
  assert.ok(v.body.entries >= 3);
  const list = (await api('GET', '/api/audit?limit=50', 'demo-engineer')).body;
  assert.ok(list.some((e) => e.origin === 'interlock' && e.tag === 'P-01.RUN'));
  assert.ok(list.some((e) => e.origin === 'operator' && e.user === 'demo-operator'));
  const copy = path.join(dataDir, 'tampered.jsonl');
  const lines = fs.readFileSync(gw.cfg.audit.file, 'utf8').split('\n').filter(Boolean);
  const e = JSON.parse(lines[0]); e.value = 999; lines[0] = JSON.stringify(e);
  fs.writeFileSync(copy, lines.join('\n') + '\n');
  assert.strictEqual(AuditLog.verify(copy).ok, false);
});

test('scheduler fires a schedule once at its time in the site time zone', async () => {
  const { Scheduler } = require('../src/engine/scheduler');
  const calls = [];
  const fake = { system: async (src, tag, value) => calls.push([src, tag, value]) };
  // 2026-11-11 11:15 UTC = 18:15 Asia/Bangkok, a Wednesday
  const s = new Scheduler([{ id: 'PERIMETER_ON', at: '18:15', days: [3], set: [{ tag: 'L-O.ON', value: true }] }], fake, { now: () => new Date('2026-11-11T11:15:20Z'), log: quiet });
  await s.tick(); await s.tick();
  assert.deepStrictEqual(calls, [['schedule:PERIMETER_ON', 'L-O.ON', true]]);
});

test('interlock: when both tank interlocks hold, the non-bypassable one is reported', async () => {
  gw.sim.force('V-102.POS', 0); gw.sim.force('V-103.POS', 0); gw.sim.force('T-1.LEVEL', 99.8);
  const r = await api('POST', '/api/commands', 'demo-operator', { tag: 'P-01.RUN', value: true });
  assert.strictEqual(r.body.details.id, 'IL_TANK_LSHH');
  assert.strictEqual(r.body.details.bypassable, false);
  gw.sim.force('T-1.LEVEL', 60);
});
