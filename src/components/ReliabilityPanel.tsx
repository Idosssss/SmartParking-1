import { useEffect, useState } from 'react';
import type { Hardware } from '../hardware/useHardware';
import Icon from './Icons';
import './ReliabilityPanel.css';

const DOCS = 'https://github.com/Idosssss/SmartParking-1/blob/main/docs/EDGE_CASES.md';

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`rel__status rel__status--${tone}`}>
      <span className="rel__status-dot" />
      {children}
    </span>
  );
}

const FAULT_TEXT: Record<string, string> = {
  none: 'Working',
  no_signal: 'No signal (wire off?)',
  saturated: 'Stuck at maximum',
  noisy: 'Too noisy (loose wire?)',
};

/** What the system does when something goes wrong, and what is happening right now. */
export default function ReliabilityPanel({ hw }: { hw: Hardware }) {
  const [now, setNow] = useState(() => Date.now());
  const connected = hw.serial.status === 'connected';
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [connected]);

  const { device } = hw;
  const age = device.stats.lastDataAt === null ? null : Math.max(now - device.stats.lastDataAt, 0);
  const ignored = Math.max(device.stats.lines - device.stats.messages, 0);

  const connection: [Tone, string] = connected
    ? device.stale
      ? ['bad', 'Connected, but silent']
      : ['ok', 'Connected']
    : hw.serial.status === 'error'
      ? ['bad', 'Lost or busy']
      : hw.source === 'emulator'
        ? ['idle', 'Emulator in use']
        : ['idle', 'Not connected'];

  const rows: { check: string; now: React.ReactNode; handling: string }[] = [
    {
      check: 'USB link',
      now: <Status tone={connection[0]}>{connection[1]}</Status>,
      handling: 'A busy port, a closed picker and a pulled cable each get a clear message; an allowed board reconnects by itself when plugged back in.',
    },
    {
      check: 'Fresh data',
      now: connected ? (
        age === null ? (
          <Status tone="warn">Waiting for the first line</Status>
        ) : (
          <Status tone={device.stale ? 'bad' : 'ok'}>{(age / 1000).toFixed(1)} s ago</Status>
        )
      ) : (
        <Status tone="idle">—</Status>
      ),
      handling: 'No data for 2.5 s pauses detection, so an old "car" or "taken" is never kept on screen. It resumes as soon as data returns.',
    },
    {
      check: 'Bad lines',
      now: connected ? <Status tone={ignored > 0 ? 'warn' : 'ok'}>{ignored} ignored</Status> : <Status tone="idle">—</Status>,
      handling: 'Boot text, half lines and garbage are dropped without errors. The receive buffer is capped.',
    },
    {
      check: 'Entrance sensor',
      now: device.smart ? <Status tone={device.faultEntrance === 'none' ? 'ok' : 'bad'}>{FAULT_TEXT[device.faultEntrance]}</Status> : <Status tone="idle">—</Status>,
      handling: 'The board checks every reading. A sensor stuck at 0, at the top, or full of noise for 3 s is marked faulty, its LEDs blink orange and it can never report a car.',
    },
    {
      check: 'Spot sensor',
      now: device.smart ? <Status tone={device.faultSpot === 'none' ? 'ok' : 'bad'}>{FAULT_TEXT[device.faultSpot]}</Status> : <Status tone="idle">—</Status>,
      handling: 'Same checks as the entrance. 2 cm of hysteresis and 3 readings in a row stop flicker at the trigger distance.',
    },
    {
      check: 'Board mode',
      now: device.smart ? (
        <Status tone={device.state === 'RUNNING' ? 'ok' : device.state === 'SENSOR_FAULT' ? 'bad' : 'warn'}>
          {device.mock ? 'Mock data' : (device.state ?? '…').replace('_', ' ').toLowerCase()}
        </Status>
      ) : (
        <Status tone="idle">—</Status>
      ),
      handling: 'Booting, running, calibrating and sensor fault are one state machine on the board. Mock mode plays a generated car story when no sensors are connected.',
    },
    {
      check: 'Parked cars',
      now: <Status tone="ok">Kept</Status>,
      handling: 'A car confirmed by the real sensor stays parked: moving the sensor, simulated traffic and a silent board never free it.',
    },
    {
      check: 'Settings',
      now: (
        <Status tone="ok">
          {hw.entranceThresholdCm} cm · {hw.spotThresholdCm} cm
        </Status>
      ),
      handling: 'Trigger distances are checked (5-60 cm), saved on the board and in this browser, and survive a power cut. Bad commands are refused with a reason.',
    },
  ];

  return (
    <section className="rel" aria-labelledby="rel-title">
      <div className="rel__head">
        <div>
          <h2 id="rel-title">Reliability</h2>
          <p>What the system does when something goes wrong, and what is happening right now.</p>
        </div>
        <a className="btn" href={DOCS} target="_blank" rel="noreferrer">
          All 33 edge cases
          <Icon name="external" size={12} />
        </a>
      </div>
      <div className="rel__table" role="table" aria-label="Reliability checks">
        <div className="rel__row rel__row--head" role="row">
          <span role="columnheader">Check</span>
          <span role="columnheader">Right now</span>
          <span role="columnheader">How it is handled</span>
        </div>
        {rows.map((r) => (
          <div className="rel__row" role="row" key={r.check}>
            <span role="cell" className="rel__check">
              {r.check}
            </span>
            <span role="cell">{r.now}</span>
            <span role="cell" className="rel__handling">
              {r.handling}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
