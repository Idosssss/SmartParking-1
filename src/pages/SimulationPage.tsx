import { useEffect, useMemo, useRef, useState } from 'react';
import type { CheckResult } from '../sim/checks';
import type { Comparison, DetailSeries } from '../sim/engine';
import type { StudyResult } from '../sim/experiments';
import { DEFAULT_PARAMS } from '../sim/params';
import { headlineCharts, shareFarther, studyCharts } from '../sim/studyCharts';
import type { LiveMessage, LiveRequest } from '../sim/worker';
import TrafficSection from './TrafficSection';
import Walkthrough from './Walkthrough';
import './SimulationPage.css';

interface Published {
  checks: CheckResult[];
  study: StudyResult;
}

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const REPO_URL = 'https://github.com/Idosssss/SmartParking-1';

/** An SVG chart that draws itself in (lines trace, bars grow) the first time it scrolls into view. */
function Chart({ svg }: { svg: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('can-animate');
    el.classList.remove('is-visible');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('is-visible');
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [svg]);
  return <div ref={ref} className="sim-chart" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Figure({ title, svg, children }: { title: string; svg: string; children: React.ReactNode }) {
  return (
    <figure className="sim-figure">
      <h3>{title}</h3>
      <Chart svg={svg} />
      <figcaption>{children}</figcaption>
    </figure>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="sim-stat">
      <div className="sim-stat__value">{value}</div>
      <div className="sim-stat__label">{label}</div>
      {sub && <div className="sim-stat__sub">{sub}</div>}
    </div>
  );
}

export default function SimulationPage() {
  const [data, setData] = useState<Published | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}simulation-results.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: Published) => setData(json))
      .catch((e: Error) => setError(e.message));
  }, []);

  const charts = useMemo(() => (data ? studyCharts(data.study) : null), [data]);

  return (
    <div className="sim">
      <header className="sim-hero">
        <h1>Simulation study</h1>
        <p className="sim-lead">
          How much driving does the app save? We simulated thousands of days in a lot twice: once with every driver searching on their own, once with every driver routed by the app
          (Dijkstra's shortest path to the nearest free spot). Same cars, same arrival times, same parking durations; only the way a spot is found changes.
        </p>
        {data && <HeroStats study={data.study} />}
        <div className="sim-hero__links">
          <a className="sim-btn" href={`${import.meta.env.BASE_URL}Smart-Parking-Simulation-Report.pdf`} target="_blank" rel="noreferrer">
            Download the full PDF report
          </a>
          <a className="sim-btn sim-btn--ghost" href={`${REPO_URL}/tree/main/src/sim`} target="_blank" rel="noreferrer">
            Source code
          </a>
        </div>
        {error && <p className="sim-error">Could not load the published results ({error}). Run <code>npm run simulate</code> to create them. The walkthrough and live run below still work.</p>}
        {!data && !error && (
          <div className="sim-skeleton" aria-label="Loading the published results">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <i />
                <b />
              </div>
            ))}
          </div>
        )}
      </header>

      <section className="sim-section">
        <h2>See how one car is handled</h2>
        <p className="sim-muted">
          Everything below is built from this one idea, repeated hundreds of thousands of times. Pick how full the lot is, then watch a driver without the app search, and
          watch Dijkstra work out the best route.
        </p>
        <Walkthrough />
      </section>

      {data && charts && <PublishedResults study={data.study} charts={charts} checks={data.checks} />}

      <TrafficSection />

      <LivePanel />
    </div>
  );
}

function HeroStats({ study }: { study: StudyResult }) {
  const c = study.headline.comparison;
  const big = study.lotSize[study.lotSize.length - 1];
  return (
    <div className="sim-stats">
      <Stat value={pct(c.reduction.pct)} label="less driving to find a spot" sub={`95% CI ${pct(c.reduction.lo)} to ${pct(c.reduction.hi)} · our 32-spot lot vs. a methodical driver`} />
      <Stat value={`${c.baseline.searchMetersPerCar.toFixed(1)} → ${c.app.searchMetersPerCar.toFixed(1)} m`} label="average drive per car, no app → app" sub={`${c.days.toLocaleString()} simulated days · ${(c.carsParkedPerDay).toFixed(0)} cars a day`} />
      <Stat value={pct(study.baselineKind[1].reduction, 0)} label="less driving vs. a wandering driver" sub="drivers who take random turns until they see a free spot" />
      <Stat value={pct(big.reduction, 0)} label={`less driving in a ${big.spots}-spot lot`} sub={`${big.savedKmPerDay.toFixed(0)} km of driving removed per day`} />
    </div>
  );
}

