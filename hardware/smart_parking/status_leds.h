// status_leds.h - the LED strip: shows whether the spot is free, and what the node is doing.
//
//   green               spot free            red                 spot taken
//   blue (steady)       starting up          blue (fast blink)   calibrating
//   orange (blink)      a sensor is faulty   last LED violet     mock mode is on
#pragma once

#include <Adafruit_NeoPixel.h>

#include "config.h"
#include "state_machine.h"

constexpr uint32_t ledColor(uint8_t r, uint8_t g, uint8_t b) {
  return (static_cast<uint32_t>(r) << 16) | (static_cast<uint32_t>(g) << 8) | b;
}

class StatusLeds {
 public:
  void begin(uint8_t brightness) {
    strip_.begin();
    strip_.setBrightness(brightness);
    strip_.clear();
    strip_.show();
  }

  void setBrightness(uint8_t brightness) {
    strip_.setBrightness(brightness);
    lastKey_ = 0xFFFFFFFF;  // force a redraw with the new brightness
  }

  // Call every loop; it only talks to the strip when the picture changes.
  void show(DeviceState state, bool spotTaken, bool mock, uint32_t nowMs) {
    uint32_t base = 0;
    switch (state) {
      case DeviceState::Booting: base = kBlue; break;
      case DeviceState::Calibrating: base = ((nowMs / 150) % 2) ? kBlue : kOff; break;
      case DeviceState::SensorFault: base = ((nowMs / 500) % 2) ? kOrange : kOff; break;
      case DeviceState::Running: base = spotTaken ? kRed : kGreen; break;
    }
    bool markMock = mock && state == DeviceState::Running && LED_COUNT > 1;
    uint32_t key = base ^ (markMock ? 0x01000000u : 0u);
    if (key == lastKey_) return;
    lastKey_ = key;

    for (int i = 0; i < LED_COUNT; i++) {
      uint32_t color = (markMock && i == LED_COUNT - 1) ? kViolet : base;
      strip_.setPixelColor(i, color);
    }
    strip_.show();
  }

 private:
  static constexpr uint32_t kOff = ledColor(0, 0, 0);
  static constexpr uint32_t kRed = ledColor(255, 0, 0);
  static constexpr uint32_t kGreen = ledColor(0, 255, 0);
  static constexpr uint32_t kBlue = ledColor(0, 0, 255);
  static constexpr uint32_t kOrange = ledColor(255, 110, 0);
  static constexpr uint32_t kViolet = ledColor(160, 0, 255);

  Adafruit_NeoPixel strip_{LED_COUNT, PIN_LED_STRIP, NEO_GRB + NEO_KHZ800};
  uint32_t lastKey_ = 0xFFFFFFFF;
};
