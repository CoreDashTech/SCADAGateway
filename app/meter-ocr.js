// CoreDash Nexus — read a mechanical water meter (ASAHI GMK and similar) from a photo, on the device.
// Developed by CoreDash Technology. Uses Tesseract.js (Apache-2.0), loaded on demand from ./vendor/tesseract/.
//
// 1. find the number register: OCR the whole photo for digits and take the largest row of digit boxes
// 2. cut the register into one cell per drum (4 black = m³, 3 red = litres), clean each cell
//    (red and black ink both become dark: min(R,G,B), then Otsu threshold) and read each cell as one character
// 3. return the reading with a confidence per drum, so the user can check low-confidence drums before saving
const BASE = new URL('./vendor/tesseract/', import.meta.url).href;
let libP = null, workerP = null;

function loadLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!libP) libP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + 'tesseract.min.js'; s.onload = () => res(window.Tesseract); s.onerror = () => rej(new Error('ocr-load')); document.head.appendChild(s); });
  return libP;
}
export async function getWorker(onProgress) {
  if (!workerP) workerP = (async () => {
    const T = await loadLib();
    // language model shipped with the app (gzip, renamed .wasm so any static host serves it as-is).
    // Tesseract.js appends "/eng.traineddata.gz" to langPath; the "?" turns that into a query string.
    const w = await T.createWorker('eng', 1, {
      workerPath: BASE + 'worker.min.js', corePath: BASE, langPath: BASE + 'eng-traineddata.wasm?', gzip: true, workerBlobURL: false,
      logger: (m) => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.status, m.progress); }
    });
    await w.setParameters({ tessedit_char_whitelist: '0123456789' });
    return w;
  })();
  try { return await workerP; } catch (e) { workerP = null; throw e; }
}

export function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = src; });
}
function canvasOf(img, sx, sy, sw, sh, dw, dh) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(dw)); c.height = Math.max(1, Math.round(dh));
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
}
// dark ink (black or red) on light drums → black on white, Otsu threshold
function clean(c, pad = 0.18) {
  const g = c.getContext('2d', { willReadFrequently: true }), im = g.getImageData(0, 0, c.width, c.height), d = im.data, n = c.width * c.height;
  const v = new Uint8Array(n), hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) { const m = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); v[i] = m; hist[m]++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) ** 2; if (b > best) { best = b; th = i; } }
  for (let i = 0; i < n; i++) { const o = v[i] <= th ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = o; d[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  // white border so the character does not touch the edge
  const p = Math.round(c.height * pad), o = document.createElement('canvas'); o.width = c.width + 2 * p; o.height = c.height + 2 * p;
  const og = o.getContext('2d'); og.fillStyle = '#FFFFFF'; og.fillRect(0, 0, o.width, o.height); og.drawImage(c, p, p); return o;
}
// keep only the biggest dark blob near the centre of a drum cell (removes drum edges and half-rolled neighbours)
function isolate(c) {
  const g = c.getContext('2d', { willReadFrequently: true }), W = c.width, H = c.height, im = g.getImageData(0, 0, W, H), d = im.data;
  const lab = new Int32Array(W * H).fill(-1), blobs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (lab[i] !== -1 || d[i * 4] > 128) continue;
    const id = blobs.length, st = [i]; lab[i] = id; let cnt = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (st.length) { const j = st.pop(), jx = j % W, jy = (j / W) | 0; cnt++; sx += jx; sy += jy; if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
      for (const k of [j - 1, j + 1, j - W, j + W]) { if (k < 0 || k >= W * H || lab[k] !== -1 || d[k * 4] > 128) continue; if ((k === j - 1 && jx === 0) || (k === j + 1 && jx === W - 1)) continue; lab[k] = id; st.push(k); } }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, touchesSide = x0 <= 1 || x1 >= W - 2, touchesTB = y0 <= 1 || y1 >= H - 2;
    const dist = Math.abs(sx / cnt - W / 2) / W + Math.abs(sy / cnt - H / 2) / H;
    const glyphLike = bh / H > 0.3 && bh / H < 0.95 && bw / bh < 1.2;              // digit-shaped: taller than wide
    const bar = bw / Math.max(1, bh) > 2.2 || bh / Math.max(1, bw) > 8;              // frame edges and drum borders
    let score = cnt * (1.3 - dist);
    if (!glyphLike) score *= 0.2; if (bar) score *= 0.05; if (touchesTB) score *= 0.3; if (touchesSide) score *= 0.3;
    blobs.push({ cnt, x0, x1, y0, y1, score });
  }
  if (!blobs.length) return c;
  let keep = 0; for (let k = 1; k < blobs.length; k++) if (blobs[k].score > blobs[keep].score) keep = k;
  const K = blobs[keep];
  // other pieces of the same glyph lie inside the kept glyph's box
  const ok = blobs.map((b, k) => k === keep || (b.x0 >= K.x0 - 2 && b.x1 <= K.x1 + 2 && b.y0 >= K.y0 - 2 && b.y1 <= K.y1 + 2));
  for (let i = 0; i < W * H; i++) { const k = lab[i]; if (k !== -1 && !ok[k]) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; }
  g.putImageData(im, 0, 0); return c;
}

