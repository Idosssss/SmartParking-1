import type { GridPoint, LotModel } from '../lot/types';
import { dijkstra, type Edge } from './dijkstra';

/**
 * The lot as a graph for the simulation. Nodes are the drivable cells (lane + entrance).
 * Every move to a neighbouring lane cell costs 1 "cell"; entering a spot from its lane cell
 * costs 1 more. That is exactly how `src/lot/pathfinding.ts` measures a route, so distances
 * here match the live app. Everything is in whole cells; the engine converts to metres at the end.
 */

export interface SimSpot {
  id: string;
  row: number;
  col: number;
  /** Lane nodes next to this spot (where a car can turn in from). */
  access: number[];
}

export interface LotGraph {
  lot: LotModel;
  laneCells: GridPoint[];
  nodeAt: Map<string, number>;
  adj: Edge[][];
  entranceNode: number;
  spots: SimSpot[];
  /** For each lane node: indices of the spots that touch it. */
  adjacentSpots: number[][];
  /** allDist[s][t] = shortest drive between two lane nodes, in cells. */
  allDist: number[][];
  /** firstHop[s][t] = the neighbour of s to step to on a shortest path towards t (-1 if s === t). */
  firstHop: number[][];
  /** Drive from the entrance to each spot (cells, includes the last step into the spot). */
  fromEntrance: number[];
  /** Cached "what can a driver see from here" tables, keyed by sight distance. */
  sightCache: Map<number, number[][]>;
}

const DIRS: GridPoint[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const key = (r: number, c: number) => `${r},${c}`;

export function buildLotGraph(lot: LotModel): LotGraph {
  const laneCells: GridPoint[] = [];
  const nodeAt = new Map<string, number>();
  for (let r = 0; r < lot.rows; r++) {
    for (let c = 0; c < lot.cols; c++) {
      const type = lot.cells[r][c].type;
      if (type === 'lane' || type === 'entrance') {
        nodeAt.set(key(r, c), laneCells.length);
        laneCells.push([r, c]);
      }
    }
  }

  const adj: Edge[][] = laneCells.map(([r, c]) => {
    const edges: Edge[] = [];
    for (const [dr, dc] of DIRS) {
      const to = nodeAt.get(key(r + dr, c + dc));
      if (to !== undefined) edges.push({ to, w: 1 });
    }
    return edges;
  });

  const spots: SimSpot[] = lot.spots.map((s) => {
    const access: number[] = [];
    for (const [dr, dc] of DIRS) {
      const node = nodeAt.get(key(s.row + dr, s.col + dc));
      if (node !== undefined) access.push(node);
    }
    return { id: s.id, row: s.row, col: s.col, access };
  });

  const adjacentSpots: number[][] = laneCells.map(() => []);
  spots.forEach((s, i) => {
    for (const a of s.access) adjacentSpots[a].push(i);
  });

  const n = laneCells.length;
  const allDist: number[][] = [];
  for (let s = 0; s < n; s++) allDist.push(dijkstra(adj, s).dist);

  const firstHop: number[][] = [];
  for (let s = 0; s < n; s++) {
    const row = new Array<number>(n).fill(-1);
    for (let t = 0; t < n; t++) {
      if (s === t) continue;
      for (const { to, w } of adj[s]) {
        if (allDist[to][t] + w === allDist[s][t]) {
          row[t] = to;
          break;
        }
      }
    }
    firstHop.push(row);
  }

  const entranceNode = nodeAt.get(key(lot.entrance.row, lot.entrance.col))!;
  const fromEntrance = spots.map((s) => Math.min(...s.access.map((a) => allDist[entranceNode][a])) + 1);

  return { lot, laneCells, nodeAt, adj, entranceNode, spots, adjacentSpots, allDist, firstHop, fromEntrance, sightCache: new Map() };
}

/**
 * What a driver standing on each lane node can see: every spot that touches a lane cell within
 * `sightCells` cells in a straight line (up, down, left or right) along drivable cells, plus the
 * spots touching the driver's own cell. This is "look down the aisle", not x-ray vision.
 */
export function visibleSpots(g: LotGraph, sightCells: number): number[][] {
  const cached = g.sightCache.get(sightCells);
  if (cached) return cached;

  const table: number[][] = g.laneCells.map(([r, c]) => {
    const seen = new Set<number>();
    const addNode = (node: number) => {
      for (const s of g.adjacentSpots[node]) seen.add(s);
    };
    addNode(g.nodeAt.get(key(r, c))!);
    for (const [dr, dc] of DIRS) {
      for (let step = 1; step <= sightCells; step++) {
        const node = g.nodeAt.get(key(r + dr * step, c + dc * step));
        if (node === undefined) break; // the lane ends or turns, line of sight is blocked
        addNode(node);
      }
    }
    return [...seen].sort((a, b) => a - b);
  });

  g.sightCache.set(sightCells, table);
  return table;
}
