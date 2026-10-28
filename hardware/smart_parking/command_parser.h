// command_parser.h - reads the text commands that arrive over USB serial.
//
//   HELP | GET | RESET | REBOOT
//   SET SPOT_CM <number> | SET ENTRANCE_CM <number> | SET BRIGHTNESS <0-255>
//   MOCK ON|OFF          DEBUG ON|OFF          CAL SPOT|ENTRANCE
//
// Upper or lower case both work. Anything else is rejected with a reason; the parser
// never crashes on odd input (empty lines, huge numbers, random text).
#pragma once

#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <cstring>

enum class CommandType : uint8_t { Empty, Help, Get, Set, Mock, Debug, Calibrate, Reset, Reboot, Invalid };
enum class SettingKey : uint8_t { None, SpotCm, EntranceCm, Brightness };
enum class CalTarget : uint8_t { None, Spot, Entrance };

struct Command {
  CommandType type = CommandType::Empty;
  SettingKey key = SettingKey::None;
  CalTarget target = CalTarget::None;
  float value = 0;
  bool flag = false;
  const char* error = "";  // only set when type is Invalid
};

namespace command_parser_detail {

inline Command invalid(const char* why) {
  Command c;
  c.type = CommandType::Invalid;
  c.error = why;
  return c;
}

// Splits `line` in place into at most `max` upper-case words. Returns how many were found.
inline int splitWords(char* line, char* words[], int max) {
  int count = 0;
  char* p = line;
  while (*p && count < max) {
    while (*p && std::isspace(static_cast<unsigned char>(*p))) p++;
    if (!*p) break;
    words[count++] = p;
    while (*p && !std::isspace(static_cast<unsigned char>(*p))) {
      *p = static_cast<char>(std::toupper(static_cast<unsigned char>(*p)));
      p++;
    }
    if (*p) *p++ = '\0';
  }
  return count;
}

inline bool parseOnOff(const char* word, bool& out) {
  if (std::strcmp(word, "ON") == 0) { out = true; return true; }
  if (std::strcmp(word, "OFF") == 0) { out = false; return true; }
  return false;
}

}  // namespace command_parser_detail

inline Command parseCommand(const char* text) {
  using namespace command_parser_detail;
  char line[96];
  std::strncpy(line, text ? text : "", sizeof(line) - 1);
  line[sizeof(line) - 1] = '\0';

  char* w[4] = {nullptr, nullptr, nullptr, nullptr};
  int n = splitWords(line, w, 4);
  Command c;
  if (n == 0) return c;  // empty line: ignored
  if (n > 3) return invalid("too many words");

  const char* verb = w[0];
  if (std::strcmp(verb, "HELP") == 0 && n == 1) { c.type = CommandType::Help; return c; }
  if (std::strcmp(verb, "GET") == 0 && n == 1) { c.type = CommandType::Get; return c; }
  if (std::strcmp(verb, "RESET") == 0 && n == 1) { c.type = CommandType::Reset; return c; }
  if (std::strcmp(verb, "REBOOT") == 0 && n == 1) { c.type = CommandType::Reboot; return c; }

  if (std::strcmp(verb, "MOCK") == 0 || std::strcmp(verb, "DEBUG") == 0) {
    if (n != 2 || !parseOnOff(w[1], c.flag)) return invalid("use ON or OFF");
    c.type = std::strcmp(verb, "MOCK") == 0 ? CommandType::Mock : CommandType::Debug;
    return c;
  }

  if (std::strcmp(verb, "CAL") == 0) {
    if (n != 2) return invalid("use CAL SPOT or CAL ENTRANCE");
    c.type = CommandType::Calibrate;
    if (std::strcmp(w[1], "SPOT") == 0) c.target = CalTarget::Spot;
    else if (std::strcmp(w[1], "ENTRANCE") == 0) c.target = CalTarget::Entrance;
    else return invalid("use CAL SPOT or CAL ENTRANCE");
    return c;
  }

  if (std::strcmp(verb, "SET") == 0) {
    if (n != 3) return invalid("use SET <name> <number>");
    if (std::strcmp(w[1], "SPOT_CM") == 0) c.key = SettingKey::SpotCm;
    else if (std::strcmp(w[1], "ENTRANCE_CM") == 0) c.key = SettingKey::EntranceCm;
    else if (std::strcmp(w[1], "BRIGHTNESS") == 0) c.key = SettingKey::Brightness;
    else return invalid("unknown setting");
    char* end = nullptr;
    float v = std::strtof(w[2], &end);
    if (end == w[2] || *end != '\0') return invalid("value is not a number");
    if (!(v == v) || v < -1e6f || v > 1e6f) return invalid("value out of range");
    c.type = CommandType::Set;
    c.value = v;
    return c;
  }

  return invalid("unknown command (try HELP)");
}
