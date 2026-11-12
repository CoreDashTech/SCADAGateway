'use strict';
const path = require('path');
// REST + WebSocket API used by the CoreDash Nexus web SCADA and mobile app.
//
// REST (Authorization: Bearer <token>)
//   GET  /api/health                      no auth
//   GET  /api/me
//   GET  /api/tags                        all current values
//   GET  /api/history?tag=ID&from=ms&to=ms
//   GET  /api/alarms                      active + recent
//   POST /api/alarms/:id/ack              operator+
//   POST /api/commands                    { tag, value }   -> prepared command (step 1)
//   POST /api/commands/:id/confirm        execute (step 2, same user, within TTL)
//   DELETE /api/commands/:id              cancel
//   GET  /api/devices                     communication health
//   GET  /api/interlocks
//   GET  /api/audit?limit=100             engineer+
//   GET  /api/audit/verify                admin
//   PATCH /api/schedules/:id              { enabled } engineer+
//
// WebSocket ws://host:port/ws?token=<token>
//   server -> client: snapshot | tags | alarm | devices | audit | command.prepared | command.result | error
//   client -> server: command.prepare {tag,value,reqId} | command.confirm {id,reqId} | command.cancel {id} | alarm.ack {id,reqId}
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { roleAtLeast } = require('./config');
const { AuditLog } = require('./engine/audit');
const { CommandError } = require('./engine/commands');

