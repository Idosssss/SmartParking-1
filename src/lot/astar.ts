import type { GridPoint, LotModel, Spot } from './types';
import type { RouteResult } from './pathfinding';

/**
 * A* search (Hart, Nilsson and Raphael, 1968) from a lane cell to one known spot, on the same grid
 * the app drives on: four neighbours, every move costs one cell, closed lanes cannot be used.
 *
 * Heuristic: the Manhattan distance to the spot minus one (the car stops on a lane cell next to the
 * spot, then turns in). On a four-neighbour grid with unit costs this never overestimates and never
 * drops by more than one per move, so it is admissible and consistent: A* returns a shortest route,
 * the same length the breadth-first search in `pathfinding.ts` finds, while looking at fewer cells.
 *
 * A* needs a destination. It fits "drive me to spot S17" (a reroute, a reserved spot, the real
 * sensor's spot). "Find the nearest free spot" has no destination yet; for that see `spotIndex.ts`.
 */

export interface AStarResult extends RouteResult {
  /** How many cells A* took off its open list before it reached the spot (its work). */
  expanded: number;
}

function walkable(lot: LotModel, r: number, c: number): boolean {
  if (r < 0 || r >= lot.rows || c < 0 || c >= lot.cols) return false;
  const cell = lot.cells[r][c];
  return (cell.type === 'lane' || cell.type === 'entrance') && !cell.closed;
}

/** A binary min-heap keyed by f; ties go to the larger g (deeper first), which expands fewer cells. */
class OpenList {
  private f: number[] = [];
  private g: number[] = [];
  private node: number[] = [];

  get size() {
    return this.node.length;
  }

  private less(i: number, j: number) {
    return this.f[i] < this.f[j] || (this.f[i] === this.f[j] && this.g[i] > this.g[j]);
  }

  private swap(i: number, j: number) {
    [this.f[i], this.f[j]] = [this.f[j], this.f[i]];
    [this.g[i], this.g[j]] = [this.g[j], this.g[i]];
    [this.node[i], this.node[j]] = [this.node[j], this.node[i]];
  }

  push(f: number, g: number, node: number) {
    this.f.push(f);
    this.g.push(g);
    this.node.push(node);
    let i = this.node.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): { g: number; node: number } {
    const top = { g: this.g[0], node: this.node[0] };
    const last = this.node.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.g.pop();
    this.node.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.node.length && this.less(l, m)) m = l;
      if (r < this.node.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

export function aStarRouteToSpot(lot: LotModel, start: GridPoint, spot: Spot): AStarResult | null {
  const { rows, cols } = lot;
  const n = rows * cols;
  const id = (r: number, c: number) => r * cols + c;
  const h = (r: number, c: number) => Math.max(0, Math.abs(r - spot.row) + Math.abs(c - spot.col) - 1);
  const isGoal = (r: number, c: number) => Math.abs(r - spot.row) + Math.abs(c - spot.col) === 1;

  if (!walkable(lot, start[0], start[1])) return null;
  const g = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new OpenList();
  const s = id(start[0], start[1]);
  g[s] = 0;
  open.push(h(start[0], start[1]), 0, s);
  let expanded = 0;

  while (open.size > 0) {
    const { g: gNode, node } = open.pop();
    if (closed[node] || gNode > g[node]) continue; // an outdated copy left in the heap
    closed[node] = 1;
    expanded++;
    const r = Math.floor(node / cols);
    const c = node % cols;
    if (isGoal(r, c)) {
      const path: GridPoint[] = [];
      for (let k = node; k !== -1; k = prev[k]) path.unshift([Math.floor(k / cols), k % cols]);
      path.push([spot.row, spot.col]);
      return { spot, path, expanded };
    }
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (!walkable(lot, nr, nc)) continue;
      const next = id(nr, nc);
      const tentative = gNode + 1;
      if (tentative < g[next]) {
        g[next] = tentative;
        prev[next] = node;
        open.push(tentative + h(nr, nc), tentative, next);
      }
    }
  }
  return null;
}
