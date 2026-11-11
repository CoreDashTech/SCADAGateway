'use strict';
// Talks to a real Modbus TCP server and a real MQTT broker started inside the test.
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const ModbusRTU = require('modbus-serial');
const { TagStore } = require('../src/tagStore');
const { createModbusDriver } = require('../src/drivers/modbus');
const { createMqttDriver } = require('../src/drivers/mqtt');
const { encode } = require('../src/drivers/codec');

const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('Modbus TCP: polls coils/holding/input registers and writes back', async () => {
  const port = await freePort();
  const holding = new Array(100).fill(0);
  const input = new Array(400).fill(0);
  const coils = new Array(16).fill(false);
  holding[10] = 60;                                   // V-101.POS
  input[20] = 625;                                    // T-1.LEVEL raw (x0.1)
  [input[52], input[53]] = encode(301.5, { dataType: 'float32' }); // kW
  coils[0] = true;
  const server = new ModbusRTU.ServerTCP({
    getHoldingRegister: (a) => holding[a], getInputRegister: (a) => input[a], getCoil: (a) => coils[a], getDiscreteInput: () => false,
    setRegister: (a, v) => { holding[a] = v; }, setCoil: (a, v) => { coils[a] = v; }
  }, { host: '127.0.0.1', port, unitID: 1 });
  await new Promise((r) => server.on('initialized', r));

  const tags = [
    { id: 'P-01.RUN', device: 'PLC', type: 'coil', address: 0, dataType: 'bool', writable: true },
    { id: 'V-101.POS', device: 'PLC', type: 'holding', address: 10, dataType: 'uint16', writable: true },
    { id: 'T-1.LEVEL', device: 'PLC', type: 'input', address: 20, dataType: 'uint16', scale: 0.1 },
    { id: 'MDB.KW', device: 'PLC', type: 'input', address: 52, dataType: 'float32' }
  ];
  const store = new TagStore(tags);
  const drv = createModbusDriver({ id: 'PLC', driver: 'modbus-tcp', host: '127.0.0.1', port, unitId: 1, pollMs: 200 }, tags, store, { warn() {}, error() {} });
  drv.start();
  try {
    assert.ok(await until(() => store.value('MDB.KW') !== null));
    assert.strictEqual(store.value('P-01.RUN'), true);
    assert.strictEqual(store.value('V-101.POS'), 60);
    assert.strictEqual(store.value('T-1.LEVEL'), 62.5);
    assert.ok(Math.abs(store.value('MDB.KW') - 301.5) < 1e-3);
    assert.strictEqual(drv.health.status, 'online');

    await drv.write(tags[1], 0);
    await drv.write(tags[0], false);
    assert.strictEqual(holding[10], 0);
    assert.strictEqual(coils[0], false);
    assert.ok(await until(() => store.value('V-101.POS') === 0 && store.value('P-01.RUN') === false));
  } finally {
    drv.stop();
    await new Promise((r) => server.close(r));
  }
});

test('Modbus TCP: device offline marks tags bad and health offline', async () => {
  const port = await freePort(); // nothing listening
  const tags = [{ id: 'X', device: 'D', type: 'holding', address: 0, dataType: 'uint16' }];
  const store = new TagStore(tags);
  const drv = createModbusDriver({ id: 'D', driver: 'modbus-tcp', host: '127.0.0.1', port, pollMs: 100, timeoutMs: 300 }, tags, store, { warn() {}, error() {} });
  for (let i = 0; i < 3; i++) await drv.pollOnce();
  assert.strictEqual(drv.health.status, 'offline');
  assert.notStrictEqual(store.get('X').quality, 'good');
  drv.stop();
});

test('MQTT: JSON state topic -> tags, command -> publish', async () => {
  const { Aedes } = await import('aedes').catch(() => ({}));
  const aedes = Aedes ? await Aedes.createBroker() : require('aedes')();
  const port = await freePort();
  const broker = net.createServer(aedes.handle);
  await new Promise((r) => broker.listen(port, r));
  const published = [];
  aedes.on('publish', (p) => { if (p.topic.endsWith('/set')) published.push([p.topic, p.payload.toString()]); });

  const tags = [
    { id: 'L-A.ON', device: 'LGT', topic: 'plant/zone-a/state', jsonPath: 'on', commandTopic: 'plant/zone-a/set', commandKey: 'on', dataType: 'bool', writable: true },
    { id: 'L-A.LEVEL', device: 'LGT', topic: 'plant/zone-a/state', jsonPath: 'level', commandTopic: 'plant/zone-a/set', commandKey: 'level', dataType: 'uint16', writable: true }
  ];
  const store = new TagStore(tags);
  const drv = createMqttDriver({ id: 'LGT', driver: 'mqtt', url: `mqtt://127.0.0.1:${port}` }, tags, store, { warn() {}, error() {} });
  drv.start();
  try {
    assert.ok(await until(() => drv.health.status === 'online'));
    await new Promise((r) => setTimeout(r, 200)); // subscription settles
    aedes.publish({ topic: 'plant/zone-a/state', payload: Buffer.from(JSON.stringify({ on: true, level: 80 })), qos: 0, retain: false }, () => {});
    assert.ok(await until(() => store.value('L-A.LEVEL') === 80));
    assert.strictEqual(store.value('L-A.ON'), true);
    await drv.write(tags[1], 30);
    assert.ok(await until(() => published.length > 0));
    assert.deepStrictEqual(published[0], ['plant/zone-a/set', '{"level":30}']);
  } finally {
    drv.stop();
    await new Promise((r) => aedes.close(r));
    await new Promise((r) => broker.close(r));
  }
});
