'use strict';
// Loads the site YAML, resolves secrets from the environment and indexes tags by device.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ROLES = ['viewer', 'operator', 'engineer', 'admin'];

function loadConfig(file, env = process.env) {
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  const baseDir = path.dirname(path.resolve(file));
  return normalizeConfig(raw, { env, baseDir });
}

function normalizeConfig(raw, { env = process.env, baseDir = process.cwd() } = {}) {
  const cfg = JSON.parse(JSON.stringify(raw));
  cfg.site = cfg.site || { id: 'site', name: { th: 'ไซต์', en: 'Site' }, timezone: 'Asia/Bangkok' };
  cfg.server = { port: 8080, cors: '*', commandTtlSec: 30, ...(cfg.server || {}) };
  cfg.historian = { dir: './data/history', sampleSec: 5, memoryPoints: 720, ...(cfg.historian || {}) };
  cfg.audit = { file: './data/audit.jsonl', ...(cfg.audit || {}) };
  const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(baseDir, '..', p));
  cfg.historian.dir = abs(cfg.historian.dir);
  cfg.audit.file = abs(cfg.audit.file);
  if (env.CD_DATA_DIR) {
    cfg.historian.dir = path.join(env.CD_DATA_DIR, 'history');
    cfg.audit.file = path.join(env.CD_DATA_DIR, 'audit.jsonl');
  }
  if (env.PORT) cfg.server.port = Number(env.PORT);

  cfg.devices = cfg.devices || [];
  cfg.tags = (cfg.tags || []).map((t) => ({ scale: 1, offset: 0, writable: false, ...t }));
  cfg.alarms = cfg.alarms || [];
  cfg.interlocks = cfg.interlocks || [];
  cfg.schedules = cfg.schedules || [];
  cfg.notify = cfg.notify || {};

  const ids = new Set();
  for (const t of cfg.tags) {
    if (!t.id) throw new Error('Tag without id');
    if (ids.has(t.id)) throw new Error('Duplicate tag id ' + t.id);
    ids.add(t.id);
    if (!cfg.devices.find((d) => d.id === t.device)) throw new Error(`Tag ${t.id}: unknown device ${t.device}`);
  }
  for (const a of cfg.alarms) if (!ids.has(a.tag)) throw new Error(`Alarm ${a.id}: unknown tag ${a.tag}`);
  for (const i of cfg.interlocks) {
    if (!ids.has(i.when.tag) || !ids.has(i.force.tag)) throw new Error(`Interlock ${i.id}: unknown tag`);
  }

  // Users: token from env var (tokenEnv) or literal token (only for tests/demo).
  cfg.users = (cfg.users || []).map((u) => {
    if (!ROLES.includes(u.role)) throw new Error(`User ${u.id}: bad role ${u.role}`);
    return { ...u, token: u.token || (u.tokenEnv ? env[u.tokenEnv] : undefined) };
  });
  if (env.DEMO_TOKENS === '1') {
    cfg.users.push(
      { id: 'demo-admin', name: 'Demo Admin', role: 'admin', token: 'demo-admin' },
      { id: 'demo-engineer', name: 'Demo Engineer', role: 'engineer', token: 'demo-engineer' },
      { id: 'demo-operator', name: 'Demo Operator', role: 'operator', token: 'demo-operator' },
      { id: 'demo-viewer', name: 'Demo Viewer', role: 'viewer', token: 'demo-viewer' }
    );
  }

  // Notification secrets
  for (const [id, ch] of Object.entries(cfg.notify)) {
    if (ch.tokenEnv) ch.token = env[ch.tokenEnv];
    ch.id = id;
  }
  for (const d of cfg.devices) if (d.passwordEnv) d.password = env[d.passwordEnv];

  // SIMULATE=1: every device is served by the built-in plant simulator.
  cfg.simulate = env.SIMULATE === '1' || cfg.simulate === true;
  return cfg;
}

function roleAtLeast(role, min) {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

module.exports = { loadConfig, normalizeConfig, roleAtLeast, ROLES };
