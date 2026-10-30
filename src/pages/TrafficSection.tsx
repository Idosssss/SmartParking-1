import { useEffect, useState } from 'react';

/**
 * Two follow-up studies, each from its own published file:
 *   traffic-study.json      second-by-second traffic: reservations and the bottleneck at the entrance
 *   routing-benchmark.json  how BFS, A* and the precomputed index scale with the size of the lot
 * Both are rebuilt with `npm run simulate:traffic` and `npm run bench:routing`.
 */

const REPO_URL = 'https://github.com/Idosssss/SmartParking-1';

interface TrafficRow {
  policy: 'driver' | 'nearest' | 'reserved' | 'balanced';
  cars: number;
  conflictsPer1000: number;
  meanGateToParkedSec: number;
  p95GateToParkedSec: number;
  meanStuckSec: number;
  meanMaxGateQueue: number;
  deadlocks: number;
}
interface TrafficStudy {
  results: { name: string; runs: number; rows: TrafficRow[] }[];
  params: { parkSec: number; leaveSec: number; cellSec: number; aislePenaltyCells: number };
}
interface BenchRow {
  spots: number;
  laneCells: number;
  bfsNearestMs: number;
  indexQueryUs: number;
  bfsRouteMs: number;
  astarRouteMs: number;
  bfsCellsLookedAt: number;
  astarCellsLookedAt: number;
}

const POLICY: Record<TrafficRow['policy'], string> = {
  driver: 'No app (searching driver)',
  nearest: 'App, nearest spot (graded version)',
  reserved: 'App + spot reservation',
  balanced: 'App + reservation + spread over aisles',
};

function useJson<T>(file: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}${file}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: T | null) => setData(json))
      .catch(() => setData(null));
  }, [file]);
  return data;
}

const n0 = (x: number) => Math.round(x).toLocaleString('en');
const n1 = (x: number) => x.toFixed(1);

