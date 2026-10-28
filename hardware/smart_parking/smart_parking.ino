// Smart Parking - ESP32 sensor node.
//
// Reads two IR distance sensors (entrance, parking spot), decides "car at the entrance"
// and "spot taken" on the board itself, shows the spot state on an LED strip, and streams
// one JSON status line per ~150 ms over USB serial (and optionally WiFi) to the web app.
//
// All of the work happens in small classes, see node.h. Settings are in config.h,
// the modes are described in docs/STATE_MACHINE.md, the wiring in docs/HARDWARE.md.
//
// Libraries: Adafruit NeoPixel (Library Manager). Board: ESP32 Dev Module.

#include "node.h"

SmartParkingNode node;

void setup() {
  node.begin();
}

void loop() {
  node.update();
}
