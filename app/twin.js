// CoreDash Nexus — virtual control room (digital twin). Developed by CoreDash Technology.
// An isometric SVG of the plant. Built once; live values only change attributes, and every
// animation is computed from the clock, so re-rendering the page never restarts motion.

const NS = 'http://www.w3.org/2000/svg';
const COS = 0.866, SIN = 0.5;
const OX = 500, OY = 150;
const iso = (x, y, z = 0) => [OX + (x - y) * COS, OY + (x + y) * SIN - z];
const P = (pts) => pts.map(([x, y, z]) => iso(x, y, z).map((v) => v.toFixed(1)).join(',')).join(' ');
const f1 = (v) => v.toFixed(1);

// ---------------------------------------------------------------- primitives
function box(x, y, z, w, d, h, c, attrs = '') {
  const top = P([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
  const left = P([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]);
  const right = P([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]);
  return `<g ${attrs}><polygon points="${left}" fill="${c[1]}"/><polygon points="${right}" fill="${c[2]}"/><polygon points="${top}" fill="${c[0]}"/></g>`;
}
function cyl(cx, cy, z, r, h, fill, topFill, attrs = '') {
  const [bx, by] = iso(cx, cy, z), [, ty] = iso(cx, cy, z + h);
  const rx = r * 1.2247, ry = r * 0.7071;
  return `<g ${attrs}><path d="M${f1(bx - rx)},${f1(by)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(bx + rx)},${f1(by)} L${f1(bx + rx)},${f1(ty)} L${f1(bx - rx)},${f1(ty)} Z" fill="${fill}"/><ellipse cx="${f1(bx)}" cy="${f1(ty)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${topFill}"/></g>`;
}
const pipe = (pts, id, color = '#3A4A6E') => `<polyline points="${P(pts)}" fill="none" stroke="#0B1224" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${P(pts)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><polyline id="${id}" class="tw-flow" points="${P(pts)}" fill="none" stroke="#7CC4FF" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="6 14" opacity="0"/>`;

// ---------------------------------------------------------------- layout (world units, floor 0..600)
const W = 600;
const LIGHT_FIX = {
  'L-A': [[90, 380], [190, 380], [90, 490], [190, 490]],
  'L-B': [[70, 170], [170, 170]],
  'L-O': [[612, 330], [612, 480], [330, 612], [480, 612]]
};
const EQ = {
  'P-01': [330, 52], 'P-02': [400, 330], 'T-1': [455, 95], 'V-101': [392, 62], 'V-102': [360, 205], 'V-103': [545, 165],
  'V-201': [300, 330], 'CHL-01': [470, 300], 'CMP-01': [470, 430], 'CNV-01': [160, 445], 'INJ-01': [90, 210], 'MDB-1': [14, 60]
};

function sceneMarkup(L) {
  const s = [];
  s.push(`<defs>
    <linearGradient id="tw-sky-day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5FA8EE"/><stop offset="1" stop-color="#CFE6FF"/></linearGradient>
    <linearGradient id="tw-sky-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050B22"/><stop offset="1" stop-color="#16244F"/></linearGradient>
    <linearGradient id="tw-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7A8" stop-opacity="0.75"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0.04"/></linearGradient>
    <radialGradient id="tw-pool"><stop offset="0" stop-color="#FFE3A0" stop-opacity="0.85"/><stop offset="0.55" stop-color="#FFC970" stop-opacity="0.32"/><stop offset="1" stop-color="#FFC970" stop-opacity="0"/></radialGradient>
    <radialGradient id="tw-beacon"><stop offset="0" stop-color="#FFB020" stop-opacity="0.95"/><stop offset="1" stop-color="#FF7A00" stop-opacity="0"/></radialGradient>
    <radialGradient id="tw-heat"><stop offset="0" stop-color="#FF5A1F" stop-opacity="0.9"/><stop offset="1" stop-color="#FF2D00" stop-opacity="0"/></radialGradient>
    <linearGradient id="tw-water" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0E4FD8"/><stop offset="0.5" stop-color="#2F7BFF"/><stop offset="1" stop-color="#0A3BA8"/></linearGradient>
    <linearGradient id="tw-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#55627E"/><stop offset="0.45" stop-color="#A9B6D0"/><stop offset="1" stop-color="#3A4560"/></linearGradient>
    <linearGradient id="tw-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FB4D8" stop-opacity="0.18"/><stop offset="0.4" stop-color="#E6F0FF" stop-opacity="0.32"/><stop offset="1" stop-color="#9FB4D8" stop-opacity="0.12"/></linearGradient>
    <pattern id="tw-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#2A3550" stroke-width="1"/></pattern>
  </defs>`);
  // floor + walls
  s.push(`<polygon points="${P([[0, 0, 0], [W, 0, 0], [W, W, 0], [0, W, 0]])}" fill="#1A2234"/>`);
  s.push(`<polygon points="${P([[0, 0, 0], [W, 0, 0], [W, W, 0], [0, W, 0]])}" fill="url(#tw-grid)" opacity="0.55"/>`);
  s.push(`<polygon points="${P([[0, 0, 0], [0, W, 0], [0, W, 170], [0, 0, 170]])}" fill="#232D44"/>`);
  s.push(`<polygon points="${P([[0, 0, 0], [W, 0, 0], [W, 0, 170], [0, 0, 170]])}" fill="#2B3652"/>`);
  for (const y of [120, 280, 440]) s.push(`<polygon class="tw-win" points="${P([[0, y, 85], [0, y + 110, 85], [0, y + 110, 150], [0, y, 150]])}" fill="url(#tw-sky-day)" stroke="#11182A" stroke-width="3"/>`);
  for (const x of [160, 300]) s.push(`<polygon class="tw-win" points="${P([[x, 0, 85], [x + 100, 0, 85], [x + 100, 0, 150], [x, 0, 150]])}" fill="url(#tw-sky-day)" stroke="#11182A" stroke-width="3"/>`);
  s.push(`<g id="tw-stars" opacity="0">${[[40, 150, 140], [60, 190, 120], [20, 330, 135], [40, 470, 125], [190, 0, 140], [330, 0, 130], [230, 0, 118]].map(([x, y, z]) => { const p = y === 0 ? iso(x, 0, z) : iso(0, y, z); return `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="1.6" fill="#FFFFFF"/>`; }).join('')}</g>`);
  // zone markings
  const zone = (x, y, w, d, label, lx, ly) => `<polygon points="${P([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]])}" fill="none" stroke="#F5B820" stroke-width="2" stroke-dasharray="10 8" opacity="0.55"/><text x="${f1(iso(lx, ly)[0])}" y="${f1(iso(lx, ly)[1])}" class="tw-zone">${label}</text>`;
  s.push(zone(30, 320, 250, 250, L.zoneA, 40, 560));
  s.push(zone(30, 120, 250, 170, L.zoneB, 40, 280));
  s.push(zone(290, 20, 290, 460, L.zoneU, 300, 470));
  // pipes (on low racks)
  s.push(pipe([[300, 30, 14], [330, 52, 14]], 'tw-p-raw'));
  s.push(pipe([[330, 52, 14], [392, 62, 14], [440, 80, 14]], 'tw-p-in'));
  s.push(pipe([[455, 130, 14], [455, 205, 14], [360, 205, 14], [200, 205, 14], [200, 245, 14]], 'tw-p-sup'));
  s.push(pipe([[495, 120, 14], [545, 165, 14], [575, 210, 14]], 'tw-p-drn'));
  s.push(pipe([[470, 330, 18], [400, 330, 18], [300, 330, 18], [175, 260, 18]], 'tw-p-cool', '#2E5A6E'));
  // drain grate + raw water pit
  s.push(`<polygon points="${P([[565, 200, 0], [590, 200, 0], [590, 225, 0], [565, 225, 0]])}" fill="#0B1224" stroke="#46526E" stroke-width="2"/>`);
  s.push(box(275, 10, 0, 40, 40, 10, ['#16324F', '#0E2238', '#12293F']));
  s.push(`<polygon id="tw-pit" points="${P([[279, 14, 10], [311, 14, 10], [311, 46, 10], [279, 46, 10]])}" fill="#1F6FE0" opacity="0.85"/>`);

  // equipment (back to front)
  // MDB-1 panel on the wall
  s.push(`<g class="tw-eq" data-act="sheet" data-arg="MDB-1">${box(4, 40, 0, 18, 70, 110, ['#5B6680', '#3C465E', '#4A5570'])}<polygon points="${P([[22, 52, 70], [22, 98, 70], [22, 98, 96], [22, 52, 96]])}" fill="#081428"/></g>`);
  // P-01 pump
  s.push(pumpMarkup('P-01', 330, 52));
  // tank T-1
  s.push(tankMarkup(455, 95));
  // INJ-01 injection molder
  s.push(`<g id="tw-inj">${box(40, 180, 0, 120, 60, 55, ['#3E4C6B', '#2A3550', '#33405E'])}${box(60, 190, 55, 40, 40, 22, ['#55627E', '#3A4560', '#475472'])}<ellipse id="tw-heat" cx="${f1(iso(120, 210, 40)[0])}" cy="${f1(iso(120, 210, 40)[1])}" rx="46" ry="26" fill="url(#tw-heat)" opacity="0"/></g>`);
  // V-101 / V-102 / V-103 valves
  s.push(valveMarkup('V-101', 392, 62, 14));
  s.push(valveMarkup('V-102', 360, 205, 14));
  s.push(valveMarkup('V-103', 545, 165, 14));
  // chiller
  s.push(`<g class="tw-eq" data-act="sheet" data-arg="CHL-01">${box(440, 270, 0, 80, 70, 52, ['#7FA6C4', '#4F6E87', '#5F819C'])}${(() => { const [cx, cy] = iso(480, 305, 52); return `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="30" ry="17" fill="#22303F"/><g id="tw-fan" data-cx="${f1(cx)}" data-cy="${f1(cy)}"><g transform="translate(${f1(cx)},${f1(cy)}) scale(1,0.57)"><g class="tw-rot">${[0, 90, 180, 270].map((a) => `<path d="M0,0 L24,-6 L24,6 Z" fill="#B9CCE0" transform="rotate(${a})"/>`).join('')}<circle r="5" fill="#E6EEF8"/></g></g></g>`; })()}</g>`);
  // V-201 + P-02
  s.push(valveMarkup('V-201', 300, 330, 18));
  s.push(pumpMarkup('P-02', 400, 330));
  // CNC machines + conveyor (zone A)
  s.push(box(60, 340, 0, 70, 55, 50, ['#4D5B7A', '#33405E', '#3E4C6B']) + box(70, 350, 50, 30, 20, 6, ['#7DD3FC', '#3A90B8', '#4FA6CC']));
  s.push(box(160, 340, 0, 70, 55, 50, ['#4D5B7A', '#33405E', '#3E4C6B']) + box(170, 350, 50, 30, 20, 6, ['#7DD3FC', '#3A90B8', '#4FA6CC']));
  s.push(`<g class="tw-eq" data-act="sheet" data-arg="CNV-01">${box(40, 430, 0, 240, 30, 22, ['#2B3448', '#1E2536', '#252E42'])}<polyline id="tw-belt" points="${P([[40, 445, 22], [280, 445, 22]])}" stroke="#55627E" stroke-width="16" stroke-dasharray="8 8" fill="none"/>${[0, 1, 2].map((i) => `<g id="tw-crate${i}">${box(0, 0, 0, 22, 18, 16, ['#C9965A', '#8E6435', '#A97A45'])}</g>`).join('')}</g>`);
  // compressor
  s.push(`<g class="tw-eq" data-act="sheet" data-arg="CMP-01"><g id="tw-cmp">${box(440, 410, 0, 70, 45, 40, ['#3D7A63', '#28513F', '#326550'])}${cyl(450, 425, 40, 10, 14, '#C9D3E3', '#E8EEF6')}</g></g>`);

  // night darkness, then lights on top (screen blend lets them cut through the dark)
  s.push(`<rect id="tw-dark2" x="0" y="0" width="1000" height="760" fill="#020617" opacity="0" style="mix-blend-mode:multiply"/>`);
  s.push('<g id="tw-lights" style="mix-blend-mode:screen">');
  for (const [id, pts] of Object.entries(LIGHT_FIX)) {
    pts.forEach(([x, y], i) => {
      const outdoor = id === 'L-O';
      const zf = outdoor ? 95 : 150, R = outdoor ? 70 : 62;
      const [fx, fy] = iso(x, y, zf), [gx, gy] = iso(x, y, 0);
      const rx = R * 1.2247, ry = R * 0.7071;
      s.push(`<g class="tw-light" data-light="${id}" data-i="${i}" opacity="0"><polygon points="${f1(fx - 7)},${f1(fy)} ${f1(fx + 7)},${f1(fy)} ${f1(gx + rx * 0.8)},${f1(gy)} ${f1(gx - rx * 0.8)},${f1(gy)}" fill="url(#tw-cone)"/><ellipse cx="${f1(gx)}" cy="${f1(gy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="url(#tw-pool)"/></g>`);
    });
  }
  s.push('</g>');
  // fixtures (drawn above the light so the lamp itself is visible)
  for (const [id, pts] of Object.entries(LIGHT_FIX)) {
    pts.forEach(([x, y]) => {
      const outdoor = id === 'L-O';
      if (outdoor) {
        const [bx, by] = iso(x, y, 0), [tx, ty] = iso(x, y, 95);
        s.push(`<g class="tw-eq" data-act="sheet" data-arg="${id}"><line x1="${f1(bx)}" y1="${f1(by)}" x2="${f1(tx)}" y2="${f1(ty)}" stroke="#5B6680" stroke-width="4"/><circle class="tw-lamp" data-light="${id}" cx="${f1(tx)}" cy="${f1(ty)}" r="7" fill="#4A5570"/></g>`);
      } else {
        const [tx, ty] = iso(x, y, 150);
        s.push(`<g class="tw-eq" data-act="sheet" data-arg="${id}"><line x1="${f1(tx)}" y1="${f1(ty - 26)}" x2="${f1(tx)}" y2="${f1(ty)}" stroke="#46526E" stroke-width="2"/><ellipse class="tw-lamp" data-light="${id}" cx="${f1(tx)}" cy="${f1(ty)}" rx="16" ry="6" fill="#4A5570" stroke="#8B97B3" stroke-width="1.5"/></g>`);
      }
    });
  }
  // alarm beacons
  for (const id of ['P-01', 'P-02', 'T-1', 'INJ-01', 'CHL-01', 'MDB-1']) {
    const [x, y] = EQ[id], z = id === 'T-1' ? 150 : id === 'MDB-1' ? 112 : id === 'INJ-01' ? 80 : 58;
    const [bx, by] = iso(x, y, z);
    s.push(`<g class="tw-beacon" data-eq="${id}" opacity="0"><circle cx="${f1(bx)}" cy="${f1(by - 6)}" r="34" fill="url(#tw-beacon)" class="tw-beacon-glow"/><rect x="${f1(bx - 5)}" y="${f1(by - 14)}" width="10" height="12" rx="3" fill="#FFB020"/></g>`);
  }
  // live labels
  const lab = (id, x, y, z) => { const [lx, ly] = iso(x, y, z); return `<g class="tw-label" data-act="sheet" data-arg="${id}" transform="translate(${f1(lx)},${f1(ly)})"><line x1="0" y1="0" x2="0" y2="-18" stroke="#8FB8FF" stroke-width="1.5"/><rect x="-46" y="-56" width="92" height="40" rx="8" fill="#0A1230" fill-opacity="0.88" stroke="#3B5BA8"/><text x="0" y="-40" class="tw-lt">${id}</text><text x="0" y="-23" class="tw-lv" id="tw-v-${id}">—</text></g>`; };
  s.push(lab('P-01', 330, 52, 46));
  s.push(lab('T-1', 455, 95, 160));
  s.push(lab('CHL-01', 480, 305, 70));
  s.push(lab('P-02', 400, 330, 46));
  s.push(lab('INJ-01', 100, 210, 92));
  s.push(lab('MDB-1', 13, 75, 120));
  s.push(lab('CNV-01', 220, 445, 36));
  s.push(lab('CMP-01', 475, 432, 70));
  return s.join('\n');
}

function pumpMarkup(id, x, y) {
  const [cx, cy] = iso(x, y, 30);
  return `<g class="tw-eq" data-act="sheet" data-arg="${id}">${box(x - 22, y - 16, 0, 44, 32, 6, ['#3A4560', '#262F45', '#2F3A55'])}${cyl(x + 10, y, 6, 12, 22, 'url(#tw-steel)', '#C3CEE0')}<g id="tw-${id}-body">${cyl(x - 8, y, 6, 14, 24, '#1F5FFF', '#5B9BFF')}</g><g data-cx="${f1(cx)}" data-cy="${f1(cy)}" id="tw-${id}-rot"><g transform="translate(${f1(iso(x - 8, y, 30)[0])},${f1(iso(x - 8, y, 30)[1])}) scale(1,0.57)"><g class="tw-rot">${[0, 60, 120, 180, 240, 300].map((a) => `<line x1="0" y1="0" x2="13" y2="0" stroke="#E6EEF8" stroke-width="2.5" stroke-linecap="round" transform="rotate(${a})"/>`).join('')}</g></g></g></g>`;
}
function valveMarkup(id, x, y, z) {
  const [vx, vy] = iso(x, y, z + 10);
  return `<g class="tw-eq" data-act="sheet" data-arg="${id}"><g transform="translate(${f1(vx)},${f1(vy)})"><path id="tw-${id}" d="M-13,-9 L0,0 L-13,9 Z M13,-9 L0,0 L13,9 Z" fill="#1F5FFF" stroke="#E6EEF8" stroke-width="1.6" stroke-linejoin="round"/><line x1="0" y1="0" x2="0" y2="-13" stroke="#E6EEF8" stroke-width="2"/><rect id="tw-${id}-hw" x="-8" y="-17" width="16" height="4" rx="2" fill="#F5B820"/></g></g>`;
}
function tankMarkup(x, y) {
  const r = 48, h = 140, rx = r * 1.2247, ry = r * 0.7071;
  const [bx, by] = iso(x, y, 0), [, ty] = iso(x, y, h);
  return `<g class="tw-eq" data-act="sheet" data-arg="T-1" id="tw-tank" data-bx="${f1(bx)}" data-by="${f1(by)}" data-h="${h}" data-rx="${f1(rx)}" data-ry="${f1(ry)}">
    <ellipse cx="${f1(bx)}" cy="${f1(by)}" rx="${f1(rx + 6)}" ry="${f1(ry + 4)}" fill="#0B1224" opacity="0.6"/>
    <path d="M${f1(bx - rx)},${f1(by)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(bx + rx)},${f1(by)} L${f1(bx + rx)},${f1(ty)} L${f1(bx - rx)},${f1(ty)} Z" fill="#141C2E"/>
    <path id="tw-water" d="" fill="url(#tw-water)" opacity="0.92"/>
    <ellipse id="tw-water-top" cx="${f1(bx)}" cy="${f1(by)}" rx="${f1(rx - 1)}" ry="${f1(ry - 1)}" fill="#5B9BFF" opacity="0.9"/>
    <path d="M${f1(bx - rx)},${f1(by)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(bx + rx)},${f1(by)} L${f1(bx + rx)},${f1(ty)} L${f1(bx - rx)},${f1(ty)} Z" fill="url(#tw-glass)" stroke="#8B97B3" stroke-width="1.5"/>
    <ellipse cx="${f1(bx)}" cy="${f1(ty)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="#C3CEE0" stroke-width="2"/>
    ${[0.25, 0.5, 0.75].map((k) => `<line x1="${f1(bx + rx - 2)}" y1="${f1(by - h * k)}" x2="${f1(bx + rx + 8)}" y2="${f1(by - h * k)}" stroke="#8B97B3" stroke-width="1.5"/>`).join('')}
    <line id="tw-hi" x1="${f1(bx - rx)}" x2="${f1(bx + rx)}" y1="0" y2="0" stroke="#F5B820" stroke-width="1.5" stroke-dasharray="5 4"/>
  </g>`;
}

// ---------------------------------------------------------------- component
export function createTwin(texts) {
  const host = document.createElement('div');
  host.className = 'twin';
  host.innerHTML = `<div class="twin-scroll"><svg class="twin-svg" viewBox="-30 -40 1080 810" role="img" aria-label="${texts.aria}" xmlns="${NS}">${sceneMarkup(texts)}</svg></div>`;
  const svg = host.querySelector('svg');
  const $ = (id) => svg.querySelector('#' + id);
  const state = { values: {}, alarmEq: new Set(), night: false, lightMode: 'auto' };
  const crates = [0, 1, 2].map((i) => $('tw-crate' + i));
  const tank = $('tw-tank');
  const tb = { bx: +tank.dataset.bx, by: +tank.dataset.by, h: +tank.dataset.h, rx: +tank.dataset.rx, ry: +tank.dataset.ry };
  let raf = 0, alive = true;
  const rotors = { 'P-01': $('tw-P-01-rot').querySelector('.tw-rot'), 'P-02': $('tw-P-02-rot').querySelector('.tw-rot'), fan: $('tw-fan').querySelector('.tw-rot') };
  const angle = { 'P-01': 0, 'P-02': 0, fan: 0 };
  let last = performance.now(), beltOff = 0, crateOff = 0;

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!host.isConnected) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const v = state.values, t = now / 1000;
    // rotating machines (angular speed eases with the running state)
    for (const [k, on] of [['P-01', v['P-01.RUN']], ['P-02', v['P-02.RUN']], ['fan', v['CHL-01.RUN']]]) {
      angle[k] = (angle[k] + (on ? (k === 'fan' ? 540 : 720) : 0) * dt) % 360;
      rotors[k].setAttribute('transform', `rotate(${angle[k].toFixed(1)})`);
    }
    // flowing water
    const flowOff = (-t * 42).toFixed(1);
    for (const el of svg.querySelectorAll('.tw-flow')) el.setAttribute('stroke-dashoffset', flowOff);
    // conveyor
    if (v['CNV-01.RUN']) { beltOff = (beltOff + dt * 30) % 16; crateOff = (crateOff + dt * 30) % 240; }
    $('tw-belt').setAttribute('stroke-dashoffset', (-beltOff).toFixed(1));
    crates.forEach((c, i) => {
      const xw = 40 + ((crateOff + i * 80) % 220);
      const [sx, sy] = iso(xw, 436, 22), [ox, oy] = iso(0, 0, 0);
      c.setAttribute('transform', `translate(${(sx - ox).toFixed(1)},${(sy - oy).toFixed(1)})`);
    });
    // compressor vibration
    $('tw-cmp').setAttribute('transform', v['CMP-01.RUN'] ? `translate(${(Math.sin(t * 60) * 0.6).toFixed(2)},${(Math.cos(t * 47) * 0.4).toFixed(2)})` : '');
    // tank water with a gentle wave
    const lvl = Math.max(0, Math.min(100, v['T-1.LEVEL'] ?? 0)) / 100;
    const wy = tb.by - tb.h * lvl, wave = Math.sin(t * 2.2) * 1.2;
    $('tw-water').setAttribute('d', `M${f1(tb.bx - tb.rx + 1)},${f1(tb.by)} A${f1(tb.rx - 1)},${f1(tb.ry - 1)} 0 0 0 ${f1(tb.bx + tb.rx - 1)},${f1(tb.by)} L${f1(tb.bx + tb.rx - 1)},${f1(wy)} L${f1(tb.bx - tb.rx + 1)},${f1(wy)} Z`);
    const top = $('tw-water-top');
    top.setAttribute('cy', f1(wy)); top.setAttribute('ry', f1(tb.ry - 1 + wave));
    // alarm beacons flash, mold heat breathes
    const pulse = 0.55 + 0.45 * Math.sin(t * 9);
    for (const b of svg.querySelectorAll('.tw-beacon')) b.setAttribute('opacity', state.alarmEq.has(b.dataset.eq) ? pulse.toFixed(2) : '0');
    const heat = Math.max(0, Math.min(1, ((v['INJ-01.MOLD_T'] ?? 40) - 48) / 20));
    $('tw-heat').setAttribute('opacity', (heat * (0.75 + 0.25 * Math.sin(t * 3))).toFixed(2));
    // pond ripple
    $('tw-pit').setAttribute('opacity', (0.75 + 0.1 * Math.sin(t * 1.7)).toFixed(2));
  }
  raf = requestAnimationFrame(frame);

  function update(values, alarms, opts) {
    state.values = values;
    state.alarmEq = new Set(alarms.filter((a) => a.state === 'active' && !a.acked).map((a) => a.tag.split('.')[0]));
    const hour = new Date().getHours();
    state.night = opts.dayNight === 'night' || (opts.dayNight !== 'day' && (hour < 6 || hour >= 18));
    const v = values;
    // sky + darkness
    for (const w of svg.querySelectorAll('.tw-win')) w.setAttribute('fill', state.night ? 'url(#tw-sky-night)' : 'url(#tw-sky-day)');
    $('tw-stars').setAttribute('opacity', state.night ? '1' : '0');
    $('tw-dark2').setAttribute('opacity', state.night ? '0.62' : '0.08');
    // lights
    for (const g of svg.querySelectorAll('.tw-light')) {
      const id = g.dataset.light, on = Boolean(v[id + '.ON']), lvl = id === 'L-O' ? 100 : (v[id + '.LEVEL'] ?? 100);
      const k = on ? (0.25 + 0.75 * lvl / 100) * (state.night ? 1 : 0.55) : 0;
      g.setAttribute('opacity', k.toFixed(2));
    }
    for (const lamp of svg.querySelectorAll('.tw-lamp')) {
      const id = lamp.dataset.light, on = Boolean(v[id + '.ON']), lvl = id === 'L-O' ? 100 : (v[id + '.LEVEL'] ?? 100);
      lamp.setAttribute('fill', on ? `rgba(255,${200 + Math.round(lvl * 0.4)},${120 + Math.round(lvl)},1)` : '#4A5570');
      lamp.style.filter = on ? 'drop-shadow(0 0 6px #FFD27A)' : 'none';
    }
    // pumps
    for (const id of ['P-01', 'P-02']) {
      const on = v[id + '.RUN'], bad = state.alarmEq.has(id);
      const body = $(`tw-${id}-body`);
      body.querySelector('path').setAttribute('fill', bad ? '#B45309' : on ? '#1F5FFF' : '#475569');
      body.querySelector('ellipse').setAttribute('fill', bad ? '#F59E0B' : on ? '#5B9BFF' : '#64748B');
    }
    // valves
    for (const id of ['V-101', 'V-102', 'V-103', 'V-201']) {
      const pos = v[id + '.POS'] ?? 0;
      $('tw-' + id).setAttribute('fill', pos === 0 ? '#475569' : pos >= 100 ? '#1F5FFF' : '#3B82F6');
      $('tw-' + id + '-hw').setAttribute('transform', `rotate(${(pos / 100 * 90).toFixed(0)})`);
    }
    // flows
    const lvl = v['T-1.LEVEL'] ?? 0;
    const flow = { 'tw-p-raw': v['P-01.RUN'] && (v['V-101.POS'] ?? 0) > 0, 'tw-p-in': v['P-01.RUN'] && (v['V-101.POS'] ?? 0) > 0, 'tw-p-sup': (v['V-102.POS'] ?? 0) > 0 && lvl > 2, 'tw-p-drn': (v['V-103.POS'] ?? 0) > 0 && lvl > 2, 'tw-p-cool': v['CHL-01.RUN'] && v['P-02.RUN'] && (v['V-201.POS'] ?? 0) > 0 };
    for (const [id, on] of Object.entries(flow)) { const el = $(id); el.setAttribute('opacity', on ? '1' : '0'); el.setAttribute('stroke', id === 'tw-p-cool' ? '#67E8F9' : '#8FD0FF'); }
    $('tw-hi').setAttribute('y1', f1(tb.by - tb.h * 0.85)); $('tw-hi').setAttribute('y2', f1(tb.by - tb.h * 0.85));
    // labels
    const n1 = (x) => (x == null ? '—' : Number(x).toFixed(1));
    const set = (id, txt) => { const el = $('tw-v-' + id); if (el) el.textContent = txt; };
    set('P-01', v['P-01.RUN'] ? `${n1(v['P-01.AMPS'])} A` : opts.t.stop);
    set('P-02', v['P-02.RUN'] ? `${n1(v['P-02.VIB'])} mm/s` : opts.t.stop);
    set('T-1', `${Math.round(lvl)} %`);
    set('CHL-01', v['CHL-01.RUN'] ? `${n1(v['CHL-01.SUPPLY_T'])} °C` : opts.t.stop);
    set('INJ-01', `${n1(v['INJ-01.MOLD_T'])} °C`);
    set('MDB-1', `${Math.round(v['MDB-1.KW'] ?? 0)} kW`);
    set('CNV-01', v['CNV-01.RUN'] ? opts.t.run : opts.t.stop);
    set('CMP-01', v['CMP-01.RUN'] ? opts.t.run : opts.t.stop);
    for (const g of svg.querySelectorAll('.tw-label')) {
      const bad = state.alarmEq.has(g.dataset.arg);
      g.querySelector('rect').setAttribute('stroke', bad ? '#F59E0B' : '#3B5BA8');
      g.querySelector('.tw-lv').setAttribute('fill', bad ? '#FFC266' : '#FFFFFF');
      g.style.display = opts.labels === false ? 'none' : '';
    }
    host.classList.toggle('night', state.night);
  }

  function setZoom(z) { svg.style.width = (z * 100).toFixed(0) + '%'; }
  function destroy() { alive = false; cancelAnimationFrame(raf); }
  return { el: host, update, setZoom, destroy };
}
