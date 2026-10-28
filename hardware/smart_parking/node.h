// node.h - the sensor node: owns every hardware object and runs the main loop.
//
// The rest of the firmware is small, single-purpose classes. This class only wires them
// together and decides what happens when (see docs/STATE_MACHINE.md for the modes).
#pragma once

#include <Arduino.h>

#include "button.h"
#include "command_parser.h"
#include "config.h"
#include "distance_sensor.h"
#include "hardware_io.h"
#include "mock_source.h"
#include "presence_detector.h"
#include "protocol.h"
#include "sensor_health.h"
#include "settings.h"
#include "settings_store.h"
#include "state_machine.h"
#include "status_leds.h"
#include "wifi_service.h"

class SmartParkingNode {
 public:
  void begin() {
    Serial.begin(SERIAL_BAUD);
    analogReadResolution(12);
    entranceAdc_.begin();
    spotAdc_.begin();
    if (PIN_USER_BUTTON >= 0) pinMode(PIN_USER_BUTTON, INPUT_PULLUP);

    settings_ = store_.load();
    applySettings();
    leds_.begin(settings_.brightness);
    wifi_.begin();
    bootStartMs_ = millis();
  }

  void update() {
    uint32_t now = millis();
    bootFinished_ = now - bootStartMs_ >= BOOT_LED_TEST_MS;

    readSerial();
    readButton(now);
    readSensors(now);
    finishCalibration(now);

    bool anyFault = !mock_ && (entranceHealth_.fault() != SensorFault::None || spotHealth_.fault() != SensorFault::None);
    state_ = nextState({bootFinished_, calibrating_, anyFault});
    leds_.show(state_, spotDetector_.present(), mock_, now);

    if (now - lastFrameMs_ >= FRAME_PERIOD_MS) {
      lastFrameMs_ = now;
      sendFrame(now);
    }
    wifi_.update(now);
  }

 private:
  // ---- reading the sensors (real or mock) ------------------------------------------
  void readSensors(uint32_t now) {
    if (mock_) {
      if (now - lastMockTickMs_ < 50) return;
      lastMockTickMs_ = now;
      mock_scenario_.update(now);
      entranceCm_ = mock_scenario_.entranceCm();
      spotCm_ = mock_scenario_.spotCm();
      carDetector_.update(entranceCm_);
      spotDetector_.update(spotCm_);
      return;
    }

    if (entranceSensor_.update(now)) {
      entranceCm_ = entranceSensor_.distanceCm();
      SensorFault fault = entranceHealth_.update(entranceSensor_.avgRaw(), entranceSensor_.stdDevRaw());
      if (fault == SensorFault::None) carDetector_.update(entranceCm_);
      else carDetector_.reset();  // a broken sensor must not report a car
      collectCalibration(CalTarget::Entrance, entranceCm_);
    }
    if (spotSensor_.update(now)) {
      spotCm_ = spotSensor_.distanceCm();
      SensorFault fault = spotHealth_.update(spotSensor_.avgRaw(), spotSensor_.stdDevRaw());
      if (fault == SensorFault::None) spotDetector_.update(spotCm_);
      else spotDetector_.reset();
      collectCalibration(CalTarget::Spot, spotCm_);
    }
  }

  // ---- calibration -------------------------------------------------------------------
  void startCalibration(CalTarget target, uint32_t now) {
    if (mock_) return emitError("turn mock mode off first");
    if (calibrating_) return emitError("already calibrating");
    SensorFault fault = target == CalTarget::Spot ? spotHealth_.fault() : entranceHealth_.fault();
    if (fault != SensorFault::None) return emitError("that sensor is faulty");
    calibrating_ = true;
    calTarget_ = target;
    calEndMs_ = now + CALIBRATION_MS;
    calSum_ = 0;
    calCount_ = 0;
    emitAck("calibrating");
  }

  void collectCalibration(CalTarget target, float cm) {
    if (calibrating_ && calTarget_ == target) {
      calSum_ += cm;
      calCount_++;
    }
  }

