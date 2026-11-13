'use strict';
// Live reading of Modbus panel meters (Schneider PM5560, Siemens PAC3200, Janitza UMG 96RM, Eastron SDM630 or a
// custom register list) for the PQ service. Register profiles live in app/pq-meters.js (shared with the web app).
const ModbusRTU = require('modbus-serial');

class ModbusMeterClient {
  constructor(inst, profile, log = console) {
    this.inst = inst; this.profile = profile; this.log = log;
    this.client = new ModbusRTU();
  }
  async open() {
    if (this.client.isOpen) return;
    const i = this.inst;
    if (i.path) await this.client.connectRTUBuffered(i.path, { baudRate: i.baudRate || 9600, parity: i.parity || 'none', dataBits: i.dataBits || 8, stopBits: i.stopBits || 1 });
    else await this.client.connectTCP(i.host, { port: i.port || 502 });
    this.client.setID(i.unitId ?? 1);
    this.client.setTimeout(i.timeoutMs || 2000);
  }
  async read(mod) {
    await this.open();
    return mod.readProfile(this.profile, async (fc, start, len) => {
      const r = fc === 4 ? await this.client.readInputRegisters(start, len) : await this.client.readHoldingRegisters(start, len);
      return r.data;
    });
  }
  close() { try { if (this.client.isOpen) this.client.close(() => {}); } catch {} }
}

// profile from the YAML: a known name, or a custom register list [[key, address, scale], …]
function profileOf(inst, MODBUS) {
  if (inst.registers && inst.registers.length) {
    return { fc: inst.fc || 3, word: inst.wordSwap ? 'swap' : 'BE', regs: inst.registers.map((r) => (Array.isArray(r) ? r : [r.key, r.address, r.scale || 1])) };
  }
  const p = MODBUS[inst.profile];
  if (!p) throw new Error(`pq instrument ${inst.id}: unknown Modbus profile "${inst.profile}" (use ${Object.keys(MODBUS).join(', ')} or give registers)`);
  return inst.wordSwap ? { ...p, word: 'swap' } : p;
}

module.exports = { ModbusMeterClient, profileOf };
