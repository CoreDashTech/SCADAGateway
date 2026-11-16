'use strict';
// Wires everything together. createGateway(config) is used by src/index.js and by the tests.
const { TagStore } = require('./tagStore');
const { createModbusDriver } = require('./drivers/modbus');
const { createMqttDriver } = require('./drivers/mqtt');
const { SimDriver } = require('./drivers/sim');
const { SimPump } = require('./drivers/sim-pump');
const { ReplayDriver } = require('./drivers/replay');
const secure = require('./secure');
const { AlarmEngine } = require('./engine/alarms');
const { AuditLog } = require('./engine/audit');
const { CommandService } = require('./engine/commands');
const { InterlockEngine } = require('./engine/interlocks');
const { Historian } = require('./engine/historian');
const { Scheduler } = require('./engine/scheduler');
const { Notifier } = require('./notify');
const { createServer } = require('./api');
const { PqService } = require('./pq/service');
const { CamService } = require('./cams/service');

function createGateway(cfg, { log = console, fetchImpl, simTickMs } = {}) {
  const store = new TagStore(cfg.tags);
  const drivers = new Map();      // tagId -> driver
  const deviceDrivers = [];       // { device, driver }
  let sim = null;

  let simSwitch = null;
  if (cfg.simulate) {
    // SIMULATE=1: plant model (simulator: pump-station → pump-station model) or a JSON test file (SIM_FILE=… / upload via API)
    const tickMs = simTickMs || 1000;
    const makeModel = () => (cfg.simulator === 'pump-station' ? new SimPump(cfg.devices, cfg.tags, store, { tickMs }) : new SimDriver(cfg.devices, cfg.tags, store, { tickMs }));
    const first = cfg.simFile ? new ReplayDriver(cfg.devices, cfg.tags, store, { file: cfg.simFile, tickMs, log }) : makeModel();
    simSwitch = {
      cur: first, running: false, mode: cfg.simFile ? 'scenario' : 'model',
      start() { this.running = true; this.cur.start(); },
      stop() { this.running = false; this.cur.stop(); },
      write(tag, v) { return this.cur.write(tag, v); },
      healthOf(id) { return this.cur.healthOf(id); },
      force(id, v) { if (this.cur.force) this.cur.force(id, v); },   // test hook
      get health() { return this.cur.health; },
      swap(next, mode) { if (this.running) this.cur.stop(); this.cur = next; this.mode = mode; if (this.running) next.start(); },
      useScenario(sc) { this.swap(new ReplayDriver(cfg.devices, cfg.tags, store, { scenario: sc, tickMs, log }), 'scenario'); },
      useModel() { this.swap(makeModel(), 'model'); }
    };
    sim = simSwitch;
    for (const t of cfg.tags) drivers.set(t.id, sim);
    for (const d of cfg.devices) deviceDrivers.push({ device: d, driver: sim, health: () => sim.healthOf(d.id) });
  } else {
    for (const d of cfg.devices) {
      const tags = cfg.tags.filter((t) => t.device === d.id);
      let drv;
      if (d.driver === 'modbus-tcp' || d.driver === 'modbus-rtu') drv = createModbusDriver(d, tags, store, log);
      else if (d.driver === 'mqtt') drv = createMqttDriver(d, tags, store, log);
      else throw new Error(`Device ${d.id}: unknown driver ${d.driver}`);
      for (const t of tags) drivers.set(t.id, drv);
      deviceDrivers.push({ device: d, driver: drv, health: () => drv.health });
    }
  }

  const audit = new AuditLog(cfg.audit.file);
  const commands = new CommandService({ store, drivers, interlocks: cfg.interlocks, audit, ttlSec: cfg.server.commandTtlSec });
  const interlocks = new InterlockEngine(cfg.interlocks, store, commands, log, { audit });
  const alarms = new AlarmEngine(cfg.alarms, store);
  const historian = new Historian(store, cfg.historian);
  const scheduler = new Scheduler(cfg.schedules, commands, { timeZone: cfg.site.timezone, log });
  const notifier = new Notifier(cfg.notify, { siteName: cfg.site.name.th, log, fetchImpl });

  alarms.on('raise', (a, rule) => { audit.append({ action: 'alarm', user: 'system', alarm: a.rule, tag: a.tag, value: a.value }); notifier.send(rule.notify, a, 'raise'); });
  alarms.on('escalate', (a, rule) => notifier.send(rule.notify, a, 'escalate'));
  alarms.on('ack', (a) => audit.append({ action: 'ack', user: a.ackedBy, alarm: a.rule }));

  const devices = () => deviceDrivers.map(({ device, health }) => ({
    id: device.id, name: device.name, driver: cfg.simulate ? 'sim' : device.driver,
    address: device.host ? `${device.host}:${device.port || 502}` : device.path || device.url,
    tagCount: cfg.tags.filter((t) => t.device === device.id).length,
    ...(health() ? health().toJSON() : {})
  }));

  const pq = new PqService(cfg.pq || {}, { simulate: cfg.simulate, log });
  // power-quality alarms → phones (pq.notify: [channel ids]; pq.pushWarn: true to include "watch" level)
  const pqPush = {};
  pq.onAlarm = (kind, ev) => {
    const ch = (cfg.pq && cfg.pq.notify) || []; if (!ch.length || !pq.alarmText) return;
    if (kind !== 'clear' && ev.sev !== 'alarm' && !(cfg.pq && cfg.pq.pushWarn)) return;
    const key = ev.dev + '|' + ev.rule, now = Date.now();
    if (kind !== 'clear' && pqPush[key] && now - pqPush[key] < 600e3) return;
    if (kind === 'clear' && !pqPush[key]) return;
    if (kind !== 'clear') pqPush[key] = now;
    notifier.sendText(ch, pq.alarmText(ev, 'th', kind), { priority: kind === 'clear' ? 2 : ev.sev === 'alarm' ? 5 : 3 });
  };
  const cams = new CamService(cfg.cameras || [], { log });
  const secureKeys = secure.loadKeys(cfg.security);
  const gw = { cfg, simSwitch, secureKeys, pq, cams, store, drivers, sim, audit, commands, interlocks, alarms, historian, scheduler, notifier, devices, log };
  gw.server = createServer(gw);

  gw.start = async () => {
    const started = new Set();
    for (const { driver } of deviceDrivers) if (!started.has(driver)) { started.add(driver); driver.start(); }
    alarms.start();
    historian.start();
    await pq.start();
    scheduler.start();
    await gw.server.listen(cfg.server.port);
    return gw;
  };
  gw.stop = async () => {
    const stopped = new Set();
    for (const { driver } of deviceDrivers) if (!stopped.has(driver)) { stopped.add(driver); driver.stop(); }
    cams.stop(); pq.stop(); alarms.stop(); historian.stop(); scheduler.stop(); interlocks.stop();
    await gw.server.close();
  };
  return gw;
}

module.exports = { createGateway };
