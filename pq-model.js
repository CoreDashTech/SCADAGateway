// CoreDash Nexus — power-quality model for three PW3198-class analysers (MAIN GRID, LOAD, APF).
// Shared by the PWA (demo mode) and the gateway simulator (SIMULATE=1), so both show the same plant.
//
// Physics: the plant load is a bank of 6-pulse rectifiers / VFDs (plating rectifiers, rolling-mill drives):
//   - fundamental current lags the voltage (displacement factor cos φ ≈ 0.84)
//   - characteristic harmonics h = 6k ± 1 (5, 7, 11, 13, …) plus a little 3rd from single-phase loads
// The active power filter (shunt APF) measures the load current and injects the opposite of its
// harmonics (and optionally of its reactive part), so the grid only supplies a near-sine in-phase current.
//   I_grid = I_load + I_apf          (KCL at the point of common coupling)
//   U_h    = U_bg,h + h·X1·I_grid,h  (source impedance is inductive → voltage distortion grows with h)

export const ORDERS = 50;
export const F0 = 50;
const SQ3 = Math.sqrt(3);
const D2R = Math.PI / 180;

// harmonic content of the load current, % of fundamental, and phase (deg) — typical 6-pulse bank with DC chokes
const LOAD_SPEC = { 3: [4.5, 30], 5: [27, 200], 7: [13, 15], 9: [1.2, 60], 11: [7.5, 230], 13: [5.2, 40], 17: [3.1, 260], 19: [2.4, 70], 23: [1.7, 290], 25: [1.4, 100], 29: [0.9, 320], 31: [0.8, 130], 35: [0.5, 350], 37: [0.45, 160] };
const BG_U = { 3: 0.8, 5: 2.3, 7: 1.3, 11: 0.6, 13: 0.4 }; // background voltage distortion already on the utility (%)

export const ROLES = [
  { id: 'PQ-MAIN', no: 2, role: 'grid', name: 'MAIN GRID', nameTh: 'แผงเมน (ฝั่งการไฟฟ้า)', color: '#38BDF8' },
  { id: 'PQ-LOAD', no: 3, role: 'load', name: 'LOAD', nameTh: 'โหลดไม่เชิงเส้น (เรกติไฟเออร์/VFD)', color: '#FB923C' },
  { id: 'PQ-APF', no: 6, role: 'apf', name: 'APF', nameTh: 'Active Power Filter (ชดเชย)', color: '#A78BFA' }
];

// deterministic pseudo-random
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const noise = (t, k) => Math.sin(t * 0.37 + k) * 0.5 + Math.sin(t * 0.113 + k * 2.1) * 0.3 + Math.sin(t * 1.7 + k * 0.7) * 0.2;

// production profile over the day: 0..1 (night 30%, shifts at 08–12 and 13–20, lunch dip)
export function loadProfile(hour) {
  const h = ((hour % 24) + 24) % 24;
  const shift = (a, b) => 1 / (1 + Math.exp(-(h - a) * 3)) * (1 / (1 + Math.exp((h - b) * 3)));
  return 0.32 + 0.6 * Math.max(shift(7.8, 12.1), shift(12.9, 20.2)) + 0.06 * Math.sin(h * 1.3);
}

// complex helpers  [re, im]
const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cScale = (a, k) => [a[0] * k, a[1] * k];
const cMag = (a) => Math.hypot(a[0], a[1]);
const cPol = (m, deg) => [m * Math.cos(deg * D2R), m * Math.sin(deg * D2R)];
const cArg = (a) => Math.atan2(a[1], a[0]) / D2R;

export class PqModel {
  constructor({ ratedA = 900, apfA = 600, x1 = 0.0105, seed = 7 } = {}) {
    this.ratedA = ratedA;      // load current at 100% production (A rms, fundamental)
    this.apfA = apfA;          // APF rating (A rms per phase)
    this.x1 = x1;              // source reactance at 50 Hz (Ω) → ~8–10% THDu at full load without APF
    this.apfOn = true;
    this.apfReactive = true;   // APF also compensates kvar (displacement) — most modern APFs can
    this.compRatio = 0.92;     // fraction of harmonic current the APF cancels
    this.rand = rng(seed);
    this.wh = { 'PQ-MAIN': 1.82e6, 'PQ-LOAD': 1.85e6, 'PQ-APF': 0 }; // WP+ kWh counters (start values)
    this.events = seedEvents(seed);
    this.t0 = Date.now();
  }

