'use strict';
// Power quality: physics of the APF model, the LAN command client + FTP client against mock instruments, and /api/pq.
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');
const { HiokiCmdClient, FtpClient, parseResponse, toRecord } = require('../src/pq/hioki');
const { PqService } = require('../src/pq/service');
const ModbusRTU = require('modbus-serial');
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

test('savings engine: PEA PF charge, IEEE C57.110 F_HL, honest pilot and APF verdict', async () => {
  const E = await import(pathToFileURL(path.join(__dirname, '..', 'app', 'audit-engine.js')).href);
  const { PqModel } = await load();
  assert.strictEqual(E.pfPenalty(100, 61.97), 0);
  assert.ok(Math.abs(E.pfPenalty(100, 71.97) - 10 * 56.07) < 1e-6, '10 kvar over → 560.7 THB');
  assert.strictEqual(E.fhl({}), 1, 'pure sine F_HL = 1');
  assert.ok(E.fhl(E.spectrum('thy6', 30)) > 2, 'rectifier spectrum heats windings');
  const sel = Object.fromEntries(E.MACHINES.map((m) => [m.id, E.diagnose(m)]));
  const p = E.plan(sel);
  assert.ok(p.all.total > 0 && Number.isFinite(p.payback) && p.all.pf[1] > p.all.pf[0]);
  assert.ok(E.diagnose(E.MACHINES.find((m) => m.id === 'RECT-02')).some((f) => f.key === 'dcap'), 'harmonic load gets a detuned bank, not plain caps');
  const rows = E.pilotData(E.MACHINES[1], E.diagnose(E.MACHINES[1])[0]);
  assert.strictEqual(E.mvStat(rows, 'P').significant, false, 'capacitors do not change machine kW');
  assert.ok(E.mvStat(rows, 'Q').significant && E.mvStat(rows, 'Q').diff < 0, 'kvar drops for real');
  const m = new PqModel(), t = new Date('2026-11-12T10:00:00').getTime();
  const r = E.apfCase({ inst: m.snapshot(t).instruments }, m.history(t, { apfFrom: t - 6 * 3600e3 }));
  assert.ok(r.items.find((i) => i.key === 'self').thb < 0, 'APF own losses are deducted');
});

// ---------------------------------------------------------------- PW3198 preset (command set verified on a real PW3198 fw 1.08)
test('PW3198: parse the real :MEASure? reply captured from the instrument', async () => {
  const pw = await import('../app/pw3198.js');
  const real = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'pw3198-measure-real.txt'), 'utf8');
  const n = pw.parsePw3198(real);
  assert.strictEqual(n.STATUS, 'F00000');
  assert.strictEqual(n.FREQ, 50);
  assert.strictEqual(n.PFSUM, null, '+9999.9E+99 means no value');
  assert.strictEqual(n['I1PK+'], 55);
  const r = pw.pw3198Record('PQ-MAIN', n);
  assert.strictEqual(r.noVoltage, true);
  assert.strictEqual(r.f, 50);
  assert.strictEqual(r.ph[0].KF, null, 'no K-factor without current');
});

