'use strict';
// Modbus TCP / RTU driver: block polling, reconnect with backoff, health stats, writes.
// RTU devices that share one serial port (same RS-485 bus) share one connection and one queue.
const ModbusRTU = require('modbus-serial');
const { decode, encode, planBlocks } = require('./codec');
const { DeviceHealth } = require('./health');

const ports = new Map(); // serial path -> { client, queue, refs, connecting }

class ModbusDriver {
  constructor(device, tags, store, log = console) {
    this.device = device;
    this.tags = tags;
    this.store = store;
    this.log = log;
    this.health = new DeviceHealth(device.id);
    this.timer = null;
    this.stopped = false;
    this.backoff = 1000;
    const byType = { coil: [], discrete: [], holding: [], input: [] };
    for (const t of tags) {
      if (!byType[t.type]) throw new Error(`Tag ${t.id}: Modbus type must be coil|discrete|holding|input`);
      byType[t.type].push(t);
    }
    this.blocks = Object.entries(byType).flatMap(([type, list]) => planBlocks(list).map((b) => ({ ...b, type })));
  }

  // ---- connection -------------------------------------------------------
  conn() {
    const d = this.device;
    if (d.driver === 'modbus-rtu') {
      let p = ports.get(d.path);
      if (!p) { p = { client: new ModbusRTU(), queue: Promise.resolve(), refs: 0 }; ports.set(d.path, p); }
      return p;
    }
    if (!this._tcp) this._tcp = { client: new ModbusRTU(), queue: Promise.resolve(), refs: 0 };
    return this._tcp;
  }

  async ensureOpen() {
    const p = this.conn();
    if (p.client.isOpen) return p.client;
    if (!p.connecting) {
      const d = this.device;
      p.connecting = (d.driver === 'modbus-rtu'
        ? p.client.connectRTUBuffered(d.path, { baudRate: d.baudRate || 9600, parity: d.parity || 'none', dataBits: d.dataBits || 8, stopBits: d.stopBits || 1 })
        : p.client.connectTCP(d.host, { port: d.port || 502 })
      ).finally(() => { p.connecting = null; });
    }
    await p.connecting;
    return p.client;
  }

  // Serialise every request on a connection (required for RS-485, safe for TCP).
  exec(fn) {
    const p = this.conn();
    const run = p.queue.then(async () => {
      const client = await this.ensureOpen();
      client.setID(this.device.unitId ?? 1);
      client.setTimeout(this.device.timeoutMs || 1000);
      return fn(client);
    });
    p.queue = run.catch(() => {});
    return run;
  }

  // ---- polling ----------------------------------------------------------
  start() {
    this.stopped = false;
    const loop = async () => {
      if (this.stopped) return;
      const ok = await this.pollOnce();
      const wait = ok ? (this.device.pollMs || 1000) : Math.min(this.backoff, 30000);
      this.backoff = ok ? 1000 : this.backoff * 2;
      this.timer = setTimeout(loop, wait);
    };
    loop();
  }

  async pollOnce() {
    const t0 = Date.now();
    try {
      for (const b of this.blocks) {
        const len = b.end - b.start;
        const res = await this.exec((c) => {
          if (b.type === 'coil') return c.readCoils(b.start, len);
          if (b.type === 'discrete') return c.readDiscreteInputs(b.start, len);
          if (b.type === 'holding') return c.readHoldingRegisters(b.start, len);
          return c.readInputRegisters(b.start, len);
        });
        for (const t of b.tags) {
          const off = t.address - b.start;
          const words = res.data.slice(off, off + 2).map((x) => (typeof x === 'boolean' ? (x ? 1 : 0) : x));
          this.store.update(t.id, decode(words, t), 'good');
        }
      }
      this.health.ok(Date.now() - t0);
      return true;
    } catch (err) {
      this.health.fail(err);
      this.store.markDevice(this.device.id, 'bad');
      const p = this.conn();
      if (p.client.isOpen && /timed out|ECONNRESET|EPIPE|Port Not Open/i.test(String(err.message))) {
        try { p.client.close(() => {}); } catch (_) { /* ignore */ }
      }
      if (this.health.failures === 1 || this.health.failures % 20 === 0) {
        this.log.warn(`[${this.device.id}] poll failed: ${err.message}`);
      }
      return false;
    }
  }

  // ---- writes -----------------------------------------------------------
  async write(tag, value) {
    if (tag.type === 'coil') {
      await this.exec((c) => c.writeCoil(tag.address, Boolean(value)));
    } else if (tag.type === 'holding') {
      const words = encode(value, tag);
      await this.exec((c) => (words.length === 1 ? c.writeRegister(tag.address, words[0]) : c.writeRegisters(tag.address, words)));
    } else {
      throw new Error(`Tag ${tag.id} (${tag.type}) is read-only in Modbus`);
    }
    // Read back immediately so the screens show the confirmed value.
    this.pollOnce().catch(() => {});
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    const p = this.conn();
    if (this.device.driver === 'modbus-rtu') {
      // other devices may share the port; close only when this is the last one
      p.refs = Math.max(0, (p.refs || 1) - 1);
      if (p.refs > 0) return;
      ports.delete(this.device.path);
    }
    try { if (p.client.isOpen) p.client.close(() => {}); } catch (_) { /* ignore */ }
  }
}

function createModbusDriver(device, tags, store, log) {
  const d = new ModbusDriver(device, tags, store, log);
  if (device.driver === 'modbus-rtu') d.conn().refs++;
  return d;
}

module.exports = { createModbusDriver, ModbusDriver };
