'use strict';
// Current value of every tag, with quality and timestamp. Emits 'change' on every update.
const { EventEmitter } = require('events');

class TagStore extends EventEmitter {
  constructor(tagDefs) {
    super();
    this.setMaxListeners(50);
    this.defs = new Map(tagDefs.map((t) => [t.id, t]));
    this.values = new Map();
    for (const t of tagDefs) {
      this.values.set(t.id, { id: t.id, value: null, quality: 'init', ts: 0, unit: t.unit || '', device: t.device });
    }
  }

  def(id) { return this.defs.get(id); }
  get(id) { return this.values.get(id); }
  value(id) { const v = this.values.get(id); return v ? v.value : undefined; }
  all() { return Array.from(this.values.values()); }

  update(id, value, quality = 'good', ts = Date.now()) {
    const cur = this.values.get(id);
    if (!cur) return;
    const changed = cur.value !== value || cur.quality !== quality;
    const next = { ...cur, value, quality, ts };
    this.values.set(id, next);
    if (changed) this.emit('change', next, cur);
    else this.emit('heartbeat', next);
  }

  // Mark every tag of a device bad when the device stops answering.
  markDevice(deviceId, quality) {
    for (const v of this.values.values()) {
      if (v.device === deviceId && v.quality !== quality) this.update(v.id, v.value, quality);
    }
  }
}

module.exports = { TagStore };
