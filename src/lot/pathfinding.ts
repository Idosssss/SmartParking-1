import type { GridPoint, LotModel, Spot } from './types';

const key = (r: number, c: number) => `${r},${c}`;

function isWalkable(lot: LotModel, row: number, col: number): boolean {
  if (row < 0 || row >= lot.rows || col < 0 || col >= lot.cols) return false;
  const cell = lot.cells[row][col];
  return (cell.type === 'lane' || cell.type === 'entrance') && !cell.closed;
}

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** BFS over drivable (lane/entrance) cells from an arbitrary start cell. */
function bfsFrom(lot: LotModel, start: GridPoint) {
  const dist = new Map<string, number>();
  const prev = new Map<string, GridPoint | null>();
  dist.set(key(start[0], start[1]), 0);
  prev.set(key(start[0], start[1]), null);

  const queue: GridPoint[] = [start];
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    const d = dist.get(key(r, c))!;
    for (const [dr, dc] of NEIGHBORS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isWalkable(lot, nr, nc)) continue;
      const k = key(nr, nc);
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      prev.set(k, [r, c]);
      queue.push([nr, nc]);
    }
  }

  return { dist, prev };
}

export interface RouteResult {
  spot: Spot;
  path: GridPoint[];
}

/** Finds the nearest free spot to `start` (the entrance by default) and the drivable path to it. */
export function findNearestFreeSpot(
  lot: LotModel,
  start: GridPoint = [lot.entrance.row, lot.entrance.col],
): RouteResult | null {
  const { dist, prev } = bfsFrom(lot, start);

  let best: { spot: Spot; laneCell: GridPoint; distance: number } | null = null;

  for (const spot of lot.spots) {
    if (spot.occupied) continue;
    for (const [dr, dc] of NEIGHBORS) {
      const nr = spot.row + dr;
      const nc = spot.col + dc;
      const d = dist.get(key(nr, nc));
      if (d === undefined) continue;
      const total = d + 1;
      if (!best || total < best.distance) {
        best = { spot, laneCell: [nr, nc], distance: total };
      }
    }
  }

  if (!best) return null;

  const path: GridPoint[] = [];
  let cursor: GridPoint | null = best.laneCell;
  while (cursor) {
    path.unshift(cursor);
    cursor = prev.get(key(cursor[0], cursor[1])) ?? null;
  }
  path.push([best.spot.row, best.spot.col]);

  return { spot: best.spot, path };
}

/** Builds the drivable path from `start` to a *specific* spot (not a search). */
export function buildRouteToSpot(lot: LotModel, start: GridPoint, spot: Spot): RouteResult | null {
  const { dist, prev } = bfsFrom(lot, start);

  let laneCell: GridPoint | null = null;
  let bestDist = Infinity;
  for (const [dr, dc] of NEIGHBORS) {
    const nr = spot.row + dr;
    const nc = spot.col + dc;
    const d = dist.get(key(nr, nc));
    if (d !== undefined && d < bestDist) {
      bestDist = d;
      laneCell = [nr, nc];
    }
  }
  if (!laneCell) return null;

  const path: GridPoint[] = [];
  let cursor: GridPoint | null = laneCell;
  while (cursor) {
    path.unshift(cursor);
    cursor = prev.get(key(cursor[0], cursor[1])) ?? null;
  }
  path.push([spot.row, spot.col]);

  return { spot, path };
}

/** The spots a car can reach from `start` (the entrance by default). Lanes closed for roadwork can cut some off. */
export function reachableSpotIds(lot: LotModel, start: GridPoint = [lot.entrance.row, lot.entrance.col]): Set<string> {
  const { dist } = bfsFrom(lot, start);
  const out = new Set<string>();
  for (const spot of lot.spots) {
    if (NEIGHBORS.some(([dr, dc]) => dist.has(key(spot.row + dr, spot.col + dc)))) out.add(spot.id);
  }
  return out;
}

/** Opens or closes one lane cell. The entrance and the spots cannot be closed. */
export function withLaneClosed(lot: LotModel, row: number, col: number, closed: boolean): LotModel {
  if (lot.cells[row]?.[col]?.type !== 'lane') return lot;
  return {
    ...lot,
    cells: lot.cells.map((r, ri) => (ri === row ? r.map((c, ci) => (ci === col ? { ...c, closed } : c)) : r)),
  };
}
