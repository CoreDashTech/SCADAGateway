'use strict';
// Communication health per device: online / degraded / offline, latency, errors in the last hour.

class DeviceHealth {
  constructor(id) {
    this.id = id;
    this.status = 'connecting';
    this.latencyMs = null;
    this.lastSeen = null;
    this.failures = 0;
    this.errors = []; // timestamps
    this.lastError = null;
  }

  ok(latencyMs) {
    this.latencyMs = latencyMs;
    this.lastSeen = Date.now();
    this.failures = 0;
    this.prune();
    this.status = this.errors.length > 10 ? 'degraded' : 'online';
  }

  fail(err) {
    this.failures++;
    this.lastError = String(err && err.message ? err.message : err);
    this.errors.push(Date.now());
    this.prune();
    this.status = this.failures >= 3 ? 'offline' : 'degraded';
  }

  prune() {
    const cut = Date.now() - 3600_000;
    while (this.errors.length && this.errors[0] < cut) this.errors.shift();
  }

  toJSON() {
    this.prune();
    return { id: this.id, status: this.status, latencyMs: this.latencyMs, lastSeen: this.lastSeen, errorsPerHour: this.errors.length, lastError: this.lastError };
  }
}

module.exports = { DeviceHealth };
