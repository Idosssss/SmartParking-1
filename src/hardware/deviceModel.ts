import type { DeviceFrame, SensorFault } from './protocol';

/** What the app should believe about the two sensors right now. */
export interface Detections {
  entranceDetected: boolean;
  spotOccupied: boolean;
  entranceFault: SensorFault;
  spotFault: SensorFault;
}

export const NO_DETECTIONS: Detections = { entranceDetected: false, spotOccupied: false, entranceFault: 'none', spotFault: 'none' };

/**
 * Reads a status frame from a board that decides on its own (firmware v2).
 * A sensor the board calls faulty never counts as "detected", and when the board has stopped
 * sending data (`stale`) we assume nothing instead of trusting the last reading.
 */
export function detectionsFromFrame(frame: DeviceFrame | null, stale: boolean): Detections {
  if (!frame || stale || frame.legacy) return NO_DETECTIONS;
  const entranceFault = frame.faultEntrance ?? 'none';
  const spotFault = frame.faultSpot ?? 'none';
  return {
    entranceDetected: entranceFault === 'none' && frame.carAtEntrance === true,
    spotOccupied: spotFault === 'none' && frame.spotTaken === true,
    entranceFault,
    spotFault,
  };
}

/** True when nothing has arrived for `staleMs`. */
export function isStale(lastDataAt: number | null, now: number, staleMs: number): boolean {
  return lastDataAt !== null && now - lastDataAt > staleMs;
}
