import { explorerSearch, nodePath } from './drivers';
import type { LotGraph } from './graph';
import { hashSeed, mulberry32 } from './rng';

/**
 * Second-by-second traffic inside the lot, to answer two questions the main study does not:
 *
 *   1. Can two drivers be sent to the same spot? (Only if the app does not reserve the spot.)
 *   2. Does sending everyone to the spot nearest the entrance jam the first aisle?
 *
 * The model, kept small on purpose:
 *   - Cars drive along lane cells. A lane cell holds one car going in and one going out (aisles
 *     are two-way), so a car waits when the cell ahead is occupied in its direction.
 *   - Turning into a spot takes `parkSec`, pulling out takes `leaveSec`. Meanwhile the car stands
 *     in the lane cell next to the spot and blocks it both ways. This is the bottleneck in question.
 *   - Cars that arrive while the entrance cell is occupied wait in a queue at the gate.
 *   - Speed and cell size are the main study's (10 km/h, 3.6 m per cell: 1.3 s per cell).
 *
 * Policies:
 *   nearest          the app as graded: the nearest spot that is not parked in. Cars already on
 *                    their way are not taken into account, so two cars can be sent to one spot.
 *   reserved         the nearest spot that is free and not held for another driver. When the app
 *                    sends a car, it holds that spot until the car is in it.
 *   balanced         reserved, plus a small penalty for aisles other guided cars are heading into
 *                    (`aislePenaltyCells` per car), so a rush spreads over the aisles.
 *   driver           no app: the main study's sensible driver (looks down the aisles), who only
 *                    knows the parked cars they can see.
 */

export type TrafficPolicy = 'nearest' | 'reserved' | 'balanced' | 'driver';

export interface TrafficParams {
  cellSec: number;
  parkSec: number;
  leaveSec: number;
  dtSec: number;
  aislePenaltyCells: number;
  sightCells: number;
}

export const DEFAULT_TRAFFIC: TrafficParams = {
  cellSec: 3.6 / (10 / 3.6), // 3.6 m at 10 km/h
  parkSec: 20, // turning in, straightening up (forward parking, a typical 15-30 s)
  leaveSec: 15,
  dtSec: 0.25,
  aislePenaltyCells: 3,
  sightCells: 4,
};

export interface TrafficArrival {
  /** Seconds from the start. */
  t: number;
  /** Seconds the car stays parked. */
  dwell: number;
}

export interface TrafficResult {
  policy: TrafficPolicy;
  cars: number;
  parked: number;
  /** Turned away at the gate (the lot, or every spot the app could offer, was full). */
  turnedAway: number;
  /** Cars that reached their spot and found it taken by someone else. */
  conflicts: number;
  /** Seconds from arriving at the gate to standing in the spot, one entry per parked car. */
  gateToParked: number[];
  /** Seconds waited at the gate before entering, per car that entered. */
  gateWait: number[];
  /** Seconds a car stood still because the cell ahead was occupied or blocked, per parked car. */
  stuck: number[];
  /** Lane cells driven from the gate to the spot, per parked car. */
  cells: number[];
  maxGateQueue: number;
  /** Times two cars waited on each other for over a minute and one was let through (should stay ~0). */
  deadlocks: number;
}

type CarState = 'driving' | 'waitPark' | 'parking' | 'parked' | 'waitUnpark' | 'unparking' | 'leaving' | 'gone';

interface Car {
  id: number;
  arrive: number;
  dwell: number;
  state: CarState;
  node: number;
  /** Which slot of `node` the car holds while driving: 0 = going in, 1 = going out. */
  dir: 0 | 1;
  path: number[];
  step: number;
  readyAt: number;
  timerAt: number;
  target: number;
  access: number;
  entered: number;
  stuck: number;
  cells: number;
  leaveAt: number;
  /** Seconds the car has been standing still in a row (for the deadlock safety valve). */
  waited: number;
}

