// CoreDash Nexus — animated plant power view: electroplating shop + brass melting/rolling mill.
// Developed by CoreDash Technology. Electrical model in power-sim.js.
import { MACHINES, plantAt, capNeed, CAP_STEP, CAP_STEPS, TR_KVA, spectrum, currentAt } from './power-sim.js';

const f1 = (v) => v.toFixed(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pfColor = (pf) => (pf >= 0.9 ? '#22C55E' : pf >= 0.85 ? '#F59E0B' : '#EF4444');

// layout: terminal point (where the feeder lands) and tag centre for each machine
const POS = {
  'REC-1': { d: [584, 300], tag: [584, 276] }, 'REC-2': { d: [728, 300], tag: [700, 276] }, 'REC-3': { d: [800, 300], tag: [814, 276] },
  'HTR-1': { d: [470, 420], tag: [470, 398] }, 'SCB-1': { d: [812, 150], tag: [712, 176] }, 'PMP-1': { d: [880, 532], tag: [866, 594] },
  'IF-1': { d: [966, 412], tag: [966, 386] }, 'ANN-1': { d: [1096, 380], tag: [1096, 352] }, 'MILL-1': { d: [1300, 330], tag: [1300, 302] },
  'CL-1': { d: [1420, 452], tag: [1420, 412] }, 'HYD-1': { d: [1238, 528], tag: [1238, 594] }, 'CMP-1': { d: [1548, 452], tag: [1548, 594] },
  'CHL-1': { d: [1660, 384], tag: [1640, 352] }, 'LGT-1': { d: [1170, 150], tag: [1170, 214] }
};
const BUS_Y = 100;

export function createPowerView(sim, opts = {}) {
  const lang = opts.lang || (() => 'th');
  const onSelect = opts.onSelect || (() => {});
  const host = document.createElement('div');
  host.className = 'pw-scene';
  const s = [];
  s.push(`<defs>
    <linearGradient id="pw-cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6B26B"/><stop offset="0.5" stop-color="#B8651B"/><stop offset="1" stop-color="#7A3E0C"/></linearGradient>
    <linearGradient id="pw-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3A4560"/><stop offset="0.5" stop-color="#8C9AB8"/><stop offset="1" stop-color="#2B3550"/></linearGradient>
    <linearGradient id="pw-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE68A"/><stop offset="0.45" stop-color="#D4A017"/><stop offset="1" stop-color="#8A6508"/></linearGradient>
    <radialGradient id="pw-hot"><stop offset="0" stop-color="#FFF3B0"/><stop offset="0.35" stop-color="#FFB020"/><stop offset="1" stop-color="#FF5A00" stop-opacity="0"/></radialGradient>
    <radialGradient id="pw-lamp"><stop offset="0" stop-color="#FFF7D6" stop-opacity="0.9"/><stop offset="1" stop-color="#FFF7D6" stop-opacity="0"/></radialGradient>
    <linearGradient id="pw-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2338"/><stop offset="1" stop-color="#0B1120"/></linearGradient>
    <pattern id="pw-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#141E36" stroke-width="1"/></pattern>
    <filter id="pw-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect x="0" y="0" width="1700" height="640" fill="#0A0F1E"/><rect x="0" y="0" width="1700" height="640" fill="url(#pw-grid)"/>
  <rect x="0" y="560" width="1700" height="80" fill="url(#pw-floor)"/>`);
  // halls
  const hall = (x, w, label, id) => `<path d="M${x},560 L${x},150 L${x + w / 2},128 L${x + w},150 L${x + w},560" fill="#0E1528" stroke="#33415E" stroke-width="2"/><text x="${x + 14}" y="172" class="pw-hall" id="${id}">${label}</text>`;
  s.push(hall(410, 470, '', 'pw-h1'), hall(900, 580, '', 'pw-h2'));
  // lamps (LGT-1)
  for (const x of [470, 600, 730, 960, 1100, 1240, 1380]) s.push(`<g><line x1="${x}" y1="150" x2="${x}" y2="186" stroke="#475569" stroke-width="2"/><path d="M${x - 14},186 L${x + 14},186 L${x + 8},194 L${x - 8},194 Z" fill="#94A3B8"/><ellipse class="pw-lamp" cx="${x}" cy="250" rx="70" ry="64" fill="url(#pw-lamp)" opacity="0.3"/></g>`);
  // ---------- incoming supply: pole, transformer, MDB, capacitor bank, AHF
  s.push(`<g><line x1="40" y1="60" x2="40" y2="560" stroke="#64748B" stroke-width="6"/><line x1="18" y1="72" x2="62" y2="72" stroke="#64748B" stroke-width="4"/>${[22, 40, 58].map((x) => `<circle cx="${x}" cy="66" r="3" fill="#CBD5E1"/>`).join('')}<text x="40" y="50" class="pw-tag2" text-anchor="middle">22 kV</text><path d="M40,72 L40,90 L110,90 L110,380" fill="none" stroke="#94A3B8" stroke-width="2.5"/></g>`);
  s.push(`<g data-pw="sel" data-arg="PLANT"><rect id="pw-trglow" x="66" y="372" width="108" height="176" rx="14" fill="#F59E0B" opacity="0" filter="url(#pw-glow)"/>
    ${Array.from({ length: 7 }, (_, i) => `<rect x="${70 + i * 15}" y="398" width="9" height="140" rx="2" fill="url(#pw-steel)"/>`).join('')}
    <rect x="76" y="380" width="88" height="160" rx="6" fill="#4B5875" opacity="0.55" stroke="#94A3B8"/>${[90, 110, 130, 150].map((x) => `<rect x="${x - 4}" y="362" width="8" height="18" rx="2" fill="#CBD5E1"/>`).join('')}
    <text x="120" y="458" class="pw-big" text-anchor="middle">TR-1</text><text x="120" y="476" class="pw-tag2" text-anchor="middle">${TR_KVA} kVA</text>
    <rect x="80" y="512" width="80" height="10" rx="5" fill="#1E293B"/><rect id="pw-trbar" x="80" y="512" width="0" height="10" rx="5" fill="#22C55E"/><text id="pw-trpct" x="120" y="508" class="pw-tag2" text-anchor="middle">0 %</text></g>`);
  s.push(`<path d="M164,400 L200,400 L200,${BUS_Y} L245,${BUS_Y}" fill="none" stroke="url(#pw-cu)" stroke-width="10"/><path id="pw-f-main" d="M164,400 L200,400 L200,${BUS_Y} L245,${BUS_Y}" fill="none" stroke="#FDE68A" stroke-width="3" stroke-dasharray="8 14" opacity="0.9"/>`);
  // MDB with main power meter
  s.push(`<g data-pw="sel" data-arg="PLANT"><rect x="196" y="250" width="92" height="300" rx="6" fill="#1C2740" stroke="#64748B" stroke-width="2"/><rect x="204" y="262" width="76" height="66" rx="4" fill="#05080F" stroke="#334155"/>
    <text x="242" y="280" class="pw-lcd" text-anchor="middle" id="pw-m-kw">0 kW</text><text x="242" y="298" class="pw-lcd" text-anchor="middle" id="pw-m-kvar">0 kvar</text><text x="242" y="318" class="pw-lcd" text-anchor="middle" id="pw-m-pf">PF 0.00</text>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${206 + (i % 2) * 38}" y="${342 + Math.floor(i / 2) * 64}" width="34" height="56" rx="3" fill="#24324F" stroke="#3B4A6B"/><circle cx="${223 + (i % 2) * 38}" cy="${356 + Math.floor(i / 2) * 64}" r="3" fill="#22C55E"/>`).join('')}
    <text x="242" y="544" class="pw-tag2" text-anchor="middle">MDB</text></g>`);
  // capacitor bank
  s.push(`<g data-pw="info" data-arg="cap" id="pw-capg"><rect x="300" y="300" width="64" height="250" rx="6" fill="#1C2740" stroke="#64748B" stroke-width="2"/>
    ${Array.from({ length: CAP_STEPS }, (_, i) => `<g transform="translate(${314 + (i % 2) * 22},${318 + Math.floor(i / 2) * 34})"><rect x="-8" y="-8" width="16" height="26" rx="3" fill="#334155"/><circle id="pw-cap${i}" cx="0" cy="-12" r="4" fill="#1E293B"/></g>`).join('')}
    <text x="332" y="532" class="pw-tag2" text-anchor="middle">CAP</text><text id="pw-capkvar" x="332" y="294" class="pw-val" text-anchor="middle">0 kvar</text></g>
    <path d="M332,300 L332,${BUS_Y + 6}" stroke="#64748B" stroke-width="3"/><path id="pw-f-cap" d="M332,300 L332,${BUS_Y + 6}" stroke="#38BDF8" stroke-width="3" stroke-dasharray="6 10" opacity="0"/>`);
  // active harmonic filter
  s.push(`<g id="pw-ahfg" opacity="0.25"><rect x="372" y="380" width="30" height="170" rx="5" fill="#1C2740" stroke="#64748B" stroke-width="2"/><path id="pw-ahfwave" d="" fill="none" stroke="#A78BFA" stroke-width="2"/><text x="387" y="544" class="pw-tag2" text-anchor="middle">AHF</text></g><path d="M387,380 L387,${BUS_Y + 6}" stroke="#64748B" stroke-width="2" id="pw-ahfline" opacity="0.25"/>`);
  // main busbar
  s.push(`<rect x="240" y="${BUS_Y - 8}" width="1450" height="16" rx="4" fill="url(#pw-cu)"/><path id="pw-f-bus" d="M245,${BUS_Y} L1688,${BUS_Y}" stroke="#FFF1C1" stroke-width="3" stroke-dasharray="10 18" opacity="0.8"/><text x="250" y="${BUS_Y - 14}" class="pw-tag2">400 V BUS</text>`);
  // ---------- electroplating hall
  const TANKS = [{ c: '#4C6A8A', n: 'ล้างไขมัน' }, { c: '#1E6FB0', n: 'น้ำล้าง' }, { c: '#1F9D6B', n: 'Ni' }, { c: '#1E6FB0', n: 'น้ำล้าง' }, { c: '#C9A227', n: 'Cr' }, { c: '#B8862B', n: 'Cu-Zn' }];
  TANKS.forEach((tk, i) => {
    const x = 440 + i * 72;
    s.push(`<g><rect x="${x}" y="430" width="60" height="112" rx="4" fill="#0B1222" stroke="#7C8BAA" stroke-width="2"/><rect x="${x + 3}" y="446" width="54" height="93" rx="2" fill="${tk.c}" opacity="0.75"/><rect x="${x + 3}" y="446" width="54" height="6" fill="#FFFFFF" opacity="0.18"/>
      <g id="pw-bub${i}">${Array.from({ length: 7 }, (_, k) => `<circle cx="${x + 8 + k * 7}" cy="530" r="${1.5 + (k % 3) * 0.6}" fill="#E0F2FE" opacity="0"/>`).join('')}</g>
      <g id="pw-stm${i}" opacity="0">${[0, 1, 2].map((k) => `<path d="M${x + 14 + k * 16},428 q -6,-12 0,-24 q 6,-12 0,-24" fill="none" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`).join('')}</g>
      <text x="${x + 30}" y="556" class="pw-tag3" text-anchor="middle">${tk.n}</text></g>`);
  });
  // racks in process tanks (lowered when the rectifier runs)
  for (const [i, id] of [[2, 'REC-1'], [4, 'REC-2'], [5, 'REC-3']]) {
    const x = 440 + i * 72;
    s.push(`<g id="pw-rack-${id}"><line x1="${x + 30}" y1="380" x2="${x + 30}" y2="440" stroke="#94A3B8" stroke-width="2"/><rect x="${x + 12}" y="440" width="36" height="56" rx="3" fill="none" stroke="#E5E7EB" stroke-width="2"/>${[0, 1, 2].map((k) => `<rect x="${x + 16 + k * 10}" y="448" width="7" height="40" rx="2" fill="#CBD5E1"/>`).join('')}</g>`);
  }
  // hoist rail + trolley
  s.push(`<rect x="424" y="206" width="452" height="8" rx="3" fill="#475569"/><g id="pw-hoist"><rect x="-22" y="198" width="44" height="22" rx="4" fill="#F59E0B"/><circle cx="-12" cy="210" r="4" fill="#1E293B"/><circle cx="12" cy="210" r="4" fill="#1E293B"/><line id="pw-hcable" x1="0" y1="220" x2="0" y2="300" stroke="#CBD5E1" stroke-width="2"/><g id="pw-hload"><rect x="-16" y="300" width="32" height="40" rx="3" fill="none" stroke="#E5E7EB" stroke-width="2"/>${[0, 1, 2].map((k) => `<rect x="${-12 + k * 9}" y="306" width="6" height="28" rx="2" fill="#D4A017"/>`).join('')}</g></g>`);
  // rectifier cabinets + DC bus bars down to the tanks
  for (const id of ['REC-1', 'REC-2', 'REC-3']) {
    const [x] = POS[id].d;
    s.push(`<g data-pw="sel" data-arg="${id}"><rect x="${x - 28}" y="300" width="56" height="70" rx="5" fill="#1C2740" stroke="#7C8BAA" stroke-width="2"/><rect x="${x - 22}" y="308" width="44" height="18" rx="2" fill="#05080F"/><text id="pw-dc-${id}" x="${x}" y="321" class="pw-lcd2" text-anchor="middle">0 A</text>
      <g id="pw-scr-${id}">${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${x - 21 + k * 7}" y="334" width="5" height="10" rx="1" fill="#334155"/>`).join('')}</g><text x="${x}" y="362" class="pw-tag3" text-anchor="middle">${id}</text></g>
      <path d="M${x - 10},370 L${x - 10},428 M${x + 10},370 L${x + 10},428" stroke="url(#pw-cu)" stroke-width="5"/><path id="pw-dcf-${id}" d="M${x - 10},372 L${x - 10},428" stroke="#FDE68A" stroke-width="2" stroke-dasharray="4 7" opacity="0"/>`);
  }
  // scrubber fan on the roof + duct
  s.push(`<path d="M460,428 L460,388 L860,388 L860,240 L812,240 L812,168" fill="none" stroke="#475569" stroke-width="10" stroke-linejoin="round"/><g data-pw="sel" data-arg="SCB-1"><circle cx="812" cy="150" r="22" fill="#1C2740" stroke="#7C8BAA" stroke-width="2"/><g transform="translate(812,150)"><g id="pw-fan">${[0, 90, 180, 270].map((a) => `<path d="M0,0 C6,-6 6,-16 0,-18 C-4,-14 -4,-6 0,0" fill="#94A3B8" transform="rotate(${a})"/>`).join('')}</g></g></g><g id="pw-fume" opacity="0">${[0, 1, 2].map((k) => `<circle cx="${806 + k * 6}" cy="${118 - k * 10}" r="${6 + k * 2}" fill="#94A3B8" opacity="${0.35 - k * 0.1}"/>`).join('')}</g>`);
  // filter pumps
  s.push(`<g data-pw="sel" data-arg="PMP-1">${[0, 1].map((k) => `<g transform="translate(${862 + k * 0},${532 + k * 0})"><rect x="-12" y="${-8 + k * 0}" width="34" height="22" rx="4" fill="#1F5FFF" opacity="0.85"/><circle cx="-12" cy="3" r="9" fill="#2B3A5E" stroke="#93C5FD"/><g transform="translate(-12,3)"><g id="pw-pmp${k}">${[0, 120, 240].map((a) => `<line x1="0" y1="0" x2="0" y2="-7" stroke="#E0F2FE" stroke-width="2" transform="rotate(${a})"/>`).join('')}</g></g></g>`).slice(0, 1).join('')}</g>`);
  // ---------- brass hall: induction furnace
  s.push(`<g data-pw="sel" data-arg="IF-1"><g id="pw-if" transform="rotate(0 1004 470)"><path d="M930,420 L1002,420 L996,536 L936,536 Z" fill="#3A2A1E" stroke="#A16207" stroke-width="2"/>
      ${Array.from({ length: 8 }, (_, k) => `<rect x="${930 + k * 0.6}" y="${434 + k * 12}" width="${72 - k * 1.3}" height="6" rx="3" fill="url(#pw-cu)" id="pw-ifc${k}"/>`).join('')}
      <ellipse cx="966" cy="422" rx="34" ry="8" fill="#FF8A00" id="pw-melt"/><ellipse cx="966" cy="422" rx="44" ry="20" fill="url(#pw-hot)" id="pw-meltglow" opacity="0.6"/></g>
      <path id="pw-pour" d="M1004,424 Q1024,440 1030,520" fill="none" stroke="#FFB020" stroke-width="6" stroke-linecap="round" opacity="0" filter="url(#pw-glow)"/>
      <rect x="1012" y="520" width="44" height="26" rx="3" fill="#2A2F3A" stroke="#64748B"/><rect id="pw-ingot" x="1016" y="540" width="36" height="0" fill="#FFB020"/>
      <g id="pw-spark">${Array.from({ length: 6 }, (_, k) => `<circle cx="${950 + k * 6}" cy="412" r="1.6" fill="#FFE08A"/>`).join('')}</g></g>`);
  // annealing furnace
  s.push(`<g data-pw="sel" data-arg="ANN-1"><rect x="1040" y="380" width="112" height="100" rx="6" fill="#2B3142" stroke="#94A3B8" stroke-width="2"/><rect x="1054" y="398" width="84" height="54" rx="4" fill="#120A06"/><rect id="pw-annwin" x="1054" y="398" width="84" height="54" rx="4" fill="#FF6A00" opacity="0.2"/>
      ${[0, 1, 2, 3].map((k) => `<path d="M1060,${406 + k * 12} q 9,-6 18,0 t 18,0 t 18,0 t 18,0" fill="none" stroke="#FFB020" stroke-width="2" id="pw-annc${k}" opacity="0.4"/>`).join('')}
      <rect x="1050" y="480" width="10" height="66" fill="#475569"/><rect x="1132" y="480" width="10" height="66" fill="#475569"/><text x="1096" y="470" class="pw-tag3" text-anchor="middle">ANN-1</text></g>`);
  // rolling line: uncoiler, mill stand, coiler, strip
  s.push(`<g data-pw="sel" data-arg="CL-1"><circle cx="1180" cy="500" r="8" fill="#475569"/><circle id="pw-coilA" cx="1180" cy="500" r="30" fill="url(#pw-brass)" stroke="#8A6508" stroke-width="1.5"/><g transform="translate(1180,500)"><line id="pw-coilAs" x1="0" y1="0" x2="0" y2="-26" stroke="#7A5A08" stroke-width="2"/></g>
      <circle cx="1420" cy="500" r="8" fill="#475569"/><circle id="pw-coilB" cx="1420" cy="500" r="30" fill="url(#pw-brass)" stroke="#8A6508" stroke-width="1.5"/><g transform="translate(1420,500)"><line id="pw-coilBs" x1="0" y1="0" x2="0" y2="-26" stroke="#7A5A08" stroke-width="2"/></g>
      <rect x="1166" y="530" width="28" height="30" fill="#334155"/><rect x="1406" y="530" width="28" height="30" fill="#334155"/></g>
    <line id="pw-stripA" x1="1180" y1="470" x2="1300" y2="500" stroke="#E8C547" stroke-width="3"/><line id="pw-stripB" x1="1300" y1="500" x2="1420" y2="470" stroke="#F2D46B" stroke-width="3"/>
    <line id="pw-stripF" x1="1180" y1="470" x2="1420" y2="470" stroke="#FFF4C2" stroke-width="2" stroke-dasharray="3 9" opacity="0"/>
    <g data-pw="sel" data-arg="MILL-1"><rect x="1262" y="410" width="12" height="150" fill="url(#pw-steel)"/><rect x="1326" y="410" width="12" height="150" fill="url(#pw-steel)"/><rect x="1262" y="404" width="76" height="12" rx="3" fill="#64748B"/>
      ${[[468, 22], [489, 10], [511, 10], [532, 22]].map(([y, r], k) => `<circle cx="1300" cy="${y}" r="${r}" fill="${r > 15 ? '#5B6680' : '#C0C8D8'}" stroke="#1E293B" stroke-width="1.5"/><g transform="translate(1300,${y})"><line id="pw-roll${k}" x1="0" y1="0" x2="0" y2="${-r + 2}" stroke="#1E293B" stroke-width="2"/></g>`).join('')}
      <rect x="1270" y="330" width="60" height="46" rx="6" fill="#1F5FFF" opacity="0.9"/><rect x="1276" y="336" width="48" height="34" rx="4" fill="none" stroke="#93C5FD"/>${[0, 1, 2, 3, 4].map((k) => `<line x1="${1280 + k * 10}" y1="336" x2="${1280 + k * 10}" y2="370" stroke="#93C5FD" stroke-width="1"/>`).join('')}
      <line x1="1300" y1="376" x2="1300" y2="404" stroke="#94A3B8" stroke-width="5"/><g transform="translate(1340,353)"><circle r="10" fill="#0F172A" stroke="#93C5FD"/><g id="pw-millfan">${[0, 90, 180, 270].map((a) => `<line x1="0" y1="0" x2="0" y2="-8" stroke="#E0F2FE" stroke-width="2" transform="rotate(${a})"/>`).join('')}</g></g>
      <text id="pw-millrpm" x="1358" y="346" class="pw-val" text-anchor="start"></text></g>`);
  // hydraulic unit
  s.push(`<g data-pw="sel" data-arg="HYD-1"><rect x="1214" y="522" width="52" height="34" rx="4" fill="#B91C1C" opacity="0.85"/><rect x="1220" y="510" width="20" height="14" rx="3" fill="#475569"/><circle cx="1252" cy="516" r="7" fill="#E5E7EB"/><line id="pw-hydn" x1="1252" y1="516" x2="1252" y2="510" stroke="#B91C1C" stroke-width="2"/></g>`);
  // utility yard: compressor + receiver, cooling tower
  s.push(`<g data-pw="sel" data-arg="CMP-1"><rect x="1506" y="456" width="86" height="96" rx="6" fill="#0E7490" stroke="#67E8F9" stroke-width="1.5"/><rect x="1514" y="466" width="40" height="22" rx="3" fill="#05080F"/><text id="pw-cmpst" x="1534" y="481" class="pw-lcd2" text-anchor="middle">LOAD</text>
      <g transform="translate(1570,516)"><circle r="16" fill="#155E75" stroke="#67E8F9"/><g id="pw-cmpfan">${[0, 72, 144, 216, 288].map((a) => `<path d="M0,0 L3,-14 L-3,-14 Z" fill="#CFFAFE" transform="rotate(${a})"/>`).join('')}</g></g>
      <rect x="1600" y="470" width="20" height="82" rx="10" fill="#94A3B8"/><text x="1610" y="464" class="pw-tag3" text-anchor="middle">AR</text></g>
    <g data-pw="sel" data-arg="CHL-1"><path d="M1632,550 L1640,400 L1684,400 L1692,550 Z" fill="#1E3A5F" stroke="#7DD3FC" stroke-width="1.5"/>${[0, 1, 2, 3].map((k) => `<line x1="${1638 + k}" y1="${430 + k * 30}" x2="${1686 - k}" y2="${430 + k * 30}" stroke="#7DD3FC" stroke-width="1" opacity="0.5"/>`).join('')}
      <rect x="1644" y="388" width="36" height="12" rx="3" fill="#334155"/><g transform="translate(1662,386)"><ellipse rx="20" ry="5" fill="#0F172A"/><g id="pw-ctfan">${[0, 60, 120].map((a) => `<rect x="-19" y="-1.5" width="38" height="3" rx="1.5" fill="#CBD5E1" transform="rotate(${a}) scale(1,0.3)"/>`).join('')}</g></g>
      <g id="pw-vapor" opacity="0">${[0, 1, 2].map((k) => `<circle cx="${1656 + k * 6}" cy="${360 - k * 12}" r="${8 + k * 3}" fill="#E2E8F0" opacity="${0.3 - k * 0.08}"/>`).join('')}</g></g>`);
  // feeders + tags
  for (const m of MACHINES) {
    const p = POS[m.id], [dx, dy] = p.d;
    s.push(`<path d="M${dx},${BUS_Y + 8} L${dx},${dy}" stroke="#3B4A6B" stroke-width="4"/><path id="pw-fd-${m.id}" d="M${dx},${BUS_Y + 8} L${dx},${dy}" stroke="#4ADE80" stroke-width="3" stroke-dasharray="6 10" opacity="0.9"/><path id="pw-fq-${m.id}" d="M${dx + 4},${BUS_Y + 8} L${dx + 4},${dy}" stroke="#FB923C" stroke-width="2" stroke-dasharray="3 9" opacity="0.9"/>`);
  }
  for (const m of MACHINES) {
    const [tx, ty] = POS[m.id].tag;
    s.push(`<g class="pw-tagg" data-pw="sel" data-arg="${m.id}" transform="translate(${tx - 50},${ty - 17})"><rect id="pw-tagbox-${m.id}" width="100" height="34" rx="8" fill="#0B1222" fill-opacity="0.92" stroke="#3B4A6B" stroke-width="1.5"/><circle id="pw-dot-${m.id}" cx="11" cy="11" r="5" fill="#22C55E"/><text x="20" y="15" class="pw-tid">${m.id}</text><text id="pw-kw-${m.id}" x="94" y="15" class="pw-tkw" text-anchor="end">0 kW</text><text id="pw-pf-${m.id}" x="8" y="28" class="pw-tpf">PF —</text></g>`);
  }
  host.innerHTML = `<div class="pw-scroll"><svg class="pw-svg" viewBox="0 30 1700 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plant power simulation">${s.join('')}</svg></div>`;
  const svg = host.querySelector('svg');
  const $ = (id) => svg.querySelector('#' + id);
  svg.addEventListener('click', (ev) => { const g = ev.target.closest('[data-pw="sel"]'); if (g) onSelect(g.dataset.arg); });

  // ---------- dashboard (gauges, triangle, scope, spectrum, trend)
  const dash = document.createElement('div');
  dash.className = 'pw-dash';
  dash.innerHTML = `
    <div class="pw-kpis" id="pwk"></div>
    <div class="pw-panels">
      <section class="pw-card"><h3 data-t="gauge"></h3><svg viewBox="0 0 260 186" class="pw-gauge" id="pw-gauge"></svg><div class="pw-leg" id="pw-gleg"></div></section>
      <section class="pw-card"><h3 data-t="tri"></h3><svg viewBox="0 0 300 220" class="pw-tri" id="pw-tri"></svg><div class="pw-leg" id="pw-tleg"></div></section>
      <section class="pw-card pw-scopec"><h3><span data-t="scope"></span> · <b id="pw-scopet"></b></h3><svg viewBox="0 0 520 200" class="pw-scope" id="pw-scope"></svg><div class="pw-leg" id="pw-sleg"></div></section>
      <section class="pw-card"><h3 data-t="spec"></h3><svg viewBox="0 0 300 170" class="pw-spec" id="pw-spec"></svg><div class="pw-leg" id="pw-spleg"></div></section>
      <section class="pw-card pw-trendc"><h3 data-t="trend"></h3><svg viewBox="0 0 900 170" class="pw-trend" id="pw-trend"></svg><div class="pw-leg" id="pw-trleg"></div></section>
    </div>`;
  const D = (id) => dash.querySelector('#' + id);
  const TX = {
    th: { gauge: 'เพาเวอร์แฟกเตอร์รวมโรงงาน', tri: 'สามเหลี่ยมกำลัง (P · Q · D → S)', scope: 'ออสซิลโลสโคป แรงดัน/กระแส', spec: 'สเปกตรัมฮาร์มอนิกกระแส', trend: 'แนวโน้ม 2 นาทีล่าสุด',
      P: 'กำลังจริง P', Q: 'กำลังรีแอกทีฟ Q', D: 'กำลังบิดเบือน D', S: 'กำลังปรากฏ S', cos: 'cos φ (displacement)', pf: 'PF จริง', thd: 'THD-I', tr: 'โหลดหม้อแปลง', I: 'กระแสรวม', plant: 'ทั้งโรงงาน (MDB)', disp: 'cos φ', true: 'PF จริง', V: 'แรงดัน', Ic: 'กระแส', cap: 'คาปาซิเตอร์', limit: 'เกณฑ์แนะนำ', fund: 'ฐาน', reg: 'คืนพลังงาน (Regen)' },
    en: { gauge: 'Plant power factor', tri: 'Power triangle (P · Q · D → S)', scope: 'Oscilloscope voltage/current', spec: 'Current harmonic spectrum', trend: 'Last 2 minutes',
      P: 'Active P', Q: 'Reactive Q', D: 'Distortion D', S: 'Apparent S', cos: 'cos φ (displacement)', pf: 'True PF', thd: 'THD-I', tr: 'Transformer load', I: 'Total current', plant: 'Whole plant (MDB)', disp: 'cos φ', true: 'True PF', V: 'Voltage', Ic: 'Current', cap: 'Capacitors', limit: 'Guide limit', fund: 'fund.', reg: 'Regenerating' }
  };
  let lastLang = '';
  function texts() { const L = TX[lang()] || TX.th; dash.querySelectorAll('[data-t]').forEach((e) => { e.textContent = L[e.dataset.t]; }); return L; }

  // gauge geometry: 0.5 … 1.0 over 180°
  const gAng = (pf) => Math.PI * (1 - clamp((pf - 0.5) / 0.5, 0, 1));
  const gPt = (pf, r) => [130 + Math.cos(gAng(pf)) * r, 140 - Math.sin(gAng(pf)) * r];
  const arc = (a, b, r, c) => { const [x1, y1] = gPt(a, r), [x2, y2] = gPt(b, r); return `<path d="M${f1(x1)},${f1(y1)} A${r},${r} 0 0 1 ${f1(x2)},${f1(y2)}" stroke="${c}" stroke-width="14" fill="none"/>`; };
  D('pw-gauge').innerHTML = arc(0.5, 0.85, 100, '#EF4444') + arc(0.85, 0.9, 100, '#F59E0B') + arc(0.9, 1, 100, '#22C55E')
    + [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1].map((v) => { const [x1, y1] = gPt(v, 84), [x2, y2] = gPt(v, 92), [tx, ty] = gPt(v, 72); return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="#94A3B8" stroke-width="1.5"/><text x="${f1(tx)}" y="${f1(ty + 4)}" font-size="10" fill="#94A3B8" text-anchor="middle">${v.toFixed(2).replace(/0$/, '')}</text>`; }).join('')
    + `<line id="pw-gn2" x1="130" y1="140" x2="130" y2="50" stroke="#38BDF8" stroke-width="3" stroke-linecap="round" opacity="0.7"/><line id="pw-gn" x1="130" y1="140" x2="130" y2="44" stroke="#F8FAFC" stroke-width="4" stroke-linecap="round"/><circle cx="130" cy="140" r="7" fill="#F8FAFC"/>
       <text id="pw-gv" x="130" y="176" font-size="26" font-weight="700" text-anchor="middle" fill="#F8FAFC" font-family="'Space Grotesk',sans-serif">0.00</text>`;
  D('pw-scope').innerHTML = `${Array.from({ length: 11 }, (_, i) => `<line x1="${10 + i * 50}" y1="10" x2="${10 + i * 50}" y2="190" stroke="#1C2850"/>`).join('')}${Array.from({ length: 5 }, (_, i) => `<line x1="10" y1="${10 + i * 45}" x2="510" y2="${10 + i * 45}" stroke="${i === 2 ? '#334155' : '#1C2850'}"/>`).join('')}
    <path id="pw-sv" d="" fill="none" stroke="#38BDF8" stroke-width="2.2"/><path id="pw-si1" d="" fill="none" stroke="#FB923C" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.6"/><path id="pw-si" d="" fill="none" stroke="#F97316" stroke-width="2.6"/>
    <path id="pw-sphi" d="" stroke="#E2E8F0" stroke-width="1.5" fill="none"/><text id="pw-sphit" x="0" y="0" font-size="12" fill="#E2E8F0" font-weight="700"></text>`;
  let ph = 0, raf = 0, alive = true, last = performance.now(), lastPanel = 0;
  const trend = []; let trendT = 0;
  for (let i = 120; i >= 1; i--) { const p = plantAt(sim.t - i, sim.fx, 0); trend.push({ P: p.P, Q: p.Q, S: p.S, pf: p.pf }); }
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    sim.tick(dt);
    const x = sim.now; if (!x) return;
    ph += dt;
    trendT += dt;
    if (trendT >= 1) { trendT = 0; trend.push({ P: x.P, Q: x.Q, S: x.S, pf: x.pf }); if (trend.length > 120) trend.shift(); }
    if (host.isConnected) drawScene(x, now / 1000, dt);
    if (dash.isConnected && now - lastPanel > 90) { lastPanel = now; drawDash(x); }
  }
  // ---------- scene animation
  let hoistX = 470, coilA = 0.6, strip = 0, fanA = 0, cmpA = 0, ctA = 0, pmpA = 0, rollA = 0;
  function drawScene(x, t, dt) {
    const L = TX[lang()] || TX.th;
    if (lastLang !== lang()) { lastLang = lang(); $('pw-h1').textContent = lang() === 'th' ? 'โรงชุบโลหะ (Electroplating)' : 'Electroplating shop'; $('pw-h2').textContent = lang() === 'th' ? 'โรงหลอมและรีดทองเหลือง' : 'Brass melting & rolling mill'; texts(); }
    const byId = Object.fromEntries(x.ms.map((r) => [r.m.id, r]));
    const flow = (id, rate) => { const el = $(id); if (el) el.setAttribute('stroke-dashoffset', f1((-t * rate) % 1000)); };
    flow('pw-f-bus', 40 + x.S / 8); flow('pw-f-main', 40 + x.S / 8);
    $('pw-f-bus').setAttribute('stroke-width', f1(2 + x.S / 220));
    for (const r of x.ms) {
      const id = r.m.id, fd = $('pw-fd-' + id), fq = $('pw-fq-' + id);
      const sp = 10 + Math.abs(r.P) * 0.6;
      fd.setAttribute('stroke-dashoffset', f1(((r.P >= 0 ? -1 : 1) * t * sp) % 1000));
      fd.setAttribute('stroke', r.P < 0 ? '#38BDF8' : '#4ADE80');
      fd.setAttribute('stroke-width', f1(1.5 + Math.min(6, Math.abs(r.P) / 40)));
      fd.setAttribute('opacity', Math.abs(r.P) > 0.5 ? '0.95' : '0.15');
      fq.setAttribute('stroke-dashoffset', f1(((Math.sin(t * 3) > 0 ? -1 : 1) * t * 18) % 1000));
      fq.setAttribute('stroke-width', f1(1 + Math.min(5, r.Q / 30)));
      fq.setAttribute('opacity', r.Q > 1 ? '0.9' : '0');
      const c = pfColor(r.pf);
      $('pw-dot-' + id).setAttribute('fill', c);
      $('pw-kw-' + id).textContent = `${r.P < 0 ? '↺ ' : ''}${Math.round(r.P)} kW`;
      $('pw-pf-' + id).textContent = `PF ${r.pf.toFixed(2)} · ${Math.round(r.Q)} kvar`;
      $('pw-pf-' + id).setAttribute('fill', c);
      $('pw-tagbox-' + id).setAttribute('stroke', sim.selected === id ? '#F8FAFC' : r.pf < 0.85 && Math.abs(r.P) > 2 ? '#EF4444' : '#3B4A6B');
    }
    // transformer + meter
    const ld = x.S / TR_KVA;
    $('pw-trbar').setAttribute('width', f1(80 * clamp(ld, 0, 1))); $('pw-trbar').setAttribute('fill', ld > 0.8 ? '#EF4444' : ld > 0.6 ? '#F59E0B' : '#22C55E');
    $('pw-trpct').textContent = `${Math.round(ld * 100)} %`;
    $('pw-trglow').setAttribute('opacity', f1(clamp((ld - 0.45) * 1.4, 0, 0.6) * (0.75 + 0.25 * Math.sin(t * 4))));
    $('pw-m-kw').textContent = `${Math.round(x.P)} kW`; $('pw-m-kvar').textContent = `${Math.round(x.Q)} kvar`; $('pw-m-pf').textContent = `PF ${x.pf.toFixed(2)}`;
    $('pw-m-pf').setAttribute('fill', pfColor(x.pf));
    // capacitor bank + AHF
    for (let i = 0; i < CAP_STEPS; i++) $('pw-cap' + i).setAttribute('fill', i < sim.capSteps ? '#38BDF8' : '#1E293B');
    $('pw-capkvar').textContent = sim.fx.cap ? `${sim.capSteps * CAP_STEP} kvar` : '—';
    $('pw-capg').setAttribute('opacity', sim.fx.cap ? '1' : '0.3');
    $('pw-f-cap').setAttribute('opacity', sim.capSteps ? '0.9' : '0'); flow('pw-f-cap', 30);
    $('pw-ahfg').setAttribute('opacity', sim.fx.ahf ? '1' : '0.25'); $('pw-ahfline').setAttribute('opacity', sim.fx.ahf ? '1' : '0.25');
    $('pw-ahfwave').setAttribute('d', '');
    if (sim.fx.ahf) $('pw-ahfwave').setAttribute('d', Array.from({ length: 22 }, (_, k) => `${k ? 'L' : 'M'}${f1(377 + k)},${f1(450 + Math.sin(k * 1.4 + t * 14) * 8)}`).join(' '));
    // lamps
    svg.querySelectorAll('.pw-lamp').forEach((e, i) => e.setAttribute('opacity', f1(0.22 + 0.04 * Math.sin(t * 50 + i))));
    // plating: racks, bubbles, rectifier displays, SCR firing lights
    for (const [i, id] of [[2, 'REC-1'], [4, 'REC-2'], [5, 'REC-3']]) {
      const r = byId[id]; const k = r.act;
      $('pw-rack-' + id).setAttribute('transform', `translate(0,${f1(-48 * (1 - k))})`);
      $('pw-dc-' + id).textContent = `${Math.round(r.extra.I)} A`;
      const g = $('pw-bub' + i); [...g.children].forEach((c, j) => { const y = 530 - ((t * 40 + j * 13) % 80); c.setAttribute('cy', f1(y)); c.setAttribute('opacity', f1(k * 0.8 * (1 - (530 - y) / 90))); });
      const scr = $('pw-scr-' + id); [...scr.children].forEach((c, j) => c.setAttribute('fill', k > 0.05 && Math.floor(t * 18) % 6 === j ? (sim.fx.igbt ? '#A78BFA' : '#FDE047') : '#334155'));
      const dcf = $('pw-dcf-' + id); dcf.setAttribute('opacity', k > 0.05 ? '1' : '0'); dcf.setAttribute('stroke-dashoffset', f1((-t * 30) % 100));
    }
    const htr = byId['HTR-1'].act;
    for (const i of [0, 2]) { const g = $('pw-stm' + i); g.setAttribute('opacity', f1(htr * (0.5 + 0.3 * Math.sin(t * 2 + i)))); g.setAttribute('transform', `translate(0,${f1(-((t * 10) % 12))})`); }
    // hoist: tank to tank every 15 s
    const step = Math.floor(t / 15) % 6, cyc = (t % 15) / 15, target = 470 + step * 72;
    hoistX += (target - hoistX) * Math.min(1, dt * 1.6);
    const low = cyc > 0.35 && cyc < 0.75 ? 1 : 0;
    $('pw-hoist').setAttribute('transform', `translate(${f1(hoistX)},0)`);
    const drop = 100 * low; $('pw-hcable').setAttribute('y2', f1(300 + drop)); $('pw-hload').setAttribute('transform', `translate(0,${f1(drop)})`);
    fanA = (fanA + dt * 720 * byId['SCB-1'].act) % 360; $('pw-fan').setAttribute('transform', `rotate(${f1(fanA)})`);
    $('pw-fume').setAttribute('transform', `translate(0,${f1(-((t * 14) % 20))})`); $('pw-fume').setAttribute('opacity', '0.8');
    pmpA = (pmpA + dt * 900) % 360; const pm = $('pw-pmp0'); if (pm) pm.setAttribute('transform', `rotate(${f1(pmpA)})`);
    // induction furnace
    const fr = byId['IF-1'], st = fr.extra.st, heat = fr.act;
    $('pw-melt').setAttribute('fill', st === 'charge' ? '#7C3A12' : heat > 0.5 ? '#FFB020' : '#FF7A00');
    $('pw-meltglow').setAttribute('opacity', f1(clamp(heat, 0.1, 1) * (0.7 + 0.3 * Math.sin(t * 9))));
    for (let k = 0; k < 8; k++) $('pw-ifc' + k).setAttribute('opacity', f1(0.7 + 0.3 * heat * Math.sin(t * 30 + k)));
    const tilt = st === 'pour' ? Math.sin(Math.min(1, fr.extra.pour * 2) * Math.PI / 2) * 28 : 0;
    $('pw-if').setAttribute('transform', `rotate(${f1(tilt)} 1004 470)`);
    $('pw-pour').setAttribute('opacity', tilt > 10 ? '0.95' : '0');
    $('pw-ingot').setAttribute('height', f1(st === 'pour' ? 22 * fr.extra.pour : st === 'charge' ? 0 : 22)); $('pw-ingot').setAttribute('y', f1(544 - (st === 'pour' ? 22 * fr.extra.pour : st === 'charge' ? 0 : 22)));
    $('pw-ingot').setAttribute('fill', st === 'pour' ? '#FFB020' : '#8A6508');
    [...$('pw-spark').children].forEach((c, j) => { const a = (t * 2 + j * 0.37) % 1; c.setAttribute('cy', f1(412 - a * 40)); c.setAttribute('cx', f1(944 + j * 9 + Math.sin(j * 7 + t) * 6)); c.setAttribute('opacity', f1(heat > 0.5 ? 1 - a : 0)); });
    // annealing furnace
    const an = byId['ANN-1'];
    $('pw-annwin').setAttribute('opacity', f1(0.15 + an.act * 0.7 * (sim.fx.burst ? (Math.sin(t * 3) > 0 ? 1 : 0.6) : 1)));
    for (let k = 0; k < 4; k++) $('pw-annc' + k).setAttribute('opacity', f1(0.25 + an.act * 0.75));
    // rolling mill
    const ml = byId['MILL-1'], spd = ml.extra.s;
    strip += spd * dt * 120; rollA = (rollA + spd * dt * 900) % 360;
    coilA = clamp(coilA - spd * dt * 0.02, 0.15, 0.95);
    const rA = 14 + 26 * coilA, rB = 14 + 26 * (1.1 - coilA);
    $('pw-coilA').setAttribute('r', f1(rA)); $('pw-coilB').setAttribute('r', f1(rB));
    $('pw-coilAs').setAttribute('transform', `rotate(${f1(strip * 3)})`); $('pw-coilAs').setAttribute('y2', f1(-rA + 3));
    $('pw-coilBs').setAttribute('transform', `rotate(${f1(strip * 3)})`); $('pw-coilBs').setAttribute('y2', f1(-rB + 3));
    $('pw-stripA').setAttribute('y1', f1(500 - rA)); $('pw-stripB').setAttribute('y2', f1(500 - rB));
    for (let k = 0; k < 4; k++) $('pw-roll' + k).setAttribute('transform', `rotate(${f1((k % 2 ? -1 : 1) * rollA * (k === 0 || k === 3 ? 0.45 : 1))})`);
    $('pw-millfan').setAttribute('transform', `rotate(${f1(rollA * 2)})`);
    $('pw-millrpm').textContent = ml.P < 0 ? L.reg : `${Math.round(Math.abs(spd) * 600)} rpm ${spd > 0.02 ? '→' : spd < -0.02 ? '←' : ''}`;
    $('pw-millrpm').setAttribute('fill', ml.P < 0 ? '#38BDF8' : '#E2E8F0');
    $('pw-hydn').setAttribute('transform', `rotate(${f1(-60 + byId['HYD-1'].act * 160)} 1252 516)`);
    // utilities
    const cm = byId['CMP-1'];
    cmpA = (cmpA + dt * (cm.extra.loaded ? 1100 : 380)) % 360; $('pw-cmpfan').setAttribute('transform', `rotate(${f1(cmpA)})`);
    $('pw-cmpst').textContent = sim.fx.vsd ? `VSD ${Math.round(cm.act * 100)}%` : cm.extra.loaded ? 'LOAD' : 'UNLOAD';
    $('pw-cmpst').setAttribute('fill', sim.fx.vsd ? '#A7F3D0' : cm.extra.loaded ? '#A7F3D0' : '#FCA5A5');
    ctA = (ctA + dt * 500) % 360; $('pw-ctfan').setAttribute('transform', `rotate(${f1(ctA)})`);
    $('pw-vapor').setAttribute('opacity', '0.9'); $('pw-vapor').setAttribute('transform', `translate(0,${f1(-((t * 12) % 18))})`);
  }
  // ---------- dashboard drawing
  function drawDash(x) {
    const L = lang() !== lastLang ? texts() : (TX[lang()] || TX.th);
    if (lang() !== lastLang) lastLang = lang();
    const k = (lab, v, u, c, sub) => `<div class="pw-k"><small>${lab}</small><b style="${c ? `color:${c}` : ''}">${v}<i>${u}</i></b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    D('pwk').innerHTML = k(L.P, Math.round(x.P), ' kW', '#4ADE80') + k(L.Q, Math.round(x.Q), ' kvar', '#FB923C', sim.fx.cap ? `${L.cap} −${sim.capSteps * CAP_STEP} kvar` : '') + k(L.D, Math.round(x.D), ' kVA', '#A78BFA')
      + k(L.S, Math.round(x.S), ' kVA', '#E2E8F0') + k(L.cos, x.cos.toFixed(3), '', pfColor(x.cos)) + k(L.pf, x.pf.toFixed(3), '', pfColor(x.pf))
      + k(L.thd, (x.thd * 100).toFixed(1), ' %', x.thd > 0.15 ? '#EF4444' : x.thd > 0.08 ? '#F59E0B' : '#22C55E') + k(L.tr, Math.round(x.load * 100), ' %', x.load > 0.8 ? '#EF4444' : '#E2E8F0') + k(L.I, Math.round(x.I), ' A', '#E2E8F0');
    // gauge
    const [nx, ny] = gPt(x.pf, 96), [mx, my] = gPt(x.cos, 90);
    D('pw-gn').setAttribute('x2', f1(nx)); D('pw-gn').setAttribute('y2', f1(ny));
    D('pw-gn2').setAttribute('x2', f1(mx)); D('pw-gn2').setAttribute('y2', f1(my));
    D('pw-gv').textContent = x.pf.toFixed(2); D('pw-gv').setAttribute('fill', pfColor(x.pf));
    D('pw-gleg').innerHTML = `<span><i style="background:#F8FAFC"></i>${L.true} ${x.pf.toFixed(3)}</span><span><i style="background:#38BDF8"></i>${L.disp} ${x.cos.toFixed(3)}</span><span><i style="background:#EF4444"></i>&lt; 0.85</span>`;
    // power "tetrahedron": P → x, Q ↑, D drawn obliquely
    const sc = 230 / Math.max(450, x.S * 1.08), ox = 30, oy = 190;
    const P = Math.abs(x.P) * sc, Q = x.Q * sc, Dd = x.D * sc, Ql = x.Qload * sc;
    const dx = Dd * 0.62, dy = Dd * 0.48;
    const tip = [ox + P + dx, oy - Q - dy];
    D('pw-tri').innerHTML = `<line x1="${ox}" y1="${oy}" x2="290" y2="${oy}" stroke="#334155"/><line x1="${ox}" y1="${oy}" x2="${ox}" y2="10" stroke="#334155"/>
      ${sim.fx.cap && Ql > Q ? `<line x1="${f1(ox + P)}" y1="${f1(oy)}" x2="${f1(ox + P)}" y2="${f1(oy - Ql)}" stroke="#FB923C" stroke-width="2" stroke-dasharray="4 4" opacity="0.5"/><path d="M${f1(ox + P + 10)},${f1(oy - Ql)} L${f1(ox + P + 10)},${f1(oy - Q)}" stroke="#38BDF8" stroke-width="3" marker-end="url(#none)"/><text x="${f1(ox + P + 14)}" y="${f1(oy - (Ql + Q) / 2)}" font-size="10" fill="#38BDF8">Qc</text>` : ''}
      <path d="M${ox},${oy} L${f1(ox + P)},${oy} L${f1(ox + P)},${f1(oy - Q)} L${f1(tip[0])},${f1(tip[1])} Z" fill="#F8FAFC" opacity="0.05"/>
      <line x1="${ox}" y1="${oy}" x2="${f1(ox + P)}" y2="${oy}" stroke="#4ADE80" stroke-width="5" stroke-linecap="round"/>
      <line x1="${f1(ox + P)}" y1="${oy}" x2="${f1(ox + P)}" y2="${f1(oy - Q)}" stroke="#FB923C" stroke-width="5" stroke-linecap="round"/>
      <line x1="${f1(ox + P)}" y1="${f1(oy - Q)}" x2="${f1(tip[0])}" y2="${f1(tip[1])}" stroke="#A78BFA" stroke-width="5" stroke-linecap="round"/>
      <line x1="${ox}" y1="${oy}" x2="${f1(tip[0])}" y2="${f1(tip[1])}" stroke="#F8FAFC" stroke-width="2.5" stroke-dasharray="6 4"/>
      <path d="M${ox + 34},${oy} A34,34 0 0 0 ${f1(ox + 34 * Math.cos(Math.atan2(Q, P)))},${f1(oy - 34 * Math.sin(Math.atan2(Q, P)))}" fill="none" stroke="#38BDF8" stroke-width="1.5"/>
      <text x="${f1(ox + P / 2)}" y="${oy + 16}" font-size="11" fill="#4ADE80" text-anchor="middle">P ${Math.round(x.P)} kW</text>
      <text x="${f1(ox + P - 6)}" y="${f1(oy - Q / 2)}" font-size="11" fill="#FB923C" text-anchor="end">Q ${Math.round(x.Q)}</text>
      <text x="${f1(tip[0] + 6)}" y="${f1(tip[1] + 14)}" font-size="11" fill="#A78BFA">D ${Math.round(x.D)}</text>
      <text x="${f1((ox + tip[0]) / 2 - 8)}" y="${f1((oy + tip[1]) / 2 - 8)}" font-size="12" font-weight="700" fill="#F8FAFC" text-anchor="end">S ${Math.round(x.S)} kVA</text>
      <text x="${ox + 40}" y="${oy - 6}" font-size="10" fill="#38BDF8">φ ${f1(Math.atan2(x.Q, Math.abs(x.P)) * 180 / Math.PI)}°</text>`;
    D('pw-tleg').innerHTML = `<span>S² = P² + Q² + D²</span><span>PF = P / S = ${x.pf.toFixed(3)}</span>`;
    // scope: selected machine or the plant
    const sel = sim.selected && sim.selected !== 'PLANT' ? x.ms.find((r) => r.m.id === sim.selected) : null;
    const kind = sel ? sel.m.kind : 'plant', cos = sel ? sel.cos : x.cos, thd = sel ? sel.thd : x.thd, phi = Math.acos(clamp(cos, 0.05, 1));
    const spec = spectrum(kind === 'plant' ? 'scr' : kind, thd);
    D('pw-scopet').textContent = sel ? `${sel.m.id} · ${sel.m.name[lang()] || sel.m.name.th}` : L.plant;
    const W0 = 10, W = 500, Hm = 100, Av = 70, Ai = 52 / Math.max(1, 1 + thd * 0.9);
    const shift = (ph * 0.6) % (2 * Math.PI);
    const pts = (fn) => Array.from({ length: 201 }, (_, i) => { const th = i / 200 * 4 * Math.PI + shift; return `${i ? 'L' : 'M'}${f1(W0 + i / 200 * W)},${f1(Hm - fn(th))}`; }).join(' ');
    D('pw-sv').setAttribute('d', pts((th) => Av * Math.sin(th)));
    D('pw-si1').setAttribute('d', pts((th) => Ai * Math.sin(th - phi)));
    D('pw-si').setAttribute('d', pts((th) => Ai * currentAt(th, phi, spec, kind)));
    // φ marker between the zero crossings of v and i1 near the left
    let z = (2 * Math.PI - (shift % (2 * Math.PI))) % (2 * Math.PI); if (z < 0.4) z += 2 * Math.PI;
    const xv = W0 + z / (4 * Math.PI) * W, xi = W0 + (z + phi) / (4 * Math.PI) * W;
    D('pw-sphi').setAttribute('d', `M${f1(xv)},${Hm + 66} L${f1(xv)},${Hm + 74} L${f1(xi)},${Hm + 74} L${f1(xi)},${Hm + 66}`);
    D('pw-sphit').setAttribute('x', f1((xv + xi) / 2 - 10)); D('pw-sphit').setAttribute('y', String(Hm + 90)); D('pw-sphit').textContent = `φ ${f1(phi * 180 / Math.PI)}°`;
    D('pw-sleg').innerHTML = `<span><i style="background:#38BDF8"></i>${L.V} 230 V</span><span><i style="background:#F97316"></i>${L.Ic} (THD ${(thd * 100).toFixed(0)}%)</span><span><i style="background:#FB923C;opacity:.6"></i>${L.fund}</span><span>cos φ ${cos.toFixed(2)}</span><span>PF ${(cos / Math.sqrt(1 + thd * thd)).toFixed(2)}</span>`;
    // spectrum (% of fundamental) with guide limits
    const lim = { 3: 4, 5: 4, 7: 4, 9: 4, 11: 2, 13: 2, 17: 1.5, 19: 1.5 };
    const bars = [{ h: 1, a: 1 }, ...spec.filter((q) => q.a > 0)];
    const bw = 260 / bars.length;
    const yv = (p) => 140 - clamp(p, 0, 40) / 40 * 120;
    D('pw-spec').innerHTML = `<line x1="30" y1="140" x2="292" y2="140" stroke="#334155"/>${[0, 10, 20, 30, 40].map((p) => `<line x1="30" y1="${yv(p)}" x2="292" y2="${yv(p)}" stroke="#1C2850"/><text x="26" y="${yv(p) + 4}" font-size="9" fill="#94A3B8" text-anchor="end">${p}%</text>`).join('')}
      ${bars.map((b, i) => { const p = b.h === 1 ? 40 : b.a * 100, xx = 32 + i * bw; return `<rect x="${f1(xx + 3)}" y="${f1(yv(p))}" width="${f1(bw - 6)}" height="${f1(140 - yv(p))}" rx="2" fill="${b.h === 1 ? '#38BDF8' : p > (lim[b.h] || 2) ? '#EF4444' : '#22C55E'}" opacity="${b.h === 1 ? 0.45 : 0.9}"/>${b.h !== 1 && lim[b.h] ? `<line x1="${f1(xx + 1)}" x2="${f1(xx + bw - 1)}" y1="${f1(yv(lim[b.h]))}" y2="${f1(yv(lim[b.h]))}" stroke="#F59E0B" stroke-width="2" stroke-dasharray="3 2"/>` : ''}<text x="${f1(xx + bw / 2)}" y="154" font-size="10" fill="#94A3B8" text-anchor="middle">${b.h === 1 ? '1' : b.h}</text>${b.h !== 1 ? `<text x="${f1(xx + bw / 2)}" y="${f1(yv(p) - 3)}" font-size="9" fill="#E2E8F0" text-anchor="middle">${p.toFixed(0)}</text>` : ''}`; }).join('')}
      <text x="160" y="168" font-size="9" fill="#94A3B8" text-anchor="middle">h</text>`;
    D('pw-spleg').innerHTML = `<span><i style="background:#F59E0B;height:2px"></i>${L.limit} (IEEE 519)</span><span>THD-I ${(thd * 100).toFixed(1)} %</span>`;
    // trend (P, Q, S)
    const tw = 850, th = 140, max = 1200;
    const tx = (i) => 10 + (i + 120 - trend.length) / 119 * tw, ty = (v) => 10 + th - clamp(v, -100, max) / max * th;
    const line = (k) => trend.map((p, i) => `${i ? 'L' : 'M'}${f1(tx(i))},${f1(ty(p[k]))}`).join(' ');
    const area = trend.length ? `${line('P')} L${f1(tx(trend.length - 1))},${ty(0)} L${f1(tx(0))},${ty(0)} Z` : '';
    D('pw-trend').innerHTML = `${[0, 300, 600, 900, 1200].map((v) => `<line x1="10" x2="860" y1="${f1(ty(v))}" y2="${f1(ty(v))}" stroke="#1C2850"/><text x="866" y="${f1(ty(v) + 4)}" font-size="11" fill="#94A3B8">${v}</text>`).join('')}
      <path d="${area}" fill="#4ADE80" opacity="0.12"/><path d="${line('S')}" fill="none" stroke="#F8FAFC" stroke-width="2"/><path d="${line('P')}" fill="none" stroke="#4ADE80" stroke-width="2"/><path d="${line('Q')}" fill="none" stroke="#FB923C" stroke-width="2"/>`;
    D('pw-trleg').innerHTML = `<span><i style="background:#4ADE80"></i>P kW</span><span><i style="background:#FB923C"></i>Q kvar</span><span><i style="background:#F8FAFC"></i>S kVA</span>`;
  }
  raf = requestAnimationFrame(frame);
  return { el: host, dash, destroy() { alive = false; cancelAnimationFrame(raf); } };
}

// ---------------------------------------------------------------- live simulator (state of the capacitor controller)
export class PowerSim {
  constructor() { this.t = 0; this.fx = {}; this.capSteps = 0; this.capTimer = 0; this.selected = 'PLANT'; this.now = null; this.speed = 1; }
  tick(dt) {
    this.t += dt * this.speed;
    const pre = plantAt(this.t, this.fx, 0);
    if (this.fx.cap) {
      this.capTimer += dt;
      const want = Math.min(CAP_STEPS, Math.round(capNeed(pre.P, pre.Qload) / CAP_STEP));
      if (this.capTimer > 0.8 && want !== this.capSteps) { this.capSteps += Math.sign(want - this.capSteps); this.capTimer = 0; }
    } else this.capSteps = 0;
    this.now = this.fx.cap ? plantAt(this.t, this.fx, this.capSteps * CAP_STEP) : pre;
  }
}
