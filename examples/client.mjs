// ตัวอย่างดึงข้อมูลด้วย Node.js 18+ (ไม่ต้องติดตั้งอะไรเพิ่ม)
//   HYDROLINK_URL=http://localhost:8080 HYDROLINK_KEY=demo-key CD_AES_KEY=... node examples/client.mjs aes-256-gcm
import crypto from 'node:crypto';
const URL = process.env.HYDROLINK_URL || 'http://localhost:8080', KEY = process.env.HYDROLINK_KEY || 'demo-key';
const enc = process.argv[2];
const r = await fetch(URL + '/api/v1/latest?points=system.pressure,FT-01.flow,PM-01.kw', { headers: { 'X-API-Key': KEY, ...(enc ? { 'X-CD-Encrypt': enc } : {}) } });
let body = await r.json();
if (body.enc) {
  const b = (s) => Buffer.from(s, 'base64'), iv = b(body.iv), data = b(body.data);
  if (body.enc === 'aes-256-gcm') {
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.CD_AES_KEY, 'hex'), iv); d.setAuthTag(b(body.tag));
    body = JSON.parse(Buffer.concat([d.update(data), d.final()]));
  } else {
    const mac = crypto.createHmac('sha256', Buffer.from(process.env.CD_MAC_KEY, 'hex')).update(iv).update(data).digest();
    if (!crypto.timingSafeEqual(mac, b(body.mac))) throw new Error('MAC mismatch');
    const d = crypto.createDecipheriv('des-ede3-cbc', Buffer.from(process.env.CD_3DES_KEY, 'hex'), iv);
    body = JSON.parse(Buffer.concat([d.update(data), d.final()]));
  }
}
console.table(body.data.map(({ point, value, unit, quality }) => ({ point, value, unit, quality })));
