import { isStale } from './deviceModel';
import { parseDeviceLine, type DeviceMessage } from './protocol';

/**
 * The one object that talks to the board over USB (Web Serial). Everything else in the app
 * gets decoded messages from it and never touches the port directly.
 *
 * It handles the things that go wrong with a USB device: the port is busy, the cable is
 * pulled out, the board resets, the board stops sending. The browser API is passed in, so
 * the tests can drive it with a fake port.
 */

export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface LinkEvents {
  onStatus(status: LinkStatus, error: string | null): void;
  onMessage(message: DeviceMessage): void;
  /** true when the board has gone quiet, false when data is flowing again */
  onStale(stale: boolean): void;
  /** every raw line, for the technician view */
  onLine?(line: string): void;
}

export interface LinkOptions {
  baudRate?: number;
  /** No data for this long counts as "board not responding". */
  staleMs?: number;
  /** How often the watchdog checks. */
  watchdogMs?: number;
  now?: () => number;
}

export const DEFAULT_BAUD_RATE = 115200;
export const DEFAULT_STALE_MS = 2500;

const MESSAGES = {
  busy: 'Could not open the port. Close the Arduino IDE Serial Monitor (or any other app using it) and try again.',
  lost: 'Lost connection to the board (was it unplugged?).',
  silent: 'Connected, but the board is not sending data. Check that the Smart Parking sketch is uploaded and the baud rate is 115200.',
};

export class DeviceLink {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private status: LinkStatus = 'idle';
  private stale = false;
  private lastDataAt: number | null = null;
  private receivedAny = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private wantConnection = false;
  private unplugged = false;
  private readonly baudRate: number;
  private readonly staleMs: number;
  private readonly watchdogMs: number;
  private readonly now: () => number;

  private readonly api: Serial | undefined;
  private readonly events: LinkEvents;

  constructor(api: Serial | undefined, events: LinkEvents, options: LinkOptions = {}) {
    this.api = api;
    this.events = events;
    this.baudRate = options.baudRate ?? DEFAULT_BAUD_RATE;
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    this.watchdogMs = options.watchdogMs ?? 500;
    this.now = options.now ?? (() => Date.now());
    this.api?.addEventListener('disconnect', this.onPortGone);
    this.api?.addEventListener('connect', this.onPortBack);
  }

  get supported(): boolean {
    return this.api !== undefined;
  }

  /** Asks the user to pick a port (must be called from a click), then opens it. */
  async connect(): Promise<void> {
    if (!this.api || this.status === 'connecting' || this.status === 'connected') return;
    this.setStatus('connecting', null);
    let port: SerialPort;
    try {
      port = await this.api.requestPort();
    } catch {
      this.setStatus('idle', null); // the user closed the picker
      return;
    }
    this.wantConnection = true;
    await this.open(port);
  }

  /** Opens a port the user already allowed earlier, without showing the picker. */
  async reconnect(): Promise<void> {
    if (!this.api || this.status === 'connecting' || this.status === 'connected') return;
    let ports: SerialPort[] = [];
    try {
      ports = await this.api.getPorts();
    } catch {
      return;
    }
    if (ports.length === 0) return;
    this.setStatus('connecting', null);
    this.wantConnection = true;
    await this.open(ports[0]);
  }

  async disconnect(): Promise<void> {
    this.wantConnection = false;
    try {
      await this.reader?.cancel();
    } catch {
      // already closed
    }
  }

  /** Sends one command line to the board. Resolves false if there is no open connection. */
  async send(text: string): Promise<boolean> {
    const writable = this.port?.writable;
    if (!writable || this.status !== 'connected') return false;
    const writer = writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(text));
      return true;
    } catch {
      return false;
    } finally {
      writer.releaseLock();
    }
  }

  dispose(): void {
    this.api?.removeEventListener('disconnect', this.onPortGone);
    this.api?.removeEventListener('connect', this.onPortBack);
    this.wantConnection = false;
    void this.reader?.cancel().catch(() => {});
    this.stopWatchdog();
  }

  // ---------------------------------------------------------------------------------

  private async open(port: SerialPort): Promise<void> {
    try {
      await port.open({ baudRate: this.baudRate });
    } catch {
      try {
        await port.close(); // a half-open port from an earlier attempt: close it and try once more
        await port.open({ baudRate: this.baudRate });
      } catch {
        this.setStatus('error', MESSAGES.busy);
        return;
      }
    }

    // Opening resets most ESP32 boards; leave the reset lines released so it boots normally.
    try {
      await port.setSignals?.({ dataTerminalReady: false, requestToSend: false });
    } catch {
      // not supported on this adapter, harmless
    }

    this.port = port;
    this.receivedAny = false;
    this.lastDataAt = this.now();
    this.stale = false;
    this.setStatus('connected', null);
    this.startWatchdog();
    void this.readLoop(port); // runs until the connection ends; connect() itself resolves as soon as the port is open
  }

  private async readLoop(port: SerialPort): Promise<void> {
    let lost = false;
    this.unplugged = false;
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      if (port.readable) {
        const reader = port.readable.getReader();
        this.reader = reader;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > 4096) buffer = buffer.slice(-512); // a board that never sends a newline cannot fill memory
            let newline = buffer.indexOf('\n');
            while (newline >= 0) {
              this.handleLine(buffer.slice(0, newline));
              buffer = buffer.slice(newline + 1);
              newline = buffer.indexOf('\n');
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch {
      lost = true;
    } finally {
      lost = lost || this.unplugged;
      this.unplugged = false;
      this.reader = null;
      this.stopWatchdog();
      this.port = null;
      try {
        await port.close();
      } catch {
        // already closed
      }
      if (this.stale) {
        this.stale = false;
        this.events.onStale(false);
      }
      if (lost && this.wantConnection) this.setStatus('error', MESSAGES.lost);
      else if (this.status !== 'error') this.setStatus('idle', null);
    }
  }

  private handleLine(line: string): void {
    this.events.onLine?.(line);
    const message = parseDeviceLine(line);
    if (!message) return;
    this.lastDataAt = this.now();
    this.receivedAny = true;
    if (this.stale) {
      this.stale = false;
      this.events.onStale(false);
    }
    this.events.onMessage(message);
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => this.checkStale(), this.watchdogMs);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /** Runs on a timer; public so the tests can call it without waiting. */
  checkStale(): void {
    if (this.status !== 'connected' || this.stale) return;
    if (isStale(this.lastDataAt, this.now(), this.staleMs)) {
      this.stale = true;
      this.events.onStale(true);
      if (!this.receivedAny) this.events.onStatus('connected', MESSAGES.silent);
    }
  }

  private setStatus(status: LinkStatus, error: string | null): void {
    this.status = status;
    this.events.onStatus(status, error);
  }

  // The browser tells us when a known device is unplugged or plugged back in.
  private onPortGone = (): void => {
    if (this.status === 'connected') {
      this.unplugged = true;
      void this.reader?.cancel().catch(() => {});
    }
  };

  private onPortBack = (): void => {
    if (this.wantConnection && (this.status === 'error' || this.status === 'idle')) void this.reconnect();
  };
}
