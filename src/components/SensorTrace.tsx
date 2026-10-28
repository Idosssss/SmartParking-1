import { useState } from 'react';
import { SENSOR_FAR_CM } from '../config/constants';
import type { Hardware } from '../hardware/useHardware';
import { downloadCsv } from './downloadCsv';
import './SensorTrace.css';

/** About 30 s of history at the board's ~150 ms frame rate. */
const MAX_SAMPLES = 200;
const W = 560;
const H = 180;
const M = { l: 34, r: 10, t: 10, b: 22 };

interface Sample {
  at: number;
  entranceCm: number;
  spotCm: number;
  car: boolean;
  taken: boolean;
}

const y = (cm: number) => M.t + (1 - Math.min(cm, SENSOR_FAR_CM) / SENSOR_FAR_CM) * (H - M.t - M.b);
const x = (i: number) => M.l + (i / (MAX_SAMPLES - 1)) * (W - M.l - M.r);

function line(samples: Sample[], pick: (s: Sample) => number): string {
  const offset = MAX_SAMPLES - samples.length; // new samples enter on the right
  return samples.map((s, i) => `${x(i + offset).toFixed(1)},${y(pick(s)).toFixed(1)}`).join(' ');
}

/** Stretches of the trace where a sensor said "yes", drawn as soft bands behind the lines. */
function bands(samples: Sample[], pick: (s: Sample) => boolean): [number, number][] {
  const offset = MAX_SAMPLES - samples.length;
  const out: [number, number][] = [];
  let start = -1;
  samples.forEach((s, i) => {
    if (pick(s) && start < 0) start = i;
    if ((!pick(s) || i === samples.length - 1) && start >= 0) {
      out.push([x(start + offset), x((pick(s) ? i : i - 1) + offset)]);
      start = -1;
    }
  });
  return out;
}

/**
 * The last half minute of both distance sensors, live, with their trigger distances.
 * The lines are what the board measured; the shaded stretches are what it decided.
 */
export default function SensorTrace({ hw }: { hw: Hardware }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [seen, setSeen] = useState(hw.reading);
  const [paused, setPaused] = useState(false);

  // A new reading object means a new sample from the board (or the emulator).
  if (hw.reading !== seen) {
    setSeen(hw.reading);
    const r = hw.reading;
    if (r && !paused) {
      const sample = { entranceCm: r.entranceCm, spotCm: r.spotCm, car: hw.entranceDetected, taken: hw.spotOccupied };
      setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), { ...sample, at: Date.now() }]);
    }
  }

  if (!hw.active) {
    return (
      <div className="trace trace--empty">
        <div className="trace__head">
          <h2>Live sensor readings</h2>
        </div>
        <div className="trace__placeholder">
          <svg viewBox="0 0 220 60" aria-hidden="true">
            <polyline points="0,44 30,44 42,18 54,44 96,44 108,26 120,44 160,44 172,12 184,44 220,44" />
          </svg>
          <p>Connect the board, or turn on the emulator, to watch both IR sensors here as they measure.</p>
          <button className="btn" onClick={() => hw.emulator.setOn(true)}>
            Turn on the emulator
          </button>
        </div>
      </div>
    );
  }

  const last = samples[samples.length - 1];
  const rate =
    samples.length > 10 ? (samples.length - 1) / ((samples[samples.length - 1].at - samples[0].at) / 1000) : null;

  const exportCsv = () =>
    downloadCsv(`sensor-readings-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`, [
      ['time_iso', 'entrance_cm', 'spot_cm', 'car_at_entrance', 'spot_taken'],
      ...samples.map((s) => [new Date(s.at).toISOString(), s.entranceCm.toFixed(1), s.spotCm.toFixed(1), s.car ? 1 : 0, s.taken ? 1 : 0]),
    ]);

  return (
    <div className="trace">
      <div className="trace__head">
        <h2>Live sensor readings</h2>
        <div className="trace__tools">
          <span className="trace__rate">{rate ? `${rate.toFixed(1)} samples/s` : 'collecting…'}</span>
          <button className="btn btn--small" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn btn--small" onClick={exportCsv} disabled={samples.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="trace__legend">
        <span className="trace__key trace__key--entrance">
          Entrance D34 <strong className="num">{last ? `${last.entranceCm.toFixed(1)} cm` : '—'}</strong>
        </span>
        <span className="trace__key trace__key--spot">
          Spot D35 <strong className="num">{last ? `${last.spotCm.toFixed(1)} cm` : '—'}</strong>
        </span>
        <span className="trace__key trace__key--band">Shaded: board says car / taken</span>
      </div>

      <svg className="trace__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={last ? `Entrance ${last.entranceCm.toFixed(0)} cm, spot ${last.spotCm.toFixed(0)} cm` : 'Waiting for data'}>
        {[0, 20, 40, 60, 80].map((cm) => (
          <g key={cm}>
            <line className="trace__grid" x1={M.l} x2={W - M.r} y1={y(cm)} y2={y(cm)} />
            <text className="trace__tick" x={M.l - 6} y={y(cm) + 4} textAnchor="end">
              {cm}
            </text>
          </g>
        ))}
        <text className="trace__tick" x={W - M.r} y={H - 6} textAnchor="end">
          now
        </text>
        <text className="trace__tick" x={M.l} y={H - 6}>
          −30 s
        </text>

        {bands(samples, (s) => s.car).map(([a, b]) => (
          <rect key={`c${a}`} className="trace__band trace__band--entrance" x={a} width={Math.max(b - a, 2)} y={M.t} height={H - M.t - M.b} />
        ))}
        {bands(samples, (s) => s.taken).map(([a, b]) => (
          <rect key={`t${a}`} className="trace__band trace__band--spot" x={a} width={Math.max(b - a, 2)} y={M.t} height={H - M.t - M.b} />
        ))}

        <line className="trace__threshold trace__threshold--entrance" x1={M.l} x2={W - M.r} y1={y(hw.entranceThresholdCm)} y2={y(hw.entranceThresholdCm)} />
        <line className="trace__threshold trace__threshold--spot" x1={M.l} x2={W - M.r} y1={y(hw.spotThresholdCm)} y2={y(hw.spotThresholdCm)} />

        {samples.length > 1 && (
          <>
            <polyline className="trace__line trace__line--entrance" points={line(samples, (s) => s.entranceCm)} />
            <polyline className="trace__line trace__line--spot" points={line(samples, (s) => s.spotCm)} />
          </>
        )}
        {last && (
          <>
            <circle className="trace__head-dot trace__head-dot--entrance" cx={x(MAX_SAMPLES - 1)} cy={y(last.entranceCm)} r={3.5} />
            <circle className="trace__head-dot trace__head-dot--spot" cx={x(MAX_SAMPLES - 1)} cy={y(last.spotCm)} r={3.5} />
          </>
        )}
      </svg>
      <p className="trace__note">
        Distance in cm, closer is lower. Dashed lines are the trigger distances: a car must stay below one for three readings in a row to count.
      </p>
    </div>
  );
}
