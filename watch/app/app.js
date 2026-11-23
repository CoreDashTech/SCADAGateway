// CoreDash Watch · แดชบอร์ดลูกค้า (หน้าเว็บล้วน คุยกับ Supabase โดยตรง สิทธิ์คุมด้วย RLS ฝั่งฐานข้อมูล)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const C = window.CD_WATCH || {}
const $view = document.getElementById('view')
const COLS = 'id,name,kind,key_hint,link_code,pump_on_amp,baht_per_kwh,created_at,trial_ends_at,paid_until,last_seen,last,mains_ok,pump_running'
const KIND = { pump: 'เฝ้าปั๊มน้ำ', power: 'วัดไฟ' }
const OFFLINE_MIN = 3
let timer = null
let isAdmin = false

document.getElementById('fphone').textContent = 'โทร ' + (C.phone || '')

/* ───────── เครื่องมือ ───────── */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const n = (x, d = 0) => (x == null || !isFinite(x)) ? '—' : Number(x).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })
const dt = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
const day = (ms) => new Date(ms).toLocaleDateString('th-TH', { dateStyle: 'medium' })
const hm = (ms) => new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
const isUuid = (s) => /^[0-9a-f-]{36}$/.test(s)
function access(d, now = Date.now()) {
  const paid = d.paid_until ? Date.parse(d.paid_until) : 0, trial = Date.parse(d.trial_ends_at)
  if (paid > now) return { kind: 'paid', until: paid }
  if (trial > now) return { kind: 'trial', until: trial }
  return { kind: 'expired', until: Math.max(paid, trial) }
}
const online = (d) => !!d.last_seen && Date.now() - Date.parse(d.last_seen) < OFFLINE_MIN * 60000
const accText = (a) => a.kind === 'trial' ? `ทดลองฟรี เหลือ ${Math.max(0, Math.ceil((a.until - Date.now()) / 864e5))} วัน` : a.kind === 'paid' ? `ใช้งานได้ถึง ${day(a.until)}` : 'หมดช่วงทดลอง'
const msg = (el, text, kind = 'ok') => { el.innerHTML = text ? `<div class="alert ${kind}">${esc(text)}</div>` : '' }
const stop = () => { if (timer) { clearInterval(timer); timer = null } }

/* ───────── ตรวจค่าตั้ง ───────── */
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(C.supabaseUrl || '') && C.supabaseKey && !/YOUR/.test(C.supabaseKey)
if (!configured) {
  $view.innerHTML = `<div class="card auth"><h2>ยังไม่ได้ตั้งค่า</h2><p class="muted">ผู้ดูแลเว็บต้องใส่ Supabase URL และ Publishable key ในไฟล์ <code class="chip">watch/config.js</code> ก่อน</p></div>`
  throw new Error('not configured')
}
const sb = createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })

