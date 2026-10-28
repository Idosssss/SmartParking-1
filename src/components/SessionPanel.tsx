import { useEffect, useState } from 'react';
import { DEFAULT_PARAMS } from '../sim/params';
import type { ActivityEntry } from './ActivityFeed';
import { downloadCsv } from './downloadCsv';
import { useCountUp } from './useCountUp';
import './SessionPanel.css';

export interface SessionStats {
  startedAt: number;
  trips: number;
  /** Lane cells driven by guided cars, entrance to spot, including the part before a reroute. */
  drivenCells: number;
  reroutes: number;
  sensorConfirmed: number;
}

interface SessionPanelProps {
  stats: SessionStats;
  occupied: number;
  total: number;
  activity: ActivityEntry[];
}

const W = 560;
const H = 120;
const M = { l: 34, r: 12, t: 8, b: 20 };
/** One lane cell of the demo lot, in metres (the same scale the simulation study uses). */
const CELL_METERS = DEFAULT_PARAMS.cellMeters;

function clockTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function duration(ms: number) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return min > 0 ? `${min} min ${sec.toString().padStart(2, '0')} s` : `${sec} s`;
}

/** What happened since the page was opened: cars guided, how far they drove, and the lot filling up. */
export default function SessionPanel({ stats, occupied, total, activity }: SessionPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<{ at: number; occupied: number }[]>(() => [{ at: stats.startedAt, occupied }]);
  const [seen, setSeen] = useState(occupied);

  if (occupied !== seen) {
    setSeen(occupied);
    setHistory((h) => [...h.slice(-499), { at: Date.now(), occupied }]);
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const avgMeters = stats.trips === 0 ? 0 : Math.round((stats.drivenCells * CELL_METERS) / stats.trips);
  const trips = useCountUp(stats.trips);
  const meters = useCountUp(avgMeters);
  const reroutes = useCountUp(stats.reroutes);
  const confirmed = useCountUp(stats.sensorConfirmed);

  // Occupancy as a step line from the start of the session to now.
  const span = Math.max(now - stats.startedAt, 60_000);
  const sx = (at: number) => M.l + ((at - stats.startedAt) / span) * (W - M.l - M.r);
  const sy = (n: number) => M.t + (1 - n / Math.max(total, 1)) * (H - M.t - M.b);
  let d = '';
  history.forEach((p, i) => {
    d += i === 0 ? `M${sx(p.at).toFixed(1)},${sy(p.occupied).toFixed(1)}` : `H${sx(p.at).toFixed(1)}V${sy(p.occupied).toFixed(1)}`;
  });
  d += `H${sx(now).toFixed(1)}`;
  const area = `${d}V${sy(0)}H${sx(stats.startedAt)}Z`;
  const peak = Math.max(...history.map((p) => p.occupied));

  const exportCsv = () =>
    downloadCsv(`parking-session-${new Date(stats.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`, [
      ['summary', 'value'],
      ['session_started', new Date(stats.startedAt).toISOString()],
      ['cars_guided', stats.trips],
      ['average_drive_m', avgMeters],
      ['reroutes', stats.reroutes],
      ['sensor_confirmed_parks', stats.sensorConfirmed],
      ['occupied_now', `${occupied}/${total}`],
      [],
      ['time', 'kind', 'event'],
      ...[...activity].reverse().map((e) => [e.time, e.kind, e.text]),
    ]);

  return (
    <div className="session">
      <div className="session__head">
        <div>
          <h2>This session</h2>
          <span className="session__meta">
            Since {clockTime(stats.startedAt)} · {duration(now - stats.startedAt)}
          </span>
        </div>
        <button className="btn btn--small" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <dl className="session__stats">
        <div>
          <dt>Cars guided</dt>
          <dd className="num">{trips}</dd>
        </div>
        <div>
          <dt>Average drive</dt>
          <dd className="num">
            {stats.trips === 0 ? '—' : meters}
            {stats.trips > 0 && <small> m</small>}
          </dd>
        </div>
        <div>
          <dt>Reroutes</dt>
          <dd className="num">{reroutes}</dd>
        </div>
        <div>
          <dt>Sensor confirmed</dt>
          <dd className="num">{confirmed}</dd>
        </div>
      </dl>

      <div className="session__chart-head">
        <span>Occupied spots over time</span>
        <span className="num">
          now {occupied} of {total} · peak {peak}
        </span>
      </div>
      <svg className="session__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Occupancy: ${occupied} of ${total} spots taken, peak ${peak}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="session__grid" x1={M.l} x2={W - M.r} y1={sy(total * f)} y2={sy(total * f)} />
            <text className="session__tick" x={M.l - 6} y={sy(total * f) + 4} textAnchor="end">
              {Math.round(total * f)}
            </text>
          </g>
        ))}
        <path className="session__area" d={area} />
        <path className="session__line" d={d} />
        <circle className="session__dot" cx={sx(now)} cy={sy(occupied)} r={3.5} />
        <text className="session__tick" x={M.l} y={H - 4}>
          {clockTime(stats.startedAt)}
        </text>
        <text className="session__tick" x={W - M.r} y={H - 4} textAnchor="end">
          now
        </text>
      </svg>
    </div>
  );
}
