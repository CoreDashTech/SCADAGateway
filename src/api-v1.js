'use strict';
// REST API v1 (pump station) — every response is JSON
//
//   GET  /api/v1/points                     read:latest   รายการจุดตรวจวัด
//   GET  /api/v1/latest?points=a,b          read:latest   ค่าล่าสุด
//   GET  /api/v1/history?point&start&end&interval&agg     read:history
//   GET  /api/v1/devices/status             read:status   สถานะอุปกรณ์ ปั๊ม การควบคุม
//   GET  /api/v1/alarms?state=active|all    read:alarms
//   GET  /api/v1/meta/last-update           read:latest   เวลาอัปเดตล่าสุด
//   GET  /api/v1/export                     read:latest   ภาพรวมทั้งหมด (ค่า + ค่าตั้ง) เป็นไฟล์ JSON
//   POST /api/v1/control  {command,args}    control       start|stop|reset|alternate|mode|config
//   POST /api/v1/sim/scenario  {scenario}   admin, SIMULATE=1 เท่านั้น — อัปโหลดไฟล์ทดสอบ
//
// ยืนยันตัวตน: X-API-Key: <key>  หรือ  Authorization: Bearer <key หรือโทเคนผู้ใช้>
// เข้ารหัส payload: ส่ง header X-CD-Encrypt: aes-256-gcm (หรือกำหนด encrypt: aes-256-gcm ให้ key ใน config)
// 3DES ปิดไว้ — เปิดได้ด้วย security.allow3des: true เฉพาะกรณีต้องเชื่อมระบบเดิม
const crypto = require('crypto');
const { roleAtLeast } = require('./config');
const secure = require('./secure');
const { validateScenario } = require('./drivers/replay');

