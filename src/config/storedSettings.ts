import { DEFAULT_ENTRANCE_THRESHOLD_CM, DEFAULT_SPOT_THRESHOLD_CM, THRESHOLD_MAX_CM, THRESHOLD_MIN_CM } from './constants';

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

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