function PublishedResults({ study, charts, checks }: { study: StudyResult; charts: Record<string, string>; checks: CheckResult[] }) {
  const c = study.headline.comparison;
  const L = c.params.cellMeters;
  const peak = study.headline.detail.shadow[study.headline.detail.shadow.length - 1];
  const ratio = (a: number, b: number) => (a / b).toFixed(1);
  const lo = study.lotSize[0];
  const hi = study.lotSize[study.lotSize.length - 1];
  return (
    <>
      <section className="sim-section">
        <h2>The setup</h2>
        <div className="sim-grid sim-grid--2">
          <Figure title="A busy weekday at our 32-spot lot" svg={charts.arrivals}>
            Cars arrive following a typical weekday pattern: a morning rush, a plateau through midday, a slow tail. Each car stays about {DEFAULT_PARAMS.meanDwellMin} minutes on average (with a long tail
            of short and long stays). That is about {c.carsParkedPerDay.toFixed(0)} cars per day.
          </Figure>
          <Figure title="How full the lot gets" svg={charts.occupancy} >
            The same demand fills the lot to about {Math.round(Math.max(...study.headline.detail.occupancy.map((o) => o.mean)) / study.meta.spots * 100)}% on average at the peak, and on a typical day around {c.carsBlockedPerDay.toFixed(0)} cars
            arrive when it is completely full. The app helps most when spots are scarce, so this is a realistic, not an extreme, scenario.
          </Figure>
        </div>
      </section>

      <section className="sim-section">
        <h2>The result</h2>
        <div className="sim-grid sim-grid--2">
          <Figure title="Driving from the entrance to a spot" svg={charts.headline}>
            Without the app a car drives {c.baseline.searchMetersPerCar.toFixed(1)} m on average; with it, {c.app.searchMetersPerCar.toFixed(1)} m, a reduction of {pct(c.reduction.pct)} (95% CI {pct(c.reduction.lo)}
            {' to '}{pct(c.reduction.hi)}). The unlucky cars gain most: the 1-in-100 worst search drops from {c.baseline.p99Meters.toFixed(0)} m to {c.app.p99Meters.toFixed(0)} m.
          </Figure>
          <Figure title="How many cars drive far" svg={charts.tail}>
            Share of cars that drive farther than a given distance. Without the app, {pct(shareFarther(study.headline.detail, 50, 'baseline'), 1)} of cars drive more than 50 m before parking; with it, {pct(shareFarther(study.headline.detail, 50, 'app'), 1)}. The saving comes from
            the unlucky cars that search a long way, not from every car driving a little less: the median car drives the same {c.app.p50Meters.toFixed(1)} m either way.
          </Figure>
        </div>
        <div className="sim-grid sim-grid--2">
          <Figure title="The fuller the lot, the more the app saves" svg={charts.byOccupancy}>
            For cars arriving at the same lot state, the gap opens as the lot fills: {peak.baselineMeters.toFixed(0)} m without the app against {peak.appMeters.toFixed(0)} m with it when the lot is almost full. With plenty of
            free spots near the entrance, nobody needs help.
          </Figure>
          <Figure title="Through the day" svg={charts.byHour}>
            The saving follows the rush hours: the busier the lot, the longer an unaided driver searches. Early in the morning, when the lot is empty, both lines are the same.
          </Figure>
        </div>
      </section>

      <section className="sim-section">
        <h2>Would this work in a real lot?</h2>
        <p className="sim-muted">
          Our prototype lot has only {lo.spots} spots, so the absolute numbers are small. The same simulation with the same pattern at larger sizes shows what to expect in a real lot (demand scales with the number of spots).
        </p>
        <div className="sim-grid sim-grid--2">
          <Figure title="Bigger lot, bigger saving" svg={charts.lotSizeReduction}>
            A driver can only see about {(c.params.sightCells * L).toFixed(0)} m ahead. In a small lot that is a large part of the lot; in a big one it is a small part, so unaided drivers search for longer. The share of driving
            the app removes grows from {pct(lo.reduction, 0)} at {lo.spots} spots to {pct(hi.reduction, 0)} at {hi.spots} spots.
          </Figure>
          <Figure title="Kilometres saved per day" svg={charts.lotSizeSaved}>
            Savings grow faster than lot size because there are both more cars and more searching per car: {hi.savedKmPerDay.toFixed(0)} km of driving per day at {hi.spots} spots, about {ratio(hi.savedKmPerDay, lo.savedKmPerDay)}× the {lo.spots}-spot lot.
          </Figure>
        </div>
        <div className="sim-grid sim-grid--2">
          <Figure title="Average drive per car by lot size" svg={charts.lotSizeMeters}>
            Both grow with the size of the lot (more cars fill the nearest spots, so the nearest free one is farther away), but the unaided drive grows much faster: {lo.baselineMeters.toFixed(0)} → {hi.baselineMeters.toFixed(0)} m without the app, {lo.appMeters.toFixed(0)} → {hi.appMeters.toFixed(0)} m with it.
          </Figure>
          <Figure title="What if only some drivers use it?" svg={charts.adoption}>
            Even partial adoption helps: with one driver in ten on the app the lot gets {pct(study.adoption.find((a) => a.x === 10)!.reduction)} less driving, with half {pct(study.adoption.find((a) => a.x === 50)!.reduction)}, with everyone {pct(c.reduction.pct)}. The curve bends, so the first adopters gain the most. The app may also help drivers who do not use it, by filling spots from the entrance outwards.
          </Figure>
        </div>
      </section>

      <section className="sim-section">
        <h2>How sure are we?</h2>
        <div className="sim-grid sim-grid--2">
          <Figure title="The estimate settles quickly" svg={charts.convergence}>
            The running estimate after n simulated days. It has stopped moving long before the {c.days.toLocaleString()} days we ran, so more days would not change the answer.
          </Figure>
          <Figure title="It depends on how the other drivers behave" svg={charts.baselineKind}>
            The headline compares with a methodical driver who sees down the aisle and never re-checks a place. Against a driver who just follows the lanes and takes the first free spot, the app removes {pct(study.baselineKind[1].reduction, 0)} of the driving.
          </Figure>
        </div>
        <div className="sim-grid sim-grid--3">
          <Figure title="Driver's view distance" svg={charts.sight}>
            If drivers could see the whole lot, the app would not be needed. The shorter their view, the more it saves.
          </Figure>
          <Figure title="Demand" svg={charts.demand}>
            More cars per spot means fewer free spots to find and more searching.
          </Figure>
          <Figure title="Parking duration" svg={charts.dwell}>
            Longer stays keep the lot fuller, which raises the saving.
          </Figure>
        </div>
      </section>

      <section className="sim-section">
        <h2>Method and checks</h2>
        <ul className="sim-list">
          <li>
            <b>Model.</b> The real lot layout (32 spots, one entrance). A car's trip is measured in lane cells of {L} m; the app's route is Dijkstra's shortest path to the nearest free spot. On this grid every move costs the same, so
            it equals the breadth-first search in the app's router; a check below confirms they pick the same spot every time.
          </li>
          <li>
            <b>Without the app.</b> The driver looks down the aisle ({(c.params.sightCells * L).toFixed(1)} m), takes the nearest free spot in view, otherwise drives to the nearest unvisited part of the lot. This is deliberately a strong
            driver, so the saving is a conservative estimate.
          </li>
          <li>
            <b>Statistics.</b> {c.days.toLocaleString()} independent days; every day is simulated for both policies with identical cars, so the comparison is paired. Confidence intervals come from a bootstrap over days.
          </li>
          <li>
            <b>Limits.</b> The saving is search driving only (entrance to spot). Drivers who choose a spot by walking distance to a destination and the app's own latency are not modelled. Traffic inside the lot (queues at the entrance, cars blocking a lane while they park) is studied separately in the next section. Absolute kilometres depend on the assumed cell size; percentages do not.
          </li>
        </ul>
        <div className="sim-checks">
          {checks.map((ch) => (
            <div key={ch.name} className={ch.passed ? 'is-pass' : 'is-fail'}>
              <b>{ch.passed ? 'PASS' : 'FAIL'}</b> {ch.name}
              <span>{ch.detail}</span>
            </div>
          ))}
        </div>
        <p className="sim-muted">
          Reproduce every number: <code>npm run simulate</code> (seed {study.meta.seed}, {study.meta.headlineDays.toLocaleString()} headline days).
        </p>
      </section>
    </>
  );
}