test('PqService PW3198 preset: init once, poll :MEASure?, map to kW', async () => {
  let hdr = 'OFF', item = '0,0,0'; const seen = [];
  const srv = net.createServer((sock) => {
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const q = buf.slice(0, i).trim(); buf = buf.slice(i + 1); seen.push(q);
        if (q === ':HEADer ON') hdr = 'ON';
        else if (q.startsWith(':MEASure:ITEM:POWer ')) item = q.split(' ')[1];
        else if (q === ':MEASure?') sock.write((hdr === 'ON' && item === '159,255,255'
          ? 'Status F00000,Freq 50.010E+00,U1rms 230.10E+00,U2rms 229.90E+00,U3rms 230.40E+00,I1rms 0.4120E+03,I2rms 0.4000E+03,I3rms 0.4050E+03,P1 0.0800E+06,P2 0.0780E+06,P3 0.0790E+06,Psum 0.2370E+06,Qsum 0.1420E+06,Ssum 0.2763E+06,PF1 -0.8600E+00,PFsum -0.8578E+00,KF1 2.40E+00,I1thd-F 24.00E+00,U1thd-F 3.10E+00'
          : 'F00000') + '\r\n');
      }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const s = new PqService({ instruments: [{ id: 'PQ-MAIN', no: 2, role: 'grid', name: 'MAIN', host: '127.0.0.1', commandPort: srv.address().port, pollMs: 100, model: 'PW3198' }] }, { log: { info() {}, warn() {}, error() {} } });
  await s.start();
  await new Promise((r) => setTimeout(r, 450));
  s.stop(); srv.close();
  const d = s.summary().instruments[0];
  assert.strictEqual(d.online, true, JSON.stringify(d));
  assert.ok(Math.abs(d.data.P - 237) < 1e-6);
  assert.ok(Math.abs(d.data.PF - 0.8578) < 1e-9);
  assert.strictEqual(d.data.ph[0].I, 412);
  assert.strictEqual(seen.filter((q) => q === ':HEADer ON').length, 1, 'init sent once per connection');
  assert.ok(seen.filter((q) => q === ':MEASure?').length >= 3);
});

test('PQ alarms: dip/swell/THD rules, durations, clear, ITIC events; field-tool rules identical', async () => {
  const al = await import('../app/pq-alarms.js');
  const json = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'pw3198', 'pq-alarm-rules.json'), 'utf8'));
  assert.deepStrictEqual(json.rules, JSON.parse(JSON.stringify(al.RULES)), 'tools/pw3198/pq-alarm-rules.json must match app/pq-alarms.js RULES');
  const seen = [];
  const e = new al.PqAlarmEngine({ onEvent: (k, ev) => seen.push(k + ':' + ev.rule + ':' + ev.sev) });
  const mk = (U, thdu = 3, Ithd = 10) => ({ ph: [0, 1, 2].map(() => ({ U, I: 300, Upk: U * 1.41, Uthd: thdu, Ithd, KF: 2 })), PF: 0.92, f: 50, unb: 0.5, IN: 20 });
  let t = 0;
  // no voltage ever seen → voltage rules stay quiet (leads not connected yet)
  for (let i = 0; i < 5; i++) e.feed('M', mk(0), (t += 1000));
  assert.strictEqual(e.log.length, 0);
  for (let i = 0; i < 3; i++) e.feed('M', mk(230), (t += 1000));
  for (let i = 0; i < 3; i++) e.feed('M', mk(150), (t += 1000));           // 65% → dip alarm after 1 s
  for (let i = 0; i < 5; i++) e.feed('M', mk(230), (t += 1000));           // clears after 3 s
  assert.deepStrictEqual(seen.slice(0, 2), ['raise:dip:alarm', 'clear:dip:alarm']);
  const it = e.iticEvents()[0];
  assert.strictEqual(it.kind, 'dip'); assert.ok(Math.abs(it.mag - 150 / 230) < 1e-9); assert.ok(it.ms >= 2000 && it.ms <= 4000, String(it.ms));
  for (let i = 0; i < 59; i++) e.feed('M', mk(230, 9), (t += 1000));
  assert.ok(!seen.includes('raise:thdu:alarm'), 'THD-U needs 60 s');
  for (let i = 0; i < 3; i++) e.feed('M', mk(230, 9), (t += 1000));
  assert.ok(seen.includes('raise:thdu:alarm'));
  e.offline('M', (t += 11000));
  assert.ok(seen.includes('raise:comm:alarm'));
  const txt = al.alarmText(e.active().find((a) => a.rule === 'thdu'));
  assert.match(txt.title, /THD-U/); assert.match(txt.body, /IEEE 519/);
});

