// CoreDash Nexus — residential home: animated house, lights, water valves, water meter and CCTV (simulated).
// Developed by CoreDash Technology.
const B = (th, en) => ({ th, en });
const f1 = (v) => v.toFixed(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const LIGHTS = [
  { id: 'L-GATE', w: 10, name: B('ไฟเสาประตูรั้ว', 'Gate pillar lamps'), zone: B('หน้าบ้าน', 'Front') },
  { id: 'L-CAR', w: 24, name: B('ไฟโรงจอดรถ', 'Carport downlights'), zone: B('โรงจอดรถ', 'Carport') },
  { id: 'L-EAVE', w: 30, name: B('ไฟใต้ชายคา', 'Eave downlights'), zone: B('รอบบ้าน', 'Outside') },
  { id: 'L-BAL', w: 8, name: B('ไฟระเบียงชั้น 2', 'Balcony lamp'), zone: B('ชั้น 2', 'Upper floor') },
  { id: 'L-LIV', w: 48, name: B('ห้องนั่งเล่น', 'Living room'), zone: B('ชั้น 1', 'Ground floor') },
  { id: 'L-MBR', w: 36, name: B('ห้องนอนใหญ่', 'Master bedroom'), zone: B('ชั้น 2', 'Upper floor') },
  { id: 'L-BR2', w: 24, name: B('ห้องนอน 2', 'Bedroom 2'), zone: B('ชั้น 2', 'Upper floor') },
  { id: 'L-GDN', w: 15, name: B('ไฟสวน', 'Garden spikes'), zone: B('สวน', 'Garden') }
];
export const LOADS = [
  { id: 'AC-1', name: B('แอร์ห้องนอนใหญ่ 18,000 BTU', 'Master bedroom A/C 18,000 BTU'), w: 1550 },
  { id: 'AC-2', name: B('แอร์ห้องนั่งเล่น 24,000 BTU', 'Living room A/C 24,000 BTU'), w: 2100 },
  { id: 'FRG', name: B('ตู้เย็น', 'Refrigerator'), w: 140 },
  { id: 'WH', name: B('เครื่องทำน้ำอุ่น', 'Water heater'), w: 4500 },
  { id: 'PMP', name: B('ปั๊มน้ำ', 'Water pump'), w: 350 }
];
export const VALVES = [
  { id: 'V-MAIN', name: B('วาล์วน้ำเข้าบ้าน (หลัก)', 'Main water inlet'), desc: B('ตัดน้ำทั้งบ้านได้ทันทีเมื่อไม่อยู่บ้าน/น้ำรั่ว', 'Shuts the whole house off when away or on a leak') },
  { id: 'V-GDN', name: B('วาล์วรดน้ำสวน (สปริงเกอร์)', 'Garden sprinkler valve'), desc: B('ตั้งเวลารดน้ำ 06:00 · 15 นาที', 'Watering schedule 06:00 · 15 min') },
  { id: 'V-TANK', name: B('วาล์วเติมแท็งก์น้ำ', 'Water tank fill valve'), desc: B('เติมแท็งก์ 1,000 ลิตรอัตโนมัติด้วยลูกลอยไฟฟ้า', 'Fills the 1,000 L tank by electric float') }
];
export const CAMS = [
  { id: 'CAM-1', name: B('ประตูรั้ว / ถนน', 'Gate / street'), scene: 'gate' },
  { id: 'CAM-2', name: B('โรงจอดรถ', 'Carport'), scene: 'car' },
  { id: 'CAM-3', name: B('สวนหน้าบ้าน', 'Front garden'), scene: 'garden' },
  { id: 'CAM-4', name: B('ห้องนั่งเล่น', 'Living room'), scene: 'living' }
];

// ---------------------------------------------------------------- simulation
export class HomeSim {
  constructor() {
    this.light = Object.fromEntries(LIGHTS.map((l) => [l.id, false]));
    this.load = { 'AC-1': true, 'AC-2': false, FRG: true, WH: false, PMP: false };
    this.valve = Object.fromEntries(VALVES.map((v) => [v.id, { open: v.id === 'V-MAIN', pos: v.id === 'V-MAIN' ? 1 : 0, by: '', at: Date.now() }]));
    this.kwh = 6.8; this.waterToday = 312; this.reading = 1234.5 * 1; this.flow = 0; this.tank = 0.72; this.t = 0;
    this.useEvt = 0; this.night = null; this.leak = false;
    try { const r = JSON.parse(localStorage.getItem('cd-home-reading') || 'null'); if (r) this.reading = r; } catch (_) { /* storage unavailable */ }
    this.lastSave = 0;
  }
  isNight() { if (this.night != null) return this.night; const h = new Date().getHours(); return h >= 18 || h < 6; }
  power() {
    let w = 0;
    for (const l of LIGHTS) if (this.light[l.id]) w += l.w;
    const t = this.t;
    if (this.load['AC-1']) w += LOADS[0].w * (0.55 + 0.35 * (Math.sin(t / 37) > 0 ? 1 : 0.2));
    if (this.load['AC-2']) w += LOADS[1].w * (0.5 + 0.4 * (Math.sin(t / 29 + 1) > 0 ? 1 : 0.15));
    if (this.load.FRG) w += Math.sin(t / 23) > -0.2 ? LOADS[2].w : 8;
    if (this.load.WH) w += LOADS[3].w;
    if (this.flow > 0.2 && this.valve['V-MAIN'].pos > 0.5) w += LOADS[4].w;
    return w + 85; // standby (router, CCTV NVR, chargers)
  }
  lightsW() { return LIGHTS.reduce((s, l) => s + (this.light[l.id] ? l.w : 0), 0); }
  tick(dt) {
    this.t += dt;
    for (const v of Object.values(this.valve)) { const target = v.open ? 1 : 0; v.pos += clamp(target - v.pos, -dt / 3, dt / 3); }
    const main = this.valve['V-MAIN'].pos;
    // household use comes in bursts (shower, sink, washing machine)
    this.useEvt -= dt;
    if (this.useEvt < -20 && Math.random() < dt / 25) this.useEvt = 8 + Math.random() * 20;
    const house = this.useEvt > 0 ? 7 + 3 * Math.sin(this.t) : 0;
    const garden = 14 * this.valve['V-GDN'].pos;
    const fill = this.tank < 0.98 ? 18 * this.valve['V-TANK'].pos : 0;
    this.flow = main * (house + garden + fill) + (this.leak ? 0.6 * main : 0); // L/min
    this.tank = clamp(this.tank + (fill * main / 60 * dt) / 1000 - (house * main / 60 * dt) / 1000 * 0.4, 0.05, 1);
    const dL = this.flow / 60 * dt;
    this.reading += dL; this.waterToday += dL;
    this.kwh += this.power() / 1000 / 3600 * dt;
    if (this.t - this.lastSave > 5) { this.lastSave = this.t; try { localStorage.setItem('cd-home-reading', JSON.stringify(this.reading)); } catch (_) { /* ignore */ } }
  }
  setValve(id, open, by) { const v = this.valve[id]; v.open = open; v.by = by || ''; v.at = Date.now(); }
}

// ---------------------------------------------------------------- house scene (SVG)
// Positions of lights in the drawing
const LP = {
  'L-GATE': [[454, 588], [1062, 588]], 'L-CAR': [[650, 446], [880, 446]], 'L-EAVE': [[260, 226], [480, 226], [700, 226], [980, 226]],
  'L-BAL': [[300, 300]], 'L-GDN': [[120, 690], [250, 690], [360, 690]]
};
export function createHomeView(sim, opts = {}) {
  const lang = opts.lang || (() => 'th');
  const onPick = opts.onPick || (() => {});
  const host = document.createElement('div');
  host.className = 'hm-scene';
  const s = [];
  s.push(`<defs>
    <linearGradient id="hm-sky" x1="0" y1="0" x2="0" y2="1"><stop id="hm-sky1" offset="0" stop-color="#5AA9F0"/><stop id="hm-sky2" offset="1" stop-color="#CFE8FF"/></linearGradient>
    <linearGradient id="hm-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A4636"/><stop offset="1" stop-color="#6B3226"/></linearGradient>
    <pattern id="hm-tile" width="18" height="9" patternUnits="userSpaceOnUse"><path d="M0,8.5 H18 M9,0 V8.5" stroke="#4E2219" stroke-width="1" opacity="0.5"/></pattern>
    <linearGradient id="hm-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1ECDF"/><stop offset="1" stop-color="#E2DCCB"/></linearGradient>
    <linearGradient id="hm-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9FC9C6"/><stop offset="0.5" stop-color="#6E9E9C"/><stop offset="1" stop-color="#A9D2CF"/></linearGradient>
    <linearGradient id="hm-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9C6BE"/><stop offset="1" stop-color="#A9A69E"/></linearGradient>
    <radialGradient id="hm-glow"><stop offset="0" stop-color="#FFE7A3" stop-opacity="0.95"/><stop offset="0.4" stop-color="#FFD36B" stop-opacity="0.45"/><stop offset="1" stop-color="#FFD36B" stop-opacity="0"/></radialGradient>
    <linearGradient id="hm-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7A3" stop-opacity="0.75"/><stop offset="1" stop-color="#FFE7A3" stop-opacity="0"/></linearGradient>
    <linearGradient id="hm-car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DAE2"/></linearGradient>
    <filter id="hm-blur"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect x="0" y="0" width="1200" height="760" fill="url(#hm-sky)"/>
  <g id="hm-stars" opacity="0">${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 197) % 1200}" cy="${(i * 71) % 230 + 10}" r="${i % 3 ? 1 : 1.6}" fill="#FFFFFF"/>`).join('')}</g>
  <circle id="hm-sun" cx="1080" cy="80" r="34" fill="#FFE27A"/><circle id="hm-moon" cx="1080" cy="80" r="26" fill="#F8FAFC" opacity="0"/><circle id="hm-moon2" cx="1093" cy="72" r="24" fill="#0F1A33" opacity="0"/>
  <g id="hm-cloud" opacity="0.9"><ellipse cx="200" cy="90" rx="70" ry="20" fill="#FFFFFF"/><ellipse cx="240" cy="78" rx="44" ry="22" fill="#FFFFFF"/><ellipse cx="700" cy="60" rx="60" ry="16" fill="#FFFFFF"/></g>`);
  // neighbours
  s.push(`<g opacity="0.55"><path d="M1090,330 L1160,250 L1200,250 L1200,600 L1090,600 Z" fill="#E8E8E8"/><path d="M1080,335 L1160,240 L1200,240" fill="none" stroke="#C0563D" stroke-width="10"/><rect x="1120" y="380" width="40" height="60" fill="#8FB8C4"/></g>
    <g opacity="0.5"><rect x="0" y="380" width="70" height="220" fill="#ECE6D6"/><path d="M-10,385 L40,330 L90,385 Z" fill="#9C4A38"/></g>`);
  // trees
  const tree = (x, y, sc) => `<g transform="translate(${x},${y}) scale(${sc})"><rect x="-6" y="0" width="12" height="160" fill="#5B4636"/><path d="M0,40 L-40,0 M0,70 L40,20" stroke="#5B4636" stroke-width="7"/>${[[-60, -10, 55], [10, -40, 65], [55, 10, 50], [-20, 30, 50], [30, -90, 45]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3E8E41"/>`).join('')}${[[-40, -30, 30], [30, -60, 32], [60, 0, 25]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#5FB35F" opacity="0.8"/>`).join('')}</g>`;
  s.push(`<g id="hm-tree1">${tree(80, 330, 1.1)}</g><g id="hm-tree2">${tree(1150, 470, 0.75)}</g>`);
  // ---------- house: upper floor
  s.push(`<path d="M160,222 L330,120 L905,120 L1075,222 Z" fill="url(#hm-roof)"/><path d="M160,222 L330,120 L905,120 L1075,222 Z" fill="url(#hm-tile)"/>
    <path d="M150,222 L1085,222 L1085,232 L150,232 Z" fill="#F8F6F0"/><path d="M330,120 L905,120" stroke="#5A281D" stroke-width="5"/>
    <rect x="215" y="232" width="790" height="196" fill="url(#hm-wall)"/>
    <rect x="285" y="260" width="410" height="12" fill="#FFFFFF" opacity="0.8"/>
    <rect id="hm-w-bal" x="320" y="275" width="150" height="140" fill="url(#hm-glass)" stroke="#FFFFFF" stroke-width="5"/><rect x="393" y="275" width="4" height="140" fill="#FFFFFF"/>
    <path d="M326,281 q 14,60 0,128 M464,281 q -14,60 0,128" stroke="#3C6E6B" stroke-width="10" fill="none" opacity="0.5"/>
    <rect id="hm-w-br2" x="545" y="272" width="110" height="98" fill="url(#hm-glass)" stroke="#FFFFFF" stroke-width="5"/><rect x="598" y="272" width="4" height="98" fill="#FFFFFF"/>
    <rect x="545" y="372" width="110" height="40" fill="#6B7280" opacity="0.6"/>
    <rect x="725" y="196" width="280" height="232" fill="#F4F0E6"/>
    <rect x="735" y="196" width="18" height="232" fill="#FFFFFF"/><rect x="772" y="196" width="18" height="232" fill="#FFFFFF"/><rect x="809" y="196" width="18" height="232" fill="#FFFFFF"/>
    <rect x="725" y="196" width="280" height="14" fill="#FFFFFF"/><rect x="725" y="380" width="280" height="12" fill="#FFFFFF"/>
    <rect id="hm-w-mbr" x="840" y="230" width="150" height="120" fill="url(#hm-glass)" stroke="#FFFFFF" stroke-width="5"/><rect x="890" y="230" width="4" height="120" fill="#FFFFFF"/><rect x="940" y="230" width="4" height="120" fill="#FFFFFF"/><rect x="840" y="330" width="150" height="4" fill="#FFFFFF"/>
    <rect x="270" y="415" width="230" height="22" fill="#EFEAE0"/><rect x="270" y="436" width="230" height="4" fill="#C9C2B2"/>
    <g stroke="#1F2329" stroke-width="3">${[372, 384, 396, 408].map((y) => `<line x1="275" y1="${y}" x2="495" y2="${y}"/>`).join('')}<line x1="275" y1="360" x2="275" y2="415"/><line x1="495" y1="360" x2="495" y2="415"/><line x1="385" y1="360" x2="385" y2="415"/></g>
    <rect x="292" y="292" width="14" height="18" rx="3" fill="#2A2F36"/><circle id="hm-bal-bulb" cx="299" cy="304" r="4" fill="#FDE68A" opacity="0.3"/>`);
  // window light overlays (glow) for interior lights
  for (const [id, x, y, w, h] of [['L-BAL', 320, 275, 150, 140], ['L-BR2', 545, 272, 110, 98], ['L-MBR', 840, 230, 150, 120]])
    s.push(`<rect class="hm-win" data-l="${id === 'L-BAL' ? 'L-MBR' : id}" x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFD27A" opacity="0"/>`);
  // eave downlights
  s.push(LP['L-EAVE'].map(([x, y]) => `<circle cx="${x}" cy="${y + 4}" r="4" fill="#F5F5F5" stroke="#9CA3AF"/>`).join(''));
  // ---------- ground floor
  s.push(`<rect x="215" y="440" width="790" height="250" fill="url(#hm-wall)"/>
    <rect x="300" y="470" width="170" height="160" fill="#4A4F57"/><rect id="hm-w-liv" x="315" y="485" width="140" height="130" fill="url(#hm-glass)" stroke="#E5E7EB" stroke-width="4"/>
    <rect class="hm-win" data-l="L-LIV" x="315" y="485" width="140" height="130" fill="#FFD27A" opacity="0"/>
    <rect x="510" y="440" width="500" height="250" fill="#F7F5F0"/>
    <rect x="610" y="520" width="58" height="140" fill="#FFFFFF" stroke="#D6D3CC" stroke-width="3"/><circle cx="658" cy="595" r="3" fill="#9CA3AF"/>
    <rect x="770" y="525" width="44" height="64" fill="#9FC9C6" stroke="#FFFFFF" stroke-width="3"/>
    <rect x="490" y="425" width="560" height="18" fill="#111418"/><rect x="490" y="443" width="560" height="5" fill="#2B3036"/>
    <rect x="510" y="440" width="12" height="260" fill="#16191E"/><rect x="1030" y="440" width="12" height="260" fill="#16191E"/>
    ${LP['L-CAR'].map(([x, y]) => `<rect x="${x - 10}" y="${y - 2}" width="20" height="4" rx="2" fill="#E5E7EB"/>`).join('')}
    <path d="M520,690 L1040,690 L1040,705 L520,705 Z" fill="#B9B5AC"/>`);
  // light cones in the carport
  s.push(LP['L-CAR'].map(([x, y]) => `<path class="hm-cone" data-l="L-CAR" d="M${x - 8},${y + 2} L${x + 8},${y + 2} L${x + 90},${y + 245} L${x - 90},${y + 245} Z" fill="url(#hm-cone)" opacity="0"/>`).join(''));
  // cars (front view, plates left blank)
  const car = (x, y, w, h, suv) => `<g transform="translate(${x},${y})"><path d="M${w * 0.14},${h * 0.32} Q${w * 0.2},${h * 0.02} ${w * 0.5},${h * 0.02} Q${w * 0.8},${h * 0.02} ${w * 0.86},${h * 0.32} Z" fill="#1F2933"/>
    <path d="M${w * 0.18},${h * 0.3} Q${w * 0.24},${h * 0.08} ${w * 0.5},${h * 0.08} Q${w * 0.76},${h * 0.08} ${w * 0.82},${h * 0.3} Z" fill="#3A4652"/>
    <path d="M0,${h * 0.42} Q${w * 0.04},${h * 0.3} ${w * 0.12},${h * 0.3} L${w * 0.88},${h * 0.3} Q${w * 0.96},${h * 0.3} ${w},${h * 0.42} L${w},${h * 0.86} L0,${h * 0.86} Z" fill="url(#hm-car)"/>
    <rect x="${w * 0.04}" y="${h * 0.44}" width="${w * 0.2}" height="${h * 0.09}" rx="4" fill="#D9E2EC" class="hm-head"/><rect x="${w * 0.76}" y="${h * 0.44}" width="${w * 0.2}" height="${h * 0.09}" rx="4" fill="#D9E2EC" class="hm-head"/>
    <rect x="${w * 0.3}" y="${h * 0.44}" width="${w * 0.4}" height="${h * 0.14}" rx="5" fill="${suv ? '#22272E' : '#2E3640'}"/>${suv ? `<rect x="${w * 0.33}" y="${h * 0.47}" width="${w * 0.34}" height="${h * 0.08}" fill="none" stroke="#9CA3AF" stroke-width="1.5"/>` : ''}
    <rect x="${w * 0.38}" y="${h * 0.66}" width="${w * 0.24}" height="${h * 0.1}" rx="2" fill="#FFFFFF" stroke="#94A3B8"/>
    <rect x="${w * 0.02}" y="${h * 0.84}" width="${w * 0.14}" height="${h * 0.16}" rx="4" fill="#111"/><rect x="${w * 0.84}" y="${h * 0.84}" width="${w * 0.14}" height="${h * 0.16}" rx="4" fill="#111"/></g>`;
  s.push(car(560, 590, 200, 110, false), car(790, 555, 215, 150, true));
  // fence, pillars, gate, hedges
  s.push(`<rect x="0" y="690" width="1200" height="70" fill="url(#hm-road)"/><path d="M0,700 L1200,700" stroke="#8F8B84" stroke-width="3"/>
    <rect x="0" y="672" width="460" height="22" fill="#D9D4C7"/><rect x="0" y="668" width="460" height="6" fill="#F3F0E8"/>
    <g fill="#3F8F3F">${[[40, 610, 70, 75], [140, 600, 60, 85], [260, 640, 120, 40], [380, 636, 80, 44], [1120, 640, 90, 40]].map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('')}</g>
    <g fill="#55A855" opacity="0.8">${[[30, 590, 40, 40], [150, 575, 35, 45], [250, 625, 70, 20]].map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('')}</g>
    <g stroke="#23272D" stroke-width="3">${Array.from({ length: 14 }, (_, i) => `<line x1="${200 + i * 18}" y1="640" x2="${200 + i * 18}" y2="672"/>`).join('')}<line x1="200" y1="642" x2="440" y2="642"/></g>
    <rect x="440" y="600" width="30" height="94" fill="#ECE7DB"/><rect x="436" y="596" width="38" height="8" fill="#F8F6F0"/><rect x="448" y="578" width="14" height="20" rx="4" fill="#F8F6F0" stroke="#A3A3A3"/>
    <rect x="1048" y="600" width="30" height="94" fill="#ECE7DB"/><rect x="1044" y="596" width="38" height="8" fill="#F8F6F0"/><rect x="1056" y="578" width="14" height="20" rx="4" fill="#F8F6F0" stroke="#A3A3A3"/>
    <g id="hm-gate"><rect x="470" y="618" width="80" height="74" fill="none" stroke="#1E2228" stroke-width="4"/>${Array.from({ length: 6 }, (_, i) => `<line x1="${478 + i * 13}" y1="620" x2="${478 + i * 13}" y2="690" stroke="#1E2228" stroke-width="2.5"/>`).join('')}</g>
    <rect x="1078" y="660" width="122" height="30" fill="#D9D4C7"/>`);
  // light glows (night)
  for (const id of ['L-GATE', 'L-BAL', 'L-GDN', 'L-EAVE', 'L-CAR']) for (const [x, y] of LP[id]) s.push(`<circle class="hm-glow" data-l="${id}" cx="${x}" cy="${y}" r="${id === 'L-GDN' ? 34 : id === 'L-CAR' ? 46 : 40}" fill="url(#hm-glow)" opacity="0"/>`);
  s.push(LP['L-GDN'].map(([x, y]) => `<rect x="${x - 3}" y="${y - 2}" width="6" height="14" fill="#2A2F36"/><circle cx="${x}" cy="${y - 3}" r="4" fill="#E5E7EB"/>`).join(''));
  // ---------- water: meter at the curb, pipes, valves, tank, sprinkler
  s.push(`<g id="hm-meter" class="hm-click" data-pick="meter"><rect x="1100" y="700" width="52" height="34" rx="5" fill="#1F2937" stroke="#64748B"/><circle cx="1126" cy="717" r="11" fill="#E5E7EB"/><circle cx="1126" cy="717" r="6" fill="#1D4ED8"/><text x="1126" y="752" font-size="12" text-anchor="middle" fill="#0F172A" font-weight="700">มาตรน้ำ</text></g>
    <path d="M1100,717 L1000,717 L1000,700" fill="none" stroke="#475569" stroke-width="6"/>
    <path id="hm-p-main" d="M1100,717 L1000,717 L1000,700" fill="none" stroke="#38BDF8" stroke-width="3" stroke-dasharray="8 8" opacity="0"/>
    <path d="M1000,700 L300,700 L300,676" fill="none" stroke="#475569" stroke-width="5"/><path id="hm-p-gdn" d="M1000,700 L300,700 L300,676" fill="none" stroke="#38BDF8" stroke-width="2.5" stroke-dasharray="8 8" opacity="0"/>
    <path d="M1000,700 L1000,520 L1070,520" fill="none" stroke="#475569" stroke-width="5"/><path id="hm-p-tank" d="M1000,700 L1000,520 L1070,520" fill="none" stroke="#38BDF8" stroke-width="2.5" stroke-dasharray="8 8" opacity="0"/>
    <g class="hm-click" data-pick="valves"><rect x="1066" y="470" width="70" height="120" rx="12" fill="#D6E4F0" stroke="#7C93AA" stroke-width="2"/><rect id="hm-tankw" x="1070" y="500" width="62" height="86" rx="8" fill="#38BDF8" opacity="0.55"/><text x="1101" y="490" font-size="11" text-anchor="middle" fill="#0F172A" font-weight="700">TANK</text><text id="hm-tankt" x="1101" y="550" font-size="13" text-anchor="middle" fill="#0F172A" font-weight="800"></text></g>
    ${[['V-MAIN', 1040, 717], ['V-GDN', 600, 700], ['V-TANK', 1000, 560]].map(([id, x, y]) => `<g class="hm-click" data-pick="valves" transform="translate(${x},${y})"><path d="M-11,-8 L11,8 L11,-8 L-11,8 Z" fill="#334155" id="hm-v-${id}" stroke="#0F172A" stroke-width="1.5"/><rect x="-2" y="-18" width="4" height="10" fill="#334155"/><rect id="hm-vh-${id}" x="-10" y="-22" width="20" height="5" rx="2" fill="#EF4444"/></g>`).join('')}
    <g id="hm-spr" transform="translate(300,676)"><rect x="-4" y="-12" width="8" height="12" fill="#334155"/>${Array.from({ length: 24 }, (_, i) => `<circle class="hm-drop" r="${2.4 + (i % 3) * 0.7}" fill="#0EA5E9" cx="0" cy="-12" opacity="0"/>`).join('')}</g>`);
  // CCTV cameras
  s.push([['CAM-1', 1028, 452, 1], ['CAM-2', 530, 452, -1], ['CAM-3', 225, 240, -1], ['CAM-4', 455, 492, 1]].map(([id, x, y, dir]) => `<g class="hm-click hm-cam" data-pick="cam" data-cam="${id}" transform="translate(${x},${y}) scale(${dir},1)"><rect x="-4" y="-4" width="8" height="10" fill="#E5E7EB"/><rect x="0" y="2" width="26" height="12" rx="4" fill="#F8FAFC" stroke="#94A3B8"/><circle cx="25" cy="8" r="4" fill="#111"/><circle class="hm-rec" cx="6" cy="8" r="2" fill="#EF4444"/></g>`).join(''));
  // labels (light names) for clickable lights
  s.push(`<g id="hm-hot">${LIGHTS.map((l) => { const p = LP[l.id] ? LP[l.id][0] : l.id === 'L-LIV' ? [385, 550] : l.id === 'L-MBR' ? [915, 290] : [600, 320]; return `<circle class="hm-click hm-hotspot" data-pick="light" data-l="${l.id}" cx="${p[0]}" cy="${p[1]}" r="16" fill="#FFFFFF" fill-opacity="0.001" stroke="#FACC15" stroke-width="2" stroke-dasharray="3 3" opacity="0.0"/>`; }).join('')}</g>`);
  s.push(`<rect id="hm-dark" x="0" y="0" width="1200" height="760" fill="#06102A" opacity="0" pointer-events="none"/>`);
  host.innerHTML = `<div class="hm-scroll"><svg class="hm-svg" viewBox="0 0 1200 760" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="House">${s.join('')}</svg></div>`;
  const svg = host.querySelector('svg');
  const $ = (id) => svg.querySelector('#' + id);
  // move the dark overlay under the glows so lights stay bright at night
  const dark = $('hm-dark'), firstGlow = svg.querySelector('.hm-glow');
  if (firstGlow) { svg.insertBefore(dark, firstGlow); svg.querySelectorAll('.hm-win, .hm-cone').forEach((e) => svg.insertBefore(e, firstGlow)); }
  svg.addEventListener('click', (ev) => { const g = ev.target.closest('.hm-click'); if (g) onPick(g.dataset.pick, g.dataset.l || g.dataset.cam || ''); });
  let raf = 0, alive = true, last = performance.now();
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    sim.tick(dt);
    if (!host.isConnected) return;
    const t = now / 1000, night = sim.isNight();
    $('hm-sky1').setAttribute('stop-color', night ? '#050B1E' : '#5AA9F0'); $('hm-sky2').setAttribute('stop-color', night ? '#1B2B52' : '#CFE8FF');
    $('hm-stars').setAttribute('opacity', night ? '1' : '0'); $('hm-sun').setAttribute('opacity', night ? '0' : '1');
    $('hm-moon').setAttribute('opacity', night ? '1' : '0'); $('hm-moon2').setAttribute('opacity', night ? '1' : '0');
    $('hm-cloud').setAttribute('opacity', night ? '0.15' : '0.9'); $('hm-cloud').setAttribute('transform', `translate(${f1((t * 6) % 300 - 60)},0)`);
    dark.setAttribute('opacity', night ? '0.58' : '0');
    svg.querySelectorAll('.hm-glow').forEach((g) => g.setAttribute('opacity', sim.light[g.dataset.l] ? (night ? '1' : '0.35') : '0'));
    svg.querySelectorAll('.hm-cone').forEach((g) => g.setAttribute('opacity', sim.light[g.dataset.l] ? (night ? '0.85' : '0.25') : '0'));
    svg.querySelectorAll('.hm-win').forEach((g) => g.setAttribute('opacity', sim.light[g.dataset.l] ? (night ? '0.85' : '0.3') : '0'));
    $('hm-bal-bulb').setAttribute('opacity', sim.light['L-BAL'] ? '1' : '0.3');
    svg.querySelectorAll('.hm-hotspot').forEach((g) => g.setAttribute('opacity', opts.showHot && opts.showHot() ? '0.9' : '0'));
    svg.querySelectorAll('.hm-rec').forEach((g) => g.setAttribute('opacity', Math.floor(t * 1.5) % 2 ? '1' : '0.2'));
    // water
    const flowOn = sim.flow > 0.2, v = sim.valve;
    const pipe = (id, on, sp) => { const el = $(id); el.setAttribute('opacity', on ? '1' : '0'); el.setAttribute('stroke-dashoffset', f1((-t * sp) % 1000)); };
    pipe('hm-p-main', flowOn, 40); pipe('hm-p-gdn', v['V-GDN'].pos > 0.3 && v['V-MAIN'].pos > 0.3, 40); pipe('hm-p-tank', v['V-TANK'].pos > 0.3 && v['V-MAIN'].pos > 0.3 && sim.tank < 0.98, 40);
    for (const id of Object.keys(v)) { const p = v[id].pos; $('hm-vh-' + id).setAttribute('fill', p > 0.95 ? '#22C55E' : p < 0.05 ? '#EF4444' : '#F59E0B'); $('hm-vh-' + id).setAttribute('transform', `rotate(${f1(p * 90)} 0 -19.5)`); }
    $('hm-tankw').setAttribute('height', f1(86 * sim.tank)); $('hm-tankw').setAttribute('y', f1(500 + 86 * (1 - sim.tank)));
    $('hm-tankt').textContent = `${Math.round(sim.tank * 100)}%`;
    const spr = v['V-GDN'].pos * v['V-MAIN'].pos;
    [...svg.querySelectorAll('.hm-drop')].forEach((d, i) => { const a = (t * 0.9 + i / 24 * 3) % 1, ang = -1.25 + ((i * 7) % 24) / 23 * 2.5; d.setAttribute('cx', f1(Math.sin(ang) * a * 150)); d.setAttribute('cy', f1(-12 - Math.cos(ang) * a * 120 + a * a * 125)); d.setAttribute('opacity', spr > 0.3 ? f1(0.9 * (1 - a * 0.7)) : '0'); });
    svg.querySelectorAll('.hm-head').forEach((h) => h.setAttribute('fill', night && sim.light['L-CAR'] ? '#F1F5F9' : '#D9E2EC'));
  }
  raf = requestAnimationFrame(frame);
  return { el: host, destroy() { alive = false; cancelAnimationFrame(raf); } };
}

// ---------------------------------------------------------------- simulated CCTV (canvas)
export function drawCam(ctx, cam, t, night, lang, st = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  const sx = W / 320, sy = H / 180; ctx.scale(sx, sy);
  const sky = (y1) => { const g = ctx.createLinearGradient(0, 0, 0, y1); g.addColorStop(0, night ? '#0B1222' : '#8EC5EE'); g.addColorStop(1, night ? '#1A2333' : '#E3EFF7'); ctx.fillStyle = g; ctx.fillRect(0, 0, 320, y1); };
  const floor = (y0, c1, c2, lines) => { const g = ctx.createLinearGradient(0, y0, 0, 180); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(0, y0, 320, 180 - y0); if (lines) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(160 + i * 18, y0); ctx.lineTo(160 + i * 70, 180); ctx.stroke(); } for (let k = 1; k < 6; k++) { const y = y0 + (180 - y0) * (k / 6) ** 1.6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(320, y); ctx.stroke(); } } };
  if (cam.scene === 'gate') {
    sky(70);
    ctx.fillStyle = night ? '#2B2F38' : '#E9E2D2'; ctx.fillRect(0, 40, 320, 50); ctx.fillStyle = night ? '#3B2A24' : '#B5543F'; ctx.fillRect(0, 34, 320, 8);
    ctx.fillStyle = night ? '#1E2A3A' : '#8FB8C4'; ctx.fillRect(40, 52, 30, 22); ctx.fillRect(210, 52, 30, 22);
    floor(90, night ? '#2E3135' : '#B7B3AA', night ? '#1C1E21' : '#8E8A82', false);
    ctx.fillStyle = night ? '#3A3D42' : '#CFCBC2'; ctx.fillRect(0, 88, 320, 6);
    const cx = ((t * 60) % 900) - 200; if (cx > -120 && cx < 340) { ctx.fillStyle = night ? '#8B93A0' : '#C0262D'; ctx.fillRect(cx, 92, 90, 22); ctx.fillStyle = '#1F2933'; ctx.fillRect(cx + 18, 84, 50, 12); ctx.fillStyle = '#111'; ctx.fillRect(cx + 10, 110, 14, 8); ctx.fillRect(cx + 66, 110, 14, 8); if (night) { ctx.fillStyle = '#FFF7CC'; ctx.fillRect(cx + 86, 98, 6, 4); } }
    const px = ((t * 26) % 420) - 50; personAt(ctx, px, 118, night);
    ctx.fillStyle = night ? '#2E3238' : '#ECE7DB'; ctx.fillRect(14, 60, 24, 100); ctx.fillRect(282, 60, 24, 100);
    ctx.strokeStyle = '#15181C'; ctx.lineWidth = 3; ctx.strokeRect(38, 76, 244, 76); for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.moveTo(46 + i * 12, 78); ctx.lineTo(46 + i * 12, 150); ctx.stroke(); }
    floor(152, night ? '#26282B' : '#A9A59D', night ? '#191A1C' : '#8A867F', true);
    motionBox(ctx, px - 12, 80, 26, 66, t, lang);
  } else if (cam.scene === 'car') {
    ctx.fillStyle = night ? '#1E2126' : '#F2EFE8'; ctx.fillRect(0, 0, 320, 70);
    ctx.fillStyle = night ? '#15181C' : '#DAD5CB'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(320, 0); ctx.lineTo(250, 30); ctx.lineTo(70, 30); ctx.closePath(); ctx.fill();
    for (const x of [110, 210]) { if (night && st.carLight) { const g = ctx.createRadialGradient(x, 30, 2, x, 70, 90); g.addColorStop(0, 'rgba(255,240,190,0.55)'); g.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = g; ctx.fillRect(x - 100, 25, 200, 150); } ctx.fillStyle = '#F8FAFC'; ctx.fillRect(x - 8, 28, 16, 3); }
    ctx.fillStyle = night ? '#2A2E33' : '#FFFFFF'; ctx.fillRect(130, 36, 30, 46); ctx.strokeStyle = '#9CA3AF'; ctx.strokeRect(130, 36, 30, 46);
    floor(80, night ? '#2B2D30' : '#C9C5BC', night ? '#1A1B1D' : '#9C988F', true);
    carShape(ctx, 30, 78, night); carShape(ctx, 170, 70, night, true);
  } else if (cam.scene === 'garden') {
    sky(60);
    ctx.fillStyle = night ? '#2A2D33' : '#EFEAE0'; ctx.fillRect(0, 10, 70, 90); ctx.fillStyle = night ? '#1E3A4A' : '#8FB8C4'; ctx.fillRect(14, 30, 40, 40);
    floor(95, night ? '#18341C' : '#6CBF60', night ? '#10240F' : '#3F8F3F', false);
    ctx.fillStyle = night ? '#1E3D22' : '#3F8F3F'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(90 + i * 48, 92, 30, 22, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = night ? '#A8A29E' : '#E7E5E4'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(40 + i * 34, 150 + (i % 2) * 6, 12, 4, 0, 0, Math.PI * 2); ctx.fill(); }
    for (const x of [120, 230]) { ctx.fillStyle = '#2A2F36'; ctx.fillRect(x - 2, 112, 4, 18); if (night && st.gardenLight) { const g = ctx.createRadialGradient(x, 112, 1, x, 120, 34); g.addColorStop(0, 'rgba(255,230,160,0.9)'); g.addColorStop(1, 'rgba(255,230,160,0)'); ctx.fillStyle = g; ctx.fillRect(x - 40, 80, 80, 70); } }
    if (st.sprinkler) { ctx.fillStyle = 'rgba(186,230,253,0.85)'; for (let i = 0; i < 40; i++) { const a = ((t * 0.9 + i / 13) % 1), ang = -1.2 + (i % 13) / 12 * 2.4; ctx.fillRect(180 + Math.sin(ang) * a * 110, 140 - Math.cos(ang) * a * 60 + a * a * 70, 2, 2); } }
    const cx = 340 - ((t * 14) % 420); catAt(ctx, cx, 140, night);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, night ? '#24242A' : '#E8E0D2'); g.addColorStop(1, night ? '#1C1C21' : '#D3C8B6'); ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 120);
    ctx.fillStyle = night ? '#0B1222' : '#BFE0F5'; ctx.fillRect(14, 20, 60, 80); ctx.fillStyle = night ? '#3B3F4A' : '#F5F1E8'; ctx.fillRect(10, 18, 12, 86); ctx.fillRect(66, 18, 12, 86);
    floor(118, night ? '#2A2622' : '#A68A6A', night ? '#1B1815' : '#7A6248', true);
    ctx.fillStyle = night ? '#3A3A44' : '#5B6B7C'; ctx.fillRect(96, 92, 150, 44); ctx.fillRect(96, 76, 150, 20); ctx.fillRect(90, 84, 12, 52); ctx.fillRect(240, 84, 12, 52);
    ctx.fillStyle = night ? '#4B4F5A' : '#E5C07B'; ctx.fillRect(120, 82, 22, 14); ctx.fillRect(200, 82, 22, 14);
    ctx.fillStyle = '#111'; ctx.fillRect(250, 40, 62, 38); ctx.fillStyle = `rgba(80,140,255,${0.55 + 0.25 * Math.sin(t * 3)})`; ctx.fillRect(253, 43, 56, 32);
    ctx.fillStyle = night ? '#5C5248' : '#8E6B4B'; ctx.beginPath(); ctx.ellipse(170, 158, 90, 14, 0, 0, Math.PI * 2); ctx.fill();
    if (st.livLight) { const lg = ctx.createRadialGradient(160, 10, 4, 160, 60, 160); lg.addColorStop(0, 'rgba(255,236,180,0.45)'); lg.addColorStop(1, 'rgba(255,236,180,0)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, 320, 180); }
  }
  ctx.restore();
  // night = IR monochrome (unless the area is lit)
  const lit = cam.scene === 'living' ? st.livLight : cam.scene === 'car' ? st.carLight : false;
  if (night && !lit) { const im = ctx.getImageData(0, 0, W, H), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 1.7 + 22; d[i] = d[i + 1] = d[i + 2] = Math.min(255, v); } ctx.putImageData(im, 0, 0); }
  // lens vignette + sensor noise
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 90; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  const now = new Date(), z = (n) => String(n).padStart(2, '0');
  const fs = Math.max(10, Math.round(W / 30));
  ctx.font = `600 ${fs}px "Space Mono", monospace`; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, fs + 10);
  ctx.fillStyle = '#FFFFFF'; ctx.fillText(`${cam.id}  ${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())} ${z(now.getHours())}:${z(now.getMinutes())}:${z(now.getSeconds())}`, 8, fs + 2);
  if (Math.floor(t * 1.5) % 2) { ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(W - fs * 2.6, fs / 2 + 5, fs / 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#FFFFFF'; ctx.fillText('REC', W - fs * 2.1, fs + 2);
  if (night && !lit) { ctx.fillStyle = '#A7F3D0'; ctx.fillText('IR', 8, H - 8); }
}
function personAt(ctx, x, y, night) {
  ctx.fillStyle = night ? '#6B7280' : '#1F3A5F'; ctx.beginPath(); ctx.arc(x, y - 30, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 6, y - 24, 12, 22); ctx.fillStyle = night ? '#4B5563' : '#334155'; const s = Math.sin(x / 4) * 5; ctx.fillRect(x - 5 + s / 2, y - 2, 4, 20); ctx.fillRect(x + 1 - s / 2, y - 2, 4, 20);
}
function catAt(ctx, x, y, night) { ctx.fillStyle = night ? '#9CA3AF' : '#F59E0B'; ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x - 12, y - 5, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + 10, y - 9, 2, 9); }
function carShape(ctx, x, y, night, suv) {
  ctx.fillStyle = night ? '#9CA3AF' : '#F8FAFC'; ctx.fillRect(x, y + 20, suv ? 120 : 110, suv ? 50 : 40); ctx.fillStyle = '#334155'; ctx.fillRect(x + 14, y + 4, suv ? 92 : 82, 20);
  ctx.fillStyle = '#111'; ctx.fillRect(x + 6, y + (suv ? 66 : 56), 18, 14); ctx.fillRect(x + (suv ? 96 : 86), y + (suv ? 66 : 56), 18, 14);
}
function motionBox(ctx, x, y, w, h, t, lang) {
  if (x < 30 || x > 280) return;
  ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  ctx.font = '600 8px sans-serif'; ctx.fillStyle = '#FACC15'; ctx.fillText(lang === 'en' ? 'PERSON 92%' : 'บุคคล 92%', x, y - 3);
}
