'use strict';
// Interlocks: when a condition is true, force a tag to a safe value, in every mode.
// They also block operator commands (see CommandService.blockingInterlock).
const { compare } = require('./compare');

class InterlockEngine {
  constructor(rules, store, commands, log = console) {
    this.rules = rules;
    this.store = store;
    this.commands = commands;
    this.log = log;
    this.busy = new Set();
    this.tripped = new Set();
    store.on('change', (tag) => this.onChange(tag.id));
  }

  onChange(tagId) {
    for (const il of this.rules) if (il.when.tag === tagId || il.force.tag === tagId) this.check(il);
  }

  async check(il) {
    const w = this.store.get(il.when.tag);
    const f = this.store.get(il.force.tag);
    if (!w || w.quality !== 'good') return;
    const active = compare(w.value, il.when.op, il.when.value);
    if (!active) { this.tripped.delete(il.id); return; }
    this.tripped.add(il.id);
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

  status() {
    return this.rules.map((il) => ({ id: il.id, active: this.tripped.has(il.id), text: il.text, when: il.when, force: il.force }));
  }
}

module.exports = { InterlockEngine };
