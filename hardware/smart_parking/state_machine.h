// state_machine.h - the operating modes of the node and the rules for moving between them.
// All mode switching lives in nextState(); nothing else decides the mode.
#pragma once

#include <cstdint>

enum class DeviceState : uint8_t {
  Booting,      // power-on LED test
  Running,      // normal operation
  SensorFault,  // a sensor looks broken; its readings are not trusted
  Calibrating,  // measuring the sensor with the car in place
};

struct StateInputs {
  bool bootFinished;
  bool calibrating;
  bool anyFault;
};

inline DeviceState nextState(const StateInputs& in) {
  if (!in.bootFinished) return DeviceState::Booting;
  if (in.calibrating) return DeviceState::Calibrating;
  if (in.anyFault) return DeviceState::SensorFault;
  return DeviceState::Running;
}

inline const char* stateName(DeviceState s) {
  switch (s) {
    case DeviceState::Booting: return "BOOTING";
    case DeviceState::Running: return "RUNNING";
    case DeviceState::SensorFault: return "SENSOR_FAULT";
    case DeviceState::Calibrating: return "CALIBRATING";
  }
  return "RUNNING";
}