// ---------- template matching for drum digits (robust for the simple sans-serif drum font)
const TW = 20, TH = 32;
function glyphVec(c) {
  const g = c.getContext('2d', { willReadFrequently: true }), W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, o = document.createElement('canvas'); o.width = TW; o.height = TH;
  const og = o.getContext('2d', { willReadFrequently: true }); og.fillStyle = '#FFF'; og.fillRect(0, 0, TW, TH);
  const sc = Math.min(TW / bw, TH / bh), dw = bw * sc, dh = bh * sc;
  og.drawImage(c, x0, y0, bw, bh, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
  const od = og.getImageData(0, 0, TW, TH).data, v = new Float32Array(TW * TH);
  for (let i = 0; i < TW * TH; i++) v[i] = od[i * 4] < 170 ? 1 : 0;
  // soften (two 3×3 box passes) so stroke width and small shifts matter less
  let a = v;
  for (let pass = 0; pass < 2; pass++) { const b = new Float32Array(TW * TH); for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { let s2 = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue; s2 += a[yy * TW + xx]; n++; } b[y * TW + x] = s2 / n; } a = b; }
  return { v: a, aspect: bw / bh };
}
let TPL = null;
// stroke templates modelled on meter drum lettering (DIN-style: straight-stem 6/9/7, flagged 1), drawn at several
// stroke weights and slants, plus the device's sans-serif fonts
const STROKES = {
  0: [['e', 30, 42, 15, 30]], 1: [['p', 'M33,11 L33,73 M33,11 L21,22']],
  2: [['p', 'M15,24 C15,8 45,8 45,24 C45,38 15,55 15,73 L46,73']], 3: [['p', 'M15,17 C20,8 44,8 44,25 C44,37 34,41 26,41 C38,41 46,47 46,58 C46,76 18,78 14,65']],
  4: [['p', 'M38,73 L38,11 L12,55 L48,55']], 5: [['p', 'M44,11 L18,11 L16,38 C22,33 46,32 46,54 C46,76 20,78 14,66']],
  6: [['e', 30, 55, 15, 17], ['p', 'M15.5,53 L33,11']], 7: [['p', 'M14,11 L46,11 L25,73']],
  8: [['e', 30, 26, 13, 15], ['e', 30, 57, 15, 17]], 9: [['e', 30, 29, 15, 17], ['p', 'M44.5,31 L27,73']]
};
function templates() {
  if (TPL) return TPL;
  TPL = [];
  for (let d = 0; d < 10; d++) for (const lw of [5, 7.5, 10]) for (const sk of [-0.12, 0, 0.12]) {
    const c = document.createElement('canvas'); c.width = 60; c.height = 84; const g = c.getContext('2d');
    g.fillStyle = '#FFF'; g.fillRect(0, 0, 60, 84); g.strokeStyle = '#000'; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.setTransform(1, 0, sk, 1, -sk * 42, 0);
    for (const s of STROKES[d]) { if (s[0] === 'e') { g.beginPath(); g.ellipse(s[1], s[2], s[3], s[4], 0, 0, Math.PI * 2); g.stroke(); } else g.stroke(new Path2D(s[1])); }
    const gv = glyphVec(c); if (gv) TPL.push({ d, ...gv });
  }
  for (const f of ['600 64px sans-serif', '500 64px "Arial Narrow", "Roboto Condensed", sans-serif']) for (let d = 0; d < 10; d++) {
    const c = document.createElement('canvas'); c.width = 60; c.height = 84; const g = c.getContext('2d');
    g.fillStyle = '#FFF'; g.fillRect(0, 0, 60, 84); g.fillStyle = '#000'; g.font = f; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(d), 30, 44);
    const gv = glyphVec(c); if (gv) TPL.push({ d, ...gv, font: true });
  }
  return TPL;
}
function corr(a, b) { let sa = 0, sb = 0, n = a.length; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; } const ma = sa / n, mb = sb / n; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; } return da && db ? num / Math.sqrt(da * db) : 0; }
function classify(c) {
  const gv = glyphVec(c); if (!gv) return null;
  const best = new Array(10).fill(-1);
  for (const t of templates()) { const sc = corr(gv.v, t.v) - (t.font ? 0.03 : 0) - Math.abs(Math.log((gv.aspect + 0.05) / (t.aspect + 0.05))) * 0.25; if (sc > best[t.d]) best[t.d] = sc; }
  const order = best.map((s, d) => [s, d]).sort((p, q) => q[0] - p[0]);
  return { d: String(order[0][1]), score: order[0][0], margin: order[0][0] - order[1][0], all: best.map((v) => +v.toFixed(2)), aspect: +gv.aspect.toFixed(2) };
}

