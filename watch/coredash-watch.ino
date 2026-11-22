/*
 * CoreDash Watch · เฟิร์มแวร์ ESP32 (ใช้ฟรี)
 * ─────────────────────────────────────────────
 * วัดไฟด้วย PZEM-004T v3 แล้วส่งขึ้น CoreDash ทุก 60 วินาที
 * ระบบบนเว็บจะแจ้งเตือน: ไฟดับ · ปั๊มหยุด/เริ่มทำงาน · อุปกรณ์ขาดการติดต่อ
 *
 * ต้องติดตั้งไลบรารีใน Arduino IDE (Library Manager):
 *   - "WiFiManager" โดย tzapu
 *   - "PZEM004Tv30" โดย Jakub Mandula
 * บอร์ด: ESP32 Dev Module (Board Manager: "esp32" โดย Espressif)
 *
 * การต่อสาย (PZEM-004T v3 ใช้ไฟเลี้ยง 5V จาก ESP32):
 *   PZEM 5V  → ESP32 5V (VIN)      PZEM GND → ESP32 GND
 *   PZEM TX  → ESP32 GPIO16 (RX2)  PZEM RX  → ESP32 GPIO17 (TX2)
 *   ฝั่งไฟ 220V ของ PZEM และคล้อง CT ที่สายไฟเส้นเดียวของปั๊ม/เครื่องใช้ ให้ช่างไฟต่อ
 *
 * ใช้งานครั้งแรก:
 *   1) เสียบไฟ ESP32 จะเปิด Wi-Fi ชื่อ "CoreDash-Watch-xxxx" (รหัส coredash)
 *   2) ต่อมือถือเข้า Wi-Fi นั้น หน้าตั้งค่าจะเด้งขึ้น
 *   3) เลือก Wi-Fi บ้าน ใส่รหัส Wi-Fi (และ "รหัสอุปกรณ์" cdw_... ถ้ายังไม่ได้ฝังมาในไฟล์)
 *   ดาวน์โหลดไฟล์นี้จากหน้าอุปกรณ์ใน coredashtech.com/watch/app จะได้ไฟล์ที่ฝังรหัสอุปกรณ์มาให้แล้ว
 * รีเซ็ตค่า: กดปุ่ม BOOT ค้างไว้ 5 วินาทีขณะทำงาน
 *
 * แจ้ง "ไฟดับ" ได้ทันทีเมื่อ ESP32 และเราเตอร์มีไฟสำรอง (พาวเวอร์แบงก์/UPS)
 * ถ้าไม่มีไฟสำรอง ระบบจะแจ้ง "ขาดการติดต่อ" ภายในราว 3–4 นาทีแทน
 *
 * © 2026 CoreDash Technology · โทร 081-923-2380
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <PZEM004Tv30.h>

// ───── ค่าตั้ง (หน้าเว็บกรอกให้อัตโนมัติตอนดาวน์โหลด) ─────
static const char* SUPABASE_URL = "__SUPABASE_URL__";
static const char* SUPABASE_KEY = "__SUPABASE_KEY__";   // publishable key (เปิดเผยได้)
static const char* DEVICE_KEY_DEFAULT = "__DEVICE_KEY__";
static const char* AP_PASS = "coredash";
static const char* FW_VERSION = "1.1.0";
static const int PIN_LED = 2;    // ไฟ LED บนบอร์ด
static const int PIN_BOOT = 0;   // ปุ่ม BOOT
static const int PZEM_RX = 16, PZEM_TX = 17;

PZEM004Tv30 pzem(Serial2, PZEM_RX, PZEM_TX);
Preferences prefs;
String deviceKey;
uint32_t intervalMs = 60000;
uint32_t lastSend = 0;
int failCount = 0;

// รหัสอุปกรณ์ต้องเป็นรูปแบบ cdw_ ตามด้วยตัวอักษร/ตัวเลข 24 ตัว
bool validKey(const String& k) {
  if (k.length() != 28 || !k.startsWith("cdw_")) return false;
  for (size_t i = 4; i < k.length(); i++) {
    char c = k[i];
    if (!((c >= 'A' && c <= 'Z') || (c >= '2' && c <= '9'))) return false;
  }
  return true;
}

void blink(int times, int ms) {
  for (int i = 0; i < times; i++) { digitalWrite(PIN_LED, HIGH); delay(ms); digitalWrite(PIN_LED, LOW); delay(ms); }
}

// ค่าที่อ่านไม่ได้ (NaN) ส่งเป็น null ให้เซิร์ฟเวอร์รู้ว่าไม่มีไฟเมน
void addNum(String& js, const char* name, float v, int digits, bool comma = true) {
  js += '"'; js += name; js += "\":";
  if (isnan(v)) js += "null"; else js += String(v, digits);
  if (comma) js += ',';
}

void startPortal(bool force) {
  WiFiManager wm;
  char keyBuf[40];
  strncpy(keyBuf, deviceKey.c_str(), sizeof(keyBuf) - 1);
  keyBuf[sizeof(keyBuf) - 1] = '\0';
  WiFiManagerParameter pKey("key", "รหัสอุปกรณ์ (cdw_...)", keyBuf, 30);
  wm.addParameter(&pKey);
  wm.setTitle("CoreDash Watch");
  wm.setConfigPortalTimeout(300);
  String ap = "CoreDash-Watch-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFF), HEX);

  bool ok = force ? wm.startConfigPortal(ap.c_str(), AP_PASS) : wm.autoConnect(ap.c_str(), AP_PASS);
  String k = String(pKey.getValue());
  k.trim();
  if (validKey(k) && k != deviceKey) {
    deviceKey = k;
    prefs.putString("key", deviceKey);
  }
  if (!ok) { delay(1000); ESP.restart(); }
}

void factoryReset() {
  blink(10, 60);
  prefs.clear();
  WiFiManager wm;
  wm.resetSettings();
  delay(500);
  ESP.restart();
}

bool sendReading() {
  float v = pzem.voltage(), a = pzem.current(), w = pzem.power();
  float kwh = pzem.energy(), pf = pzem.pf(), hz = pzem.frequency();

  String js = "{\"p_key\":\"";
  js += deviceKey; js += "\",";
  addNum(js, "p_v", v, 1); addNum(js, "p_a", a, 3); addNum(js, "p_w", w, 1);
  addNum(js, "p_kwh", kwh, 3); addNum(js, "p_pf", pf, 2); addNum(js, "p_hz", hz, 1);
  js += "\"p_fw\":\""; js += FW_VERSION; js += "\"}";

  WiFiClientSecure client;
  // หมายเหตุ: ไม่ตรวจใบรับรองเพื่อให้ใช้ได้ทันทีกับทุกบอร์ด ข้อมูลยังเข้ารหัสระหว่างทาง
  // ถ้าต้องการความปลอดภัยสูงขึ้น ให้ใช้ client.setCACert(...) ด้วยใบรับรองของเว็บ
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(10000);
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/watch_ingest";
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  int code = http.POST(js);
  String body = code > 0 ? http.getString() : "";
  http.end();

  Serial.printf("[watch] POST %d %s\n", code, body.c_str());
  if (code != 200) return false;
  // เซิร์ฟเวอร์ตอบ เช่น {"ok": true, "active": true, "interval": 60}
  if (body.indexOf("unknown device") >= 0 || body.indexOf("bad key") >= 0) { blink(3, 300); return false; } // รหัสอุปกรณ์ผิด
  int p = body.indexOf("\"interval\"");
  if (p >= 0) {
    int c = body.indexOf(':', p);
    long sec = c > 0 ? body.substring(c + 1).toInt() : 0;
    if (sec >= 15 && sec <= 3600) intervalMs = (uint32_t)sec * 1000UL;
  }
  return body.indexOf("\"ok\": true") >= 0 || body.indexOf("\"ok\":true") >= 0;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  prefs.begin("cdwatch", false);
  deviceKey = prefs.getString("key", "");
  if (!validKey(deviceKey) && validKey(String(DEVICE_KEY_DEFAULT))) deviceKey = DEVICE_KEY_DEFAULT; // รหัสที่ฝังมาจากหน้าเว็บ

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  startPortal(!validKey(deviceKey));   // ยังไม่มีรหัส → เปิดหน้าตั้งค่าทันที
  blink(2, 150);
  lastSend = millis() - intervalMs + 5000; // ส่งครั้งแรกหลังเปิดเครื่อง 5 วินาที
}

void loop() {
  // กด BOOT ค้าง 5 วินาที = ล้างค่าทั้งหมด
  if (digitalRead(PIN_BOOT) == LOW) {
    uint32_t t0 = millis();
    while (digitalRead(PIN_BOOT) == LOW) {
      if (millis() - t0 > 5000) factoryReset();
      delay(20);
    }
  }

  if (millis() - lastSend >= intervalMs) {
    lastSend = millis();
    if (WiFi.status() == WL_CONNECTED && sendReading()) {
      failCount = 0;
      blink(1, 40);
    } else if (++failCount >= 10) {
      ESP.restart();  // ส่งไม่ได้ 10 รอบติด ลองเริ่มใหม่
    }
  }
  delay(50);
}
