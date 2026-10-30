// hardware_io.h - the board itself: pins, the USB serial port, the clock and restart.
// Together with status_leds.h (the LED strip), settings_store.h (flash) and wifi_service.h (WiFi),
// these are the only classes that touch hardware. Everything else, node.h included, goes through them.
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

// Reads the BOOT button (active low, internal pull-up). A pin of -1 means "no button".
class PinButtonReader {
 public:
  explicit PinButtonReader(int pin) : pin_(pin) {}
  void begin() const {
    if (pin_ >= 0) pinMode(pin_, INPUT_PULLUP);
  }
  bool present() const { return pin_ >= 0; }
  bool pressed() const { return pin_ >= 0 && digitalRead(pin_) == LOW; }

 private:
  int pin_;
};

// The USB serial link to the web app. This is the only place that uses Serial.
class UsbSerialPort {
 public:
  void begin(uint32_t baud) { Serial.begin(baud); }
  bool available() { return Serial.available() > 0; }
  char read() { return static_cast<char>(Serial.read()); }
  void println(const char* line) { Serial.println(line); }
  void flush() { Serial.flush(); }
};

// Board-wide functions: ADC set-up, the millisecond clock, and restarting.
class Esp32Board {
 public:
  void begin() { analogReadResolution(12); }
  uint32_t nowMs() const { return millis(); }
  void restart() { ESP.restart(); }
};
