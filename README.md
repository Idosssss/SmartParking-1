# Smart Parking Lot — Software Simulation

A web-based simulation of the software side of our smart parking lot project. It models
a parking lot with an entrance sensor and a per-spot sensor grid, automatically routes an
arriving car to the nearest open spot, and shows the whole thing from two angles at once:

- **Virtual lot** (right) — a top-down view of the lot with live spot status, the car
  driving to its spot, and big directional arrows tracing the route.
- **Phone app** (left) — a mockup of the mobile app a driver would use in their car:
  "car detected" → "finding nearest spot" → turn-by-turn directions → arrival.

There's no real hardware involved here — every sensor event (a car arriving, a spot
filling up or freeing) is simulated in the browser. Click any spot to simulate its
sensor, or turn on **Live Traffic** to have the lot fill and empty on its own. If the
spot your car is heading to gets taken while it's en route, it re-routes automatically.

## Tech stack

- **React + TypeScript**, built with **Vite**
- Plain **HTML5 Canvas** for the lot rendering — no game engine, no charting library
- No backend — all state lives in the browser for now (see below)

## Getting started

You'll need [Node.js](https://nodejs.org/) (v18 or newer) installed.

```bash
# 1. Clone the repo
git clone https://github.com/AvivEli1/SmartParking.git
cd SmartParking

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`) in your browser.

Other useful commands:

```bash
npm run build    # type-check and build a production bundle to dist/
npm run lint     # run the linter
npm run preview  # preview the production build locally
```

## Project structure

```
src/
  lot/                  # pure logic — no React here
    types.ts            # Cell / Spot / LotModel types
    generateLot.ts       # builds the lot layout (spots, lanes, entrance)
    pathfinding.ts        # BFS pathfinding — nearest free spot, route to a specific spot
    directions.ts          # turns a path into turn-by-turn text directions
  components/
    VirtualLot.tsx        # canvas rendering of the lot, cars, route arrows, sensor pings
    PhoneApp.tsx           # the phone mockup UI
    ActivityFeed.tsx        # live sensor/event log
    StatsHeader.tsx          # header bar: occupancy ring + Live Traffic toggle
    HardwarePanel.tsx        # Connect Arduino button, live sensor readings, sensor emulator
  pages/                 # the Simulation study page
  sim/                   # the simulation engine (see below)
  Root.tsx               # top bar + the two parts of the site (live demo, simulation study)
  hardware/              # talking to the real board (Web Serial) + sensor logic
    useSerialSensors.ts    # USB serial connection
    useHardware.ts          # real board or emulator -> "car at entrance" / "spot taken"
    sensorLogic.ts           # line parser + debounce/hysteresis
  App.tsx                # top-level state + the animation loop that drives everything
hardware/
  smart_parking/
    smart_parking.ino    # ESP32 sketch: reads the two IR sensors, streams distances over USB
```

## Using the real hardware (ESP32 + 2 IR sensors)

The web app can run the simulation from real sensors. The board only *measures*; the web
app does the detecting, routing and turn-by-turn directions.

| Sensor | Pin | What it does in the app |
| --- | --- | --- |
| Entrance IR sensor | **D34** | A car in front of it = "car detected" -> finds a spot and starts the directions |
| Spot IR sensor | **D35** | Tells the app whether the **hardware spot** is taken (Spot S25 to start with, see below) |
| LED strip (WS2812 / NeoPixel) | **D26** -> `DIN` | **Green = the hardware spot is open, red = taken.** Wire: red wire -> `5V`/`VIN`, yellow wire -> `DIN` (through a ~330 ohm resistor), blue wire -> `GND`. Use the strip's *input* end (`+5V DIN GND`), not the `DO` end |

The LEDs are driven by the board itself, so the spot shows open/taken even when the app isn't
connected. The sketch needs the **Adafruit NeoPixel** library (Arduino IDE -> Sketch -> Include
Library -> Manage Libraries). If green and red come out swapped, change `NEO_GRB` to `NEO_RGB`
in the sketch.

All the other spots stay simulated, so you get a full lot with one real spot.

**The real spot moves on by itself.** The blue **HW** tag on the lot marks the hardware spot. It
starts on S25. When a car parks there and the spot sensor confirms it, that car stays parked at S25
and the tag **moves to the next nearest free spot** (S26, then S27, ...). The tag turns outlined and
the Hardware panel says to move the real sensor and clear it: the new spot starts following the
sensor again once it reads "open", so a car still sitting at the sensor can't instantly fill the
next spot. In the meantime the waiting spot is reserved and no cars are routed to it.

**A car that parked at the real spot stays there.** Live Traffic's random departures and the
sensor moving on never free it again (only clicking that spot yourself does). "Next nearest" means
nearest by drive distance from the entrance; if two spots tie, the one closest to the spot that was
just filled wins, so the sensor walks along the row.

