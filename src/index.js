#!/usr/bin/env node
'use strict';
// Entry point:  node src/index.js config/plant-a.yaml
//   SIMULATE=1      run the built-in plant simulator instead of real devices
//   DEMO_TOKENS=1   add demo users: demo-admin / demo-engineer / demo-operator / demo-viewer
const path = require('path');
const { loadConfig } = require('./config');
const { createGateway } = require('./gateway');

async function main() {
  const file = process.argv[2] || path.join(__dirname, '..', 'config', 'plant-a.yaml');
  const cfg = loadConfig(file);
  const gw = createGateway(cfg);
  await gw.start();
  const port = gw.server.address().port;
  console.log(`CoreDash Nexus Gateway · ${cfg.site.name.en}`);
  console.log(`  mode      : ${cfg.simulate ? 'SIMULATOR' : 'LIVE devices'} (${cfg.devices.length} devices, ${cfg.tags.length} tags)`);
  console.log(`  REST      : http://localhost:${port}/api/health`);
  console.log(`  WebSocket : ws://localhost:${port}/ws?token=<token>`);
  if (cfg.users.some((u) => u.id.startsWith('demo-'))) console.log('  demo tokens: demo-admin, demo-engineer, demo-operator, demo-viewer');
  if (!cfg.users.some((u) => u.token)) console.warn('  WARNING: no user tokens set — define TOKEN_* env vars or use DEMO_TOKENS=1');
  const shutdown = async () => { console.log('Stopping…'); await gw.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
