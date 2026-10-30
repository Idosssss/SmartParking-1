// link_monitor.h - is the app still talking to the board?
//
// While the web app is connected it sends "PING" over USB once a second (any command counts).
// The board works on its own without a computer, so "nobody ever connected" is normal
// (Standalone). Only a link that was there and then went quiet is Lost: the browser tab was
// closed, the app disconnected or the laptop went to sleep. Lost stays lost until the app is heard again,
// so the 49-day millis() wrap can never make an old link look alive.
#pragma once

#include <cstdint>

#include "config.h"

enum class LinkState : uint8_t { Standalone, Connected, Lost };

class LinkMonitor {
 public:
  void heard(uint32_t nowMs) {
    seen_ = true;
    lost_ = false;
    lastMs_ = nowMs;
  }

  // Call every loop.
  void update(uint32_t nowMs) {
    if (seen_ && !lost_ && nowMs - lastMs_ > HOST_TIMEOUT_MS) lost_ = true;
  }

  LinkState state() const {
    if (!seen_) return LinkState::Standalone;
    return lost_ ? LinkState::Lost : LinkState::Connected;
  }

 private:
  bool seen_ = false;
  bool lost_ = false;
  uint32_t lastMs_ = 0;
};
