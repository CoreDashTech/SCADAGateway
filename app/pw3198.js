// Hioki PW3198 — live values over LAN (TCP port 3198, text commands).
// Verified on a real PW3198 (firmware 1.08, 2026-11-13):
//   :HEADer ON                        → every value comes back with its name
//   :MEASure:ITEM:POWer 159,255,255   → choose the values :MEASure? outputs (power, rms, THD, K-factor, unbalance …)
//   :MEASure?                         → "Status F00000,Freq 50.000E+00,U1rms 230.1E+00,…,I4harmH 0.0012E+00"
// "+9999.9E+99" means "no valid value" (e.g. no voltage connected) and is turned into null.
// Shared by the web app (live bridge from the field tool) and the gateway (src/pq/service.js).

export const PW3198 = {
  port: 3198,
  init: [':HEADer ON', ':MEASure:ITEM:POWer 159,255,255'],
  query: ':MEASure?'
};

// "Name value,Name value,…" → { NAME: number|null, … }  (names upper-cased; "U1thd-F" → "U1THD-F")
export function parsePw3198(line) {
  const out = {};
  for (const part of String(line || '').replace(/^﻿/, '').split(/[,;]/)) {
    const m = part.trim().match(/^([A-Za-z][\w+\-]*)\s+(\S+)$/);
    if (!m) continue;
    const k = m[1].toUpperCase();
    if (k === 'STATUS') { out.STATUS = m[2]; continue; }
    const v = Number(m[2]);
    out[k] = Number.isFinite(v) && Math.abs(v) < 9e37 ? v : null;
  }
  return out;
}

const ANG = [0, -120, 120];

// named values → the record shape the CoreDash screens use (same as pq-model.js measure()):
// per-phase P/Q/S in W/var/VA, totals in kW/kvar/kVA, PF as a magnitude (+ sign kept in pfSign).
export function pw3198Record(id, n) {
  const g = (k) => (n[k] == null ? null : n[k]);
  const ph = [1, 2, 3].map((k, i) => {
    const PF = g('PF' + k), Q = g('Q' + k);
    const lag = PF == null ? 0 : Math.acos(Math.min(1, Math.abs(PF))) * 180 / Math.PI * (Q != null && Q < 0 ? -1 : 1);
    return {
      U: g('U' + k + 'RMS'), I: g('I' + k + 'RMS'), P: g('P' + k), Q, S: g('S' + k),
      PF: PF == null ? null : Math.abs(PF), pfSign: PF == null ? null : Math.sign(PF), cos: null,
      Uthd: g('U' + k + 'THD-F'), Ithd: g('I' + k + 'THD-F'), KF: g('I' + k + 'RMS') > 0 ? g('KF' + k) : null,
      Upk: g('U' + k + 'PK+'), UpkN: g('U' + k + 'PK-'), Ipk: g('I' + k + 'PK+'),
      Uhf: g('U' + k + 'HARMH'), Ihf: g('I' + k + 'HARMH'),
      Uang: ANG[i], Iang: ANG[i] - lag
    };
  });
  // current far below the clamp range: the analyser reports THD-I = 0 and a meaningless K-factor (seen: THD-I 0.0, KF 69
  // at 25 A on a 5 kA range) — show neither, and say why
  for (const p of ph) if (p.Ithd === 0 && p.KF != null && p.KF > 20) { p.Ithd = null; p.KF = null; p.lowI = true; }
  const kilo = (v) => (v == null ? null : v / 1000);
  const max = (key) => { const v = ph.map((p) => p[key]).filter((x) => x != null); return v.length ? Math.max(...v) : null; };
  const PFs = g('PFSUM');
  return {
    id, ph, live: true, status: n.STATUS || null,
    P: kilo(g('PSUM')), Q: kilo(g('QSUM')), S: kilo(g('SSUM')),
    PF: PFs == null ? null : Math.abs(PFs), pfSign: PFs == null ? null : Math.sign(PFs), cos: null,
    f: g('FREQ'), Uavg: g('UAVGRMS'), Iavg: ph.every((p) => p.I != null) ? (ph[0].I + ph[1].I + ph[2].I) / 3 : g('IAVGRMS'),
    unb: g('UUNB'), Iunb: g('IUNB'), IN: g('I4RMS'), U4: g('U4RMS'),
    Ithd: max('Ithd'), Uthd: max('Uthd'), KF: max('KF'),
    lowI: ph.some((p) => p.lowI),
    noVoltage: [1, 2, 3].every((k) => !(g('U' + k + 'RMS') > 5))
  };
}
