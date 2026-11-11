'use strict';
// Historian: keeps recent points in memory for fast trends and appends samples to
// one JSONL file per day ({"t":ms,"id":"TAG","v":value}). Point it at InfluxDB/TimescaleDB later
// by replacing writeFile().
const fs = require('fs');
const path = require('path');

class Historian {
  constructor(store, { dir, sampleSec = 5, memoryPoints = 720 }) {
    this.store = store;
    this.dir = dir;
    this.sampleMs = sampleSec * 1000;
    this.max = memoryPoints;
    this.mem = new Map();
    this.lastWrite = new Map();
    this.buffer = [];
    fs.mkdirSync(dir, { recursive: true });
    const onValue = (tv) => this.record(tv);
    store.on('change', onValue);
    store.on('heartbeat', onValue);
  }

  record(tv) {
    if (tv.quality !== 'good' || tv.value === null) return;
    const last = this.lastWrite.get(tv.id) || 0;
    if (tv.ts - last < this.sampleMs) return;
    this.lastWrite.set(tv.id, tv.ts);
    const v = typeof tv.value === 'boolean' ? (tv.value ? 1 : 0) : tv.value;
    let arr = this.mem.get(tv.id);
    if (!arr) { arr = []; this.mem.set(tv.id, arr); }
    arr.push([tv.ts, v]);
    if (arr.length > this.max) arr.shift();
    this.buffer.push({ t: tv.ts, id: tv.id, v });
  }

  start() { this.timer = setInterval(() => this.flush(), 5000); }
  stop() { clearInterval(this.timer); this.flush(); }

  fileFor(ts) { return path.join(this.dir, new Date(ts).toISOString().slice(0, 10) + '.jsonl'); }

  flush() {
    if (!this.buffer.length) return;
    const groups = new Map();
    for (const p of this.buffer) {
      const f = this.fileFor(p.t);
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(JSON.stringify(p));
    }
    this.buffer = [];
    for (const [f, lines] of groups) fs.appendFileSync(f, lines.join('\n') + '\n');
  }

  // Returns [[ts, value], ...] between from and to (ms). Reads day files when RAM does not reach back.
  query(id, from, to = Date.now(), maxPoints = 1000) {
    const arr = this.mem.get(id) || [];
    let pts;
    if (arr.length && arr[0][0] <= from) {
      pts = arr.filter(([t]) => t >= from && t <= to);
    } else {
      this.flush();
      pts = [];
      for (let d = new Date(new Date(from).toISOString().slice(0, 10)); d.getTime() <= to; d = new Date(d.getTime() + 86400000)) {
        const f = this.fileFor(d.getTime());
        if (!fs.existsSync(f)) continue;
        for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
          if (!line) continue;
          const p = JSON.parse(line);
          if (p.id === id && p.t >= from && p.t <= to) pts.push([p.t, p.v]);
        }
      }
    }
    if (pts.length <= maxPoints) return pts;
    const step = pts.length / maxPoints; // simple decimation for long ranges
    return Array.from({ length: maxPoints }, (_, i) => pts[Math.floor(i * step)]);
  }
}

module.exports = { Historian };