  void finishCalibration(uint32_t now) {
    if (!calibrating_ || now < calEndMs_) return;
    calibrating_ = false;
    if (calCount_ == 0) return emitError("no readings during calibration");
    float measured = calSum_ / calCount_;
    if (measured >= CALIBRATION_MIN_SIGNAL_CM) return emitError("nothing in front of the sensor");
    float threshold = thresholdFromCalibration(measured);
    if (calTarget_ == CalTarget::Spot) settings_.spotTakenCm = threshold;
    else settings_.entranceCarCm = threshold;
    applySettings();
    store_.save(settings_);
    emitAckValue("calibrated", threshold);
  }

  // ---- settings ----------------------------------------------------------------------
  void applySettings() {
    spotDetector_.setThreshold(settings_.spotTakenCm);
    carDetector_.setThreshold(settings_.entranceCarCm);
    leds_.setBrightness(settings_.brightness);
  }

  void setMock(bool on) {
    mock_ = on;
    carDetector_.reset();
    spotDetector_.reset();
    entranceHealth_.reset();
    spotHealth_.reset();
    entranceCm_ = SENSOR_FAR_CM;
    spotCm_ = SENSOR_FAR_CM;
    lastMockTickMs_ = 0;
  }

  void factoryReset() {
    settings_ = Settings();
    store_.clear();
    applySettings();
  }

  // ---- serial commands ---------------------------------------------------------------
  void readSerial() {
    while (Serial.available() > 0) {
      char ch = static_cast<char>(Serial.read());
      if (ch == '\n' || ch == '\r') {
        if (lineTooLong_) {
          emitError("line too long");
        } else if (lineLen_ > 0) {
          line_[lineLen_] = '\0';
          handleCommand(parseCommand(line_), millis());
        }
        lineLen_ = 0;
        lineTooLong_ = false;
      } else if (lineLen_ < COMMAND_BUFFER_SIZE - 1) {
        line_[lineLen_++] = ch;
      } else {
        lineTooLong_ = true;  // keep dropping characters until the end of the line
      }
    }
  }

  void handleCommand(const Command& c, uint32_t now) {
    switch (c.type) {
      case CommandType::Empty: break;
      case CommandType::Help:
        Serial.println("{\"help\":\"GET | SET SPOT_CM|ENTRANCE_CM|BRIGHTNESS <n> | MOCK ON|OFF | DEBUG ON|OFF | CAL SPOT|ENTRANCE | RESET | REBOOT\"}");
        break;
      case CommandType::Get: {
        char buf[160];
        if (formatConfig(buf, sizeof(buf), settings_.spotTakenCm, settings_.entranceCarCm, settings_.brightness, mock_, debug_)) Serial.println(buf);
        break;
      }
      case CommandType::Set: handleSet(c); break;
      case CommandType::Mock:
        setMock(c.flag);
        emitAck(c.flag ? "mock_on" : "mock_off");
        break;
      case CommandType::Debug:
        debug_ = c.flag;
        emitAck(c.flag ? "debug_on" : "debug_off");
        break;
      case CommandType::Calibrate: startCalibration(c.target, now); break;
      case CommandType::Reset:
        factoryReset();
        emitAck("reset");
        break;
      case CommandType::Reboot:
        emitAck("rebooting");
        Serial.flush();
        ESP.restart();
        break;
      case CommandType::Invalid: emitError(c.error); break;
    }
  }

  void handleSet(const Command& c) {
    switch (c.key) {
      case SettingKey::SpotCm:
        if (c.value < THRESHOLD_MIN_CM || c.value > THRESHOLD_MAX_CM) return emitError("value out of range (5 to 60)");
        settings_.spotTakenCm = c.value;
        break;
      case SettingKey::EntranceCm:
        if (c.value < THRESHOLD_MIN_CM || c.value > THRESHOLD_MAX_CM) return emitError("value out of range (5 to 60)");
        settings_.entranceCarCm = c.value;
        break;
      case SettingKey::Brightness:
        if (c.value < 0 || c.value > LED_BRIGHTNESS_MAX) return emitError("value out of range (0 to 120)");
        settings_.brightness = static_cast<uint8_t>(c.value);
        break;
      case SettingKey::None: return;
    }
    applySettings();
    store_.save(settings_);
    emitAckValue("set", c.value);
  }