function LivePanel() {
  const [days, setDays] = useState(200);
  const [seed, setSeed] = useState(2026);
  const [sightM, setSightM] = useState(14.4);
  const [driver, setDriver] = useState<'explorer' | 'wanderer'>('explorer');
  const [demand, setDemand] = useState(1);
  const [lotKey, setLotKey] = useState('2x9');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ comparison: Comparison; detail: DetailSeries; spots: number } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const run = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setRunning(true);
    setProgress(0);
    setLiveError(null);
    const [blocks, cols] = lotKey.split('x').map(Number);
    const params = { ...DEFAULT_PARAMS, baseline: driver, demandScale: demand, sightCells: Math.max(1, Math.round(sightM / DEFAULT_PARAMS.cellMeters)) };
    const req: LiveRequest = { params, days, seed, blocks, cols };
    w.onmessage = (e: MessageEvent<LiveMessage>) => {
      const msg = e.data;
      if (msg.kind === 'progress') setProgress(msg.done / msg.total);
      else if (msg.kind === 'result') {
        setResult({ comparison: msg.comparison, detail: msg.detail, spots: msg.spots });
        setRunning(false);
        w.terminate();
      } else {
        setLiveError(msg.message);
        setRunning(false);
        w.terminate();
      }
    };
    w.postMessage(req);
  };

  const live = useMemo(() => (result ? headlineCharts(result.comparison, result.detail, result.spots) : null), [result]);

  return (
    <section className="sim-section">
      <h2>Run it yourself</h2>
      <p className="sim-muted">Change the assumptions and run the same simulation right here in your browser. The same seed always gives the same numbers.</p>
      <div className="sim-live">
        <label>
          Simulated days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[50, 200, 500, 1000, 2000].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Lot size
          <select value={lotKey} onChange={(e) => setLotKey(e.target.value)}>
            <option value="2x9">32 spots (our lot)</option>
            <option value="2x17">64 spots</option>
            <option value="4x17">128 spots</option>
            <option value="6x25">288 spots</option>
          </select>
        </label>
        <label>
          Drivers without the app
          <select value={driver} onChange={(e) => setDriver(e.target.value as 'explorer' | 'wanderer')}>
            <option value="explorer">Methodical</option>
            <option value="wanderer">Wandering</option>
          </select>
        </label>
        <label>
          How far they can see: {sightM.toFixed(1)} m
          <input type="range" min={3.6} max={28.8} step={3.6} value={sightM} onChange={(e) => setSightM(Number(e.target.value))} />
        </label>
        <label>
          Demand: {demand.toFixed(1)}×
          <input type="range" min={0.4} max={1.6} step={0.2} value={demand} onChange={(e) => setDemand(Number(e.target.value))} />
        </label>
        <label>
          Seed
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
        </label>
        <button className="sim-btn" onClick={run} disabled={running}>
          {running ? `Running ${Math.round(progress * 100)}%` : 'Run simulation'}
        </button>
      </div>
      {liveError && <p className="sim-error">{liveError}</p>}
      {result && live && (
        <>
          <div className="sim-stats">
            <Stat value={pct(result.comparison.reduction.pct)} label="less driving to find a spot" sub={`95% CI ${pct(result.comparison.reduction.lo)} to ${pct(result.comparison.reduction.hi)}`} />
            <Stat value={`${result.comparison.baseline.searchMetersPerCar.toFixed(1)} → ${result.comparison.app.searchMetersPerCar.toFixed(1)} m`} label="average drive per car" sub={`${result.comparison.days.toLocaleString()} days · ${result.comparison.carsParkedPerDay.toFixed(0)} cars a day`} />
            <Stat value={`${result.comparison.savedKmPerDay.mean.toFixed(2)} km`} label="driving saved per day" sub={`95% CI ${result.comparison.savedKmPerDay.lo.toFixed(2)} to ${result.comparison.savedKmPerDay.hi.toFixed(2)}`} />
          </div>
          <div className="sim-grid sim-grid--2">
            <Figure title="Driving from the entrance to a spot" svg={live.headline}>
              Average, median and the unluckiest cars, with and without the app, for the settings above.
            </Figure>
            <Figure title="How many cars drive far" svg={live.tail}>
              Share of cars that drove farther than a given distance before parking.
            </Figure>
          </div>
        </>
      )}
    </section>
  );
}
