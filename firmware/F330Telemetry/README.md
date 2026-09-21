# F330 ESP32 radio bridge and Madflight dashboard

Open `F330Telemetry.ino` in Arduino IDE, keeping `CrsfTelemetry.h` and `Dashboard.h` in the same folder. Select the classic **ESP32 Dev Module** (dual-core ESP32), then compile/upload. Uses only Arduino-ESP32's bundled WiFi and WebServer libraries. Tested compilation with Arduino-ESP32 **3.3.11**, `esp32:esp32:esp32`. Not intended for ESP32-C3 or other single-core boards.

Connect to Wi-Fi **F330**, password **flysafe123**, and open **http://192.168.4.1/**. The device prints its actual AP address on USB serial at 115200 baud. Stay connected if your phone reports “no internet.” The dashboard assets are embedded, and it polls `/api/state` about 10 times per second. No laptop program is needed.

## Wiring

| Signal | ESP32 | Pico 2 / receiver |
|---|---|---|
| CRSF telemetry RX | GPIO16 | Pico GPIO4 TX on the configured Madflight RC UART |
| CRSF RC TX | GPIO17 | Pico GPIO5 RX on that same UART |
| Ground | GND | Common Pico and receiver ground |
| Roll PWM | GPIO32 | Receiver CH1 |
| Pitch PWM | GPIO33 | Receiver CH2 |
| Throttle PWM | GPIO25 | Receiver CH3 |
| Yaw PWM | GPIO26 | Receiver CH4 |
| AUX1 PWM | GPIO27 | Receiver CH5 |
| AUX2 PWM | GPIO14 | Receiver CH6 |
| Status LED | GPIO13 | Existing LED |

Use 3.3 V logic; level-shift receiver outputs if they exceed ESP32 input limits. The pin mapping above follows your supplied wiring. Verify the Pico's configured UART actually uses GPIO4 TX and GPIO5 RX. The old Pico GPIO12 → ESP32 GPIO21 logging connection is no longer used and can be disconnected. No blackbox UART, UDP protocol, logging tasks, or recording buffers remain in this replacement.

## Madflight setup and researched formats

Set Madflight's receiver to **CRSF** (`rcl_gizmo CRSF` in versions with that configuration interface), with the appropriate serial bus and **420000 baud**, normal non-inverted full-duplex UART. Both TX and RX must be configured. Keep Madflight processing its receiver input normally: in the examined source, receiving bytes drives the telemetry scheduler. No separate OpenLog stream or telemetry request packet is required.

Verify FC channel configuration: roll=1, pitch=2, throttle=3, yaw=4, flight-mode/AUX1=5, arm/AUX2=6 if that matches your aircraft. FC channel assignments and sensor configuration are not changed by the ESP32 sketch. Battery and GPS frames can contain zeros if the corresponding FC sensors are absent/unconfigured.

Research pinned to Madflight commit **1d5efa78332d57db47ed6856359a8005d6e245f0**, inspected September 13, 2026:

- [Madflight CRSF scheduler](https://github.com/qqqlab/madflight/blob/1d5efa78332d57db47ed6856359a8005d6e245f0/src/rcl/crsf/crsf.h)
- [Madflight telemetry encoder](https://github.com/qqqlab/madflight/blob/1d5efa78332d57db47ed6856359a8005d6e245f0/src/rcl/crsf/crsf_telemetry.h)
- [Madflight receiver integration](https://github.com/qqqlab/madflight/blob/1d5efa78332d57db47ed6856359a8005d6e245f0/src/rcl/RclGizmoCrsf.h)
- [TBS CRSF specification](https://github.com/tbs-fpv/tbs-crsf-spec/blob/main/crsf.md)

| Type | Decoder / dashboard |
|---|---|
| `0x08` Battery | Big-endian voltage/current ÷10; 24-bit consumed mAh; reported percentage |
| `0x1E` Attitude | Signed pitch, roll, yaw in radians ×10000, displayed as degrees |
| `0x02` GPS | Signed latitude/longitude ÷10⁷; altitude minus 1000 m; satellite count; speed/course compatibility below |
| `0x09` Altitude | Madflight's four-byte payload: unsigned altitude minus 10000, divided by 10 m; signed vertical speed ÷100 m/s |
| `0x21` Flight mode | Bounded text; leading `*` means FC armed in this Madflight implementation |

The examined scheduler sends mode, attitude and altitude roughly every 100 ms, and battery/GPS roughly every second. It **hard-codes battery remaining to 100%**. The dashboard labels that field as a placeholder, not usable charge estimation. FC mode text may contain a satellite-count prefix.

The examined Madflight GPS sender puts **whole km/h and whole degrees** on the wire. The published CRSF format specifies tenths of km/h and hundredths of degrees. `MADFLIGHT_GPS_WHOLE_UNITS = true` in `CrsfTelemetry.h` deliberately matches this Madflight implementation. If your installed version fixes this discrepancy, set it to `false`. The `0x09` decoder deliberately targets Madflight's four-byte altitude payload, not the newer three-byte packed vertical-speed format. Madflight's current altitude encoder also does not implement the specification's high-altitude encoding; its range is limited by its unsigned decimeter representation. Do not assume interoperability with other FC firmware without checking those formats.

## Radio behavior and debugging

- Original six PWM inputs and CRSF mapping retained. Channels 7–16 remain 1500 µs.
- Original calibration `1150–1800 → 1000–2000 µs`, 8 µs deadband, sensitivity 1, zero expo, and 80 µs/frame slew limit retained.
- Raw, filtered, requested output, encoded 11-bit value, and decoded wire-equivalent µs are displayed together. Stick display offers raw/calibrated and processed views, with a Mode 2 layout. Higher channel values move dots up/right; actual axis directions depend on transmitter/FC calibration.
- CH3 raw display retains the last accepted 800–2200 µs pulse as in the supplied code. Other channels display their captured widths. Pulse age is the age of a completed pulse; receiver age is the age of a **valid CH3** pulse.
- Original failsafe rules retained: valid CH3 timeout over 500 ms OR filtered throttle below 1100 µs requests throttle=800, AUX1/AUX2=1000. Roll/pitch/yaw continue using the original filtering rules.
- **Startup fix:** no valid CH3 pulse means immediate timeout. Startup no longer pretends a receiver pulse was received.
- CRSF clamps 800 µs to raw 172, approximately **988 µs**. The FC never receives a literal 800 µs throttle through this encoder. Configure and verify FC arming/failsafe accordingly. The bridge continues transmitting RC frames during receiver failsafe, as your original code did.
- Receiver timeout still depends on CH3 only. Other-channel loss is shown in the inspector but does not introduce a new flight-control policy. A legacy receiver holding valid-looking PWM on RF loss cannot be detected by pulse freshness; verify its programmed low-throttle/arm-switch failsafe behavior.
- GPIO13 keeps the supplied single/double-flash patterns. The double flash follows AUX2 >1960, not FC-confirmed arming. The dashboard distinguishes that request from fresh FC mode telemetry.

## Scheduling and robustness

Radio runs on Core 1 at priority 20 with a 10 ms target period. Telemetry receive work is capped at 256 bytes per cycle; CRC, frame length and payload length are checked. The parser accepts all address bytes as candidates and resynchronizes using length/CRC. A partial-frame timeout handles interrupted streams.

Wi-Fi and HTTP run on Core 0 at priority 1. The radio publishes a fixed-size snapshot through a one-slot FreeRTOS queue; network code never formats JSON or serves clients in the radio task. UART writes are checked for space and skipped/counted if full, and missed periods don't cause catch-up bursts. This separation reduces interference; it is not a hard real-time guarantee. Diagnostics show skipped TX frames, loop intervals exceeding 15 ms, maximum radio work duration, telemetry bytes/frames, parser errors and free heap. Maximum radio work excludes the snapshot queue copy and scheduling delay.

Telemetry older than 3 seconds is visibly marked stale; never-received values stay blank. Loss of the browser connection flags all displayed readings as frozen. No HTTP control/arming/tuning endpoints are provided.

## Validation and bench checklist

The full firmware compiled for ESP32 Dev Module with Arduino-ESP32 3.3.11. Native decoder tests cover signed values, Madflight GPS units, short/oversized payloads, addresses, CRC rejection, split frames, partial-frame timeout across timer wrap, random input bounds and all 16 packed RC channels. The tests passed with address/undefined-behavior sanitizers (leak checking disabled because the sandbox uses ptrace). Browser JavaScript syntax was checked. A browser preview with synthetic data verified the layout, raw/processed stick selection, six channel rows, missing/stale telemetry, receiver timeout, and connection-loss warnings.

Run native tests from this folder:

```sh
g++ -std=c++11 -Wall -Wextra -Werror -fsanitize=address,undefined tests/telemetry_test.cpp -o /tmp/f330-test
ASAN_OPTIONS=detect_leaks=0 /tmp/f330-test
```

Hardware operation and radio timing under Wi-Fi load have **not** been verified on your ESP32/Pico. Before flight, remove propellers and check:

1. Each stick/switch matches the channel inspector and Madflight's received channels, including center/endpoints. Your 1150–1800 calibration has a midpoint of 1475 µs; a raw 1500 µs center maps near 1538 µs before tuning.
2. No receiver at boot and transmitter-off behavior both produce the intended FC disarm/minimum throttle behavior. Check a disconnected CH3 separately from RF loss.
3. Tilt the FC and verify pitch/roll/yaw; compare battery voltage against a meter and verify FC sensor calibration.
4. Disconnect only Pico telemetry TX: RC must continue, and telemetry should become stale. Reconnect and verify recovery.
5. Open/refresh the dashboard on multiple clients while exercising controls; inspect TX skips, late cycles, and actual UART output timing. Verify FC failsafe if ESP32 resets or loses power.

If your Madflight version differs, compare the linked encoder/scheduler against your installed version before relying on GPS/altitude readings.