  // phasors (A peak-less: rms) per phase k (0,1,2) for each order h of the load current
  loadPhasors(level, t) {
    const ph = [];
    for (let k = 0; k < 3; k++) {
      const unb = [1, 0.965, 1.03][k];
      const I1 = this.ratedA * level * unb * (1 + 0.012 * noise(t, k));
      const cos = 0.84 + 0.02 * noise(t * 0.5, k + 4);
      const h = { 1: cPol(I1, -Math.acos(cos) / D2R - 120 * k) };
      for (const [n, [pct, deg]] of Object.entries(LOAD_SPEC)) {
        const o = Number(n);
        const m = I1 * pct / 100 * (1 + 0.06 * noise(t * 0.8, o + k));
        // order h of phase k rotates by h·(−120°·k); triplens are zero-sequence (in phase)
        h[o] = cPol(m, deg - 120 * k * o);
      }
      ph.push(h);
    }
    return ph;
  }

  // full snapshot of the three instruments at time ms
  snapshot(ms = Date.now(), { level: forced } = {}) {
    const t = ms / 1000;
    const hour = new Date(ms).getHours() + new Date(ms).getMinutes() / 60;
    const level = forced ?? loadProfile(hour) * (1 + 0.02 * noise(t * 0.2, 9));
    const load = this.loadPhasors(level, t);
    const apf = load.map((h, k) => {
      if (!this.apfOn) return {};
      const out = {};
      for (const [n, v] of Object.entries(h)) {
        const o = Number(n);
        if (o === 1) {
          if (!this.apfReactive) continue;
          const vAng = -120 * k; // phase voltage angle
          const rel = cArg(v) - vAng;
          const q = cMag(v) * Math.sin(rel * D2R); // quadrature part
          out[1] = cPol(-q * 0.9, vAng + 90);
          continue;
        }
        out[o] = cScale(v, -this.compRatio);
      }
      // rating limit: harmonics have priority, kvar compensation uses what is left of the rating
      const hk = Object.keys(out).filter((o) => o !== '1');
      const H = Math.sqrt(hk.reduce((a, o) => a + cMag(out[o]) ** 2, 0));
      if (H > this.apfA) for (const o of hk) out[o] = cScale(out[o], this.apfA / H);
      if (out[1]) { const room = Math.sqrt(Math.max(0, this.apfA ** 2 - Math.min(H, this.apfA) ** 2)); const m = cMag(out[1]); if (m > room) out[1] = cScale(out[1], room / m); }
      return out;
    });
    const grid = load.map((h, k) => {
      const out = {};
      for (const o of new Set([...Object.keys(h), ...Object.keys(apf[k])])) out[o] = cAdd(h[o] || [0, 0], apf[k][o] || [0, 0]);
      return out;
    });
    // voltage at the PCC (phase-to-neutral)
    const U = grid.map((h, k) => {
      const out = { 1: cPol(230 * (1 + 0.006 * noise(t * 0.3, k + 11)) - this.x1 * 0.45 * cMag(h[1]) * 0.25, -120 * k) };
      for (const [n, v] of Object.entries(h)) {
        const o = Number(n); if (o === 1) continue;
        const z = [0, this.x1 * o]; // jhX
        const drop = [-(z[1] * v[1]), z[1] * v[0]];
        out[o] = cAdd(drop, cPol(230 * (BG_U[o] || 0) / 100, (-120 * k * o) + 40 * o));
      }
      for (const [o, p] of Object.entries(BG_U)) if (!out[o]) out[o] = cPol(230 * p / 100, -120 * k * o + 40 * o);
      return out;
    });
    const dt = 1;
    const mk = (id, I) => this.measure(id, U, I, dt);
    return {
      ts: ms, level,
      apf: { on: this.apfOn, reactive: this.apfReactive, ratingA: this.apfA },
      instruments: { 'PQ-MAIN': mk('PQ-MAIN', grid), 'PQ-LOAD': mk('PQ-LOAD', load), 'PQ-APF': mk('PQ-APF', apf) },
      events: this.events
    };
  }

