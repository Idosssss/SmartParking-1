# Hardware

## Parts

- ESP32 DevKit with a CP2102 USB-UART chip (driver: Silicon Labs "CP210x USB to UART Bridge VCP Driver")
- 2 x analog IR distance sensors (entrance, parking spot)
- WS2812 / NeoPixel LED strip, 3 wires (the project is set up for 4 LEDs)
- one resistor of about 330 ohm
- USB cable that carries data, jumper wires

## Wiring

| From | To (ESP32) |
| --- | --- |
| Entrance IR sensor, signal | **D34** (GPIO 34, input-only ADC) |
| Spot IR sensor, signal | **D35** (GPIO 35, input-only ADC) |
| LED strip **DIN** (yellow) | **D26**, through about 330 ohm |
| LED strip **+5V** (red) | **VIN** (5 V) |
| both sensors' VCC | **VIN** (5 V) |
| LED strip GND (blue) and both sensor GNDs | **GND** |

Use the strip's **input** end (`+5V DIN GND`), not the `DO` end. Everything is powered from `VIN`; nothing
uses the 3V3 pin. The pins are set in `hardware/smart_parking/config.h`.

The BOOT button on the DevKit board is the user button: short press = mock mode on/off, 2 s = restore defaults.

## Flash the board

1. Install the CP2102 driver if the board does not show up as a port.
2. Arduino IDE: Boards Manager, install **esp32** (Espressif). Library Manager, install **Adafruit NeoPixel**.
3. Open `hardware/smart_parking/smart_parking.ino`, board **ESP32 Dev Module**, pick the port, **Upload**.
   (If it waits at "Connecting...", hold the BOOT button until it starts.)
4. Open the Serial Monitor at 115200 baud to look: you should see one line like
   `{"v":2,"seq":12,"up":2210,"entrance":80.0,"spot":80.0,"car":false,"taken":false,"state":"RUNNING",...}`.
   Close the Serial Monitor before using the web app: only one program can use the port.

From the command line (no IDE): `arduino-cli compile --fqbn esp32:esp32:esp32 hardware/smart_parking`.

## Calibrate

The trigger distances start at 15 cm. To fit your setup:

1. Put the car (or toy car) where it normally stops in front of the sensor.
2. In the app: Hardware panel, "Board settings and technician view", **Calibrate spot sensor**
   (or type `CAL SPOT` in a serial terminal). Same for the entrance.
3. The board measures for 1.5 s, sets the trigger distance to twice that distance, and saves it.

Distances come from the lab formula for the sensor, `d = 29.988 * V^-1.173` (V in volts; below 0.4 V the
sensor is out of range and the board reports 80 cm).

## Tuning the sensor-fault detection

A sensor counts as broken when its raw ADC value sits at the bottom (about 0), at the top (about 4095), or
jumps around wildly for 20 readings in a row. The limits are in `config.h` (`FAULT_*`). They are
conservative guesses: if a healthy sensor is ever reported as faulty, turn on `DEBUG ON`, look at the raw
values (`rawE`, `rawS`, `stdE`, `stdS`), and adjust the limits.

## Optional: WiFi

Off by default. To use it, copy `secrets.h.example` to `secrets.h`, fill in the network, and set
`ENABLE_WIFI` to 1 in `config.h`. The board then serves a status page at `http://smart-parking.local`
(and the same JSON at `/status`) and accepts over-the-air uploads. Without WiFi the node works exactly the
same, and if the network disappears it keeps running and retries every 10 s.
