import { parseSensorLine } from './sensorLogic';

/**
 * What the ESP32 sends: one JSON object per line. See hardware/smart_parking/protocol.h for the
 * other end. Older firmware only sent {"entrance":..,"spot":..}; those lines still parse (legacy).
 */

export type DeviceState = 'BOOTING' | 'RUNNING' | 'SENSOR_FAULT' | 'CALIBRATING';
export type SensorFault = 'none' | 'no_signal' | 'saturated' | 'noisy';

export interface DeviceFrame {
  entranceCm: number;
  spotCm: number;
  /** Decided on the board. Missing when the firmware is the old distance-only version. */
  carAtEntrance?: boolean;
  spotTaken?: boolean;
  state?: DeviceState;
  mock?: boolean;
  faultEntrance?: SensorFault;
  faultSpot?: SensorFault;
  wifi?: string;
  seq?: number;
  uptimeMs?: number;
  /** True when the line had only the two distances (old firmware, CSV, or the emulator). */
  legacy: boolean;
}

export interface DeviceConfig {
  spotCm: number;
  entranceCm: number;
  brightness: number;
  mock: boolean;
  debug: boolean;
}

export type DeviceMessage =
  | { kind: 'frame'; frame: DeviceFrame }
  | { kind: 'config'; config: DeviceConfig }
  | { kind: 'ack'; what: string; value?: number }
  | { kind: 'error'; message: string }
  | { kind: 'debug'; raw: Record<string, number> }
  | { kind: 'help'; text: string };

const STATES: DeviceState[] = ['BOOTING', 'RUNNING', 'SENSOR_FAULT', 'CALIBRATING'];
const FAULTS: SensorFault[] = ['none', 'no_signal', 'saturated', 'noisy'];

const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const asNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const asState = (v: unknown): DeviceState | undefined => (STATES.includes(v as DeviceState) ? (v as DeviceState) : undefined);
const asFault = (v: unknown): SensorFault | undefined => (FAULTS.includes(v as SensorFault) ? (v as SensorFault) : undefined);

/** Returns null for anything that is not a message: boot noise, half lines, random text. */
export function parseDeviceLine(line: string): DeviceMessage | null {
  const text = line.trim();
  if (!text) return null;

  if (!text.startsWith('{')) {
    const reading = parseSensorLine(text); // plain "12.3,80.0"
    return reading ? { kind: 'frame', frame: { entranceCm: reading.entranceCm, spotCm: reading.spotCm, legacy: true } } : null;
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    data = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof data.err === 'string') return { kind: 'error', message: data.err };
  if (typeof data.ack === 'string') return { kind: 'ack', what: data.ack, value: asNum(data.value) };
  if (typeof data.help === 'string') return { kind: 'help', text: data.help };

  if (typeof data.cfg === 'object' && data.cfg !== null) {
    const c = data.cfg as Record<string, unknown>;
    const spotCm = asNum(c.spot_cm);
    const entranceCm = asNum(c.entrance_cm);
    const brightness = asNum(c.brightness);
    if (spotCm === undefined || entranceCm === undefined || brightness === undefined) return null;
    return { kind: 'config', config: { spotCm, entranceCm, brightness, mock: asBool(c.mock) ?? false, debug: asBool(c.debug) ?? false } };
  }

  if (data.dbg !== undefined) {
    const raw: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      const n = asNum(value);
      if (key !== 'dbg' && n !== undefined) raw[key] = n;
    }
    return { kind: 'debug', raw };
  }

  const entranceCm = asNum(data.entrance);
  const spotCm = asNum(data.spot);
  if (entranceCm === undefined || spotCm === undefined) return null;
  const carAtEntrance = asBool(data.car);
  const spotTaken = asBool(data.taken);
  return {
    kind: 'frame',
    frame: {
      entranceCm,
      spotCm,
      carAtEntrance,
      spotTaken,
      state: asState(data.state),
      mock: asBool(data.mock),
      faultEntrance: asFault(data.faultE),
      faultSpot: asFault(data.faultS),
      wifi: typeof data.wifi === 'string' ? data.wifi : undefined,
      seq: asNum(data.seq),
      uptimeMs: asNum(data.up),
      legacy: carAtEntrance === undefined || spotTaken === undefined,
    },
  };
}

/** The commands the board understands (see command_parser.h). Each ends with a newline. */
export const deviceCommands = {
  get: () => 'GET\n',
  help: () => 'HELP\n',
  setSpotCm: (cm: number) => `SET SPOT_CM ${cm}\n`,
  setEntranceCm: (cm: number) => `SET ENTRANCE_CM ${cm}\n`,
  setBrightness: (value: number) => `SET BRIGHTNESS ${Math.round(value)}\n`,
  mock: (on: boolean) => `MOCK ${on ? 'ON' : 'OFF'}\n`,
  debug: (on: boolean) => `DEBUG ${on ? 'ON' : 'OFF'}\n`,
  calibrate: (target: 'spot' | 'entrance') => `CAL ${target.toUpperCase()}\n`,
  reset: () => 'RESET\n',
  reboot: () => 'REBOOT\n',
  /** "I am still here": sent every second so the board can show on its LEDs when the app is gone. */
  ping: () => 'PING\n',
};
