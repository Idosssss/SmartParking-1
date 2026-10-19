/**
 * Dijkstra's shortest-path algorithm (E. W. Dijkstra, 1959) on a weighted graph.
 *
 * The app finds the nearest free spot by running this from the entrance and taking the
 * free spot with the smallest distance. In our lot every move costs one cell, so the
 * result is identical to the breadth-first search used in `src/lot/pathfinding.ts`
 * (BFS is Dijkstra with all edge weights equal). This version keeps the general weights so
 * the same code keeps working if edges ever get different costs (one-way aisles, speed
 * bumps, longer aisles...).
 */

export interface Edge {
  to: number;
  w: number;
}

export interface DijkstraResult {
  /** dist[i] = length of the shortest path from the source to node i (Infinity if unreachable). */
  dist: number[];
  /** prev[i] = node before i on that shortest path (-1 for the source / unreachable). */
  prev: number[];
  /** Nodes in the order Dijkstra "settled" them (final distance known). Used for the visual walkthrough. */
  order: number[];
}

/** Minimal binary min-heap of [key, node] pairs. */
class MinHeap {
  private keys: number[] = [];
  private nodes: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, node: number) {
    const keys = this.keys;
    const nodes = this.nodes;
    let i = keys.length;
    keys.push(key);
    nodes.push(node);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      nodes[i] = nodes[parent];
      i = parent;
    }
    keys[i] = key;
    nodes[i] = node;
  }

  pop(): [number, number] {
    const keys = this.keys;
    const nodes = this.nodes;
    const topKey = keys[0];
    const topNode = nodes[0];
    const lastKey = keys.pop()!;
    const lastNode = nodes.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child];
        nodes[i] = nodes[child];
        i = child;
      }
      keys[i] = lastKey;
      nodes[i] = lastNode;
    }
    return [topKey, topNode];
  }
}

export function dijkstra(adj: Edge[][], source: number): DijkstraResult {
  const n = adj.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  const order: number[] = [];

  dist[source] = 0;
  const heap = new MinHeap();
  heap.push(0, source);

  while (heap.size > 0) {
    const [d, u] = heap.pop();
    if (done[u]) continue; // stale heap entry
    done[u] = true;
    order.push(u);
    for (const { to, w } of adj[u]) {
      const nd = d + w;
      if (nd < dist[to]) {
        dist[to] = nd;
        prev[to] = u;
        heap.push(nd, to);
      }
    }
  }

  return { dist, prev, order };
}
