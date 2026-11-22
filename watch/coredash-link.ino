/*
 * CoreDash Link · เฟิร์มแวร์ ESP32-C3  v1.0.0
 * ─────────────────────────────────────────────
 * กล่องเล็กติดในตู้ไฟ อ่านค่าแล้วส่งขึ้น coredashtech.com ทุก 60 วินาที
 *   - มิเตอร์ไฟ RS485 (Modbus RTU): PZEM-016 หรือ Eastron SDM120
 *   - หัววัดอุณหภูมิ DS18B20 (ไม่ต่อก็ได้)
 *   - เซนเซอร์ระดับน้ำ 4–20 mA (ไม่ต่อก็ได้)
 *   - สถานะไฟเมน (ดูจากไฟ 24V ของแหล่งจ่ายรางดิน) + แรงดันแบตสำรอง 18650
 * พอไฟเมนดับ บอร์ดยังทำงานด้วยแบตและส่ง "ไฟดับ" ขึ้นไปทันที (ถ้าเราเตอร์มี UPS)
 *
 * ไลบรารี (Arduino IDE → Library Manager):
 *   - "WiFiManager" โดย tzapu
 *   - "OneWire" โดย Paul Stoffregen
 *   - "DallasTemperature" โดย Miles Burton
 * บอร์ด: "ESP32C3 Dev Module" (Board Manager: "esp32" โดย Espressif v3.x)
 *   ตั้ง Tools → USB CDC On Boot: Enabled  แล้วเสียบสาย USB-C ที่บอร์ดเพื่อลงโปรแกรม
 *
 * ใช้งานครั้งแรก:
 *   1) จ่ายไฟ 24V ไฟ LED แดงกะพริบ = รอตั้ง Wi-Fi
 *   2) ต่อมือถือเข้า Wi-Fi "CoreDash-Link-xxxx" (รหัส coredash)
 *   3) เลือก Wi-Fi บ้าน · ใส่รหัสอุปกรณ์ cdw_... · เลือกชนิดมิเตอร์และเลข Modbus
 * รีเซ็ตค่า: กดปุ่มค้าง 5 วินาทีขณะทำงาน
 *
 * ฝั่งเซิร์ฟเวอร์ต้องรัน supabase/link-upgrade.sql ก่อน (เพิ่มช่องข้อมูลใหม่)
 *
 * © 2026 CoreDash Technology · โทร 081-923-2380
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "esp_sleep.h"

// ───── ค่าตั้ง (หน้าเว็บกรอกให้อัตโนมัติตอนดาวน์โหลด) ─────
static const char* SUPABASE_URL = "__SUPABASE_URL__";
static const char* SUPABASE_KEY = "__SUPABASE_KEY__";   // publishable key (เปิดเผยได้)
static const char* DEVICE_KEY_DEFAULT = "__DEVICE_KEY__";
static const char* AP_PASS = "coredash";
static const char* FW_VERSION = "link-1.0.0";

// ───── ขา ESP32-C3-MINI-1 (ตรงกับวงจร CoreDash Link v1) ─────
static const int PIN_LOOP_ADC = 0;   // 4–20 mA ผ่านตัวต้านทาน 100 Ω
static const int PIN_BATT_ADC = 1;   // แบต 18650 ผ่านตัวแบ่ง 100k/100k
static const int PIN_MAINS    = 3;   // 24V มี = HIGH (ตัวแบ่ง 100k/10k) · ใช้ปลุกจาก deep sleep ได้
static const int PIN_1WIRE    = 4;   // DS18B20 (pull-up 4.7k)
static const int PIN_RELAY    = 5;   // รีเลย์ (สำรองไว้ใช้รุ่นถัดไป ตอนนี้ปิดไว้)
static const int PIN_RS485_RX = 6;   // RO ของ MAX3485
static const int PIN_RS485_TX = 7;   // DI ของ MAX3485
static const int PIN_RS485_DE = 10;  // DE+/RE ของ MAX3485 (HIGH = ส่ง)
static const int PIN_BTN      = 9;   // ปุ่ม BOOT/ตั้งค่า
static const int PIN_LED_G    = 20;  // LED เขียว
static const int PIN_LED_R    = 21;  // LED แดง

static const float SHUNT_OHM   = 100.0f;  // 0.1%
static const float BATT_DIV    = 2.0f;
static const float BATT_CUTOFF = 3.30f;   // ต่ำกว่านี้ตอนไฟดับ = หลับรอไฟกลับ ถนอมแบต

enum MeterType { METER_NONE = 0, METER_PZEM016 = 1, METER_SDM120 = 2 };

HardwareSerial RS(1);
OneWire oneWire(PIN_1WIRE);
DallasTemperature ds(&oneWire);
Preferences prefs;

String deviceKey;
int meterType = METER_PZEM016;
int meterAddr = 1;
uint32_t intervalMs = 60000;
uint32_t lastSend = 0, nextRetry = 0;
int failCount = 0;
bool mainsOk = true, mainsRaw = true, sendNow = false, badKey = false, haveDs = false;
uint32_t mainsChangedAt = 0;

struct Reading { float v, a, w, kwh, pf, hz, temp, level, batt; bool mains; };

// ───── ตัวช่วยทั่วไป ─────
bool validKey(const String& k) {
  if (k.length() != 28 || !k.startsWith("cdw_")) return false;
  for (size_t i = 4; i < k.length(); i++) {
    char c = k[i];
    if (!((c >= 'A' && c <= 'Z') || (c >= '2' && c <= '9'))) return false;
  }
  return true;
}

void addNum(String& js, const char* name, float v, int digits) {
  js += ",\""; js += name; js += "\":";
  if (isnan(v)) js += "null"; else js += String(v, digits);
}

uint32_t avgMilliVolts(int pin, int n = 16) {
  uint32_t s = 0;
  for (int i = 0; i < n; i++) { s += analogReadMilliVolts(pin); delayMicroseconds(200); }
  return s / n;
}

// ───── Modbus RTU (อ่าน input register, function 0x04) ─────
uint16_t crc16(const uint8_t* b, size_t n) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    crc ^= b[i];
    for (int j = 0; j < 8; j++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
  }
  return crc;
}

bool modbusRead(uint8_t addr, uint16_t reg, uint16_t cnt, uint16_t* out) {
  if (cnt == 0 || cnt > 25) return false;
  uint8_t req[8] = { addr, 0x04, (uint8_t)(reg >> 8), (uint8_t)reg, (uint8_t)(cnt >> 8), (uint8_t)cnt, 0, 0 };
  uint16_t c = crc16(req, 6);
  req[6] = c & 0xFF; req[7] = c >> 8;
  while (RS.available()) RS.read();
  digitalWrite(PIN_RS485_DE, HIGH);
  RS.write(req, 8);
  RS.flush();                       // รอส่งครบก่อนสลับเป็นรับ
  digitalWrite(PIN_RS485_DE, LOW);

  const size_t need = 5 + 2 * cnt;
  uint8_t buf[64];
  size_t got = 0;
  uint32_t t0 = millis();
  while (got < need && millis() - t0 < 500) {
    if (RS.available()) buf[got++] = RS.read(); else delay(1);
  }
  if (got < need || buf[0] != addr || buf[1] != 0x04 || buf[2] != 2 * cnt) return false;
  if (crc16(buf, need - 2) != (uint16_t)(buf[need - 2] | (buf[need - 1] << 8))) return false;
  for (uint16_t i = 0; i < cnt; i++) out[i] = (buf[3 + 2 * i] << 8) | buf[4 + 2 * i];
  return true;
}

float regFloat(const uint16_t* r) {          // SDM120: float 32 บิต word สูงมาก่อน
  uint32_t u = ((uint32_t)r[0] << 16) | r[1];
  float f; memcpy(&f, &u, 4);
  return f;
}

bool readMeter(Reading& m) {
  if (meterType == METER_PZEM016) {
    // PZEM-016: 10 register เริ่ม 0x0000 · V×0.1 · A×0.001 · W×0.1 · Wh · Hz×0.1 · PF×0.01
    uint16_t r[10];
    if (!modbusRead(meterAddr, 0x0000, 10, r)) return false;
    m.v   = r[0] * 0.1f;
    m.a   = (((uint32_t)r[2] << 16) | r[1]) * 0.001f;
    m.w   = (((uint32_t)r[4] << 16) | r[3]) * 0.1f;
    m.kwh = (((uint32_t)r[6] << 16) | r[5]) / 1000.0f;
    m.hz  = r[7] * 0.1f;
    m.pf  = r[8] * 0.01f;
    return true;
  }
  if (meterType == METER_SDM120) {
    // Eastron SDM120: 0x0000 V · 0x0006 A · 0x000C W · 0x001E PF · 0x0046 Hz · 0x0156 kWh รวม
    uint16_t r[2];
    if (!modbusRead(meterAddr, 0x0000, 2, r)) return false;
    m.v = regFloat(r);
    if (!modbusRead(meterAddr, 0x0006, 2, r)) return false;
    m.a = regFloat(r);
    if (!modbusRead(meterAddr, 0x000C, 2, r)) return false;
    m.w = regFloat(r);
    if (modbusRead(meterAddr, 0x001E, 2, r)) m.pf = fabsf(regFloat(r));
    if (modbusRead(meterAddr, 0x0046, 2, r)) m.hz = regFloat(r);
    if (modbusRead(meterAddr, 0x0156, 2, r)) m.kwh = regFloat(r);
    return true;
  }
  return false;
}

void beginRS485() {
  RS.end();
  long baud = (meterType == METER_SDM120) ? 2400 : 9600;   // ค่าเริ่มต้นจากโรงงานของแต่ละรุ่น
  RS.begin(baud, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);
}

// ───── อ่านทุกอย่าง ─────
Reading readAll() {
  Reading m;
  m.v = m.a = m.w = m.kwh = m.pf = m.hz = m.temp = m.level = NAN;
  m.mains = mainsOk;
  m.batt = avgMilliVolts(PIN_BATT_ADC) * BATT_DIV / 1000.0f;
  if (m.batt < 2.5f) m.batt = NAN;              // ไม่ได้ใส่แบต

  if (m.mains && meterType != METER_NONE) readMeter(m);   // ไฟดับ = มิเตอร์ดับด้วย ไม่ต้องอ่าน

  if (haveDs) {
    ds.requestTemperatures();
    float t = ds.getTempCByIndex(0);
    if (t != DEVICE_DISCONNECTED_C && t > -50 && t < 125) m.temp = t;
  }

  if (m.mains) {                                 // เซนเซอร์ 4–20 mA ใช้ไฟ 24V
    float mA = avgMilliVolts(PIN_LOOP_ADC) / SHUNT_OHM;
    if (mA >= 3.0f) m.level = constrain((mA - 4.0f) / 16.0f * 100.0f, 0.0f, 100.0f);
  }
  return m;
}

// ───── ส่งขึ้น coredashtech.com ─────
// ผลลัพธ์: 1 = สำเร็จ · 0 = ล้มเหลว · 2 = ส่งเร็วเกิน (ลองใหม่อีก 11 วินาที)
int sendReading() {
  Reading m = readAll();
  String js = "{\"p_key\":\""; js += deviceKey; js += "\"";
  addNum(js, "p_v", m.v, 1); addNum(js, "p_a", m.a, 3); addNum(js, "p_w", m.w, 1);
  addNum(js, "p_kwh", m.kwh, 3); addNum(js, "p_pf", m.pf, 2); addNum(js, "p_hz", m.hz, 1);
  js += ",\"p_mains\":"; js += m.mains ? "true" : "false";
  addNum(js, "p_batt", m.batt, 2); addNum(js, "p_temp", m.temp, 1); addNum(js, "p_level", m.level, 1);
  js += ",\"p_fw\":\""; js += FW_VERSION; js += "\"}";

  WiFiClientSecure client;
  client.setInsecure();   // เข้ารหัสระหว่างทางแล้ว ถ้าต้องการตรวจใบรับรองให้ใช้ setCACert(...)
  HTTPClient http;
  http.setTimeout(10000);
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/watch_ingest";
  if (!http.begin(client, url)) return 0;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  int code = http.POST(js);
  String body = code > 0 ? http.getString() : "";
  http.end();

  Serial.printf("[link] %s\n[link] POST %d %s\n", js.c_str(), code, body.c_str());
  if (code == 404) Serial.println("[link] เซิร์ฟเวอร์ยังไม่รองรับ Link: รัน supabase/link-upgrade.sql ก่อน");
  if (code != 200) return 0;
  badKey = body.indexOf("unknown device") >= 0 || body.indexOf("bad key") >= 0;
  if (badKey) return 0;
  if (body.indexOf("too fast") >= 0) return 2;
  int p = body.indexOf("\"interval\"");
  if (p >= 0) {
    int c = body.indexOf(':', p);
    long sec = c > 0 ? body.substring(c + 1).toInt() : 0;
    if (sec >= 15 && sec <= 3600) intervalMs = (uint32_t)sec * 1000UL;
  }
  return (body.indexOf("\"ok\": true") >= 0 || body.indexOf("\"ok\":true") >= 0) ? 1 : 0;
}

// ───── หน้าตั้งค่า Wi-Fi ─────
void startPortal(bool force) {
  WiFiManager wm;
  char keyBuf[40], typeBuf[4], addrBuf[5];
  strncpy(keyBuf, deviceKey.c_str(), sizeof(keyBuf) - 1); keyBuf[sizeof(keyBuf) - 1] = '\0';
  snprintf(typeBuf, sizeof(typeBuf), "%d", meterType);
  snprintf(addrBuf, sizeof(addrBuf), "%d", meterAddr);
  WiFiManagerParameter pKey("key", "รหัสอุปกรณ์ (cdw_...)", keyBuf, 30);
  WiFiManagerParameter pType("mtype", "ชนิดมิเตอร์: 1=PZEM-016 · 2=SDM120 · 0=ไม่มี", typeBuf, 2);
  WiFiManagerParameter pAddr("maddr", "เลข Modbus ของมิเตอร์ (ปกติ 1)", addrBuf, 4);
  wm.addParameter(&pKey); wm.addParameter(&pType); wm.addParameter(&pAddr);
  wm.setTitle("CoreDash Link");
  wm.setConfigPortalTimeout(300);
  String ap = "CoreDash-Link-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFF), HEX);

  bool ok = force ? wm.startConfigPortal(ap.c_str(), AP_PASS) : wm.autoConnect(ap.c_str(), AP_PASS);
  String k = String(pKey.getValue()); k.trim();
  if (validKey(k) && k != deviceKey) { deviceKey = k; prefs.putString("key", deviceKey); }
  int t = atoi(pType.getValue());
  if (t >= METER_NONE && t <= METER_SDM120) { meterType = t; prefs.putInt("mtype", t); }
  int a = atoi(pAddr.getValue());
  if (a >= 1 && a <= 247) { meterAddr = a; prefs.putInt("maddr", a); }
  if (!ok) { delay(1000); ESP.restart(); }
}

void factoryReset() {
  for (int i = 0; i < 10; i++) { digitalWrite(PIN_LED_R, HIGH); delay(60); digitalWrite(PIN_LED_R, LOW); delay(60); }
  prefs.clear();
  WiFiManager wm; wm.resetSettings();
  delay(500);
  ESP.restart();
}

// ไฟดับนานจนแบตใกล้หมด → หลับลึก ตื่นเองเมื่อ 24V กลับมา (GPIO3 = HIGH)
void sleepUntilMains() {
  Serial.println("[link] แบตต่ำ หลับรอไฟกลับ");
  digitalWrite(PIN_LED_G, LOW); digitalWrite(PIN_LED_R, LOW);
  WiFi.disconnect(true); WiFi.mode(WIFI_OFF);
  esp_deep_sleep_enable_gpio_wakeup(1ULL << PIN_MAINS, ESP_GPIO_WAKEUP_GPIO_HIGH);
  esp_deep_sleep_start();
}

// ไฟ LED: เขียวค้าง = ปกติ · เขียวกะพริบช้า = ไฟดับ ใช้แบต · แดงค้าง = ต่อเน็ต/ส่งไม่ได้ · แดงกะพริบเร็ว = รหัสอุปกรณ์ผิด
void updateLeds() {
  uint32_t t = millis();
  bool online = WiFi.status() == WL_CONNECTED && failCount == 0;
  if (badKey) { digitalWrite(PIN_LED_G, LOW); digitalWrite(PIN_LED_R, (t / 150) % 2); return; }
  if (!online) { digitalWrite(PIN_LED_G, LOW); digitalWrite(PIN_LED_R, HIGH); return; }
  digitalWrite(PIN_LED_R, LOW);
  digitalWrite(PIN_LED_G, mainsOk ? HIGH : ((t / 1000) % 2));
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_G, OUTPUT); pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, LOW);
  pinMode(PIN_RS485_DE, OUTPUT); digitalWrite(PIN_RS485_DE, LOW);
  pinMode(PIN_BTN, INPUT_PULLUP);
  pinMode(PIN_MAINS, INPUT);
  analogSetPinAttenuation(PIN_LOOP_ADC, ADC_11db);
  analogSetPinAttenuation(PIN_BATT_ADC, ADC_11db);

  prefs.begin("cdlink", false);
  deviceKey = prefs.getString("key", "");
  if (!validKey(deviceKey) && validKey(String(DEVICE_KEY_DEFAULT))) deviceKey = DEVICE_KEY_DEFAULT;
  meterType = prefs.getInt("mtype", METER_PZEM016);
  meterAddr = prefs.getInt("maddr", 1);

  mainsOk = mainsRaw = digitalRead(PIN_MAINS) == HIGH;
  ds.begin();
  haveDs = ds.getDeviceCount() > 0;

  digitalWrite(PIN_LED_R, HIGH);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  startPortal(!validKey(deviceKey));
  beginRS485();
  lastSend = millis() - intervalMs + 5000;   // ส่งครั้งแรกหลังเปิดเครื่อง 5 วินาที
}

void loop() {
  // ปุ่มค้าง 5 วินาที = ล้างค่า
  if (digitalRead(PIN_BTN) == LOW) {
    uint32_t t0 = millis();
    while (digitalRead(PIN_BTN) == LOW) { if (millis() - t0 > 5000) factoryReset(); delay(20); }
  }

  // ไฟเมนเปลี่ยนสถานะ (นิ่ง 1.5 วินาที) → ส่งทันที
  bool raw = digitalRead(PIN_MAINS) == HIGH;
  if (raw != mainsRaw) { mainsRaw = raw; mainsChangedAt = millis(); }
  if (mainsRaw != mainsOk && millis() - mainsChangedAt > 1500) {
    mainsOk = mainsRaw;
    Serial.printf("[link] ไฟเมน %s\n", mainsOk ? "กลับมา" : "ดับ");
    sendNow = true;
  }

  bool due = millis() - lastSend >= intervalMs;
  bool retry = nextRetry && (int32_t)(millis() - nextRetry) >= 0;
  if ((due || sendNow || retry) && WiFi.status() == WL_CONNECTED) {
    lastSend = millis(); sendNow = false; nextRetry = 0;
    int r = sendReading();
    if (r == 1) failCount = 0;
    else if (r == 2) nextRetry = millis() + 11000;
    else if (++failCount >= 10 && mainsOk) ESP.restart();   // ส่งไม่ได้ 10 รอบติด ลองเริ่มใหม่
  } else if (due) {
    lastSend = millis();
    if (++failCount >= 10 && mainsOk) ESP.restart();
  }

  if (!mainsOk) {
    float b = avgMilliVolts(PIN_BATT_ADC) * BATT_DIV / 1000.0f;
    if (b > 2.5f && b < BATT_CUTOFF) sleepUntilMains();
  }

  updateLeds();
  delay(20);
}