**Choosing the spot yourself.** To test somewhere else, **drag the HW tag onto any
other spot** (you can do this before connecting the board too). The Hardware panel and the
sensor feed follow it. Moving it by hand is only possible between trips, not while a car is navigating, and the old spot goes back to a normal free spot.
The "Send cars to Spot X" checkbox in the Hardware panel is test mode: while it's on, new cars
head for the real spot whenever it's free, so you exercise the sensor even when that spot is
far from the entrance. Turn it off to see normal nearest-spot routing.

**1. Flash the board.** Open `hardware/smart_parking/smart_parking.ino` in the Arduino IDE,
select your ESP32 board and port, and upload. It streams a line like
`{"entrance":12.3,"spot":80.0}` over USB serial at 115200 baud, about 5 times a second.

**2. Connect it to the app.** Close the Arduino IDE **Serial Monitor** (only one program can use
the port at a time), open the app in **Chrome or Edge** (Safari and Firefox don't support USB
serial), click **Connect Arduino**, and pick your board's port. This also works on the
deployed (https) site, since the browser talks to the board directly. There's no server.

**3. Try it.**
1. Put something (like a toy car) in front of the **entrance sensor**. The phone shows "CAR DETECTED",
   searches, then gives directions to the real spot and the virtual car drives up to it.
2. The virtual car stops at the spot and waits ("Pull into Spot ..."). Move the toy car to the
   **spot sensor**: the app sees the spot become TAKEN and confirms you've parked.
3. The tag moves on to the next nearest spot. Clear the spot sensor, then bring a second car to the
   entrance: it's sent to the new real spot.

The Hardware panel shows both live distances with their trigger points. If your sensors
trigger too early or too late, drag the **trigger** sliders. No re-flashing needed (default 15 cm).

**No board handy?** Open "No board? Emulate the sensors" in the Hardware panel. The emulator
streams the same kind of data, and you slide the two distances to put a "car" in front of each sensor.

**Sensor notes:** the sketch converts the analog voltage to centimetres with the lab formula
`d = 29.988 * V^(-1.173)` (readings below 0.4 V count as "far", 80 cm).

## Simulation study: how much driving does the app save?

The site has a second page, **Simulation study** (top bar, or `#/simulation`), and the repo has the code
behind it. We simulate thousands of days in the lot twice, with the same cars every time: once with every
driver finding a spot on their own, once with every driver routed by the app (Dijkstra's shortest path to
the nearest free spot), and compare the distance driven from the entrance to the spot.

**Headline (seed 2026, 5,000 simulated days, our 32-spot lot):** **11.7% less driving to find a spot**
(95% CI 11.6% to 11.8%), from 31.1 m to 27.5 m per car on average, compared with a methodical driver who has
no app. The saving is 56% against a driver who just follows the lanes, and it grows with the size of the lot
(12% at 32 spots, 33% at 288). The full write-up with every graph is in
[`docs/Smart-Parking-Simulation-Report.pdf`](docs/Smart-Parking-Simulation-Report.pdf).

```bash
npm run simulate           # self-checks, then the full study; writes public/simulation-results.json
npm run simulate:report    # rebuilds the PDF report from that file (needs Google Chrome; set CHROME=... if it is elsewhere)
```

```
src/sim/
  params.ts        every assumption in one place (lot scale, demand, how far drivers see, ...)
  dijkstra.ts      Dijkstra with a priority queue (the app's router is BFS, the same thing for equal costs)
  graph.ts         the lot as a graph of lane cells; all-pairs distances; what a driver can see
  drivers.ts       the policies: the app, a methodical driver, a wandering driver
  engine.ts        the day simulation, paired runs, confidence intervals
  checks.ts        self-checks that must pass before a study runs (Dijkstra == the app's router, etc.)
  experiments.ts   the full study: headline, sweeps (adoption, view distance, demand, lot size, ...)
  charts.ts, studyCharts.ts   dependency-free SVG charts used by both the website and the PDF
  worker.ts        runs a live simulation in a Web Worker for the "Run it yourself" panel
src/pages/         the Simulation page (SimulationPage.tsx) and the step-by-step walkthrough
simulation/        run.ts (CLI) and build-report.ts (PDF)
```

To try another assumption, change it in `src/sim/params.ts` and run `npm run simulate`, or use the
"Run it yourself" panel on the page. The same seed always gives the same numbers.

## Working on this as a team

1. Pull the latest `main` before you start: `git pull`
2. Make a branch for your change: `git checkout -b your-name/short-description`
3. Commit and push your branch, then open a Pull Request into `main` so others can review
   before it merges — please avoid pushing straight to `main`.
4. Run `npm run build` before pushing to make sure it still type-checks and builds cleanly.

## Where this is headed

This repo is only the software simulation. The plan is for it to eventually plug into
the real hardware (entrance sensor + per-spot sensors) by swapping the simulated sensor
events for real ones over MQTT/HTTP, without changing the lot logic, rendering, or phone UI
underneath. The USB hardware connection above is the first step: the app already runs off a
stream of sensor readings, whichever source they come from.
