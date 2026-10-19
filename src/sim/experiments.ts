import { generateLot } from '../lot/generateLot';
import { appRoute, explorerSearch, nodePath } from './drivers';
import { compare, extractDetail, runMode, type Comparison, type DetailSeries } from './engine';
import { buildLotGraph, type LotGraph } from './graph';
import { dijkstra } from './dijkstra';
import { DEFAULT_PARAMS, type SimParams } from './params';
import { hashSeed, mulberry32 } from './rng';
import { mean } from './stats';
import { scaledLot } from './scaledLot';

/** One simulated comparison plus everything the charts need. */
export interface Headline {
  comparison: Comparison;
  detail: DetailSeries;
}

export interface SweepPoint {
  x: number;
  reduction: number;
  lo: number;
  hi: number;
  extra?: Record<string, number>;
}

/** One concrete arrival on a concrete lot, to show the two routes side by side. */
export interface ExampleScenario {
  occupied: number[];
  occupiedPct: number;
  explorerPath: number[];
  explorerCells: number;
  explorerSpot: number;
  appPath: number[];
  appCells: number;
  appSpot: number;
  /** Shortest distance from the entrance to every lane node (what Dijkstra computes). */
  distFromEntrance: number[];
  /** The order in which Dijkstra settled the lane nodes. */
  settleOrder: number[];
  cellMeters: number;
}

export interface StudyResult {
  meta: { seed: number; headlineDays: number; sweepDays: number; spots: number; laneCells: number };
  headline: Headline;
  adoption: SweepPoint[];
  sight: SweepPoint[];
  baselineKind: { kind: string; label: string; reduction: number; lo: number; hi: number; baselineMeters: number; appMeters: number }[];
  demand: SweepPoint[];
  dwell: SweepPoint[];
  lotSize: { spots: number; blocks: number; cols: number; days: number; carsPerDay: number; baselineMeters: number; appMeters: number; reduction: number; lo: number; hi: number; savedKmPerDay: number; savedMetersPerCar: number }[];
  cell: { cellMeters: number; baselineMeters: number; appMeters: number; savedKmPerDay: number; reductionPct: number }[];
  example: ExampleScenario;
}

export function buildExample(g: LotGraph, params: SimParams, seed: number, takenCount: number): ExampleScenario {
  const rng = mulberry32(hashSeed(seed, 4242));
  const occ = new Uint8Array(g.spots.length);
  const order = [...occ.keys()].sort(() => rng() - 0.5);
  for (let i = 0; i < takenCount; i++) occ[order[i]] = 1;

  const explorer = explorerSearch(g, occ, params.sightCells, mulberry32(hashSeed(seed, 77)), true);
  const app = appRoute(g, occ)!;
  const entrance = g.entranceNode;
  const appAccess = g.spots[app.spot].access.reduce((best, a) => (g.allDist[entrance][a] < g.allDist[entrance][best] ? a : best));
  const dj = dijkstra(g.adj, entrance);

  return {
    occupied: [...occ.keys()].filter((i) => occ[i]),
    occupiedPct: (takenCount / g.spots.length) * 100,
    explorerPath: explorer.path,
    explorerCells: explorer.cells,
    explorerSpot: explorer.spot,
    appPath: nodePath(g, entrance, appAccess),
    appCells: app.cells,
    appSpot: app.spot,
    distFromEntrance: dj.dist,
    settleOrder: dj.order,
    cellMeters: params.cellMeters,
  };
}

/**
 * First seed (from `from`) whose example arrival has a clearly different route with and without the app.
 * Only used to pick an illustration; the study's numbers never depend on it.
 */
export function illustrativeSeed(g: LotGraph, params: SimParams, takenCount: number, from: number): number {
  for (let k = 0; k < 5000; k++) {
    const ex = buildExample(g, params, from + k, takenCount);
    if (ex.explorerCells - ex.appCells >= 3 && ex.explorerPath.length < 40) return from + k;
  }
  return from;
}

function reductionPoint(g: LotGraph, params: SimParams, seed: number, days: number, x: number, resamples = 500): SweepPoint & { comparison: Comparison } {
  const base = runMode(g, params, 'baseline', seed, days, { detail: false });
  const app = runMode(g, params, 'app', seed, days, { detail: false });
  const comparison = compare(base, app, params, seed, resamples);
  return { x, reduction: comparison.reduction.pct, lo: comparison.reduction.lo, hi: comparison.reduction.hi, comparison };
}

export interface StudyOptions {
  seed: number;
  headlineDays: number;
  sweepDays: number;
  onStage?: (stage: string) => void;
}

