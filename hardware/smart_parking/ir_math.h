// ir_math.h - turns a raw ADC value from the IR sensor into centimetres.
// No Arduino code in here, so it can be unit-tested on a normal computer.
#pragma once

#include <cmath>

#include "config.h"

inline float rawToVolts(float rawCounts) {
  return (rawCounts / ADC_MAX_COUNTS) * ADC_REFERENCE_VOLTS;
}

// Lab formula d = A * V^B. Below SENSOR_FAR_VOLTS the target is out of range.
inline float voltsToCm(float volts) {
  if (volts <= SENSOR_FAR_VOLTS) return SENSOR_FAR_CM;
  float cm = LAB_FORMULA_A * std::pow(volts, LAB_FORMULA_B);
  return cm > SENSOR_FAR_CM ? SENSOR_FAR_CM : cm;
}

inline float rawToCm(float rawCounts) {
  return voltsToCm(rawToVolts(rawCounts));
}
