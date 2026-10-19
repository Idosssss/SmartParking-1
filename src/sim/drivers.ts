import type { Rng } from './rng';
import { visibleSpots, type LotGraph } from './graph';

/**
 * How a driver finds a spot. All distances are in cells (see graph.ts).
 *
 *  - appRoute:       the app. It knows every spot's state (from the sensors) and sends the car
 *                    down the shortest path (Dijkstra) to the nearest free spot.
 *  - explorerSearch: a driver without the app who is sensible: looks down the aisle, takes the
 *                    nearest free spot they can see, otherwise drives to the nearest part of the
 *                    lot they have not looked at yet. Never wastes time re-checking places
 *                    they already saw. This is deliberately a strong baseline (it favours "no app").
 *  - wandererSearch: a driver who just follows the lanes (random turns, no U-turns unless forced)
 *                    and takes the first free spot they see. A weaker, more pessimistic baseline.
 */

export type Occupancy = ArrayLike<number | boolean>;

export interface AppRoute {
  spot: number;
  cells: number;
}

export interface SearchResult {
  /** Index of the spot the driver ended up in, or -1 if they never found one. */
  spot: number;
  /** Total driving distance from the entrance to the spot (or to the end of the search), in cells. */
  cells: number;
  /** Lane nodes passed through, starting at the entrance. Only filled when `wantPath` is true. */
  path: number[];
  /** Where the driver was when the search ended (needed to price the drive back out of a full lot). */
  endNode: number;
}

/** The app: nearest free spot by driving distance from the entrance. Ties go to the lowest spot number. */
export function appRoute(g: LotGraph, occ: Occupancy): AppRoute | null {
  let best = -1;
  let bestCells = Infinity;
  for (let s = 0; s < g.spots.length; s++) {
    if (occ[s]) continue;
    if (g.fromEntrance[s] < bestCells) {
      bestCells = g.fromEntrance[s];
      best = s;
    }
  }
  return best < 0 ? null : { spot: best, cells: bestCells };
}

/** Lane nodes of the shortest drive from `from` to `to` (both included). */
export function nodePath(g: LotGraph, from: number, to: number): number[] {
  const nodes = [from];
  let cur = from;
  while (cur !== to) {
    cur = g.firstHop[cur][to];
    nodes.push(cur);
  }
  return nodes;
}

/** Cheapest visible free spot from `pos` (drive distance, ties to lowest index), also marking everything visible as seen. */
function lookAround(g: LotGraph, vis: number[][], pos: number, occ: Occupancy, seen: Uint8Array) {
  let spot = -1;
  let access = -1;
  let cost = Infinity;
  for (const s of vis[pos]) {
    seen[s] = 1;
    if (occ[s]) continue;
    for (const a of g.spots[s].access) {
      const c = g.allDist[pos][a] + 1;
      if (c < cost) {
        cost = c;
        spot = s;
        access = a;
      }
    }
  }
  return { spot, access, cost };
}

export function explorerSearch(g: LotGraph, occ: Occupancy, sightCells: number, rng: Rng, wantPath = false): SearchResult {
  const vis = visibleSpots(g, sightCells);
  const seen = new Uint8Array(g.spots.length);
  const nNodes = g.laneCells.length;
  let pos = g.entranceNode;
  let cells = 0;
  const path: number[] = wantPath ? [pos] : [];

  for (let guard = 0; guard < 100000; guard++) {
    const found = lookAround(g, vis, pos, occ, seen);
    if (found.spot >= 0) {
      if (wantPath) path.push(...nodePath(g, pos, found.access).slice(1));
      return { spot: found.spot, cells: cells + found.cost, path, endNode: found.access };
    }

    // Nothing free in sight: head for the closest lane cell that still has spots we have not looked at.
    let target = -1;
    let bestDist = Infinity;
    let ties = 0;
    for (let q = 0; q < nNodes; q++) {
      let unseen = false;
      for (const s of g.adjacentSpots[q]) {
        if (!seen[s]) {
          unseen = true;
          break;
        }
      }
      if (!unseen) continue;
      const d = g.allDist[pos][q];
      if (d < bestDist) {
        bestDist = d;
        target = q;
        ties = 1;
      } else if (d === bestDist) {
        ties++;
        if (rng() * ties < 1) target = q;
      }
    }
    if (target < 0) return { spot: -1, cells, path, endNode: pos };

    pos = g.firstHop[pos][target];
    cells += 1;
    if (wantPath) path.push(pos);
  }
  return { spot: -1, cells, path, endNode: pos };
}

export function wandererSearch(g: LotGraph, occ: Occupancy, sightCells: number, rng: Rng, wantPath = false): SearchResult {
  const vis = visibleSpots(g, sightCells);
  const seen = new Uint8Array(g.spots.length);
  let pos = g.entranceNode;
  let from = -1;
  let cells = 0;
  const path: number[] = wantPath ? [pos] : [];

  for (let guard = 0; guard < 100000; guard++) {
    const found = lookAround(g, vis, pos, occ, seen);
    if (found.spot >= 0) {
      if (wantPath) path.push(...nodePath(g, pos, found.access).slice(1));
      return { spot: found.spot, cells: cells + found.cost, path, endNode: found.access };
    }
    const options = g.adj[pos].filter((e) => e.to !== from);
    const pool = options.length > 0 ? options : g.adj[pos];
    const next = pool[Math.floor(rng() * pool.length)].to;
    from = pos;
    pos = next;
    cells += 1;
    if (wantPath) path.push(pos);
  }
  return { spot: -1, cells, path, endNode: pos };
}

/**
 * A driver who arrives at a completely full lot without the app: they tour everything, find nothing
 * and drive back out. Returns the length of that wasted trip in cells. (With the app they would see
 * "lot full" before turning in, so the wasted trip is 0.)
 */
export function futileTourCells(g: LotGraph, sightCells: number, rng: Rng): number {
  const allFull = new Uint8Array(g.spots.length).fill(1);
  const res = explorerSearch(g, allFull, sightCells, rng);
  return res.cells + g.allDist[res.endNode][g.entranceNode];
}