export default function TrafficSection() {
  const traffic = useJson<TrafficStudy>('traffic-study.json');
  const bench = useJson<{ rows: BenchRow[] }>('routing-benchmark.json');
  if (!traffic && !bench) return null;

  const heavy = traffic?.results[traffic.results.length - 1];
  const graded = heavy?.rows.find((r) => r.policy === 'nearest');
  const best = heavy?.rows.find((r) => r.policy === 'balanced');
  const biggest = bench?.rows[bench.rows.length - 1];

  return (
    <>
      {traffic && heavy && graded && best && (
        <section className="sim-section">
          <h2>Traffic inside the lot: reservations and the entrance bottleneck</h2>
          <p className="sim-muted">
            The study above treats each search as instant. Here every car drives the lanes second by second: a lane cell holds one car each way, turning into a spot takes{' '}
            {traffic.params.parkSec} s and pulling out {traffic.params.leaveSec} s, and meanwhile the car blocks its lane cell. Cars that arrive while the entrance is occupied wait at the gate.
          </p>
          <div className="sim-stats sim-stats--3">
            <div className="sim-stat">
              <div className="sim-stat__value">0</div>
              <div className="sim-stat__label">app drivers sent to a spot another app driver took, once spots are reserved</div>
              <div className="sim-stat__sub">{n0(graded.conflictsPer1000)} per 1,000 cars without reservation, in the heavy rush</div>
            </div>
            <div className="sim-stat">
              <div className="sim-stat__value">
                {n0(graded.meanGateToParkedSec)} → {n0(best.meanGateToParkedSec)} s
              </div>
              <div className="sim-stat__label">average time from the gate to the spot in a heavy rush</div>
              <div className="sim-stat__sub">288 spots, 8 cars a minute; 95% of cars park within {n0(best.p95GateToParkedSec)} s instead of {n0(graded.p95GateToParkedSec)} s</div>
            </div>
            <div className="sim-stat">
              <div className="sim-stat__value">
                {n1(graded.meanMaxGateQueue)} → {n1(best.meanMaxGateQueue)}
              </div>
              <div className="sim-stat__label">longest queue at the gate, cars</div>
              <div className="sim-stat__sub">the bottleneck at the first aisle disappears when the app spreads a rush</div>
            </div>
          </div>
          {traffic.results.map((study) => (
            <div key={study.name} className="sim-tablewrap">
              <h3>
                {study.name} <span className="sim-muted">({study.runs} runs, same cars for every policy)</span>
              </h3>
              <table className="sim-table">
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>Sent to a spot someone took, per 1,000 cars</th>
                    <th>Gate to spot, mean</th>
                    <th>95th percentile</th>
                    <th>Stuck behind cars, mean</th>
                    <th>Longest gate queue</th>
                  </tr>
                </thead>
                <tbody>
                  {study.rows.map((r) => (
                    <tr key={r.policy} className={r.policy === 'balanced' ? 'is-best' : undefined}>
                      <th scope="row">{POLICY[r.policy]}</th>
                      <td>{n1(r.conflictsPer1000)}</td>
                      <td>{n1(r.meanGateToParkedSec)} s</td>
                      <td>{n1(r.p95GateToParkedSec)} s</td>
                      <td>{n1(r.meanStuckSec)} s</td>
                      <td>{n1(r.meanMaxGateQueue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="sim-muted">
            What it shows: on a normal day in our lot the difference is a second or less, because cars arrive minutes apart. In a rush, sending everyone to the nearest spot
            without reserving it jams the first aisle and sends drivers to spots someone else just took. Reserving the spot removes those conflicts entirely; adding a small
            penalty ({traffic.params.aislePenaltyCells} cells per car already heading into an aisle) spreads the rush over the aisles. Drivers without the app can still take a held spot, which is why the
            phone can still reroute.
            {graded.deadlocks > 0 &&
              ` In the heaviest rush without reservation, cars stood still for a whole minute ${n0(graded.deadlocks)} times; the model then lets one squeeze past, so the real jam would be worse than the table shows.`}{' '}
            Model: <a href={`${REPO_URL}/blob/main/src/sim/traffic.ts`}>src/sim/traffic.ts</a>, reproduce with <code>npm run simulate:traffic</code>.
          </p>
        </section>
      )}

      {bench && biggest && (
        <section className="sim-section">
          <h2>Does the routing scale to big lots?</h2>
          <p className="sim-muted">
            The breadth-first search the app runs for each car grows with the lot, so we measured it against A* (Manhattan-distance heuristic) and against an index that is
            computed once per layout. Lots are built with the demo lot's pattern, from 32 to {n0(biggest.spots)} spots, with 85% of the spots taken.
          </p>
          <div className="sim-tablewrap">
            <table className="sim-table">
              <thead>
                <tr>
                  <th>Spots</th>
                  <th>Nearest free spot: BFS per car</th>
                  <th>Nearest free spot: index per car</th>
                  <th>Route to a known spot: BFS</th>
                  <th>Route to a known spot: A*</th>
                  <th>Cells looked at, BFS / A*</th>
                </tr>
              </thead>
              <tbody>
                {bench.rows.map((r) => (
                  <tr key={r.spots}>
                    <th scope="row">{n0(r.spots)}</th>
                    <td>{r.bfsNearestMs.toFixed(3)} ms</td>
                    <td>{r.indexQueryUs.toFixed(2)} µs</td>
                    <td>{r.bfsRouteMs.toFixed(3)} ms</td>
                    <td>{r.astarRouteMs.toFixed(3)} ms</td>
                    <td>
                      {n0(r.bfsCellsLookedAt)} / {n0(r.astarCellsLookedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sim-muted">
            A* needs a destination, so it is the right tool for "drive me to this spot" (a reroute, a reserved spot): it gives the same route length as BFS while looking at a
            fraction of the cells. "Which free spot is nearest?" has no destination yet; since the layout does not change while cars come and go, the distances are computed
            once and a segment tree finds the nearest free spot in O(log n). Tests check that A* and the index always agree with BFS. Code:{' '}
            <a href={`${REPO_URL}/blob/main/src/lot/astar.ts`}>astar.ts</a>, <a href={`${REPO_URL}/blob/main/src/lot/spotIndex.ts`}>spotIndex.ts</a>, reproduce with{' '}
            <code>npm run bench:routing</code> (timings depend on the computer).
          </p>
        </section>
      )}
    </>
  );
}
