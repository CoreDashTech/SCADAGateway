'use strict';
// Command pipeline: role check -> validation -> interlock check -> two-step confirmation
// -> driver write -> audit. Every path (operator, schedule, interlock) goes through here.
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { roleAtLeast } = require('../config');
const { compare } = require('./compare');

class CommandError extends Error {
  constructor(code, message, status = 400, details) { super(message); this.code = code; this.status = status; if (details) this.details = details; }
}

class CommandService extends EventEmitter {
  constructor({ store, drivers, interlocks, audit, ttlSec = 30, now = () => Date.now() }) {
    super();
    this.store = store;
    this.drivers = drivers;        // tagId -> driver
    this.interlocks = interlocks;  // array
    this.audit = audit;
    this.ttl = ttlSec * 1000;
    this.now = now;
    this.pending = new Map();
  }

  validate(user, tagId, value) {
    const def = this.store.def(tagId);
    if (!def) throw new CommandError('UNKNOWN_TAG', `Unknown tag ${tagId}`, 404);
    if (!def.writable) throw new CommandError('READ_ONLY', `Tag ${tagId} is read-only`, 400);
    const minRole = def.minRole || 'operator';
    if (!user || !roleAtLeast(user.role, minRole)) throw new CommandError('FORBIDDEN', `Role ${user ? user.role : 'none'} cannot command ${tagId}`, 403);
    let v = value;
    if (def.dataType === 'bool') {
      if (typeof v !== 'boolean') throw new CommandError('BAD_VALUE', `${tagId} expects true/false`);
    } else {
      v = Number(v);
      if (!Number.isFinite(v)) throw new CommandError('BAD_VALUE', `${tagId} expects a number`);
      if (def.min !== undefined && v < def.min) throw new CommandError('OUT_OF_RANGE', `${tagId} min is ${def.min}`);
      if (def.max !== undefined && v > def.max) throw new CommandError('OUT_OF_RANGE', `${tagId} max is ${def.max}`);
    }
    const blocked = this.blockingInterlock(tagId, v);
    if (blocked) {
      const w = this.store.get(blocked.when.tag);
      throw new CommandError('INTERLOCK', `Blocked by interlock ${blocked.id}`, 409, {
        id: blocked.id, text: blocked.text, tag: blocked.when.tag, op: blocked.when.op, limit: blocked.when.value, value: w ? w.value : null,
        bypassable: blocked.bypassable !== false, maxBypassMin: blocked.maxBypassMin || 30, fixes: blocked.fixes || []
      });
    }
    return { def, value: v };
  }

  // An interlock blocks a command that would set its forced tag away from the forced value.
  blockingInterlock(tagId, value) {
    // report a non-bypassable interlock first: bypassing a softer one would not help
    const order = [...this.interlocks].sort((a, b) => (a.bypassable === false ? 0 : 1) - (b.bypassable === false ? 0 : 1));
    for (const il of order) {
      if (il.force.tag !== tagId || value === il.force.value) continue;
      if (this.isBypassed && this.isBypassed(il.id)) continue;
      const w = this.store.get(il.when.tag);
      if (w && compare(w.value, il.when.op, il.when.value)) return il;
    }
    return null;
  }

  prepare(user, tagId, value) {
    const { value: v } = this.validate(user, tagId, value);
    const id = crypto.randomUUID();
    const cmd = { id, tag: tagId, value: v, previous: this.store.value(tagId), user: user.id, createdAt: this.now(), expiresAt: this.now() + this.ttl };
    this.pending.set(id, cmd);
    setTimeout(() => this.pending.delete(id), this.ttl + 1000).unref?.();
    return cmd;
  }

  async confirm(user, id) {
    const cmd = this.pending.get(id);
    if (!cmd) throw new CommandError('NOT_FOUND', 'Command not found or already used', 404);
    if (cmd.user !== user.id) throw new CommandError('FORBIDDEN', 'Only the user who prepared a command can confirm it', 403);
    if (this.now() > cmd.expiresAt) { this.pending.delete(id); throw new CommandError('EXPIRED', 'Confirmation window expired', 410); }
    this.pending.delete(id);
    this.validate(user, cmd.tag, cmd.value); // re-check: interlocks may have changed meanwhile
    return this.execute(user, cmd.tag, cmd.value, 'operator', cmd.id);
  }

  cancel(user, id) {
    const cmd = this.pending.get(id);
    if (cmd && cmd.user === user.id) this.pending.delete(id);
    return Boolean(cmd);
  }

  // Direct execution for trusted system sources (schedules, interlocks). Still audited.
  async system(source, tagId, value) {
    const sys = { id: source, role: 'admin' };
    const { value: v } = this.validate(sys, tagId, value);
    return this.execute(sys, tagId, v, source === 'interlock' ? 'interlock' : 'schedule');
  }

  async execute(user, tagId, value, origin, commandId) {
    const def = this.store.def(tagId);
    const driver = this.drivers.get(tagId);
    const previous = this.store.value(tagId);
    let result = 'ok', error;
    try {
      if (!driver) throw new Error('No driver for ' + tagId);
      await driver.write(def, value);
    } catch (err) {
      result = 'failed';
      error = err.message;
    }
    const entry = this.audit.append({ action: 'write', origin, user: user.id, tag: tagId, previous, value, result, error, commandId });
    this.emit('executed', entry);
    if (result !== 'ok') throw new CommandError('WRITE_FAILED', error, 502);
    return entry;
  }
}

module.exports = { CommandService, CommandError };
