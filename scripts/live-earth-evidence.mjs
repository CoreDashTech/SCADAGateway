// CoreDash Live Earth – บอทบันทึกหลักฐานถาวร (รันบน GitHub Actions ทุก 30 นาที)
// ดึงข้อมูลจากแหล่งเปิดฟรี -> สร้างบันทึก -> ต่อโซ่ลายนิ้วมือ SHA-256 -> เขียนลงโฟลเดอร์ demo/live/evidence
// ไม่ใช้ไลบรารีภายนอก (Node 20+ มี fetch และ crypto ในตัว)
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OUT = process.env.EVIDENCE_DIR || 'demo/live/evidence';
const UA = { 'User-Agent': 'CoreDash-LiveEarth-EvidenceBot/1.0 (+https://www.coredashtech.com/demo/live/)' };
const STEP = 600000;
const iso = t => new Date(t).toISOString().slice(0, 19) + 'Z';
const sha = s => createHash('sha256').update(s).digest('hex');
const CITY = [['กรุงเทพฯ',13.75,100.5],['เชียงใหม่',18.79,98.98],['เชียงราย',19.91,99.83],['แม่ฮ่องสอน',19.3,97.97],['น่าน',18.78,100.78],['ลำปาง',18.29,99.49],['ตาก',16.88,99.13],['พิษณุโลก',16.82,100.26],['นครสวรรค์',15.7,100.14],['ขอนแก่น',16.44,102.83],['อุดรธานี',17.41,102.79],['หนองคาย',17.88,102.74],['อุบลราชธานี',15.24,104.85],['นครราชสีมา',14.97,102.1],['สุรินทร์',14.88,103.49],['ชลบุรี',13.36,100.98],['ระยอง',12.68,101.28],['ตราด',12.24,102.52],['กาญจนบุรี',14.02,99.53],['ประจวบฯ',11.81,99.8],['ชุมพร',10.49,99.18],['สุราษฎร์ธานี',9.14,99.33],['ภูเก็ต',7.88,98.39],['นครศรีฯ',8.43,99.96],['หาดใหญ่',7.01,100.47],['นราธิวาส',6.43,101.82]];
function hav(a,b,c,d){const R=6371,r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(x)))}
function nearTH(lat,lon){let b=null;for(const c of CITY){const d=hav(lat,lon,c[1],c[2]);if(!b||d<b.d)b={d,c:c[0]}}return b}

