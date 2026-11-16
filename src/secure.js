'use strict';
// Payload encryption for API responses (on top of HTTPS/TLS).
//
//   aes-256-gcm  (แนะนำ)  — authenticated encryption, 12-byte IV, 16-byte tag
//   3des                  — DES-EDE3-CBC + HMAC-SHA256 (encrypt-then-MAC) for systems that only support 3DES
//
// Envelope returned instead of the plain JSON body:
//   { "enc": "aes-256-gcm", "kid": "v1", "iv": "<b64>", "tag": "<b64>", "data": "<b64>" }
//   { "enc": "3des-cbc-hmac-sha256", "kid": "v1", "iv": "<b64>", "mac": "<b64>", "data": "<b64>" }
// The plaintext is the UTF-8 JSON the endpoint would normally return.
// 3DES has a 64-bit block: NIST no longer approves it for new encryption (SP 800-131A Rev.2, from 2024)
// and long sessions are exposed to Sweet32. Use it only where the other side cannot do AES, and rotate keys.
const crypto = require('crypto');

const ALGS = { 'aes-256-gcm': 'aes-256-gcm', aes: 'aes-256-gcm', '3des': '3des-cbc-hmac-sha256', '3des-cbc-hmac-sha256': '3des-cbc-hmac-sha256' };

function hexKey(hex, bytes, name) {
  if (!hex) return null;
  const b = Buffer.from(String(hex).trim(), 'hex');
  if (b.length !== bytes) throw new Error(`${name} must be ${bytes} bytes (${bytes * 2} hex characters)`);
  return b;
}

function loadKeys(security = {}, env = process.env) {
  const k = {
    kid: security.kid || 'v1',
    aes: hexKey(env[security.aesKeyEnv || 'CD_AES_KEY'], 32, 'AES key'),
    des: hexKey(env[security.desKeyEnv || 'CD_3DES_KEY'], 24, '3DES key'),
    mac: hexKey(env[security.macKeyEnv || 'CD_MAC_KEY'], 32, 'MAC key')
  };
  if (k.des) {
    // reject degenerate 3DES keys (K1=K2 or K2=K3 makes it single DES)
    const [a, b, c] = [k.des.subarray(0, 8), k.des.subarray(8, 16), k.des.subarray(16, 24)];
    if (a.equals(b) || b.equals(c)) throw new Error('3DES key parts must differ (K1≠K2≠K3)');
  }
  return k;
}

function normalizeAlg(name) { return name ? ALGS[String(name).toLowerCase()] || null : null; }

function encrypt(obj, alg, keys) {
  const plain = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
  if (alg === 'aes-256-gcm') {
    if (!keys.aes) throw Object.assign(new Error('AES key not configured'), { code: 'ENCRYPTION_NOT_CONFIGURED' });
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keys.aes, iv);
    const data = Buffer.concat([c.update(plain), c.final()]);
    return { enc: alg, kid: keys.kid, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
  }
  if (alg === '3des-cbc-hmac-sha256') {
    if (!keys.des || !keys.mac) throw Object.assign(new Error('3DES/MAC key not configured'), { code: 'ENCRYPTION_NOT_CONFIGURED' });
    const iv = crypto.randomBytes(8), c = crypto.createCipheriv('des-ede3-cbc', keys.des, iv);
    const data = Buffer.concat([c.update(plain), c.final()]);
    const mac = crypto.createHmac('sha256', keys.mac).update(iv).update(data).digest();
    return { enc: alg, kid: keys.kid, iv: iv.toString('base64'), mac: mac.toString('base64'), data: data.toString('base64') };
  }
  throw new Error('Unknown algorithm ' + alg);
}

function decrypt(env, keys) {
  const iv = Buffer.from(env.iv, 'base64'), data = Buffer.from(env.data, 'base64');
  if (env.enc === 'aes-256-gcm') {
    const d = crypto.createDecipheriv('aes-256-gcm', keys.aes, iv);
    d.setAuthTag(Buffer.from(env.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  }
  if (env.enc === '3des-cbc-hmac-sha256') {
    const want = crypto.createHmac('sha256', keys.mac).update(iv).update(data).digest();
    const got = Buffer.from(env.mac, 'base64');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw new Error('MAC mismatch — data was changed or wrong key');
    const d = crypto.createDecipheriv('des-ede3-cbc', keys.des, iv);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  }
  throw new Error('Unknown envelope ' + env.enc);
}

function keygen() {
  let des;
  do { des = crypto.randomBytes(24); } while (des.subarray(0, 8).equals(des.subarray(8, 16)) || des.subarray(8, 16).equals(des.subarray(16, 24)));
  return { CD_AES_KEY: crypto.randomBytes(32).toString('hex'), CD_3DES_KEY: des.toString('hex'), CD_MAC_KEY: crypto.randomBytes(32).toString('hex') };
}

module.exports = { loadKeys, normalizeAlg, encrypt, decrypt, keygen };
