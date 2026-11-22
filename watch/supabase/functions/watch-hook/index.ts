// CoreDash Watch · Supabase Edge Function "watch-hook"
// รับข้อความจาก Telegram และ LINE เพื่อ "ผูก" บัญชีแจ้งเตือนกับอุปกรณ์ด้วยรหัส CD-XXXX-XXXX
//   Telegram webhook: https://<project>.supabase.co/functions/v1/watch-hook?src=telegram
//   LINE webhook:     https://<project>.supabase.co/functions/v1/watch-hook?src=line
// ตั้งค่า: ปิด "Enforce JWT verification" ของฟังก์ชันนี้ (Telegram/LINE ส่ง JWT ไม่ได้ เราตรวจรหัสลับเอง)
// รหัสลับทั้งหมดอ่านจากตาราง watch_private.config ในฐานข้อมูล ไม่ต้องตั้ง secret เพิ่ม

const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const KEY = Deno.env.get('WATCH_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CODE = /CD-[A-Z2-9]{4}-[A-Z2-9]{4}/

type Cfg = { tg_token: string; tg_secret: string; line_token: string; line_secret: string }
let cache: { at: number; cfg: Cfg } | null = null

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { apikey: KEY, 'content-type': 'application/json' }
  if (KEY.startsWith('eyJ')) headers.authorization = `Bearer ${KEY}` // คีย์แบบ JWT รุ่นเดิม
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`)
  return await r.json() as T
}

async function cfg(): Promise<Cfg> {
  if (cache && Date.now() - cache.at < 60_000) return cache.cfg
  const c = await rpc<Cfg>('watch_hook_config')
  cache = { at: Date.now(), cfg: c }
  return c
}

function eq(a: string, b: string) {
  if (!a || a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

async function tgSend(token: string, chat: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }),
  })
}

async function lineReply(token: string, replyToken: string, text: string) {
  // reply ไม่นับโควตาข้อความของ LINE OA
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}

async function lineSigOk(secret: string, raw: string, sig: string | null) {
  if (!secret || !sig) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  return eq(btoa(String.fromCharCode(...mac)), sig)
}

const ok = () => new Response('ok')
const no = () => new Response('forbidden', { status: 403 })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('CoreDash Watch hook')
  const src = new URL(req.url).searchParams.get('src')
  const c = await cfg()

  if (src === 'telegram') {
    if (!c.tg_secret || !eq(req.headers.get('x-telegram-bot-api-secret-token') ?? '', c.tg_secret)) return no()
    const u = await req.json().catch(() => null) as { message?: { chat?: { id?: number }; text?: string } } | null
    const chat = u?.message?.chat?.id
    if (!chat) return ok()
    const m = (u?.message?.text ?? '').toUpperCase().match(CODE)
    if (!m) { await tgSend(c.tg_token, chat, 'สวัสดีครับ นี่คือ CoreDash Watch\nกดปุ่ม "ผูก Telegram" จากหน้าอุปกรณ์ หรือพิมพ์รหัสผูก เช่น CD-ABCD-EFGH'); return ok() }
    const name = await rpc<string | null>('watch_link', { p_code: m[0], p_ch: 'telegram', p_ident: String(chat) })
    await tgSend(c.tg_token, chat, name ? `✅ ผูกแล้ว จะแจ้งเตือนของ "${name}" มาที่นี่` : 'ไม่พบรหัสนี้ ตรวจรหัสผูกในหน้าอุปกรณ์อีกครั้ง')
    return ok()
  }

  if (src === 'line') {
    const raw = await req.text()
    if (!(await lineSigOk(c.line_secret, raw, req.headers.get('x-line-signature')))) return no()
    const body = JSON.parse(raw || '{}') as { events?: { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } }[] }
    for (const e of body.events ?? []) {
      if (!e.replyToken) continue
      if (e.type === 'follow') { await lineReply(c.line_token, e.replyToken, 'ขอบคุณที่เพิ่มเพื่อน CoreDash Watch\nพิมพ์รหัสผูกจากหน้าอุปกรณ์ เช่น CD-ABCD-EFGH'); continue }
      if (e.type !== 'message' || e.message?.type !== 'text' || !e.source?.userId) continue
      const m = (e.message.text ?? '').toUpperCase().match(CODE)
      if (!m) { await lineReply(c.line_token, e.replyToken, 'พิมพ์รหัสผูก เช่น CD-ABCD-EFGH จากหน้าอุปกรณ์ในเว็บ coredashtech.com/watch'); continue }
      const name = await rpc<string | null>('watch_link', { p_code: m[0], p_ch: 'line', p_ident: e.source.userId })
      await lineReply(c.line_token, e.replyToken, name ? `✅ ผูกแล้ว จะแจ้งเตือนของ "${name}" มาที่ LINE นี้` : 'ไม่พบรหัสนี้ ตรวจรหัสผูกอีกครั้ง')
    }
    return ok()
  }
  return new Response('unknown source', { status: 400 })
})
