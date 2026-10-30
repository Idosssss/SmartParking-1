import { reachableSpotIds } from './pathfinding';
import type { LotModel } from './types';

/**
 * "Which free spot is nearest the entrance?" without searching the lot for every car.
 *
 * The layout of a lot does not change while cars come and go; only which spots are taken does. So
 * the drive distance from the entrance to every spot is computed once (one breadth-first search),
 * the spots are put in that order, and a small segment tree over that order remembers which ones
 * are free. Then:
 *
 *   build         O(cells), once per layout (again only if a lane is closed or opened)
 *   take / free   O(log spots)
 *   nearestFree   O(log spots)
 *
 * The answer is the same spot `findNearestFreeSpot` picks (equal distances go to the spot listed
 * first), which `tests/lot.test.ts` checks on thousands of random lot states.
 */
export class NearestSpotIndex {
  /** Spot ids, nearest first. */
  readonly order: string[];
  /** Drive distance from the entrance (cells, including the turn into the spot), same order. */
  readonly distance: number[];
  private readonly position = new Map<string, number>();
  private readonly size: number;
  /** tree[i] = number of free spots under node i; leaves start at `size`. */
  private readonly tree: Int32Array;

  constructor(lot: LotModel) {
    const dist = laneDistancesFromEntrance(lot);
    const reach = reachableSpotIds(lot);
    const ranked = lot.spots
      .map((s, listed) => ({ s, listed, d: spotDistance(lot, dist, s.row, s.col) }))
      .filter((x) => reach.has(x.s.id))
      .sort((a, b) => a.d - b.d || a.listed - b.listed);
    this.order = ranked.map((x) => x.s.id);
    this.distance = ranked.map((x) => x.d);
    this.order.forEach((id, i) => this.position.set(id, i));

    let size = 1;
    while (size < Math.max(this.order.length, 1)) size *= 2;
    this.size = size;
    this.tree = new Int32Array(2 * size);
    ranked.forEach((x, i) => this.setLeaf(i, x.s.occupied ? 0 : 1));
  }

  /** Marks a spot taken (or reserved) or free. Unknown or unreachable spots are ignored. */
  setTaken(spotId: string, taken: boolean): void {
    const i = this.position.get(spotId);
    if (i !== undefined) this.setLeaf(i, taken ? 0 : 1);
  }

  /** The nearest free spot and its distance, or null when every reachable spot is taken. */
  nearestFree(): { spotId: string; distance: number } | null {
    if (this.tree[1] === 0) return null;
    let node = 1;
    while (node < this.size) node = this.tree[2 * node] > 0 ? 2 * node : 2 * node + 1;
    const i = node - this.size;
    return { spotId: this.order[i], distance: this.distance[i] };
  }

  get freeCount(): number {
    return this.tree[1];
  }

  private setLeaf(i: number, value: number) {
    let node = this.size + i;
    this.tree[node] = value;
    for (node >>= 1; node >= 1; node >>= 1) this.tree[node] = this.tree[2 * node] + this.tree[2 * node + 1];
  }
}

/** One breadth-first search from the entrance over open lane cells: distance to every cell (-1 = unreachable). */
function laneDistancesFromEntrance(lot: LotModel): Int32Array {
  const { rows, cols } = lot;
  const dist = new Int32Array(rows * cols).fill(-1);
  const open = (r: number, c: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const cell = lot.cells[r][c];
    return (cell.type === 'lane' || cell.type === 'entrance') && !cell.closed;
  };
  const queue = new Int32Array(rows * cols);
  let head = 0;
  let tail = 0;
  const start = lot.entrance.row * cols + lot.entrance.col;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const node = queue[head++];
    const r = Math.floor(node / cols);
    const c = node % cols;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (!open(nr, nc)) continue;
      const next = nr * cols + nc;
      if (dist[next] >= 0) continue;
      dist[next] = dist[node] + 1;
      queue[tail++] = next;
    }
  }
  return dist;
}

function spotDistance(lot: LotModel, dist: Int32Array, row: number, col: number): number {
  let best = Infinity;
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= lot.rows || c < 0 || c >= lot.cols) continue;
    const d = dist[r * lot.cols + c];
    if (d >= 0) best = Math.min(best, d + 1);
  }
  return best;
}
