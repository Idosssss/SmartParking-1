import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runChecks } from '../src/sim/checks';
import { dijkstra } from '../src/sim/dijkstra';
import { compare, runMode } from '../src/sim/engine';
import { buildLotGraph } from '../src/sim/graph';
import { generateLot } from '../src/lot/generateLot';
import { DEFAULT_PARAMS } from '../src/sim/params';

test('the simulation passes all of its own self-checks', () => {
  const results = runChecks();
  for (const r of results) assert.ok(r.passed, `${r.name}: ${r.detail}`);
});

test('dijkstra finds the cheaper path when edge costs differ', () => {
  // 0 -1-> 1 -1-> 2   and a direct 0 -5-> 2
  const adj = [[{ to: 1, w: 1 }, { to: 2, w: 5 }], [{ to: 2, w: 1 }], []];
  const r = dijkstra(adj, 0);
  assert.deepEqual(r.dist, [0, 1, 2]);
  assert.deepEqual(r.prev, [-1, 0, 1]);
});

test('with the app the drive is never longer on average, and the run is repeatable', () => {
  const g = buildLotGraph(generateLot());
  const base = runMode(g, DEFAULT_PARAMS, 'baseline', 11, 30, { detail: false });
  const app = runMode(g, DEFAULT_PARAMS, 'app', 11, 30, { detail: false });
  const c = compare(base, app, DEFAULT_PARAMS, 11, 50);
  assert.ok(c.reduction.pct > 0);
  assert.ok(c.app.searchMetersPerCar <= c.baseline.searchMetersPerCar);
  const again = compare(runMode(g, DEFAULT_PARAMS, 'baseline', 11, 30, { detail: false }), runMode(g, DEFAULT_PARAMS, 'app', 11, 30, { detail: false }), DEFAULT_PARAMS, 11, 50);
  assert.equal(again.reduction.pct, c.reduction.pct);
});
