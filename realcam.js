// CoreDash Nexus — real CCTV for the house page (owner only, PIN-locked).
// Video comes from the home gateway (RTSP → MJPEG); this page never sees camera passwords or the PIN itself.
const B = (th, en) => ({ th, en });
const T = {
  lockT: B('กล้องจริง · เฉพาะเจ้าของบ้าน', 'Real cameras · owner only'),
  lockS: B('ใส่รหัสผ่านเพื่อดูภาพสดจากกล้องที่บ้าน', 'Enter the password to watch the live cameras at home'),
  pwd: B('รหัสผ่าน', 'Password'), showPw: B('แสดงรหัส', 'Show password'),
  unlock: B('ปลดล็อก', 'Unlock'), clear: B('ล้าง', 'Clear'),
  bad: B('รหัสผ่านไม่ถูกต้อง', 'Wrong password'), left: B('เหลืออีก', 'tries left:'), locked: B('ใส่ผิดหลายครั้ง ล็อก 5 นาที', 'Too many tries — locked for 5 minutes'),
  lockNow: B('ล็อก', 'Lock'), autoLock: B('ล็อกอัตโนมัติใน', 'Auto-lock in'),
  live: B('สด', 'LIVE'), snap: B('ถ่ายภาพ', 'Snapshot'), full: B('เต็มจอ', 'Full screen'), back: B('กลับ', 'Back'),
  ptz: B('หมุนกล้อง (กดค้าง)', 'Pan / tilt (press and hold)'), noPtz: B('กล้องนี้ยังไม่ได้ตั้งค่า ONVIF PTZ', 'ONVIF PTZ is not set up for this camera'),
  conn: B('กำลังเชื่อมต่อกล้อง…', 'Connecting to camera…'), lost: B('สัญญาณกล้องหลุด — แตะเพื่อลองใหม่', 'Camera signal lost — tap to retry'),
  noGw: B('ยังไม่ได้เชื่อมเกตเวย์ที่บ้าน', 'Home gateway not connected'),
  noGwD: B('ภาพกล้องจริงต้องผ่าน CoreDash Gateway ที่ต่อ Wi-Fi วงเดียวกับกล้อง (Raspberry Pi / มินิพีซี / โน้ตบุ๊ก) แล้วเข้าแอปด้วยบัญชีเกตเวย์ ไม่ใช่โหมดสาธิต', 'Real video goes through a CoreDash Gateway on the same Wi-Fi as the cameras (Raspberry Pi / mini PC / laptop). Sign in to the app with the gateway account, not demo mode.'),
  steps: B('ตั้งค่าครั้งเดียว', 'One-time setup'),
  s1: B('เปิด RTSP/ONVIF ในกล้อง V380: แอป V380 Pro → ตั้งค่ากล้อง → ONVIF (ถ้ามี) และตั้งรหัสผ่านกล้อง · ถ้าไม่มีเมนูนี้ ใช้ไฟล์ ceshi.ini ในการ์ด SD', 'Turn on RTSP/ONVIF in the V380 camera: V380 Pro app → camera settings → ONVIF (if present) and set a camera password · otherwise use a ceshi.ini file on the SD card'),
  s2: B('ล็อก IP กล้องทั้ง 2 ตัวในเราท์เตอร์ แล้วทดสอบใน VLC: rtsp://admin:รหัส@IP:554/live/ch00_1', 'Reserve both camera IPs in the router, then test in VLC: rtsp://admin:password@IP:554/live/ch00_1'),
  s3: B('ใส่ลิงก์ RTSP และรหัสผ่านเจ้าของบ้าน (CAM_OWNER_PASSWORD) เป็นตัวแปรลับในเกตเวย์ (ไฟล์ .env) ตามตัวอย่าง config/home-cameras.example.yaml', 'Put the RTSP links and the owner password (CAM_OWNER_PASSWORD) as gateway secrets (.env) — see config/home-cameras.example.yaml'),
  s4: B('ดูจากนอกบ้าน: ใช้ Tailscale หรือ Cloudflare Tunnel — ห้ามเปิดพอร์ตกล้องออกอินเทอร์เน็ต', 'From outside: use Tailscale or Cloudflare Tunnel — never port-forward the cameras'),
  https: B('หน้านี้เปิดแบบ https แต่เกตเวย์เป็น http เบราว์เซอร์จะบล็อกภาพ — เปิดแอปจากเกตเวย์โดยตรง หรือใช้ Tailscale (https)', 'This page is https but the gateway is http, so the browser will block the video — open the app from the gateway itself, or use Tailscale (https)'),
  noPin: B('เกตเวย์ยังไม่ได้ตั้งรหัสผ่านเจ้าของบ้าน (CAM_OWNER_PASSWORD)', 'The gateway has no owner password yet (CAM_OWNER_PASSWORD)'),
  v3T: B('กล้องบ้านเลขที่ 555', 'Cameras · House No. 555'),
  v3Tap: B('แตะเพื่อเปิดดูภาพสด', 'tap to watch live'),
  v3Open: B('เปิดแอป V380 Pro', 'Open the V380 Pro app'),
  v3Sub: B('ภาพสด · หมุนกล้อง · พูดผ่านกล้อง · ย้อนดูบันทึก', 'Live view · pan/tilt · talk · playback'),
  v3Desk: B('เปิดจากมือถือที่ติดตั้งแอป V380 Pro', 'Open this on a phone with V380 Pro installed'),
  v3Note: B('Android: ปุ่มจะเปิด V380 Pro ผ่าน Play Store — ถ้าขึ้นหน้าแอป ให้กดปุ่ม "เปิด" (ไม่ใช่ "ติดตั้ง") แล้วแตะกล้องที่ต้องการ · iPhone: กด "เปิด" ใน App Store · เปิดจาก LINE/Facebook ให้เปิดหน้านี้ใน Chrome ก่อน', 'Android: the button opens V380 Pro through the Play Store — if its page appears, tap "Open" (not "Install"), then pick the camera · iPhone: tap "Open" in the App Store · from LINE/Facebook, open this page in Chrome first'),
  v3Rtsp: B('อนาคต: ดูภาพในแอป CoreDash โดยตรง (ต้องใช้กล้องที่เปิด RTSP)', 'Later: video inside CoreDash (needs an RTSP camera)'),
  demoOk: B('รหัสผ่านถูกต้อง · โหมดสาธิตยังไม่มีกล้องจริงให้แสดง', 'Password accepted · demo mode has no real cameras to show')
};
// Demo mode only gates the setup guide (there is no video without the gateway); the real check is on the gateway.
// Stored as a slow salted PBKDF2 hash so the password itself is not in the page.
const DEMO_PW = { salt: 'coredash-cam-demo', iter: 150000, hash: '3288cb0123afb0bfdcf45eaeed911803979349bd153e01c67e72286853eaf6c4' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function pbkdf2(pw) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(DEMO_PW.salt), iterations: DEMO_PW.iter }, k, 256);
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function createRealCamView({ lang = () => 'th', live = () => null, onToast = () => {} } = {}) {
  const L = () => (lang() === 'en' ? 'en' : 'th');
  const x = (k) => T[k][L()];
  const st = { pin: '', show: false, err: '', session: null, cams: [], big: null, demoOk: false, busy: false, shake: 0 };
  const el = document.createElement('div');
  el.className = 'rc';
  let tick = null;

  const lock = () => { st.session = null; st.cams = []; st.big = null; st.pin = ''; st.demoOk = false; render(); };
  const streamUrl = (id) => `${live().base}/api/cams/${encodeURIComponent(id)}/stream?t=${encodeURIComponent(st.session.token)}`;
  const snapUrl = (id) => `${live().base}/api/cams/${encodeURIComponent(id)}/snapshot?t=${encodeURIComponent(st.session.token)}&_=${Date.now()}`;

  async function unlock() {
    const inp = el.querySelector('[data-rc-pw]'); if (inp) st.pin = inp.value;
    if (st.busy) return;
    if (!st.pin) return;
    if (st.pin.length < 4) { fail(x('bad')); st.pin = ''; render(); return; }
    st.busy = true; st.err = '';
    const g = live();
    try {
      if (!g) {
        if (await pbkdf2(st.pin) === DEMO_PW.hash) st.demoOk = true; else fail(x('bad'));
      } else {
        const r = await fetch(g.base + '/api/cams/unlock', { method: 'POST', headers: { Authorization: 'Bearer ' + g.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: st.pin }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) { st.session = { token: j.token, exp: j.exp }; st.cams = j.cameras || []; }
        else if (j.error === 'LOCKED') fail(x('locked'));
        else if (j.error === 'BAD_PIN') fail(`${x('bad')} · ${x('left')} ${j.left}`);
        else if (j.error === 'NO_PIN') { if (await pbkdf2(st.pin) === DEMO_PW.hash) st.demoOk = true; else fail(x('bad')); }
        else fail(j.message || 'HTTP ' + r.status);
      }
    } catch (e) { fail(e.message); }
    st.pin = ''; st.busy = false; render();
  }
  function fail(msg) { st.err = msg; st.shake++; }

  function pinPad() {
    return `<form class="rc-lock" data-rc-form autocomplete="off">
      <div class="rc-shield"><svg viewBox="0 0 64 64" width="58" height="58"><defs><linearGradient id="rcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D99A"/><stop offset=".55" stop-color="#9C7A36"/><stop offset="1" stop-color="#E9C77E"/></linearGradient></defs><path d="M32 4 L56 13 V31 C56 46 45 56 32 60 C19 56 8 46 8 31 V13 Z" fill="#0B1226" stroke="url(#rcg)" stroke-width="3"/><rect x="22" y="29" width="20" height="16" rx="3" fill="url(#rcg)"/><path d="M26 29 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke="url(#rcg)" stroke-width="3"/><circle cx="32" cy="36" r="2.4" fill="#0B1226"/><rect x="31" y="37" width="2" height="5" fill="#0B1226"/></svg></div>
      <b>${x('lockT')}</b><small>${x('lockS')}</small>
      <label class="rc-pwbox ${st.err ? 'err' : ''}"><span>🔑</span><input data-rc-pw type="${st.show ? 'text' : 'password'}" placeholder="${x('pwd')}" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${x('pwd')}" ${st.busy ? 'disabled' : ''}><button type="button" class="rc-eye" data-rc="eye" aria-label="${x('showPw')}">${st.show ? '🙈' : '👁'}</button></label>
      <div class="rc-msg">${esc(st.err)}</div>
      <button type="submit" class="btn primary rc-go" ${st.busy ? 'disabled' : ''}>🔓 ${x('unlock')}</button>
    </form>`;
  }
  // V380 Pro opens the owner's own app (the cameras' cloud protocol is closed, so video stays in that app)
  const V380 = { android: 'com.macrovideo.v380pro', ios: 'https://apps.apple.com/app/id1388988209', play: 'https://play.google.com/store/apps/details?id=com.macrovideo.v380pro' };
  const platform = () => { const u = navigator.userAgent || ''; return /Android/i.test(u) ? 'android' : /iPhone|iPad|iPod/i.test(u) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : 'desktop'; };
  // Chrome only lets a web page open apps that publish a link scheme; V380 Pro publishes none, so on Android we open
  // its page in the Play Store app (installed → a single "Open" button; launch=true lets Play open it straight away where supported).
  const v380Href = () => (platform() === 'android' ? `intent://details?id=${V380.android}&launch=true#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(V380.play)};end` : platform() === 'ios' ? V380.ios : V380.play);
  function guide() {
    const mixed = live() && location.protocol === 'https:' && live().base.startsWith('http:');
    const pf = platform();
    const cams = [['โรงรถ', 'Garage', '🚗'], ['ข้างบ้าน', 'Side of the house', '🏡']];
    return `<div class="rc-guide">
      <div class="rc-v3">
        <div class="rc-v3-h"><span class="rc-rec"></span><b>${x('v3T')}</b><button class="btn" data-rc="lock">🔒 ${x('lockNow')}</button></div>
        <div class="rc-v3-cams">${cams.map(([th, en, ic]) => `<a class="rc-v3-cam" href="${v380Href()}" rel="noopener" data-rc-v380><span class="rc-v3-ic">${ic}</span><span><b>${L() === 'th' ? th : en}</b><small>V380 · ${x('v3Tap')}</small></span><span class="rc-v3-go">▶</span></a>`).join('')}</div>
        <a class="rc-v3-btn" href="${v380Href()}" rel="noopener" data-rc-v380><span class="rc-v3-logo">V380</span><span><b>${x('v3Open')}</b><small>${pf === 'desktop' ? x('v3Desk') : x('v3Sub')}</small></span><span>↗</span></a>
        ${pf === 'desktop' ? `<div class="rc-v3-stores"><a href="${V380.play}" target="_blank" rel="noopener">Google Play</a><a href="${V380.ios}" target="_blank" rel="noopener">App Store</a></div>` : ''}
        <small class="muted">${x('v3Note')}</small>
      </div>
      ${mixed ? `<div class="rc-warn">⚠ ${x('https')}</div>` : ''}
      <details class="rc-more"><summary>📡 ${x('v3Rtsp')}</summary>
        <p>${x('noGwD')}</p>
        <div class="rc-flow"><span>📷 V380 ×2</span><em>RTSP</em><span>📶 Wi-Fi Router</span><em>LAN</em><span class="gold">CoreDash Gateway</span><em>MJPEG</em><span>📱 ${L() === 'th' ? 'แอปนี้' : 'this app'}</span></div>
        <ol><li>${x('s1')}</li><li>${x('s2')}</li><li>${x('s3')}</li><li>${x('s4')}</li></ol></details></div>`;
  }
  const remain = () => { const s = Math.max(0, Math.round((st.session.exp - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function camTile(c) {
    return `<figure class="rc-tile" data-rc="big" data-arg="${esc(c.id)}"><div class="rc-media"><img alt="${esc(c.name)}" data-rc-img="${esc(c.id)}" src="${streamUrl(c.id)}"><div class="rc-wait">${x('conn')}</div></div>
      <figcaption><span class="rc-rec"></span><b>${esc(L() === 'en' ? c.nameEn || c.name : c.name)}</b><span class="rc-live">${x('live')}</span><span class="rc-clock" data-rc-clock></span></figcaption></figure>`;
  }
  function bigView(c) {
    const pad = c.ptz ? ['up', 'left', 'stop', 'right', 'down'].map((d) => `<button class="rc-ptz rc-${d}" data-rc-ptz="${d}" aria-label="${d}">${{ up: '▲', down: '▼', left: '◀', right: '▶', stop: '■' }[d]}</button>`).join('') : '';
    return `<div class="rc-big"><div class="rc-media big"><img alt="${esc(c.name)}" data-rc-img="${esc(c.id)}" src="${streamUrl(c.id)}"><div class="rc-wait">${x('conn')}</div>
        <div class="rc-osd"><span class="rc-rec"></span>${esc(c.name)} · <span data-rc-clock></span></div></div>
      <div class="rc-ctl"><div><b>${x('ptz')}</b>${c.ptz ? `<div class="rc-pad">${pad}</div><div class="rc-zoom"><button class="btn" data-rc-ptz="zoomout">－</button><button class="btn" data-rc-ptz="zoomin">＋</button></div>` : `<small class="muted">${x('noPtz')}</small>`}</div>
        <div class="rc-acts"><button class="btn" data-rc="snap" data-arg="${esc(c.id)}">📸 ${x('snap')}</button><button class="btn" data-rc="full">⛶ ${x('full')}</button><button class="btn" data-rc="back">← ${x('back')}</button></div></div></div>`;
  }
  function render() {
    let html;
    if (st.session) {
      const big = st.cams.find((c) => c.id === st.big);
      html = `<div class="rc-bar"><span class="rc-rec"></span><b>${x('lockT')}</b><span class="muted">${x('autoLock')} <span data-rc-left>${remain()}</span></span><button class="btn" data-rc="lock">🔒 ${x('lockNow')}</button></div>
        ${big ? bigView(big) : `<div class="rc-grid">${st.cams.map(camTile).join('')}</div>`}`;
    } else if (st.demoOk) html = guide();
    else html = pinPad() + (live() ? '' : `<div class="rc-hint muted">${x('noGw')}</div>`);
    el.innerHTML = html;
    el.querySelectorAll('[data-rc-img]').forEach((img) => {
      img.addEventListener('load', () => img.parentElement.classList.add('ok'), { once: true });
      img.addEventListener('error', () => { const w = img.parentElement.querySelector('.rc-wait'); if (w) { w.textContent = x('lost'); w.dataset.rc = 'retry'; } img.parentElement.classList.remove('ok'); });
    });
    const d = el.querySelector('.rc-pwbox.err'); if (d) { d.classList.add('shake'); }
    const pi = el.querySelector('[data-rc-pw]'); if (pi && !st.busy) setTimeout(() => pi.focus({ preventScroll: true }), 30);
  }

  let ptzHold = null;
  const ptz = async (id, dir) => {
    try {
      const r = await fetch(`${live().base}/api/cams/${encodeURIComponent(id)}/ptz`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: st.session.token, dir }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); if (j.error === 'CAM_LOCKED') lock(); else if (dir !== 'stop') onToast(j.message || 'PTZ ' + r.status, true); }
    } catch (e) { onToast(e.message, true); }
  };
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-rc-ptz]'); if (!b || !st.big) return;
    e.preventDefault(); const dir = b.dataset.rcPtz; ptz(st.big, dir);
    if (dir !== 'stop') { ptzHold = st.big; b.classList.add('on'); }
  });
  const release = () => { if (ptzHold) { ptz(ptzHold, 'stop'); ptzHold = null; el.querySelectorAll('.rc-ptz.on,[data-rc-ptz].on').forEach((n) => n.classList.remove('on')); } };
  el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release); el.addEventListener('pointerleave', release);

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rc]'); if (!b || !el.contains(b)) return;
    e.stopPropagation();
    const k = b.dataset.rc, a = b.dataset.arg;
    if (k === 'eye') { const i = el.querySelector('[data-rc-pw]'); st.show = !st.show; if (i) { i.type = st.show ? 'text' : 'password'; b.textContent = st.show ? '🙈' : '👁'; i.focus(); } return; }
    if (k === 'lock') return lock();
    if (k === 'big') { st.big = a; return render(); }
    if (k === 'back') { st.big = null; return render(); }
    if (k === 'retry') return render();
    if (k === 'full') { const m = el.querySelector('.rc-media.big'); if (m && m.requestFullscreen) m.requestFullscreen().catch(() => {}); return; }
    if (k === 'snap') {
      try { const r = await fetch(snapUrl(a)); if (!r.ok) throw new Error('HTTP ' + r.status); const bl = await r.blob(); const l = document.createElement('a'); l.href = URL.createObjectURL(bl); l.download = `${a}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.jpg`; document.body.appendChild(l); l.click(); setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 500); }
      catch (er) { onToast(er.message, true); }
    }
  });
  el.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); unlock(); });
  el.addEventListener('input', (e) => { if (e.target.matches('[data-rc-pw]') && st.err) { st.err = ''; const m = el.querySelector('.rc-msg'); if (m) m.textContent = ''; el.querySelector('.rc-pwbox')?.classList.remove('err', 'shake'); } });
  // leaving the app locks it again
  document.addEventListener('visibilitychange', () => { if (document.hidden && (st.session || st.demoOk)) lock(); });

  return {
    el,
    show() {
      if (!el.innerHTML) render();
      if (!tick) tick = setInterval(() => {
        if (!el.isConnected) return;
        if (st.session && Date.now() > st.session.exp) { lock(); onToast(L() === 'th' ? 'ล็อกกล้องอัตโนมัติแล้ว' : 'Cameras locked automatically'); return; }
        const n = el.querySelector('[data-rc-left]'); if (n && st.session) n.textContent = remain();
        el.querySelectorAll('[data-rc-clock]').forEach((c) => (c.textContent = new Date().toLocaleTimeString(L() === 'th' ? 'th-TH' : 'en-GB')));
      }, 1000);
    },
    hide() { if (st.session || st.demoOk) lock(); else st.pin = ''; if (tick) { clearInterval(tick); tick = null; } },
    langChanged() { render(); },
    _state: st
  };
}
