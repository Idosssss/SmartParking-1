import { appRoute, explorerSearch, futileTourCells, wandererSearch } from './drivers';
import type { LotGraph } from './graph';
import type { SimParams } from './params';
import { hashSeed, lognormalSample, mulberry32, poissonSample, type Rng } from './rng';
import { bootstrapReductionCI, histogramMean, histogramQuantile, histogramSd, mean, meanCI95, sd, sum } from './stats';

/**
 * Day-by-day simulation of one lot.
 *
 * Each simulated day has the same list of cars for every policy being compared ("common random
 * numbers"): the same arrival times, the same parking durations, the same drivers. Only the way
 * they look for a spot changes. Because the number of cars parked at any moment depends only on
 * arrival times and durations, both policies see exactly the same number of cars and the same
 * blocked arrivals, so the comparison is exactly paired.
 *
 * Simplification (stated in the report): a car's search is treated as instantaneous with respect to
 * other cars' arrivals and departures (a search takes about a minute, cars arrive every few minutes).
 */

export type Mode = 'baseline' | 'app' | 'mixed';

export interface Arrival {
  /** Minutes since the lot opened. */
  t: number;
  /** Minutes the car stays parked. */
  dwell: number;
  /** Uniform draw; the driver uses the app in "mixed" runs when appU < adoption. */
  appU: number;
  /** Per-car seed for the driver's own random choices (so a given car behaves the same way in every run). */
  seed: number;
  hour: number;
}

export function generateDay(params: SimParams, masterSeed: number, dayIndex: number): Arrival[] {
  const rng: Rng = mulberry32(hashSeed(masterSeed, dayIndex, 1));
  const arrivals: Arrival[] = [];
  params.hourlyArrivals.forEach((rate, hour) => {
    const count = poissonSample(rng, rate * params.demandScale);
    for (let i = 0; i < count; i++) {
      arrivals.push({
        t: hour * 60 + rng() * 60,
        dwell: lognormalSample(rng, params.meanDwellMin, params.dwellSigma),
        appU: rng(),
        seed: 0,
        hour,
      });
    }
  });
  arrivals.sort((a, b) => a.t - b.t);
  arrivals.forEach((a, i) => {
    a.seed = hashSeed(masterSeed, dayIndex, 2, i);
  });
  return arrivals;
}

export const OCC_SLOT_MIN = 10;

export interface ModeRun {
  mode: Mode;
  days: number;
  perDay: {
    searchCells: Float64Array;
    exitCells: Float64Array;
    futileCells: Float64Array;
    parked: Float64Array;
    blocked: Float64Array;
  };
  /** search distance (cells) -> number of cars. */
  hist: Map<number, number>;
  hourCars: Float64Array;
  hourCells: Float64Array;
  /** Only filled when `detail` is on and the run is in baseline mode. */
  occSum?: Float64Array;
  occSq?: Float64Array;
  /** Per "spots taken at arrival" (0..n-1): how many cars, total baseline cells, total nearest-spot cells. */
  shadowCars?: Float64Array;
  shadowBase?: Float64Array;
  shadowApp?: Float64Array;
  /** Times the app's route was longer than what the driver actually drove at the same lot state. Must be 0. */
  shadowViolations: number;
}

export interface RunOptions {
  detail: boolean;
  onProgress?: (done: number, total: number) => void;
}

function findSpot(g: LotGraph, params: SimParams, occ: Uint8Array, rng: Rng) {
  return params.baseline === 'wanderer'
    ? wandererSearch(g, occ, params.sightCells, rng)
    : explorerSearch(g, occ, params.sightCells, rng);
}

