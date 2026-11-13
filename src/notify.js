'use strict';
// Sends alarm notifications. Channel types:
//   line-messaging : LINE Official Account push (Messaging API). LINE Notify ended in 2025.
//   webhook        : POST JSON to any URL (email/SMS/push gateways, n8n, Make, Node-RED …)
//   ntfy           : phone push through ntfy (https://ntfy.sh or self-hosted) — free Android/iOS app, subscribe to a secret topic

function formatAlarm(alarm, lang = 'th', kind = 'raise', siteName = '') {
  const sev = { critical: lang === 'th' ? 'วิกฤต' : 'CRITICAL', high: lang === 'th' ? 'สูง' : 'HIGH', medium: lang === 'th' ? 'กลาง' : 'MEDIUM' }[alarm.severity] || alarm.severity;
  const head = { raise: '🔴', escalate: '⏫', clear: '✅' }[kind] || '';
  const text = alarm.text[lang] || alarm.text.en || alarm.rule;
  const extra = kind === 'escalate' ? (lang === 'th' ? ' (ยังไม่มีผู้รับทราบ)' : ' (still unacknowledged)') : '';
  return `${head} [${sev}] ${text}${extra}\n${alarm.tag} = ${alarm.value} (${alarm.op} ${alarm.limit})\n${siteName}`.trim();
}

class Notifier {
  constructor(channels, { lang = 'th', siteName = '', log = console, fetchImpl = globalThis.fetch } = {}) {
    this.channels = channels;
    this.lang = lang;
    this.siteName = siteName;
    this.log = log;
    this.fetch = fetchImpl;
    this.sent = [];
  }

  async send(channelIds, alarm, kind) {
    const message = formatAlarm(alarm, this.lang, kind, this.siteName);
    await Promise.all((channelIds || []).map(async (id) => {
      const ch = this.channels[id];
      if (!ch) return;
      try {
        if (ch.type === 'line-messaging') {
          if (!ch.token) throw new Error('LINE token missing (set ' + ch.tokenEnv + ')');
          const r = await this.fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ch.token },
            body: JSON.stringify({ to: ch.to, messages: [{ type: 'text', text: message }] })
          });
          if (!r.ok) throw new Error('LINE HTTP ' + r.status);
        } else if (ch.type === 'ntfy') {
          await this.ntfy(ch, alarm.severity === 'critical' ? 5 : 4, message.split('\n')[0], message);
        } else if (ch.type === 'webhook') {
          const r = await this.fetch(ch.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: id, kind, message, alarm }) });
          if (!r.ok) throw new Error('webhook HTTP ' + r.status);
        }
        this.sent.push({ channel: id, kind, alarm: alarm.id, ts: Date.now() });
      } catch (err) {
        this.log.warn(`[notify:${id}] ${err.message}`);
      }
    }));
  }
}

Notifier.prototype.ntfy = async function (ch, priority, title, message, click) {
  if (!ch.topic) throw new Error('ntfy topic missing');
  const r = await this.fetch(ch.server || 'https://ntfy.sh', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ topic: ch.topic, title, message, priority, tags: ['zap'], ...(click ? { click } : {}) }) });
  if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
};
// free-text message (power-quality alarms) to the listed channels
Notifier.prototype.sendText = async function (channelIds, { title, body }, { priority = 4, click } = {}) {
  await Promise.all((channelIds || []).map(async (id) => {
    const ch = this.channels[id]; if (!ch) return;
    try {
      if (ch.type === 'ntfy') await this.ntfy(ch, priority, title, body, click || ch.click);
      else if (ch.type === 'line-messaging') {
        if (!ch.token) throw new Error('LINE token missing (set ' + ch.tokenEnv + ')');
        const r = await this.fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ch.token }, body: JSON.stringify({ to: ch.to, messages: [{ type: 'text', text: title + '\n' + body }] }) });
        if (!r.ok) throw new Error('LINE HTTP ' + r.status);
      } else if (ch.type === 'webhook') {
        const r = await this.fetch(ch.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: id, kind: 'pq', title, message: body }) });
        if (!r.ok) throw new Error('webhook HTTP ' + r.status);
      }
      this.sent.push({ channel: id, kind: 'pq', title, ts: Date.now() });
    } catch (err) { this.log.warn(`[notify:${id}] ${err.message}`); }
  }));
};

module.exports = { Notifier, formatAlarm };