async function get(url, kind = 'json', ms = 25000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
        return kind === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer()); }
  finally { clearTimeout(t); }
}
const gibs = (L, tms, ext, time) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${L}/default/${time}/${tms}/0/0/0.${ext}`;
/* หาเวลาภาพล่าสุดที่มีจริง: ถามย้อนทีละช่วงเวลา ภาพที่มีเนื้อหาจริงต้องใหญ่กว่า 1,500 ไบต์ */
async function findLatest(L, tms, ext, start, step, tries) {
  for (let i = 0; i < tries; i++) { const t = start - i * step;
    try { const b = await get(gibs(L, tms, ext, iso(t)), 'buf', 15000); if (b.length > 1500) return { t, bytes: b.length, tile_sha256: sha(b) }; } catch (e) {} }
  return null;
}
async function part(name, fn) { try { return await fn(); } catch (e) { return { error: String(e.message || e) }; } }

const now = Date.now();
const sources = [];
const cloud = await part('cloud', () => findLatest('Himawari_AHI_Band13_Clean_Infrared', 'GoogleMapsCompatible_Level6', 'png', Math.floor((now - 15 * 60000) / STEP) * STEP, STEP, 24));
sources.push({ key: 'cloud', provider: 'NASA GIBS', satellite: 'Himawari-9 (JMA, geostationary 140.7E)', instrument: 'AHI Band 13 clean IR 10.4um',
  data_time_utc: cloud && cloud.t ? iso(cloud.t) : null, url: cloud && cloud.t ? gibs('Himawari_AHI_Band13_Clean_Infrared', 'GoogleMapsCompatible_Level6', 'png', iso(cloud.t)) : null,
  tile_sha256: cloud && cloud.tile_sha256 || null, status: cloud && cloud.t ? 'ok' : (cloud && cloud.error) || 'not found' });
const imerg = await part('imerg', () => findLatest('IMERG_Precipitation_Rate', 'GoogleMapsCompatible_Level6', 'png', Math.floor((now - 3 * 3600000) / 1800000) * 1800000, 1800000, 16));
sources.push({ key: 'imerg', provider: 'NASA GIBS', satellite: 'GPM constellation (NASA/JAXA)', instrument: 'IMERG precipitation rate',
  data_time_utc: imerg && imerg.t ? iso(imerg.t) : null, tile_sha256: imerg && imerg.tile_sha256 || null, status: imerg && imerg.t ? 'ok' : (imerg && imerg.error) || 'not found' });
const rv = await part('radar', () => get('https://api.rainviewer.com/public/weather-maps.json'));
const rvLast = rv && rv.radar && rv.radar.past && rv.radar.past.at(-1);
sources.push({ key: 'radar', provider: 'RainViewer', satellite: null, instrument: 'ground weather radar composite',
  data_time_utc: rvLast ? iso(rvLast.time * 1000) : null, url: rvLast ? rv.host + rvLast.path : null, status: rvLast ? 'ok' : (rv && rv.error) || 'no frames' });

const eqj = await part('eq', () => get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'));
let earthquakes = { status: eqj.error || 'ok' };
if (!eqj.error) { const F = eqj.features.map(f => { const p = f.properties, [lo, la, dp] = f.geometry.coordinates, n = nearTH(la, lo); return { usgs_id: f.id, mag: p.mag, place: p.place, time_utc: iso(p.time), depth_km: +(+dp).toFixed(1), lat: la, lon: lo, nearest_city: n.c, distance_km: Math.round(n.d), url: p.url, _t: p.time }; });
  earthquakes = { status: 'ok', source: 'USGS 2.5_week.geojson', feed_generated_utc: iso(eqj.metadata.generated), count_7d: F.length,
    m45_24h: F.filter(q => now - q._t < 864e5 && q.mag >= 4.5).length,
    near_thailand_1000km: F.filter(q => q.distance_km <= 1000 && q.mag >= 3.5).sort((a, b) => b._t - a._t).slice(0, 15).map(({ _t, ...q }) => q) }; }

const eo = await part('st', () => get('https://eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms&status=open&days=20'));
const storms = eo.error ? { status: eo.error } : { status: 'ok', list: eo.events.map(ev => { const g = (ev.geometry || []).filter(x => x.type === 'Point').sort((a, b) => new Date(a.date) - new Date(b.date)); const l = g.at(-1); if (!l) return null; const [lo, la] = l.coordinates, n = nearTH(la, lo);
  return { eonet_id: ev.id, title: ev.title, source: (ev.sources || []).map(s => s.id).join(','), position_time_utc: iso(new Date(l.date)), lat: la, lon: lo, wind_kt: l.magnitudeValue ?? null, nearest_city: n.c, distance_km: Math.round(n.d) }; })
  .filter(s => s && now - Date.parse(s.position_time_utc) < 4 * 864e5) };

const LAT = CITY.map(c => c[1]).join(','), LON = CITY.map(c => c[2]).join(',');
const wx = await part('wx', () => get(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code&timezone=Asia%2FBangkok`));
const aq = await part('aq', () => get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=pm2_5&timezone=Asia%2FBangkok`));
const W = Array.isArray(wx) ? wx : null, A = Array.isArray(aq) ? aq : null;
const weather = { status: W ? 'ok' : (wx.error || 'error'), source: 'Open-Meteo (model, not station)', model_time_local: W ? W[0].current.time + ' +07:00' : null,
  cities: W ? CITY.map((c, i) => ({ city: c[0], temp_c: W[i].current.temperature_2m, rain_mm: W[i].current.precipitation, wmo: W[i].current.weather_code, pm25: A ? A[i].current.pm2_5 : null })) : null };

/* ต่อโซ่หลักฐาน: บันทึกใหม่เก็บลายนิ้วมือของบันทึกก่อนหน้า ถ้ามีใครแก้บันทึกเก่า โซ่จะขาดทันที */
const latestPath = join(OUT, 'latest.json');
let prev = null; try { prev = JSON.parse(await readFile(latestPath, 'utf8')); } catch (e) {}
const th = new Date(now + 7 * 3600000).toISOString();
const rec = {
  record_id: 'LEG-' + th.slice(0, 10).replace(/-/g, '') + '-' + th.slice(11, 19).replace(/:/g, ''),
  created_utc: iso(now), generator: 'CoreDash Live Earth evidence bot (GitHub Actions)',
  run: { repo: process.env.GITHUB_REPOSITORY || null, run_id: process.env.GITHUB_RUN_ID || null, commit_before: process.env.GITHUB_SHA || null },
  sources, earthquakes, storms, weather,
  disclaimer: 'ข้อมูลจากแหล่งเปิด บันทึกอัตโนมัติ อาจล่าช้า/คลาดเคลื่อน ไม่ใช่ประกาศทางการ',
  prev_record_id: prev ? prev.record_id : null, prev_sha256: prev ? prev.sha256 : null,
};
rec.sha256 = sha(JSON.stringify(rec));

const dayFile = join(OUT, th.slice(0, 4), th.slice(5, 7), th.slice(0, 10) + '.jsonl');
await mkdir(dirname(dayFile), { recursive: true });
await appendFile(dayFile, JSON.stringify(rec) + '\n');
await writeFile(latestPath, JSON.stringify(rec, null, 2) + '\n');
let idx = { days: [] }; try { idx = JSON.parse(await readFile(join(OUT, 'index.json'), 'utf8')); } catch (e) {}
const rel = dayFile.slice(OUT.length + 1);
if (!idx.days.includes(rel)) idx.days.push(rel);
idx.updated_utc = rec.created_utc; idx.latest = rec.record_id; idx.count = (idx.count || 0) + 1;
await writeFile(join(OUT, 'index.json'), JSON.stringify(idx, null, 2) + '\n');
console.log(`saved ${rec.record_id} sha256=${rec.sha256.slice(0, 16)} cloud=${sources[0].data_time_utc} radar=${sources[2].data_time_utc} quakes=${earthquakes.count_7d ?? '-'}`);
