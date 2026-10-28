// button.h - debounced push button that tells a short press from a long press.
#pragma once

#include <cstdint>

#include "config.h"

enum class ButtonEvent : uint8_t { None, ShortPress, LongPress };

// Feed it the raw pin state every loop. A long press is reported as soon as the
// button has been held long enough (so the user gets feedback while still holding it).
class Button {
 public:
  ButtonEvent update(bool pressedRaw, uint32_t nowMs) {
    if (pressedRaw != lastRaw_) {
      lastRaw_ = pressedRaw;
      changedAtMs_ = nowMs;
    }
    if (pressedRaw != stable_ && nowMs - changedAtMs_ >= BUTTON_DEBOUNCE_MS) {
      stable_ = pressedRaw;
      if (stable_) {
        pressedAtMs_ = nowMs;
        longReported_ = false;
      } else if (!longReported_) {
        return ButtonEvent::ShortPress;
      }
    }
    if (stable_ && !longReported_ && nowMs - pressedAtMs_ >= BUTTON_LONG_PRESS_MS) {
      longReported_ = true;
      return ButtonEvent::LongPress;
    }
    return ButtonEvent::None;
  }

 private:
  bool lastRaw_ = false;
  bool stable_ = false;
  bool longReported_ = false;
  uint32_t changedAtMs_ = 0;
  uint32_t pressedAtMs_ = 0;
};
