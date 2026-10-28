// settings_store.h - keeps the user's settings in flash so they survive a power cycle.
#pragma once

#include <Preferences.h>

#include "settings.h"

class SettingsStore {
 public:
  // Never returns invalid numbers: damaged or missing values become the defaults from config.h.
  Settings load() {
    Settings s;
    Preferences prefs;
    if (prefs.begin(kNamespace, false)) {
      s.spotTakenCm = prefs.getFloat("spotCm", s.spotTakenCm);
      s.entranceCarCm = prefs.getFloat("entranceCm", s.entranceCarCm);
      s.brightness = prefs.getUChar("bright", s.brightness);
      prefs.end();
    }
    return sanitize(s);
  }

  void save(const Settings& s) {
    Preferences prefs;
    if (!prefs.begin(kNamespace, false)) return;
    prefs.putFloat("spotCm", s.spotTakenCm);
    prefs.putFloat("entranceCm", s.entranceCarCm);
    prefs.putUChar("bright", s.brightness);
    prefs.end();
  }

  void clear() {
    Preferences prefs;
    if (!prefs.begin(kNamespace, false)) return;
    prefs.clear();
    prefs.end();
  }

 private:
  static constexpr const char* kNamespace = "parking";
};