export function runTraffic(g: LotGraph, arrivals: TrafficArrival[], policy: TrafficPolicy, tp: TrafficParams = DEFAULT_TRAFFIC, seed = 1): TrafficResult {
  const nNodes = g.laneCells.length;
  const nSpots = g.spots.length;
  const dE = g.allDist[g.entranceNode];
  const slots = [new Int32Array(nNodes).fill(-1), new Int32Array(nNodes).fill(-1)];
  const manoeuvre = new Int32Array(nNodes).fill(-1); // a car turning in or out blocks the cell
  const parkedIn = new Uint8Array(nSpots);
  const held = new Int32Array(nSpots).fill(-1); // reserved for (or being turned into by) this car
  // The aisle a spot is reached from (its lane row), for the balanced policy.
  const aisleOf = g.spots.map((s) => g.laneCells[s.access.reduce((a, b) => (dE[b] < dE[a] ? b : a))][0]);
  const reserving = policy === 'reserved' || policy === 'balanced';

  const res: TrafficResult = { policy, cars: arrivals.length, parked: 0, turnedAway: 0, conflicts: 0, gateToParked: [], gateWait: [], stuck: [], cells: [], maxGateQueue: 0, deadlocks: 0 };
  const cars: Car[] = [];
  const active: Car[] = [];
  const queue: Car[] = [];
  let next = 0;

  // A spot can be offered when nobody is parked in it and it is not held for (or being turned into by) another car.
  const offer = (s: number, by: Car) => !parkedIn[s] && (held[s] === -1 || held[s] === by.id);
  // What the app (or the driver) picks, from a lane node.
  const choose = (car: Car, from: number): number => {
    if (policy === 'driver') {
      if (from === g.entranceNode) {
        const seen = Uint8Array.from(parkedIn, (p, s) => (p || (held[s] !== -1 && held[s] !== car.id) ? 1 : 0));
        const found = explorerSearch(g, seen, tp.sightCells, mulberry32(hashSeed(seed, car.id)), true);
        if (found.spot < 0) return -1;
        car.path = found.path; // the whole search drive, ending next to the spot they found
        return found.spot;
      }
    }
    const load = new Map<number, number>();
    if (policy === 'balanced') {
      for (const c of active) if (c.state === 'driving' || c.state === 'waitPark' || c.state === 'parking') load.set(aisleOf[c.target], (load.get(aisleOf[c.target]) ?? 0) + 1);
    }
    let best = -1;
    let bestCost = Infinity;
    for (let s = 0; s < nSpots; s++) {
      if (!offer(s, car)) continue;
      const d = Math.min(...g.spots[s].access.map((a) => g.allDist[from][a])) + 1;
      const cost = d + (policy === 'balanced' ? tp.aislePenaltyCells * (load.get(aisleOf[s]) ?? 0) : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = s;
      }
    }
    return best;
  };

  const headFor = (car: Car, spot: number, from: number) => {
    car.target = spot;
    if (policy === 'driver' && from === g.entranceNode) {
      car.access = car.path[car.path.length - 1];
    } else {
      car.access = g.spots[spot].access.reduce((a, b) => (g.allDist[from][b] < g.allDist[from][a] ? b : a));
      car.path = nodePath(g, from, car.access);
    }
    car.step = 0;
    if (reserving) held[spot] = car.id;
  };

  const leaveBy = (car: Car, t: number) => {
    car.state = 'leaving';
    car.path = nodePath(g, car.node, g.entranceNode);
    car.step = 0;
    car.readyAt = t;
  };

  const end = (arrivals.length ? arrivals[arrivals.length - 1].t : 0) + 6 * 3600;
  for (let t = 0; t <= end; t += tp.dtSec) {
    while (next < arrivals.length && arrivals[next].t <= t) {
      const a = arrivals[next];
      const car: Car = { id: next, arrive: a.t, dwell: a.dwell, state: 'driving', node: -1, dir: 0, path: [], step: 0, readyAt: 0, timerAt: 0, target: -1, access: -1, entered: -1, stuck: 0, cells: 0, leaveAt: 0, waited: 0 };
      cars.push(car);
      queue.push(car);
      next++;
    }
    res.maxGateQueue = Math.max(res.maxGateQueue, queue.length);

    // The gate: one car at a time onto the entrance cell.
    while (queue.length && slots[0][g.entranceNode] === -1 && manoeuvre[g.entranceNode] === -1) {
      const car = queue.shift()!;
      const spot = choose(car, g.entranceNode);
      if (spot < 0) {
        res.turnedAway++;
        car.state = 'gone';
        continue;
      }
      headFor(car, spot, g.entranceNode);
      car.node = g.entranceNode;
      car.dir = 0;
      slots[0][car.node] = car.id;
      car.entered = t;
      car.readyAt = t + tp.cellSec;
      res.gateWait.push(t - car.arrive);
      active.push(car);
      break; // the next car follows once this one has moved on
    }

    for (const car of active) {
      switch (car.state) {
        case 'driving':
        case 'leaving': {
          if (t < car.readyAt) break;
          if (car.step === car.path.length - 1) {
            if (car.state === 'leaving') {
              if (slots[car.dir][car.node] === car.id) slots[car.dir][car.node] = -1;
              car.state = 'gone';
              break;
            }
            car.state = 'waitPark';
            // falls through to waitPark on the next tick
            break;
          }
          const to = car.path[car.step + 1];
          const dir: 0 | 1 = dE[to] > dE[car.node] ? 0 : 1;
          const blocked = slots[dir][to] !== -1 || manoeuvre[to] !== -1;
          if (blocked && car.waited < 60) {
            car.stuck += tp.dtSec;
            car.waited += tp.dtSec;
            break;
          }
          if (blocked) res.deadlocks++; // a minute without moving: let it squeeze past, and count it
          car.waited = 0;
          if (slots[car.dir][car.node] === car.id) slots[car.dir][car.node] = -1;
          if (slots[dir][to] === -1) slots[dir][to] = car.id;
          car.node = to;
          car.dir = dir;
          car.step++;
          car.readyAt = t + tp.cellSec;
          if (car.state === 'driving') car.cells++;
          break;
        }
        case 'waitPark': {
          const taken = parkedIn[car.target] || (held[car.target] !== -1 && held[car.target] !== car.id);
          if (taken) {
            // Someone else got there first: find another spot from here.
            res.conflicts++;
            const spot = choose(car, car.node);
            if (spot < 0) {
              res.turnedAway++;
              leaveBy(car, t);
              break;
            }
            headFor(car, spot, car.node);
            car.state = 'driving';
            car.readyAt = t;
            break;
          }
          if (manoeuvre[car.node] !== -1 && car.waited < 60) {
            car.stuck += tp.dtSec;
            car.waited += tp.dtSec;
            break;
          }
          if (manoeuvre[car.node] !== -1) res.deadlocks++;
          car.waited = 0;
          manoeuvre[car.node] = car.id;
          if (slots[car.dir][car.node] === car.id) slots[car.dir][car.node] = -1;
          held[car.target] = car.id; // being turned into: nobody else can have it now
          car.state = 'parking';
          car.timerAt = t + tp.parkSec;
          break;
        }
        case 'parking':
          if (t < car.timerAt) break;
          if (manoeuvre[car.node] === car.id) manoeuvre[car.node] = -1;
          parkedIn[car.target] = 1;
          held[car.target] = -1;
          car.state = 'parked';
          car.leaveAt = t + car.dwell;
          res.parked++;
          res.gateToParked.push(t - car.arrive);
          res.stuck.push(car.stuck);
          res.cells.push(car.cells);
          break;
        case 'parked':
          if (t >= car.leaveAt) car.state = 'waitUnpark';
          break;
        case 'waitUnpark':
          if (manoeuvre[car.node] !== -1 && car.waited < 60) {
            car.waited += tp.dtSec;
            break;
          }
          if (manoeuvre[car.node] !== -1) res.deadlocks++;
          car.waited = 0;
          manoeuvre[car.node] = car.id;
          car.state = 'unparking';
          car.timerAt = t + tp.leaveSec;
          break;
        case 'unparking':
          if (t < car.timerAt || (slots[1][car.node] !== -1 && car.waited < 60)) {
            if (t >= car.timerAt) car.waited += tp.dtSec;
            break;
          }
          if (slots[1][car.node] !== -1) res.deadlocks++;
          car.waited = 0;
          if (manoeuvre[car.node] === car.id) manoeuvre[car.node] = -1;
          parkedIn[car.target] = 0;
          if (slots[1][car.node] === -1) slots[1][car.node] = car.id;
          car.dir = 1;
          leaveBy(car, t + tp.cellSec);
          break;
      }
    }
    for (let i = active.length - 1; i >= 0; i--) if (active[i].state === 'gone') active.splice(i, 1);
    // Every car has arrived and is either parked or gone: nothing left to measure.
    if (next >= arrivals.length && queue.length === 0 && active.every((c) => c.state === 'parked')) break;
  }
  return res;
}