test('field tool: PowerShell script keeps its UTF-8 BOM (Windows PowerShell 5.1 misreads Thai text without it)', () => {
  const fs = require('fs'), path = require('path');
  const b = fs.readFileSync(path.join(__dirname, '..', 'tools', 'pw3198', 'CoreDash-PW3198.ps1'));
  assert.deepStrictEqual([...b.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('smart diagnosis on the Lab case (13 Nov 2026): wiring, PF cause, APF set-up, CT ratio', async () => {
  const d = await import('../app/pq-diagnose.js');
  const run = (i) => { const s = d.LAB_CASE.steps[i]; return d.diagnose({ points: s.points, setup: s.setup, apf: { rating: 50, ...s.apf } }); };
  const ids = (r) => r.findings.map((f) => f.point + ':' + f.id);
  // #6 set to 3P4W on a 3-wire APF → 134 V
  assert.ok(ids(run(0)).includes('APF:W1'));
  // heaters only: MAIN ≈ LOAD, PF fine, placement consistent
  const r1 = run(1); assert.ok(ids(r1).includes('MAIN:W9')); assert.ok(!r1.findings.some((f) => f.sev === 'crit'));
  // harmonic generator on: PF low because of harmonics → no capacitor recommended
  const r2 = run(2); assert.ok(ids(r2).includes('LOAD:P1')); assert.ok(!r2.recommend.some((o) => o.id === 'cap' || o.id === 'detuned'));
  // APF running but removing only ~1/3 of the non-active power, rating sufficient, #6 disagrees with the APF screen
  const r3 = run(3); assert.ok(ids(r3).includes('APF:A1')); assert.ok(ids(r3).includes('APF:W10'));
  assert.ok(r3.apf.nonActiveCut > 0.25 && r3.apf.nonActiveCut < 0.4, String(r3.apf.nonActiveCut));
  assert.ok(r3.apf.Ineed < 50); assert.strictEqual(r3.recommend.find((o) => o.id === 'cfg').pick, true);
  // 12:12 APF reads 440 A load and THD_L 826340 % → CT ratio
  const r4 = run(4); assert.ok(ids(r4).includes('APF:A2')); assert.ok(ids(r4).includes('APF:A3'));
  // Hioki Q = √(S²−P²) on the Lab numbers (L1 1.714 kVA, 1.093 kW → 1.320 kvar)
  assert.ok(Math.abs(Math.sqrt(1.714 ** 2 - 1.093 ** 2) - 1.320) < 0.002);
});

test('smart diagnosis: reversed clamp, displacement PF → capacitor sizing, leading PF', async () => {
  const d = await import('../app/pq-diagnose.js');
  const ph = (P, Q, I = 100, U = 230, Ithd = 5) => ({ U, I, P, Q, S: Math.hypot(P, Q), PF: Math.abs(P) / Math.hypot(P, Q), Ithd, Uthd: 2 });
  const mk = (a) => ({ ph: a, P: a.reduce((s, p) => s + p.P, 0) / 1000, Q: a.reduce((s, p) => s + p.Q, 0) / 1000, S: a.reduce((s, p) => s + p.S, 0) / 1000, PF: null, f: 50 });
  let r = d.diagnose({ points: { LOAD: mk([ph(-15000, 9000), ph(15000, 9000), ph(15000, 9000)]) } });
  assert.ok(r.findings.some((f) => f.id === 'W3'));
  const load = mk([ph(15000, 12000), ph(15000, 12000), ph(15000, 12000)]); load.PF = load.P / load.S;
  r = d.diagnose({ points: { LOAD: load } });
  assert.ok(r.findings.some((f) => f.id === 'P4'));
  const cap = r.recommend.find((o) => o.id === 'cap');
  assert.ok(cap && cap.size >= 20 && cap.size <= 25, JSON.stringify(cap));     // 45 kW × (tan(acos .781) − tan(acos .95)) ≈ 21 kvar
  const lead = mk([ph(15000, -12000), ph(15000, -12000), ph(15000, -12000)]); lead.PF = lead.P / lead.S;
  r = d.diagnose({ points: { MAIN: lead } });
  assert.ok(r.findings.some((f) => f.id === 'P2'));
});

test('early warning: loose joint (MAIN vs LOAD drop), intermittent supply, overload, neutral', async () => {
  const R = await import('../app/pq-risk.js');
  const base = (U, I) => ({ ph: [0, 1, 2].map(() => ({ U, I, P: U * I * 0.95, Upk: U * 1.41, Uhf: 0.2 })), IN: 2, KF: 1.5 });
  const run = (scn, rating) => {
    const seen = [];
    const e = new R.PqRiskEngine({ rating: { LOAD: rating || null }, onEvent: (k, ev) => k === 'raise' && seen.push(ev.key) });
    for (let t = 0; t < 180; t++) {
      const ts = 1e6 + t * 1000, load = 30 + 10 * Math.sin(t / 9);
      e.feed('MAIN', R.applyScenario(scn, 'MAIN', base(231, load), ts, e.o), ts);
      e.feed('LOAD', R.applyScenario(scn, 'LOAD', base(230, load), ts, e.o), ts);
      if (t % 2) e.analyse(ts);
    }
    return { seen, e };
  };
  assert.deepStrictEqual(run(null).seen, [], 'healthy data → no warning');
  assert.ok(run('loose').seen.includes('LOAD:joint'));
  const ic = run('intermittent'); assert.ok(ic.seen.includes('LOAD:intermittent')); assert.match(ic.e.locate().th, /เฉพาะที่ LOAD/);
  assert.ok(run('overload', 25).seen.includes('LOAD:overload'));
  assert.ok(run('neutral').seen.includes('LOAD:neutral'));
});

test('harmonics by order: IEC 61000-2-2 voltage table, IEEE 519-2022 current table, resonance', async () => {
  const d = await import('../app/pq-diagnose.js');
  assert.strictEqual(d.uLimitIEC(5), 6); assert.strictEqual(d.uLimitIEC(15), 0.4); assert.strictEqual(d.uLimitIEC(4), 1);
  assert.ok(Math.abs(d.uLimitIEC(17) - 2.0) < 0.01);
  assert.strictEqual(d.iLimitIEEE(5, 15), 4.0); assert.strictEqual(d.iLimitIEEE(13, 35), 3.5); assert.strictEqual(d.iLimitIEEE(4, 15), 2.0); assert.strictEqual(d.iLimitIEEE(37, 2000), 1.4);
  const r = d.harmonicOrders(d.LAB_HARMONICS.ih, [], { scr: 15, txKva: 100, txZ: 4, capKvar: 30 });
  assert.ok(r.THDI > 26 && r.THDI < 28); assert.ok(r.over.some((o) => o.h === 5)); assert.ok(r.dcBad);
  assert.ok(Math.abs(r.res.hr - Math.sqrt(2500 / 30)) < 1e-9);
});

test('glossary: every abbreviation used for tooltips has a meaning; THD-I vs TDD explained', async () => {
  const g = await import('../app/pq-glossary.js');
  const found = 'PF 0.53 · THD-I 26.9% · TDD 5% · KF 38 · Isc/IL · 3P3W3M · kvar'.match(g.AUTO_RE);
  assert.deepStrictEqual(found, ['PF', 'THD-I', 'TDD', 'KF', 'Isc/IL', '3P3W3M', 'kvar']);
  for (const k of found) assert.ok(g.findTerm(k), k);
  assert.match(g.findTerm('TDD').s.th, /IL/); assert.match(g.findTerm('THD-I').f, /I1/);
});

test('instrument picker: 10 brands, Modbus profiles read live through the gateway, CSV import auto-maps columns', async () => {
  const M = await import(pathToFileURL(path.join(__dirname, '..', 'app', 'pq-meters.js')).href);
  const brands = new Set(M.METERS.filter((m) => m.id !== 'custom-modbus').map((m) => m.brand));
  assert.ok(brands.size >= 10, 'at least 10 brands');
  for (const m of M.METERS) { assert.ok(m.conn.length && m.ingest.length, m.id); if (m.ingest.includes('modbus') && m.id !== 'custom-modbus') assert.ok(M.MODBUS[m.id], 'profile ' + m.id); }

  // headers seen in Hioki / Fluke / generic exports
  const c = (h) => (M.classifyHeader(h) || {}).key;
  assert.strictEqual(c('Urms1_Avg[V]'), 'U1RMS'); assert.strictEqual(c('Vrms AN Avg (V)'), 'U1RMS'); assert.strictEqual(c('Arms A Avg (A)'), 'I1RMS');
  assert.strictEqual(c('Active Power Total Avg (W)'), 'PSUM'); assert.strictEqual(c('THD V AN Avg (%)'), 'U1THD-F'); assert.strictEqual(c('VA'), 'SSUM');
  assert.strictEqual(c('U12'), undefined, 'line-line voltage is not a phase voltage');
  assert.strictEqual(M.classifyHeader('P sum kW').scale, 1000);

  // semicolon CSV with decimal commas, a preamble and kW columns → record with W, PF sign from Q
  const csv = ['Instrument;KEW6315', 'Date;Time;V1[V];V2[V];V3[V];A1[A];A2[A];A3[A];P[kW];Q[kvar];S[kVA];PF;Freq[Hz];THD V1[%];THD A1[%]',
    '13/11/2026;11:20:00;230,1;229,8;231,0;20,0;21,0;19,5;12,0;-3,0;14,2;0,85;50,01;4,1;26,9',
    '13/11/2026;11:21:00;229,9;229,6;230,8;22,0;23,0;21,5;13,0;-3,4;15,4;0,84;49,99;4,3;27,1'].join('\n');
  const r = M.csvRecord('PQ-LOAD', csv, { mode: 'avg' });
  assert.strictEqual(r.parsed.headerLine, 1); assert.strictEqual(r.rowsUsed, 2);
  assert.ok(Math.abs(r.record.ph[0].U - 230) < 0.1); assert.ok(Math.abs(r.record.P - 12.5) < 1e-6, 'kW kept as kW in the record');
  assert.strictEqual(r.record.pfSign, -1, 'negative Q → leading (Hioki convention)');
  assert.ok(Math.abs(r.record.ph[0].Ithd - 27) < 1e-6);
  const worst = M.csvRecord('PQ-LOAD', csv, { mode: 'worst' }); assert.ok(Math.abs(worst.record.ph[0].I - 22) < 1e-9);
  const d = await import(pathToFileURL(path.join(__dirname, '..', 'app', 'pq-diagnose.js')).href);
  assert.ok(d.diagnose({ points: { LOAD: r.record } }).findings.length >= 1, 'imported data runs through the diagnosis');

  // live: a Modbus TCP meter (Eastron SDM630 map) served by a mock → PqService record + alarms
  const input = new Array(260).fill(0);
  const put = (a, v) => { const buf = Buffer.alloc(4); buf.writeFloatBE(v); input[a] = buf.readUInt16BE(0); input[a + 1] = buf.readUInt16BE(2); };
  put(0, 231); put(2, 229); put(4, 230); put(6, 10); put(8, 11); put(10, 12); put(52, 7000); put(56, 7600); put(60, 2900); put(62, 0.92); put(70, 50.02); put(240, 31);
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const server = new ModbusRTU.ServerTCP({ getInputRegister: (a) => input[a] || 0, getHoldingRegister: () => 0 }, { host: '127.0.0.1', port, unitID: 1 });
  await new Promise((res) => server.on('initialized', res));
  const svc = new PqService({ instruments: [{ id: 'PQ-MAIN', no: 2, name: 'MAIN', driver: 'modbus', profile: 'eastron-sdm630', host: '127.0.0.1', port, unitId: 1, pollMs: 200 }] }, { log: { warn() {}, info() {}, error() {} } });
  await svc.start();
  try {
    let rec = null;
    for (let i = 0; i < 40 && !(rec && rec.P); i++) { await new Promise((x) => setTimeout(x, 100)); rec = svc.summary().instruments[0].data; }
    assert.ok(rec, 'modbus record');
    assert.ok(Math.abs(rec.ph[0].U - 231) < 0.01 && Math.abs(rec.P - 7) < 1e-3 && Math.abs(rec.f - 50.02) < 1e-3);
    assert.ok(Math.abs(rec.ph[0].Ithd - 31) < 1e-3); assert.strictEqual(rec.src.via, 'modbus');
    assert.strictEqual(svc.summary().instruments[0].online, true);
  } finally { svc.stop(); await new Promise((res) => server.close(res)); }

  assert.match(M.gatewayYaml({ meter: 'siemens-pac3200', host: '10.0.0.5' }), /profile: siemens-pac3200[\s\S]*host: 10\.0\.0\.5/);
});
