'use strict';
// Plant power model: the physics the executive view relies on.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'power-sim.js')).href);

test('power model: S² = P² + Q² + D², true PF = cos φ / √(1+THD²) per machine', async () => {
  const { plantAt } = await load();
  const x = plantAt(37, {}, 0);
  for (const r of x.ms) {
    assert.ok(Math.abs(r.S ** 2 - (r.P ** 2 + r.Q ** 2 + r.D ** 2)) < 1e-6 * Math.max(1, r.S ** 2), r.m.id + ' power balance');
    if (Math.abs(r.P) > 1) assert.ok(Math.abs(r.pf - r.cos / Math.sqrt(1 + r.thd ** 2)) < 1e-6, r.m.id + ' true PF');
  }
  const rec = x.ms.find((r) => r.m.id === 'REC-2');
  assert.ok(rec.cos < 0.7, 'SCR rectifier running below rated voltage has a poor displacement factor');
});

test('power model: measures move PF, kvar and THD the right way', async () => {
  const { averages, FIXES } = await load();
  const base = averages({});
  assert.ok(base.pf < 0.85 && base.bill.pf > 0, 'as-is plant pays a PF charge');
  const cap = averages({ cap: true });
  assert.ok(cap.cos >= 0.94 && cap.Q < base.Q * 0.6 && cap.bill.pf === 0, 'capacitor bank fixes displacement PF');
  const plain = averages({ cap: true, capPlain: true });
  assert.ok(plain.thd > cap.thd * 1.5, 'plain capacitors amplify harmonics (resonance)');
  const ahf = averages({ ahf: true });
  assert.ok(ahf.thd <= 0.06 && ahf.pf > base.pf, 'active filter cuts THD and lifts true PF');
  const afe = averages({ afe: true });
  assert.ok(afe.P < base.P, 'AFE drive saves energy (regeneration)');
  const all = averages(Object.fromEntries(FIXES.map((f) => [f.id, true])));
  assert.ok(all.pf > 0.95 && all.S < base.S * 0.85 && all.bill.total < base.bill.total, 'all measures: PF > 0.95, less kVA, lower bill');
});
