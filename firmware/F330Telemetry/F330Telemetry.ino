/* F330 PWM -> CRSF radio bridge + read-only Madflight telemetry dashboard.
   Classic dual-core ESP32, Arduino-ESP32 core. Open http://192.168.4.1/.
   Radio: Core 1 priority 20. Wi-Fi/HTTP: Core 0 priority 1.
   No UART1 logger, ring buffer, UDP stream, or recording.
   Bench-check channel mapping and failsafe with propellers removed.
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <atomic>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include "CrsfTelemetry.h"
#include "Dashboard.h"

#if !defined(CONFIG_IDF_TARGET_ESP32) || CONFIG_FREERTOS_UNICORE
#error "This sketch requires a classic dual-core ESP32."
#endif

static constexpr int LED_PIN = 13;
static const char *WIFI_SSID = "F330";
static const char *WIFI_PASSWORD = "flysafe123";
static constexpr int CRSF_RX_PIN = 16, CRSF_TX_PIN = 17;
static constexpr uint32_t CRSF_BAUD = 420000, CRSF_INTERVAL_MS = 10;
static constexpr uint32_t RX_FAILSAFE_MS = 500;
static constexpr int CHANNEL_PINS[6] = {32, 33, 25, 26, 27, 14};
static constexpr float sensitivity = 1.0f, expoRoll = 0, expoPitch = 0, expoYaw = 0;
static constexpr int deadband = 8, MAX_SLEW_RATE = 80;

// Original receiver calibration and failsafe rules retained. CH3 valid pulse
// freshness governs timeout; a receiver that holds PWM on RF loss is NOT
// detectable unless it emits the configured low-throttle failsafe pulse.
volatile int pwm[6] = {1500,1500,1000,1500,1000,1000};
volatile uint32_t rise[6] = {}, pulseAt[6] = {};
volatile bool risingSeen[6] = {}, pulseSeen[6] = {};
volatile uint32_t lastRx = 0;
volatile bool receiverSeen = false;
portMUX_TYPE pwmMux = portMUX_INITIALIZER_UNLOCKED;

void IRAM_ATTR capture(unsigned i) {
  const uint32_t nowUs = micros();
  const bool high = digitalRead(CHANNEL_PINS[i]);
  portENTER_CRITICAL_ISR(&pwmMux);
  if (high) { rise[i] = nowUs; risingSeen[i] = true; }
  else if (risingSeen[i]) {
    risingSeen[i] = false;
    int duration = int(nowUs - rise[i]);
    pulseAt[i] = millis(); pulseSeen[i] = true;
    if (i != 2 || (duration > 800 && duration < 2200)) pwm[i] = duration;
    if (i == 2 && duration > 800 && duration < 2200) {
      lastRx = pulseAt[i]; receiverSeen = true;
    }
  }
  portEXIT_CRITICAL_ISR(&pwmMux);
}
void IRAM_ATTR calc_ch1() { capture(0); }
void IRAM_ATTR calc_ch2() { capture(1); }
void IRAM_ATTR calc_ch3() { capture(2); }
void IRAM_ATTR calc_ch4() { capture(3); }
void IRAM_ATTR calc_ch5() { capture(4); }
void IRAM_ATTR calc_ch6() { capture(5); }

struct Snapshot {
  uint32_t at = 0, rxAge = 0, ages[6] = {};
  bool seen = false, channelSeen[6] = {}, timeout = true, receiverFailsafe = true;
  int raw[6] = {}, filtered[6] = {};
  uint16_t output[16] = {};
  uint32_t txFrames = 0, txSkipped = 0, lateCycles = 0, maxCycleUs = 0;
  Telemetry telemetry;
};
QueueHandle_t dashboardQueue;
std::atomic<uint32_t> uartFrameErrors{0}, uartOverflows{0}, uartOtherErrors{0};
void uartError(hardwareSerial_error_t error) {
  if (error==UART_FRAME_ERROR || error==UART_PARITY_ERROR) ++uartFrameErrors;
  else if (error==UART_FIFO_OVF_ERROR || error==UART_BUFFER_FULL_ERROR) ++uartOverflows;
  else ++uartOtherErrors;
}
CrsfTelemetry telemetry;
uint16_t usChannels[16];
int lastValid[4] = {1500,1500,1000,1500};

int applyOutlierFilter(int raw, int *last) {
  if (raw < 800 || raw > 2200) return *last;
  int jump = raw - *last;
  *last += abs(jump) > MAX_SLEW_RATE ? (jump > 0 ? MAX_SLEW_RATE : -MAX_SLEW_RATE) : jump;
  return *last;
}
int applyTuning(int raw, int center, bool throttle) {
  int mapped = constrain(map(raw,1150,1800,1000,2000),1000L,2000L);
  if (throttle) return mapped;
  if (abs(mapped-center) < deadband) return center;
  return center + int((mapped-center)*sensitivity);
}
int applyExpo(int us, int center, float expo) {
  float x = constrain(float(us-center)/500.0f,-1.0f,1.0f);
  return center + int((expo*x*x*x+(1-expo)*x)*500.0f);
}
bool sendCRSF() {
  uint8_t frame[26] = {0xC8,24,0x16};
  packCrsfChannels(usChannels,frame+3);
  frame[25] = crsfCrc8(frame+2,23);
  // Serial2 has one writer. Skip and count rather than wait for a full FIFO.
  if (Serial2.availableForWrite() < int(sizeof(frame))) return false;
  return Serial2.write(frame,sizeof(frame)) == sizeof(frame);
}
void readCRSFTelemetry() {
  uint32_t now = millis();
  telemetry.expire(now);
  for (unsigned budget = 0; budget < 512 && Serial2.available(); ++budget)
    telemetry.feed(uint8_t(Serial2.read()),now);
}

uint32_t ledTimer = 0;
uint8_t ledStep = 0;
void updateLED(bool hasSignal) {
  bool isArmed = usChannels[5] > 1960; // AUX2 request, not FC-confirmed arming.
  if (!hasSignal) { digitalWrite(LED_PIN,LOW); ledStep=0; return; }
  uint32_t now=millis();
  if (!isArmed) {
    if (ledStep==0) { digitalWrite(LED_PIN,HIGH); ledTimer=now; ledStep=1; }
    else if (ledStep==1 && now-ledTimer>=20) { digitalWrite(LED_PIN,LOW); ledTimer=now; ledStep=2; }
    else if (ledStep==2 && now-ledTimer>=1000) ledStep=0;
    else if (ledStep>2) ledStep=0;
  } else {
    if (ledStep==0) { digitalWrite(LED_PIN,HIGH); ledTimer=now; ledStep=1; }
    else if (ledStep==1 && now-ledTimer>=20) { digitalWrite(LED_PIN,LOW); ledTimer=now; ledStep=2; }
    else if (ledStep==2 && now-ledTimer>=20) { digitalWrite(LED_PIN,HIGH); ledTimer=now; ledStep=3; }
    else if (ledStep==3 && now-ledTimer>=20) { digitalWrite(LED_PIN,LOW); ledTimer=now; ledStep=4; }
    else if (ledStep==4 && now-ledTimer>=1000) ledStep=0;
  }
}
void radioTask(void *) {
  TickType_t nextWake=xTaskGetTickCount();
  Snapshot s;
  uint32_t previousStart=micros();
  for (;;) {
    uint32_t start=micros(), now=millis();
    if (uint32_t(start-previousStart)>15000) ++s.lateCycles;
    previousStart=start;
    portENTER_CRITICAL(&pwmMux);
    now=millis(); // Timestamp after excluding ISR updates to avoid age underflow.
    s.seen=receiverSeen; s.rxAge=now-lastRx;
    for (int i=0;i<6;++i) {
      s.raw[i]=pwm[i]; s.channelSeen[i]=pulseSeen[i]; s.ages[i]=now-pulseAt[i];
    }
    portEXIT_CRITICAL(&pwmMux);
    for (int i=0;i<6;++i) s.filtered[i]=i<4 ? applyOutlierFilter(s.raw[i],&lastValid[i]) : s.raw[i];
    usChannels[0]=applyExpo(applyTuning(s.filtered[0],1500,false),1500,expoRoll);
    usChannels[1]=applyExpo(applyTuning(s.filtered[1],1500,false),1500,expoPitch);
    usChannels[2]=applyTuning(s.filtered[2],1000,true);
    usChannels[3]=applyExpo(applyTuning(s.filtered[3],1500,false),1500,expoYaw);
    for (int i=4;i<6;++i) usChannels[i]=constrain(map(s.raw[i],1150,1800,1000,2000),1000L,2000L);
    s.timeout=!s.seen || s.rxAge>RX_FAILSAFE_MS;
    s.receiverFailsafe=s.filtered[2]<1100;
    if (s.timeout || s.receiverFailsafe) { usChannels[2]=800; usChannels[4]=1000; usChannels[5]=1000; }
    if (sendCRSF()) ++s.txFrames; else ++s.txSkipped;
    readCRSFTelemetry();
    updateLED(!s.timeout);
    memcpy(s.output,usChannels,sizeof(usChannels));
    s.at=millis(); s.telemetry=telemetry.data;
    uint32_t duration=micros()-start;
    if (duration>s.maxCycleUs) s.maxCycleUs=duration;
    // Fixed-size copy only; HTTP never takes a lock owned by the radio task.
    xQueueOverwrite(dashboardQueue,&s);
    if (xTaskGetTickCount()-nextWake >= pdMS_TO_TICKS(CRSF_INTERVAL_MS))
      nextWake=xTaskGetTickCount(); // Avoid catch-up bursts after an overrun.
    vTaskDelayUntil(&nextWake,pdMS_TO_TICKS(CRSF_INTERVAL_MS));
  }
}

WebServer server(80);
String stampJson(const TelemetryStamp &s,uint32_t now) {
  return s.seen ? String(uint32_t(now-s.ms)) : String("null");
}
String jsonString(const char *s) {
  String out="\"";
  while (*s) { if (*s=='"' || *s=='\\') out+='\\'; out+=*s++; }
  return out+'"';
}
String buildState() {
  Snapshot s;
  if (xQueuePeek(dashboardQueue,&s,0)!=pdTRUE) return String();
  uint32_t now=millis();
  const Telemetry &t=s.telemetry;
  String j; j.reserve(3100);
  j="{\"uptime\":"+String(now)+",\"snapshotAge\":"+String(uint32_t(now-s.at));
  j+=",\"rxAge\":"+(s.seen ? String(s.rxAge+uint32_t(now-s.at)) : String("null"));
  j+=",\"timeout\":"+String(s.timeout ? "true":"false")+",\"receiverFailsafe\":"+String(s.receiverFailsafe ? "true":"false");
  j+=",\"channels\":[";
  for (int i=0;i<6;++i) {
    if (i) j+=',';
    j+="{\"raw\":"+String(s.raw[i])+",\"filtered\":"+String(s.filtered[i])+",\"output\":"+String(s.output[i]);
    j+=",\"crsf\":"+String(usToCrsf(s.output[i]))+",\"wireUs\":"+String((int(usToCrsf(s.output[i]))-992)*0.625f+1500,1);
    j+=",\"age\":"+(s.channelSeen[i] ? String(s.ages[i]+uint32_t(now-s.at)):String("null"))+"}";
  }
  j+="],\"battery\":{\"age\":"+stampJson(t.battery,now)+",\"voltage\":"+String(t.voltage,1)+",\"current\":"+String(t.current,1)+",\"mah\":"+String(t.consumed)+",\"percent\":"+String(t.percent)+"}";
  j+=",\"attitude\":{\"age\":"+stampJson(t.attitude,now)+",\"pitch\":"+String(t.pitch,2)+",\"roll\":"+String(t.roll,2)+",\"yaw\":"+String(t.yaw,2)+"}";
  j+=",\"altitude\":{\"age\":"+stampJson(t.altitude,now)+",\"height\":"+String(t.baroAltitude,1)+",\"vs\":"+String(t.verticalSpeed,2)+"}";
  j+=",\"gps\":{\"age\":"+stampJson(t.gps,now)+",\"lat\":"+String(t.latitude,7)+",\"lon\":"+String(t.longitude,7)+",\"speed\":"+String(t.speed,1)+",\"course\":"+String(t.course,1)+",\"height\":"+String(t.gpsAltitude,1)+",\"sats\":"+String(t.satellites)+"}";
  j+=",\"mode\":{\"age\":"+stampJson(t.mode,now)+",\"text\":"+jsonString(t.flightMode)+"}";
  j+=",\"stats\":{\"tx\":"+String(s.txFrames)+",\"skipped\":"+String(s.txSkipped)+",\"late\":"+String(s.lateCycles)+",\"maxCycleUs\":"+String(s.maxCycleUs);
  j+=",\"uartFrameErrors\":"+String(uartFrameErrors.load())+",\"uartOverflows\":"+String(uartOverflows.load())+",\"uartOtherErrors\":"+String(uartOtherErrors.load());
  j+=",\"noiseBytes\":"+String(t.noiseBytes)+",\"attitudeFrames\":"+String(t.attitudeFrames);
  j+=",\"bytes\":"+String(t.bytes)+",\"valid\":"+String(t.validFrames)+",\"crcErrors\":"+String(t.crcErrors)+",\"badLengths\":"+String(t.badLengths)+",\"unknown\":"+String(t.unknownFrames)+",\"partialTimeouts\":"+String(t.timeouts)+",\"heap\":"+String(ESP.getFreeHeap())+"}}";
  return j;
}
void serveData() {
  String j=buildState();
  server.sendHeader("Cache-Control","no-store");
  server.send(j.length()?200:503,"application/json",j.length()?j:String("{}"));
}
#include "TelemetryStream.h"

void webTask(void *) {
  WiFi.mode(WIFI_AP); WiFi.setSleep(false);
  if (!WiFi.softAP(WIFI_SSID,WIFI_PASSWORD)) {
    Serial.println("Wi-Fi AP failed; radio task continues."); vTaskDelete(nullptr); return;
  }
  Serial.print("F330 dashboard: http://"); Serial.println(WiFi.softAPIP());
  server.on("/",HTTP_GET,[](){ server.send_P(200,"text/html; charset=utf-8",DASHBOARD_HTML); });
  server.on("/api/state",HTTP_GET,serveData);
  server.onNotFound([](){server.send(404,"text/plain","Not found");});
  server.begin();
  if (xTaskCreatePinnedToCore(streamTask,"events",10240,nullptr,2,nullptr,0)!=pdPASS)
    Serial.println("Stream allocation failed; HTTP fallback remains available.");
  for (;;) { server.handleClient(); vTaskDelay(pdMS_TO_TICKS(2)); }
}
void setup() {
  Serial.begin(115200);
  Serial2.setRxBufferSize(4096);
  Serial2.begin(CRSF_BAUD,SERIAL_8N1,CRSF_RX_PIN,CRSF_TX_PIN);
  Serial2.setRxFIFOFull(32);
  Serial2.setRxTimeout(1);
  Serial2.onReceiveError(uartError);
  pinMode(LED_PIN,OUTPUT); digitalWrite(LED_PIN,LOW);
  for (int i=0;i<6;++i) pinMode(CHANNEL_PINS[i],INPUT_PULLDOWN);
  attachInterrupt(digitalPinToInterrupt(CHANNEL_PINS[0]),calc_ch1,CHANGE);
  attachInterrupt(digitalPinToInterrupt(CHANNEL_PINS[1]),calc_ch2,CHANGE);
  attachInterrupt(digitalPinToInterrupt(CHANNEL_PINS[2]),calc_ch3,CHANGE);
  attachInterrupt(digitalPinToInterrupt(CHANNEL_PINS[3]),calc_ch4,CHANGE);
  attachInterrupt(digitalPinToInterrupt(CHANNEL_PINS[4]),calc_ch5,CHANGE);
  attachInterrupt(digitalPinToInterrupt(CHANNEL_PINS[5]),calc_ch6,CHANGE);
  for (int i=0;i<16;++i) usChannels[i]=1500;
  usChannels[2]=800; usChannels[4]=usChannels[5]=1000;
  dashboardQueue=xQueueCreate(1,sizeof(Snapshot));
  if (!dashboardQueue || xTaskCreatePinnedToCore(radioTask,"radio",4096,nullptr,20,nullptr,1)!=pdPASS) {
    Serial.println("ERROR: radio task allocation failed; no RC output.");
    for (;;) delay(1000);
  }
  if (xTaskCreatePinnedToCore(webTask,"dashboard",8192,nullptr,1,nullptr,0)!=pdPASS)
    Serial.println("ERROR: dashboard allocation failed; radio task continues.");
}
void loop() { vTaskDelay(pdMS_TO_TICKS(1000)); }