export function runStudy(opts: StudyOptions, params: SimParams = DEFAULT_PARAMS): StudyResult {
  const { seed, headlineDays, sweepDays } = opts;
  const stage = opts.onStage ?? (() => {});
  const g = buildLotGraph(generateLot());

  stage(`headline: ${headlineDays} days, app vs no app`);
  const baseRun = runMode(g, params, 'baseline', seed, headlineDays, { detail: true });
  const appRun = runMode(g, params, 'app', seed, headlineDays, { detail: true });
  const comparison = compare(baseRun, appRun, params, seed, 2000);
  const detail = extractDetail(baseRun, appRun, params);
  const headline: Headline = { comparison, detail };

  stage('adoption sweep');
  const adoptionBase = runMode(g, params, 'baseline', seed, sweepDays, { detail: false });
  const adoption: SweepPoint[] = [];
  for (const a of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const p = { ...params, adoption: a };
    const mixed = runMode(g, p, 'mixed', seed, sweepDays, { detail: false });
    const c = compare(adoptionBase, mixed, p, seed, 500);
    adoption.push({ x: a * 100, reduction: c.reduction.pct, lo: c.reduction.lo, hi: c.reduction.hi, extra: { kmPerDay: c.app.kmPerDay } });
  }

  stage('sight-distance sweep');
  const sight: SweepPoint[] = [];
  for (const s of [1, 2, 3, 4, 5, 6, 8, 12]) {
    const pt = reductionPoint(g, { ...params, sightCells: s }, seed, sweepDays, s * params.cellMeters);
    sight.push({ x: pt.x, reduction: pt.reduction, lo: pt.lo, hi: pt.hi, extra: { cells: s, baselineMeters: pt.comparison.baseline.searchMetersPerCar } });
  }

  stage('driver-model sweep');
  const baselineKind = (['explorer', 'wanderer'] as const).map((kind) => {
    const pt = reductionPoint(g, { ...params, baseline: kind }, seed, sweepDays, 0);
    return {
      kind,
      label: kind === 'explorer' ? 'Methodical driver (sees down the aisle, never re-checks)' : 'Wandering driver (random turns, takes first free spot seen)',
      reduction: pt.reduction,
      lo: pt.lo,
      hi: pt.hi,
      baselineMeters: pt.comparison.baseline.searchMetersPerCar,
      appMeters: pt.comparison.app.searchMetersPerCar,
    };
  });

  stage('demand sweep');
  const demand: SweepPoint[] = [];
  for (const scale of [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6]) {
    const p = { ...params, demandScale: scale };
    const base = runMode(g, p, 'baseline', seed, sweepDays, { detail: true });
    const app = runMode(g, p, 'app', seed, sweepDays, { detail: false });
    const c = compare(base, app, p, seed, 500);
    const occ = mean(base.occSum!.map((v) => v / sweepDays)) / g.spots.length;
    demand.push({
      x: scale,
      reduction: c.reduction.pct,
      lo: c.reduction.lo,
      hi: c.reduction.hi,
      extra: { meanOccupancyPct: occ * 100, blockedPerDay: c.carsBlockedPerDay, parkedPerDay: c.carsParkedPerDay, baselineMeters: c.baseline.searchMetersPerCar, appMeters: c.app.searchMetersPerCar },
    });
  }

  stage('parking-duration sweep');
  const dwell: SweepPoint[] = [];
  for (const m of [30, 60, 90, 150, 240]) {
    const pt = reductionPoint(g, { ...params, meanDwellMin: m }, seed, sweepDays, m);
    dwell.push({ x: m, reduction: pt.reduction, lo: pt.lo, hi: pt.hi, extra: { blockedPerDay: pt.comparison.carsBlockedPerDay, baselineMeters: pt.comparison.baseline.searchMetersPerCar } });
  }

  stage('cell-size scaling');
  const cell = [2.5, 3, 3.6, 4.5, 5.5].map((cellMeters) => {
    const c = compare(baseRun, appRun, { ...params, cellMeters }, seed, 50);
    return { cellMeters, baselineMeters: c.baseline.searchMetersPerCar, appMeters: c.app.searchMetersPerCar, savedKmPerDay: c.savedKmPerDay.mean, reductionPct: c.reduction.pct * 100 };
  });

  stage('lot-size sweep');
  const lotSize = (
    [
      [2, 9],
      [2, 17],
      [3, 17],
      [4, 17],
      [4, 25],
      [6, 25],
    ] as const
  ).map(([blocks, cols]) => {
    const big = buildLotGraph(scaledLot(blocks, cols));
    const p = { ...params, demandScale: params.demandScale * (big.spots.length / g.spots.length) };
    const days = Math.max(150, Math.round(sweepDays / Math.max(1, big.spots.length / 32)));
    const base = runMode(big, p, 'baseline', seed, days, { detail: false });
    const app = runMode(big, p, 'app', seed, days, { detail: false });
    const c = compare(base, app, p, seed, 500);
    return {
      spots: big.spots.length,
      blocks,
      cols,
      days,
      carsPerDay: c.carsParkedPerDay,
      baselineMeters: c.baseline.searchMetersPerCar,
      appMeters: c.app.searchMetersPerCar,
      reduction: c.reduction.pct,
      lo: c.reduction.lo,
      hi: c.reduction.hi,
      savedKmPerDay: c.savedKmPerDay.mean,
      savedMetersPerCar: c.savedMetersPerCar,
    };
  });

  stage('illustrative scenario');
  const example = buildExample(g, params, illustrativeSeed(g, params, 24, seed), 24);

  return {
    meta: { seed, headlineDays, sweepDays, spots: g.spots.length, laneCells: g.laneCells.length },
    headline,
    adoption,
    sight,
    baselineKind,
    demand,
    dwell,
    lotSize,
    cell,
    example,
  };
}
