'use strict';
// Wires everything together. createGateway(config) is used by src/index.js and by the tests.
const { TagStore } = require('./tagStore');
const { createModbusDriver } = require('./drivers/modbus');
const { createMqttDriver } = require('./drivers/mqtt');
const { SimDriver } = require('./drivers/sim');
const { AlarmEngine } = require('./engine/alarms');
const { AuditLog } = require('./engine/audit');
const { CommandService } = require('./engine/commands');
const { InterlockEngine } = require('./engine/interlocks');
const { Historian } = require('./engine/historian');
const { Scheduler } = require('./engine/scheduler');
const { Notifier } = require('./notify');
const { createServer } = require('./api');
const { PqService } = require('./pq/service');

function createGateway(cfg, { log = console, fetchImpl, simTickMs } = {}) {
  const store = new TagStore(cfg.tags);
  const drivers = new Map();      // tagId -> driver
  const deviceDrivers = [];       // { device, driver }
  let sim = null;

  if (cfg.simulate) {
    sim = new SimDriver(cfg.devices, cfg.tags, store, { tickMs: simTickMs || 1000 });
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
  const gw = { cfg, pq, store, drivers, sim, audit, commands, interlocks, alarms, historian, scheduler, notifier, devices, log };
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
    pq.stop(); alarms.stop(); historian.stop(); scheduler.stop(); interlocks.stop();
    await gw.server.close();
  };
  return gw;
}

module.exports = { createGateway };
