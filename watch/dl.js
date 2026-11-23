// สร้างไฟล์โปรแกรม ESP32 ที่กรอกค่าเชื่อมต่อ (และรหัสอุปกรณ์ ถ้ามี) ให้อัตโนมัติ แล้วดาวน์โหลด
// ทำในเบราว์เซอร์ทั้งหมด รหัสอุปกรณ์ไม่ถูกส่งไปที่ไหน
window.cdDownloadFirmware = async function (deviceKey, file) {
  file = (file === 'coredash-link.ino' || file === 'coredash-leak.ino') ? file : 'coredash-watch.ino'
  var C = window.CD_WATCH || {}
  var base = (document.querySelector('script[src$="dl.js"]') || {}).src || location.href
  var url = new URL(file, base).href
  try {
    var r = await fetch(url, { cache: 'no-cache' })
    if (!r.ok) throw new Error('โหลดไฟล์ไม่สำเร็จ')
    var src = await r.text()
    src = src.replace('__SUPABASE_URL__', C.supabaseUrl || '').replace('__SUPABASE_KEY__', C.supabaseKey || '')
    if (deviceKey && /^cdw_[A-Z2-9]{24}$/.test(deviceKey)) src = src.replace('__DEVICE_KEY__', deviceKey)
    var blob = new Blob([src], { type: 'text/plain;charset=utf-8' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    // Arduino IDE ต้องการให้ไฟล์ .ino อยู่ในโฟลเดอร์ชื่อเดียวกัน
    a.download = file
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 4000)
  } catch (e) {
    alert('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
  }
}
