#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

// Verified against qqqlab/madflight 1d5efa78332d57db47ed6856359a8005d6e245f0.
// That version emits whole km/h and whole degrees in GPS fields, and uses
// a 4-byte 0x09 payload (altitude dm +10000, signed vertical speed cm/s).
static constexpr bool MADFLIGHT_GPS_WHOLE_UNITS = true;

inline uint8_t crsfCrc8(const uint8_t *p, size_t n) {
  uint8_t crc = 0;
  while (n--) {
    crc ^= *p++;
    for (int i = 0; i < 8; ++i)
      crc = (crc & 0x80) ? uint8_t((crc << 1) ^ 0xD5) : uint8_t(crc << 1);
  }
  return crc;
}
inline uint16_t usToCrsf(uint16_t us) {
  int32_t v = (int32_t(us) - 1500) * 8 / 5 + 992;
  return v < 172 ? 172 : (v > 1811 ? 1811 : v);
}
inline void packCrsfChannels(const uint16_t *us, uint8_t *out) {
  uint32_t bits = 0;
  unsigned count = 0, pos = 0;
  for (unsigned i = 0; i < 16; ++i) {
    bits |= uint32_t(usToCrsf(us[i]) & 0x7ff) << count;
    count += 11;
    while (count >= 8) { out[pos++] = uint8_t(bits); bits >>= 8; count -= 8; }
  }
}
struct TelemetryStamp { bool seen = false; uint32_t ms = 0; };
struct Telemetry {
  TelemetryStamp battery, attitude, gps, altitude, mode;
  float voltage = 0, current = 0, pitch = 0, roll = 0, yaw = 0;
  uint32_t consumed = 0;
  uint8_t percent = 0, satellites = 0;
  double latitude = 0, longitude = 0;
  float speed = 0, course = 0, gpsAltitude = 0, baroAltitude = 0, verticalSpeed = 0;
  char flightMode[17] = {};
  uint32_t validFrames = 0, crcErrors = 0, badLengths = 0, unknownFrames = 0;
  uint32_t bytes = 0, timeouts = 0, noiseBytes = 0, attitudeFrames = 0;
};
class CrsfTelemetry {
 public:
  Telemetry data;
  void expire(uint32_t now) {
    // Polling is every 10 ms. Allow several polling periods before discarding
    // a partial frame; never impose a sub-millisecond wire timeout here.
    if (used && uint32_t(now - lastByte) > 50) { used = 0; ++data.timeouts; }
  }
  void feed(uint8_t b, uint32_t now) {
    expire(now); lastByte = now; ++data.bytes;
    if (used == sizeof(buffer)) { discard(1); ++data.noiseBytes; }
    buffer[used++] = b;
    while (used) {
      if (!sync(buffer[0])) { discard(1); ++data.noiseBytes; continue; }
      if (used < 2) return;
      if (buffer[1] < 2 || buffer[1] > 62) { ++data.badLengths; discard(1); continue; }
      unsigned total = unsigned(buffer[1]) + 2;
      if (used < total) {
        // A corrupt length must not hide a complete CRC-valid frame behind it.
        for (unsigned i=1; i+3<used; ++i) {
          if (!sync(buffer[i]) || buffer[i+1]<2 || buffer[i+1]>62) continue;
          unsigned size=unsigned(buffer[i+1])+2;
          if (i+size<=used && crsfCrc8(buffer+i+2,size-3)==buffer[i+size-1]) {
            data.noiseBytes+=i; discard(i); total=size; break;
          }
        }
        if (used < total) return;
      }
      if (crsfCrc8(buffer + 2, total - 3) != buffer[total - 1]) {
        ++data.crcErrors; discard(1); continue;
      }
      ++data.validFrames;
      decode(buffer[2], buffer + 3, total - 4, now);
      discard(total);
    }
  }
 private:
  static bool sync(uint8_t b) {
    return b==0xc8 || b==0xea || b==0xec || b==0xee || b==0x00;
  }
  uint8_t buffer[64] = {};
  unsigned used = 0;
  uint32_t lastByte = 0;
  static uint16_t u16(const uint8_t *p) { return uint16_t(p[0]) << 8 | p[1]; }
  static int32_t s16(const uint8_t *p) { uint16_t v = u16(p); return v & 0x8000 ? int32_t(v) - 65536 : v; }
  static int64_t s32(const uint8_t *p) {
    uint32_t v = uint32_t(p[0]) << 24 | uint32_t(p[1]) << 16 | uint32_t(p[2]) << 8 | p[3];
    return v & 0x80000000UL ? int64_t(v) - 4294967296LL : v;
  }
  void discard(unsigned n) { used -= n; memmove(buffer, buffer + n, used); }
  static void mark(TelemetryStamp &s, uint32_t now) { s.seen = true; s.ms = now; }
  void decode(uint8_t type, const uint8_t *p, unsigned n, uint32_t now) {
    switch (type) {
      case 0x08:
        if (n < 8) break;
        data.voltage = u16(p) / 10.0f; data.current = u16(p+2) / 10.0f;
        data.consumed = uint32_t(p[4]) << 16 | uint32_t(p[5]) << 8 | p[6];
        data.percent = p[7]; mark(data.battery, now); return;
      case 0x1e:
        if (n < 6) break;
        data.pitch = s16(p) * 0.005729577951f;
        data.roll = s16(p+2) * 0.005729577951f;
        data.yaw = s16(p+4) * 0.005729577951f;
        ++data.attitudeFrames; mark(data.attitude, now); return;
      case 0x02:
        if (n < 15) break;
        data.latitude = s32(p) / 10000000.0; data.longitude = s32(p+4) / 10000000.0;
        data.speed = u16(p+8) / (MADFLIGHT_GPS_WHOLE_UNITS ? 1.0f : 10.0f);
        data.course = u16(p+10) / (MADFLIGHT_GPS_WHOLE_UNITS ? 1.0f : 100.0f);
        data.gpsAltitude = int32_t(u16(p+12)) - 1000;
        data.satellites = p[14]; mark(data.gps, now); return;
      case 0x09:
        if (n < 4) break; // Madflight format, not the newer packed 3-byte variant.
        data.baroAltitude = (int32_t(u16(p)) - 10000) / 10.0f;
        data.verticalSpeed = s16(p+2) / 100.0f;
        mark(data.altitude, now); return;
      case 0x21: {
        if (!n) break;
        unsigned i = 0;
        for (; i < n && i < 16 && p[i]; ++i)
          data.flightMode[i] = p[i] >= 32 && p[i] <= 126 ? char(p[i]) : '?';
        data.flightMode[i] = 0; mark(data.mode, now); return;
      }
      default: ++data.unknownFrames; return;
    }
    ++data.badLengths;
  }
};
