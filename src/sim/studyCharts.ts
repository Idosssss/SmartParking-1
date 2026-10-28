import { generateLot } from '../lot/generateLot';
import { barChart, COLORS, lineChart, lotMap } from './charts';
import type { Comparison, DetailSeries } from './engine';
import type { ExampleScenario, StudyResult } from './experiments';
import { buildLotGraph } from './graph';

/** All the named charts of the study, built from one StudyResult (website and PDF share this). */

export type ChartSet = Record<string, string>;

const pct = (v: number) => `${v.toFixed(0)}%`;
const pct1 = (v: number) => `${v.toFixed(1)}%`;
const m0 = (v: number) => `${v.toFixed(0)} m`;
const m1 = (v: number) => `${v.toFixed(1)} m`;

export function exampleMaps(example: ExampleScenario): { routes: string; numbers: string } {
  const g = buildLotGraph(generateLot());
  const routes = lotMap(g, {
    occupied: example.occupied,
    routes: [
      { nodes: example.explorerPath, endSpot: example.explorerSpot, color: COLORS.base, width: 4, dashed: true, label: `No app: ${(example.explorerCells * example.cellMeters).toFixed(1)} m` },
      { nodes: example.appPath, endSpot: example.appSpot, color: COLORS.app, width: 4.5, label: `With app: ${(example.appCells * example.cellMeters).toFixed(1)} m` },
    ],
  });
  const numbers = lotMap(g, { occupied: example.occupied, laneNumbers: example.distFromEntrance, showIds: false, highlight: [{ spot: example.appSpot, color: COLORS.app }] });
  return { routes, numbers };
}

export function headlineCharts(c: Comparison, d: DetailSeries, spots: number): ChartSet {
  const out: ChartSet = {};

  out.arrivals = barChart({
    categories: d.hourly.map((h) => h.label),
    series: [{ name: 'Cars arriving per hour (average day)', color: COLORS.neutral, values: d.hourly.map((h) => h.arrivals) }],
    yLabel: 'cars per hour',
    yFormat: (v) => v.toFixed(0),
    valueFormat: (v) => v.toFixed(0),
    height: 300,
  });

  out.occupancy = lineChart({
    series: [
      {
        name: 'Share of spots taken (average, band = ±1 SD across days)',
        color: COLORS.neutral,
        points: d.occupancy
          .filter((o) => o.minute <= (c.params.hourlyArrivals.length + 1) * 60)
          .map((o) => ({ x: c.params.startHour + o.minute / 60, y: (o.mean / spots) * 100, lo: Math.max(((o.mean - o.sd) / spots) * 100, 0), hi: Math.min(((o.mean + o.sd) / spots) * 100, 100) })),
      },
    ],
    xLabel: 'time of day (h)',
    yLabel: 'spots taken',
    xFormat: (v) => `${String(Math.round(v)).padStart(2, '0')}:00`,
    yFormat: pct,
    yMax: 100,
    yMin: 0,
    height: 300,
  });

  out.headline = barChart({
    categories: ['Average car', 'Median car', 'Unluckiest 10%', 'Unluckiest 1%'],
    series: [
      { name: 'Without the app', color: COLORS.base, values: [c.baseline.searchMetersPerCar, c.baseline.p50Meters, c.baseline.p90Meters, c.baseline.p99Meters] },
      { name: 'With the app', color: COLORS.app, values: [c.app.searchMetersPerCar, c.app.p50Meters, c.app.p90Meters, c.app.p99Meters] },
    ],
    yLabel: 'driving from entrance to spot (m)',
    yFormat: m0,
    valueFormat: m1,
  });

  // "Share of cars that drove farther than x": makes the long tail visible, which a plain histogram hides.
  const maxX = c.baseline.maxMeters * 1.02;
  const survival = (shares: number[]) => {
    let cum = 0;
    return d.histogram.meters.map((x, i) => {
      cum += shares[i];
      return { x, y: Math.max(1 - cum, 0) * 100 };
    }).filter((pt) => pt.x <= maxX);
  };
  out.tail = lineChart({
    series: [
      { name: 'Without the app', color: COLORS.base, points: survival(d.histogram.baseline) },
      { name: 'With the app', color: COLORS.app, points: survival(d.histogram.app) },
    ],
    xLabel: 'driving from entrance to spot (m)',
    yLabel: 'share of cars that drive farther',
    xFormat: (v) => `${v.toFixed(0)}`,
    yFormat: pct,
    yMax: 100,
  });

  out.byOccupancy = lineChart({
    series: [
      { name: 'Without the app', color: COLORS.base, points: d.shadow.map((s) => ({ x: s.occupiedPct, y: s.baselineMeters })), markers: true },
      { name: 'With the app (same lot state)', color: COLORS.app, points: d.shadow.map((s) => ({ x: s.occupiedPct, y: s.appMeters })), markers: true },
    ],
    xLabel: 'share of spots already taken when the car arrives',
    yLabel: 'average drive to a spot (m)',
    xFormat: pct,
    yFormat: m0,
  });

  out.byHour = barChart({
    categories: d.hourly.map((h) => h.label),
    series: [
      { name: 'Without the app', color: COLORS.base, values: d.hourly.map((h) => h.baselineMeters) },
      { name: 'With the app', color: COLORS.app, values: d.hourly.map((h) => h.appMeters) },
    ],
    yLabel: 'average drive to a spot (m)',
    yFormat: m0,
    showValues: false,
  });

  out.convergence = lineChart({
    series: [{ name: 'Estimate after n simulated days', color: COLORS.app, points: d.convergence.map((p) => ({ x: p.days, y: p.reduction * 100 })) }],
    xLabel: 'simulated days (log scale)',
    yLabel: 'driving removed (running estimate)',
    xLog: true,
    xFormat: (v) => v.toFixed(0),
    yFormat: pct1,
    xTicks: [10, 30, 100, 300, 1000, 3000].filter((t) => t <= c.days),
    yMin: Math.max(0, c.reduction.pct * 100 - 6),
    yMax: c.reduction.pct * 100 + 6,
  });

  return out;
}

