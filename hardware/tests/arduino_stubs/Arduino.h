// Just enough of the Arduino API to run the firmware's node class on a normal computer.
#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <deque>
#include <string>
#include <vector>

constexpr int INPUT = 0;
constexpr int INPUT_PULLUP = 2;
constexpr int LOW = 0;
constexpr int HIGH = 1;

// Test controls: the fake world the firmware lives in.
inline uint32_t g_millis = 0;
inline int g_adc[64] = {0};
inline int g_pin[64] = {1};  // buttons are active low, so the idle level is HIGH
inline bool g_restarted = false;

inline uint32_t millis() { return g_millis; }
inline void pinMode(int, int) {}
inline int digitalRead(int pin) { return g_pin[pin]; }
inline int analogRead(int pin) { return g_adc[pin]; }
inline void analogReadResolution(int) {}

struct FakeEsp {
  void restart() { g_restarted = true; }
};
inline FakeEsp ESP;

struct FakeSerial {
  std::deque<char> in;
  std::vector<std::string> out;
  void begin(unsigned long) {}
  int available() { return static_cast<int>(in.size()); }
  int read() {
    if (in.empty()) return -1;
    char c = in.front();
    in.pop_front();
    return static_cast<unsigned char>(c);
  }
  void println(const char* s) { out.emplace_back(s); }
  void flush() {}
  // test helper: type a line as if the user sent it
  void type(const std::string& line) {
    for (char c : line) in.push_back(c);
    in.push_back('\n');
  }
};
inline FakeSerial Serial;
