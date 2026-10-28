import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDirections } from '../src/lot/directions';
import { generateLot } from '../src/lot/generateLot';
import { buildRouteToSpot, findNearestFreeSpot } from '../src/lot/pathfinding';
import type { LotModel } from '../src/lot/types';

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
