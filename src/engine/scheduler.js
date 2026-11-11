'use strict';
// Runs schedules on the gateway in the site's time zone. days: 1=Mon … 7=Sun.

function localParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { hhmm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, dow, day: `${p.year}-${p.month}-${p.day}` };
}

class Scheduler {
  constructor(schedules, commands, { timeZone = 'Asia/Bangkok', now = () => new Date(), log = console } = {}) {
    this.schedules = schedules.map((s) => ({ enabled: true, ...s }));
    this.commands = commands;
    this.tz = timeZone;
    this.now = now;
    this.log = log;
    this.lastRun = new Map();
  }

  start() { this.timer = setInterval(() => this.tick(), 15000); this.tick(); }
  stop() { clearInterval(this.timer); }

  async tick() {
    const { hhmm, dow, day } = localParts(this.now(), this.tz);
    for (const s of this.schedules) {
      if (!s.enabled || s.at !== hhmm || !(s.days || [1, 2, 3, 4, 5, 6, 7]).includes(dow)) continue;
      if (this.lastRun.get(s.id) === day) continue;
      this.lastRun.set(s.id, day);
      for (const step of s.set) {
        try { await this.commands.system('schedule:' + s.id, step.tag, step.value); }
        catch (err) { this.log.warn(`[schedule] ${s.id} ${step.tag}: ${err.message}`); }
      }
    }
  }

  setEnabled(id, enabled) {
    const s = this.schedules.find((x) => x.id === id);
    if (s) s.enabled = enabled;
    return s;
  }
}

module.exports = { Scheduler, localParts };
