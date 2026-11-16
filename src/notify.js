'use strict';
// Sends alarm notifications. Channel types:
//   line-messaging : LINE Official Account push (Messaging API). LINE Notify ended in 2025.
//   webhook        : POST JSON to any URL (email/SMS/push gateways, n8n, Make, Node-RED …)
//   telegram       : Telegram Bot API (bot token + chatId)
//   email          : SMTP (nodemailer) — host, port, user, passwordEnv, from, to[]
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
        await this.deliver(ch, message.split('\n')[0], message, alarm.severity === 'critical' ? 5 : 4, { kind, alarm });
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


// one place for every channel type, used by send() and sendText()
Notifier.prototype.deliver = async function (ch, title, message, priority, extra = {}) {
  if (ch.type === 'line' || ch.type === 'line-messaging') {
    if (!ch.token) throw new Error('LINE token missing (set ' + ch.tokenEnv + ')');
    const r = await this.fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ch.token }, body: JSON.stringify({ to: Array.isArray(ch.to) ? ch.to[0] : ch.to, messages: [{ type: 'text', text: message }] }) });
    if (!r.ok) throw new Error('LINE HTTP ' + r.status);
  } else if (ch.type === 'telegram') {
    if (!ch.token || !ch.chatId) throw new Error('Telegram token/chatId missing (set ' + ch.tokenEnv + ')');
    const r = await this.fetch(`https://api.telegram.org/bot${ch.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: ch.chatId, text: message, disable_notification: priority < 4 }) });
    if (!r.ok) throw new Error('Telegram HTTP ' + r.status);
  } else if (ch.type === 'email') {
    if (!this.mailer) {
      const nodemailer = require('nodemailer');
      this.mailer = nodemailer.createTransport({ host: ch.host, port: ch.port || 587, secure: ch.port === 465, requireTLS: ch.port !== 465, auth: ch.user ? { user: ch.user, pass: ch.password } : undefined });
    }
    await this.mailer.sendMail({ from: ch.from, to: ch.to, subject: title, text: message });
  } else if (ch.type === 'ntfy') {
    await this.ntfy(ch, priority, title, message);
  } else if (ch.type === 'webhook') {
    if (!ch.url) throw new Error('webhook url missing');
    const r = await this.fetch(ch.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ch.token ? { Authorization: 'Bearer ' + ch.token } : {}) }, body: JSON.stringify({ channel: ch.id, title, message, ...extra }) });
    if (!r.ok) throw new Error('webhook HTTP ' + r.status);
  } else throw new Error('unknown channel type ' + ch.type);
};

module.exports = { Notifier, formatAlarm };