const ALL_SCOPES = ['read:latest', 'read:history', 'read:status', 'read:alarms', 'control'];
const SEV = { critical: 'critical', high: 'major', medium: 'warning' };
const INTERVALS = { '1s': 1e3, '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '1d': 86400e3 };
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

function mount(app, gw) {
  const { cfg, store, alarms, historian, commands, audit } = gw;
  const api = cfg.api || { keys: [] };
  const keys = gw.secureKeys || secure.loadKeys(cfg.security);
  const limits = new Map(); // client id -> { windowStart, count }

  // ---------- auth + scopes + rate limit ----------
  function identify(req) {
    const h = req.get('authorization') || '';
    const token = req.get('x-api-key') || (h.startsWith('Bearer ') ? h.slice(7) : '') || '';
    if (!token) return null;
    const eq = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    const k = (api.keys || []).find((x) => !x.disabled && eq(x.key, token));
    if (k) return { id: k.id, name: k.name, role: k.role || 'viewer', scopes: k.scopes || [], encrypt: k.encrypt, rate: k.rateLimitPerMin, kind: 'api-key' };
    const u = cfg.users.find((x) => eq(x.token, token));
    if (u) return { id: u.id, name: u.name, role: u.role, scopes: u.role === 'viewer' ? ALL_SCOPES.filter((s) => s !== 'control') : ALL_SCOPES, kind: 'user' };
    return null;
  }
  const err = (res, status, code, message) => res.status(status).json({ error: { status, code, message } });

  function guard(scope) {
    return (req, res, next) => {
      const c = identify(req);
      if (!c) return err(res, 401, req.get('x-api-key') || req.get('authorization') ? 'INVALID_API_KEY' : 'UNAUTHORIZED', 'ส่ง X-API-Key หรือ Authorization: Bearer ที่ถูกต้อง');
      if (scope && !c.scopes.includes(scope)) return err(res, 403, 'FORBIDDEN', `ไม่มีสิทธิ์ ${scope}`);
      const per = c.rate || api.rateLimitPerMin || 120, now = Date.now();
      let l = limits.get(c.id);
      if (!l || now - l.windowStart >= 60e3) { l = { windowStart: now, count: 0 }; limits.set(c.id, l); }
      l.count++;
      const reset = Math.ceil((l.windowStart + 60e3) / 1000);
      res.set({ 'X-RateLimit-Limit': String(per), 'X-RateLimit-Remaining': String(Math.max(0, per - l.count)), 'X-RateLimit-Reset': String(reset) });
      if (l.count > per) { res.set('Retry-After', String(reset - Math.floor(now / 1000))); return err(res, 429, 'RATE_LIMITED', `เกิน ${per} ครั้งต่อนาที`); }
      req.client = c;
      next();
    };
  }

  // ---------- JSON out (plain or encrypted envelope) ----------
  function send(req, res, body, status = 200) {
    const want = secure.normalizeAlg(req.client && req.client.encrypt) || secure.normalizeAlg(req.get('x-cd-encrypt') || req.query.enc);
    if (!want) return res.status(status).json(body);
    if (want !== 'aes-256-gcm' && !(cfg.security && cfg.security.allow3des)) return err(res, 400, 'ENCRYPTION_NOT_ALLOWED', 'ระบบนี้ใช้ AES-256-GCM — ส่ง X-CD-Encrypt: aes-256-gcm');
    try { res.set('X-CD-Encrypted', want); return res.status(status).json(secure.encrypt(body, want, keys)); }
    catch (e) { return err(res, 501, e.code || 'ENCRYPTION_ERROR', e.message); }
  }
  const meta = () => ({ site: cfg.site.id, generated_at: new Date().toISOString() });
  const latestOf = (id) => {
    const tv = store.get(id), def = store.def(id);
    return { point: id, value: tv.value, unit: def.unit || '', quality: tv.quality === 'good' ? 'good' : tv.quality === 'init' ? 'uncertain' : 'bad_comm', ts: iso(tv.ts) };
  };
  const readable = () => cfg.tags.filter((t) => !t.id.startsWith('CMD.'));
  const name = (t) => (t.name && (t.name.th || t.name.en)) || t.id;

  // ---------- endpoints ----------
  app.get('/api/v1/points', guard('read:latest'), (req, res) => {
    const data = readable().map((t) => ({ point: t.id, name: name(t), name_en: t.name && t.name.en, unit: t.unit || '', writable: !!t.writable }));
    send(req, res, { data, count: data.length, meta: meta() });
  });

  app.get('/api/v1/latest', guard('read:latest'), (req, res) => {
    const ids = req.query.points ? String(req.query.points).split(',').map((s) => s.trim()).filter(Boolean) : ['system.pressure', 'FT-01.flow', 'PM-01.kw'];
    const missing = ids.filter((id) => !store.def(id));
    // the SCADA screen asks for every point at once: unknown ones are skipped, a single unknown point is a 404
    if (missing.length && missing.length === ids.length) return err(res, 404, 'POINT_NOT_FOUND', 'ไม่พบ ' + missing.join(', '));
    send(req, res, { data: ids.filter((id) => store.def(id)).map(latestOf), missing, meta: meta() });
  });

  app.get('/api/v1/history', guard('read:history'), (req, res) => {
    const id = String(req.query.point || '');
    if (!store.def(id)) return err(res, 404, 'POINT_NOT_FOUND', 'ไม่พบ ' + id);
    const start = Date.parse(req.query.start), end = Date.parse(req.query.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return err(res, 400, 'INVALID_PARAMETER', 'start/end ต้องเป็น ISO 8601 และ end > start');
    const interval = String(req.query.interval || '5m'), agg = String(req.query.agg || 'avg');
    if (!INTERVALS[interval]) return err(res, 400, 'INVALID_PARAMETER', 'interval: ' + Object.keys(INTERVALS).join(' | '));
    if (!['avg', 'min', 'max'].includes(agg)) return err(res, 400, 'INVALID_PARAMETER', 'agg: avg | min | max');
    const step = INTERVALS[interval], buckets = Math.ceil((end - start) / step), max = api.maxHistoryPoints || 10000;
    if (buckets > max) return err(res, 400, 'RANGE_TOO_LARGE', `ได้สูงสุด ${max} จุดต่อคำขอ ลองใช้ interval ที่ยาวขึ้น`);
    const raw = historian.query(id, start, end, Number.MAX_SAFE_INTEGER), bins = new Map();
    for (const [t, v] of raw) { const b = start + Math.floor((t - start) / step) * step; if (!bins.has(b)) bins.set(b, []); bins.get(b).push(v); }
    const f = { avg: (a) => a.reduce((s, x) => s + x, 0) / a.length, min: (a) => Math.min(...a), max: (a) => Math.max(...a) }[agg];
    const data = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([t, a]) => ({ ts: iso(t), value: Math.round(f(a) * 1000) / 1000 }));
    send(req, res, { point: id, unit: store.def(id).unit || '', start: iso(start), end: iso(end), interval, agg, count: data.length, truncated: false, data, meta: meta() });
  });

  app.get('/api/v1/devices/status', guard('read:status'), (req, res) => {
    const v = (id) => store.value(id), lead = v('CTRL.lead') || 1;
    const pumps = [1, 2].map((i) => {
      const P = `P-0${i}.`, fault = v(P + 'fault');
      return { id: `P-0${i}`, status: fault ? 'FAULT' : v(P + 'run') ? 'RUN' : 'STOP', ready: !!v(P + 'ready'), role: lead === i ? 'LEAD' : 'LAG', frequency_hz: v(P + 'freq'), current_a: v(P + 'current'), power_kw: v(P + 'power'), active_fault: fault ? String(fault) : null };
    });
    const remain = v('CTRL.alt_remain_min');
    send(req, res, {
      devices: gw.devices().map((d) => ({ id: d.id, name: d.name && (d.name.th || d.name.en), address: d.address, protocol: d.driver, online: d.status === 'online', status: d.status, latency_ms: d.latencyMs, last_update: iso(d.lastSeen) })),
      pumps,
      control: { mode: v('CTRL.mode') ? 'MANUAL' : 'AUTO', setpoint_bar: v('CTRL.sp'), alternation_hours: v('CTRL.alt_hours'), next_alternation: remain == null ? null : iso(Date.now() + remain * 60e3) },
      meta: meta()
    });
  });

  app.get('/api/v1/alarms', guard('read:alarms'), (req, res) => {
    const state = req.query.state === 'all' ? 'all' : 'active';
    let list = state === 'all' ? alarms.history : alarms.active().filter((a) => a.state === 'active' || !a.acked);
    const from = Date.parse(req.query.from), to = Date.parse(req.query.to);
    if (Number.isFinite(from)) list = list.filter((a) => a.raisedAt >= from);
    if (Number.isFinite(to)) list = list.filter((a) => a.raisedAt <= to);
    const data = list.map((a) => ({ id: a.id, code: a.rule, severity: SEV[a.severity] || a.severity, tag: a.tag, message: (a.text && (a.text.th || a.text.en)) || a.rule, value: a.value, limit: a.limit, raised_at: iso(a.raisedAt), cleared_at: iso(a.clearedAt), ack_by: a.ackedBy, ack_at: iso(a.ackedAt) }));
    send(req, res, { state, count: data.length, data, meta: meta() });
  });

  app.get('/api/v1/meta/last-update', guard('read:latest'), (req, res) => {
    const ts = Math.max(0, ...store.all().map((t) => t.ts || 0));
    send(req, res, { last_update: iso(ts), age_seconds: ts ? Math.round((Date.now() - ts) / 1000) : null, source: cfg.simulate ? 'SIMULATOR' : 'PLC FX5U (Modbus TCP)', meta: meta() });
  });

  app.get('/api/v1/export', guard('read:latest'), (req, res) => {
    const values = {}, settings = {};
    for (const t of readable()) { const v = store.value(t.id); (t.id.startsWith('CTRL.') && t.writable ? settings : values)[t.id] = v; }
    res.set('Content-Disposition', `attachment; filename="station-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json"`);
    send(req, res, { format: 'coredash.snapshot/v1', site: cfg.site.id, generated_at: new Date().toISOString(), values, settings, alarms_active: alarms.active().map((a) => a.rule) });
  });

  // ---------- control ----------
  const CONFIG_KEYS = { sp: 'CTRL.sp', kp: 'CTRL.kp', ti: 'CTRL.ti', deadband: 'CTRL.deadband', intervalStart: 'CTRL.int_start', intervalStop: 'CTRL.int_stop', altHours: 'CTRL.alt_hours', lowAlarm: 'CTRL.low_alarm', highAlarm: 'CTRL.high_alarm' };
  app.post('/api/v1/control', guard('control'), async (req, res) => {
    const c = req.client, user = { id: (c.kind === 'api-key' ? 'api:' : '') + c.id, role: c.role };
    if (!roleAtLeast(user.role, 'operator')) return err(res, 403, 'FORBIDDEN', 'ต้องเป็นผู้ปฏิบัติงานขึ้นไป');
    const { command, args = {} } = req.body || {};
    const writes = [];
    if (['start', 'stop', 'reset'].includes(command)) {
      const n = Number(args.pump);
      if (![1, 2].includes(n)) return err(res, 400, 'INVALID_PARAMETER', 'args.pump ต้องเป็น 1 หรือ 2');
      writes.push([`CMD.P-0${n}.${command}`, 1]);
    } else if (command === 'alternate') writes.push(['CMD.alternate', 1]);
    else if (command === 'mode') {
      const m = String(args.mode || '').toUpperCase();
      if (!['AUTO', 'MANUAL'].includes(m)) return err(res, 400, 'INVALID_PARAMETER', 'args.mode ต้องเป็น AUTO หรือ MANUAL');
      writes.push(['CMD.mode', m === 'MANUAL' ? 1 : 0]);
    } else if (command === 'config') {
      for (const [k, v] of Object.entries(args)) {
        if (!CONFIG_KEYS[k]) return err(res, 400, 'INVALID_PARAMETER', `ไม่รู้จัก ${k} (ใช้ได้: ${Object.keys(CONFIG_KEYS).join(', ')})`);
        writes.push([CONFIG_KEYS[k], Number(v)]);
      }
      if (!writes.length) return err(res, 400, 'INVALID_PARAMETER', 'ต้องมีอย่างน้อย 1 ค่าใน args');
    } else return err(res, 400, 'INVALID_PARAMETER', 'command: start | stop | reset | alternate | mode | config');
    try {
      for (const [tag] of writes) commands.validate(user, tag, writes.find((w) => w[0] === tag)[1]); // all-or-nothing check first
      const results = [];
      for (const [tag, v] of writes) results.push(await commands.execute(user, tag, v, 'api'));
      send(req, res, { accepted: true, command, writes: writes.map(([tag, value]) => ({ point: tag, value })), audit: results.map((r) => r.hash || r.seq || null), meta: meta() }, 202);
    } catch (e) {
      const map = { FORBIDDEN: 403, INTERLOCK: 409, OUT_OF_RANGE: 400, BAD_VALUE: 400, WRITE_FAILED: 502 };
      res.status(map[e.code] || 400).json({ error: { status: map[e.code] || 400, code: e.code === 'WRITE_FAILED' ? 'DEVICE_OFFLINE' : e.code, message: e.message, details: e.details } });
    }
  });

  // ---------- upload a JSON test file (simulator only) ----------
  app.post('/api/v1/sim/scenario', guard('control'), (req, res) => {
    if (!cfg.simulate || !gw.simSwitch) return err(res, 409, 'NOT_SIMULATING', 'ใช้ได้เฉพาะเมื่อรัน SIMULATE=1');
    if (!roleAtLeast(req.client.role, 'engineer')) return err(res, 403, 'FORBIDDEN', 'ต้องเป็นวิศวกรหรือผู้ดูแลระบบ');
    const sc = req.body && (req.body.scenario || req.body);
    if (sc && sc.reset) { gw.simSwitch.useModel(); audit.append({ action: 'sim-model', user: req.client.id }); return send(req, res, { ok: true, mode: 'model' }); }
    const errors = validateScenario(sc);
    if (errors.length) return err(res, 400, 'INVALID_PARAMETER', errors.join('; '));
    gw.simSwitch.useScenario(sc);
    audit.append({ action: 'sim-scenario', user: req.client.id, frames: sc.frames.length, description: sc.description || '' });
    send(req, res, { ok: true, mode: 'scenario', frames: sc.frames.length, duration_s: sc.frames[sc.frames.length - 1].t });
  });
}

module.exports = { mount, ALL_SCOPES };
