// presence_detector.h - turns noisy distances into a stable "something is there" yes/no.
#pragma once

#include "config.h"

// "Present" means closer than the threshold. Two things stop flicker when a
// reading hovers around the threshold: a small hysteresis band (it must get
// HYSTERESIS_CM farther away before it counts as gone) and a streak counter
// (the new state must be seen SAMPLES_TO_SWITCH readings in a row).
class PresenceDetector {
 public:
  explicit PresenceDetector(float thresholdCm) : thresholdCm_(thresholdCm) {}

  void setThreshold(float thresholdCm) { thresholdCm_ = thresholdCm; }
  float threshold() const { return thresholdCm_; }
  bool present() const { return present_; }

  // Feed one new distance reading. Returns the (possibly updated) state.
  bool update(float distanceCm) {
    bool wanted = present_ ? (distanceCm < thresholdCm_ + HYSTERESIS_CM) : (distanceCm < thresholdCm_);
    if (wanted == present_) {
      streak_ = 0;
      return present_;
    }
    streak_++;
    if (streak_ >= SAMPLES_TO_SWITCH) {
      present_ = wanted;
      streak_ = 0;
    }
    return present_;
  }

  void reset() {
    present_ = false;
    streak_ = 0;
  }

 private:
  float thresholdCm_;
  bool present_ = false;
  int streak_ = 0;
};
