import { useEffect, useRef, useState } from 'react';
import DemoSettingsMenu from './components/DemoSettingsMenu';
import EdgeCasePanel from './components/EdgeCasePanel';
import type { ScenarioId } from './components/scenarios';
import { speak, stopSpeaking } from './components/speech';
import './App.css';
import VirtualLot, { type CarVisual, type PingVisual } from './components/VirtualLot';
import PhoneApp, { type NavStatus } from './components/PhoneApp';
import ActivityFeed, { type ActivityEntry } from './components/ActivityFeed';
import LotHeader from './components/LotHeader';
import ReliabilityPanel from './components/ReliabilityPanel';
import SensorTrace from './components/SensorTrace';
import SessionPanel, { type SessionStats } from './components/SessionPanel';
import { Toasts } from './components/Toasts';
import { useToasts } from './components/useToasts';
import HardwarePanel from './components/HardwarePanel';
import { useHardware } from './hardware/useHardware';
import { generateLot } from './lot/generateLot';
import { findNearestFreeSpot, buildRouteToSpot, reachableSpotIds, withLaneClosed, type RouteResult } from './lot/pathfinding';
import { buildDirections } from './lot/directions';
import type { GridPoint, LotModel, Spot } from './lot/types';
import {
  DEFAULT_HARDWARE_SPOT_ID,
  DETECT_MS,
  NEXT_CAR_AFTER_ARRIVAL_MS,
  NEXT_CAR_MS,
  PING_MS,
  REROUTE_NOTICE_MS,
  SEARCH_MS,
  SENSOR_FAR_CM,
} from './config/constants';
import {
  ambientMsPerCell,
  DEFAULT_DEMO_SETTINGS,
  MAX_QUEUE,
  msPerCell,
  SCENARIO_TIMING,
  SPOT_STEALING,
  TRAFFIC_LEVELS,
  type DemoSettings,
} from './config/demoSettings';
import { loadDemoSettings, saveDemoSettings } from './config/storedSettings';
import { DEFAULT_PARAMS } from './sim/params';
import { ignoreShortcut } from './shortcuts';

interface AmbientCar {
  id: string;
  path: GridPoint[];
  spotId: string;
  startTime: number;
  /** Each car keeps the speed it started with, so changing the setting never makes it jump. */
  msPerCell: number;
  /** Guided by the app (its spot is held for it) or a driver without the app. */
  guided: boolean;
  /** Cells driven before the last reroute, for the session's average drive. */
  drivenBefore: number;
}

function angleFor(dr: number, dc: number): number {
  return (Math.atan2(dr, dc) * 180) / Math.PI;
}

/**
 * Interpolates a car's position/heading along a grid path at time `t`
 * (in cell units). `idx` always keeps a valid "next" point so the heading
 * stays correct on the final frame instead of snapping to a default angle.
 */
function carVisualFromPath(path: GridPoint[], t: number): CarVisual {
  const maxIdx = Math.max(path.length - 1, 0);
  if (maxIdx === 0) {
    const p = path[0] ?? [0, 0];
    return { row: p[0], col: p[1], angle: 0 };
  }
  const safeT = Number.isFinite(t) ? t : 0;
  const clampedT = Math.min(Math.max(safeT, 0), maxIdx);
  const idx = Math.min(Math.floor(clampedT), maxIdx - 1);
  const frac = clampedT - idx;
  const p0 = path[idx];
  const p1 = path[idx + 1];
  return {
    row: p0[0] + (p1[0] - p0[0]) * frac,
    col: p0[1] + (p1[1] - p0[1]) * frac,
    angle: angleFor(p1[0] - p0[0], p1[1] - p0[1]),
  };
}

/** A readable name for one lane cell of the demo lot, for the activity feed. */
function laneName(row: number, col: number): string {
  if (col === 0) return `the main lane at row ${row + 1}`;
  const aisle = row === 1 ? 'the top aisle' : row === 5 ? 'the bottom aisle' : 'the entrance road';
  return `${aisle} at column ${col + 1}`;
}

const NO_SPOTS = new Set<string>();

