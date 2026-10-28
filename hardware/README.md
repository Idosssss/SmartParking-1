# Firmware

ESP32 sensor node. Open `smart_parking/smart_parking.ino` in the Arduino IDE (board **ESP32 Dev Module**,
library **Adafruit NeoPixel**), or compile from the command line:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 hardware/smart_parking
```

- Settings and pins: `smart_parking/config.h`
- How the code is organised: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- Modes, LEDs and USB commands: [../docs/STATE_MACHINE.md](../docs/STATE_MACHINE.md)
- Wiring, calibration, WiFi: [../docs/HARDWARE.md](../docs/HARDWARE.md)
- Tests (no board needed): `sh hardware/tests/run.sh`
