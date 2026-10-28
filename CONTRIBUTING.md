# Working on Smart Parking

## Set up

```bash
git clone https://github.com/Idosssss/SmartParking-1.git
cd SmartParking
npm install
npm run dev          # http://localhost:5173
```

Node 18 or newer. Keep the project **outside iCloud / OneDrive / Dropbox folders**: they can silently damage
`node_modules` (missing or duplicated files such as `lib.dom 2.d.ts`). If `npm run build` suddenly fails with a
missing library file, run `rm -rf node_modules && npm ci`.

## Before you push

```bash
npm run check
```

That runs the linter, the type-check and build, the app tests and the firmware tests. For firmware changes also
compile for the board: `arduino-cli compile --fqbn esp32:esp32:esp32 hardware/smart_parking`.

Work on a branch (`git checkout -b your-name/what-you-did`), push it, and open a pull request into `main`.
Please do not push straight to `main`. The CI checks must be green.

## Where things go

- A new fixed number: `src/config/constants.ts` (app) or `hardware/smart_parking/config.h` (firmware). Not inside a component.
- Pure logic goes in its own file with a test next to the others in `tests/` (app) or `hardware/tests/` (firmware).
- Anything that touches the serial port goes through `DeviceLink`; anything that touches a pin goes through one of the
  hardware classes in the firmware. Logic classes never touch hardware.
- A new edge case: handle it, then add a row to [docs/EDGE_CASES.md](docs/EDGE_CASES.md) and a test.
- Never commit passwords. The WiFi settings live in `hardware/smart_parking/secrets.h`, which is git-ignored.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the other documents in `docs/`.
