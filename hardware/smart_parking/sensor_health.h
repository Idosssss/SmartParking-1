// sensor_health.h - notices a sensor that is unplugged, shorted or just noise.
#pragma once

#include <cstdint>

#include "config.h"

enum class SensorFault : uint8_t {
  None = 0,
  NoSignal,   // raw value stuck at ~0: output wire disconnected or shorted to ground
  Saturated,  // raw value stuck at the top of the range
  Noisy,      // the 25 samples of one reading are all over the place (floating pin)
};

inline const char* faultName(SensorFault f) {
  switch (f) {
    case SensorFault::None: return "none";
    case SensorFault::NoSignal: return "no_signal";
    case SensorFault::Saturated: return "saturated";
    case SensorFault::Noisy: return "noisy";
  }
  return "none";
}

// One instance per sensor. Feed it every finished reading.
// It reports a fault only after FAULT_READINGS_TO_TRIP bad readings in a row and
// clears it after FAULT_READINGS_TO_CLEAR good ones, so a single glitch is ignored.
class SensorHealth {
 public:
  SensorFault update(float avgRaw, float stdDevRaw) {
    SensorFault now = classify(avgRaw, stdDevRaw);
    if (now == SensorFault::None) {
      badStreak_ = 0;
      if (fault_ != SensorFault::None && ++goodStreak_ >= FAULT_READINGS_TO_CLEAR) {
        fault_ = SensorFault::None;
        goodStreak_ = 0;
      }
      return fault_;
    }
    goodStreak_ = 0;
    if (now == candidate_) {
      badStreak_++;
    } else {
      candidate_ = now;
      badStreak_ = 1;
    }
    if (badStreak_ >= FAULT_READINGS_TO_TRIP) fault_ = candidate_;
    return fault_;
  }

  SensorFault fault() const { return fault_; }

  void reset() {
    fault_ = SensorFault::None;
    candidate_ = SensorFault::None;
    badStreak_ = 0;
    goodStreak_ = 0;
  }

  static SensorFault classify(float avgRaw, float stdDevRaw) {
    if (avgRaw <= FAULT_RAW_LOW) return SensorFault::NoSignal;
    if (avgRaw >= FAULT_RAW_HIGH) return SensorFault::Saturated;
    if (stdDevRaw >= FAULT_STDDEV_RAW) return SensorFault::Noisy;
    return SensorFault::None;
  }

 private:
  SensorFault fault_ = SensorFault::None;
  SensorFault candidate_ = SensorFault::None;
  int badStreak_ = 0;
  int goodStreak_ = 0;
};