// Locate the register: OCR the whole photo for digits, keep the straightest row of large, evenly spaced digits,
// then straighten the photo so that row is level. Returns { image (canvas, straightened), box (fractions) }.
async function digitSymbols(w, c) {
  await w.setParameters({ tessedit_pageseg_mode: '11' });
  const { data } = await w.recognize(c);
  const g = c.getContext('2d', { willReadFrequently: true });
  return (data.symbols || []).filter((b) => /^\d$/.test(b.text)).map((b) => {
    const bb = b.bbox, q = { x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1, h: bb.y1 - bb.y0, w: bb.x1 - bb.x0, cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2 };
    const im = g.getImageData(q.x0, q.y0, Math.max(1, q.w), Math.max(1, q.h)).data; let red = 0, ink = 0;
    for (let i = 0; i < im.length; i += 4) { const m = Math.min(im[i], im[i + 1], im[i + 2]), r = im[i] - Math.max(im[i + 1], im[i + 2]); if (m < 150 || r > 60) { ink++; if (r > 50) red++; } }
    q.red = ink > 0 && red / ink > 0.3; return q;
  });
}
function bestRow(syms) {
  let best = null;
  const seen = new Set();
  for (const a of syms) for (const b of syms) {
    if (a === b || b.cx <= a.cx) continue;
    const dx = b.cx - a.cx, dy = b.cy - a.cy, h = (a.h + b.h) / 2;
    if (Math.abs(a.h - b.h) > h * 0.3 || Math.abs(dy) > dx * 0.3 || dx < h * 0.45 || dx > h * 1.3) continue; // two neighbouring drums
    const ang = Math.atan2(dy, dx), cs = Math.cos(ang), sn = Math.sin(ang);
    const cand = syms.filter((q) => { const py = -(q.cx - a.cx) * sn + (q.cy - a.cy) * cs; return Math.abs(py) < h * 0.3 && Math.abs(q.h - h) < h * 0.3; })
      .map((q) => ({ q, px: (q.cx - a.cx) * cs + (q.cy - a.cy) * sn })).sort((p, r) => p.px - r.px);
    // chain of symbols on an even drum grid through a and b (pitch = dx), allowing one missed drum
    const pitch = dx, chain = [];
    const ia = cand.findIndex((c) => c.q === a);
    if (ia < 0) continue;
    chain.push(cand[ia]);
    for (const dir of [1, -1]) {
      let last = cand[ia];
      for (let i = ia + dir; i >= 0 && i < cand.length; i += dir) {
        const g = (cand[i].px - last.px) * dir / pitch, n = Math.round(g);
        if (n < 1) continue;
        if (n > 2 || Math.abs(g - n) > 0.22) break;
        if (dir > 0) chain.push(cand[i]); else chain.unshift(cand[i]);
        last = cand[i];
      }
    }
    const span = (chain[chain.length - 1].px - chain[0].px) / pitch;
    if (chain.length < 3 || span > 6.4) continue;
    const key = chain.map((c) => syms.indexOf(c.q)).join(',');
    if (seen.has(key)) continue; seen.add(key);
    const row = chain.map((c) => c.q);
    const hs = row.map((q) => q.h).sort((p, q) => p - q), hm = hs[hs.length >> 1];
    const spread = row.reduce((t, q) => t + Math.abs(q.h - hm), 0) / row.length / hm;
    // the register has black drums followed by red drums: rows showing that pattern are much more likely
    const fr = row.findIndex((q) => q.red), pattern = fr > 0 && row.slice(fr).every((q) => q.red) ? 2 : fr === -1 ? 1 : 0.6;
    const score = row.length * row.length * hm * hm * (1 - spread) * pattern;
    if (!best || score > best.score) {
      const mx = row.reduce((t, q) => t + q.cx, 0) / row.length, my = row.reduce((t, q) => t + q.cy, 0) / row.length;
      let sxy = 0, sxx = 0; for (const q of row) { sxy += (q.cx - mx) * (q.cy - my); sxx += (q.cx - mx) ** 2; }
      const fit = row.length >= 4 && sxx > 0 ? Math.atan(sxy / sxx) : ang;
      const cys = row.map((q) => q.cy).sort((p, q) => p - q);
      best = { row, h: hm, cy: cys[cys.length >> 1], ang: fit, score, pitch: Math.hypot(dx, dy) };
    }
  }
  return best;
}
export async function locateRegister(img, onProgress) {
  const w = await getWorker(onProgress);
  const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
  const scale = 1600 / Math.max(W0, H0);
  const c = canvasOf(img, 0, 0, W0, H0, W0 * scale, H0 * scale);
  let best = bestRow(await digitSymbols(w, c));
  if (!best) return null;
  // straighten: rotate the photo so the drum row is horizontal, then search again on the level image
  let rc = c, total = 0;
  for (let pass = 0; pass < 2 && Math.abs(best.ang) > 0.012; pass++) {
    total += best.ang;
    rc = document.createElement('canvas'); rc.width = c.width; rc.height = c.height;
    const g = rc.getContext('2d'); g.fillStyle = '#E5E5E5'; g.fillRect(0, 0, rc.width, rc.height);
    g.translate(rc.width / 2, rc.height / 2); g.rotate(-total); g.drawImage(c, -c.width / 2, -c.height / 2);
    const b2 = bestRow(await digitSymbols(w, rc)); if (!b2) break; best = b2;
  }
  const ang = total;
  const row = best.row;
  const g = rc.getContext('2d', { willReadFrequently: true });
  for (const q of row) { const im = g.getImageData(q.x0, q.y0, Math.max(1, q.w), Math.max(1, q.h)).data; let red = 0, ink = 0; for (let i = 0; i < im.length; i += 4) { const m = Math.min(im[i], im[i + 1], im[i + 2]); const r = im[i] - Math.max(im[i + 1], im[i + 2]); if (m < 150 || r > 60) { ink++; if (r > 50) red++; } } q.red = ink > 0 && red / ink > 0.3; }
  const cx = row.map((q) => q.cx), gaps = cx.slice(1).map((v, i) => v - cx[i]).filter((v) => v > best.h * 0.45);
  // gaps may span missing drums: divide by the nearest whole number of drum pitches
  const g0 = gaps.length ? Math.min(...gaps) : best.h * 0.9;
  const pitch = gaps.length ? gaps.reduce((s2, v) => s2 + v / Math.max(1, Math.round(v / best.pitch)), 0) / gaps.length : best.pitch;
  // index of each found symbol on the 7-drum grid: black drums are 0..3, red drums 4..6
  const firstRed = row.findIndex((q) => q.red);
  let i0;
  if (firstRed > 0 || (firstRed === 0 && row.length)) i0 = 4 - Math.round((row[Math.max(0, firstRed)].cx - row[0].cx) / pitch);
  else i0 = Math.max(0, 4 - row.length); // only black drums found: assume they end at drum 3
  i0 = Math.max(0, Math.min(6, i0));
  let L = row[0].cx - (i0 + 0.5) * pitch, R = L + 7 * pitch;
  // refine with the black register frame: walk out from the digits until a thick dark band (the frame) is met
  {
    const yA = Math.max(0, Math.round(best.cy - best.h * 0.55)), yB = Math.min(rc.height - 1, Math.round(best.cy + best.h * 0.55)), bh2 = yB - yA + 1;
    const band = g.getImageData(0, yA, rc.width, bh2).data, dark = new Float32Array(rc.width);
    for (let x = 0; x < rc.width; x++) { let n = 0; for (let y = 0; y < bh2; y++) { const i = (y * rc.width + x) * 4; if (Math.min(band[i], band[i + 1], band[i + 2]) < 75) n++; } dark[x] = n / bh2; }
    const need = Math.max(3, Math.round(best.h * 0.14));
    const walk = (x, dir) => { let run = 0; for (let k = 0; k < best.h * 9; k++, x += dir) { if (x < 0 || x >= rc.width) return null; if (dark[x] > 0.8) { run++; if (run >= need) return x - dir * (run - 1); } else run = 0; } return null; };
    const fl = walk(Math.round(row[0].x0), -1), fr = walk(Math.round(row[row.length - 1].x1), 1);
    if (fl != null && fr != null) { const span = fr - fl, ratio = span / best.h; if (ratio > 4.5 && ratio < 10) { L = fl + 1; R = fr - 1; } }
    else if (fl != null && fr == null) { const nL = fl + 1; if (Math.abs(nL - L) < pitch * 1.6) { R += nL - L; L = nL; } }
  }
  const y0 = best.cy - best.h / 2, y1 = best.cy + best.h / 2, pad = best.h * 0.2;
  const box = { x: Math.max(0, L / rc.width), y: Math.max(0, (y0 - pad) / rc.height), w: Math.min(1, (R - L) / rc.width), h: Math.min(1, (y1 - y0 + 2 * pad) / rc.height) };
  box.w = Math.min(box.w, 1 - box.x);
  return { image: rc, box, angle: ang * 180 / Math.PI, found: row.map((q) => (q.red ? 'r' : 'b')).join('') };
}

