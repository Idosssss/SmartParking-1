// A pretend ESP32 on a Web Serial port for the browser tests. The tests change window.__dev to steer it.
// Pretends to be the ESP32 on a Web Serial port. Test code changes window.__dev to steer it.
(() => {
  const dev = (window.__dev = { entrance: 80, spot: 80, car: false, taken: false, state: 'RUNNING', mock: false, faultE: 'none', faultS: 'none', mute: false, brightness: 40, spotCm: 15, entranceCm: 15, seq: 0, written: [] });
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let ctrl;
  const readable = new ReadableStream({ start: (c) => (ctrl = c) });
  const send = (o) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
  setInterval(() => {
    if (dev.mute) return;
    send({ v: 2, seq: ++dev.seq, up: Date.now() % 1e7, entrance: dev.entrance, spot: dev.spot, car: dev.car, taken: dev.taken, state: dev.state, mock: dev.mock, faultE: dev.faultE, faultS: dev.faultS, wifi: 'off' });
  }, 150);
  const writable = new WritableStream({
    write(chunk) {
      const line = dec.decode(chunk).trim();
      dev.written.push(line);
      const [verb, a, b] = line.toUpperCase().split(/\s+/);
      if (verb === 'GET') send({ cfg: { spot_cm: dev.spotCm, entrance_cm: dev.entranceCm, brightness: dev.brightness, mock: dev.mock, debug: false } });
      else if (verb === 'MOCK') { dev.mock = a === 'ON'; send({ ack: a === 'ON' ? 'mock_on' : 'mock_off' }); }
      else if (verb === 'SET' && a === 'SPOT_CM') { dev.spotCm = Number(b); send({ ack: 'set', value: Number(b) }); }
      else if (verb === 'SET' && a === 'ENTRANCE_CM') { dev.entranceCm = Number(b); send({ ack: 'set', value: Number(b) }); }
      else if (verb === 'SET' && a === 'BRIGHTNESS') { dev.brightness = Number(b); send({ ack: 'set', value: Number(b) }); }
      else if (verb === 'CAL') { send({ ack: 'calibrating' }); setTimeout(() => { dev.spotCm = 16; send({ ack: 'calibrated', value: 16 }); }, 800); }
      else if (verb === 'DEBUG') send({ ack: a === 'ON' ? 'debug_on' : 'debug_off' });
      else if (verb === 'RESET') { dev.spotCm = 15; dev.entranceCm = 15; send({ ack: 'reset' }); }
      else send({ err: 'unknown command (try HELP)' });
    },
  });
  const port = { readable, writable, open: async () => {}, close: async () => {}, setSignals: async () => {}, addEventListener() {}, removeEventListener() {} };
  const serial = new EventTarget();
  serial.requestPort = async () => port;
  serial.getPorts = async () => [];
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });
})();
