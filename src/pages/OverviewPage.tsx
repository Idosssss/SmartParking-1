import { useEffect, useState } from 'react';
import './OverviewPage.css';

const REPO = 'https://github.com/Idosssss/SmartParking-1';
const DOCS = `${REPO}/blob/main/docs`;

/* ------------------------------------------------------------------ hero lot ---- */

// A small lot drawn on a 44px grid: two rows of spots around one lane, entrance on the left.
const CELL = 44;
const COLS = 8;
const SPOT_ROWS = [0, 2];
const TAKEN = new Set(['0-0', '0-1', '0-3', '0-4', '2-0', '2-2', '2-3', '2-5', '2-6', '0-7']);
const TARGET = { row: 0, col: 5 };
const LOOP_S = 7;

const px = (col: number) => CELL / 2 + col * CELL + 30;
const py = (row: number) => CELL / 2 + row * CELL + 8;

/** The moving part of the hero: a car enters, the app sends it to the nearest free spot, the spot sensor confirms. */
function HeroLot() {
  const [still] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const route = `M ${px(-0.6)} ${py(1)} H ${px(TARGET.col)} V ${py(TARGET.row)}`;
  const timing = { dur: `${LOOP_S}s`, repeatCount: 'indefinite' };
  const width = px(COLS - 1) + CELL / 2 + 10;
  const height = py(2) + CELL / 2 + 8;

  return (
    <div className="hero-lot">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Animation: a car enters, is routed to the nearest free spot and parks there">
        <rect className="hero-lot__lane" x={px(0) - CELL / 2 - 30} y={py(1) - CELL / 2 + 3} width={width} height={CELL - 6} rx={10} />
        <line className="hero-lot__dash" x1={px(0) - 20} x2={width - 12} y1={py(1)} y2={py(1)} />
        {SPOT_ROWS.flatMap((row) =>
          Array.from({ length: COLS }, (_, col) => {
            const key = `${row}-${col}`;
            const taken = TAKEN.has(key);
            const target = row === TARGET.row && col === TARGET.col;
            const label = `S${row === 0 ? col + 1 : col + 9}`;
            return (
              <g key={key}>
                <rect className={`hero-lot__spot ${taken ? 'is-taken' : ''} ${target ? 'is-target' : ''}`} x={px(col) - 18} y={py(row) - 18} width={36} height={36} rx={8} />
                {taken ? (
                  <rect className="hero-lot__parked" x={px(col) - 9} y={py(row) - 13} width={18} height={26} rx={5} />
                ) : (
                  <text className="hero-lot__label" x={px(col)} y={py(row) + 4} textAnchor="middle">
                    {label}
                    {target && !still && <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.58;0.62;1" {...timing} />}
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* entrance */}
        <rect className="hero-lot__gate" x={4} y={py(1) - 15} width={26} height={30} rx={6} />
        <text className="hero-lot__gate-text" x={17} y={py(1) + 4} textAnchor="middle">
          IN
        </text>

        {!still && (
          <>
            <path className="hero-lot__route" d={route} pathLength={1}>
              <animate attributeName="stroke-dashoffset" values="1;1;0;0;1" keyTimes="0;0.12;0.2;0.9;1" {...timing} />
            </path>
            <circle className="hero-lot__ping" cx={px(-0.4)} cy={py(1)} r={6}>
              <animate attributeName="r" values="6;6;26;26" keyTimes="0;0.04;0.16;1" {...timing} />
              <animate attributeName="opacity" values="0;0.8;0;0" keyTimes="0;0.04;0.16;1" {...timing} />
            </circle>
            <circle className="hero-lot__ping" cx={px(TARGET.col)} cy={py(TARGET.row)} r={10}>
              <animate attributeName="r" values="10;10;30;30" keyTimes="0;0.6;0.74;1" {...timing} />
              <animate attributeName="opacity" values="0;0;0.8;0" keyTimes="0;0.6;0.61;0.74" {...timing} />
            </circle>
            <g className="hero-lot__car">
              <rect x={-14} y={-9} width={28} height={18} rx={6} />
              <rect className="hero-lot__window" x={2} y={-6} width={8} height={12} rx={2.5} />
              <animateMotion path={route} rotate="auto" keyPoints="0;0;1;1" keyTimes="0;0.2;0.6;1" calcMode="linear" {...timing} />
              <animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.03;0.6;0.94;1" {...timing} />
            </g>
          </>
        )}
      </svg>

      <div className="hero-lot__phone" aria-hidden="true">
        <span className="hero-lot__msg hero-lot__msg--1">
          <i className="hero-lot__dot" /> Car detected at the entrance
        </span>
        <span className="hero-lot__msg hero-lot__msg--2">
          <i className="hero-lot__dot" /> Go to S6 · 21.6 m · straight, then left
        </span>
        <span className="hero-lot__msg hero-lot__msg--3">
          <i className="hero-lot__dot hero-lot__dot--ok" /> Spot sensor confirmed: parked at S6
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page ---- */

const STEPS = [
  {
    title: 'A car reaches the gate',
    body: 'The entrance IR sensor on pin D34 reads closer than its trigger distance three times in a row. One noisy reading never counts.',
    sample: 'entrance 9.8 cm < 15 cm',
  },
  {
    title: 'The board decides and reports',
    body: 'The ESP32 averages 25 ADC samples per reading, checks each sensor for faults, and sends one status line over USB every 150 ms.',
    sample: '{"v":2,"car":true,"taken":false,"state":"RUNNING"}',
  },
  {
    title: 'The app picks the nearest spot',
    body: 'Dijkstra runs on the lane graph from the entrance to every free spot, and the driver gets the shortest one with turn-by-turn steps.',
    sample: 'S6 · 6 cells · 21.6 m',
  },
  {
    title: 'The spot confirms the car',
    body: "When the spot sensor on D35 sees the car, the trip ends and the spot is marked taken for every other driver.",
    sample: 'spot 6.2 cm → TAKEN',
  },
];

const PARTS = [
  { part: 'ESP32 DevKit (CP2102 USB)', pin: 'USB to the laptop', job: 'Reads both sensors, decides, reports. Powers everything from VIN.' },
  { part: 'IR distance sensor', pin: 'D34 · VIN · GND', job: 'Sees a car waiting at the entrance.' },
  { part: 'IR distance sensor', pin: 'D35 · VIN · GND', job: 'Sees whether the real parking spot is taken.' },
  { part: 'WS2812 LED strip, 4 LEDs', pin: 'D26 via 330 Ω · VIN', job: 'Green free, red taken, blue starting, orange a faulty sensor.' },
  { part: 'BOOT button', pin: 'GPIO0', job: 'Short press: mock mode on/off. Hold 2 s: restore defaults.' },
];

const QUALITY = [
  { value: '24,106', label: 'firmware checks', note: 'detector, fault logic, parser and protocol, run on the PC', href: `${DOCS}/TESTING.md` },
  { value: '37', label: 'app tests', note: 'protocol, USB link, detection, routing and the study', href: `${DOCS}/TESTING.md` },
  { value: '35', label: 'browser checks', note: 'a fake board drives the real page in Chrome', href: `${DOCS}/TESTING.md` },
  { value: '33', label: 'edge cases handled', note: 'pulled cables, silent boards, broken sensors, full lot', href: `${DOCS}/EDGE_CASES.md` },
];

const STATES = ['BOOTING', 'RUNNING', 'SENSOR_FAULT', 'CALIBRATING'];

/** The front page: what the project is, how the pieces talk, and how it was checked. */
export default function OverviewPage() {
  const [frame, setFrame] = useState(0);
  // The sample status line in the diagram ticks like the real one.
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => f + 1), 900);
    return () => clearInterval(id);
  }, []);
  const seq = 4180 + frame;
  const spotCm = (11.4 + Math.sin(frame / 2) * 0.6).toFixed(1);

  return (
    <div className="ov">
      <section className="ov-hero">
        <div className="ov-hero__text">
          <h1>Find a free spot without circling.</h1>
          <p className="ov-lead">
            Two infrared sensors on an ESP32 watch the entrance and a parking spot. The web app reads them over USB and sends every arriving driver to the nearest free spot, turn by turn.
          </p>
          <div className="ov-cta">
            <a className="btn btn--primary btn--large" href="#/demo">
              Open the live demo
            </a>
            <a className="btn btn--large" href="#/simulation">
              See the simulation study
            </a>
          </div>
          <p className="ov-hint">
            No board with you? The demo has a built-in sensor emulator.
            <span className="only-keyboard"> Press <kbd>?</kbd> for keyboard shortcuts.</span>
          </p>
        </div>
        <HeroLot />
      </section>

      <section className="ov-facts" aria-label="Key results">
        <div>
          <strong>11.7%</strong>
          <span>less search driving per car</span>
          <small>5,000 simulated days, 95% CI 11.6–11.8%</small>
        </div>
        <div>
          <strong>
            94 → 54 <em>m</em>
          </strong>
          <span>worst 1% of drives</span>
          <small>no car circles the lot looking</small>
        </div>
        <div>
          <strong>56%</strong>
          <span>less driving than a wandering driver</span>
          <small>the saving grows with lot size: 33% at 288 spots</small>
        </div>
        <div>
          <strong>
            150 <em>ms</em>
          </strong>
          <span>between sensor reports</span>
          <small>the app notices a silent board within 2.5 s</small>
        </div>
      </section>

      <section className="ov-section">
        <h2>From the gate to the spot in four steps</h2>
        <ol className="ov-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ '--i': i } as React.CSSProperties}>
              <span className="ov-steps__n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <code>{s.sample}</code>
            </li>
          ))}
        </ol>
      </section>

      <section className="ov-section">
        <h2>How the pieces talk</h2>
        <p className="ov-section__lead">The board makes the detection decisions; the browser does the routing. They share one versioned JSON line, and the app can send commands back.</p>
        <div className="arch">
          <div className="arch__node">
            <h3>In the lot</h3>
            <ul>
              <li>
                <b>IR sensor</b> entrance <span className="mono">D34</span>
              </li>
              <li>
                <b>IR sensor</b> spot <span className="mono">D35</span>
              </li>
              <li>
                <b>LED strip</b> status <span className="mono">D26</span>
              </li>
            </ul>
          </div>
          <div className="arch__wire" aria-hidden="true">
            <span className="arch__packet" />
            <span className="arch__packet arch__packet--2" />
          </div>
          <div className="arch__node arch__node--board">
            <h3>ESP32 node</h3>
            <ul>
              <li>25 samples per reading, non-blocking</li>
              <li>Hysteresis + 3 readings to switch</li>
              <li>Fault check: no signal, stuck, noisy</li>
              <li>Settings kept in flash</li>
            </ul>
            <div className="arch__states" aria-label="Board states">
              {STATES.map((s) => (
                <span key={s} className={s === 'RUNNING' ? 'is-on' : ''}>
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="arch__link">
            <div className="arch__wire arch__wire--long" aria-hidden="true">
              <span className="arch__packet" />
              <span className="arch__packet arch__packet--2" />
              <span className="arch__packet arch__packet--back" />
            </div>
            <span className="arch__link-label">USB serial · 115200 baud</span>
            <code className="arch__frame">
              {`{"v":2,"seq":${seq},"spot":${spotCm},"taken":true}`}
            </code>
            <span className="arch__link-label arch__link-label--back">← SET · CAL · MOCK · GET</span>
          </div>
          <div className="arch__node arch__node--app">
            <h3>Web app</h3>
            <ul>
              <li>Web Serial link with auto-reconnect</li>
              <li>Watchdog for a silent board</li>
              <li>Dijkstra router on the lane graph</li>
              <li>Driver phone view and live lot map</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ov-section ov-split">
        <div>
          <h2>The hardware</h2>
          <p className="ov-section__lead">Everything is powered from the board's VIN pin; nothing runs from 3V3.</p>
          <table className="ov-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Connected to</th>
                <th>Job</th>
              </tr>
            </thead>
            <tbody>
              {PARTS.map((p) => (
                <tr key={p.part + p.pin}>
                  <td>{p.part}</td>
                  <td className="mono">{p.pin}</td>
                  <td>{p.job}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a className="ov-link" href={`${DOCS}/HARDWARE.md`} target="_blank" rel="noreferrer">
            Full wiring guide →
          </a>
        </div>
        <div>
          <h2>Tested on every push</h2>
          <p className="ov-section__lead">GitHub Actions runs the whole suite on each commit, including a full ESP32 compile.</p>
          <div className="ov-quality">
            {QUALITY.map((q) => (
              <a key={q.label} href={q.href} target="_blank" rel="noreferrer">
                <strong className="num">{q.value}</strong>
                <span>{q.label}</span>
                <small>{q.note}</small>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="ov-foot">
        <div>
          <strong>Smart Parking Lot</strong>
          <span>Ido Tal · Aviv Elimelech · Harry Cohen</span>
          <span>Technion ICST IoT lab · instructor Itai Dabran</span>
        </div>
        <nav aria-label="Project documents">
          <a href={`${DOCS}/USER_GUIDE.md`} target="_blank" rel="noreferrer">
            User guide
          </a>
          <a href={`${DOCS}/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
            Architecture
          </a>
          <a href={`${DOCS}/STATE_MACHINE.md`} target="_blank" rel="noreferrer">
            State machine
          </a>
          <a href={REPO} target="_blank" rel="noreferrer">
            Source code
          </a>
        </nav>
      </footer>
    </div>
  );
}