  // PW3198-style measurement: per-phase rms, P/Q/S, PF, cos φ, THD, K-factor, spectrum, one-cycle waveform
  measure(id, U, I, dtSec) {
    const ph = [0, 1, 2].map((k) => {
      const u = U[k], i = I[k] || {};
      const u1 = u[1] || [0, 0], i1 = i[1] || [0, 0];
      let P = 0, uh2 = 0, ih2 = 0, kf = 0, i2sum = 0;
      for (let o = 1; o <= ORDERS; o++) {
        const uo = u[o] || [0, 0], io = i[o] || [0, 0];
        P += uo[0] * io[0] + uo[1] * io[1];
        if (o > 1) { uh2 += cMag(uo) ** 2; ih2 += cMag(io) ** 2; }
        kf += cMag(io) ** 2 * o * o; i2sum += cMag(io) ** 2;
      }
      const Urms = Math.sqrt(cMag(u1) ** 2 + uh2), Irms = Math.sqrt(cMag(i1) ** 2 + ih2);
      const S = Urms * Irms;
      const Q1 = cMag(u1) * cMag(i1) * Math.sin((cArg(u1) - cArg(i1)) * D2R);
      const cos = cMag(i1) > 1e-6 ? Math.cos((cArg(u1) - cArg(i1)) * D2R) : 1;
      return {
        U: Urms, I: Irms, P, Q: Q1, S, D: Math.sqrt(Math.max(0, S * S - P * P - Q1 * Q1)),
        PF: S > 1e-6 ? Math.abs(P) / S : 1, cos,
        Uthd: cMag(u1) > 1e-6 ? Math.sqrt(uh2) / cMag(u1) * 100 : 0,
        Ithd: cMag(i1) > 1e-3 ? Math.sqrt(ih2) / cMag(i1) * 100 : (Irms > 0.5 ? 999 : 0),
        KF: i2sum > 0 ? kf / i2sum : 1,
        Uang: cArg(u1), Iang: cArg(i1), U1: cMag(u1), I1: cMag(i1),
        uh: Array.from({ length: ORDERS }, (_, n) => (cMag(u[n + 1] || [0, 0]))),
        ih: Array.from({ length: ORDERS }, (_, n) => (cMag(i[n + 1] || [0, 0]))),
        ua: Array.from({ length: ORDERS }, (_, n) => Math.round(cArg(u[n + 1] || [0, 0]))),
        ia: Array.from({ length: ORDERS }, (_, n) => Math.round(cArg(i[n + 1] || [0, 0])))
      };
    });
    // neutral: triplen currents add up
    let iN2 = 0;
    for (let o = 3; o <= ORDERS; o += 3) { let s = [0, 0]; for (const k of [0, 1, 2]) s = cAdd(s, (I[k] || {})[o] || [0, 0]); iN2 += cMag(s) ** 2; }
    let n1 = [0, 0]; for (const k of [0, 1, 2]) n1 = cAdd(n1, (I[k] || {})[1] || [0, 0]); iN2 += cMag(n1) ** 2;
    const sum = (f) => ph.reduce((a, p) => a + p[f], 0);
    const P = sum('P'), Q = sum('Q'), S = sum('S');
    const Uavg = sum('U') / 3, Umax = Math.max(...ph.map((p) => p.U)), Umin = Math.min(...ph.map((p) => p.U));
    this.wh[id] = (this.wh[id] || 0) + (P > 0 ? P : 0) / 1000 * dtSec / 3600;
    return {
      id, ph, P: P / 1000, Q: Q / 1000, S: S / 1000, PF: S > 0 ? Math.abs(P) / S : 1,
      cos: Math.cos(Math.atan2(Q, P)), f: F0 + 0.03 * Math.sin(Date.now() / 47000),
      Uavg, Ull: Uavg * SQ3, unb: (Math.max(Umax - Uavg, Uavg - Umin) / Uavg) * 100,
      IN: Math.sqrt(iN2), Ithd: Math.max(...ph.map((p) => Math.min(p.Ithd, 999))), Uthd: Math.max(...ph.map((p) => p.Uthd)),
      KF: Math.max(...ph.map((p) => p.KF)), WP: this.wh[id]
    };
  }

