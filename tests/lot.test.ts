import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDirections } from '../src/lot/directions';
import { generateLot } from '../src/lot/generateLot';
import { buildRouteToSpot, findNearestFreeSpot, reachableSpotIds, withLaneClosed } from '../src/lot/pathfinding';
import type { LotModel } from '../src/lot/types';
import { aStarRouteToSpot } from '../src/lot/astar';
import { NearestSpotIndex } from '../src/lot/spotIndex';
import { scaledLot } from '../src/sim/scaledLot';
import { mulberry32 } from '../src/sim/rng';

function withTaken(lot: LotModel, ids: string[]): LotModel {
  return { ...lot, spots: lot.spots.map((s) => ({ ...s, occupied: ids.includes(s.id) })) };
}

test('the lot has 32 spots with unique ids and one entrance', () => {
  const lot = generateLot();
  assert.equal(lot.spots.length, 32);
  assert.equal(new Set(lot.spots.map((s) => s.id)).size, 32);
  assert.equal(lot.cells[lot.entrance.row][lot.entrance.col].type, 'entrance');
  assert.ok(lot.spots.every((s) => !s.occupied));
});

test('an empty lot sends the car to S25, right next to the entrance', () => {
  const route = findNearestFreeSpot(generateLot());
  assert.equal(route?.spot.id, 'S25');
  assert.equal(route?.path.length, 3); // entrance, the lane cell, the spot
});

test('taken spots are skipped, in order of drive distance', () => {
  let lot = generateLot();
  const order: string[] = [];
  for (let i = 0; i < 6; i++) {
    const route = findNearestFreeSpot(lot);
    assert.ok(route);
    order.push(route.spot.id);
    lot = withTaken(lot, [...lot.spots.filter((s) => s.occupied).map((s) => s.id), route.spot.id]);
  }
  assert.equal(new Set(order).size, 6); // never the same spot twice
  assert.deepEqual(order.slice(0, 2), ['S25', 'S26']);
});

test('a full lot has no route', () => {
  const lot = generateLot();
  assert.equal(findNearestFreeSpot(withTaken(lot, lot.spots.map((s) => s.id))), null);
});

test('a route only uses drivable cells and ends in the spot', () => {
  const lot = generateLot();
  for (const spot of lot.spots) {
    const route = buildRouteToSpot(lot, [lot.entrance.row, lot.entrance.col], spot);
    assert.ok(route, `no route to ${spot.id}`);
    const cells = route.path.slice(0, -1);
    assert.ok(cells.every(([r, c]) => ['lane', 'entrance'].includes(lot.cells[r][c].type)));
    assert.deepEqual(route.path[route.path.length - 1], [spot.row, spot.col]);
    for (let i = 1; i < route.path.length; i++) {
      const step = Math.abs(route.path[i][0] - route.path[i - 1][0]) + Math.abs(route.path[i][1] - route.path[i - 1][1]);
      assert.equal(step, 1, 'every move is to a neighbouring cell');
    }
  }
});

test('directions describe turns and always end with the arrival', () => {
  const lot = generateLot();
  const spot = lot.spots.find((s) => s.id === 'S1')!;
  const route = buildRouteToSpot(lot, [lot.entrance.row, lot.entrance.col], spot)!;
  const steps = buildDirections(route.path, 'S1');
  assert.ok(steps.length >= 3);
  assert.match(steps[steps.length - 1].text, /Arrived .* Spot S1/);
  assert.ok(steps.some((s) => /Turn (left|right)/.test(s.text)));
  assert.equal(buildDirections([[0, 0]], 'S9')[0].text, "You're right next to Spot S9.");
});

test('a closed lane is never driven through, and the car goes around it', () => {
  // Close the bottom aisle at column 4: S22 (row 4) is cut off, S30 (row 6) is still reached by the entrance road.
  const lot = withLaneClosed(generateLot(), 5, 3, true);
  const s22 = lot.spots.find((s) => s.id === 'S22')!;
  const s30 = lot.spots.find((s) => s.id === 'S30')!;
  assert.equal(buildRouteToSpot(lot, [lot.entrance.row, lot.entrance.col], s22), null);
  const route = buildRouteToSpot(lot, [lot.entrance.row, lot.entrance.col], s30)!;
  assert.ok(route);
  assert.ok(route.path.every(([r, c]) => !(r === 5 && c === 3)));
});

test('reachable spots: all of them in an open lot, none of the top aisle when its lane is closed', () => {
  const open = generateLot();
  assert.equal(reachableSpotIds(open).size, 32);
  const closed = withLaneClosed(open, 3, 0, true);
  const reach = reachableSpotIds(closed);
  assert.equal(reach.size, 16);
  assert.ok(['S1', 'S9', 'S16'].every((id) => !reach.has(id)));
  assert.ok(['S17', 'S25', 'S32'].every((id) => reach.has(id)));
});

