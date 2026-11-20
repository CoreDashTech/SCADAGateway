// CoreDash ส่องโชค · ดึงผลสลากกินแบ่งรัฐบาลจาก API ทางการของสำนักงานสลากกินแบ่งรัฐบาล (GLO)
// เอกสาร API: https://gdcatalog.glo.or.th/dataset/dataset_c4-9_01  (ใช้เพื่อการไม่แสวงหากำไร)
// เก็บผลเป็นไฟล์ JSON ใน demo/lotto/data พร้อม SHA-256 เพื่อให้ตรวจย้อนได้ว่าไฟล์ไม่ถูกแก้ไข
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const API = 'https://www.glo.or.th/api';
const OUT = process.env.LOTTO_OUT || 'demo/lotto/data';
const START = '2016-11-16';          // API ทางการเปิดข้อมูลรายงวดตั้งแต่งวดนี้
const MOCK = process.env.GLO_MOCK;   // ใช้ทดสอบในเครื่องเท่านั้น
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => createHash('sha256').update(s).digest('hex');

async function post(p, body) {
  if (MOCK) return mockPost(p, body);
  let err;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${API}/${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'CoreDash-Lotto/1.0 (+https://www.coredashtech.com; non-profit)' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(45000)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { err = e; console.log(`  retry ${i + 1} ${p} ${JSON.stringify(body)}: ${e.message}`); await sleep(4000 * (i + 1)); }
  }
  throw err;
}
async function mockPost(p, body) {
  if (p === 'lottery/getPeriodsByYear') {
    const all = JSON.parse(await readFile(path.join(MOCK, '_dates.json'), 'utf8'));
    return { response: { result: all.filter(d => d.startsWith(body.year)).map(date => ({ date })) } };
  }
  if (p === 'checking/getLotteryResult') {
    const f = path.join(MOCK, `${body.year}-${body.month}-${body.date}.json`);
    return { response: { result: existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null } };
  }
  if (p === 'lottery/getLatestLottery') return { response: null };
  throw new Error('mock: ' + p);
}

const nums = (r, k) => ((r.data?.[k]?.number) || []).map(x => String(x.value ?? '').trim()).filter(Boolean);
function complete(r) {
  // ถือว่าครบเมื่อมีรางวัลที่ 1 (6 หลัก) เลขท้าย 2 ตัว และรางวัลที่ 5 ครบ 100 รางวัล
  return r && /^\d{6}$/.test(nums(r, 'first')[0] || '') && /^\d{2}$/.test(nums(r, 'last2')[0] || '') && nums(r, 'fifth').length >= 100;
}
const n3 = r => r.n3 ? { s3: (r.n3.straight3?.number || []).map(x => x.value), t3: (r.n3.shuffle3?.number || []).map(x => x.value), s2: (r.n3.straight2?.number || []).map(x => x.value) } : undefined;

async function main() {
  await mkdir(path.join(OUT, 'draws'), { recursive: true });
  const idxF = path.join(OUT, 'index.json');
  const idx = existsSync(idxF) ? JSON.parse(await readFile(idxF, 'utf8')) : { draws: [] };
  const have = new Set(idx.draws.map(d => d.d));
  const now = new Date(Date.now() + 7 * 3600e3);                // เวลาไทย
  const Y = now.getUTCFullYear();
  const years = have.size ? (now.getUTCMonth() === 0 ? [Y - 1, Y] : [Y]) : Array.from({ length: Y - 2016 + 1 }, (_, i) => 2016 + i);

  const dates = new Set();
  for (const y of years) {
    try {
      const res = await post('lottery/getPeriodsByYear', { year: String(y), type: 'CHECKED' });
      for (const p of (res?.response?.result || [])) if (p?.date && p.date >= START) dates.add(String(p.date).slice(0, 10));
    } catch (e) { console.log('periods ' + y + ' failed: ' + e.message); }
    await sleep(800);
  }
  // งวดล่าสุด (เผื่อยังไม่อยู่ในรายการปี)
  try {
    const res = await post('lottery/getLatestLottery', {});
    const r = res?.response?.result || res?.response;
    const d = r?.date || r?.data?.date;
    if (d && String(d) >= START) dates.add(String(d).slice(0, 10));
  } catch (e) { console.log('latest failed: ' + e.message); }

  const todo = [...dates].filter(d => !have.has(d)).sort();
  console.log(`known ${have.size} draws, periods ${dates.size}, to fetch ${todo.length}`);
  let added = 0;
  for (const d of todo.slice(0, 320)) {
    const [y, m, dd] = d.split('-');
    let r;
    try { r = (await post('checking/getLotteryResult', { date: dd, month: m, year: y }))?.response?.result; }
    catch (e) { console.log(`  ${d} failed: ${e.message}`); continue; }
    if (!complete(r)) { console.log(`  ${d} not complete yet — skip`); await sleep(800); continue; }
    const retrieved_at = new Date().toISOString();
    const body = JSON.stringify(r);
    const rec = {
      source: 'สำนักงานสลากกินแบ่งรัฐบาล (Government Lottery Office)',
      source_url: 'https://www.glo.or.th/api/checking/getLotteryResult',
      request: { date: dd, month: m, year: y },
      retrieved_at, note: 'ข้อมูลดิบจาก API ทางการ ไม่ได้แก้ไขค่า · sha256 คำนวณจาก JSON ของช่อง result',
      sha256: sha(body), result: r
    };
    await mkdir(path.join(OUT, 'draws', y), { recursive: true });
    await writeFile(path.join(OUT, 'draws', y, `${d}.json`), JSON.stringify(rec));
    const e = { d, f: nums(r, 'first')[0], n1: nums(r, 'near1'), f3: nums(r, 'last3f'), b3: nums(r, 'last3b'), l2: nums(r, 'last2')[0], yt: r.youtube_url || null, pdf: r.pdf_url || null, h: rec.sha256.slice(0, 16), at: retrieved_at };
    const x = n3(r); if (x && x.s3.length) e.n3 = x;
    idx.draws = idx.draws.filter(z => z.d !== d).concat(e);
    added++; console.log(`  + ${d} first ${e.f} last2 ${e.l2}`);
    await sleep(900);
  }
  idx.draws.sort((a, b) => a.d.localeCompare(b.d));
  if (added || !existsSync(idxF)) {
    idx.updated_at = new Date().toISOString();
    idx.source = 'สำนักงานสลากกินแบ่งรัฐบาล · https://www.glo.or.th';
    idx.license = 'GLO Data Catalog — ใช้เพื่อการไม่แสวงหากำไร · https://gdcatalog.glo.or.th/dataset/dataset_c4-9_01';
    idx.count = idx.draws.length;
    await writeFile(idxF, JSON.stringify(idx));
    const last = idx.draws.at(-1);
    if (last) await writeFile(path.join(OUT, 'latest.json'), await readFile(path.join(OUT, 'draws', last.d.slice(0, 4), `${last.d}.json`), 'utf8'));
  }
  console.log(`done: added ${added}, total ${idx.draws.length}`);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `added=${added}\nlast=${idx.draws.at(-1)?.d || ''}\n`, { flag: 'a' });
}
main().catch(e => { console.error(e); process.exit(1); });