export function runMode(g: LotGraph, params: SimParams, mode: Mode, seed: number, days: number, opts: RunOptions): ModeRun {
  const nSpots = g.spots.length;
  const hours = params.hourlyArrivals.length;
  const slots = Math.floor(((hours + 2) * 60) / OCC_SLOT_MIN);
  const exitCellsBySpot = g.fromEntrance; // symmetric: the drive out is the drive in, reversed

  const run: ModeRun = {
    mode,
    days,
    perDay: {
      searchCells: new Float64Array(days),
      exitCells: new Float64Array(days),
      futileCells: new Float64Array(days),
      parked: new Float64Array(days),
      blocked: new Float64Array(days),
    },
    hist: new Map(),
    hourCars: new Float64Array(hours),
    hourCells: new Float64Array(hours),
    shadowViolations: 0,
  };
  const trackShadow = opts.detail && mode === 'baseline';
  if (opts.detail && mode === 'baseline') {
    run.occSum = new Float64Array(slots);
    run.occSq = new Float64Array(slots);
    run.shadowCars = new Float64Array(nSpots);
    run.shadowBase = new Float64Array(nSpots);
    run.shadowApp = new Float64Array(nSpots);
  }

  const occ = new Uint8Array(nSpots);
  const leaveAt = new Float64Array(nSpots);

  for (let d = 0; d < days; d++) {
    const arrivals = generateDay(params, seed, d);
    occ.fill(0);
    leaveAt.fill(0);
    let occupied = 0;
    let search = 0;
    let exit = 0;
    let futile = 0;
    let parked = 0;
    let blocked = 0;
    const parkedIntervals: number[] = [];

    for (const car of arrivals) {
      for (let s = 0; s < nSpots; s++) {
        if (occ[s] && leaveAt[s] <= car.t) {
          occ[s] = 0;
          occupied--;
        }
      }

      const usesApp = mode === 'app' || (mode === 'mixed' && car.appU < params.adoption);

      if (occupied === nSpots) {
        blocked++;
        if (!usesApp) futile += futileTourCells(g, params.sightCells, mulberry32(hashSeed(car.seed, 99)));
        continue;
      }

      let spot: number;
      let cells: number;
      if (usesApp) {
        const route = appRoute(g, occ)!;
        spot = route.spot;
        cells = route.cells;
      } else {
        const found = findSpot(g, params, occ, mulberry32(car.seed));
        spot = found.spot;
        cells = found.cells;
        if (trackShadow) {
          const nearest = appRoute(g, occ)!;
          run.shadowCars![occupied] += 1;
          run.shadowBase![occupied] += cells;
          run.shadowApp![occupied] += nearest.cells;
          if (nearest.cells > cells) run.shadowViolations++;
        }
      }

      occ[spot] = 1;
      leaveAt[spot] = car.t + car.dwell;
      occupied++;
      parked++;
      search += cells;
      exit += exitCellsBySpot[spot];
      run.hist.set(cells, (run.hist.get(cells) ?? 0) + 1);
      run.hourCars[car.hour] += 1;
      run.hourCells[car.hour] += cells;
      if (run.occSum) parkedIntervals.push(car.t, car.t + car.dwell);
    }

    if (run.occSum && run.occSq) {
      for (let k = 0; k < slots; k++) {
        const tau = k * OCC_SLOT_MIN;
        let count = 0;
        for (let i = 0; i < parkedIntervals.length; i += 2) {
          if (parkedIntervals[i] <= tau && tau < parkedIntervals[i + 1]) count++;
        }
        run.occSum[k] += count;
        run.occSq[k] += count * count;
      }
    }

    run.perDay.searchCells[d] = search;
    run.perDay.exitCells[d] = exit;
    run.perDay.futileCells[d] = futile;
    run.perDay.parked[d] = parked;
    run.perDay.blocked[d] = blocked;
    if (opts.onProgress && (d % 50 === 49 || d === days - 1)) opts.onProgress(d + 1, days);
  }
  return run;
}

/* ---------------------------------- comparison ---------------------------------- */

export interface Side {
  searchMetersPerCar: number;
  exitMetersPerCar: number;
  tripMetersPerCar: number;
  sdMeters: number;
  p50Meters: number;
  p90Meters: number;
  p99Meters: number;
  maxMeters: number;
  kmPerDay: number;
  futileKmPerDay: number;
  searchSecondsPerCar: number;
}

