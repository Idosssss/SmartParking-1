#pragma once
#include <cstdint>
#include <vector>

#define NEO_GRB 0x52
#define NEO_KHZ800 0x0000

// Remembers the colours it was given so tests can look at the "LEDs".
inline std::vector<uint32_t> g_leds;
inline int g_ledShows = 0;
inline int g_ledBrightness = 255;

class Adafruit_NeoPixel {
 public:
  Adafruit_NeoPixel(uint16_t n, int16_t, int) { g_leds.assign(n, 0); }
  void begin() {}
  void setBrightness(uint8_t b) { g_ledBrightness = b; }
  void clear() { g_leds.assign(g_leds.size(), 0); }
  void show() { g_ledShows++; }
  void setPixelColor(uint16_t i, uint32_t c) { if (i < g_leds.size()) g_leds[i] = c; }
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b) { return (uint32_t(r) << 16) | (uint32_t(g) << 8) | b; }
};