/* ───────── เข้าสู่ระบบ ───────── */
function authView(mode = 'in') {
  stop()
  $view.innerHTML = `
  <div class="card auth">
    <h2 style="margin-bottom:6px">${mode === 'up' ? 'สมัครใช้งานฟรี' : 'เข้าสู่ระบบ'}</h2>
    <p class="muted" style="margin-top:0">${mode === 'up' ? `ทดลองฟรี ${esc(C.trialDays || 90)} วันต่ออุปกรณ์ ไม่ต้องผูกบัตร` : 'ดูอุปกรณ์และการแจ้งเตือนของคุณ'}</p>
    <div class="tabs"><button class="btn ghost sm ${mode === 'in' ? 'on' : ''}" data-m="in">เข้าสู่ระบบ</button><button class="btn ghost sm ${mode === 'up' ? 'on' : ''}" data-m="up">สมัครใหม่</button></div>
    <form id="af">
      <div class="row"><label for="em">อีเมล</label><input id="em" type="email" autocomplete="email" required></div>
      <div class="row"><label for="pw">รหัสผ่าน ${mode === 'up' ? '(อย่างน้อย 8 ตัว)' : ''}</label><input id="pw" type="password" minlength="${mode === 'up' ? 8 : 1}" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required></div>
      <div id="am"></div>
      <button class="btn pri" style="width:100%">${mode === 'up' ? 'สมัครและเริ่มทดลอง' : 'เข้าสู่ระบบ'}</button>
    </form>
    ${mode === 'in' ? '<p class="small" style="margin-top:14px"><a href="#" id="forgot">ลืมรหัสผ่าน?</a></p>' : ''}
  </div>`
  $view.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => authView(b.dataset.m))
  const am = document.getElementById('am')
  document.getElementById('af').onsubmit = async (e) => {
    e.preventDefault()
    const btn = e.target.querySelector('button'); btn.disabled = true
    const email = document.getElementById('em').value.trim(), password = document.getElementById('pw').value
    try {
      if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
        if (error) throw error
        if (!data.session) msg(am, 'สมัครแล้ว กรุณาเปิดอีเมลเพื่อยืนยัน แล้วกลับมาเข้าสู่ระบบ')
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) { msg(am, thaiAuthError(err), 'err') } finally { btn.disabled = false }
  }
  const fg = document.getElementById('forgot')
  if (fg) fg.onclick = async (e) => {
    e.preventDefault()
    const email = document.getElementById('em').value.trim()
    if (!email) return msg(am, 'ใส่อีเมลก่อน แล้วกด “ลืมรหัสผ่าน?” อีกครั้ง', 'warn')
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
    msg(am, error ? thaiAuthError(error) : 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว', error ? 'err' : 'ok')
  }
}
function thaiAuthError(e) {
  const m = String(e?.message || '')
  if (/Invalid login/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ในอีเมลก่อน'
  if (/already registered/i.test(m)) return 'อีเมลนี้สมัครแล้ว ลองเข้าสู่ระบบ'
  if (/rate limit|too many/i.test(m)) return 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่'
  if (/Password/i.test(m)) return 'รหัสผ่านสั้นหรือง่ายเกินไป'
  return 'ทำรายการไม่สำเร็จ: ' + m
}
function newPasswordView() {
  stop()
  $view.innerHTML = `<div class="card auth"><h2>ตั้งรหัสผ่านใหม่</h2><form id="np"><div class="row"><label for="np1">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input id="np1" type="password" minlength="8" autocomplete="new-password" required></div><div id="nm"></div><button class="btn pri" style="width:100%">บันทึก</button></form></div>`
  document.getElementById('np').onsubmit = async (e) => {
    e.preventDefault()
    const { error } = await sb.auth.updateUser({ password: document.getElementById('np1').value })
    if (error) return msg(document.getElementById('nm'), thaiAuthError(error), 'err')
    location.hash = '#/'; route()
  }
}

/* ───────── รายการอุปกรณ์ ───────── */
async function listView() {
  stop()
  const { data, error } = await sb.from('watch_devices').select(COLS).order('created_at')
  if (error) { $view.innerHTML = `<div class="alert err">โหลดข้อมูลไม่สำเร็จ: ${esc(error.message)}</div>`; return }
  const cards = (data || []).map((d) => {
    const a = access(d), on = online(d)
    return `<a class="card dcard ${on ? 'on' : 'off'}" href="#/d/${d.id}">
      <div class="dtop"><span class="dot ${on ? 'on' : 'off'}"></span><b>${esc(d.name)}</b><span class="tag">${KIND[d.kind]}</span></div>
      <div class="dbig">${d.last?.w != null ? n(d.last.w) + ' W' : '—'}</div>
      <div class="small">${!d.last_seen ? 'ยังไม่เคยส่งข้อมูล' : on ? 'ออนไลน์' : 'ขาดการติดต่อ'}${d.kind === 'pump' && on && d.pump_running != null ? ` · ปั๊ม${d.pump_running ? 'ทำงาน' : 'หยุด'}` : ''}${on && d.mains_ok === false ? ' · <b style="color:var(--red)">ไฟเมนดับ</b>' : ''}${on && d.mains_ok !== false && d.last?.brk === false ? ' · <b style="color:var(--red)">เบรกเกอร์ตัด</b>' : ''}${on && d.last?.leak >= 9 ? ` · <b style="color:var(--amber)">ไฟรั่ว ${n(d.last.leak, 1)} mA</b>` : ''}</div>
      <span class="acc ${a.kind}">${accText(a)}</span></a>`
  }).join('')
  $view.innerHTML = `
    <span class="eyebrow">อุปกรณ์ของฉัน</span>
    <h2 style="margin-top:6px">เฝ้าไฟและปั๊มน้ำผ่านมือถือ</h2>
    ${isAdmin ? '<p><a href="#/admin">→ หน้าผู้ดูแล: ต่ออายุหลังรับชำระเงิน</a></p>' : ''}
    <div class="dgrid">${cards}<div id="addslot"></div></div>`
  addButton(document.getElementById('addslot'))
}

function addButton(slot) {
  slot.outerHTML = `<button type="button" class="card dcard add" id="addbtn"><span class="plus">+</span><b>เพิ่มอุปกรณ์</b><span class="small">ทดลองใช้ฟรี ${esc(C.trialDays || 90)} วัน</span></button>`
  document.getElementById('addbtn').onclick = (e) => {
    const box = e.currentTarget
    const f = document.createElement('form'); f.className = 'card dcard'
    f.innerHTML = `<div class="row"><label for="nn">ตั้งชื่อ</label><input id="nn" maxlength="80" placeholder="เช่น ปั๊มบ่อหลังบ้าน" required></div>
      <div class="row"><label for="nk">ใช้ทำอะไร</label><select id="nk"><option value="pump">เฝ้าปั๊มน้ำ + แจ้งไฟดับ</option><option value="power">วัดไฟเครื่องใช้ + แจ้งไฟดับ</option></select></div>
      <div id="nm"></div><div style="display:flex;gap:8px"><button class="btn pri sm">สร้าง</button><button type="button" class="btn ghost sm" id="nc">ยกเลิก</button></div>`
    box.replaceWith(f)
    document.getElementById('nc').onclick = () => listView()
    f.onsubmit = async (ev) => {
      ev.preventDefault()
      const b = f.querySelector('button'); b.disabled = true
      const { data, error } = await sb.rpc('watch_create_device', { p_name: document.getElementById('nn').value, p_kind: document.getElementById('nk').value })
      if (error) { b.disabled = false; return msg(document.getElementById('nm'), error.message, 'err') }
      f.replaceWith(keyCard(data.key, data.id))
    }
  }
}

function keyCard(key, id) {
  const el = document.createElement('div'); el.className = 'card dcard'; el.style.borderColor = 'var(--amber)'
  el.innerHTML = `<b>รหัสอุปกรณ์ (แสดงครั้งเดียว)</b><code class="key">${esc(key)}</code>
    <button class="btn pri sm" data-a="dl">ดาวน์โหลดโปรแกรม ESP32 (ฝังรหัสให้แล้ว)</button>
    <button class="btn ghost sm" data-a="dll">โปรแกรม CoreDash Link (ESP32-C3)</button>
    <button class="btn ghost sm" data-a="dlk">โปรแกรมวัดไฟรั่ว + เบรกเกอร์ตัด (ESP32)</button>
    <button class="btn ghost sm" data-a="cp">คัดลอกรหัส</button>
    <p class="small">ระบบเก็บรหัสนี้แบบเข้ารหัส แสดงอีกไม่ได้ ถ้าหาย ให้กด “ออกรหัสใหม่” ในหน้าอุปกรณ์</p>
    ${id ? `<a class="btn ghost sm" href="#/d/${id}">ไปหน้าอุปกรณ์ →</a>` : ''}`
  el.querySelector('[data-a=dl]').onclick = () => window.cdDownloadFirmware(key)
  el.querySelector('[data-a=dll]').onclick = () => window.cdDownloadFirmware(key, 'coredash-link.ino')
  el.querySelector('[data-a=dlk]').onclick = () => window.cdDownloadFirmware(key, 'coredash-leak.ino')
  el.querySelector('[data-a=cp]').onclick = (e) => navigator.clipboard?.writeText(key).then(() => { e.target.textContent = 'คัดลอกแล้ว ✓' })
  return el
}

/* ───────── เกณฑ์ไฟรั่ว (แสดงเมื่อฐานข้อมูลรัน leak-upgrade.sql แล้วเท่านั้น) ───────── */
async function leakSettings(id) {
  const f = document.getElementById('leakf')
  const { data: s, error } = await sb.from('watch_devices').select('leak_warn_ma,leak_trip_ma,max_amp').eq('id', id).maybeSingle()
  if (error || !s || !f) return
  document.getElementById('lw').value = s.leak_warn_ma; document.getElementById('lt').value = s.leak_trip_ma; document.getElementById('lm').value = s.max_amp
  f.hidden = false
  f.onsubmit = async (e) => {
    e.preventDefault()
    const lw = Number(document.getElementById('lw').value), lt = Number(document.getElementById('lt').value), lm = Number(document.getElementById('lm').value)
    if (!(lw >= 1 && lt > lw && lt <= 300 && lm >= 0.5 && lm <= 200)) return msg(document.getElementById('lmsg'), 'ค่าไม่ถูกต้อง: ระดับอันตรายต้องมากกว่าระดับเตือน', 'err')
    const { error: er } = await sb.from('watch_devices').update({ leak_warn_ma: lw, leak_trip_ma: lt, max_amp: lm }).eq('id', id)
    msg(document.getElementById('lmsg'), er ? 'บันทึกไม่สำเร็จ' : 'บันทึกแล้ว อุปกรณ์จะใช้เกณฑ์ใหม่ในการส่งรอบถัดไป', er ? 'err' : 'ok')
  }
}

/* ───────── หน้าอุปกรณ์ ───────── */
async function deviceView(id) {
  stop()
  const { data: d, error } = await sb.from('watch_devices').select(COLS).eq('id', id).maybeSingle()
  if (error || !d) { $view.innerHTML = '<div class="alert err">ไม่พบอุปกรณ์</div><p><a href="#/">← กลับ</a></p>'; return }
  const a = access(d)
  const { data: ch } = await sb.rpc('watch_channels', { p_id: id })
  const linked = ch || { tg: false, line: false }
  $view.innerHTML = `
    <p class="small"><a href="#/">← อุปกรณ์ทั้งหมด</a></p>
    <span class="eyebrow">${KIND[d.kind]} · รหัสลงท้าย …${esc(d.key_hint)}</span>
    <h2 style="margin:6px 0 8px">${esc(d.name)}</h2>
    ${a.kind === 'expired' ? `
      <div class="card paywall"><h3 style="color:var(--red)">หมดช่วงทดลองใช้ฟรีแล้ว</h3>
      <p>อุปกรณ์ยังส่งข้อมูลอยู่ แต่ระบบหยุดเก็บประวัติและหยุดแจ้งเตือน ใช้งานต่อ <b>${esc(C.priceMonth)} บาท/เดือน</b> หรือ <b>${esc(C.priceYear)} บาท/ปี</b> ต่ออุปกรณ์</p>
      <p>โทรหรือ LINE <b>${esc(C.phone)}</b> แจ้งรหัสลงท้าย <b>…${esc(d.key_hint)}</b> เพื่อรับช่องทางชำระเงิน เปิดใช้ให้ภายในวันเดียวกัน</p>
      <a class="btn pri" href="tel:${esc(C.tel)}">โทร ${esc(C.phone)}</a></div>` : `<span class="acc ${a.kind}">${accText(a)}</span>`}
    <div class="card mt" id="live"><p class="muted">กำลังโหลด…</p></div>
    <div class="card mt"><h3>กำลังไฟย้อนหลัง (วัตต์)</h3><div id="chart"></div><div class="tip" id="tip"></div></div>
    <div class="grid3 mt" id="sum"></div>
    <div class="card mt evs"><h3>เหตุการณ์ล่าสุด</h3><div id="evs"></div></div>
    <div class="card mt"><h3>ช่องทางรับแจ้งเตือน</h3>
      <p class="small">รหัสผูกของอุปกรณ์นี้: <code class="chip">${esc(d.link_code)}</code></p>
      <div class="grid2">
        <div class="chan"><b>Telegram</b> <span class="tag green">ฟรี ไม่จำกัด</span>
          ${linked.tg ? '<p>✅ ผูกแล้ว</p><button class="btn ghost sm" data-un="telegram">ยกเลิกการผูก</button>'
            : C.telegramBot ? `<p><a class="btn pri sm" target="_blank" rel="noopener" href="https://t.me/${encodeURIComponent(C.telegramBot)}?start=${encodeURIComponent(d.link_code)}">ผูก Telegram</a></p><p class="small">กดแล้วกด Start ในแอป Telegram</p>` : '<p class="small">ยังไม่เปิดใช้</p>'}</div>
        <div class="chan"><b>LINE</b>
          ${linked.line ? '<p>✅ ผูกแล้ว</p><button class="btn ghost sm" data-un="line">ยกเลิกการผูก</button>'
            : C.lineOA ? `<p>เพิ่มเพื่อน <a target="_blank" rel="noopener" href="https://line.me/R/ti/p/${encodeURIComponent(C.lineOA)}"><b>${esc(C.lineOA)}</b></a> แล้วส่งรหัสผูกด้านบนในแชต</p>` : '<p class="small">ยังไม่เปิดใช้</p>'}</div>
      </div>
      <p style="margin:12px 0 0"><button class="btn ghost sm" id="test">ส่งข้อความทดสอบ</button></p><div id="chm"></div>
    </div>
    <form class="card mt" id="setf"><h3>ตั้งค่า</h3>
      <div class="grid2">
        <div class="row"><label for="sn">ชื่ออุปกรณ์</label><input id="sn" maxlength="80" value="${esc(d.name)}"></div>
        <div class="row"><label for="sk">ใช้ทำอะไร</label><select id="sk"><option value="pump" ${d.kind === 'pump' ? 'selected' : ''}>เฝ้าปั๊มน้ำ</option><option value="power" ${d.kind === 'power' ? 'selected' : ''}>วัดไฟ</option></select></div>
        <div class="row"><label for="sa">ถือว่าปั๊มทำงานเมื่อกระแสเกิน (แอมป์)</label><input id="sa" type="number" step="0.05" min="0.05" max="100" value="${esc(d.pump_on_amp)}"></div>
        <div class="row"><label for="sp">ค่าไฟต่อหน่วย (บาท)</label><input id="sp" type="number" step="0.01" min="0" max="50" value="${esc(d.baht_per_kwh)}"></div>
      </div>
      <p class="small">เคล็ดลับ: เปิดปั๊มแล้วดูค่า “แอมป์” ด้านบน ตั้งค่านี้ไว้ราวครึ่งหนึ่งของกระแสตอนปั๊มทำงาน</p>
      <div id="sm"></div><button class="btn pri sm">บันทึก</button>
    </form>
    <form class="card mt" id="leakf" hidden><h3>เกณฑ์ไฟรั่ว และพิกัดเบรกเกอร์</h3>
      <div class="grid2">
        <div class="row"><label for="lw">เตือนเมื่อไฟรั่วเกิน (mA)</label><input id="lw" type="number" step="0.5" min="1" max="300"></div>
        <div class="row"><label for="lt">ระดับอันตรายเมื่อเกิน (mA)</label><input id="lt" type="number" step="0.5" min="1" max="300"></div>
        <div class="row"><label for="lm">พิกัดเบรกเกอร์ของวงจร (แอมป์)</label><input id="lm" type="number" step="0.5" min="0.5" max="200"></div>
      </div>
      <p class="small">แนะนำ: เตือน 9 mA · อันตราย 15 mA (เบรกเกอร์กันดูด 30 mA อาจตัดได้ตั้งแต่ราว 15 mA) · พิกัดเบรกเกอร์ดูที่ตัวเบรกเกอร์ เช่น C16 = 16 A</p>
      <div id="lmsg"></div><button class="btn pri sm">บันทึก</button>
    </form>
    <details class="card mt danger"><summary>ดาวน์โหลดโปรแกรม · ออกรหัสใหม่ · ลบอุปกรณ์</summary>
      <p class="small">โปรแกรมที่ฝังรหัสอุปกรณ์ต้องออกรหัสใหม่ก่อน (ระบบแสดงรหัสเดิมซ้ำไม่ได้) หรือดาวน์โหลดแบบไม่ฝังรหัส แล้วใส่รหัสในหน้าตั้งค่า Wi-Fi</p>
      <p><button class="btn ghost sm" id="dlplain">ดาวน์โหลดโปรแกรม (ไม่ฝังรหัส)</button> <button class="btn ghost sm" id="dlplainl">โปรแกรม Link (ไม่ฝังรหัส)</button> <button class="btn ghost sm" id="dlplaink">โปรแกรมวัดไฟรั่ว (ไม่ฝังรหัส)</button> <button class="btn ghost sm" id="rot">ออกรหัสใหม่</button></p>
      <div id="rotout"></div>
      <form id="delf" style="margin-top:18px"><label for="dc">พิมพ์ชื่อ “${esc(d.name)}” เพื่อยืนยันการลบอุปกรณ์และข้อมูลทั้งหมด</label>
        <input id="dc" autocomplete="off"><div id="dm"></div><button class="btn danger sm" style="margin-top:8px">ลบอุปกรณ์</button></form>
    </details>`

  // ช่องทาง
  $view.querySelectorAll('[data-un]').forEach((b) => b.onclick = async () => { await sb.rpc('watch_unlink', { p_id: id, p_ch: b.dataset.un }); deviceView(id) })
  document.getElementById('test').onclick = async (e) => {
    e.target.disabled = true
    const { data: r, error: er } = await sb.rpc('watch_test_alert', { p_id: id })
    e.target.disabled = false
    msg(document.getElementById('chm'), er ? er.message : r === 'ok' ? 'ส่งข้อความทดสอบแล้ว ตรวจในแอปภายในไม่กี่วินาที' : r, er || r !== 'ok' ? 'warn' : 'ok')
  }
  // ตั้งค่า
  document.getElementById('setf').onsubmit = async (e) => {
    e.preventDefault()
    const amp = Number(document.getElementById('sa').value), price = Number(document.getElementById('sp').value)
    if (!(amp >= 0.05 && amp <= 100) || !(price >= 0 && price <= 50)) return msg(document.getElementById('sm'), 'ค่าตั้งไม่ถูกต้อง', 'err')
    const { error: er } = await sb.from('watch_devices').update({ name: document.getElementById('sn').value.trim().slice(0, 80) || 'อุปกรณ์ของฉัน', kind: document.getElementById('sk').value, pump_on_amp: amp, baht_per_kwh: price }).eq('id', id)
    msg(document.getElementById('sm'), er ? 'บันทึกไม่สำเร็จ' : 'บันทึกแล้ว', er ? 'err' : 'ok')
  }
  document.getElementById('dlplain').onclick = () => window.cdDownloadFirmware('')
  document.getElementById('dlplainl').onclick = () => window.cdDownloadFirmware('', 'coredash-link.ino')
  document.getElementById('dlplaink').onclick = () => window.cdDownloadFirmware('', 'coredash-leak.ino')
  leakSettings(id)
  document.getElementById('rot').onclick = async () => {
    if (!confirm('ออกรหัสใหม่? รหัสเดิมในอุปกรณ์จะใช้ไม่ได้ทันที')) return
    const { data: k, error: er } = await sb.rpc('watch_rotate_key', { p_id: id })
    const out = document.getElementById('rotout')
    if (er) return msg(out, er.message, 'err')
    out.innerHTML = ''; out.appendChild(keyCard(k))
  }
  document.getElementById('delf').onsubmit = async (e) => {
    e.preventDefault()
    const { error: er } = await sb.rpc('watch_delete_device', { p_id: id, p_confirm: document.getElementById('dc').value })
    if (er) return msg(document.getElementById('dm'), er.message, 'err')
    location.hash = '#/'
  }

  const refresh = () => liveRefresh(id).catch(() => {})
  await refresh()
  timer = setInterval(refresh, 15000)
}

async function liveRefresh(id) {
  const since = new Date(Date.now() - 864e5).toISOString()
  const bkk = new Date(Date.now() + 7 * 36e5)
  const monthStart = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - 7 * 36e5).toISOString()
  const [{ data: d }, { data: rows }, { data: ev }, { data: k0 }, { data: k1 }] = await Promise.all([
    sb.from('watch_devices').select('last_seen,last,mains_ok,pump_running,kind,baht_per_kwh').eq('id', id).maybeSingle(),
    // Supabase คืนได้สูงสุด 1,000 แถวต่อครั้ง จึงดึงจากล่าสุดย้อนหลังแล้วกลับลำดับ
    sb.from('watch_readings').select('ts,w,v,a').eq('device_id', id).gte('ts', since).order('ts', { ascending: false }).limit(1000),
    sb.from('watch_events').select('ts,message').eq('device_id', id).order('ts', { ascending: false }).limit(20),
    sb.from('watch_readings').select('kwh').eq('device_id', id).gte('ts', monthStart).not('kwh', 'is', null).order('ts').limit(1),
    sb.from('watch_readings').select('kwh').eq('device_id', id).gte('ts', monthStart).not('kwh', 'is', null).order('ts', { ascending: false }).limit(1),
  ])
  if (!d || !document.getElementById('live')) return
  const on = online(d), L = d.last || {}
  document.getElementById('live').innerHTML = `
    <div class="stat"><span class="dot ${on ? 'on' : 'off'}"></span><b>${!d.last_seen ? 'ยังไม่เคยส่งข้อมูล' : on ? 'ออนไลน์' : 'ขาดการติดต่อ'}</b>
      ${d.last_seen ? `<span class="small">อัปเดตล่าสุด ${dt(d.last_seen)}</span>` : ''}
      ${d.mains_ok === false ? '<span class="tag red">ไฟเมนดับ</span>' : ''}
      ${L.brk === false && d.mains_ok !== false ? '<span class="tag red">เบรกเกอร์ตัด</span>' : L.brk === true ? '<span class="tag green">วงจรมีไฟ</span>' : ''}
      ${d.kind === 'pump' && d.pump_running != null ? `<span class="tag ${d.pump_running ? 'green' : 'red'}">ปั๊ม${d.pump_running ? 'ทำงาน' : 'หยุด'}</span>` : ''}</div>
    <div class="vals"><div><span class="n">${n(L.w)}</span><small>วัตต์</small></div><div><span class="n">${n(L.v)}</span><small>โวลต์</small></div>
      <div><span class="n">${n(L.a, 2)}</span><small>แอมป์</small></div><div><span class="n">${n(L.kwh, 1)}</span><small>หน่วยสะสม</small></div>
      ${L.temp != null ? `<div><span class="n">${n(L.temp, 1)}</span><small>°C</small></div>` : ''}
      ${L.level != null ? `<div><span class="n">${n(L.level)}</span><small>% ระดับน้ำ</small></div>` : ''}
      ${L.batt != null ? `<div><span class="n">${n(L.batt, 2)}</span><small>V แบตสำรอง</small></div>` : ''}
      ${L.leak != null ? `<div><span class="n" style="color:${L.leak >= 15 ? 'var(--red)' : L.leak >= 9 ? 'var(--amber)' : 'inherit'}">${n(L.leak, 1)}</span><small>mA ไฟรั่ว</small></div>` : ''}</div>
    ${!d.last_seen ? '<p class="small" style="margin-top:12px">ลงโปรแกรมใน ESP32 แล้วเสียบไฟ ข้อมูลแรกจะขึ้นภายใน 1 นาที</p>' : ''}`
  chart((rows || []).slice().reverse())
  document.getElementById('evs').innerHTML = (ev || []).length ? `<ul>${ev.map((e) => `<li><span class="small">${dt(e.ts)}</span> ${esc(e.message)}</li>`).join('')}</ul>` : '<p class="small">ยังไม่มีเหตุการณ์</p>'
  const kwh = k0?.[0] && k1?.[0] ? Number(k1[0].kwh) - Number(k0[0].kwh) : null
  document.getElementById('sum').innerHTML = kwh != null && kwh >= 0 ? `
    <div class="card"><div class="small">ใช้ไฟเดือนนี้</div><div class="dbig">${n(kwh, 1)} <span class="small">หน่วย</span></div></div>
    <div class="card"><div class="small">ค่าไฟโดยประมาณ (@${n(d.baht_per_kwh, 2)} บาท/หน่วย)</div><div class="dbig">${n(kwh * d.baht_per_kwh)} <span class="small">บาท</span></div></div>
    <div class="card"><div class="small">กำลังไฟสูงสุด 24 ชม.</div><div class="dbig">${n(Math.max(0, ...(rows || []).map((r) => r.w || 0)))} <span class="small">W</span></div></div>` : ''
}

