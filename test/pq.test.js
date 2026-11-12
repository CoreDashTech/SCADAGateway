'use strict';
// Power quality: physics of the APF model, the LAN command client + FTP client against mock instruments, and /api/pq.
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');
const { HiokiCmdClient, FtpClient, parseResponse, toRecord } = require('../src/pq/hioki');
const { PqService } = require('../src/pq/service');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'pq-model.js')).href);
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

test('APF model: KCL holds, APF cuts grid THD-I and lifts PF', async () => {
  const { PqModel } = await load();
  const m = new PqModel();
  const ms = new Date('2026-11-12T10:00:00').getTime();
  m.apfOn = false; const off = m.snapshot(ms);
  m.apfOn = true; const on = m.snapshot(ms);
  const g0 = off.instruments['PQ-MAIN'], g1 = on.instruments['PQ-MAIN'], l1 = on.instruments['PQ-LOAD'];
  assert.ok(g0.Ithd > 25 && g0.Ithd < 40, 'load-like THD-I without APF ' + g0.Ithd);
  assert.ok(g1.Ithd < 6, 'grid THD-I with APF ' + g1.Ithd);
  assert.ok(g1.PF > 0.97 && g0.PF < 0.85, 'PF ' + g0.PF + ' → ' + g1.PF);
  assert.ok(g1.Uthd < g0.Uthd, 'voltage THD falls');
  assert.ok(Math.abs(g1.P - l1.P) < 0.03 * l1.P, 'grid supplies the load real power');
  for (const p of g1.ph) assert.ok(Math.abs(p.S ** 2 - p.P ** 2 - p.Q ** 2 - p.D ** 2) < 1e-6 * p.S ** 2, 'S² = P²+Q²+D²');
});

test('response parser and record mapping', () => {
  assert.deepStrictEqual(parseResponse('230.1,229.8,+9.9E+99').values, [230.1, 229.8, null]);
  const r = parseResponse(':MEAS:U1 230.5E+00;U2 231;I1 100');
  assert.strictEqual(r.named.U1, 230.5); assert.strictEqual(r.named.I1, 100);
  const rec = toRecord('X', { U1: 230, U2: 230, U3: 230, I1: 10, I2: 10, I3: 10, P1: 2000, P2: 2000, P3: 2000, ITHD1: 30, ITHD2: 31, ITHD3: 29 });
  assert.strictEqual(rec.Ithd, 31); assert.ok(Math.abs(rec.P - 6) < 1e-9, 'W → kW');
});

test('LAN command client talks to a mock analyser', async () => {
  const srv = net.createServer((s) => { let b = ''; s.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\r\n')) >= 0) { const c = b.slice(0, i); b = b.slice(i + 2); s.write(c === '*IDN?' ? 'HIOKI,PW3198,123456,V2.00\r\n' : c === ':MEAS?' ? '230.1,229.9,230.4,812.5\r\n' : 'ERR\r\n'); } }); });
  const port = await listen(srv);
  const c = new HiokiCmdClient({ host: '127.0.0.1', port });
  const [a, b] = await Promise.all([c.query('*IDN?'), c.query(':MEAS?')]);
  assert.match(a, /PW3198/); assert.deepStrictEqual(parseResponse(b).values, [230.1, 229.9, 230.4, 812.5]);
  c.close(); srv.close();
});

test('FTP client lists and downloads from a mock analyser FTP server', async () => {
  const files = { '/SD/A.CSV': 'Date,U1\n2026-11-12,230.1\n' };
  const srv = net.createServer((s) => {
    let pasv = null, conn = null, b = '';
    const say = (t) => s.write(t + '\r\n');
    say('220 PW3198 FTP');
    s.on('data', async (d) => {
      b += d; let i;
      while ((i = b.indexOf('\r\n')) >= 0) {
        const line = b.slice(0, i); b = b.slice(i + 2); const [cmd, ...rest] = line.split(' '); const arg = rest.join(' ');
        if (cmd === 'USER') say('331 pass'); else if (cmd === 'PASS') say('230 ok'); else if (cmd === 'TYPE') say('200 ok');
        else if (cmd === 'PASV') { pasv = net.createServer(); conn = new Promise((r) => pasv.once('connection', r)); const p = await listen(pasv); say(`227 Entering Passive Mode (127,0,0,1,${p >> 8},${p & 255})`); }
        else if (cmd === 'LIST' || cmd === 'RETR') {
          const body = cmd === 'LIST' ? '-rw-r--r-- 1 u g 26 Nov 12 10:00 A.CSV\r\ndrwxr-xr-x 1 u g 0 Nov 12 10:00 EVT\r\n' : files[arg];
          const srvP = pasv; conn.then((ds) => { say('150 opening'); ds.end(body, () => { say('226 done'); srvP.close(); }); });
        } else say('502 no');
      }
    });
  });
  const port = await listen(srv);
  const ftp = new FtpClient({ host: '127.0.0.1', port });
  const list = await ftp.list('/SD');
  assert.deepStrictEqual(list.map((f) => [f.name, f.dir, f.path]), [['A.CSV', false, '/SD/A.CSV'], ['EVT', true, '/SD/EVT']]);
  assert.strictEqual((await ftp.get('/SD/A.CSV')).toString(), files['/SD/A.CSV']);
  srv.close();
});

test('PqService simulator serves summary, history and files', async () => {
  const s = new PqService({}, { simulate: true, tickMs: 50 });
  await s.start();
  const sum = s.summary();
  assert.strictEqual(sum.instruments.length, 3);
  assert.ok(sum.instruments.every((i) => i.online && i.data && i.data.ph.length === 3));
  const h = s.history(24);
  assert.ok(h.length > 200 && h.some((r) => r.apf) && h.some((r) => !r.apf));
  const f = await s.files('PQ-MAIN');
  assert.ok((await s.file('PQ-MAIN', f[0].path)).toString().startsWith('Date,Time'));
  assert.strictEqual(s.setApf(false).on, false);
  s.stop();
});

test('gateway exposes /api/pq in simulator mode', async () => {
  const fs = require('fs'), os = require('os');
  const { loadConfig } = require('../src/config');
  const { createGateway } = require('../src/gateway');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpq-'));
  const cfg = loadConfig(path.join(__dirname, '..', 'config', 'plant-a.yaml'), { SIMULATE: '1', DEMO_TOKENS: '1', CD_DATA_DIR: dataDir, PORT: '0' });
  const gw = createGateway(cfg, { log: { log() {}, warn() {}, error() {}, info() {} }, simTickMs: 200 });
  await gw.start();
  const base = `http://127.0.0.1:${gw.server.address().port}`;
  const get = (u, tok = 'demo-engineer') => fetch(base + u, { headers: { Authorization: 'Bearer ' + tok } });
  try {
    assert.strictEqual((await fetch(base + '/api/pq')).status, 401);
    const s = await (await get('/api/pq')).json();
    assert.strictEqual(s.mode, 'sim'); assert.strictEqual(s.instruments.length, 3);
    const files = await (await get('/api/pq/PQ-LOAD/files')).json();
    const f = await get('/api/pq/PQ-LOAD/file?path=' + encodeURIComponent(files[0].path));
    assert.strictEqual(f.status, 200); assert.match(f.headers.get('content-type'), /csv/);
    const r = await fetch(base + '/api/pq/apf', { method: 'POST', headers: { Authorization: 'Bearer demo-engineer', 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) });
    assert.strictEqual((await r.json()).on, false);
  } finally { await gw.stop(); }
});