// Read the 7 drums inside box (fractions of the image). Returns { digits, conf[], m3, litres, cells[] (data URLs for display) }
export async function readRegister(img, box, opts = {}) {
  const n = opts.drums || 7, w = await getWorker(opts.onProgress);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const bx = box.x * W, by = box.y * H, bw = box.w * W, bh = box.h * H, cw = bw / n;
  const digits = [], conf = [], cells = [];
  for (let k = 0; k < n; k++) {
    const mx = cw * 0.1;
    const cell = canvasOf(img, bx + k * cw + mx, by, cw - 2 * mx, bh, 64, 64 * bh / (cw - 2 * mx));
    const cl = isolate(clean(cell));
    const big = document.createElement('canvas'); big.width = cl.width * 2; big.height = cl.height * 2; const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(cl, 0, 0, big.width, big.height);
    // 1) template matching, 2) Tesseract as a second opinion; agreement → high confidence
    const tm = classify(cl);
    let t = '', cf = 0;
    for (const psm of ['10', '8']) {
      await w.setParameters({ tessedit_pageseg_mode: psm });
      const { data } = await w.recognize(big);
      t = (data.text || '').replace(/\D/g, '');
      if (t) { cf = Math.round(data.confidence); t = t[0]; break; }
    }
    let dg = '?', c2 = 0;
    if (tm && t && tm.d === t) { dg = t; c2 = Math.min(99, Math.max(cf, 85)); }
    else if (tm && (tm.margin > 0.06 || !t || cf < 60)) { dg = tm.d; c2 = Math.round(Math.min(90, 40 + tm.margin * 300)); }
    else if (t) { dg = t; c2 = Math.min(80, cf); }
    digits.push(dg); conf.push(c2); cells.push(cl.toDataURL('image/png'));
    if (opts.debug) opts.debug.push({ tm: tm && { d: tm.d, all: tm.all, a: tm.aspect }, t, cf });
  }
  const s = digits.join('');
  const ok = !s.includes('?');
  const m3 = ok ? Number(s.slice(0, n - 3) + '.' + s.slice(n - 3)) : null;
  return { digits, conf, cells, m3, litres: m3 != null ? m3 * 1000 : null };
}

// Crop the guide rectangle from a live <video> into an image (for the camera flow)
export function frameFromVideo(video) {
  const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0); return c.toDataURL('image/jpeg', 0.92);
}
