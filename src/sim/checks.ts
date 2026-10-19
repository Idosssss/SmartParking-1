import { generateLot } from '../lot/generateLot';
import { scaledLot } from './scaledLot';
import { findNearestFreeSpot } from '../lot/pathfinding';
import { appRoute, explorerSearch, wandererSearch } from './drivers';
import { generateDay, runMode, type Mode } from './engine';
import { buildLotGraph, type LotGraph } from './graph';
import { DEFAULT_PARAMS, type SimParams } from './params';
import { hashSeed, mulberry32 } from './rng';
import { sum } from './stats';

/**
 * Self-checks run before every study. If one fails the study aborts: a number from a simulation
 * that fails its own sanity checks is worse than no number.
 */

export interface CheckResult {
  name: string;
  detail: string;
  passed: boolean;
}

function randomOccupancy(g: LotGraph, taken: number, rng: () => number): Uint8Array {
  const occ = new Uint8Array(g.spots.length);
  const order = [...occ.keys()].sort(() => rng() - 0.5);
  for (let i = 0; i < taken; i++) occ[order[i]] = 1;
  return occ;
}

export function runChecks(params: SimParams = DEFAULT_PARAMS): CheckResult[] {
  const results: CheckResult[] = [];
  const add = (name: string, passed: boolean, detail: string) => results.push({ name, passed, detail });

  const lot = generateLot();
  const g = buildLotGraph(lot);
  const rng = mulberry32(12345);

  // 1. Dijkstra picks the same spot, at the same distance, as the routing code that ships in the app.
  {
    let mismatches = 0;
    let tested = 0;
    for (let taken = 0; taken < g.spots.length; taken++) {
      for (let rep = 0; rep < 60; rep++) {
        const occ = randomOccupancy(g, taken, rng);
        const mine = appRoute(g, occ)!;
        const shipped = findNearestFreeSpot({ ...lot, spots: lot.spots.map((s, i) => ({ ...s, occupied: !!occ[i] })) })!;
        tested++;
        if (shipped.path.length - 1 !== mine.cells || shipped.spot.id !== g.spots[mine.spot].id) mismatches++;
      }
    }
    add('Dijkstra matches the app router', mismatches === 0, `${tested} random lot states (0 to 31 spots taken): ${mismatches} differences in chosen spot or distance`);
  }

  // 2. All-pairs distances against an independent Floyd-Warshall.
  {
    const n = g.laneCells.length;
    const fw = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
    g.adj.forEach((edges, u) => edges.forEach((e) => (fw[u][e.to] = Math.min(fw[u][e.to], e.w))));
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (fw[i][k] + fw[k][j] < fw[i][j]) fw[i][j] = fw[i][k] + fw[k][j];
    let bad = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (fw[i][j] !== g.allDist[i][j]) bad++;
    add('Distances match Floyd-Warshall', bad === 0, `${n * n} node pairs compared: ${bad} differences`);
  }

  // 3. The app is never beaten, and every searching driver ends in a genuinely free spot.
  {
    let beaten = 0;
    let badSpot = 0;
    let tested = 0;
    for (const sight of [1, 2, 4, 8]) {
      for (let taken = 0; taken < g.spots.length; taken++) {
        for (let rep = 0; rep < 25; rep++) {
          const occ = randomOccupancy(g, taken, rng);
          const best = appRoute(g, occ)!.cells;
          for (const finder of [explorerSearch, wandererSearch]) {
            const res = finder(g, occ, sight, mulberry32(hashSeed(sight, taken, rep)));
            tested++;
            if (res.spot < 0 || occ[res.spot]) badSpot++;
            else if (res.cells < best) beaten++;
          }
        }
      }
    }
    add('App route is never longer than a search', beaten === 0 && badSpot === 0, `${tested} searches: ${beaten} shorter than the app, ${badSpot} ended in a taken spot or no spot`);
  }

  // 4. Same cars, same blocking, whatever the policy.
  {
    const days = 40;
    const base = runMode(g, params, 'baseline', 99, days, { detail: false });
    const app = runMode(g, params, 'app', 99, days, { detail: false });
    let arrivals = 0;
    for (let d = 0; d < days; d++) arrivals += generateDay(params, 99, d).length;
    const same = sum(base.perDay.parked) === sum(app.perDay.parked) && sum(base.perDay.blocked) === sum(app.perDay.blocked);
    const conserved = sum(base.perDay.parked) + sum(base.perDay.blocked) === arrivals;
    add('Cars are conserved and paired', same && conserved, `${days} days: ${arrivals} arrivals = ${sum(base.perDay.parked)} parked + ${sum(base.perDay.blocked)} blocked, identical in both policies`);
  }

  // 5. Reproducible.
  {
    const modes: Mode[] = ['baseline', 'app'];
    const a = modes.map((m) => sum(runMode(g, params, m, 7, 25, { detail: false }).perDay.searchCells));
    const b = modes.map((m) => sum(runMode(g, params, m, 7, 25, { detail: false }).perDay.searchCells));
    const c = modes.map((m) => sum(runMode(g, params, m, 8, 25, { detail: false }).perDay.searchCells));
    add('Same seed, same numbers', a[0] === b[0] && a[1] === b[1] && (a[0] !== c[0] || a[1] !== c[1]), `seed 7 twice: ${a.join('/')} and ${b.join('/')}; seed 8: ${c.join('/')}`);
  }

  // 6. Inside a full run, the app never lost to the drivers at the same lot state.
  {
    const run = runMode(g, params, 'baseline', 5, 100, { detail: true });
    add('No same-state counterexample in a run', run.shadowViolations === 0, `${sum(run.shadowCars!)} parked cars compared with the app's choice for the same lot state: ${run.shadowViolations} violations`);
  }

  // 7. The scaled-lot generator reproduces the demo lot exactly when asked for its size.
  {
    const demo = generateLot();
    const copy = scaledLot(2, 9);
    let diffs = 0;
    for (let r = 0; r < demo.rows; r++)
      for (let c = 0; c < demo.cols; c++) {
        const a = demo.cells[r][c];
        const b = copy.cells[r][c];
        if (a.type !== b.type || a.spotId !== b.spotId) diffs++;
      }
    const sameShape = demo.rows === copy.rows && demo.cols === copy.cols && demo.entrance.row === copy.entrance.row && demo.spots.length === copy.spots.length;
    add('Scaled lot generator reproduces the demo lot', diffs === 0 && sameShape, `${demo.rows * demo.cols} cells compared: ${diffs} differences, ${copy.spots.length} spots`);
  }

  return results;
}
