import { useEffect, useMemo, useState } from 'react';
import { generateLot } from '../lot/generateLot';
import { COLORS, lotMap } from '../sim/charts';
import { buildExample, illustrativeSeed } from '../sim/experiments';
import { buildLotGraph } from '../sim/graph';
import { DEFAULT_PARAMS } from '../sim/params';

type Tab = 'none' | 'app' | 'both';

/** Step-by-step view of ONE arriving car: how a driver without the app searches vs. how Dijkstra routes it. */
export default function Walkthrough() {
  const g = useMemo(() => buildLotGraph(generateLot()), []);
  const [taken, setTaken] = useState(24);
  const [seed, setSeed] = useState(() => illustrativeSeed(g, DEFAULT_PARAMS, 24, 3));
  const [tab, setTab] = useState<Tab>('none');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const L = DEFAULT_PARAMS.cellMeters;
  const ex = useMemo(() => buildExample(g, DEFAULT_PARAMS, seed, taken), [g, seed, taken]);

  const explorerSteps = ex.explorerPath.length; // moves along the lane, +1 for the turn into the spot
  const dijkstraSteps = ex.settleOrder.length;
  const maxStep = tab === 'none' ? explorerSteps : tab === 'app' ? dijkstraSteps : 0;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= maxStep) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, tab === 'app' ? 260 : 380);
    return () => clearInterval(id);
  }, [playing, maxStep, tab]);

  const reset = (next: Partial<{ tab: Tab; taken: number; seed: number }>) => {
    if (next.tab !== undefined) setTab(next.tab);
    if (next.taken !== undefined) setTaken(next.taken);
    if (next.seed !== undefined) setSeed(next.seed);
    setStep(0);
    setPlaying(false);
  };

  const svg = useMemo(() => {
    if (tab === 'none') {
      const done = step >= explorerSteps;
      const nodes = ex.explorerPath.slice(0, Math.min(step + 1, ex.explorerPath.length));
      return lotMap(g, {
        occupied: ex.occupied,
        routes: [{ nodes, endSpot: done ? ex.explorerSpot : undefined, color: COLORS.base, width: 4.5, label: 'Driver without the app' }],
        highlight: done ? [{ spot: ex.explorerSpot, color: COLORS.base }] : [],
      });
    }
    if (tab === 'app') {
      const settled = new Set(ex.settleOrder.slice(0, step));
      const numbers = ex.distFromEntrance.map((d, i) => (settled.has(i) ? d : ''));
      const done = step >= dijkstraSteps;
      return lotMap(g, {
        occupied: ex.occupied,
        laneNumbers: numbers,
        showIds: false,
        routes: done ? [{ nodes: ex.appPath, endSpot: ex.appSpot, color: COLORS.app, width: 4.5, label: 'Route chosen by the app' }] : [],
        highlight: done ? [{ spot: ex.appSpot, color: COLORS.app }] : [],
      });
    }
    return lotMap(g, {
      occupied: ex.occupied,
      routes: [
        { nodes: ex.explorerPath, endSpot: ex.explorerSpot, color: COLORS.base, width: 4, dashed: true, label: `No app: ${(ex.explorerCells * L).toFixed(1)} m` },
        { nodes: ex.appPath, endSpot: ex.appSpot, color: COLORS.app, width: 4.5, label: `With app: ${(ex.appCells * L).toFixed(1)} m` },
      ],
    });
  }, [g, ex, tab, step, explorerSteps, dijkstraSteps, L]);

  const saved = ex.explorerCells - ex.appCells;
  let text: string;
  if (tab === 'none') {
    const cells = Math.min(step, ex.explorerCells);
    text =
      step === 0
        ? 'The driver enters at IN. They cannot see which spots are free beyond what is in front of them (about 14 m down the aisle), so they look, and if nothing is free in sight they drive to the nearest part of the lot they have not looked at yet.'
        : step >= explorerSteps
          ? `Found ${g.spots[ex.explorerSpot].id} after driving ${(ex.explorerCells * L).toFixed(1)} m (${ex.explorerCells} cells). Press Play to watch it again.`
          : `Driven so far: ${(cells * L).toFixed(1)} m. Looking down the aisle, nothing free in sight yet, so they keep going.`;
  } else if (tab === 'app') {
    const last = ex.settleOrder[Math.max(step - 1, 0)];
    text =
      step === 0
        ? 'The sensors tell the app which spots are free. Dijkstra starts at the entrance (distance 0) and repeatedly settles the closest lane cell it has not finished, writing down the shortest distance to it. Press Step or Play.'
        : step >= dijkstraSteps
          ? `All ${dijkstraSteps} lane cells have their shortest distance. The nearest free spot is ${g.spots[ex.appSpot].id}: ${ex.appCells} cells (${(ex.appCells * L).toFixed(1)} m), and the route follows the cells with the lowest numbers back to the entrance.`
          : `Settled lane cell #${step} at distance ${ex.distFromEntrance[last]} (${(ex.distFromEntrance[last] * L).toFixed(1)} m from the entrance). Cells settle in increasing distance, so each number is final the moment it appears.`;
  } else {
    text =
      saved > 0
        ? `For this arrival the app saves ${saved} cells = ${(saved * L).toFixed(1)} m (${((saved / ex.explorerCells) * 100).toFixed(0)}% of the drive). The simulation repeats this for every car on every simulated day and adds it all up.`
        : 'For this arrival both reach the same spot by the same distance: when the closest spots are free the driver finds them just as fast. The app only wins when the close spots are taken, so try a fuller lot.';
  }

  return (
    <div className="sim-walk">
      <div className="sim-walk__controls">
        <div className="sim-tabs" role="tablist">
          {(
            [
              ['none', '1  Without the app'],
              ['app', '2  With the app (Dijkstra)'],
              ['both', '3  Compare'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => reset({ tab: id })}>
              {label}
            </button>
          ))}
        </div>
        <label className="sim-slider">
          <span>
            Lot is <b>{Math.round((taken / g.spots.length) * 100)}%</b> full ({taken} of {g.spots.length} spots taken)
          </span>
          <input type="range" min={0} max={g.spots.length - 1} value={taken} onChange={(e) => reset({ taken: Number(e.target.value) })} />
        </label>
        <button className="sim-btn sim-btn--ghost" onClick={() => reset({ seed: seed + 1 })}>
          New random lot
        </button>
      </div>

      <div className="sim-walk__body">
        <div className="sim-walk__map" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="sim-walk__side">
          <p className="sim-walk__text">{text}</p>
          {tab !== 'both' && (
            <div className="sim-walk__steps">
              <button className="sim-btn" onClick={() => (step >= maxStep ? (setStep(0), setPlaying(true)) : setPlaying((p) => !p))}>
                {playing ? 'Pause' : step >= maxStep ? 'Replay' : 'Play'}
              </button>
              <button className="sim-btn sim-btn--ghost" disabled={step >= maxStep} onClick={() => setStep((s) => Math.min(s + 1, maxStep))}>
                Step
              </button>
              <button className="sim-btn sim-btn--ghost" onClick={() => reset({})}>
                Reset
              </button>
              <input type="range" min={0} max={maxStep} value={step} onChange={(e) => (setPlaying(false), setStep(Number(e.target.value)))} aria-label="step" />
            </div>
          )}
          <dl className="sim-walk__facts">
            <div>
              <dt>Without the app</dt>
              <dd style={{ color: COLORS.base }}>{(ex.explorerCells * L).toFixed(1)} m</dd>
            </div>
            <div>
              <dt>With the app</dt>
              <dd style={{ color: COLORS.app }}>{(ex.appCells * L).toFixed(1)} m</dd>
            </div>
            <div>
              <dt>Saved on this car</dt>
              <dd>{(saved * L).toFixed(1)} m</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
