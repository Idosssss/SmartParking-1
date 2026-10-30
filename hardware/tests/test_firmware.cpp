// Unit tests for the parts of the firmware that do not touch hardware.
// Build and run with: sh hardware/tests/run.sh
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>

#include "../smart_parking/button.h"
#include "../smart_parking/command_parser.h"
#include "../smart_parking/distance_sensor.h"
#include "../smart_parking/ir_math.h"
#include "../smart_parking/link_monitor.h"
#include "../smart_parking/mock_source.h"
#include "../smart_parking/presence_detector.h"
#include "../smart_parking/protocol.h"
#include "../smart_parking/sensor_health.h"
#include "../smart_parking/settings.h"
#include "../smart_parking/state_machine.h"

static int checks = 0;
static int failures = 0;

#define CHECK(cond)                                                       \
  do {                                                                    \
    checks++;                                                             \
    if (!(cond)) {                                                        \
      failures++;                                                         \
      std::printf("  FAIL line %d: %s\n", __LINE__, #cond);               \
    }                                                                     \
  } while (0)

#define CHECK_NEAR(a, b, tol) CHECK(std::fabs((a) - (b)) <= (tol))

static void test_ir_math() {
  std::printf("ir_math\n");
  CHECK_NEAR(rawToVolts(4095), 3.3f, 1e-4f);
  CHECK_NEAR(rawToVolts(0), 0.0f, 1e-6f);
  CHECK_NEAR(voltsToCm(2.0f), 13.3f, 0.2f);  // d = 29.988 * 2^-1.173
  CHECK_NEAR(voltsToCm(1.0f), 29.988f, 1e-3f);
  CHECK(voltsToCm(0.4f) == SENSOR_FAR_CM);   // out of range
  CHECK(voltsToCm(0.1f) == SENSOR_FAR_CM);
  CHECK(voltsToCm(0.41f) <= SENSOR_FAR_CM);  // never beyond the far value
  CHECK(voltsToCm(1.5f) > voltsToCm(2.5f));  // closer target, higher voltage, smaller distance
}

static void test_presence_detector() {
  std::printf("presence_detector\n");
  PresenceDetector d(15.0f);
  CHECK(!d.present());
  d.update(5);
  d.update(5);
  CHECK(!d.present());  // needs 3 in a row
  d.update(5);
  CHECK(d.present());
  d.update(16.5f);      // inside the hysteresis band (15 + 2): still present
  d.update(16.5f);
  d.update(16.5f);
  CHECK(d.present());
  d.update(18);
  d.update(18);
  CHECK(d.present());
  d.update(18);
  CHECK(!d.present());
  // a single glitch does not flip the state
  d.update(5);
  d.update(80);
  d.update(5);
  d.update(5);
  CHECK(!d.present());
  // changing the threshold at runtime takes effect
  d.setThreshold(30.0f);
  d.update(25);
  d.update(25);
  d.update(25);
  CHECK(d.present());
}

static void test_sensor_health() {
  std::printf("sensor_health\n");
  SensorHealth h;
  for (int i = 0; i < FAULT_READINGS_TO_TRIP - 1; i++) h.update(0, 0);
  CHECK(h.fault() == SensorFault::None);  // not yet: needs a whole streak
  h.update(0, 0);
  CHECK(h.fault() == SensorFault::NoSignal);
  for (int i = 0; i < FAULT_READINGS_TO_CLEAR - 1; i++) h.update(900, 5);
  CHECK(h.fault() == SensorFault::NoSignal);  // not cleared by one or two good readings
  h.update(900, 5);
  CHECK(h.fault() == SensorFault::None);

  SensorHealth s;
  for (int i = 0; i < FAULT_READINGS_TO_TRIP; i++) s.update(4095, 0);
  CHECK(s.fault() == SensorFault::Saturated);

  SensorHealth n;
  for (int i = 0; i < FAULT_READINGS_TO_TRIP; i++) n.update(2000, 1200);
  CHECK(n.fault() == SensorFault::Noisy);

  // a healthy far reading (about 0.3 V) and a healthy near reading are both fine
  CHECK(SensorHealth::classify(370, 10) == SensorFault::None);
  CHECK(SensorHealth::classify(2400, 20) == SensorFault::None);
  // one glitch in the middle of good data never trips the fault
  SensorHealth g;
  for (int i = 0; i < 200; i++) g.update(i % 7 == 0 ? 0 : 900, 5);
  CHECK(g.fault() == SensorFault::None);
}

struct FakeAdc : AnalogReader {
  int value = 1000;
  int calls = 0;
  int read() override {
    calls++;
    return value;
  }
};

static void test_distance_sensor() {
  std::printf("distance_sensor\n");
  FakeAdc adc;
  IrDistanceSensor sensor(adc);
  CHECK(!sensor.hasReading());
  CHECK(sensor.distanceCm() == SENSOR_FAR_CM);

  adc.value = 2482;  // about 2.0 V
  bool ready = false;
  uint32_t now = 0;
  int updates = 0;
  while (!ready && updates < 1000) {
    ready = sensor.update(now);
    now++;
    updates++;
  }
  CHECK(ready);
  CHECK(adc.calls == SAMPLES_PER_READING);
  CHECK_NEAR(sensor.distanceCm(), 13.3f, 0.3f);
  CHECK(sensor.stdDevRaw() < 0.01f);

  // never samples faster than SAMPLE_GAP_MS
  FakeAdc adc2;
  IrDistanceSensor s2(adc2);
  s2.update(100);
  s2.update(100);
  s2.update(100 + SAMPLE_GAP_MS - 1);
  CHECK(adc2.calls == 1);
  s2.update(100 + SAMPLE_GAP_MS);
  CHECK(adc2.calls == 2);

  // noisy samples show up as a standard deviation
  struct Alternating : AnalogReader {
    bool hi = false;
    int read() override { hi = !hi; return hi ? 3000 : 1000; }
  } alt;
  IrDistanceSensor s3(alt);
  for (uint32_t t = 0; t < 200; t++) s3.update(t);
  CHECK(s3.stdDevRaw() > 900.0f);
}

static void test_mock_scenario() {
  std::printf("mock_scenario\n");
  MockScenario m(MOCK_SEED);
  bool sawEntrance = false, sawSpot = false;
  float minEntrance = 999, minSpot = 999;
  int phases[5] = {0, 0, 0, 0, 0};
  for (uint32_t t = 0; t < 600000; t += 50) {  // ten simulated minutes
    m.update(t);
    phases[static_cast<int>(m.phase())]++;
    if (m.entranceCm() < SENSOR_FAR_CM) { sawEntrance = true; if (m.entranceCm() < minEntrance) minEntrance = m.entranceCm(); }
    if (m.spotCm() < SENSOR_FAR_CM) { sawSpot = true; if (m.spotCm() < minSpot) minSpot = m.spotCm(); }
    CHECK(m.entranceCm() > 0 && m.entranceCm() <= SENSOR_FAR_CM);
    CHECK(m.spotCm() > 0 && m.spotCm() <= SENSOR_FAR_CM);
  }
  CHECK(sawEntrance && sawSpot);
  for (int i = 0; i < 5; i++) CHECK(phases[i] > 0);  // the whole story is played
  CHECK(minEntrance > 5.0f && minEntrance < DEFAULT_ENTRANCE_CAR_CM);  // close enough to count as a car
  CHECK(minSpot > 4.0f && minSpot < DEFAULT_SPOT_TAKEN_CM);

  // same seed, same story
  MockScenario a(7), b(7);
  bool same = true;
  for (uint32_t t = 0; t < 120000; t += 100) {
    a.update(t);
    b.update(t);
    if (a.spotCm() != b.spotCm() || a.entranceCm() != b.entranceCm()) same = false;
  }
  CHECK(same);

  // the detectors turn the mock data into the right events
  MockScenario d(MOCK_SEED);
  PresenceDetector car(DEFAULT_ENTRANCE_CAR_CM), spot(DEFAULT_SPOT_TAKEN_CM);
  int carEvents = 0, taken = 0;
  bool wasCar = false;
  for (uint32_t t = 0; t < 600000; t += 150) {
    d.update(t);
    bool c = car.update(d.entranceCm());
    if (c && !wasCar) carEvents++;
    wasCar = c;
    if (spot.update(d.spotCm())) taken++;
  }
  CHECK(carEvents >= 3);
  CHECK(taken > 0);
}

static void test_link_monitor() {
  std::printf("link_monitor\n");
  LinkMonitor m;
  m.update(10000);
  CHECK(m.state() == LinkState::Standalone);  // no app ever connected: normal, no warning
  m.heard(10000);
  CHECK(m.state() == LinkState::Connected);
  m.update(10000 + HOST_TIMEOUT_MS);
  CHECK(m.state() == LinkState::Connected);  // exactly at the limit is still fine
  m.update(10000 + HOST_TIMEOUT_MS + 1);
  CHECK(m.state() == LinkState::Lost);
  m.update(10000 + 0xFFFFFFF0u);  // decades of silence and a millis() wrap later
  CHECK(m.state() == LinkState::Lost);  // still lost: it never "comes back" by itself
  m.heard(5);
  CHECK(m.state() == LinkState::Connected);
  // the clock wraps while the app keeps pinging: no false alarm
  LinkMonitor w;
  w.heard(0xFFFFFF00u);
  w.update(0xFFFFFF00u + 1000);  // wrapped past zero
  CHECK(w.state() == LinkState::Connected);
}

static void test_commands() {
  std::printf("command_parser\n");
  CHECK(parseCommand("ping").type == CommandType::Ping);
  CHECK(parseCommand("PING now").type == CommandType::Invalid);
  Command c = parseCommand("get");
  CHECK(c.type == CommandType::Get);
  c = parseCommand("  Help  \r\n");
  CHECK(c.type == CommandType::Help);
  c = parseCommand("");
  CHECK(c.type == CommandType::Empty);
  c = parseCommand("   ");
  CHECK(c.type == CommandType::Empty);
  c = parseCommand(nullptr);
  CHECK(c.type == CommandType::Empty);

  c = parseCommand("SET spot_cm 17.5");
  CHECK(c.type == CommandType::Set && c.key == SettingKey::SpotCm);
  CHECK_NEAR(c.value, 17.5f, 1e-4f);
  c = parseCommand("set entrance_cm 12");
  CHECK(c.type == CommandType::Set && c.key == SettingKey::EntranceCm && c.value == 12.0f);
  c = parseCommand("SET BRIGHTNESS 80");
  CHECK(c.type == CommandType::Set && c.key == SettingKey::Brightness && c.value == 80.0f);

  c = parseCommand("SET spot_cm abc");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("SET spot_cm 12abc");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("SET spot_cm");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("SET colour 5");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("SET spot_cm nan");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("SET spot_cm 1e30");
  CHECK(c.type == CommandType::Invalid);

  c = parseCommand("mock on");
  CHECK(c.type == CommandType::Mock && c.flag);
  c = parseCommand("MOCK OFF");
  CHECK(c.type == CommandType::Mock && !c.flag);
  c = parseCommand("MOCK maybe");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("DEBUG on");
  CHECK(c.type == CommandType::Debug && c.flag);
  c = parseCommand("CAL spot");
  CHECK(c.type == CommandType::Calibrate && c.target == CalTarget::Spot);
  c = parseCommand("CAL entrance");
  CHECK(c.type == CommandType::Calibrate && c.target == CalTarget::Entrance);
  c = parseCommand("CAL everything");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("RESET");
  CHECK(c.type == CommandType::Reset);
  c = parseCommand("REBOOT");
  CHECK(c.type == CommandType::Reboot);
  c = parseCommand("FORMAT C:");
  CHECK(c.type == CommandType::Invalid);
  c = parseCommand("a b c d e f");
  CHECK(c.type == CommandType::Invalid);

  // a very long line is cut, not a crash
  std::string longLine(5000, 'x');
  c = parseCommand(longLine.c_str());
  CHECK(c.type == CommandType::Invalid);
}

static void test_settings() {
  std::printf("settings\n");
  Settings s;
  s.spotTakenCm = 9999;
  s.entranceCarCm = -3;
  s.brightness = 255;
  s = sanitize(s);
  CHECK(s.spotTakenCm == THRESHOLD_MAX_CM);
  CHECK(s.entranceCarCm == THRESHOLD_MIN_CM);
  CHECK(s.brightness == LED_BRIGHTNESS_MAX);
  Settings bad;
  bad.spotTakenCm = std::nanf("");
  bad = sanitize(bad);
  CHECK(bad.spotTakenCm == DEFAULT_SPOT_TAKEN_CM);
  CHECK_NEAR(thresholdFromCalibration(8.0f), 16.0f, 1e-4f);
  CHECK(thresholdFromCalibration(0.5f) == THRESHOLD_MIN_CM);
  CHECK(thresholdFromCalibration(70.0f) == THRESHOLD_MAX_CM);
}

static void test_state_machine() {
  std::printf("state_machine\n");
  CHECK(nextState({false, false, false}) == DeviceState::Booting);
  CHECK(nextState({false, true, true}) == DeviceState::Booting);
  CHECK(nextState({true, false, false}) == DeviceState::Running);
  CHECK(nextState({true, false, true}) == DeviceState::SensorFault);
  CHECK(nextState({true, true, true}) == DeviceState::Calibrating);  // calibration wins over a fault
  CHECK(std::strcmp(stateName(DeviceState::SensorFault), "SENSOR_FAULT") == 0);
}

static void test_button() {
  std::printf("button\n");
  Button b;
  uint32_t t = 0;
  // short press
  ButtonEvent e = ButtonEvent::None;
  auto run = [&](bool pressed, uint32_t ms) {
    ButtonEvent last = ButtonEvent::None;
    for (uint32_t i = 0; i < ms; i++) {
      ButtonEvent ev = b.update(pressed, t++);
      if (ev != ButtonEvent::None) last = ev;
    }
    return last;
  };
  CHECK(run(false, 100) == ButtonEvent::None);
  run(true, 300);
  e = run(false, 100);
  CHECK(e == ButtonEvent::ShortPress);
  // bounce of a few milliseconds is ignored
  for (int i = 0; i < 5; i++) {
    b.update(true, t++);
    b.update(false, t++);
  }
  CHECK(run(false, 200) == ButtonEvent::None);
  // long press reported once while held, nothing extra on release
  e = run(true, BUTTON_LONG_PRESS_MS + 200);
  CHECK(e == ButtonEvent::LongPress);
  CHECK(run(true, 500) == ButtonEvent::None);
  CHECK(run(false, 200) == ButtonEvent::None);
}

static void test_protocol() {
  std::printf("protocol\n");
  char buf[256];
  Frame f;
  f.seq = 42;
  f.uptimeMs = 123456;
  f.entranceCm = 80;
  f.spotCm = 8.25f;
  f.spotTaken = true;
  f.state = DeviceState::Running;
  size_t n = formatFrame(buf, sizeof(buf), f);
  CHECK(n > 0 && n == std::strlen(buf));
  std::string line(buf);
  CHECK(line.find("\"entrance\":80.0") != std::string::npos);  // old app versions read these two
  CHECK(line.find("\"spot\":8.2") != std::string::npos || line.find("\"spot\":8.3") != std::string::npos);
  CHECK(line.find("\"taken\":true") != std::string::npos);
  CHECK(line.find("\"state\":\"RUNNING\"") != std::string::npos);
  CHECK(line.front() == '{' && line.back() == '}');
  CHECK(line.find('\n') == std::string::npos);

  // too small a buffer is reported, never overflowed
  char tiny[20];
  CHECK(formatFrame(tiny, sizeof(tiny), f) == 0);

  CHECK(formatAck(buf, sizeof(buf), "mock_on") > 0);
  CHECK(std::string(buf) == "{\"ack\":\"mock_on\"}");
  CHECK(formatError(buf, sizeof(buf), "unknown setting") > 0);
  CHECK(std::string(buf) == "{\"err\":\"unknown setting\"}");
  CHECK(formatConfig(buf, sizeof(buf), 15, 15, 40, false, false) > 0);
  CHECK(std::string(buf).find("\"spot_cm\":15.0") != std::string::npos);
  CHECK(formatDebug(buf, sizeof(buf), 370, 2400, 12, 20, 0.3f, 1.9f) > 0);
}

int main() {
  test_ir_math();
  test_presence_detector();
  test_sensor_health();
  test_distance_sensor();
  test_mock_scenario();
  test_commands();
  test_link_monitor();
  test_settings();
  test_state_machine();
  test_button();
  test_protocol();
  std::printf("\n%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
