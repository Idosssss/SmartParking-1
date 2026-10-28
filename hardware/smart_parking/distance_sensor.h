// distance_sensor.h - one IR distance sensor, read without ever blocking the main loop.
#pragma once

#include <cstdint>

#include "config.h"
#include "ir_math.h"

// The only thing the sensor class needs from the hardware. On the board it is
// an analogRead() of one pin (hardware_io.h); in the unit tests it is a fake.
class AnalogReader {
 public:
  virtual ~AnalogReader() = default;
  virtual int read() = 0;
};

// Call update() as often as you can. It takes one ADC sample every SAMPLE_GAP_MS and,
// after SAMPLES_PER_READING samples, publishes one averaged reading.
class IrDistanceSensor {
 public:
  explicit IrDistanceSensor(AnalogReader& adc) : adc_(adc) {}

  // Returns true when a new reading just became available.
  bool update(uint32_t nowMs) {
    if (count_ > 0 && nowMs - lastSampleMs_ < SAMPLE_GAP_MS) return false;
    lastSampleMs_ = nowMs;

    double sample = adc_.read();
    sum_ += sample;
    sumSq_ += sample * sample;
    count_++;
    if (count_ < SAMPLES_PER_READING) return false;

    avgRaw_ = static_cast<float>(sum_ / count_);
    double variance = sumSq_ / count_ - (sum_ / count_) * (sum_ / count_);
    stdDevRaw_ = variance > 0 ? static_cast<float>(std::sqrt(variance)) : 0.0f;
    distanceCm_ = rawToCm(avgRaw_);
    hasReading_ = true;
    sum_ = 0;
    sumSq_ = 0;
    count_ = 0;
    return true;
  }

  bool hasReading() const { return hasReading_; }
  float distanceCm() const { return hasReading_ ? distanceCm_ : SENSOR_FAR_CM; }
  float avgRaw() const { return avgRaw_; }
  float stdDevRaw() const { return stdDevRaw_; }
  float volts() const { return rawToVolts(avgRaw_); }

 private:
  AnalogReader& adc_;
  uint32_t lastSampleMs_ = 0;
  double sum_ = 0;
  double sumSq_ = 0;
  int count_ = 0;
  bool hasReading_ = false;
  float avgRaw_ = 0;
  float stdDevRaw_ = 0;
  float distanceCm_ = SENSOR_FAR_CM;
};
