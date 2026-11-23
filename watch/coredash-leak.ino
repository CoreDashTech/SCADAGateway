/*
 * CoreDash Watch · Leak · เฟิร์มแวร์ ESP32 วัดไฟรั่ว + จับเบรกเกอร์ตัด  v1.0.0
 * ─────────────────────────────────────────────────────────────────────
 * วัด: แรงดัน กระแส กำลังไฟ (PZEM-004T v3) · ไฟรั่ว mA (ZMCT103C คล้องสาย L+N พร้อมกัน)
 *      ไฟเข้า (โมดูลตรวจไฟ AC ตัวที่ 1 ต่อก่อนเบรกเกอร์) · วงจรหลังเบรกเกอร์ (โมดูลตัวที่ 2)
 * ส่งขึ้น CoreDash ทุก 60 วินาที และส่งทันทีเมื่อ ไฟรั่วข้ามเกณฑ์ / เบรกเกอร์ตัด / ไฟดับ
 * มีเสียงเตือนที่ตัวเครื่องด้วย (ทำงานแม้เน็ตหลุด)
 *
 * ต้องรัน supabase/leak-upgrade.sql ในฐานข้อมูลก่อน (ระบบเดิมยังใช้ได้ตามปกติ)
 *
 * ไลบรารี (Arduino IDE → Library Manager):
 *   - "WiFiManager" โดย tzapu
 *   - "PZEM004Tv30" โดย Jakub Mandula
 * บอร์ด: ESP32 Dev Module (Board Manager: "esp32" โดย Espressif)
 *
 * การต่อสายฝั่งไฟต่ำ (ฝั่ง 220V ดูคู่มือแลป และให้ช่างไฟฟ้าต่อ):
 *   PZEM 5V → 3V3 · GND → GND · TX → GPIO16 · RX → GPIO17
 *   ZMCT103C (โมดูลมี op-amp) VCC → 5V(VIN) · GND → GND · OUT → ตัวแบ่ง 10k/20k → GPIO34
 *        (OUT ── 10k ──┬── GPIO34 ;  ┴── 20k ── GND)  ห้ามต่อ OUT เข้า GPIO34 ตรงๆ
 *   โมดูลตรวจไฟ AC #1 (ไฟเข้า)      VCC → 3V3 · GND → GND · OUT → GPIO25
 *   โมดูลตรวจไฟ AC #2 (หลังเบรกเกอร์) VCC → 3V3 · GND → GND · OUT → GPIO26
 *   บัซเซอร์แบบ Active 3.3V  + → GPIO27 · − → GND
 *
 * สอบเทียบไฟรั่ว (ทำครั้งเดียว): เปิด Serial Monitor 115200
 *   1) ไม่กดปุ่มทดสอบใดๆ พิมพ์  zero   แล้ว Enter  (จำค่าสัญญาณรบกวนพื้นฐาน)
 *   2) กดปุ่มทดสอบ 7 mA ค้างไว้ แล้วพิมพ์  cal 7.0  (ใช้ค่าที่วัดจริงด้วยมัลติมิเตอร์ถ้ามี)
 *   ค่าจะถูกจำในบอร์ด · พิมพ์  show  เพื่อดูค่าปัจจุบัน
 * ใช้งานครั้งแรก: เสียบไฟ ต่อมือถือเข้า Wi-Fi "CoreDash-Leak-xxxx" (รหัส coredash) เลือก Wi-Fi บ้าน ใส่รหัสอุปกรณ์
 * รีเซ็ตค่า Wi-Fi: กดปุ่ม BOOT ค้าง 5 วินาที
 *
 * ระบบนี้เป็นการเฝ้าระวังเพิ่ม ไม่ใช่อุปกรณ์ตัดไฟ ต้องมีเบรกเกอร์กันดูด (RCBO 30 mA) และสายดินเสมอ
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
static const char* FW_VERSION = "leak-1.0.0";

static const int PIN_LED = 2, PIN_BOOT = 0;
static const int PZEM_RX = 16, PZEM_TX = 17;
static const int PIN_LEAK = 34;     // ADC1 เท่านั้น (ADC2 ใช้ไม่ได้ตอนเปิด Wi-Fi)
static const int PIN_MAINS = 25;    // โมดูลตรวจไฟ AC #1 : ไฟเข้า (ก่อนเบรกเกอร์)
static const int PIN_CIRCUIT = 26;  // โมดูลตรวจไฟ AC #2 : วงจรหลังเบรกเกอร์
static const int PIN_BUZZ = 27;
static const bool OPTO_ACTIVE_LOW = true;   // โมดูลส่วนใหญ่ให้ LOW เมื่อมีไฟ AC ถ้ากลับด้านให้แก้เป็น false

PZEM004Tv30 pzem(Serial2, PZEM_RX, PZEM_TX);
Preferences prefs;
String deviceKey;
uint32_t intervalMs = 60000, lastSend = 0, lastSample = 0;
int failCount = 0;

// สอบเทียบไฟรั่ว: mA = sqrt(rms² − noise²) × leakCal   (rms เป็นหน่วยค่าดิบ ADC)
float leakCal = 0.35f, leakNoise = 0.0f;
float warnMa = 9.0f, tripMa = 15.0f, maxAmp = 10.0f;   // เซิร์ฟเวอร์ส่งค่าที่ตั้งในแอปกลับมาให้

// ค่าปัจจุบัน + หน่วยความจำ 10 วินาทีล่าสุด (ใช้ตอนเบรกเกอร์ตัด)
float leakNow = 0, leakHist[10] = {0}, peakA = 0, lastA = NAN;
int histIdx = 0, leakLevel = 0;
bool mainsOn = true, circuitOn = true, firstState = true;
bool pendingEvent = false;

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

void addNum(String& js, const char* name, float v, int digits) {
  js += '"'; js += name; js += "\":";
  if (isnan(v)) js += "null"; else js += String(v, digits);
  js += ',';
}
void addBool(String& js, const char* name, bool b) {
  js += '"'; js += name; js += "\":"; js += b ? "true" : "false"; js += ',';
}

// โมดูล optocoupler บางรุ่นให้สัญญาณเป็นพัลส์ 50 Hz จึงดู 60 ms (3 รอบไฟ) ถ้ามีช่วงที่ "มีไฟ" ถือว่ามีไฟ
bool acPresent(int pin) {
  uint32_t t0 = millis();
  while (millis() - t0 < 60) {
    int s = digitalRead(pin);
    if (OPTO_ACTIVE_LOW ? s == LOW : s == HIGH) return true;
    delayMicroseconds(300);
  }
  return false;
}

// RMS ของสัญญาณ ZMCT ช่วง 200 ms (10 รอบไฟ 50 Hz) ตัดค่าเฉลี่ย (ไบแอส) ออก
float leakRms() {
  const int N = 1000;
  static uint16_t buf[N];
  uint32_t t0 = micros();
  double sum = 0;
  for (int i = 0; i < N; i++) {
    buf[i] = analogRead(PIN_LEAK);
    sum += buf[i];
    while (micros() - t0 < (uint32_t)(i + 1) * 200) {}   // 5 kHz
  }
  double mean = sum / N, sq = 0;
  for (int i = 0; i < N; i++) { double d = buf[i] - mean; sq += d * d; }
  return sqrt(sq / N);
}

float rmsToMa(float rms) {
  float s = rms * rms - leakNoise * leakNoise;
  return s > 0 ? sqrt(s) * leakCal : 0;
}

float leakMax10s() {
  float m = 0;
  for (float x : leakHist) if (x > m) m = x;
  return m;
}

void beep(int n, int ms) {
  for (int i = 0; i < n; i++) { digitalWrite(PIN_BUZZ, HIGH); delay(ms); digitalWrite(PIN_BUZZ, LOW); delay(ms); }
}

void factoryReset() {
  blink(10, 60);
  prefs.remove("key");
  WiFiManager wm; wm.resetSettings();
  delay(500); ESP.restart();
}

void startPortal(bool force) {
  WiFiManager wm;
  char keyBuf[40];
  strncpy(keyBuf, deviceKey.c_str(), sizeof(keyBuf) - 1); keyBuf[sizeof(keyBuf) - 1] = '\0';
  WiFiManagerParameter pKey("key", "รหัสอุปกรณ์ (cdw_...)", keyBuf, 30);
  wm.addParameter(&pKey);
  wm.setTitle("CoreDash Leak");
  wm.setConfigPortalTimeout(300);
  String ap = "CoreDash-Leak-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFF), HEX);
  bool ok = force ? wm.startConfigPortal(ap.c_str(), AP_PASS) : wm.autoConnect(ap.c_str(), AP_PASS);
  String k = String(pKey.getValue()); k.trim();
  if (validKey(k) && k != deviceKey) { deviceKey = k; prefs.putString("key", deviceKey); }
  if (!ok) { delay(1000); ESP.restart(); }
}

float jsonNum(const String& body, const char* name, float dflt) {
  String pat = String("\"") + name + "\"";
  int p = body.indexOf(pat);
  if (p < 0) return dflt;
  int c = body.indexOf(':', p);
  return c > 0 ? body.substring(c + 1).toFloat() : dflt;
}

bool sendReading(bool event) {
  float v = pzem.voltage(), a = pzem.current(), w = pzem.power();
  float kwh = pzem.energy(), pf = pzem.pf(), hz = pzem.frequency();
  // ตอนเบรกเกอร์ตัด ส่งไฟรั่วสูงสุดช่วง 10 วินาทีก่อนตัด เพื่อให้ระบบบอกสาเหตุได้
  float leakSend = (!circuitOn) ? leakMax10s() : (event ? max(leakNow, leakHist[(histIdx + 9) % 10]) : leakNow);

  String js = "{\"p_key\":\""; js += deviceKey; js += "\",";
  addNum(js, "p_v", v, 1); addNum(js, "p_a", a, 3); addNum(js, "p_w", w, 1);
  addNum(js, "p_kwh", kwh, 3); addNum(js, "p_pf", pf, 2); addNum(js, "p_hz", hz, 1);
  addNum(js, "p_leak_ma", leakSend, 1); addNum(js, "p_peak_a", peakA, 2);
  addBool(js, "p_mains", mainsOn); addBool(js, "p_brk", circuitOn);
  js += "\"p_fw\":\""; js += FW_VERSION; js += "\"}";

  WiFiClientSecure client;
  client.setInsecure();   // ข้อมูลยังเข้ารหัสระหว่างทาง ถ้าต้องการตรวจใบรับรองให้ใช้ setCACert(...)
  HTTPClient http;
  http.setTimeout(10000);
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/watch_ingest";
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  int code = http.POST(js);
  String body = code > 0 ? http.getString() : "";
  http.end();
  Serial.printf("[leak] POST %d %s\n", code, body.c_str());
  if (code != 200) return false;
  if (body.indexOf("unknown device") >= 0 || body.indexOf("bad key") >= 0) { blink(3, 300); return false; }
  if (body.indexOf("too fast") >= 0) return false;
  long sec = (long)jsonNum(body, "interval", 0);
  if (sec >= 15 && sec <= 3600) intervalMs = (uint32_t)sec * 1000UL;
  warnMa = jsonNum(body, "lw", warnMa);
  tripMa = jsonNum(body, "lt", tripMa);
  maxAmp = jsonNum(body, "ma", maxAmp);
  peakA = 0;
  return body.indexOf("\"ok\": true") >= 0 || body.indexOf("\"ok\":true") >= 0;
}

void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n'); cmd.trim();
  if (cmd == "zero") {
    float s = 0; for (int i = 0; i < 5; i++) s += leakRms();
    leakNoise = s / 5; prefs.putFloat("noise", leakNoise);
    Serial.printf("บันทึกสัญญาณพื้นฐาน = %.2f\n", leakNoise);
  } else if (cmd.startsWith("cal ")) {
    float ma = cmd.substring(4).toFloat();
    float s = 0; for (int i = 0; i < 5; i++) s += leakRms();
    float rms = s / 5, net = sqrt(max(0.0f, rms * rms - leakNoise * leakNoise));
    if (ma > 0.5f && net > 1) { leakCal = ma / net; prefs.putFloat("cal", leakCal); Serial.printf("สอบเทียบแล้ว: %.2f mA = %.2f หน่วย → cal %.4f\n", ma, net, leakCal); }
    else Serial.println("สอบเทียบไม่สำเร็จ: ไม่พบสัญญาณ ตรวจว่ากดปุ่มทดสอบค้างอยู่ และสาย L+N ลอดผ่าน ZMCT");
  } else if (cmd == "show") {
    Serial.printf("ไฟรั่ว %.1f mA · noise %.2f · cal %.4f · เตือน %.1f / อันตราย %.1f mA · ไฟเข้า %d · วงจร %d\n",
                  leakNow, leakNoise, leakCal, warnMa, tripMa, mainsOn, circuitOn);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT); pinMode(PIN_BUZZ, OUTPUT); digitalWrite(PIN_BUZZ, LOW);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  pinMode(PIN_MAINS, INPUT_PULLUP); pinMode(PIN_CIRCUIT, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_LEAK, ADC_11db);
  prefs.begin("cdleak", false);
  leakCal = prefs.getFloat("cal", leakCal);
  leakNoise = prefs.getFloat("noise", leakNoise);
  deviceKey = prefs.getString("key", "");
  if (!validKey(deviceKey) && validKey(String(DEVICE_KEY_DEFAULT))) deviceKey = DEVICE_KEY_DEFAULT;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  startPortal(!validKey(deviceKey));
  blink(2, 150); beep(1, 80);
  lastSend = millis() - intervalMs + 5000;
}

void loop() {
  if (digitalRead(PIN_BOOT) == LOW) {
    uint32_t t0 = millis();
    while (digitalRead(PIN_BOOT) == LOW) { if (millis() - t0 > 5000) factoryReset(); delay(20); }
  }
  handleSerial();

  // อ่านค่าทุก 1 วินาที
  if (millis() - lastSample >= 1000) {
    lastSample = millis();
    bool m = acPresent(PIN_MAINS), c = acPresent(PIN_CIRCUIT);
    if (c) {                                      // วัดไฟรั่วได้เฉพาะตอนวงจรมีไฟ
      leakNow = rmsToMa(leakRms());
      float a = pzem.current();
      if (!isnan(a)) {
        if (a >= maxAmp * 0.9f && (isnan(lastA) || lastA < maxAmp * 0.9f)) pendingEvent = true;   // กระแสข้ามเส้นใกล้พิกัด
        lastA = a; if (a > peakA) peakA = a;
      }
    } else leakNow = 0;
    leakHist[histIdx] = leakNow; histIdx = (histIdx + 1) % 10;

    int lv = leakNow >= tripMa ? 2 : leakNow >= warnMa ? 1 : (leakNow < warnMa * 0.7f ? 0 : min(leakLevel, 1));
    if (!firstState && (m != mainsOn || c != circuitOn || lv != leakLevel)) pendingEvent = true;
    if (lv > leakLevel) beep(lv == 2 ? 5 : 2, lv == 2 ? 120 : 250);   // เตือนที่ตัวเครื่องทันที
    if (!firstState && mainsOn && m && circuitOn && !c) beep(3, 400);   // เบรกเกอร์ตัด
    mainsOn = m; circuitOn = c; leakLevel = lv; firstState = false;
  }

  // ส่งตามรอบ หรือส่งทันทีเมื่อมีเหตุการณ์ (เซิร์ฟเวอร์รับห่างกันอย่างน้อย 10 วินาที)
  bool due = millis() - lastSend >= intervalMs;
  bool eventDue = pendingEvent && millis() - lastSend >= 11000;
  if (due || eventDue) {
    lastSend = millis();
    if (WiFi.status() == WL_CONNECTED && sendReading(eventDue)) {
      failCount = 0; pendingEvent = false; blink(1, 40);
    } else if (++failCount >= 10) {
      ESP.restart();
    }
  }
  delay(20);
}
