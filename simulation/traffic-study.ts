/**
 * The traffic study: reservations and the "everyone parks near the entrance" bottleneck.
 * Uses the second-by-second model in src/sim/traffic.ts.
 *
 *   npm run simulate:traffic    writes public/traffic-study.json and prints the tables
 *
 * Three situations, each run many times with the same random cars for every policy:
 *   - our 32-spot lot on the main study's busy weekday (arrivals and parking times as in params.ts)
 *   - a morning rush into our empty lot
 *   - a morning rush into an empty 288-spot lot (the big lot of the main study's size sweep)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLot } from '../src/lot/generateLot';
import { generateDay } from '../src/sim/engine';
import { buildLotGraph, type LotGraph } from '../src/sim/graph';
import { DEFAULT_PARAMS } from '../src/sim/params';
import { hashSeed, mulberry32, poissonSample } from '../src/sim/rng';
import { scaledLot } from '../src/sim/scaledLot';
import { DEFAULT_TRAFFIC, runTraffic, type TrafficArrival, type TrafficPolicy, type TrafficResult } from '../src/sim/traffic';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const SEED = 2026;
const POLICIES: TrafficPolicy[] = ['driver', 'nearest', 'reserved', 'balanced'];

function rush(ratePerMin: number, minutes: number, run: number): TrafficArrival[] {
  const rng = mulberry32(hashSeed(SEED, ratePerMin * 100, run));
  const out: TrafficArrival[] = [];
  for (let m = 0; m < minutes; m++) {
    const n = poissonSample(rng, ratePerMin);
    for (let i = 0; i < n; i++) out.push({ t: (m + rng()) * 60, dwell: 8 * 3600 });
  }
  return out.sort((a, b) => a.t - b.t);
}

function quantile(xs: number[], q: number) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

interface Row {
  policy: TrafficPolicy;
  cars: number;
  parkedShare: number;
  conflictsPer1000: number;
  meanGateToParkedSec: number;
  p95GateToParkedSec: number;
  meanGateWaitSec: number;
  meanStuckSec: number;
  meanCells: number;
  meanMaxGateQueue: number;
  deadlocks: number;
}

function study(name: string, g: LotGraph, runs: number, arrivalsFor: (run: number) => TrafficArrival[]) {
  const rows: Row[] = POLICIES.map((policy) => {
    const all: TrafficResult[] = [];
    for (let run = 0; run < runs; run++) all.push(runTraffic(g, arrivalsFor(run), policy, DEFAULT_TRAFFIC, hashSeed(SEED, run)));
    const cat = (k: 'gateToParked' | 'gateWait' | 'stuck' | 'cells') => all.flatMap((r) => r[k]);
    const cars = all.reduce((a, r) => a + r.cars, 0);
    const parked = all.reduce((a, r) => a + r.parked, 0);
    return {
      policy,
      cars,
      parkedShare: parked / cars,
      conflictsPer1000: (1000 * all.reduce((a, r) => a + r.conflicts, 0)) / cars,
      meanGateToParkedSec: mean(cat('gateToParked')),
      p95GateToParkedSec: quantile(cat('gateToParked'), 0.95),
      meanGateWaitSec: mean(cat('gateWait')),
      meanStuckSec: mean(cat('stuck')),
      meanCells: mean(cat('cells')),
      meanMaxGateQueue: mean(all.map((r) => r.maxGateQueue)),
      deadlocks: all.reduce((a, r) => a + r.deadlocks, 0),
    };
  });
  console.log(`\n### ${name} (${runs} runs)\n`);
  console.log('| Policy | Cars | Sent to a spot someone else took (per 1,000 cars) | Gate to parked, mean (s) | 95th percentile (s) | Waiting at the gate, mean (s) | Stuck behind other cars, mean (s) | Longest gate queue (cars) | Deadlocks |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    console.log(
      `| ${r.policy} | ${r.cars.toLocaleString('en')} | ${r.conflictsPer1000.toFixed(1)} | ${r.meanGateToParkedSec.toFixed(1)} | ${r.p95GateToParkedSec.toFixed(1)} | ${r.meanGateWaitSec.toFixed(1)} | ${r.meanStuckSec.toFixed(1)} | ${r.meanMaxGateQueue.toFixed(1)} | ${r.deadlocks} |`,
    );
  }
  return { name, runs, rows };
}

const started = Date.now();
const small = buildLotGraph(generateLot());
const big = buildLotGraph(scaledLot(6, 25));
const results = [
  study('Our 32-spot lot, a busy weekday', small, quick ? 20 : 300, (d) =>
    generateDay(DEFAULT_PARAMS, SEED, d).map((a) => ({ t: a.t * 60, dwell: a.dwell * 60 })),
  ),
  study('Morning rush into our empty lot: 3 cars a minute for 10 minutes', small, quick ? 20 : 300, (run) => rush(3, 10, run)),
  study('Morning rush into an empty 288-spot lot: 4 cars a minute for 45 minutes', big, quick ? 4 : 40, (run) => rush(4, 45, run)),
  study('Heavy rush into an empty 288-spot lot: 8 cars a minute for 30 minutes', big, quick ? 4 : 40, (run) => rush(8, 30, run)),
];
console.log(`\ndone in ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (!quick) {
  writeFileSync(resolve(root, 'public/traffic-study.json'), JSON.stringify({ seed: SEED, params: DEFAULT_TRAFFIC, results }, null, 2));
  console.log('wrote public/traffic-study.json');
}