export interface Comparison {
  params: SimParams;
  days: number;
  seed: number;
  carsParkedPerDay: number;
  carsBlockedPerDay: number;
  baseline: Side;
  app: Side;
  /** Search-leg reduction: the headline number. */
  reduction: { pct: number; lo: number; hi: number };
  /** Same, but counting the drive out of the lot too. */
  tripReduction: { pct: number; lo: number; hi: number };
  /** Same as headline, plus the wasted tours of drivers who find the lot full. */
  withFutileReduction: { pct: number; lo: number; hi: number };
  savedMetersPerCar: number;
  savedKmPerDay: { mean: number; lo: number; hi: number };
  savedSecondsPerCar: number;
  savedCo2KgPerDay: number;
  /** SD across days of the daily reduction, to show how much one day can differ from the average. */
  dailyReductionSdPct: number;
}

function sideOf(run: ModeRun, params: SimParams): Side {
  const L = params.cellMeters;
  const parked = sum(run.perDay.parked);
  const searchCells = sum(run.perDay.searchCells);
  const exitCells = sum(run.perDay.exitCells);
  const futile = sum(run.perDay.futileCells);
  const metersPerCar = (searchCells / parked) * L;
  const exitMetersPerCar = (exitCells / parked) * L;
  const speed = params.speedKmh / 3.6;
  return {
    searchMetersPerCar: metersPerCar,
    exitMetersPerCar,
    tripMetersPerCar: metersPerCar + exitMetersPerCar,
    sdMeters: histogramSd(run.hist) * L,
    p50Meters: histogramQuantile(run.hist, 0.5) * L,
    p90Meters: histogramQuantile(run.hist, 0.9) * L,
    p99Meters: histogramQuantile(run.hist, 0.99) * L,
    maxMeters: Math.max(...run.hist.keys()) * L,
    kmPerDay: ((searchCells * L) / 1000) / run.days,
    futileKmPerDay: ((futile * L) / 1000) / run.days,
    searchSecondsPerCar: metersPerCar / speed,
  };
}

function reductionOf(base: ArrayLike<number>, other: ArrayLike<number>, resamples: number, seed: number) {
  const sb = sum(base);
  const so = sum(other);
  const pct = sb === 0 ? 0 : 1 - so / sb;
  const ci = bootstrapReductionCI(base, other, resamples, seed);
  return { pct, lo: ci.lo, hi: ci.hi };
}

