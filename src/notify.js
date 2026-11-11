'use strict';
// Sends alarm notifications. Channel types:
//   line-messaging : LINE Official Account push (Messaging API). LINE Notify ended in 2025.
//   webhook        : POST JSON to any URL (email/SMS/push gateways, n8n, Make, Node-RED …)

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

module.exports = { Notifier, formatAlarm };
