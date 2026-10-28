# Testing

Run everything with one command:

```bash
npm run check     # lint, type-check + build, app tests, firmware tests
```

## Automated tests

| Command | What it covers |
| --- | --- |
| `npm test` | the app: the board protocol parser, `DeviceLink` (connect, busy port, unplug, silent board, commands) against a fake serial port, detection logic, saved settings, the lot model and routing, the simulation's self-checks |
| `npm run test:firmware` | the firmware on this computer, no board needed: (1) every logic class on its own, (2) the whole `SmartParkingNode` against a fake Arduino: boot, detection, every USB command, bad input, calibration, sensor faults, mock mode, the BOOT button, settings that survive a power cycle, the `millis()` wrap-around |
| `npm run test:e2e` | the web app in a real (headless) Chrome against a simulated board: connecting, a silent board, a sensor fault, the technician panel, calibration, parked cars that must stay parked, dragging and moving the real sensor, the live sensor trace, the session counters, the theme switch and page changes with the board connected, the demo settings, roadwork lane closures, the line of cars at the gate and every edge-case button and spoken directions (59 checks). Start `npm run dev` first. |
| `npm run build` | full TypeScript type-check and the production build |
| `npm run lint` | static checks |
| `arduino-cli compile --fqbn esp32:esp32:esp32 hardware/smart_parking` | the firmware really compiles for the ESP32 (CI does this on every push) |

The tests are written to fail when the code is wrong: changing one firmware setting (for example the
"3 readings in a row" rule) turns the firmware tests red, and putting back the old 900 ms delay before the
sensor moves on turns the parked-car regression test red.

## What is NOT covered by automation, and how to check it

These need the real board. Tick them off before a demo or a submission.

**Hardware checklist** (about 15 minutes)

- [ ] Flash the sketch. Serial Monitor at 115200 shows one JSON line about every 150 ms with `"state":"RUNNING"`.
- [ ] LED strip: blue at power-up, then green. Hand in front of the spot sensor: red. Hand away: green.
- [ ] Hand in front of the entrance sensor: the line shows `"car":true`.
- [ ] Unplug the entrance sensor's signal wire for 5 s: LEDs blink orange, the line shows `"state":"SENSOR_FAULT"`
      and `"faultE":...`. Plug it back: back to green within a few seconds. (If a healthy sensor ever shows a
      fault, see "Tuning the sensor-fault detection" in [HARDWARE.md](HARDWARE.md).)
- [ ] `MOCK ON` in the Serial Monitor: the last LED turns violet and cars arrive by themselves. `MOCK OFF` returns to real data.
- [ ] Short press of the BOOT button toggles mock mode; holding it for 2 s restores defaults (`GET` shows 15.0).
- [ ] `SET SPOT_CM 25`, then `GET` shows 25.0; unplug and replug the board; `GET` still shows 25.0.
- [ ] Calibrate: car in front of the spot sensor, `CAL SPOT`: the reply says `calibrated`, `GET` shows about twice the measured distance.
- [ ] Web app: Connect works, the bars move, a car at the entrance starts the phone flow, parking at the spot turns the LEDs red and the HW tag moves on.
- [ ] Pull the USB cable while connected: the app says "Lost connection"; plug it back: it reconnects by itself.
- [ ] Close the app tab, open the Arduino Serial Monitor, then open the app: it says the port is busy and tells you what to do.
- [ ] Optional WiFi (only if you turned it on): the status page opens at `http://smart-parking.local`; switch the router off and the node keeps running; switch it back on and the page returns.

**User test** with people who did not build the project: [USER_TEST.md](USER_TEST.md).

## What was verified only by compiling

The optional WiFi / OTA module (`wifi_service.h`) compiles for the ESP32 with `ENABLE_WIFI 1` but was not run on a
board. It is switched off by default for that reason.
