import { AMBIENT_MS_PER_CELL, AMBIENT_SPAWN_MS, MAX_AMBIENT_CARS, MS_PER_CELL, REROUTE_STEAL_CHANCE } from './constants';

/** What the live demo's settings panel can change. Every option maps to plain numbers here. */

export const TRAFFIC_LEVELS = {
  quiet: { label: 'Quiet', spawnMs: 5000, maxCars: 2 },
  normal: { label: 'Normal', spawnMs: AMBIENT_SPAWN_MS, maxCars: MAX_AMBIENT_CARS },
  busy: { label: 'Rush hour', spawnMs: 1600, maxCars: 6 },
} as const;

export const DRIVE_SPEEDS = {
  slow: { label: 'Slow', factor: 1.6 },
  normal: { label: 'Normal', factor: 1 },
  fast: { label: 'Fast', factor: 0.5 },
} as const;

/** How likely a driver without the app heads for the spot you were just sent to (they cannot see that it is held). */
export const SPOT_STEALING = {
  off: { label: 'Never', chance: 0 },
  low: { label: 'Sometimes', chance: 0.2 },
  normal: { label: 'Often', chance: REROUTE_STEAL_CHANCE },
} as const;

export type TrafficLevel = keyof typeof TRAFFIC_LEVELS;
export type DriveSpeed = keyof typeof DRIVE_SPEEDS;
export type SpotStealing = keyof typeof SPOT_STEALING;

export interface DemoSettings {
  traffic: TrafficLevel;
  speed: DriveSpeed;
  stealing: SpotStealing;
  /** Read each direction aloud as the car reaches it. */
  voice: boolean;
}

export const DEFAULT_DEMO_SETTINGS: DemoSettings = { traffic: 'normal', speed: 'normal', stealing: 'normal', voice: false };

export const msPerCell = (s: DemoSettings) => MS_PER_CELL * DRIVE_SPEEDS[s.speed].factor;
export const ambientMsPerCell = (s: DemoSettings) => AMBIENT_MS_PER_CELL * DRIVE_SPEEDS[s.speed].factor;

/** Cars waiting at the gate while another car is being guided, or while no spot can be reached. */
export const MAX_QUEUE = 5;
