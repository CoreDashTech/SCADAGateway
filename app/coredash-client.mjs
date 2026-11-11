// CoreDash Nexus — browser/Node client for the gateway WebSocket API.
// Works in browsers and Node 22+ (global WebSocket). No dependencies.
//
//   import { CoreDashClient } from './coredash-client.mjs';
//   const cd = new CoreDashClient('wss://gateway.plant-a.local/ws', token);
//   cd.on('tags', (changed) => render(cd.values));          // live values
//   cd.on('alarm', ({ event, alarm }) => showToast(alarm));
//   const cmd = await cd.prepare('V-101.POS', 0);           // step 1 → show confirm dialog
//   await cd.confirm(cmd.id);                               // step 2 → written + audited
//
// The CoreDash Nexus screens read values by tag id, e.g. cd.value('T-1.LEVEL').

export class CoreDashClient {
  constructor(url, token, { reconnectMs = 2000, timeoutMs = 10000 } = {}) {
    this.url = url;
    this.token = token;
    this.reconnectMs = reconnectMs;
    this.timeoutMs = timeoutMs;
    this.values = {};       // tagId -> { value, quality, ts, unit }
    this.alarms = [];
    this.devices = [];
    this.user = null;
    this.connected = false;
    this.handlers = {};
    this.waiting = new Map();
    this.seq = 0;
    this.closed = false;
    this.connect();
  }

  on(event, fn) { (this.handlers[event] ||= []).push(fn); return () => this.off(event, fn); }
  off(event, fn) { this.handlers[event] = (this.handlers[event] || []).filter((f) => f !== fn); }
  emit(event, data) { for (const fn of this.handlers[event] || []) { try { fn(data); } catch (e) { console.error(e); } } }

  value(tagId) { const v = this.values[tagId]; return v ? v.value : undefined; }
  quality(tagId) { const v = this.values[tagId]; return v ? v.quality : 'unknown'; }

  connect() {
    const sep = this.url.includes('?') ? '&' : '?';
    const ws = new WebSocket(this.url + sep + 'token=' + encodeURIComponent(this.token));
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.emit('connection', true); };
    ws.onclose = (ev) => {
      this.connected = false;
      this.emit('connection', false);
      for (const [, w] of this.waiting) w.reject(new Error('Connection closed'));
      this.waiting.clear();
      if (ev.code === 4401) { this.emit('error', { error: 'UNAUTHORIZED' }); return; }
      if (!this.closed) setTimeout(() => this.connect(), this.reconnectMs);
    };
    ws.onmessage = (ev) => this.handle(JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()));
  }

  handle(msg) {
    if (msg.reqId && this.waiting.has(msg.reqId)) {
      const w = this.waiting.get(msg.reqId);
      this.waiting.delete(msg.reqId);
      if (msg.type === 'error') { const e = new Error(msg.message || msg.error); e.code = msg.error; w.reject(e); } else w.resolve(msg);
      return;
    }
    switch (msg.type) {
      case 'snapshot':
        this.user = msg.user;
        this.site = msg.site;
        for (const t of msg.tags) this.values[t.id] = t;
        this.alarms = msg.alarms;
        this.devices = msg.devices;
        this.interlocks = msg.interlocks;
        this.emit('snapshot', msg);
        this.emit('tags', msg.tags);
        break;
      case 'tags':
        for (const t of msg.tags) this.values[t.id] = t;
        this.emit('tags', msg.tags);
        break;
      case 'alarm': {
        const a = msg.alarm;
        this.alarms = this.alarms.filter((x) => x.rule !== a.rule);
        if (!(a.state === 'cleared' && a.acked)) this.alarms.unshift(a);
        this.emit('alarm', msg);
        break;
      }
      case 'devices': this.devices = msg.devices; this.emit('devices', msg.devices); break;
      case 'audit': this.emit('audit', msg.entry); break;
      default: this.emit(msg.type, msg);
    }
  }

  request(payload) {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('Not connected'));
      const reqId = 'r' + (++this.seq);
      const timer = setTimeout(() => { this.waiting.delete(reqId); reject(new Error('Timeout')); }, this.timeoutMs);
      this.waiting.set(reqId, { resolve: (m) => { clearTimeout(timer); resolve(m); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ ...payload, reqId }));
    });
  }

  async prepare(tag, value) { return (await this.request({ type: 'command.prepare', tag, value })).command; }
  async confirm(id) { return (await this.request({ type: 'command.confirm', id })).entry; }
  async cancel(id) { return (await this.request({ type: 'command.cancel', id })).cancelled; }
  async ack(alarmId) { return (await this.request({ type: 'alarm.ack', id: alarmId })).alarm; }

  close() { this.closed = true; if (this.ws) this.ws.close(); }
}

// REST helper for history/trends and reports
export async function fetchHistory(baseUrl, token, tag, fromMs, toMs = Date.now()) {
  const r = await fetch(`${baseUrl}/api/history?tag=${encodeURIComponent(tag)}&from=${fromMs}&to=${toMs}`, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).points;
}
