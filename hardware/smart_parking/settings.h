// settings.h - the settings a user can change while the board runs, and how they are checked.
#pragma once

#include <cstdint>

#include "config.h"

struct Settings {
  float spotTakenCm = DEFAULT_SPOT_TAKEN_CM;
  float entranceCarCm = DEFAULT_ENTRANCE_CAR_CM;
  uint8_t brightness = LED_BRIGHTNESS_DEFAULT;
};

inline bool isNumber(float x) { return x == x && x > -1e9f && x < 1e9f; }

inline float clampThreshold(float cm, float fallback) {
  if (!isNumber(cm)) return fallback;
  if (cm < THRESHOLD_MIN_CM) return THRESHOLD_MIN_CM;
  if (cm > THRESHOLD_MAX_CM) return THRESHOLD_MAX_CM;
  return cm;
}

// Used after loading from flash: bad or corrupted values fall back to the defaults.
inline Settings sanitize(Settings s) {
  s.spotTakenCm = clampThreshold(s.spotTakenCm, DEFAULT_SPOT_TAKEN_CM);
  s.entranceCarCm = clampThreshold(s.entranceCarCm, DEFAULT_ENTRANCE_CAR_CM);
  if (s.brightness > LED_BRIGHTNESS_MAX) s.brightness = LED_BRIGHTNESS_MAX;
  return s;
}

// Calibration: with the car in place the sensor reads `measuredCm`; the threshold goes a safe
// distance beyond that, so the car is always "present" but a person walking past is not.
inline float thresholdFromCalibration(float measuredCm) {
  return clampThreshold(measuredCm * CALIBRATION_FACTOR, DEFAULT_SPOT_TAKEN_CM);
}
