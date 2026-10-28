import { useEffect, useRef, useState } from 'react';
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
import { findNearestFreeSpot, buildRouteToSpot, type RouteResult } from './lot/pathfinding';
import { buildDirections } from './lot/directions';
import type { GridPoint, LotModel, Spot } from './lot/types';
import {
  AMBIENT_MS_PER_CELL,
  AMBIENT_SPAWN_MS,
  DEFAULT_HARDWARE_SPOT_ID,
  DETECT_MS,
  MAX_AMBIENT_CARS,
  MS_PER_CELL,
  PING_MS,
  REROUTE_STEAL_CHANCE,
  SEARCH_MS,
} from './config/constants';
import { ignoreShortcut } from './shortcuts';

interface AmbientCar {
  id: string;
  path: GridPoint[];
  spotId: string;
  startTime: number;
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

  const handleFindSpot = (fromHardware = false) => {
    // A real car showing up clears the previous "You've arrived" screen by itself.
    if (fromHardware && userStatus === 'arrived') handleReset();
    else if (userStatus !== 'idle') return;
    if (freeCount === 0) {
      if (fromHardware) {
        logActivity('Car at the entrance but the lot is full', 'warning');
        notify('A car is at the entrance, but the lot is full.', 'warning');
      }
      return;
    }
    setUserStatus('detecting');
    logActivity(
      fromHardware ? 'Entrance sensor D34 → car detected' : 'Entrance sensor triggered — car detected',
      'info',
    );
  };

  // F sends a car in, T toggles live traffic. The ref always holds this render's handler.
  const findSpotRef = useRef(handleFindSpot);
  useEffect(() => {
    findSpotRef.current = handleFindSpot;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (ignoreShortcut(e)) return;
      if (e.key === 'f' || e.key === 'F') findSpotRef.current();
      else if (e.key === 't' || e.key === 'T') setLiveTraffic((on) => !on);
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

  // While the sensor is waiting to be moved, its spot is reserved: cars aren't routed there.
  const lotForSearch = (l: LotModel): LotModel =>
    hwActiveRef.current && !hwArmedRef.current
      ? { ...l, spots: l.spots.map((s) => (s.id === hardwareSpotIdRef.current ? { ...s, occupied: true } : s)) }
      : l;

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
        setUserStatus('idle');
        logActivity('No spots available', 'warning');
        return;
      }
      const startTime = performance.now();
      setUserRoute(result);
      setUserRouteStart(startTime);
      setUserStatus('navigating');
      setClock(startTime);
      logActivity(`Routing you to Spot ${result.spot.id}`, 'success');
    }, SEARCH_MS);
    return () => clearTimeout(id);
  }, [userStatus]);

  // Ambient traffic spawner
  useEffect(() => {
    if (!liveTraffic) return;
    const id = setInterval(() => {
      const currentLot = lotRef.current;
      // The hardware spot belongs to the real sensor, so simulated traffic leaves it alone.
      const simulated = currentLot.spots.filter((s) => !(hwActiveRef.current && s.id === hardwareSpotIdRef.current));
      const free = simulated.filter((s) => !s.occupied);
      const occupied = simulated.filter((s) => s.occupied);
      const leavers = occupied.filter((s) => !realParkedRef.current.has(s.id));
      const occupancy = currentLot.spots.length === 0 ? 0 : occupied.length / currentLot.spots.length;
      const arrivalProb = Math.max(0.15, Math.min(0.85, 0.75 - occupancy * 0.5));

      if (Math.random() < arrivalProb && free.length > 0 && ambientCarsRef.current.length < MAX_AMBIENT_CARS) {
        let target: Spot | undefined;
        const activeUserRoute = userRouteRef.current;
        if (userStatusRef.current === 'navigating' && activeUserRoute && Math.random() < REROUTE_STEAL_CHANCE) {
          target = free.find((s) => s.id === activeUserRoute.spot.id);
        }
        if (!target) target = free[Math.floor(Math.random() * free.length)];

        const start: GridPoint = [currentLot.entrance.row, currentLot.entrance.col];
        const route = buildRouteToSpot(currentLot, start, target);
        if (route) {
          const startTime = performance.now();
          setAmbientCars((prev) => [...prev, { id: nextId('amb'), path: route.path, spotId: target!.id, startTime }]);
          setClock(startTime);
          logActivity(`Another car is heading to Spot ${target.id}`, 'ambient');
        }
      } else if (leavers.length > 0) {
        const spot = leavers[Math.floor(Math.random() * leavers.length)];
        setLot((prev) => ({
          ...prev,
          spots: prev.spots.map((s) => (s.id === spot.id ? { ...s, occupied: false } : s)),
        }));
        addPing(spot.row, spot.col);
        logActivity(`Spot ${spot.id} just freed up`, 'ambient');
      }
    }, AMBIENT_SPAWN_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTraffic]);

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
        const t = Math.min((now - userRouteStartRef.current) / MS_PER_CELL, maxT);
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
            setTimeout(() => setRerouteNotice(null), 2600);
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
            const snapStart = now - maxT * MS_PER_CELL;
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
        for (const c of ambientCarsRef.current) {
          const maxT = c.path.length - 1;
          const t = Math.min((now - c.startTime) / AMBIENT_MS_PER_CELL, maxT);
          if (t >= maxT) arrived.push(c.spotId);
          else remaining.push(c);
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
            logActivity(`Another car parked at Spot ${spotId}`, 'ambient');
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
      ? Math.max(0, Math.min((clock - userRouteStart) / MS_PER_CELL, holdingForSensor ? maxUserT - 1 : maxUserT))
      : 0;
  const waitingForSensor = holdingForSensor && userT >= maxUserT - 1 - 0.001;

  const steps = userRoute ? buildDirections(userRoute.path, userRoute.spot.id) : [];
  let currentStepIndex = 0;
  if (userRoute) {
    const idx = Math.min(Math.round(userT), userRoute.path.length - 1);
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].fromIndex <= idx) currentStepIndex = i;
      else break;
    }
  }

  const showRoute = userStatus === 'navigating' || userStatus === 'arrived';
  const carVisual: CarVisual | null = userRoute && showRoute ? carVisualFromPath(userRoute.path, userT) : null;

  const ambientVisuals: CarVisual[] = ambientCars.map((c) => {
    const maxT = c.path.length - 1;
    const t = Math.min((clock - c.startTime) / AMBIENT_MS_PER_CELL, maxT);
    return carVisualFromPath(c.path, t);
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
      />

      <div className="live__grid">
        <section className="live__phone" aria-label="Driver app">
          <div className="phone-fit">
            <PhoneApp
              status={userStatus}
              targetSpotId={userRoute?.spot.id ?? null}
              steps={steps}
              currentStepIndex={currentStepIndex}
              freeCount={freeCount}
              totalCount={lot.spots.length}
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
              <span className="legend__swatch legend__swatch--ambient" /> Other traffic
            </span>
          </div>
          <p className="live__hint">
            {interactive
              ? "Click any spot to simulate its sensor. Drag the HW tag to choose the real sensor's spot."
              : 'Spots are locked while a car is on its way to a spot.'}
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