  // ---- physical button ---------------------------------------------------------------
  // short press: switch mock mode on/off      long press (2 s): factory reset
  void readButton(uint32_t now) {
    if (PIN_USER_BUTTON < 0) return;
    ButtonEvent ev = button_.update(digitalRead(PIN_USER_BUTTON) == LOW, now);
    if (ev == ButtonEvent::ShortPress) {
      setMock(!mock_);
    } else if (ev == ButtonEvent::LongPress) {
      factoryReset();
    }
  }

  // ---- output ------------------------------------------------------------------------
  void sendFrame(uint32_t now) {
    Frame f;
    f.seq = ++seq_;
    f.uptimeMs = now;
    f.entranceCm = entranceCm_;
    f.spotCm = spotCm_;
    f.carAtEntrance = carDetector_.present();
    f.spotTaken = spotDetector_.present();
    f.state = state_;
    f.mock = mock_;
    f.entranceFault = mock_ ? SensorFault::None : entranceHealth_.fault();
    f.spotFault = mock_ ? SensorFault::None : spotHealth_.fault();
    f.wifi = wifi_.state();

    char buf[320];
    if (formatFrame(buf, sizeof(buf), f)) {
      Serial.println(buf);
      wifi_.setStatusLine(buf);
    }
    if (debug_) {
      char dbg[160];
      if (formatDebug(dbg, sizeof(dbg), entranceSensor_.avgRaw(), spotSensor_.avgRaw(), entranceSensor_.stdDevRaw(),
                      spotSensor_.stdDevRaw(), entranceSensor_.volts(), spotSensor_.volts())) {
        Serial.println(dbg);
      }
    }
  }

  void emitAck(const char* what) {
    char buf[64];
    if (formatAck(buf, sizeof(buf), what)) Serial.println(buf);
  }
  void emitAckValue(const char* what, float value) {
    char buf[80];
    if (formatAckValue(buf, sizeof(buf), what, value)) Serial.println(buf);
  }
  void emitError(const char* why) {
    char buf[96];
    if (formatError(buf, sizeof(buf), why)) Serial.println(buf);
  }

  // ---- hardware (each object owns one job) -------------------------------------------
  PinAnalogReader entranceAdc_{PIN_ENTRANCE_SENSOR};
  PinAnalogReader spotAdc_{PIN_SPOT_SENSOR};
  IrDistanceSensor entranceSensor_{entranceAdc_};
  IrDistanceSensor spotSensor_{spotAdc_};
  StatusLeds leds_;
  Button button_;
  SettingsStore store_;
  WifiService wifi_;

  // ---- logic -------------------------------------------------------------------------
  Settings settings_;
  PresenceDetector carDetector_{DEFAULT_ENTRANCE_CAR_CM};
  PresenceDetector spotDetector_{DEFAULT_SPOT_TAKEN_CM};
  SensorHealth entranceHealth_;
  SensorHealth spotHealth_;
  MockScenario mock_scenario_;

  DeviceState state_ = DeviceState::Booting;
  bool bootFinished_ = false;
  bool mock_ = false;
  bool debug_ = false;
  float entranceCm_ = SENSOR_FAR_CM;
  float spotCm_ = SENSOR_FAR_CM;

  bool calibrating_ = false;
  CalTarget calTarget_ = CalTarget::None;
  uint32_t calEndMs_ = 0;
  float calSum_ = 0;
  int calCount_ = 0;

  char line_[COMMAND_BUFFER_SIZE];
  size_t lineLen_ = 0;
  bool lineTooLong_ = false;

  uint32_t bootStartMs_ = 0;
  uint32_t lastFrameMs_ = 0;
  uint32_t lastMockTickMs_ = 0;
  uint32_t seq_ = 0;
};