function unreachableIds(lot: LotModel, reachable: Set<string>): Set<string> {
  return new Set(lot.spots.filter((s) => !reachable.has(s.id)).map((s) => s.id));
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** The live demo. `active` is false while another page is showing (the demo keeps running, hidden). */
function App({ active = true }: { active?: boolean }) {
  const [lot, setLot] = useState(() => generateLot());
  const [userStatus, setUserStatus] = useState<NavStatus>('idle');
  const [userRoute, setUserRoute] = useState<RouteResult | null>(null);
  const [userRouteStart, setUserRouteStart] = useState<number | null>(null);
  const [rerouteNotice, setRerouteNotice] = useState<string | null>(null);
  const [ambientCars, setAmbientCars] = useState<AmbientCar[]>([]);
  const [pings, setPings] = useState<{ id: string; row: number; col: number; startTime: number }[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [liveTraffic, setLiveTraffic] = useState(false);
  const [clock, setClock] = useState(() => performance.now());
  const [session, setSession] = useState<SessionStats>(() => ({ startedAt: Date.now(), trips: 0, drivenCells: 0, reroutes: 0, sensorConfirmed: 0 }));
  const hw = useHardware();
  const { toasts, notify, dismiss } = useToasts();
  const [hardwareSpotId, setHardwareSpotId] = useState(DEFAULT_HARDWARE_SPOT_ID);
  const [preferRealSpot, setPreferRealSpot] = useState(true);
  // False while the real sensor is waiting to be moved/cleared after a car parked in its spot.
  const [hwArmed, setHwArmed] = useState(true);
  const hwControls = hw.active && hwArmed;
  const [settings, setSettings] = useState<DemoSettings>(loadDemoSettings);
  // Cars waiting at the gate: another car is being guided, or no free spot can be reached yet.
  const [queue, setQueue] = useState(0);
  const [lastScenario, setLastScenario] = useState<ScenarioId | null>(null);
  const cellMs = msPerCell(settings);

  const hwActiveRef = useRef(hw.active);
  const hardwareSpotIdRef = useRef(hardwareSpotId);
  const preferRealSpotRef = useRef(preferRealSpot);
  const hwArmedRef = useRef(hwArmed);
  // Spots where a car really parked (confirmed by the sensor). The simulation must never free these.
  const realParkedRef = useRef<Set<string>>(new Set());
  const hwControlsRef = useRef(hwControls);
  const hwSpotOccupiedRef = useRef(hw.spotOccupied);
  const lotRef = useRef(lot);
  const userStatusRef = useRef(userStatus);
  const userRouteRef = useRef(userRoute);
  const userRouteStartRef = useRef(userRouteStart);
  const ambientCarsRef = useRef(ambientCars);
  const pingsRef = useRef(pings);
  const idCounter = useRef(0);
  const settingsRef = useRef(settings);
  const queueRef = useRef(queue);
  // Set by the "Someone takes your spot" scenario: the next route gets a rival car.
  const stealNextRef = useRef(false);
  const scenarioTimers = useRef<number[]>([]);
  // Set by the "Noisy sensor reading" scenario: did the entrance report a car during the spike?
  const glitchWatch = useRef<{ until: number; triggered: boolean } | null>(null);

  useEffect(() => {
    lotRef.current = lot;
  }, [lot]);
  useEffect(() => {
    userStatusRef.current = userStatus;
  }, [userStatus]);
  useEffect(() => {
    userRouteRef.current = userRoute;
  }, [userRoute]);
  useEffect(() => {
    userRouteStartRef.current = userRouteStart;
  }, [userRouteStart]);
  useEffect(() => {
    ambientCarsRef.current = ambientCars;
  }, [ambientCars]);
  useEffect(() => {
    pingsRef.current = pings;
  }, [pings]);
  useEffect(() => {
    hwActiveRef.current = hw.active;
    hwSpotOccupiedRef.current = hw.spotOccupied;
    hardwareSpotIdRef.current = hardwareSpotId;
    preferRealSpotRef.current = preferRealSpot;
    hwArmedRef.current = hwArmed;
    hwControlsRef.current = hwControls;
  }, [hw.active, hw.spotOccupied, hardwareSpotId, preferRealSpot, hwArmed, hwControls]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const nextId = (prefix: string) => `${prefix}${idCounter.current++}`;

  const logActivity = (text: string, kind: ActivityEntry['kind']) => {
    setActivity((prev) => [{ id: nextId('a'), time: timeNow(), text, kind }, ...prev].slice(0, 40));
  };

  const addPing = (row: number, col: number) => {
    const now = performance.now();
    setPings((prev) => [...prev, { id: nextId('p'), row, col, startTime: now }]);
    setClock((prevClock) => Math.max(prevClock, now));
  };

  const freeCount = lot.spots.filter((s) => !s.occupied).length;
  const reachable = reachableSpotIds(lot);
  const reachableFree = lot.spots.filter((s) => !s.occupied && reachable.has(s.id)).length;
  // Spots held for app drivers on their way: shown on the map, never offered to anyone else.
  const heldNow = new Set(ambientCars.filter((c) => c.guided).map((c) => c.spotId));
  if (userRoute && userStatus === 'navigating') heldNow.add(userRoute.spot.id);
  const offerable = lot.spots.filter((s) => !s.occupied && reachable.has(s.id) && !heldNow.has(s.id)).length;
  // The lot can be edited between trips, including while the phone still shows "You've arrived".
  const interactive = userStatus === 'idle' || userStatus === 'arrived';

  const toggleSpot = (id: string) => {
    if (!interactive) return;
    const spot = lot.spots.find((s) => s.id === id);
    if (!spot) return;
    if (hw.active && id === hardwareSpotId) {
      logActivity(`Spot ${id} is driven by the real D35 sensor. Move something in front of it.`, 'info');
      return;
    }
    const willBeOccupied = !spot.occupied;
    if (!willBeOccupied) realParkedRef.current.delete(id);
    setLot((prev) => ({
      ...prev,
      spots: prev.spots.map((s) => (s.id === id ? { ...s, occupied: willBeOccupied } : s)),
    }));
    addPing(spot.row, spot.col);
    logActivity(`Spot ${id} sensor → ${willBeOccupied ? 'OCCUPIED' : 'FREE'}`, 'info');
  };

  // Roadwork: click a lane to close it, click again to reopen it.
  const toggleLane = (row: number, col: number) => {
    if (!interactive) return;
    const cell = lot.cells[row]?.[col];
    if (cell?.type !== 'lane') return;
    const closing = !cell.closed;
    setLot((prev) => withLaneClosed(prev, row, col, closing));
    if (closing) {
      // Simulated cars that still have to pass the barrier turn back instead of driving through it.
      const now = performance.now();
      const ahead = (c: AmbientCar) => c.path.slice(Math.floor((now - c.startTime) / c.msPerCell)).some(([r, cc]) => r === row && cc === col);
      setAmbientCars((prev) => (prev.some(ahead) ? prev.filter((c) => !ahead(c)) : prev));
    }
    logActivity(closing ? `Roadwork: ${laneName(row, col)} is closed` : `${laneName(row, col)} is open again`.replace(/^t/, 'T'), closing ? 'warning' : 'success');
  };

  // Drag the HW tag onto another spot to choose which spot the real sensor controls.
  const moveHardwareSpot = (id: string) => {
    if (!interactive || id === hardwareSpotId) return;
    const previous = hardwareSpotId;
    setHardwareSpotId(id);
    // If a car is still in front of the sensor it already parked at the old spot, so wait for it to clear.
    setHwArmed(!(hw.active && hw.spotOccupied));
    if (hw.active && !realParkedRef.current.has(previous)) {
      setLot((prev) => ({
        ...prev,
        spots: prev.spots.map((s) => (s.id === previous ? { ...s, occupied: false } : s)),
      }));
    }
    logActivity(`Real sensors moved from Spot ${previous} to Spot ${id}`, 'info');
  };

  const handleReset = () => {
    setUserRoute(null);
    setUserRouteStart(null);
    setUserStatus('idle');
    setRerouteNotice(null);
  };

  const updateSettings = (patch: Partial<DemoSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    // A new speed keeps the car where it is: rescale the time it has been driving.
    const oldMs = msPerCell(settingsRef.current);
    const newMs = msPerCell(next);
    if (newMs !== oldMs && userRouteStartRef.current !== null) {
      const now = performance.now();
      const rebased = now - (now - userRouteStartRef.current) * (newMs / oldMs);
      userRouteStartRef.current = rebased;
      setUserRouteStart(rebased);
    }
    if (!next.voice) stopSpeaking();
    settingsRef.current = next;
    setSettings(next);
    saveDemoSettings(next);
  };

  const clearScenarioTimers = () => {
    scenarioTimers.current.forEach((t) => clearTimeout(t));
    scenarioTimers.current = [];
    glitchWatch.current = null;
    stealNextRef.current = false;
  };
  useEffect(() => clearScenarioTimers, []);

  const later = (ms: number, run: () => void) => {
    scenarioTimers.current.push(window.setTimeout(run, ms));
  };

  /**
   * Starts from a clean lot: no trip, no simulated cars, nobody waiting, every lane open, and exactly
   * the given spots taken. The emulator is switched off; a connected board keeps driving its spot.
   */
  const prepareLot = (taken: (id: string) => boolean, closed: [number, number][] = []) => {
    clearScenarioTimers();
    handleReset();
    stopSpeaking();
    ambientCarsRef.current = [];
    setAmbientCars([]);
    queueRef.current = 0;
    setQueue(0);
    // The emulator would steer cars to its spot and spoil the set-up; a real board keeps its spot.
    if (hw.source === 'emulator') hw.emulator.setOn(false);
    const keep = hw.source === 'serial' ? hardwareSpotId : null;
    realParkedRef.current = new Set([...realParkedRef.current].filter((id) => id === keep));
    setLot((prev) => {
      let next: LotModel = {
        ...prev,
        cells: prev.cells.map((r) => r.map((c) => (c.closed ? { ...c, closed: false } : c))),
        spots: prev.spots.map((s) => (s.id === keep ? s : { ...s, occupied: taken(s.id) })),
      };
      for (const [r, c] of closed) next = withLaneClosed(next, r, c, true);
      return next;
    });
  };

  const sendCarIn = () => {
    setUserStatus('detecting');
    logActivity('Entrance sensor triggered — car detected', 'info');
  };

  const queueCars = (n: number, reason: string) => {
    queueRef.current = n;
    setQueue(n);
    logActivity(reason, 'warning');
  };

  const resetLot = () => {
    prepareLot(() => false);
    setLiveTraffic(false);
    setLastScenario(null);
    logActivity('Lot emptied: every spot free and every lane open', 'info');
  };

  const spotNumber = (id: string) => Number(id.slice(1));

  const runScenario = (id: ScenarioId) => {
    setLastScenario(id);
    switch (id) {
      case 'one-left':
        prepareLot((s) => s !== 'S8');
        setLiveTraffic(false);
        sendCarIn();
        break;
      case 'stolen':
        prepareLot((s) => s === 'S25' || s === 'S26');
        setLiveTraffic(false);
        stealNextRef.current = true;
        sendCarIn();
        break;
      case 'full':
        prepareLot(() => true);
        setLiveTraffic(false);
        queueCars(1, 'Car at the entrance but the lot is full. It waits at the gate for a spot to free up.');
        later(SCENARIO_TIMING.driverLeavesMs, () => {
          setLot((prev) => ({ ...prev, spots: prev.spots.map((s) => (s.id === 'S28' ? { ...s, occupied: false } : s)) }));
          const spot = lotRef.current.spots.find((s) => s.id === 'S28');
          if (spot) addPing(spot.row, spot.col);
          logActivity('A driver leaves Spot S28', 'ambient');
        });
        break;
      case 'roadwork':
        prepareLot((s) => s !== 'S14' && s !== 'S22', [[5, 3]]);
        setLiveTraffic(false);
        logActivity(`Roadwork: ${laneName(5, 3)} is closed`, 'warning');
        sendCarIn();
        break;
      case 'no-way-in':
        prepareLot((s) => spotNumber(s) >= 17, [[3, 0]]);
        setLiveTraffic(false);
        logActivity(`Roadwork: ${laneName(3, 0)} is closed`, 'warning');
        queueCars(1, 'Car at the entrance, but every way to the free spots is closed. It waits at the gate.');
        break;
      case 'line':
        prepareLot(() => false);
        setLiveTraffic(false);
        sendCarIn();
        logActivity('Three app drivers arrive together', 'info');
        // The phone's car is being detected; the other two are guided at the same time, each to a held spot.
        later(SCENARIO_TIMING.secondDriverMs, () => guideAnotherDriver());
        later(SCENARIO_TIMING.thirdDriverMs, () => guideAnotherDriver());
        break;
      case 'rush':
        prepareLot((s) => spotNumber(s) % 3 !== 0);
        updateSettings({ traffic: 'busy' });
        setLiveTraffic(true);
        sendCarIn();
        break;
      case 'glitch': {
        prepareLot(() => false);
        setLiveTraffic(false);
        hw.emulator.setEntranceCm(SENSOR_FAR_CM);
        hw.emulator.setOn(true);
        // Give the emulator a moment to stream "nothing there", then one short spike.
        later(SCENARIO_TIMING.glitchSettleMs, () => {
          glitchWatch.current = { until: performance.now() + 1500, triggered: false };
          hw.emulator.setEntranceCm(5);
          later(SCENARIO_TIMING.glitchSpikeMs, () => hw.emulator.setEntranceCm(SENSOR_FAR_CM));
        });
        later(SCENARIO_TIMING.glitchReportMs, () => {
          const watch = glitchWatch.current;
          glitchWatch.current = null;
          if (watch?.triggered) logActivity('The one close reading was reported as a car', 'warning');
          else logActivity('The entrance sensor read 5 cm for a moment. One reading is not a car (it takes 3 in a row), so nothing happened.', 'success');
        });
        break;
      }
    }
  };

  const scenarioBlocked = (id: ScenarioId): string | null =>
    id === 'glitch' && hw.serial.status === 'connected' ? 'Uses the emulator. Disconnect the board first.' : null;

  // A car that cannot be guided yet waits in line at the gate, up to MAX_QUEUE cars.
  const joinQueue = (reason: string) => {
    if (queueRef.current >= MAX_QUEUE) {
      logActivity(`The line at the gate is full (${MAX_QUEUE} cars). One more car was turned away.`, 'warning');
      notify(`The line at the gate is full (${MAX_QUEUE} cars).`, 'warning');
      return;
    }
    queueRef.current += 1;
    setQueue(queueRef.current);
    logActivity(reason, 'warning');
    notify(reason, 'info');
  };

  const handleFindSpot = (fromHardware = false) => {
    const busy = userStatus === 'detecting' || userStatus === 'searching' || userStatus === 'navigating';
    if (busy || queueRef.current > 0) {
      // Nobody waits while there is a spot to offer: the app guides this driver too, to a spot of their own.
      if (queueRef.current === 0 && guideAnotherDriver()) return;
      joinQueue('Another car is at the entrance, and every free spot is taken or held for a driver on the way. It waits at the gate.');
      return;
    }
    // A new car clears the previous "You've arrived" screen by itself.
    if (userStatus === 'arrived') handleReset();
    if (reachableFree === 0) {
      joinQueue(
        freeCount === 0
          ? 'Car at the entrance but the lot is full. It waits at the gate for a spot to free up.'
          : 'Car at the entrance, but every way to the free spots is closed. It waits at the gate.',
      );
      return;
    }
    setUserStatus('detecting');
    logActivity(
      fromHardware ? 'Entrance sensor D34 → car detected' : 'Entrance sensor triggered — car detected',
      'info',
    );
  };

  // F sends a car in, T toggles live traffic, E empties the lot. The ref always holds this render's handler.
  const findSpotRef = useRef(handleFindSpot);
  const resetLotRef = useRef(resetLot);
  useEffect(() => {
    findSpotRef.current = handleFindSpot;
    resetLotRef.current = resetLot;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return;
      if (e.key === 'f' || e.key === 'F') findSpotRef.current();
      else if (e.key === 't' || e.key === 'T') setLiveTraffic((on) => !on);
      else if (e.key === 'e' || e.key === 'E') resetLotRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Hardware: the real D35 sensor decides whether the hardware spot is taken.
  useEffect(() => {
    if (!hwControls) return;
    const spot = lotRef.current.spots.find((s) => s.id === hardwareSpotId);
    if (!spot) return;
    if (hw.spotOccupied) {
      realParkedRef.current.add(hardwareSpotId);
      // A car just sat in the real spot. If one of our trips is heading here, its arrival moves the sensor on.
      const tripHeadingHere = userStatusRef.current === 'navigating' && userRouteRef.current?.spot.id === hardwareSpotId;
      if (!tripHeadingHere) advanceHardwareSpot(hardwareSpotId);
    } else {
      // The real car drove off the spot the sensor is still on (only happens when there was no free
      // spot to move the sensor to): that spot is free again.
      realParkedRef.current.delete(hardwareSpotId);
    }
    if (spot.occupied === hw.spotOccupied) return;
    setLot((prev) => ({
      ...prev,
      spots: prev.spots.map((s) => (s.id === hardwareSpotId ? { ...s, occupied: hw.spotOccupied } : s)),
    }));
    addPing(spot.row, spot.col);
    logActivity(`Spot sensor D35 → Spot ${hardwareSpotId} ${hw.spotOccupied ? 'OCCUPIED' : 'FREE'}`, 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.spotOccupied, hwControls, hardwareSpotId]);

  // After the real sensor moves on, wait for it to read "open" before it drives the new spot.
  useEffect(() => {
    if (!hwArmed && (!hw.active || !hw.spotOccupied)) setHwArmed(true);
  }, [hwArmed, hw.active, hw.spotOccupied]);

  // Spots held for app drivers on their way (the phone's car and the other guided cars).
  const heldSpots = (except?: string): Set<string> => {
    const held = new Set(ambientCarsRef.current.filter((c) => c.guided && c.id !== except).map((c) => c.spotId));
    const route = userRouteRef.current;
    if (route && userStatusRef.current === 'navigating' && except !== 'you') held.add(route.spot.id);
    return held;
  };

  // What the app may offer a driver: not taken, not held for another app driver, and not the real
  // sensor's spot while that sensor is waiting to be moved.
  const lotForSearch = (l: LotModel, except = 'you'): LotModel => {
    const held = heldSpots(except);
    const sensorWaiting = hwActiveRef.current && !hwArmedRef.current;
    return {
      ...l,
      spots: l.spots.map((s) =>
        held.has(s.id) || (sensorWaiting && s.id === hardwareSpotIdRef.current) ? { ...s, occupied: true } : s,
      ),
    };
  };

  // A car parked in the real spot: move the real sensor on to the next nearest free spot.
  const advanceHardwareSpot = (fromSpotId: string) => {
    if (hardwareSpotIdRef.current !== fromSpotId || !hwActiveRef.current) return;
    const currentLot = lotRef.current;
    const lotAfterParking: LotModel = {
      ...currentLot,
      spots: currentLot.spots.map((s) => (s.id === fromSpotId ? { ...s, occupied: true } : s)),
    };
    // Nearest by drive distance; if several tie, take the one closest to the spot that was just filled
    // (so the sensor walks along the row: S25, S26, S27, ...).
    const entrance: GridPoint = [currentLot.entrance.row, currentLot.entrance.col];
    const from = lotAfterParking.spots.find((s) => s.id === fromSpotId);
    let next: RouteResult | null = null;
    let nextGap = Infinity;
    for (const candidate of lotAfterParking.spots) {
      if (candidate.occupied) continue;
      const route = buildRouteToSpot(lotAfterParking, entrance, candidate);
      if (!route) continue;
      const gap = from ? Math.abs(candidate.row - from.row) + Math.abs(candidate.col - from.col) : 0;
      if (!next || route.path.length < next.path.length || (route.path.length === next.path.length && gap < nextGap)) {
        next = route;
        nextGap = gap;
      }
    }
    if (!next) {
      logActivity('No free spot left to move the real sensor to', 'warning');
      return;
    }
    hardwareSpotIdRef.current = next.spot.id;
    hwArmedRef.current = false;
    hwControlsRef.current = false;
    setHardwareSpotId(next.spot.id);
    setHwArmed(false);
    logActivity(`Spot ${fromSpotId} is taken. Move the real sensor to Spot ${next.spot.id}`, 'info');
    notify(`Spot ${fromSpotId} is taken. Move the real sensor to Spot ${next.spot.id}.`, 'info');
  };

  // Hardware: a car newly reaching the D34 entrance sensor starts the same flow as the simulation.
  const entranceWasDetected = useRef(false);
  useEffect(() => {
    if (!hw.active) {
      entranceWasDetected.current = false;
      return;
    }
    const glitch = glitchWatch.current;
    if (hw.entranceDetected && glitch && performance.now() < glitch.until) {
      // The spike was believed: say so honestly, and do not send a car for it.
      glitch.triggered = true;
      entranceWasDetected.current = true;
      return;
    }
    if (hw.entranceDetected && !entranceWasDetected.current) handleFindSpot(true);
    entranceWasDetected.current = hw.entranceDetected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.entranceDetected, hw.active]);

  useEffect(() => {
    if (hw.serial.status === 'connected') {
      logActivity('Arduino connected over USB', 'success');
      notify('Board connected over USB.', 'success');
    } else if (hw.serial.status === 'error') {
      logActivity('Arduino connection lost', 'warning');
      notify(hw.serial.error ?? 'The board connection was lost.', 'warning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.serial.status]);

  // The board went quiet, or reports a broken sensor: say so in the feed instead of failing silently.
  useEffect(() => {
    if (hw.device.stale) {
      logActivity('The board stopped sending data. Waiting for it to come back.', 'warning');
      notify('The board stopped sending data. Detection is paused until it is back.', 'warning');
    }
    else if (hw.serial.status === 'connected') logActivity('Board data is flowing again', 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.device.stale]);

  useEffect(() => {
    if (hw.device.faultEntrance !== 'none') {
      logActivity(`Entrance sensor fault: ${hw.device.faultEntrance.replace('_', ' ')}`, 'warning');
      notify('The entrance sensor looks broken. Check its wires.', 'warning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.device.faultEntrance]);

  useEffect(() => {
    if (hw.device.faultSpot !== 'none') {
      logActivity(`Spot sensor fault: ${hw.device.faultSpot.replace('_', ' ')}`, 'warning');
      notify('The spot sensor looks broken. Check its wires.', 'warning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.device.faultSpot]);

  useEffect(() => {
    if (hw.device.mock) logActivity('The board is in mock mode: the sensor data is generated', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.device.mock]);

  // The next car in line drives in once the car ahead has been guided and a spot can be reached.
  useEffect(() => {
    if (queue === 0 || offerable === 0) return;
    const phoneFree = userStatus === 'idle' || userStatus === 'arrived';
    const id = setTimeout(
      () => {
        if (!phoneFree && !guideAnotherDriver()) return;
        queueRef.current = Math.max(0, queueRef.current - 1);
        setQueue(queueRef.current);
        if (phoneFree) {
          handleReset();
          setUserStatus('detecting');
        }
        logActivity(`The next car in line drives in${queueRef.current ? ` (${queueRef.current} still waiting)` : ''}`, 'info');
      },
      userStatus === 'arrived' ? NEXT_CAR_AFTER_ARRIVAL_MS : NEXT_CAR_MS,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, offerable, userStatus]);

  // Stage 1: "CAR DETECTED"
  useEffect(() => {
    if (userStatus !== 'detecting') return;
    const id = setTimeout(() => setUserStatus('searching'), DETECT_MS);
    return () => clearTimeout(id);
  }, [userStatus]);

  // Stage 2: "Finding nearest spot…"
  useEffect(() => {
    if (userStatus !== 'searching') return;
    logActivity('Searching for the nearest spot…', 'info');
    const id = setTimeout(() => {
      const currentLot = lotForSearch(lotRef.current);
      const entrance: GridPoint = [currentLot.entrance.row, currentLot.entrance.col];
      // Test option: send the car to the real-sensor spot (when it's free) so the hardware gets exercised.
      const realSpot =
        hwControlsRef.current && preferRealSpotRef.current
          ? currentLot.spots.find((s) => s.id === hardwareSpotIdRef.current)
          : undefined;
      const toRealSpot = realSpot && !realSpot.occupied ? buildRouteToSpot(currentLot, entrance, realSpot) : null;
      const result = toRealSpot ?? findNearestFreeSpot(currentLot, entrance);
      if (!result) {
        // The last spot went while the car was being detected: it goes back in line at the gate.
        setUserStatus('idle');
        joinQueue(
          currentLot.spots.some((s) => !s.occupied)
            ? 'No free spot can be reached: roadwork closes the way. The car waits at the gate.'
            : 'The lot filled up before the car could be guided. It waits at the gate.',
        );
        return;
      }
      const startTime = performance.now();
      setUserRoute(result);
      setUserRouteStart(startTime);
      setUserStatus('navigating');
      setClock(startTime);
      logActivity(`Routing you to Spot ${result.spot.id}`, 'success');
      // The "Someone takes your spot" scenario: a faster car now races you to it.
      const rivalAllowed = !(hwControlsRef.current && result.spot.id === hardwareSpotIdRef.current);
      if (stealNextRef.current && rivalAllowed) {
        stealNextRef.current = false;
        const rival = buildRouteToSpot(currentLot, entrance, result.spot);
        if (rival) spawnAmbient(result.spot, rival.path);
      }
    }, SEARCH_MS);
    return () => clearTimeout(id);
    // joinQueue and spawnAmbient only use refs and state setters, so this render's copies are fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userStatus]);

  const spawnAmbient = (target: Spot, path: GridPoint[], guided = false) => {
    const startTime = performance.now();
    const msPerCellNow = guided ? msPerCell(settingsRef.current) : ambientMsPerCell(settingsRef.current);
    const car: AmbientCar = { id: nextId('amb'), path, spotId: target.id, startTime, msPerCell: msPerCellNow, guided, drivenBefore: 0 };
    ambientCarsRef.current = [...ambientCarsRef.current, car];
    setAmbientCars((prev) => [...prev, car]);
    setClock(startTime);
    if (guided) logActivity(`Another app driver is guided to Spot ${target.id}. The spot is held for them.`, 'success');
    else logActivity(`A driver without the app is heading to Spot ${target.id}`, 'ambient');
  };

  // A second app driver while the phone's car is still on its way: the app guides both at once,
  // each to a different spot. Returns false when there is nothing left to offer.
  const guideAnotherDriver = (): boolean => {
    const base = lotForSearch(lotRef.current, '');
    // The real sensor's spot is for the real car (and the phone's test drive), not for simulated drivers.
    const offer = hwActiveRef.current
      ? { ...base, spots: base.spots.map((s) => (s.id === hardwareSpotIdRef.current ? { ...s, occupied: true } : s)) }
      : base;
    const route = findNearestFreeSpot(offer, [offer.entrance.row, offer.entrance.col]);
    if (!route) return false;
    spawnAmbient(route.spot, route.path, true);
    return true;
  };

  // Ambient traffic spawner
  const traffic = TRAFFIC_LEVELS[settings.traffic];
  useEffect(() => {
    if (!liveTraffic) return;
    const id = setInterval(() => {
      const currentLot = lotRef.current;
      // Cars cannot drive to, or out of, spots behind a closed lane.
      const reach = reachableSpotIds(currentLot);
      // The hardware spot belongs to the real sensor, so simulated traffic leaves it alone.
      const simulated = currentLot.spots.filter((s) => reach.has(s.id) && !(hwActiveRef.current && s.id === hardwareSpotIdRef.current));
      const free = simulated.filter((s) => !s.occupied);
      const occupied = simulated.filter((s) => s.occupied);
      const leavers = occupied.filter((s) => !realParkedRef.current.has(s.id));
      const occupancy = currentLot.spots.length === 0 ? 0 : occupied.length / currentLot.spots.length;
      const arrivalProb = Math.max(0.15, Math.min(0.85, 0.75 - occupancy * 0.5));

      if (Math.random() < arrivalProb && free.length > 0 && ambientCarsRef.current.length < traffic.maxCars) {
        let target: Spot | undefined;
        const activeUserRoute = userRouteRef.current;
        const stealChance = SPOT_STEALING[settingsRef.current.stealing].chance;
        if (userStatusRef.current === 'navigating' && activeUserRoute && Math.random() < stealChance) {
          target = free.find((s) => s.id === activeUserRoute.spot.id);
        }
        if (!target) target = free[Math.floor(Math.random() * free.length)];

        const start: GridPoint = [currentLot.entrance.row, currentLot.entrance.col];
        const route = buildRouteToSpot(currentLot, start, target);
        if (route) spawnAmbient(target, route.path);
      } else if (leavers.length > 0) {
        const spot = leavers[Math.floor(Math.random() * leavers.length)];
        setLot((prev) => ({
          ...prev,
          spots: prev.spots.map((s) => (s.id === spot.id ? { ...s, occupied: false } : s)),
        }));
        addPing(spot.row, spot.col);
        logActivity(`Spot ${spot.id} just freed up`, 'ambient');
      }
    }, traffic.spawnMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTraffic, traffic]);

  // Master animation loop — drives the user's car, ambient traffic, and ping ripples.
  useEffect(() => {
    let raf: number;

    const tick = () => {
      const now = performance.now();
      let animating = false;

      // Your car
      if (userStatusRef.current === 'navigating' && userRouteRef.current && userRouteStartRef.current !== null) {
        const route = userRouteRef.current;
        const maxT = route.path.length - 1;
        const userMs = msPerCell(settingsRef.current);
        const t = Math.min((now - userRouteStartRef.current) / userMs, maxT);
        const targetSpot = lotRef.current.spots.find((s) => s.id === route.spot.id);
        // Heading for the real spot: the car waits at its entrance until the D35 sensor sees a car park there.
        const waitsForSensor = hwControlsRef.current && route.spot.id === hardwareSpotIdRef.current;
        const sensorConfirmedParked = waitsForSensor && hwSpotOccupiedRef.current;

        if (!waitsForSensor && targetSpot?.occupied && t < maxT - 0.02) {
          const idx = Math.min(Math.round(t), maxT);
          const currentCell = route.path[idx];
          const alt = findNearestFreeSpot(lotForSearch(lotRef.current), currentCell);
          if (alt) {
            userRouteRef.current = alt;
            userRouteStartRef.current = now;
            setUserRoute(alt);
            setUserRouteStart(now);
            setSession((st) => ({ ...st, reroutes: st.reroutes + 1, drivenCells: st.drivenCells + idx }));
            const notice = `Spot ${route.spot.id} was just taken — rerouting to ${alt.spot.id}`;
            setRerouteNotice(notice);
            logActivity(`${notice}`, 'warning');
            setTimeout(() => setRerouteNotice(null), REROUTE_NOTICE_MS);
          } else {
            userStatusRef.current = 'idle';
            userRouteRef.current = null;
            userRouteStartRef.current = null;
            setUserStatus('idle');
            setUserRoute(null);
            setUserRouteStart(null);
            logActivity('Lot filled up before you could park', 'warning');
          }
        } else if (sensorConfirmedParked || (!waitsForSensor && t >= maxT)) {
          const spotId = route.spot.id;
          if (sensorConfirmedParked) {
            // Snap the virtual car into the spot the moment the real sensor sees the real car.
            const snapStart = now - maxT * userMs;
            userRouteStartRef.current = snapStart;
            setUserRouteStart(snapStart);
          }
          userStatusRef.current = 'arrived';
          setSession((st) => ({
            ...st,
            trips: st.trips + 1,
            drivenCells: st.drivenCells + route.path.length - 1,
            sensorConfirmed: st.sensorConfirmed + (sensorConfirmedParked ? 1 : 0),
          }));
          setLot((prev) => ({
            ...prev,
            spots: prev.spots.map((s) => (s.id === spotId ? { ...s, occupied: true } : s)),
          }));
          addPing(route.spot.row, route.spot.col);
          if (sensorConfirmedParked) {
            realParkedRef.current.add(spotId);
            // Move the sensor on right away. Waiting here used to leave a window in which a single "open"
            // reading (a hand moving the toy car) freed the spot the car had just parked in.
            advanceHardwareSpot(spotId);
          }
          setUserStatus('arrived');
          logActivity(
            sensorConfirmedParked ? `Spot sensor confirmed. Parked at Spot ${spotId}` : `Parked at Spot ${spotId}`,
            'success',
          );
          if (sensorConfirmedParked) notify(`The spot sensor confirmed the car. Parked at Spot ${spotId}.`, 'success');
        }
        animating = true;
      }

      // Ambient traffic
      if (ambientCarsRef.current.length > 0) {
        const arrived: string[] = [];
        const remaining: AmbientCar[] = [];
        let changed = false;
        for (const c of ambientCarsRef.current) {
          const maxT = c.path.length - 1;
          const t = Math.min((now - c.startTime) / c.msPerCell, maxT);
          const target = lotRef.current.spots.find((s) => s.id === c.spotId);
          if (t < maxT - 0.02 && target?.occupied) {
            // Someone else parked there first. An app driver is sent to another spot that is not
            // held for anyone; a driver without the app looks for the nearest free one.
            changed = true;
            const idx = Math.min(Math.floor(t), maxT - 1);
            const here = c.path[idx];
            const alt = findNearestFreeSpot(c.guided ? lotForSearch(lotRef.current, c.id) : lotRef.current, here);
            if (!alt) {
              logActivity(`No free spot left for the car heading to Spot ${c.spotId}. It drives out.`, 'warning');
              continue;
            }
            if (c.guided) logActivity(`Spot ${c.spotId} was taken by a driver without the app. The app reroutes its driver to Spot ${alt.spot.id}.`, 'warning');
            remaining.push({ ...c, spotId: alt.spot.id, path: alt.path, startTime: now, drivenBefore: c.drivenBefore + idx });
            if (c.guided) setSession((st) => ({ ...st, reroutes: st.reroutes + 1 }));
            continue;
          }
          if (t >= maxT) {
            arrived.push(c.spotId);
            if (c.guided) setSession((st) => ({ ...st, trips: st.trips + 1, drivenCells: st.drivenCells + c.drivenBefore + maxT }));
          } else remaining.push(c);
        }
        if (changed && arrived.length === 0) {
          ambientCarsRef.current = remaining;
          setAmbientCars(remaining);
        }
        if (arrived.length > 0) {
          ambientCarsRef.current = remaining;
          setLot((prev) => ({
            ...prev,
            spots: prev.spots.map((s) => (arrived.includes(s.id) ? { ...s, occupied: true } : s)),
          }));
          for (const spotId of arrived) {
            const spot = lotRef.current.spots.find((s) => s.id === spotId);
            if (spot) addPing(spot.row, spot.col);
            logActivity(`A car parked at Spot ${spotId}`, 'ambient');
          }
          setAmbientCars(remaining);
        }
        animating = true;
      }

      // Ping ripples
      const hasPings = pingsRef.current.length > 0;
      if (hasPings) {
        setPings((prev) => {
          const alive = prev.filter((p) => now - p.startTime < PING_MS);
          return alive.length === prev.length ? prev : alive;
        });
      }

      if (animating || hasPings) {
        setClock(now);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The loop is started once and reads everything that changes through refs. notify is stable, and
    // advanceHardwareSpot only reads refs, so the first render's copies are the right ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While heading for the real spot the car stops one cell short, until the D35 sensor confirms a real car parked.
  const holdingForSensor =
    hwControls && userStatus === 'navigating' && userRoute?.spot.id === hardwareSpotId;
  const maxUserT = userRoute ? userRoute.path.length - 1 : 0;
  const userT =
    userRoute && userRouteStart !== null
      ? Math.max(0, Math.min((clock - userRouteStart) / cellMs, holdingForSensor ? maxUserT - 1 : maxUserT))
      : 0;
  const waitingForSensor = holdingForSensor && userT >= maxUserT - 1 - 0.001;

  const steps = userRoute ? buildDirections(userRoute.path, userRoute.spot.id) : [];
  let currentStepIndex = 0;
  if (userRoute) {
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].fromIndex <= userT + 1e-6) currentStepIndex = i;
      else break;
    }
  }

  // Spoken directions: each step is read once, when the car reaches it (a reroute starts a new list).
  const spokenRef = useRef<{ route: RouteResult | null; step: number }>({ route: null, step: -1 });
  const stepToSay = (userStatus === 'navigating' || userStatus === 'arrived') && userRoute ? steps[currentStepIndex]?.text : undefined;
  useEffect(() => {
    const said = spokenRef.current;
    if (!settings.voice || !stepToSay || (said.route === userRoute && said.step === currentStepIndex)) return;
    spokenRef.current = { route: userRoute, step: currentStepIndex };
    speak(stepToSay);
  }, [settings.voice, stepToSay, userRoute, currentStepIndex]);

  // What is left of the drive, for the phone: metres and seconds.
  const remainingCells = userRoute && userStatus === 'navigating' ? Math.max(0, maxUserT - userT) : 0;
  const remainingMeters = Math.round(remainingCells * DEFAULT_PARAMS.cellMeters);
  const remainingSeconds = Math.ceil((remainingCells * cellMs) / 1000);

  const showRoute = userStatus === 'navigating' || userStatus === 'arrived';
  const carVisual: CarVisual | null = userRoute && showRoute ? carVisualFromPath(userRoute.path, userT) : null;

  const ambientVisuals: CarVisual[] = ambientCars.map((c) => {
    const maxT = c.path.length - 1;
    const t = Math.min((clock - c.startTime) / c.msPerCell, maxT);
    return { ...carVisualFromPath(c.path, t), guided: c.guided };
  });

  const pingVisuals: PingVisual[] = pings.map((p) => ({
    row: p.row,
    col: p.col,
    age: Math.max(0, Math.min((clock - p.startTime) / PING_MS, 1)),
  }));

  const boardConnected = hw.serial.status === 'connected';
  const realSpot = lot.spots.find((sp) => sp.id === hardwareSpotId);
  const realSpotState = !hw.active ? 'offline' : realSpot?.occupied ? 'taken' : 'open';

  return (
    <div className="live">
      <LotHeader
        free={freeCount}
        total={lot.spots.length}
        liveTraffic={liveTraffic}
        onToggleLiveTraffic={setLiveTraffic}
        boardLabel={boardConnected ? 'Board connected' : hw.source === 'emulator' ? 'Emulator on' : 'Simulation only'}
        boardTone={boardConnected ? 'positive' : 'neutral'}
        realSpotId={hardwareSpotId}
        hardwareActive={hw.active}
        realSpotState={realSpotState}
        cutOff={freeCount - reachableFree}
      >
        <DemoSettingsMenu
          settings={settings}
          onChange={updateSettings}
          onRestoreDefaults={() => updateSettings(DEFAULT_DEMO_SETTINGS)}
          onResetLot={resetLot}
        />
      </LotHeader>

      <div className="live__grid">
        <section className="live__phone" aria-label="Driver app">
          <div className="phone-fit">
            <PhoneApp
              status={userStatus}
              targetSpotId={userRoute?.spot.id ?? null}
              steps={steps}
              currentStepIndex={currentStepIndex}
              freeCount={freeCount}
              reachableFree={reachableFree}
              totalCount={lot.spots.length}
              queue={queue}
              remainingMeters={remainingMeters}
              remainingSeconds={remainingSeconds}
              rerouteNotice={rerouteNotice}
              hardwareActive={hw.active}
              waitingForSensor={waitingForSensor}
              onFindSpot={() => handleFindSpot()}
              onReset={handleReset}
            />
          </div>
        </section>

        <section className="live__map" aria-label="Lot map">
          <div className="lot-card">
            <VirtualLot
              lot={lot}
              car={carVisual}
              ambientCars={ambientVisuals}
              path={showRoute ? (userRoute?.path ?? null) : null}
              progress={userT}
              targetSpotId={userRoute?.spot.id ?? null}
              pings={pingVisuals}
              hardwareSpotId={hardwareSpotId}
              hardwareActive={hwControls}
              onMoveHardware={moveHardwareSpot}
              interactive={interactive}
              onToggleSpot={toggleSpot}
              unreachable={reachable.size === lot.spots.length ? NO_SPOTS : unreachableIds(lot, reachable)}
              onToggleLane={toggleLane}
              heldSpotIds={heldNow}
            />
          </div>
          <div className="legend">
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--free" /> Free
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--occupied" /> Occupied
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--route" /> Your route
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--guided" /> Other app drivers (spot held)
            </span>
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--ambient" /> Drivers without the app
            </span>
          </div>
          <p className="live__hint">
            {interactive
              ? "Click a spot to simulate its sensor, or a lane to close it for roadwork. Drag the HW tag to choose the real sensor's spot."
              : 'The lot is locked while a car is on its way to a spot.'}
          </p>
          <ActivityFeed entries={activity} />
        </section>

        <section className="live__side" aria-label="Hardware and events">
          <HardwarePanel
            hw={hw}
            spotId={hardwareSpotId}
            waitingToRearm={hw.active && !hwArmed}
            preferRealSpot={preferRealSpot}
            onPreferRealSpot={setPreferRealSpot}
            movableSpotIds={lot.spots.filter((sp) => !sp.occupied).map((sp) => sp.id)}
            canMoveSpot={interactive}
            onMoveSpot={moveHardwareSpot}
          />
        </section>
      </div>

      <EdgeCasePanel onRun={runScenario} blockedReason={scenarioBlocked} lastRun={lastScenario} boardConnected={boardConnected} />

      <div className="live__row">
        <SessionPanel stats={session} occupied={lot.spots.length - freeCount} total={lot.spots.length} activity={activity} />
        <SensorTrace hw={hw} />
      </div>

      <ReliabilityPanel hw={hw} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default App;
