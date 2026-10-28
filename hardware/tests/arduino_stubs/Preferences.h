#pragma once
#include <cstdint>
#include <map>
#include <string>

// Flash storage that lives in memory for the length of the test program.
inline std::map<std::string, float> g_prefsFloat;
inline std::map<std::string, uint8_t> g_prefsByte;

class Preferences {
 public:
  bool begin(const char*, bool) { return true; }
  void end() {}
  float getFloat(const char* key, float fallback) { return g_prefsFloat.count(key) ? g_prefsFloat[key] : fallback; }
  uint8_t getUChar(const char* key, uint8_t fallback) { return g_prefsByte.count(key) ? g_prefsByte[key] : fallback; }
  void putFloat(const char* key, float v) { g_prefsFloat[key] = v; }
  void putUChar(const char* key, uint8_t v) { g_prefsByte[key] = v; }
  void clear() {
    g_prefsFloat.clear();
    g_prefsByte.clear();
  }
};
