/**
 * How the routing scales with the size of the lot: the BFS the app ships, A* with the Manhattan
 * heuristic, and the precomputed nearest-spot index. Lots are built with the same pattern as the
 * demo lot (src/sim/scaledLot.ts), from our 32 spots up to about 10,000.
 *
 *   npm run bench:routing     writes public/routing-benchmark.json and prints a table
 *
 * Times are medians over many queries on random lot states (85% of the spots taken), on this
 * computer. Absolute numbers depend on the machine; the growth from row to row is the point.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aStarRouteToSpot } from '../src/lot/astar';
import { buildRouteToSpot, findNearestFreeSpot } from '../src/lot/pathfinding';
import { NearestSpotIndex } from '../src/lot/spotIndex';
import type { LotModel } from '../src/lot/types';
import { mulberry32 } from '../src/sim/rng';
import { scaledLot } from '../src/sim/scaledLot';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES: [number, number][] = [
  [2, 9], // 32 spots: the demo lot
  [6, 25], // 288
  [12, 49], // 1,152
  [24, 97], // 4,608
  [36, 145], // 10,368
];
const TAKEN = 0.85;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Median microseconds per call of `fn`, over `n` calls (after a short warm-up). */
function timeIt(n: number, setup: (i: number) => void, fn: () => void): number {
  for (let i = 0; i < Math.min(5, n); i++) {
    setup(i);
    fn();
  }
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    setup(i);
    const t0 = performance.now();
    fn();
    samples.push((performance.now() - t0) * 1000);
  }
  return median(samples);
}

function randomState(lot: LotModel, rng: () => number): LotModel {
  return { ...lot, spots: lot.spots.map((s) => ({ ...s, occupied: rng() < TAKEN })) };
}

const rows = SIZES.map(([blocks, cols]) => {
  const rng = mulberry32(blocks * 1000 + cols);
  const base = scaledLot(blocks, cols);
  const spots = base.spots.length;
  const laneCells = base.cells.flat().filter((c) => c.type === 'lane' || c.type === 'entrance').length;
  const entrance: [number, number] = [base.entrance.row, base.entrance.col];
  const queries = spots > 4000 ? 40 : spots > 1000 ? 100 : 400;

  // 1. "Nearest free spot" with the BFS the app ships: a fresh search for every car.
  let lot = base;
  const bfsNearestUs = timeIt(queries, () => (lot = randomState(base, rng)), () => findNearestFreeSpot(lot));

  // 2. The same question with the index: built once, then one update and one query per car.
  const t0 = performance.now();
  const index = new NearestSpotIndex(randomState(base, rng));
  const indexBuildMs = performance.now() - t0;
  let id = '';
  const indexQueryUs = timeIt(
    20000,
    () => (id = base.spots[Math.floor(rng() * spots)].id),
    () => {
      index.setTaken(id, rng() < TAKEN);
      index.nearestFree();
    },
  );

  // 3. A route to one known spot (a reroute, the reserved spot): BFS versus A*.
  let target = base.spots[0];
  const pick = () => (target = base.spots[Math.floor(rng() * spots)]);
  const bfsRouteUs = timeIt(queries, pick, () => buildRouteToSpot(base, entrance, target));
  const astarRouteUs = timeIt(queries, pick, () => aStarRouteToSpot(base, entrance, target));
  const expanded: number[] = [];
  for (let i = 0; i < 50; i++) expanded.push(aStarRouteToSpot(base, entrance, pick())!.expanded);

  return {
    spots,
    laneCells,
    bfsNearestMs: bfsNearestUs / 1000,
    indexBuildMs,
    indexQueryUs,
    bfsRouteMs: bfsRouteUs / 1000,
    astarRouteMs: astarRouteUs / 1000,
    bfsCellsLookedAt: laneCells,
    astarCellsLookedAt: median(expanded),
  };
});

const f = (x: number, d = 2) => x.toFixed(d);
console.log('| Spots | Lane cells | BFS nearest free (ms) | Index: build once (ms) | Index: per car (µs) | BFS to one spot (ms) | A* to one spot (ms) | Cells looked at, BFS / A* |');
console.log('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) {
  console.log(
    `| ${r.spots.toLocaleString('en')} | ${r.laneCells.toLocaleString('en')} | ${f(r.bfsNearestMs, 3)} | ${f(r.indexBuildMs)} | ${f(r.indexQueryUs)} | ${f(r.bfsRouteMs, 3)} | ${f(r.astarRouteMs, 3)} | ${r.bfsCellsLookedAt.toLocaleString('en')} / ${r.astarCellsLookedAt.toLocaleString('en')} |`,
  );
}
writeFileSync(resolve(root, 'public/routing-benchmark.json'), JSON.stringify({ takenShare: TAKEN, measuredOn: process.version, rows }, null, 2));
console.log('\nwrote public/routing-benchmark.json');
