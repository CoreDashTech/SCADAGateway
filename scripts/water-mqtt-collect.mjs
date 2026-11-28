#!/usr/bin/env node
// CoreDash Water · เก็บข้อความ SMCV4 + Clamp-on DCC จาก Drago MQTT ลง water/data/latest.json
// ให้หน้า water/ (GitHub Pages) อ่านข้อมูลจริงได้โดยไม่ต้องมีเซิร์ฟเวอร์
//
// ใช้:  DRAGO_MQTT_PASSWORD=... node scripts/water-mqtt-collect.mjs
//       node scripts/water-mqtt-collect.mjs --import messages.txt   (นำเข้าข้อความที่คัดลอกจาก MQTTX)
// env:  DRAGO_MQTT_URL (mqtt://mqtt-broker.dragodssplus.com:1883) DRAGO_MQTT_USER (drago)
//       WATER_TOPIC (drago/dcc/+/shadow/update) LISTEN_MIN (55) KEEP_DAYS (62) WATER_OUT (water/data/latest.json)
// เก็บเฉพาะค่ามิเตอร์ ไม่เก็บ IMEI / ICCID / IP ของโมเด็ม เพราะไฟล์นี้อยู่ใน repo สาธารณะ
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.WATER_OUT || 'water/data/latest.json';
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 62);
const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));

export function normalize(topic, j) {
  const r = j && j.state && j.state.reported ? j.state.reported : j;
  if (!r || !('V4TotalVolume' in r || 'V4MID' in r)) return null;
  const M = r.MODEM || {};
  const csq = num(M.RSSI), bat = num(r.V4Vbat), fl = num(r.V4Flowrate);
  const noread = !num(r.V4Vbat) && !num(r.V4TotalVolume) && !num(r.V4ForwardVolume);
  let ts = num(r.V4Epoch);
  if (!ts && r.V4Timestamp) ts = Math.round(Date.parse(r.V4Timestamp) / 1000);
  if (!ts) return null;
  const o = {
    meterId: String(r.V4MID || String(topic || '').split('/')[2] || r.DccUID),
    ts,
    total: num(r.V4TotalVolume), forward: num(r.V4ForwardVolume), reverse: num(r.V4ReverseVolume),
    flow: noread || fl == null ? null : fl / 1000,
    battery: noread || bat == null ? null : bat / 1000,
    dccbat: num(r.DccVbat) == null ? null : num(r.DccVbat) / 1000,
    rssi: csq == null ? null : csq >= 0 && csq <= 31 ? 2 * csq - 113 : csq,
    temp: num(r.DccTemp), event: num(r.V4Event), online: M.ONLINE === undefined ? null : !!M.ONLINE,
    dcc: r.DccUID || null
  };
  if (noread) o._noread = 1;
  for (const k of Object.keys(o)) if (o[k] === null) delete o[k];
  return o;
}

function load() {
  try { const d = JSON.parse(fs.readFileSync(OUT, 'utf8')); return Array.isArray(d.records) ? d.records : []; } catch (_) { return []; }
}

export function save(records, extra = {}) {
  const seen = new Map();
  for (const r of records) seen.set(r.meterId + '|' + r.ts, r);
  const cut = Date.now() / 1000 - KEEP_DAYS * 86400;
  const all = [...seen.values()].filter((r) => r.ts >= cut).sort((a, b) => a.ts - b.ts);
  const meters = {};
  for (const r of all) meters[r.meterId] = { last: r.ts, dcc: r.dcc || (meters[r.meterId] || {}).dcc };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const body = { updated: new Date().toISOString(), source: 'drago/dcc/+/shadow/update', keepDays: KEEP_DAYS, meters, records: all, ...extra };
  fs.writeFileSync(OUT, JSON.stringify(body).replace(/\},\{"meterId"/g, '},\n{"meterId"') + '\n');
  return all.length;
}

// top-level {…} blocks from pasted MQTTX text
function blocks(txt) {
  const out = []; let d = 0, st = -1, q = false, esc = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue; }
    if (c === '"' && d > 0) q = true;
    else if (c === '{') { if (d++ === 0) st = i; }
    else if (c === '}' && d > 0 && --d === 0) { try { out.push(JSON.parse(txt.slice(st, i + 1))); } catch (_) {} }
  }
  return out;
}

async function main() {
  const records = load();
  const before = records.length;
  const imp = process.argv.indexOf('--import');
  if (imp > 0) {
    const add = blocks(fs.readFileSync(process.argv[imp + 1], 'utf8')).map((j) => normalize('', j)).filter(Boolean);
    const n = save(records.concat(add));
    console.log(`imported ${add.length} → ${n} records in ${OUT}`);
    return;
  }
  const pass = process.env.DRAGO_MQTT_PASSWORD;
  if (!pass) { console.error('DRAGO_MQTT_PASSWORD is not set'); process.exit(2); }
  const { default: mqtt } = await import('mqtt');
  const url = process.env.DRAGO_MQTT_URL || 'mqtt://mqtt-broker.dragodssplus.com:1883';
  const topic = process.env.WATER_TOPIC || 'drago/dcc/+/shadow/update';
  const listenMs = Number(process.env.LISTEN_MIN || 55) * 60e3;
  let got = 0, connected = false, lastErr = '', subOk = null;
  const c = mqtt.connect(url, {
    username: process.env.DRAGO_MQTT_USER || 'drago', password: pass,
    clientId: 'coredash-water-collect-' + Math.random().toString(16).slice(2, 8),
    protocolVersion: 4, reconnectPeriod: 5000, connectTimeout: 15000, clean: true
  });
  c.on('connect', () => {
    connected = true; console.log('connected, subscribing', topic);
    c.subscribe(topic, { qos: 0 }, (err, granted) => {
      subOk = !err && !(granted && granted[0] && granted[0].qos === 128);
      console.log(subOk ? 'subscribed OK' : '::error::broker refused subscription to ' + topic);
    });
  });
  c.on('close', () => { if (!connected) console.log('connection closed before CONNACK'); });
  c.on('error', (e) => { lastErr = e.message; console.error('::warning::mqtt error: ' + e.message); });
  c.on('message', (tp, pl) => {
    let j; try { j = JSON.parse(pl.toString()); } catch (_) { return; }
    const r = normalize(tp, j); if (!r) return;
    records.push(r); got++;
    console.log(new Date(r.ts * 1000).toISOString(), r.meterId, r.total ?? '-', r._noread ? '(no read)' : '');
    save(records);
  });
  const finish = () => {
    c.end(true);
    // ไม่เขียนไฟล์ถ้าไม่มีข้อความใหม่ (กัน commit ว่างทุกชั่วโมง)
    const n = got ? save(records) : records.length;
    if (!connected) console.log(`::error::could not connect to ${url} as ${process.env.DRAGO_MQTT_USER || 'drago'}: ${lastErr || 'no CONNACK (blocked port/firewall?)'}`);
    else if (!got) console.log(`::warning::connected (subscribe ${subOk === false ? 'REFUSED' : 'ok'}) but no messages on ${topic} in ${listenMs / 60e3} min`);
    console.log(`received ${got} messages, ${n} records stored (was ${before})`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `added=${got}\nrecords=${n}\n`);
    process.exit(connected ? 0 : 1);
  };
  setTimeout(finish, listenMs);
  process.on('SIGTERM', finish); process.on('SIGINT', finish);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