test('free spots behind a closed lane are not offered; with nothing reachable there is no route', () => {
  let lot = withLaneClosed(generateLot(), 3, 0, true);
  lot = withTaken(lot, lot.spots.filter((s) => Number(s.id.slice(1)) >= 17).map((s) => s.id));
  assert.equal(lot.spots.filter((s) => !s.occupied).length, 16);
  assert.equal(findNearestFreeSpot(lot), null);
  assert.equal(findNearestFreeSpot(withLaneClosed(lot, 3, 0, false))?.spot.id, 'S9');
});

test('only lane cells can be closed: the entrance and the spots stay as they are', () => {
  const lot = generateLot();
  assert.equal(withLaneClosed(lot, lot.entrance.row, lot.entrance.col, true), lot);
  assert.equal(withLaneClosed(lot, 0, 1, true), lot); // S1
  assert.equal(withLaneClosed(lot, 3, 4, true), lot); // the gap between the aisles
  assert.equal(withLaneClosed(lot, 99, 0, true), lot);
  assert.notEqual(withLaneClosed(lot, 1, 4, true), lot);
  assert.equal(lot.cells[1][4].closed, undefined, 'the original lot is not changed');
});

test('every step gets its own stretch of the drive, so a turn is never skipped', () => {
  const lot = generateLot();
  for (const spot of lot.spots) {
    const route = buildRouteToSpot(lot, [lot.entrance.row, lot.entrance.col], spot)!;
    const steps = buildDirections(route.path, spot.id);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i].fromIndex > steps[i - 1].fromIndex, `${spot.id}: "${steps[i].text}" starts after "${steps[i - 1].text}"`);
    }
    assert.equal(steps[steps.length - 1].fromIndex, route.path.length - 1);
  }
});

/** A few random lane closures, never the entrance (same rng, same lot every run). */
function withRandomClosures(lot: LotModel, rng: () => number, count: number): LotModel {
  const lanes = lot.cells.flat().filter((c) => c.type === 'lane');
  for (let i = 0; i < count; i++) {
    const c = lanes[Math.floor(rng() * lanes.length)];
    lot = withLaneClosed(lot, c.row, c.col, true);
  }
  return lot;
}

test('A* (Manhattan heuristic) finds a route exactly as short as BFS, to every spot, with or without roadwork', () => {
  const rng = mulberry32(7);
  for (const base of [generateLot(), scaledLot(6, 25)]) {
    for (let trial = 0; trial < 6; trial++) {
      const lot = trial === 0 ? base : withRandomClosures(base, rng, trial * 2);
      const start: [number, number] = [lot.entrance.row, lot.entrance.col];
      for (const spot of lot.spots) {
        const bfs = buildRouteToSpot(lot, start, spot);
        const astar = aStarRouteToSpot(lot, start, spot);
        assert.equal(astar === null, bfs === null, `${spot.id}: both find a route, or neither`);
        if (!bfs || !astar) continue;
        assert.equal(astar.path.length, bfs.path.length, `${spot.id}: same length`);
        assert.ok(astar.path.slice(0, -1).every(([r, c]) => !lot.cells[r][c].closed), 'never through a closed lane');
      }
    }
  }
});

test('A* looks at far fewer cells than a full search in a big lot', () => {
  const lot = scaledLot(24, 97); // 4,608 spots
  const lanes = lot.cells.flat().filter((c) => c.type === 'lane' || c.type === 'entrance').length;
  const spot = lot.spots[Math.floor(lot.spots.length / 2)];
  const r = aStarRouteToSpot(lot, [lot.entrance.row, lot.entrance.col], spot)!;
  assert.ok(r.expanded < lanes / 3, `${r.expanded} of ${lanes} lane cells`);
});

test('the precomputed index always picks the same spot as the BFS router, as cars come and go', () => {
  const rng = mulberry32(2026);
  for (const fresh of [generateLot(), scaledLot(6, 25), withRandomClosures(generateLot(), rng, 3)]) {
    let lot = fresh;
    const index = new NearestSpotIndex(lot);
    for (let step = 0; step < 1500; step++) {
      const spot = lot.spots[Math.floor(rng() * lot.spots.length)];
      const taken = rng() < 0.7;
      lot = { ...lot, spots: lot.spots.map((s) => (s.id === spot.id ? { ...s, occupied: taken } : s)) };
      index.setTaken(spot.id, taken);
      const bfs = findNearestFreeSpot(lot);
      const fast = index.nearestFree();
      assert.equal(fast?.spotId ?? null, bfs?.spot.id ?? null, `step ${step}`);
      if (bfs && fast) assert.equal(fast.distance, bfs.path.length - 1);
    }
  }
});

test('the index skips spots behind roadwork and says so when nothing can be reached', () => {
  let lot = withLaneClosed(generateLot(), 3, 0, true);
  lot = withTaken(lot, lot.spots.filter((s) => Number(s.id.slice(1)) >= 17).map((s) => s.id));
  const index = new NearestSpotIndex(lot);
  assert.equal(index.nearestFree(), null);
  assert.equal(index.freeCount, 0);
});
