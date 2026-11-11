'use strict';
// Interlocks: when a condition is true, force a tag to a safe value, in every mode.
// They also block operator commands (see CommandService.blockingInterlock).
//
// Bypass (maintenance override, ISA-84 style): an engineer or admin may suspend one interlock
// for a limited time with a written reason. The bypass is audited, broadcast to every screen,
// expires on its own, and is refused for rules marked `bypassable: false`.
const { EventEmitter } = require('events');
const { compare } = require('./compare');
const { roleAtLeast } = require('../config');

class InterlockEngine extends EventEmitter {
  constructor(rules, store, commands, log = console, { now = () => Date.now(), audit = null } = {}) {
    super();
    this.rules = rules;
    this.store = store;
    this.commands = commands;
    this.log = log;
    this.now = now;
    this.audit = audit;
    this.busy = new Set();
    this.tripped = new Set();
    this.bypasses = new Map(); // id -> { until, by, reason, since }
    commands.isBypassed = (id) => this.isBypassed(id);
    store.on('change', (tag) => this.onChange(tag.id));
    this.timer = setInterval(() => this.expire(), 1000);
    this.timer.unref?.();
  }

  onChange(tagId) {
    for (const il of this.rules) if (il.when.tag === tagId || il.force.tag === tagId) this.check(il);
  }

  isBypassed(id) {
    const b = this.bypasses.get(id);
    return Boolean(b && b.until > this.now());
  }

  async check(il) {
    const w = this.store.get(il.when.tag);
    const f = this.store.get(il.force.tag);
    if (!w || w.quality !== 'good') return;
    const active = compare(w.value, il.when.op, il.when.value);
    if (!active) { if (this.tripped.delete(il.id)) this.emit('change'); return; }
    if (!this.tripped.has(il.id)) { this.tripped.add(il.id); this.emit('change'); }
    if (this.isBypassed(il.id)) return;
    if (!f || f.value === il.force.value || this.busy.has(il.id)) return;
    this.busy.add(il.id);
    try {
      await this.commands.system('interlock', il.force.tag, il.force.value);
      this.log.warn(`[interlock] ${il.id}: forced ${il.force.tag} = ${il.force.value}`);
    } catch (err) {
      this.log.error(`[interlock] ${il.id} failed: ${err.message}`);
    } finally {
      this.busy.delete(il.id);
    }
  }

  bypass(id, user, minutes, reason) {
    const il = this.rules.find((r) => r.id === id);
    const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
    if (!il) throw fail('NOT_FOUND', 'Unknown interlock ' + id, 404);
    if (!user || !roleAtLeast(user.role, 'engineer')) throw fail('FORBIDDEN', 'Only an engineer or admin can bypass an interlock', 403);
    if (il.bypassable === false) throw fail('NOT_BYPASSABLE', `Interlock ${id} cannot be bypassed`, 409);
    const max = il.maxBypassMin || 30;
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0 || m > max) throw fail('BAD_VALUE', `Bypass time must be 1–${max} minutes`);
    if (!reason || String(reason).trim().length < 5) throw fail('REASON_REQUIRED', 'A written reason (at least 5 characters) is required');
    const b = { id, until: this.now() + m * 60000, by: user.id, reason: String(reason).trim().slice(0, 200), since: this.now(), minutes: m };
    this.bypasses.set(id, b);
    if (this.audit) this.audit.append({ action: 'interlock.bypass', user: user.id, interlock: id, minutes: m, reason: b.reason });
    this.log.warn(`[interlock] ${id} BYPASSED by ${user.id} for ${m} min: ${b.reason}`);
    this.emit('change');
    return b;
  }

  clearBypass(id, user) {
    if (!this.bypasses.has(id)) return false;
    this.bypasses.delete(id);
    if (this.audit) this.audit.append({ action: 'interlock.restore', user: user ? user.id : 'system', interlock: id });
    this.emit('change');
    // re-apply the interlock at once if its condition still holds
    const il = this.rules.find((r) => r.id === id);
    if (il) this.check(il);
    return true;
  }

  expire() {
    for (const [id, b] of this.bypasses) if (b.until <= this.now()) this.clearBypass(id, { id: 'expired' });
  }

  stop() { clearInterval(this.timer); }

  status() {
    return this.rules.map((il) => {
      const w = this.store.get(il.when.tag);
      const b = this.isBypassed(il.id) ? this.bypasses.get(il.id) : null;
      return { id: il.id, active: this.tripped.has(il.id), text: il.text, when: il.when, force: il.force, value: w ? w.value : null, bypassable: il.bypassable !== false, maxBypassMin: il.maxBypassMin || 30, bypass: b, fixes: il.fixes || [] };
    });
  }

  details(id) { return this.status().find((s) => s.id === id) || null; }
}

module.exports = { InterlockEngine };
