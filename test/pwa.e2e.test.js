'use strict';
// Browser end-to-end test of the installable app against a real gateway (simulator mode).
// Needs Chrome/Chromium; skipped when none is found. Set CHROME_PATH to point at it.
// Set SHOTS_DIR to save screenshots of each screen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('../src/config');
const { createGateway } = require('../src/gateway');

const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const quiet = { log() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(100); } return false; };

test('PWA: install metadata, sign-in, live values, confirmed commands, interlock, alarms, settings', { skip: !CHROME && 'no Chrome found' }, async () => {
  const puppeteer = require('puppeteer-core');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-pwa-'));
  const cfg = loadConfig(path.join(__dirname, '..', 'config', 'plant-a.yaml'), { SIMULATE: '1', DEMO_TOKENS: '1', CD_DATA_DIR: dataDir, PORT: '0' });
  const gw = createGateway(cfg, { log: quiet, fetchImpl: async () => ({ ok: true, status: 200 }), simTickMs: 300 });
  await gw.start();
  const base = `http://127.0.0.1:${gw.server.address().port}`;
  const shots = process.env.SHOTS_DIR;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const failed = [];
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_(NAME|INTERNET|CONNECTION|TUNNEL)/.test(m.text())) errors.push(m.text()); });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const shot = async (name) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await sleep(400); await page.screenshot({ path: path.join(shots, name + '.png') }); } };
    const click = async (sel) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (el) => el.click()); };
    const text = () => page.$eval('#app', (el) => el.innerText);

    // install metadata
    const manifest = await (await fetch(base + '/app/manifest.webmanifest')).json();
    assert.strictEqual(manifest.display, 'standalone');
    assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
    for (const i of manifest.icons) assert.strictEqual((await fetch(base + '/app/' + i.src)).status, 200);

    await page.goto(base + '/', { waitUntil: 'networkidle0' });
    assert.ok(page.url().endsWith('/app/'), 'root redirects to the app');
    assert.ok(await until(async () => (await page.evaluate(() => navigator.serviceWorker.ready.then((r) => Boolean(r.active)).catch(() => false)))), 'service worker active');

    // login screen (gateway found) → demo account of the gateway
    await page.waitForSelector('[data-act="signin-demo"]');
    await shot('01-login');
    await click('[data-act="signin-demo"]');
    await page.waitForSelector('.hdr');
    assert.ok(await until(async () => /kW/.test(await text())));
    await shot('02-home');

    // live value matches the gateway
    assert.ok(await until(async () => (await page.$eval('main .num', (el) => Number(el.textContent.replace(/,/g, '')))) > 100), 'power shows on home');

    // control → valves → close V-102 with confirmation
    await click('[data-act="tab"][data-arg="control"]');
    await click('[data-act="seg"][data-arg="valves"]');
    await shot('03-control-valves');
    await click('[data-act="set"][data-arg="V-102.POS"][data-val="0"]');
    await page.waitForSelector('.dialog');
    await shot('04-confirm');
    assert.notStrictEqual(gw.store.value('V-102.POS'), 0, 'nothing written before confirming');
    await click('[data-act="confirm"]');
    assert.ok(await until(() => gw.store.value('V-102.POS') === 0), 'valve closed on the gateway after confirm');
    const audit = gw.audit.list(10);
    assert.ok(audit.some((e) => e.tag === 'V-102.POS' && e.user === 'demo-operator' && e.result === 'ok'), 'audited under the user');

    // interlock: tank full → P-01 start is blocked
    gw.sim.force('V-103.POS', 0); gw.sim.force('T-1.LEVEL', 99);
    assert.ok(await until(() => gw.store.value('P-01.RUN') === false));
    await click('[data-act="seg"][data-arg="machines"]');
    await click('[data-act="set"][data-arg="P-01.RUN"][data-val="true"]');
    assert.ok(await until(async () => /Interlock/.test(await text())), 'interlock message shown');
    assert.strictEqual(await page.$('.dialog'), null, 'no confirm dialog for a blocked command');
    await shot('05-interlock');

    // SCADA mimic
    await click('[data-act="tab"][data-arg="scada"]');
    await page.waitForSelector('.mimic');
    await click('[data-act="sheet"][data-arg="P-02"]');
    await page.waitForSelector('.sheet');
    await shot('06-scada-sheet');
    await click('[data-act="close-sheet"]');

    // alarms → acknowledge
    await click('[data-act="tab"][data-arg="alerts"]');
    assert.ok(await until(async () => (await page.$$('[data-act="ack"]')).length > 0, 15000), 'an alarm is listed');
    await shot('07-alerts');
    const before = gw.alarms.active().filter((a) => !a.acked).length;
    await click('[data-act="ack"]');
    assert.ok(await until(() => gw.alarms.active().filter((a) => !a.acked).length < before), 'acknowledged on the gateway');

    // report
    await click('[data-act="tab"][data-arg="report"]');
    await page.waitForSelector('.devcard.gold');
    await shot('08-report');

    // settings → English + Light theme persist
    await click('[data-act="settings"]');
    await click('[data-act="lang"][data-arg="en"]');
    await click('[data-act="theme"][data-arg="light"]');
    await shot('09-settings-en-light');
    await click('[data-act="close-settings"]');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.ok(/Energy report/.test(await text()));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.hdr');
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'en', 'language remembered');
    await click('[data-act="tab"][data-arg="home"]');
    await shot('10-home-en-light');

    const own = failed.filter((u) => u.startsWith(base));
    assert.deepStrictEqual(own, [], 'no failed requests to the gateway');
    if (errors.length) console.log('# console errors (external):', errors, failed);
    assert.deepStrictEqual(errors.filter((e) => !/ERR_FAILED/.test(e) || own.length), []);
    // offline shell from the service worker cache
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.ok(await until(async () => (await page.$('#app')) !== null && /CoreDash/.test(await text())), 'app shell opens offline');
    assert.ok(await until(async () => /reconnecting|กำลังเชื่อมใหม่/.test(await text())), 'stays signed in and shows reconnecting');
    await shot('11-offline');
    await page.setOfflineMode(false);
  } finally {
    await browser.close();
    await gw.stop();
  }
});
