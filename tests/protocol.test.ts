import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectionsFromFrame, isStale } from '../src/hardware/deviceModel';
import { deviceCommands, parseDeviceLine } from '../src/hardware/protocol';

const FRAME =
  '{"v":2,"seq":7,"up":1500,"entrance":80.0,"spot":8.2,"car":false,"taken":true,"state":"RUNNING","mock":false,"faultE":"none","faultS":"none","wifi":"off"}';

test('a v2 status frame is decoded completely', () => {
  const m = parseDeviceLine(FRAME);
  assert.equal(m?.kind, 'frame');
  if (m?.kind !== 'frame') return;
  assert.equal(m.frame.entranceCm, 80);
  assert.equal(m.frame.spotCm, 8.2);
  assert.equal(m.frame.spotTaken, true);
  assert.equal(m.frame.carAtEntrance, false);
  assert.equal(m.frame.state, 'RUNNING');
  assert.equal(m.frame.seq, 7);
  assert.equal(m.frame.legacy, false);
});

test('old firmware lines and CSV still work and are marked legacy', () => {
  const a = parseDeviceLine('{"entrance":12.3,"spot":80.0}');
  const b = parseDeviceLine('12.3,80.0');
  for (const m of [a, b]) {
    assert.equal(m?.kind, 'frame');
    if (m?.kind === 'frame') {
      assert.equal(m.frame.legacy, true);
      assert.equal(m.frame.entranceCm, 12.3);
    }
  }
});

test('replies from the board are decoded', () => {
  assert.deepEqual(parseDeviceLine('{"ack":"set","value":17.5}'), { kind: 'ack', what: 'set', value: 17.5 });
  assert.deepEqual(parseDeviceLine('{"ack":"mock_on"}'), { kind: 'ack', what: 'mock_on', value: undefined });
  assert.deepEqual(parseDeviceLine('{"err":"value out of range (5 to 60)"}'), { kind: 'error', message: 'value out of range (5 to 60)' });
  const cfg = parseDeviceLine('{"cfg":{"spot_cm":15.0,"entrance_cm":12.0,"brightness":40,"mock":false,"debug":true}}');
  assert.deepEqual(cfg, { kind: 'config', config: { spotCm: 15, entranceCm: 12, brightness: 40, mock: false, debug: true } });
  const dbg = parseDeviceLine('{"dbg":1,"rawE":370,"rawS":2400,"stdE":12,"stdS":20,"vE":0.298,"vS":1.935}');
  assert.equal(dbg?.kind, 'debug');
});

test('noise is ignored instead of crashing', () => {
  const junk = [
    '',
    '   ',
    'ets Jun  8 2016 00:22:57',
    'rst:0x1 (POWERON_RESET),boot:0x13',
    '{"entrance":12.3,',
    '{"entrance":"abc","spot":1}',
    '{"entrance":null,"spot":null}',
    '[1,2,3]',
    'null',
    '{"cfg":{"spot_cm":"x"}}',
    '12.3',
    'a,b',
  ];
  for (const line of junk) assert.equal(parseDeviceLine(line), null, `should ignore: ${JSON.stringify(line)}`);
});

test('unknown enum values are dropped, not trusted', () => {
  const m = parseDeviceLine('{"entrance":5,"spot":5,"car":true,"taken":false,"state":"EXPLODING","faultE":"smoke"}');
  assert.equal(m?.kind, 'frame');
  if (m?.kind === 'frame') {
    assert.equal(m.frame.state, undefined);
    assert.equal(m.frame.faultEntrance, undefined);
  }
});

test('commands end with a newline and match what the firmware expects', () => {
  assert.equal(deviceCommands.get(), 'GET\n');
  assert.equal(deviceCommands.setSpotCm(17.5), 'SET SPOT_CM 17.5\n');
  assert.equal(deviceCommands.setEntranceCm(12), 'SET ENTRANCE_CM 12\n');
  assert.equal(deviceCommands.setBrightness(40.4), 'SET BRIGHTNESS 40\n');
  assert.equal(deviceCommands.mock(true), 'MOCK ON\n');
  assert.equal(deviceCommands.debug(false), 'DEBUG OFF\n');
  assert.equal(deviceCommands.calibrate('spot'), 'CAL SPOT\n');
});

test('detections follow the board, ignore faulty sensors and pause when the board is silent', () => {
  const frame = (over: object) => {
    const m = parseDeviceLine(FRAME.replace('"taken":true', '"taken":false'));
    if (m?.kind !== 'frame') throw new Error('bad frame');
    return { ...m.frame, ...over };
  };
  const ok = detectionsFromFrame(frame({ carAtEntrance: true, spotTaken: true }), false);
  assert.equal(ok.entranceDetected, true);
  assert.equal(ok.spotOccupied, true);

  const faulty = detectionsFromFrame(frame({ carAtEntrance: true, faultEntrance: 'no_signal' }), false);
  assert.equal(faulty.entranceDetected, false);
  assert.equal(faulty.entranceFault, 'no_signal');

  const stale = detectionsFromFrame(frame({ carAtEntrance: true, spotTaken: true }), true);
  assert.equal(stale.entranceDetected, false);
  assert.equal(stale.spotOccupied, false);

  assert.equal(detectionsFromFrame(null, false).spotOccupied, false);
  const legacy = parseDeviceLine('{"entrance":5,"spot":5}');
  if (legacy?.kind === 'frame') assert.equal(detectionsFromFrame(legacy.frame, false).spotOccupied, false);
});

test('stale detection', () => {
  assert.equal(isStale(null, 10_000, 2500), false); // nothing received yet is handled by the first-data check
  assert.equal(isStale(1000, 3000, 2500), false);
  assert.equal(isStale(1000, 3600, 2500), true);
});