function addArrays(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

export function compare(base: ModeRun, other: ModeRun, params: SimParams, seed: number, resamples: number): Comparison {
  const L = params.cellMeters;
  const baseSide = sideOf(base, params);
  const otherSide = sideOf(other, params);

  const reduction = reductionOf(base.perDay.searchCells, other.perDay.searchCells, resamples, hashSeed(seed, 7));
  const tripBase = addArrays(base.perDay.searchCells, base.perDay.exitCells);
  const tripOther = addArrays(other.perDay.searchCells, other.perDay.exitCells);
  const tripReduction = reductionOf(tripBase, tripOther, resamples, hashSeed(seed, 8));
  const futBase = addArrays(base.perDay.searchCells, base.perDay.futileCells);
  const futOther = addArrays(other.perDay.searchCells, other.perDay.futileCells);
  const withFutileReduction = reductionOf(futBase, futOther, resamples, hashSeed(seed, 9));

  const savedKm = new Float64Array(base.days);
  const dailyReduction = new Float64Array(base.days);
  for (let d = 0; d < base.days; d++) {
    savedKm[d] = ((base.perDay.searchCells[d] - other.perDay.searchCells[d]) * L) / 1000;
    dailyReduction[d] = base.perDay.searchCells[d] === 0 ? 0 : 1 - other.perDay.searchCells[d] / base.perDay.searchCells[d];
  }
  const ci = meanCI95(savedKm);
  const savedMetersPerCar = baseSide.searchMetersPerCar - otherSide.searchMetersPerCar;

  return {
    params,
    days: base.days,
    seed,
    carsParkedPerDay: mean(base.perDay.parked),
    carsBlockedPerDay: mean(base.perDay.blocked),
    baseline: baseSide,
    app: otherSide,
    reduction,
    tripReduction,
    withFutileReduction,
    savedMetersPerCar,
    savedKmPerDay: { mean: ci.mean, lo: ci.lo, hi: ci.hi },
    savedSecondsPerCar: baseSide.searchSecondsPerCar - otherSide.searchSecondsPerCar,
    savedCo2KgPerDay: ci.mean * params.co2KgPerKm,
    dailyReductionSdPct: sd(dailyReduction) * 100,
  };
}

/* -------------------------------- detail extraction ------------------------------- */

export interface DetailSeries {
  hourly: { hour: number; label: string; arrivals: number; baselineMeters: number; appMeters: number }[];
  histogram: { meters: number[]; baseline: number[]; app: number[] };
  shadow: { occupiedPct: number; cars: number; baselineMeters: number; appMeters: number }[];
  occupancy: { minute: number; mean: number; sd: number }[];
  convergence: { days: number; reduction: number }[];
}

export function extractDetail(base: ModeRun, app: ModeRun, params: SimParams): DetailSeries {
  const L = params.cellMeters;
  const nSpots = base.shadowCars!.length;
  const hourly = params.hourlyArrivals.map((_, h) => {
    const label = `${String(params.startHour + h).padStart(2, '0')}:00`;
    return {
      hour: params.startHour + h,
      label,
      arrivals: base.hourCars[h] / base.days,
      baselineMeters: base.hourCars[h] ? (base.hourCells[h] / base.hourCars[h]) * L : 0,
      appMeters: app.hourCars[h] ? (app.hourCells[h] / app.hourCars[h]) * L : 0,
    };
  });

  const maxCells = Math.max(...base.hist.keys(), ...app.hist.keys());
  const meters: number[] = [];
  const baseline: number[] = [];
  const appCounts: number[] = [];
  const totalBase = [...base.hist.values()].reduce((a, b) => a + b, 0);
  const totalApp = [...app.hist.values()].reduce((a, b) => a + b, 0);
  for (let c = 0; c <= maxCells; c++) {
    meters.push(c * L);
    baseline.push((base.hist.get(c) ?? 0) / totalBase);
    appCounts.push((app.hist.get(c) ?? 0) / totalApp);
  }

  const shadow: DetailSeries['shadow'] = [];
  for (let k = 0; k < nSpots; k++) {
    const n = base.shadowCars![k];
    if (n < 1) continue;
    shadow.push({
      occupiedPct: (k / nSpots) * 100,
      cars: n,
      baselineMeters: (base.shadowBase![k] / n) * L,
      appMeters: (base.shadowApp![k] / n) * L,
    });
  }

  const occupancy = [...Array(base.occSum!.length).keys()].map((k) => {
    const m = base.occSum![k] / base.days;
    const v = Math.max(base.occSq![k] / base.days - m * m, 0);
    return { minute: k * OCC_SLOT_MIN, mean: m, sd: Math.sqrt(v) };
  });

  const convergence: DetailSeries['convergence'] = [];
  let sb = 0;
  let sa = 0;
  const checkpoints = new Set<number>();
  for (let n = 10; n <= base.days; n = Math.ceil(n * 1.25)) checkpoints.add(n);
  checkpoints.add(base.days);
  for (let d = 0; d < base.days; d++) {
    sb += base.perDay.searchCells[d];
    sa += app.perDay.searchCells[d];
    if (checkpoints.has(d + 1)) convergence.push({ days: d + 1, reduction: sb === 0 ? 0 : 1 - sa / sb });
  }

  return { hourly, histogram: { meters, baseline, app: appCounts }, shadow, occupancy, convergence };
}

/** Mean search distance (cells) of a run, handy for quick checks. */
export function meanSearchCells(run: ModeRun): number {
  return histogramMean(run.hist);
}
