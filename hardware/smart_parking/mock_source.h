// mock_source.h - fake sensor data for demos and tests when no sensors are connected.
#pragma once

#include <cstdint>

#include "config.h"

// Plays a repeating story: nothing happens for a while, a car shows up at the entrance,
// drives to the spot, stays parked, leaves. Out-of-range readings are exactly
// SENSOR_FAR_CM, like the real sensor reports them; close readings carry a little noise.
class MockScenario {
 public:
  enum class Phase : uint8_t { Idle, CarAtEntrance, Driving, Parked, Leaving };

  explicit MockScenario(uint32_t seed = MOCK_SEED) : rng_(seed ? seed : 1) {}

  void update(uint32_t nowMs) {
    if (!started_) {
      started_ = true;
      enter(Phase::Idle, nowMs);
    }
    if (nowMs >= phaseEndMs_) {
      switch (phase_) {
        case Phase::Idle: enter(Phase::CarAtEntrance, nowMs); break;
        case Phase::CarAtEntrance: enter(Phase::Driving, nowMs); break;
        case Phase::Driving: enter(Phase::Parked, nowMs); break;
        case Phase::Parked: enter(Phase::Leaving, nowMs); break;
        case Phase::Leaving: enter(Phase::Idle, nowMs); break;
      }
    }
    entranceCm_ = phase_ == Phase::CarAtEntrance ? noisy(carEntranceCm_) : SENSOR_FAR_CM;
    spotCm_ = phase_ == Phase::Parked ? noisy(carSpotCm_) : SENSOR_FAR_CM;
  }

  float entranceCm() const { return entranceCm_; }
  float spotCm() const { return spotCm_; }
  Phase phase() const { return phase_; }

 private:
  uint32_t next() {  // xorshift32
    rng_ ^= rng_ << 13;
    rng_ ^= rng_ >> 17;
    rng_ ^= rng_ << 5;
    return rng_;
  }
  float uniform() { return (next() & 0xFFFF) / 65535.0f; }  // 0..1
  uint32_t between(uint32_t lo, uint32_t hi) { return lo + static_cast<uint32_t>(uniform() * (hi - lo)); }
  float noisy(float cm) { return cm + (uniform() - 0.5f) * 0.8f; }

  void enter(Phase p, uint32_t nowMs) {
    phase_ = p;
    switch (p) {
      case Phase::Idle: phaseEndMs_ = nowMs + between(6000, 15000); break;
      case Phase::CarAtEntrance:
        carEntranceCm_ = 7.0f + uniform() * 4.0f;
        phaseEndMs_ = nowMs + between(2500, 3500);
        break;
      case Phase::Driving: phaseEndMs_ = nowMs + between(3000, 6000); break;
      case Phase::Parked:
        carSpotCm_ = 6.0f + uniform() * 4.0f;
        phaseEndMs_ = nowMs + between(20000, 40000);
        break;
      case Phase::Leaving: phaseEndMs_ = nowMs + between(1500, 2500); break;
    }
  }

  uint32_t rng_;
  bool started_ = false;
  Phase phase_ = Phase::Idle;
  uint32_t phaseEndMs_ = 0;
  float carEntranceCm_ = 9.0f;
  float carSpotCm_ = 8.0f;
  float entranceCm_ = SENSOR_FAR_CM;
  float spotCm_ = SENSOR_FAR_CM;
};
