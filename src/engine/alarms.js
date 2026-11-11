'use strict';
// Alarm engine (ISA-18.2 style states):
//   normal -> (condition holds for delaySec) -> active/unacked
//   active/unacked --ack--> active/acked --clear--> normal
//   active/unacked --clear--> cleared/unacked --ack--> normal
// Unacknowledged alarms are re-notified with escalate=true after escalateMin.
const { EventEmitter } = require('events');
const { compare } = require('./compare');

class AlarmEngine extends EventEmitter {
  constructor(rules, store, { now = () => Date.now() } = {}) {
    super();
    this.rules = rules;
    this.store = store;
    this.now = now;
    this.state = new Map(); // rule id -> alarm
    this.pendingSince = new Map();
    this.history = [];
    store.on('change', (tag) => this.evaluate(tag.id));
  }

  start() { this.timer = setInterval(() => this.evaluateAll(), 1000); }
  stop() { clearInterval(this.timer); }

  evaluateAll() { for (const r of this.rules) this.check(r); this.escalate(); }
  evaluate(tagId) { for (const r of this.rules) if (r.tag === tagId) this.check(r); }

  check(rule) {
    const tv = this.store.get(rule.tag);
    if (!tv || tv.quality !== 'good') return;
    const on = compare(tv.value, rule.op, rule.value);
    const cur = this.state.get(rule.id);
    const t = this.now();
    if (on) {
      if (cur && (cur.state === 'active')) return;
      if (!this.pendingSince.has(rule.id)) this.pendingSince.set(rule.id, t);
      if (t - this.pendingSince.get(rule.id) < (rule.delaySec || 0) * 1000) return;
      const alarm = {
        id: rule.id + '@' + t, rule: rule.id, tag: rule.tag, severity: rule.severity || 'medium',
        text: rule.text || { th: rule.id, en: rule.id }, value: tv.value, limit: rule.value, op: rule.op,
        state: 'active', acked: false,
        raisedAt: t, ackedAt: null, ackedBy: null, clearedAt: null, notifiedAt: t, escalated: false
      };
      this.state.set(rule.id, alarm);
      this.history.unshift(alarm);
      this.history.length = Math.min(this.history.length, 500);
      this.emit('raise', alarm, rule);
    } else {
      this.pendingSince.delete(rule.id);
      if (cur && cur.state === 'active') {
        cur.state = 'cleared';
        cur.clearedAt = t;
        if (cur.acked) this.state.delete(rule.id);
        this.emit('clear', cur, rule);
      }
    }
  }

  ack(alarmId, user) {
    for (const [ruleId, a] of this.state) {
      if (a.id === alarmId || ruleId === alarmId) {
        if (a.acked) return a;
        a.acked = true;
        a.ackedAt = this.now();
        a.ackedBy = user ? user.id : 'system';
        if (a.state === 'cleared') this.state.delete(ruleId);
        this.emit('ack', a);
        return a;
      }
    }
    return null;
  }

  escalate() {
    const t = this.now();
    for (const a of this.state.values()) {
      const rule = this.rules.find((r) => r.id === a.rule);
      if (!rule || !rule.escalateMin || a.acked || a.escalated) continue;
      if (t - a.raisedAt >= rule.escalateMin * 60_000) {
        a.escalated = true;
        this.emit('escalate', a, rule);
      }
    }
  }

  active() { return Array.from(this.state.values()); }
}

module.exports = { AlarmEngine };