  // 24 h of 1-minute history for trend charts (APF switched on at apfFrom hour)
  history(endMs = Date.now(), { hours = 24, stepMin = 5, apfFrom = null } = {}) {
    const keep = [this.apfOn, this.wh];
    this.wh = { ...this.wh };
    const rows = [];
    for (let m = hours * 60; m >= 0; m -= stepMin) {
      const ms = endMs - m * 60000;
      if (apfFrom != null) this.apfOn = ms >= apfFrom;
      const s = this.snapshot(ms);
      const g = s.instruments['PQ-MAIN'], l = s.instruments['PQ-LOAD'], a = s.instruments['PQ-APF'];
      rows.push({ ts: ms, apf: this.apfOn, gP: g.P, gS: g.S, gPF: g.PF, gIthd: g.Ithd, gUthd: g.Uthd, gI: g.ph[0].I, lP: l.P, lS: l.S, lPF: l.PF, lIthd: l.Ithd, lI: l.ph[0].I, aI: a.ph[0].I });
    }
    [this.apfOn, this.wh] = keep;
    return rows;
  }
}

// time-domain samples of one cycle (n points) from a phasor spectrum (rms values)
export function waveform(spec, n = 128, cycles = 2) {
  const out = new Float32Array(n);
  for (let s = 0; s < n; s++) {
    const th = (s / n) * cycles * 2 * Math.PI;
    let v = 0;
    for (const [o, ph] of spec) v += Math.SQRT2 * ph[0] * Math.cos(o * th + ph[1] * D2R);
    out[s] = v;
  }
  return out;
}

// [order, [rms, deg]] list of one phase, for waveform()
export function spectrumOf(phase, kind) {
  const mags = kind === 'U' ? phase.uh : phase.ih, angs = (kind === 'U' ? phase.ua : phase.ia) || [];
  if (!mags) return [[1, [kind === 'U' ? phase.U || 0 : phase.I || 0, kind === 'U' ? phase.Uang || 0 : phase.Iang || 0]]];
  return mags.map((m, n) => [n + 1, [m, angs[n] || 0]]).filter(([, [m]]) => m > 1e-4);
}

function seedEvents(seed) {
  const r = rng(seed * 13), now = Date.now(), ev = [];
  const kinds = [
    ['dip', 'แรงดันตก (Dip)', 'Voltage dip', () => [0.55 + r() * 0.35, 40 + r() * 400]],
    ['swell', 'แรงดันเกิน (Swell)', 'Voltage swell', () => [1.1 + r() * 0.12, 20 + r() * 200]],
    ['tran', 'ทรานเซียนต์ (Transient)', 'Transient', () => [1.6 + r() * 1.8, 0.05 + r() * 0.8]],
    ['int', 'ไฟดับชั่วขณะ (Interruption)', 'Interruption', () => [0.02, 200 + r() * 900]]
  ];
  const pick = [0, 0, 0, 1, 2, 0, 2, 1, 0, 3, 0, 2];
  pick.forEach((k, j) => {
    const [mag, dur] = kinds[k][3]();
    ev.push({ id: 'EV' + (j + 1), ts: now - (j * 2.1 + r()) * 3600e3, kind: kinds[k][0], th: kinds[k][1], en: kinds[k][2], ch: ['U1', 'U2', 'U3', 'U12'][Math.floor(r() * 4)], mag, ms: dur, inst: j % 3 === 2 ? 'PQ-LOAD' : 'PQ-MAIN' });
  });
  return ev;
}

// ITIC (CBEMA) curve — acceptance envelope for IT equipment, % of nominal vs duration (ms)
export const ITIC_UPPER = [[0.001, 500], [0.003, 200], [1, 140], [3, 120], [20, 120], [500, 120], [500, 110], [1e4, 110], [1e5, 110]];
export const ITIC_LOWER = [[20, 0], [20, 70], [500, 70], [500, 80], [1e4, 80], [1e4, 90], [1e5, 90]];
export function iticVerdict(magPct, ms) {
  const interp = (curve) => { let y = curve[0][1]; for (const [x, v] of curve) if (ms >= x) y = v; return y; };
  if (magPct > 100) return magPct <= interp(ITIC_UPPER) ? 'ok' : 'out';
  if (ms < 20) return 'ok';
  return magPct >= interp(ITIC_LOWER) ? 'ok' : 'out';
}
