import { DEFAULT_ENTRANCE_THRESHOLD_CM, DEFAULT_SPOT_THRESHOLD_CM, THRESHOLD_MAX_CM, THRESHOLD_MIN_CM } from './constants';
import { DEFAULT_DEMO_SETTINGS, DRIVE_SPEEDS, SPOT_STEALING, TRAFFIC_LEVELS, type DemoSettings } from './demoSettings';

/** The user's detection thresholds, remembered in the browser between visits. */

export interface Thresholds {
  entranceCm: number;
  spotCm: number;
}

const KEY = 'smartparking.thresholds.v1';

export const DEFAULT_THRESHOLDS: Thresholds = { entranceCm: DEFAULT_ENTRANCE_THRESHOLD_CM, spotCm: DEFAULT_SPOT_THRESHOLD_CM };

export function clampThreshold(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, THRESHOLD_MIN_CM), THRESHOLD_MAX_CM);
}

/** Never throws: private windows, blocked storage and damaged values all fall back to the defaults. */
export function loadThresholds(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Thresholds {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const data = JSON.parse(raw) as Partial<Thresholds>;
    return {
      entranceCm: clampThreshold(data.entranceCm, DEFAULT_THRESHOLDS.entranceCm),
      spotCm: clampThreshold(data.spotCm, DEFAULT_THRESHOLDS.spotCm),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholds(t: Thresholds, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(t));
  } catch {
    // storage is full or blocked: the setting simply is not remembered
  }
}

const DEMO_KEY = 'smartparking.demo.v1';

function pick<T extends string>(value: unknown, options: Record<T, unknown>, fallback: T): T {
  return typeof value === 'string' && Object.hasOwn(options, value) ? (value as T) : fallback;
}

/** The live demo's settings. Unknown or damaged values fall back to the defaults one by one. */
export function loadDemoSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): DemoSettings {
  try {
    const raw = storage?.getItem(DEMO_KEY);
    if (!raw) return DEFAULT_DEMO_SETTINGS;
    const data = JSON.parse(raw) as Partial<Record<keyof DemoSettings, unknown>>;
    return {
      traffic: pick(data.traffic, TRAFFIC_LEVELS, DEFAULT_DEMO_SETTINGS.traffic),
      speed: pick(data.speed, DRIVE_SPEEDS, DEFAULT_DEMO_SETTINGS.speed),
      stealing: pick(data.stealing, SPOT_STEALING, DEFAULT_DEMO_SETTINGS.stealing),
      voice: typeof data.voice === 'boolean' ? data.voice : DEFAULT_DEMO_SETTINGS.voice,
    };
  } catch {
    return DEFAULT_DEMO_SETTINGS;
  }
}

export function saveDemoSettings(settings: DemoSettings, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(DEMO_KEY, JSON.stringify(settings));
  } catch {
    // storage is full or blocked: the setting simply is not remembered
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
