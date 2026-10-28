import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceLink, type LinkEvents, type LinkStatus } from '../src/hardware/deviceLink';
import type { DeviceMessage } from '../src/hardware/protocol';

// A pretend serial port: tests push text in as if the board had sent it.
class FakePort extends EventTarget {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  written: string[] = [];
  openCalls = 0;
  failOpenTimes = 0;
  signals: object[] = [];
  private controller!: ReadableStreamDefaultController<Uint8Array>;

  constructor() {
    super();
    this.readable = new ReadableStream<Uint8Array>({ start: (c) => (this.controller = c) });
    this.writable = new WritableStream<Uint8Array>({ write: (chunk) => void this.written.push(new TextDecoder().decode(chunk)) });
  }
  async open() {
    this.openCalls++;
    if (this.failOpenTimes > 0) {
      this.failOpenTimes--;
      throw new DOMException('busy', 'InvalidStateError');
    }
  }
  async close() {}
  async setSignals(s: object) {
    this.signals.push(s);
  }
  push(text: string) {
    this.controller.enqueue(new TextEncoder().encode(text));
  }
  unplug() {
    this.controller.error(new Error('NetworkError'));
  }
}

class FakeSerial extends EventTarget {
  ports: FakePort[] = [];
  nextPort: FakePort | null = null;
  async requestPort() {
    if (!this.nextPort) throw new DOMException('cancelled', 'NotFoundError');
    return this.nextPort as unknown as SerialPort;
  }
  async getPorts() {
    return this.ports as unknown as SerialPort[];
  }
}

function setup() {
  const serial = new FakeSerial();
  const port = new FakePort();
  serial.nextPort = port;
  const statuses: { status: LinkStatus; error: string | null }[] = [];
  const messages: DeviceMessage[] = [];
  const stale: boolean[] = [];
  let clock = 0;
  const events: LinkEvents = {
    onStatus: (status, error) => statuses.push({ status, error }),
    onMessage: (m) => messages.push(m),
    onStale: (v) => stale.push(v),
  };
  const link = new DeviceLink(serial as unknown as Serial, events, { now: () => clock, staleMs: 2500, watchdogMs: 60_000 });
  return { serial, port, link, statuses, messages, stale, advance: (ms: number) => (clock += ms) };
}

const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const lastStatus = (s: { status: LinkStatus }[]) => s[s.length - 1]?.status;

test('connects, decodes lines split across chunks, and ignores boot noise', async () => {
  const { link, port, messages, statuses } = setup();
  void link.connect();
  await wait();
  assert.equal(lastStatus(statuses), 'connected');
  port.push('ets Jun  8 2016 00:22:57\r\n');
  port.push('{"entrance":80.0,"spo');
  port.push('t":8.1,"car":false,"taken":true}\n{"entrance":9.0,"spot":80.0,"car":true,"taken":false}\n');
  await wait();
  assert.equal(messages.length, 2);
  assert.equal(messages[0].kind, 'frame');
  link.dispose();
});

test('the reset lines are released after opening', async () => {
  const { link, port } = setup();
  void link.connect();
  await wait();
  assert.deepEqual(port.signals[0], { dataTerminalReady: false, requestToSend: false });
  link.dispose();
});

test('a busy port gives a clear message, then a second connect works', async () => {
  const { link, port, statuses } = setup();
  port.failOpenTimes = 2; // fails the first attempt and the automatic retry
  await link.connect();
  assert.equal(lastStatus(statuses), 'error');
  assert.match(statuses[statuses.length - 1].error ?? '', /Serial Monitor/);
  void link.connect();
  await wait();
  assert.equal(lastStatus(statuses), 'connected');
  link.dispose();
});

test('closing the port picker is not an error', async () => {
  const { link, serial, statuses } = setup();
  serial.nextPort = null;
  await link.connect();
  assert.equal(lastStatus(statuses), 'idle');
  assert.ok(statuses.every((s) => s.error === null));
});

test('a silent board is reported, and recovery is reported too', async () => {
  const { link, port, stale, advance, statuses } = setup();
  void link.connect();
  await wait();
  port.push('{"entrance":80,"spot":80,"car":false,"taken":false}\n');
  await wait();
  advance(1000);
  link.checkStale();
  assert.deepEqual(stale, []); // 1 s of silence is fine
  advance(2000);
  link.checkStale();
  assert.deepEqual(stale, [true]);
  link.checkStale();
  assert.deepEqual(stale, [true]); // reported once, not every tick
  port.push('{"entrance":80,"spot":80,"car":false,"taken":false}\n');
  await wait();
  assert.deepEqual(stale, [true, false]);
  assert.equal(lastStatus(statuses), 'connected');
  link.dispose();
});

test('connected but never any data says what to check', async () => {
  const { link, advance, statuses } = setup();
  void link.connect();
  await wait();
  advance(3000);
  link.checkStale();
  const last = statuses[statuses.length - 1];
  assert.equal(last.status, 'connected');
  assert.match(last.error ?? '', /not sending data/);
  link.dispose();
});

test('unplugging the board ends in a clear error', async () => {
  const { link, port, statuses } = setup();
  void link.connect();
  await wait();
  port.unplug();
  await wait();
  assert.equal(lastStatus(statuses), 'error');
  assert.match(statuses[statuses.length - 1].error ?? '', /unplugged/);
  link.dispose();
});

test('commands are written to the board only while connected', async () => {
  const { link, port } = setup();
  assert.equal(await link.send('GET\n'), false);
  void link.connect();
  await wait();
  assert.equal(await link.send('SET SPOT_CM 17\n'), true);
  assert.deepEqual(port.written, ['SET SPOT_CM 17\n']);
  link.dispose();
});

test('disconnect ends in idle, not in an error', async () => {
  const { link, statuses } = setup();
  void link.connect();
  await wait();
  await link.disconnect();
  await wait();
  assert.equal(lastStatus(statuses), 'idle');
  assert.ok(statuses.every((s) => s.status !== 'error'));
  link.dispose();
});

test('a board that was allowed before reconnects without the picker', async () => {
  const { link, serial, port, statuses } = setup();
  serial.ports = [port];
  serial.nextPort = null; // requestPort would fail: the picker must not be used
  await link.reconnect();
  await wait();
  assert.equal(lastStatus(statuses), 'connected');
  link.dispose();
});

test('a board that never sends a newline cannot fill the memory', async () => {
  const { link, port, messages, statuses } = setup();
  void link.connect();
  await wait();
  for (let i = 0; i < 50; i++) port.push('x'.repeat(1000));
  port.push('{"entrance":80,"spot":80}\n');
  await wait();
  assert.equal(lastStatus(statuses), 'connected');
  assert.ok(messages.length <= 1);
  link.dispose();
});

test('no serial support: connect does nothing', async () => {
  const link = new DeviceLink(undefined, { onStatus: () => {}, onMessage: () => {}, onStale: () => {} });
  assert.equal(link.supported, false);
  await link.connect();
  assert.equal(await link.send('GET\n'), false);
});
