// protocol.h - the JSON lines the node sends to the web app.
//
// Every line is one JSON object. The web app tells them apart by their first key:
//   status frame  {"v":2,"seq":..,"up":..,"entrance":..,"spot":..,"car":..,"taken":..,"state":..,...}
//   reply         {"ack":".."} {"err":".."} {"cfg":{..}} {"help":".."} {"dbg":..}
// "entrance" and "spot" (centimetres) are always present, so old versions of the app,
// which only read those two numbers, still work.
#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>

#include "sensor_health.h"
#include "state_machine.h"

struct Frame {
  uint32_t seq = 0;
  uint32_t uptimeMs = 0;
  float entranceCm = 80;
  float spotCm = 80;
  bool carAtEntrance = false;
  bool spotTaken = false;
  DeviceState state = DeviceState::Booting;
  bool mock = false;
  SensorFault entranceFault = SensorFault::None;
  SensorFault spotFault = SensorFault::None;
  const char* wifi = "off";  // "off", "offline" or "online"
};

inline const char* jsonBool(bool b) { return b ? "true" : "false"; }

// Each function returns the number of characters written, or 0 if the buffer was too small.
inline size_t finish(int written, size_t size) {
  return (written > 0 && static_cast<size_t>(written) < size) ? static_cast<size_t>(written) : 0;
}

inline size_t formatFrame(char* out, size_t size, const Frame& f) {
  int n = std::snprintf(out, size,
                        "{\"v\":2,\"seq\":%lu,\"up\":%lu,\"entrance\":%.1f,\"spot\":%.1f,\"car\":%s,\"taken\":%s,"
                        "\"state\":\"%s\",\"mock\":%s,\"faultE\":\"%s\",\"faultS\":\"%s\",\"wifi\":\"%s\"}",
                        static_cast<unsigned long>(f.seq), static_cast<unsigned long>(f.uptimeMs), f.entranceCm, f.spotCm,
                        jsonBool(f.carAtEntrance), jsonBool(f.spotTaken), stateName(f.state), jsonBool(f.mock),
                        faultName(f.entranceFault), faultName(f.spotFault), f.wifi);
  return finish(n, size);
}

inline size_t formatConfig(char* out, size_t size, float spotCm, float entranceCm, unsigned brightness, bool mock, bool debug) {
  int n = std::snprintf(out, size,
                        "{\"cfg\":{\"spot_cm\":%.1f,\"entrance_cm\":%.1f,\"brightness\":%u,\"mock\":%s,\"debug\":%s}}", spotCm,
                        entranceCm, brightness, jsonBool(mock), jsonBool(debug));
  return finish(n, size);
}

// `what` and `detail` are fixed strings from the firmware, never user text, so no escaping is needed.
inline size_t formatAck(char* out, size_t size, const char* what) {
  return finish(std::snprintf(out, size, "{\"ack\":\"%s\"}", what), size);
}

inline size_t formatAckValue(char* out, size_t size, const char* what, float value) {
  return finish(std::snprintf(out, size, "{\"ack\":\"%s\",\"value\":%.1f}", what, value), size);
}

inline size_t formatError(char* out, size_t size, const char* why) {
  return finish(std::snprintf(out, size, "{\"err\":\"%s\"}", why), size);
}

inline size_t formatDebug(char* out, size_t size, float rawE, float rawS, float stdE, float stdS, float voltsE, float voltsS) {
  return finish(std::snprintf(out, size,
                              "{\"dbg\":1,\"rawE\":%.0f,\"rawS\":%.0f,\"stdE\":%.0f,\"stdS\":%.0f,\"vE\":%.3f,\"vS\":%.3f}", rawE, rawS,
                              stdE, stdS, voltsE, voltsS),
                size);
}