/** กราฟเส้นเดียว (วัตต์) + เส้นชี้ค่าเมื่อชี้ด้วยเมาส์/นิ้ว */
function chart(rows) {
  const box = document.getElementById('chart'), tip = document.getElementById('tip')
  const pts = rows.filter((r) => r.w != null)
  if (pts.length < 2) { box.innerHTML = '<p class="small">รอข้อมูลอย่างน้อย 2 นาที กราฟจะแสดงที่นี่</p>'; tip.textContent = ''; return }
  const W = 760, H = 220, L = 50, R = 12, T = 12, B = 26
  const t0 = Date.parse(pts[0].ts), t1 = Date.parse(pts[pts.length - 1].ts)
  const max = Math.max(10, ...pts.map((p) => p.w)), mag = Math.pow(10, Math.floor(Math.log10(max))), yMax = Math.ceil(max / mag) * mag
  const x = (ts) => L + ((Date.parse(ts) - t0) / Math.max(1, t1 - t0)) * (W - L - R)
  const y = (w) => T + (1 - w / yMax) * (H - T - B)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.w).toFixed(1)}`).join('')
  const grid = [0, .5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(f * yMax)}" y2="${y(f * yMax)}" stroke="rgba(140,170,255,.18)"/><text x="${L - 6}" y="${y(f * yMax) + 4}" text-anchor="end" font-size="11" fill="#A9B8DA">${n(f * yMax)}</text>`).join('')
  const xt = [0, .25, .5, .75, 1].map((f) => { const ms = t0 + f * (t1 - t0); return `<text x="${L + f * (W - L - R)}" y="${H - 6}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" font-size="11" fill="#A9B8DA">${hm(ms)}</text>` }).join('')
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="กราฟกำลังไฟ ${hm(t0)} ถึง ${hm(t1)} สูงสุด ${n(max)} วัตต์" style="touch-action:pan-y">
    ${grid}${xt}<path d="${path}" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linejoin="round"/>
    <line id="cx" y1="${T}" y2="${H - B}" stroke="#A9B8DA" stroke-dasharray="3 3" visibility="hidden"/>
    <circle id="cd" r="5" fill="#22D3EE" stroke="#0C1A45" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg>`
  const svg = box.querySelector('svg'), cx = svg.querySelector('#cx'), cd = svg.querySelector('#cd')
  const move = (e) => {
    const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W
    const target = t0 + ((px - L) / (W - L - R)) * (t1 - t0)
    let best = pts[0], bd = Infinity
    for (const p of pts) { const dd = Math.abs(Date.parse(p.ts) - target); if (dd < bd) { bd = dd; best = p } }
    const X = x(best.ts)
    cx.setAttribute('x1', X); cx.setAttribute('x2', X); cx.setAttribute('visibility', 'visible')
    cd.setAttribute('cx', X); cd.setAttribute('cy', y(best.w)); cd.setAttribute('visibility', 'visible')
    tip.innerHTML = `${dt(best.ts)} · <b>${n(best.w)} W</b>${best.v != null ? ` · ${n(best.v)} V` : ''}${best.a != null ? ` · ${n(best.a, 2)} A` : ''}`
  }
  svg.addEventListener('pointermove', move)
  svg.addEventListener('pointerleave', () => { cx.setAttribute('visibility', 'hidden'); cd.setAttribute('visibility', 'hidden'); tip.textContent = '' })
}

/* ───────── ผู้ดูแล ───────── */
async function adminView() {
  stop()
  if (!isAdmin) { location.hash = '#/'; return }
  $view.innerHTML = `<p class="small"><a href="#/">← อุปกรณ์ของฉัน</a></p><span class="eyebrow">ผู้ดูแล</span><h2 style="margin-top:6px">ต่ออายุหลังรับชำระเงิน</h2>
    <form id="af" style="display:flex;gap:8px;max-width:460px;margin:14px 0"><input id="q" placeholder="รหัสลงท้าย 4 ตัวที่ลูกค้าแจ้ง" aria-label="ค้นหารหัสลงท้าย"><button class="btn pri sm">ค้นหา</button></form>
    <div class="card adm" id="tbl"></div>`
  const load = async () => {
    const { data, error } = await sb.rpc('watch_admin_list', { p_hint: document.getElementById('q').value.trim().replace(/^…/, '') || null })
    const t = document.getElementById('tbl')
    if (error) { t.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return }
    t.innerHTML = `<div class="r h"><span>อุปกรณ์ / เจ้าของ</span><span>รหัสท้าย</span><span>สถานะ</span><span>ใช้ได้ถึง</span><span>ล่าสุด</span><span>ต่ออายุ</span></div>` +
      (data || []).map((d) => { const a = access(d); return `<div class="r"><span><b>${esc(d.name)}</b><br><span class="small">${esc(d.owner_email)}</span></span><code class="chip">…${esc(d.key_hint)}</code>
        <span class="acc ${a.kind}">${a.kind === 'trial' ? 'ทดลอง' : a.kind === 'paid' ? 'จ่ายแล้ว' : 'หมดอายุ'}</span><span>${day(a.until)}</span>
        <span class="small">${d.last_seen ? (online(d) ? '● ออนไลน์' : '○ ' + dt(d.last_seen)) : '—'}</span>
        <span><button class="btn ghost sm" data-x="${d.id}" data-d="30">+30 วัน</button> <button class="btn ghost sm" data-x="${d.id}" data-d="365">+1 ปี</button></span></div>` }).join('')
    t.querySelectorAll('[data-x]').forEach((b) => b.onclick = async () => {
      if (!confirm(`ยืนยันต่ออายุ ${b.dataset.d === '30' ? '30 วัน' : '1 ปี'}?`)) return
      const { error: er } = await sb.rpc('watch_admin_extend', { p_id: b.dataset.x, p_days: Number(b.dataset.d) })
      if (er) alert(er.message); else load()
    })
  }
  document.getElementById('af').onsubmit = (e) => { e.preventDefault(); load() }
  load()
}

/* ───────── นำทาง ───────── */
let recovering = false
async function route() {
  const { data: { session } } = await sb.auth.getSession()
  const who = document.getElementById('who'), out = document.getElementById('logout')
  if (recovering) return newPasswordView()
  if (!session) { who.textContent = ''; out.hidden = true; return authView(location.hash === '#/signup' ? 'up' : 'in') }
  who.textContent = session.user.email || ''; out.hidden = false
  const h = location.hash || '#/'
  if (h.startsWith('#/d/') && isUuid(h.slice(4))) return deviceView(h.slice(4))
  if (h === '#/admin') return adminView()
  return listView()
}
document.getElementById('logout').onclick = async () => { await sb.auth.signOut(); location.hash = '#/'; route() }
window.addEventListener('hashchange', route)
sb.auth.onAuthStateChange(async (ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') { recovering = true; return newPasswordView() }
  if (ev === 'USER_UPDATED') recovering = false
  if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') {
    isAdmin = false
    if (session) { const { data } = await sb.rpc('watch_is_admin'); isAdmin = data === true }
    setTimeout(route, 0)
  }
})
;(async () => {
  const { data: { session } } = await sb.auth.getSession()
  if (session) { const { data } = await sb.rpc('watch_is_admin'); isAdmin = data === true }
  route()
})()
