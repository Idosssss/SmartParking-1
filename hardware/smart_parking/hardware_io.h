// hardware_io.h - the one place where the sensor classes touch real pins.
#pragma once

#include <Arduino.h>

#include "distance_sensor.h"

// Reads one ADC pin. This is the only analogRead() call in the whole firmware.
class PinAnalogReader : public AnalogReader {
 public:
  explicit PinAnalogReader(int pin) : pin_(pin) {}
  void begin() const { pinMode(pin_, INPUT); }
  int read() override { return analogRead(pin_); }

 private:
  int pin_;
};
