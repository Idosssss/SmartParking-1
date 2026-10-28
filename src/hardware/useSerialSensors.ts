import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceLink, type LinkStatus } from './deviceLink';
import { deviceCommands, type DeviceConfig, type DeviceFrame } from './protocol';
import type { SensorReading } from './sensorLogic';

export type SerialStatus = LinkStatus;

const LOG_LINES = 12;

/** React wrapper around DeviceLink: connection state plus the latest decoded data from the board. */
export function useSerialSensors() {
  const [status, setStatus] = useState<SerialStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<DeviceFrame | null>(null);
  const [stale, setStale] = useState(false);
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  // Counters for the reliability view: every line received, the ones that were valid messages, and when data last arrived.
  const [stats, setStats] = useState({ lines: 0, messages: 0, lastDataAt: null as number | null });
  const linkRef = useRef<DeviceLink | null>(null);

  const getLink = useCallback((): DeviceLink => {
    if (!linkRef.current) {
      linkRef.current = new DeviceLink(typeof navigator !== 'undefined' ? navigator.serial : undefined, {
        onStatus: (s, e) => {
          setStatus(s);
          setError(e);
          if (s !== 'connected') {
            setFrame(null);
            setStale(false);
            setConfig(null);
          }
        },
        onStale: (value) => setStale(value),
        onLine: (line) => {
          setLog((prev) => [...prev.slice(-(LOG_LINES - 1)), line]);
          setStats((st) => ({ ...st, lines: st.lines + 1 }));
        },
        onMessage: (m) => {
          setStats((st) => ({ ...st, messages: st.messages + 1, lastDataAt: Date.now() }));
          if (m.kind === 'frame') setFrame(m.frame);
          else if (m.kind === 'config') setConfig(m.config);
          else if (m.kind === 'ack') {
            setLastReply(m.value === undefined ? `OK: ${m.what}` : `OK: ${m.what} (${m.value})`);
            // The board changed its own settings (calibration finished, defaults restored): read them back.
            if (m.what === 'calibrated' || m.what === 'reset') void linkRef.current?.send(deviceCommands.get());
          }
          else if (m.kind === 'error') setLastReply(`Board says: ${m.message}`);
        },
      });
    }
    return linkRef.current;
  }, []);

  const supported = typeof navigator !== 'undefined' && !!navigator.serial;

  // Reopen the board automatically if the user already allowed it before (no picker needed).
  useEffect(() => {
    const link = getLink();
    void link.reconnect();
    return () => {
      link.dispose();
      linkRef.current = null;
    };
  }, [getLink]);

  const connect = useCallback(() => getLink().connect(), [getLink]);
  const disconnect = useCallback(() => getLink().disconnect(), [getLink]);
  const send = useCallback((command: string) => getLink().send(command), [getLink]);

  // A new object only when a new frame arrives, so the reading can be used to spot fresh samples.
  const reading = useMemo<SensorReading | null>(() => (frame ? { entranceCm: frame.entranceCm, spotCm: frame.spotCm } : null), [frame]);

  return { supported, status, error, reading, frame, stale, config, lastReply, log, stats, connect, disconnect, send };
}
