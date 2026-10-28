// Runs the whole SmartParkingNode (every command, mode and LED pattern) against a fake Arduino.
// Build and run with: sh hardware/tests/run.sh
#include <cmath>
#include <cstdio>
#include <string>

#include "../smart_parking/node.h"

static int checks = 0, failures = 0;
#define CHECK(cond)                                                    \
  do {                                                                 \
    checks++;                                                          \
    if (!(cond)) {                                                     \
      failures++;                                                      \
      std::printf("  FAIL line %d: %s\n", __LINE__, #cond);            \
    }                                                                  \
  } while (0)

// The ADC value a Sharp-type sensor would give at `cm`: the inverse of the lab formula.
static int rawFor(float cm) {
  if (cm >= SENSOR_FAR_CM) return 300;  // about 0.24 V: out of range
  float volts = std::pow(cm / LAB_FORMULA_A, 1.0f / LAB_FORMULA_B);
  return static_cast<int>(volts / ADC_REFERENCE_VOLTS * ADC_MAX_COUNTS);
}

static void world(float entranceCm, float spotCm) {
  g_adc[PIN_ENTRANCE_SENSOR] = rawFor(entranceCm);
  g_adc[PIN_SPOT_SENSOR] = rawFor(spotCm);
}

static void reset() {
  g_millis = 0;
  g_restarted = false;
  g_prefsFloat.clear();
  g_prefsByte.clear();
  g_pin[PIN_USER_BUTTON] = 1;
  Serial.in.clear();
  Serial.out.clear();
  world(80, 80);
}

// Advances the fake clock one millisecond at a time (the counter may wrap, like the real one).
static void run(SmartParkingNode& n, uint32_t ms) {
  for (uint32_t i = 0; i < ms; i++) {
    g_millis++;
    n.update();
  }
}

static bool has(const std::string& s, const char* part) { return s.find(part) != std::string::npos; }

static std::string lastFrame() {
  for (auto it = Serial.out.rbegin(); it != Serial.out.rend(); ++it)
    if (has(*it, "\"v\":2")) return *it;
  return "";
}

static std::string lastNonFrame() {
  for (auto it = Serial.out.rbegin(); it != Serial.out.rend(); ++it)
    if (!has(*it, "\"v\":2")) return *it;
  return "";
}

static std::string ask(SmartParkingNode& n, const std::string& cmd) {
  size_t before = Serial.out.size();
  Serial.type(cmd);
  run(n, 5);
  for (size_t i = before; i < Serial.out.size(); i++)
    if (!has(Serial.out[i], "\"v\":2")) return Serial.out[i];
  return "";
}

static const uint32_t RED = 0xFF0000, GREEN = 0x00FF00, BLUE = 0x0000FF;

static void test_boot_and_frames() {
  std::printf("boot and frames\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 100);
  CHECK(g_leds[0] == BLUE);  // power-on test colour
  run(n, 2000);
  std::string f = lastFrame();
  CHECK(has(f, "\"state\":\"RUNNING\""));
  CHECK(has(f, "\"taken\":false") && has(f, "\"car\":false"));
  CHECK(g_leds[0] == GREEN);
  // about one frame every 150 ms
  int frames = 0;
  for (auto& s : Serial.out) if (has(s, "\"v\":2")) frames++;
  CHECK(frames >= 12 && frames <= 15);
}

static void test_spot_and_car() {
  std::printf("spot and car detection\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1500);
  world(80, 8);
  run(n, 1000);
  CHECK(has(lastFrame(), "\"taken\":true"));
  CHECK(g_leds[0] == RED && g_leds[3] == RED);
  world(9, 8);
  run(n, 1000);
  CHECK(has(lastFrame(), "\"car\":true"));
  world(80, 80);
  run(n, 1500);
  CHECK(has(lastFrame(), "\"taken\":false") && has(lastFrame(), "\"car\":false"));
  CHECK(g_leds[0] == GREEN);
}

static void test_settings_commands() {
  std::printf("settings commands\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1000);
  CHECK(has(ask(n, "SET SPOT_CM 30"), "\"ack\":\"set\""));
  CHECK(has(ask(n, "GET"), "\"spot_cm\":30.0"));
  // a car 25 cm away now counts as parked
  world(80, 25);
  run(n, 1200);
  CHECK(has(lastFrame(), "\"taken\":true"));
  world(80, 80);
  run(n, 1000);

  CHECK(has(ask(n, "SET SPOT_CM 500"), "\"err\""));
  CHECK(has(ask(n, "SET SPOT_CM abc"), "\"err\""));
  CHECK(has(ask(n, "SET BRIGHTNESS 300"), "\"err\""));
  CHECK(has(ask(n, "SET BRIGHTNESS 60"), "\"ack\""));
  CHECK(g_ledBrightness == 60);
  CHECK(has(ask(n, "HELLO"), "\"err\""));
  CHECK(has(ask(n, "get"), "\"cfg\""));  // lower case works

  // a power cycle keeps the settings
  SmartParkingNode again;
  again.begin();
  CHECK(has(ask(again, "GET"), "\"spot_cm\":30.0"));
  CHECK(g_ledBrightness == 60);

  CHECK(has(ask(again, "RESET"), "\"ack\":\"reset\""));
  CHECK(has(ask(again, "GET"), "\"spot_cm\":15.0"));
}

static void test_long_line() {
  std::printf("long and broken input\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1000);
  CHECK(has(ask(n, std::string(300, 'x')), "line too long"));
  CHECK(has(ask(n, "GET"), "\"cfg\""));  // still alive and answering
  CHECK(ask(n, "").empty());              // an empty line is ignored
  CHECK(has(ask(n, "SET"), "\"err\""));
  std::string noise;
  for (int i = 0; i < 100; i++) noise += static_cast<char>(1 + (i * 37) % 250);
  ask(n, noise);
  CHECK(has(ask(n, "GET"), "\"cfg\""));
}

static void test_calibration() {
  std::printf("calibration\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1000);
  world(80, 8);  // the car is in place
  CHECK(has(ask(n, "CAL SPOT"), "calibrating"));
  run(n, 200);
  CHECK(has(lastFrame(), "CALIBRATING"));
  run(n, CALIBRATION_MS + 300);
  std::string reply = lastNonFrame();
  CHECK(has(reply, "calibrated"));
  CHECK(has(ask(n, "GET"), "\"spot_cm\":16"));  // twice the 8 cm measured
  CHECK(has(lastFrame(), "RUNNING"));

  // nothing in front of the sensor: refuse instead of storing nonsense
  world(80, 80);
  ask(n, "CAL SPOT");
  run(n, CALIBRATION_MS + 300);
  CHECK(has(lastNonFrame(), "nothing in front"));
  CHECK(has(ask(n, "GET"), "\"spot_cm\":16"));  // unchanged

  // a second request while one is running is refused
  world(80, 8);
  ask(n, "CAL ENTRANCE");
  CHECK(has(ask(n, "CAL SPOT"), "already calibrating"));
  run(n, CALIBRATION_MS + 300);
}

static void test_sensor_fault() {
  std::printf("sensor fault\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1500);
  g_adc[PIN_ENTRANCE_SENSOR] = 0;  // wire fell off
  run(n, 4000);
  std::string f = lastFrame();
  CHECK(has(f, "SENSOR_FAULT"));
  CHECK(has(f, "\"faultE\":\"no_signal\""));
  CHECK(has(f, "\"faultS\":\"none\""));
  // the LEDs blink orange while the fault lasts
  bool sawOrange = false, sawOff = false;
  for (int i = 0; i < 1500; i++) {
    run(n, 1);
    if (g_leds[0] == ledColor(255, 110, 0)) sawOrange = true;
    if (g_leds[0] == 0) sawOff = true;
  }
  CHECK(sawOrange && sawOff);
  // a broken entrance sensor never reports a car
  CHECK(has(lastFrame(), "\"car\":false"));
  // calibration is refused on a broken sensor
  CHECK(has(ask(n, "CAL ENTRANCE"), "faulty"));
  // the spot sensor still works
  world(80, 8);
  g_adc[PIN_ENTRANCE_SENSOR] = 0;
  run(n, 1500);
  CHECK(has(lastFrame(), "\"taken\":true"));
  // fixed: back to normal
  world(80, 8);
  run(n, 2000);
  CHECK(has(lastFrame(), "RUNNING"));
  CHECK(has(lastFrame(), "\"faultE\":\"none\""));

  // stuck at 3.3 V and a floating (noisy) pin are caught as well
  g_adc[PIN_SPOT_SENSOR] = 4095;
  run(n, 4000);
  CHECK(has(lastFrame(), "\"faultS\":\"saturated\""));
}

static void test_mock_mode() {
  std::printf("mock mode\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1000);
  CHECK(has(ask(n, "MOCK ON"), "mock_on"));
  run(n, 200);
  CHECK(has(lastFrame(), "\"mock\":true"));
  CHECK(g_leds[3] == ledColor(160, 0, 255));  // last LED marks mock mode
  // with no real sensor input at all, the story plays: cars arrive and park
  int cars = 0, taken = 0;
  bool wasCar = false;
  for (int i = 0; i < 1600; i++) {  // four simulated minutes: the story repeats about every minute
    run(n, 150);
    std::string f = lastFrame();
    bool c = has(f, "\"car\":true");
    if (c && !wasCar) cars++;
    wasCar = c;
    if (has(f, "\"taken\":true")) taken++;
  }
  CHECK(cars >= 2);
  CHECK(taken > 0);
  CHECK(has(ask(n, "MOCK OFF"), "mock_off"));
  run(n, 1000);
  CHECK(has(lastFrame(), "\"mock\":false"));
  CHECK(has(lastFrame(), "\"taken\":false"));
  CHECK(g_leds[3] == GREEN);
  CHECK(has(ask(n, "MOCK maybe"), "\"err\""));
}

static void test_button() {
  std::printf("button\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1000);
  g_pin[PIN_USER_BUTTON] = 0;  // pressed (active low)
  run(n, 200);
  g_pin[PIN_USER_BUTTON] = 1;
  run(n, 200);
  CHECK(has(lastFrame(), "\"mock\":true"));  // a short press turns mock mode on
  g_pin[PIN_USER_BUTTON] = 0;
  run(n, 200);
  g_pin[PIN_USER_BUTTON] = 1;
  run(n, 200);
  CHECK(has(lastFrame(), "\"mock\":false"));
  // a long press restores the defaults
  ask(n, "SET SPOT_CM 40");
  g_pin[PIN_USER_BUTTON] = 0;
  run(n, BUTTON_LONG_PRESS_MS + 300);
  g_pin[PIN_USER_BUTTON] = 1;
  run(n, 300);
  CHECK(has(ask(n, "GET"), "\"spot_cm\":15.0"));
}

static void test_debug_and_reboot() {
  std::printf("debug and reboot\n");
  reset();
  SmartParkingNode n;
  n.begin();
  run(n, 1000);
  CHECK(has(ask(n, "DEBUG ON"), "debug_on"));
  run(n, 500);
  bool sawDebug = false;
  for (auto& s : Serial.out) if (has(s, "\"dbg\":1")) sawDebug = true;
  CHECK(sawDebug);
  CHECK(has(ask(n, "HELP"), "\"help\""));
  CHECK(!g_restarted);
  CHECK(has(ask(n, "REBOOT"), "rebooting"));
  CHECK(g_restarted);
}

static void test_clock_wraparound() {
  std::printf("millis() overflow\n");
  reset();
  g_millis = 0xFFFFFFFFu - 3000;  // about 50 days of uptime: the counter is about to wrap
  SmartParkingNode n;
  n.begin();
  run(n, 6000);  // crosses the wrap
  CHECK(has(lastFrame(), "RUNNING"));
  int frames = 0;
  for (auto& s : Serial.out) if (has(s, "\"v\":2")) frames++;
  CHECK(frames >= 35);  // frames kept coming across the wrap
}

int main() {
  test_boot_and_frames();
  test_spot_and_car();
  test_settings_commands();
  test_long_line();
  test_calibration();
  test_sensor_fault();
  test_mock_mode();
  test_button();
  test_debug_and_reboot();
  test_clock_wraparound();
  std::printf("\n%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
