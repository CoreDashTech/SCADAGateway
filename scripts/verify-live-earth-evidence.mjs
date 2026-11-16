// ตรวจโซ่หลักฐานทั้งหมด: ลายนิ้วมือของทุกบันทึก และการต่อกันของโซ่
// วิธีใช้: node scripts/verify-live-earth-evidence.mjs
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const OUT = process.env.EVIDENCE_DIR || 'demo/live/evidence';
const idx = JSON.parse(await readFile(join(OUT, 'index.json'), 'utf8'));
let prev = null, n = 0, bad = 0;
for (const d of idx.days) {
  for (const line of (await readFile(join(OUT, d), 'utf8')).split('\n').filter(Boolean)) {
    const r = JSON.parse(line); const h = r.sha256; delete r.sha256; n++;
    const ok = createHash('sha256').update(JSON.stringify(r)).digest('hex') === h;
    const chain = prev === null || r.prev_sha256 === prev;
    if (!ok || !chain) { bad++; console.log(`❌ ${r.record_id} ${ok ? '' : 'ลายนิ้วมือไม่ตรง'} ${chain ? '' : 'โซ่ขาด'}`); }
    prev = h;
  }
}
console.log(bad ? `พบปัญหา ${bad} จาก ${n} บันทึก` : `✅ ตรวจครบ ${n} บันทึก ลายนิ้วมือและโซ่ถูกต้องทั้งหมด`);
process.exit(bad ? 1 : 0);