function createServer(gw) {
  const { cfg, store, alarms, commands, historian, audit, interlocks, scheduler } = gw;
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', cfg.server.cors);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const userByToken = (token) => (token ? cfg.users.find((u) => u.token && u.token === token) : null);
  const auth = (minRole = 'viewer') => (req, res, next) => {
    const h = req.get('authorization') || '';
    const user = userByToken(h.startsWith('Bearer ') ? h.slice(7) : null);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(user.role, minRole)) return res.status(403).json({ error: 'FORBIDDEN', need: minRole });
    req.user = user;
    next();
  };
  const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role });
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req, res)); }
    catch (err) {
      if (err instanceof CommandError || err.code) return res.status(err.status || 400).json({ error: err.code, message: err.message, details: err.details });
      gw.log.error(err);
      res.status(500).json({ error: 'INTERNAL', message: err.message });
    }
  };

  app.get('/api/health', (req, res) => res.json({ ok: true, product: 'CoreDash Nexus', developer: 'CoreDash Technology', site: cfg.site.id, simulate: cfg.simulate, uptimeSec: Math.round(process.uptime()) }));
  app.get('/api/me', auth(), (req, res) => res.json(publicUser(req.user)));
  app.get('/api/tags', auth(), (req, res) => res.json(store.all()));
  app.get('/api/history', auth(), (req, res) => {
    const from = Number(req.query.from) || Date.now() - 3600_000;
    const to = Number(req.query.to) || Date.now();
    if (!store.def(req.query.tag)) return res.status(404).json({ error: 'UNKNOWN_TAG' });
    res.json({ tag: req.query.tag, points: historian.query(req.query.tag, from, to, Number(req.query.max) || 1000) });
  });
  app.get('/api/alarms', auth(), (req, res) => res.json({ active: alarms.active(), recent: alarms.history.slice(0, 100) }));
  app.post('/api/alarms/:id/ack', auth('operator'), (req, res) => {
    const a = alarms.ack(req.params.id, req.user);
    if (!a) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(a);
  });
  app.post('/api/commands', auth('operator'), wrap((req) => commands.prepare(req.user, req.body.tag, req.body.value)));
  app.post('/api/commands/:id/confirm', auth('operator'), wrap((req) => commands.confirm(req.user, req.params.id)));
  app.delete('/api/commands/:id', auth('operator'), (req, res) => res.json({ cancelled: commands.cancel(req.user, req.params.id) }));
  app.get('/api/devices', auth(), (req, res) => res.json(gw.devices()));
  app.get('/api/interlocks', auth(), (req, res) => res.json(interlocks.status()));
  app.post('/api/interlocks/:id/bypass', auth('engineer'), wrap((req) => interlocks.bypass(req.params.id, req.user, req.body.minutes, req.body.reason)));
  app.delete('/api/interlocks/:id/bypass', auth('engineer'), (req, res) => res.json({ restored: interlocks.clearBypass(req.params.id, req.user) }));
  app.get('/api/audit', auth('engineer'), (req, res) => res.json(audit.list(Math.min(500, Number(req.query.limit) || 100))));
  app.get('/api/audit/verify', auth('admin'), (req, res) => res.json(AuditLog.verify(cfg.audit.file)));
  app.patch('/api/schedules/:id', auth('engineer'), (req, res) => {
    const s = scheduler.setEnabled(req.params.id, Boolean(req.body.enabled));
    if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
    audit.append({ action: 'schedule', user: req.user.id, schedule: s.id, enabled: s.enabled });
    res.json(s);
  });

  // ---- Power quality (Hioki PW3198 over LAN: live via communication commands, files via FTP) ----
  app.get('/api/pq', auth(), (req, res) => res.json(gw.pq.summary()));
  app.get('/api/pq/history', auth(), (req, res) => res.json(gw.pq.history(Math.min(72, Number(req.query.hours) || 24))));
  app.post('/api/pq/apf', auth('engineer'), wrap((req) => { const r = gw.pq.setApf(req.body.on, req.body.reactive); audit.append({ action: 'pq-apf', user: req.user.id, on: r.on }); return r; }));
  app.get('/api/pq/:id/files', auth(), wrap((req) => gw.pq.files(req.params.id, String(req.query.dir || '/'))));
  app.get('/api/pq/:id/file', auth(), async (req, res) => {
    try {
      const p = String(req.query.path || '');
      if (!p || p.includes('..')) return res.status(400).json({ error: 'BAD_PATH' });
      const buf = await gw.pq.file(req.params.id, p);
      res.set('Content-Disposition', `attachment; filename="${path.basename(p).replace(/"/g, '')}"`);
      res.type(p.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/octet-stream').send(buf);
    } catch (e) { res.status(e.status || 502).json({ error: e.code || 'FTP_ERROR', message: e.message }); }
  });

  // ---- Installable mobile web app (PWA) ---------------------------------------
  const appDir = path.join(__dirname, '..', 'app');
  app.get('/', (req, res) => res.redirect('/app/'));
  app.get('/app/sw.js', (req, res) => { res.set('Service-Worker-Allowed', '/app/'); res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(appDir, 'sw.js')); });
  app.use('/app', express.static(appDir, { index: 'index.html', setHeaders: (res, p) => { if (p.endsWith('.webmanifest')) res.type('application/manifest+json'); if (p.endsWith('.mjs')) res.type('text/javascript'); if (p.endsWith('index.html')) res.set('Cache-Control', 'no-cache'); } }));

  const server = http.createServer(app);

  // ---- WebSocket ------------------------------------------------------------
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();
  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg) => { for (const c of clients) send(c.ws, msg); };

  wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    const user = userByToken(token);
    if (!user) { ws.close(4401, 'unauthorized'); return; }
    const client = { ws, user };
    clients.add(client);
    send(ws, { type: 'snapshot', user: publicUser(user), site: cfg.site, tags: store.all(), alarms: alarms.active(), devices: gw.devices(), interlocks: interlocks.status() });
    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch (_) { return send(ws, { type: 'error', error: 'BAD_JSON' }); }
      const reply = (type, body) => send(ws, { type, reqId: msg.reqId, ...body });
      try {
        if (msg.type === 'command.prepare') {
          if (!roleAtLeast(user.role, 'operator')) throw new CommandError('FORBIDDEN', 'Viewer cannot command', 403);
          reply('command.prepared', { command: commands.prepare(user, msg.tag, msg.value) });
        } else if (msg.type === 'command.confirm') {
          reply('command.result', { ok: true, entry: await commands.confirm(user, msg.id) });
        } else if (msg.type === 'command.cancel') {
          reply('command.cancelled', { cancelled: commands.cancel(user, msg.id) });
        } else if (msg.type === 'interlock.bypass') {
          reply('interlock.bypassed', { bypass: interlocks.bypass(msg.id, user, msg.minutes, msg.reason) });
        } else if (msg.type === 'interlock.restore') {
          if (!roleAtLeast(user.role, 'engineer')) throw new CommandError('FORBIDDEN', 'Only an engineer or admin can restore', 403);
          reply('interlock.restored', { restored: interlocks.clearBypass(msg.id, user) });
        } else if (msg.type === 'alarm.ack') {
          if (!roleAtLeast(user.role, 'operator')) throw new CommandError('FORBIDDEN', 'Viewer cannot acknowledge', 403);
          reply('alarm.acked', { alarm: alarms.ack(msg.id, user) });
        } else {
          reply('error', { error: 'UNKNOWN_TYPE' });
        }
      } catch (err) {
        reply('error', { error: err.code || 'ERROR', message: err.message, details: err.details });
      }
    });
    ws.on('close', () => clients.delete(client));
  });

  // Batch tag changes every 250 ms to keep the screens smooth and the network light.
  let changed = new Map();
  store.on('change', (tv) => changed.set(tv.id, tv));
  const flushTimer = setInterval(() => {
    if (!changed.size) return;
    const tags = Array.from(changed.values());
    changed = new Map();
    broadcast({ type: 'tags', tags });
  }, 250);
  const devTimer = setInterval(() => broadcast({ type: 'devices', devices: gw.devices() }), 5000);
  for (const ev of ['raise', 'clear', 'ack', 'escalate']) alarms.on(ev, (a) => broadcast({ type: 'alarm', event: ev, alarm: a }));
  commands.on('executed', (entry) => broadcast({ type: 'audit', entry }));
  interlocks.on('change', () => broadcast({ type: 'interlocks', interlocks: interlocks.status() }));

  return {
    app, server, wss,
    listen: (port) => new Promise((resolve) => server.listen(port, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => {
      clearInterval(flushTimer); clearInterval(devTimer);
      for (const c of clients) c.ws.terminate();
      wss.close();
      server.close(() => resolve());
    }),
    address: () => server.address()
  };
}

module.exports = { createServer };
