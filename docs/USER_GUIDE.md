# User guide

Smart Parking shows a parking lot, finds the nearest free spot for an arriving car, and guides the driver
there. One spot is real: an ESP32 with two IR sensors and an LED strip. The rest of the lot is simulated.
(עברית: [USER_GUIDE.he.md](USER_GUIDE.he.md))

## What you need

- A computer with **Chrome or Edge** (Safari and Firefox cannot talk to USB)
- The ESP32 node, wired as in [HARDWARE.md](HARDWARE.md), with the firmware uploaded
- The site (the Vercel link, or `npm run dev` and `http://localhost:5173`)

No board? You can still try everything with the on-screen emulator, or with the board's mock mode.

## Start it

1. Plug the board into the computer with a USB cable. The LED strip flashes **blue** for a moment, then shows
   **green** (spot free).
2. Close the Arduino IDE Serial Monitor if it is open.
3. Open the site. It starts on the **Overview** page; press **Open the live demo**, then **Connect Arduino**. Pick the board's port (it says CP2102 or USB Serial).
4. The top of the Hardware panel says **Board connected** and the two sensor bars move.
   Next time, the site reconnects by itself.

## Use it

1. **Put a toy car in front of the entrance sensor.** The phone shows "Car detected", then "Finding nearest
   spot", then turn-by-turn directions, and the car drives on the lot map.
2. The car stops next to the real spot ("Pull into Spot S25"). **Move the toy car to the spot sensor.** The LEDs
   turn **red** and the app confirms you have parked.
3. The real-sensor tag (**HW**) moves to the next spot. Clear the spot sensor and bring the next car.

Other things to try: click a free spot to fill it, turn on **Live Traffic**, drag the **HW** tag to another
spot, switch to the **Simulation study** page for the numbers behind the routing.

Below the map:

- **Live sensor readings** draws the last 30 seconds of both IR sensors with their trigger distances, and
  shades the moments the board decided "car" or "taken". **Pause** freezes it; **Export CSV** saves the readings.
- **This session** counts the cars guided, their average drive in metres, reroutes and sensor-confirmed parks,
  and plots how full the lot was over time. **Export CSV** saves the summary and the whole event feed.

The moon / sun button at the top right switches between the light and the dark theme.

### Keyboard shortcuts

| Key | Does |
| --- | --- |
| `1` `2` `3` | Overview, Live demo, Simulation study |
| `F` | send a car into the lot (live demo) |
| `T` | live traffic on or off |
| `D` | dark or light theme |
| `?` | show the list of shortcuts |

## What the LEDs mean

| LEDs | Meaning |
| --- | --- |
| green | the spot is free |
| red | the spot is taken |
| blue, steady | starting up |
| blue, fast blink | calibrating a sensor |
| orange, blinking | a sensor is broken (check its wires) |
| last LED violet | mock mode: the data is generated, not measured |

## The BOOT button on the board

| Press | Does |
| --- | --- |
| short | mock mode on / off |
| hold 2 seconds | restore the default settings |

## Settings

In the Hardware panel:

- **Entrance trigger / Spot trigger**: how close (in cm) something must be to count as a car / a taken spot.
  They are saved on the board.
- **Board settings and technician view** (open it with the small arrow): **Calibrate** buttons (put the car in
  place first, then press), **Mock mode**, **LED brightness**, **Restore board defaults**, and **Show raw data**.

## If something goes wrong

| You see | Do this |
| --- | --- |
| "Could not open the port..." | Close the Arduino IDE Serial Monitor (or any other program using the board), press Connect again |
| The port is not in the list | Use a USB cable that carries data; install the CP2102 driver; replug the board |
| "Connected, but the board is not sending data" | Upload the sketch again, make sure the baud rate is 115200 |
| "Board not responding" | Check the cable or press the board's reset button. Detection resumes by itself |
| "Lost connection to the board" | The cable came out. Plug it back in; the site reconnects |
| "A sensor looks broken" and orange LEDs | Check that sensor's three wires (signal, power, ground) |
| A car is detected too early or too late | Calibrate (Board settings) or move the trigger slider |
| Nothing works at all | Press **Mock mode** to confirm the site works, then check the wiring |
| No Connect button | Use Chrome or Edge on a computer; or use the emulator |

More cases: [EDGE_CASES.md](EDGE_CASES.md).
