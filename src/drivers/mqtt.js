'use strict';
// MQTT driver: subscribes to state topics, maps JSON fields to tags, publishes commands.
const mqtt = require('mqtt');
const { DeviceHealth } = require('./health');

function pick(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function coerce(v, tag) {
  if (v === undefined) return undefined;
  if (tag.dataType === 'bool') return v === true || v === 1 || v === '1' || v === 'ON' || v === 'on' || v === 'true';
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return Math.round((n * (tag.scale ?? 1) + (tag.offset ?? 0)) * 1e6) / 1e6;
}

class MqttDriver {
  constructor(device, tags, store, log = console) {
    this.device = device;
    this.tags = tags;
    this.store = store;
    this.log = log;
    this.health = new DeviceHealth(device.id);
    this.byTopic = new Map();
    for (const t of tags) {
      if (!t.topic) throw new Error(`MQTT tag ${t.id} needs a topic`);
      if (!this.byTopic.has(t.topic)) this.byTopic.set(t.topic, []);
      this.byTopic.get(t.topic).push(t);
    }
  }

  start() {
    const d = this.device;
    this.client = mqtt.connect(d.url, {
      clientId: d.clientId || `coredash-${d.id}-${Math.random().toString(16).slice(2, 8)}`,
      username: d.username,
      password: d.password,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
      rejectUnauthorized: d.rejectUnauthorized !== false
    });
    this.client.on('connect', () => {
      this.health.ok(0);
      this.client.subscribe(Array.from(this.byTopic.keys()), { qos: 1 });
    });
    this.client.on('message', (topic, payload) => {
      const t0 = Date.now();
      const list = this.byTopic.get(topic);
      if (!list) return;
      let data;
      const text = payload.toString();
      try { data = JSON.parse(text); } catch (_) { data = text; }
      for (const tag of list) {
        const v = coerce(typeof data === 'object' ? pick(data, tag.jsonPath) : data, tag);
        if (v !== undefined) this.store.update(tag.id, v, 'good');
      }
      this.health.ok(Date.now() - t0);
    });
    this.client.on('error', (err) => { this.health.fail(err); this.log.warn(`[${d.id}] mqtt: ${err.message}`); });
    this.client.on('offline', () => { this.health.fail(new Error('offline')); this.store.markDevice(d.id, 'bad'); });
  }

  write(tag, value) {
    if (!tag.commandTopic) return Promise.reject(new Error(`Tag ${tag.id} has no commandTopic`));
    const payload = tag.commandKey ? JSON.stringify({ [tag.commandKey]: value }) : String(value);
    return new Promise((resolve, reject) => {
      this.client.publish(tag.commandTopic, payload, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
    });
  }

  stop() { if (this.client) this.client.end(true); }
}

function createMqttDriver(device, tags, store, log) { return new MqttDriver(device, tags, store, log); }

module.exports = { createMqttDriver, coerce, pick };
