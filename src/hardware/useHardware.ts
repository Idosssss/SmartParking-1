import { useCallback, useEffect, useRef, useState } from 'react';
import { EMULATOR_SAMPLE_MS, SENSOR_FAR_CM } from '../config/constants';
import { clampThreshold, loadThresholds, saveThresholds } from '../config/storedSettings';
import { detectionsFromFrame } from './deviceModel';
import { deviceCommands } from './protocol';
import { IDLE_DETECTOR, stepDetector, type Detector, type SensorReading } from './sensorLogic';
import { useSerialSensors } from './useSerialSensors';

export type HardwareSource = 'none' | 'serial' | 'emulator';

const THRESHOLD_SEND_DELAY_MS = 250;

/**
 * One place for everything hardware: the real board (Web Serial) or the on-screen
 * emulator feed the same pipeline, which outputs two stable booleans.
 *
 * With the current firmware the board decides "car" and "spot taken" itself and the app
 * just follows it. With older firmware (distances only) and with the emulator, the app
 * runs the same debounce logic locally.
 */
export function useHardware() {
  const serial = useSerialSensors();

  const [emulatorOn, setEmulatorOn] = useState(false);
  const [emuEntranceCm, setEmuEntranceCm] = useState(SENSOR_FAR_CM);
  const [emuSpotCm, setEmuSpotCm] = useState(SENSOR_FAR_CM);
  const [emuReading, setEmuReading] = useState<SensorReading | null>(null);
  const [thresholds, setThresholds] = useState(loadThresholds);
  const entranceThresholdCm = thresholds.entranceCm;
  const spotThresholdCm = thresholds.spotCm;

  const emuValuesRef = useRef({ entrance: SENSOR_FAR_CM, spot: SENSOR_FAR_CM });
  useEffect(() => {
    emuValuesRef.current = { entrance: emuEntranceCm, spot: emuSpotCm };
  }, [emuEntranceCm, emuSpotCm]);

  const serialConnected = serial.status === 'connected';
  const source: HardwareSource = serialConnected ? 'serial' : emulatorOn ? 'emulator' : 'none';
  const deviceFrame = serialConnected ? serial.frame : null;
  const smartDevice = !!deviceFrame && !deviceFrame.legacy; // firmware that reports its own decisions

  // The emulator behaves like a device: it streams a sample a few times a second.
  const emulating = source === 'emulator';
  useEffect(() => {
    if (!emulating) return;
    const id = setInterval(() => {
      setEmuReading({ entranceCm: emuValuesRef.current.entrance, spotCm: emuValuesRef.current.spot });
    }, EMULATOR_SAMPLE_MS);
    return () => clearInterval(id);
  }, [emulating]);

  const reading = source === 'serial' ? serial.reading : source === 'emulator' ? emuReading : null;

  // ---- local detection (emulator and distance-only firmware) -----------------------------
  const thresholdsRef = useRef({ entrance: entranceThresholdCm, spot: spotThresholdCm });
  useEffect(() => {
    thresholdsRef.current = { entrance: entranceThresholdCm, spot: spotThresholdCm };
  }, [entranceThresholdCm, spotThresholdCm]);

  // Detector state is tagged with the source it belongs to, so switching or dropping
  // the source can never leave a stale "car detected" behind.
  const [detectors, setDetectors] = useState<{ source: HardwareSource; entrance: Detector; spot: Detector }>({
    source: 'none',
    entrance: IDLE_DETECTOR,
    spot: IDLE_DETECTOR,
  });

  useEffect(() => {
    if (!reading) return;
    setDetectors((prev) => {
      const base = prev.source === source ? prev : { source, entrance: IDLE_DETECTOR, spot: IDLE_DETECTOR };
      return {
        source,
        entrance: stepDetector(base.entrance, reading.entranceCm, thresholdsRef.current.entrance),
        spot: stepDetector(base.spot, reading.spotCm, thresholdsRef.current.spot),
      };
    });
  }, [reading, source]);

  const localLive = source !== 'none' && detectors.source === source;
  const fromBoard = detectionsFromFrame(deviceFrame, serial.stale);

  let entranceDetected: boolean;
  let spotOccupied: boolean;
  if (source === 'serial' && serial.stale) {
    // The board went quiet: believe nothing instead of trusting the last reading.
    entranceDetected = false;
    spotOccupied = false;
  } else if (smartDevice) {
    entranceDetected = fromBoard.entranceDetected;
    spotOccupied = fromBoard.spotOccupied;
  } else {
    entranceDetected = localLive && detectors.entrance.active;
    spotOccupied = localLive && detectors.spot.active;
  }

  // ---- thresholds: the board is the source of truth when it is a smart one --------------
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendToBoard = useCallback(
    (command: string) => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = setTimeout(() => void serial.send(command), THRESHOLD_SEND_DELAY_MS);
    },
    [serial],
  );
  useEffect(
    () => () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
    },
    [],
  );

  const setEntranceThresholdCm = useCallback(
    (cm: number) => {
      const value = clampThreshold(cm, thresholdsRef.current.entrance);
      setThresholds((t) => {
        const next = { ...t, entranceCm: value };
        saveThresholds(next);
        return next;
      });
      if (smartDevice) sendToBoard(deviceCommands.setEntranceCm(value));
    },
    [smartDevice, sendToBoard],
  );

  const setSpotThresholdCm = useCallback(
    (cm: number) => {
      const value = clampThreshold(cm, thresholdsRef.current.spot);
      setThresholds((t) => {
        const next = { ...t, spotCm: value };
        saveThresholds(next);
        return next;
      });
      if (smartDevice) sendToBoard(deviceCommands.setSpotCm(value));
    },
    [smartDevice, sendToBoard],
  );

  // Ask a smart board for its settings once per connection, and show them (it may have been calibrated).
  const askedRef = useRef(false);
  useEffect(() => {
    if (!serialConnected) askedRef.current = false;
    else if (smartDevice && !askedRef.current) {
      askedRef.current = true;
      void serial.send(deviceCommands.get());
    }
  }, [serialConnected, smartDevice, serial]);

  // When the board reports its settings (after a calibration, say) the sliders follow it.
  // Adjusting state while rendering is React's recommended way to react to a changed value.
  const boardConfig = serial.config;
  const [syncedConfig, setSyncedConfig] = useState(boardConfig);
  if (boardConfig !== syncedConfig) {
    setSyncedConfig(boardConfig);
    if (boardConfig) {
      setThresholds((t) => {
        const next = { entranceCm: clampThreshold(boardConfig.entranceCm, t.entranceCm), spotCm: clampThreshold(boardConfig.spotCm, t.spotCm) };
        return next.entranceCm === t.entranceCm && next.spotCm === t.spotCm ? t : next;
      });
    }
  }

  // ---- commands for the technician panel ----------------------------------------------------
  const run = useCallback(
    async (command: string, refresh = true) => {
      const ok = await serial.send(command);
      if (ok && refresh) await serial.send(deviceCommands.get());
      return ok;
    },
    [serial],
  );

  const device = {
    smart: smartDevice,
    state: deviceFrame?.state ?? null,
    mock: deviceFrame?.mock ?? false,
    faultEntrance: fromBoard.entranceFault,
    faultSpot: fromBoard.spotFault,
    wifi: deviceFrame?.wifi ?? null,
    stale: serialConnected && serial.stale,
    frame: deviceFrame,
    config: boardConfig,
    lastReply: serial.lastReply,
    log: serial.log,
    stats: serial.stats,
    setMock: (on: boolean) => run(deviceCommands.mock(on)),
    calibrate: (target: 'spot' | 'entrance') => run(deviceCommands.calibrate(target), false),
    setBrightness: (value: number) => run(deviceCommands.setBrightness(value)),
    setDebug: (on: boolean) => run(deviceCommands.debug(on), false),
    factoryReset: () => run(deviceCommands.reset()),
  };

  return {
    source,
    active: source !== 'none',
    reading,
    entranceDetected,
    spotOccupied,
    entranceThresholdCm,
    spotThresholdCm,
    setEntranceThresholdCm,
    setSpotThresholdCm,
    device,
    serial: {
      supported: serial.supported,
      status: serial.status,
      error: serial.error,
      stale: serial.stale,
      connect: serial.connect,
      disconnect: serial.disconnect,
    },
    emulator: {
      on: emulatorOn,
      setOn: setEmulatorOn,
      entranceCm: emuEntranceCm,
      spotCm: emuSpotCm,
      setEntranceCm: setEmuEntranceCm,
      setSpotCm: setEmuSpotCm,
    },
  };
}

export type Hardware = ReturnType<typeof useHardware>;
