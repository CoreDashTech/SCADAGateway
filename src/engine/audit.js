'use strict';
// Append-only, hash-chained audit log. Each line carries the SHA-256 of the previous line,
// so editing or deleting any past record breaks verify().
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuditLog {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.prevHash = 'GENESIS';
    this.seq = 0;
    this.recent = [];
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      for (const l of lines.slice(-200)) this.recent.unshift(JSON.parse(l));
      if (lines.length) {
        const last = JSON.parse(lines[lines.length - 1]);
        this.prevHash = last.hash;
        this.seq = last.seq;
      }
    }
  }

  static hashOf(entry) {
    const { hash, ...rest } = entry;
    return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
  }

  append(fields) {
    const entry = { seq: ++this.seq, ts: new Date().toISOString(), ...fields, prevHash: this.prevHash };
    entry.hash = AuditLog.hashOf(entry);
    fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
    this.prevHash = entry.hash;
    this.recent.unshift(entry);
    this.recent.length = Math.min(this.recent.length, 200);
    return entry;
  }

  list(limit = 100) { return this.recent.slice(0, limit); }

  static verify(file) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    let prev = 'GENESIS';
    for (let i = 0; i < lines.length; i++) {
      const e = JSON.parse(lines[i]);
      if (e.prevHash !== prev || AuditLog.hashOf(e) !== e.hash) return { ok: false, brokenAt: e.seq ?? i + 1 };
      prev = e.hash;
    }
    return { ok: true, entries: lines.length };
  }
}

module.exports = { AuditLog };