export function studyCharts(study: StudyResult): ChartSet {
  const g = buildLotGraph(generateLot());
  const { comparison: c, detail: d } = study.headline;
  const L = c.params.cellMeters;
  const out: ChartSet = { ...headlineCharts(c, d, study.meta.spots) };

  const maps = exampleMaps(study.example);
  out.lotRoutes = maps.routes;
  out.lotDistances = maps.numbers;
  out.spotDistances = lotMap(g, { spotHeat: { values: g.fromEntrance.map((v) => Math.round(v * L)), unit: 'metres from the entrance' }, cell: 46 });

  out.adoption = lineChart({
    series: [{ name: 'Search driving removed', color: COLORS.app, markers: true, points: study.adoption.map((a) => ({ x: a.x, y: a.reduction * 100, lo: a.lo * 100, hi: a.hi * 100 })) }],
    xLabel: 'share of drivers who use the app',
    yLabel: 'driving removed vs. nobody using it',
    xFormat: pct,
    yFormat: pct,
  });

  out.lotSizeReduction = lineChart({
    series: [{ name: 'Search driving removed', color: COLORS.app, markers: true, points: study.lotSize.map((l) => ({ x: l.spots, y: l.reduction * 100, lo: l.lo * 100, hi: l.hi * 100 })) }],
    xLabel: 'lot size (parking spots)',
    yLabel: 'driving removed by the app',
    xFormat: (v) => v.toFixed(0),
    yFormat: pct,
    xTicks: study.lotSize.map((l) => l.spots),
  });

  out.lotSizeMeters = barChart({
    categories: study.lotSize.map((l) => `${l.spots}`),
    series: [
      { name: 'Without the app', color: COLORS.base, values: study.lotSize.map((l) => l.baselineMeters) },
      { name: 'With the app', color: COLORS.app, values: study.lotSize.map((l) => l.appMeters) },
    ],
    xLabel: 'lot size (parking spots)',
    yLabel: 'average drive to a spot (m)',
    yFormat: m0,
    valueFormat: m0,
  });

  out.lotSizeSaved = barChart({
    categories: study.lotSize.map((l) => `${l.spots}`),
    series: [{ name: 'Kilometres of driving saved per day', color: COLORS.green, values: study.lotSize.map((l) => l.savedKmPerDay) }],
    xLabel: 'lot size (parking spots)',
    yLabel: 'km saved per day',
    yFormat: (v) => v.toFixed(0),
    valueFormat: (v) => v.toFixed(1),
  });

  out.sight = lineChart({
    series: [{ name: 'Search driving removed', color: COLORS.app, markers: true, points: study.sight.map((s) => ({ x: s.x, y: s.reduction * 100, lo: s.lo * 100, hi: s.hi * 100 })) }],
    xLabel: 'how far down the aisle a driver can see (m)',
    yLabel: 'driving removed by the app',
    xFormat: (v) => v.toFixed(0),
    yFormat: pct,
    xTicks: study.sight.map((s) => Math.round(s.x)),
    marker: { x: c.params.sightCells * L, y: c.reduction.pct * 100, label: 'study default' },
  });

  out.demand = lineChart({
    series: [{ name: 'Search driving removed', color: COLORS.app, markers: true, points: study.demand.map((s) => ({ x: s.extra!.meanOccupancyPct, y: s.reduction * 100, lo: s.lo * 100, hi: s.hi * 100 })) }],
    xLabel: 'average share of spots taken over the day',
    yLabel: 'driving removed by the app',
    xFormat: pct,
    yFormat: pct,
    marker: { x: study.demand.find((s) => s.x === 1)!.extra!.meanOccupancyPct, y: c.reduction.pct * 100, label: 'study default' },
  });

  out.dwell = lineChart({
    series: [{ name: 'Search driving removed', color: COLORS.app, markers: true, points: study.dwell.map((s) => ({ x: s.x, y: s.reduction * 100, lo: s.lo * 100, hi: s.hi * 100 })) }],
    xLabel: 'average time a car stays parked (min)',
    yLabel: 'driving removed by the app',
    xFormat: (v) => v.toFixed(0),
    yFormat: pct,
    xTicks: study.dwell.map((s) => s.x),
  });

  out.baselineKind = barChart({
    categories: ['Methodical driver', 'Wandering driver'],
    series: [{ name: 'Search driving removed by the app', color: COLORS.app, values: study.baselineKind.map((k) => k.reduction * 100), lo: study.baselineKind.map((k) => k.lo * 100), hi: study.baselineKind.map((k) => k.hi * 100) }],
    yLabel: 'driving removed by the app',
    yFormat: pct,
    valueFormat: pct1,
  });

  return out;
}

/** Share (0..1) of cars that drove farther than `meters` in the given policy. */
export function shareFarther(d: DetailSeries, meters: number, policy: 'baseline' | 'app'): number {
  let cum = 0;
  d.histogram.meters.forEach((x, i) => {
    if (x <= meters) cum += d.histogram[policy][i];
  });
  return Math.max(1 - cum, 0);
}
