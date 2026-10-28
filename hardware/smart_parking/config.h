// config.h - every fixed setting of the sensor node lives here.
//
// Values that the user can change while the board is running (detection
// distances, LED brightness) only have their *defaults* here; the live values
// are kept in flash by SettingsStore (see settings_store.h).
#pragma once

#include <cstddef>
#include <cstdint>

// ---------------------------------------------------------------- pins -----
// Same wiring as docs/HARDWARE.md. D34 and D35 are input-only ADC1 pins.
constexpr int PIN_ENTRANCE_SENSOR = 34;  // IR distance sensor at the entrance
constexpr int PIN_SPOT_SENSOR = 35;      // IR distance sensor at the parking spot
constexpr int PIN_LED_STRIP = 26;        // WS2812 data in, through a ~330 ohm resistor
constexpr int PIN_USER_BUTTON = 0;       // BOOT button on most DevKit boards, -1 turns the button off

// ------------------------------------------------------------ LED strip -----
constexpr int LED_COUNT = 4;
constexpr uint8_t LED_BRIGHTNESS_DEFAULT = 40;  // 0-255, kept low so USB power is plenty
constexpr uint8_t LED_BRIGHTNESS_MAX = 120;

// ------------------------------------------------------ IR distance sensor ----
constexpr float ADC_MAX_COUNTS = 4095.0f;  // 12-bit ADC
constexpr float ADC_REFERENCE_VOLTS = 3.3f;
constexpr float SENSOR_FAR_VOLTS = 0.4f;   // below this the target is out of range
constexpr float SENSOR_FAR_CM = 80.0f;     // distance reported when out of range
// Lab formula for the sensor: d = A * V^B
constexpr float LAB_FORMULA_A = 29.988f;
constexpr float LAB_FORMULA_B = -1.173f;

constexpr int SAMPLES_PER_READING = 25;  // ADC samples averaged into one reading
constexpr uint32_t SAMPLE_GAP_MS = 2;    // pause between two ADC samples of one sensor

// --------------------------------------------------------------- detection ---
// Defaults. The web app (or the serial commands) can change them at runtime.
constexpr float DEFAULT_SPOT_TAKEN_CM = 15.0f;
constexpr float DEFAULT_ENTRANCE_CAR_CM = 15.0f;
constexpr float THRESHOLD_MIN_CM = 5.0f;
constexpr float THRESHOLD_MAX_CM = 60.0f;
constexpr float HYSTERESIS_CM = 2.0f;  // stops flicker when a reading hovers at the threshold
constexpr int SAMPLES_TO_SWITCH = 3;   // consecutive readings needed to change state

// ----------------------------------------------------------- sensor health ---
// A sensor is "faulty" when its raw ADC value is stuck at one end of the range or
// extremely noisy for FAULT_READINGS_TO_TRIP readings in a row (about 3 s).
// These numbers are conservative guesses: tune them on the real hardware
// (turn on DEBUG to see the raw values) if a healthy sensor is reported as faulty.
constexpr float FAULT_RAW_LOW = 3.0f;      // at or below: no signal (wire off / shorted to ground)
constexpr float FAULT_RAW_HIGH = 4090.0f;  // at or above: stuck at 3.3 V
constexpr float FAULT_STDDEV_RAW = 700.0f; // spread of the 25 samples: a floating pin is very noisy
constexpr int FAULT_READINGS_TO_TRIP = 20;
constexpr int FAULT_READINGS_TO_CLEAR = 5;

// ------------------------------------------------------------- calibration ---
// "CAL" measures the distance with the car in place and sets the threshold to
// CALIBRATION_FACTOR times that distance (never outside the allowed range).
constexpr float CALIBRATION_FACTOR = 2.0f;
constexpr uint32_t CALIBRATION_MS = 1500;
constexpr float CALIBRATION_MIN_SIGNAL_CM = 60.0f;  // measuring "far" means nothing is in front of the sensor

// ------------------------------------------------------------ serial / app ---
constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t FRAME_PERIOD_MS = 150;   // one status line about 6-7 times a second
constexpr size_t COMMAND_BUFFER_SIZE = 64;  // longer lines are rejected, never overflow
constexpr uint32_t BOOT_LED_TEST_MS = 600;

// ------------------------------------------------------------------ button ---
constexpr uint32_t BUTTON_DEBOUNCE_MS = 30;
constexpr uint32_t BUTTON_LONG_PRESS_MS = 2000;

// ------------------------------------------------------------ mock sensors ---
// Mock mode replaces the real sensors with a generated car-arrives / car-parks /
// car-leaves cycle, so the whole system can be shown without any hardware.
constexpr uint32_t MOCK_SEED = 20261;

// ---------------------------------------------------------- WiFi (optional) ---
// Off by default. To turn it on: copy secrets.h.example to secrets.h, fill it in,
// and set ENABLE_WIFI to 1. If WiFi is not available the node keeps working offline
// and retries every WIFI_RETRY_MS.
#define ENABLE_WIFI 0
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint16_t HTTP_PORT = 80;
