import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDLE_DETECTOR, parseSensorLine, stepDetector, type Detector } from '../src/hardware/sensorLogic';

test('parseSensorLine reads JSON and CSV and rejects the rest', () => {
  assert.deepEqual(parseSensorLine('{"entrance":12.3,"spot":80.0}'), { entranceCm: 12.3, spotCm: 80 });
  assert.deepEqual(parseSensorLine(' 12.3,80.0 \r'), { entranceCm: 12.3, spotCm: 80 });
  assert.equal(parseSensorLine('hello'), null);
  assert.equal(parseSensorLine('{"entrance":1}'), null);
  assert.equal(parseSensorLine('1,2,3'), null);
  assert.equal(parseSensorLine('{bad json'), null);
  assert.equal(parseSensorLine('Infinity,3'), null);
});

function run(distances: number[], threshold = 15): Detector[] {
  const states: Detector[] = [];
  let d = IDLE_DETECTOR;
  for (const cm of distances) {
    d = stepDetector(d, cm, threshold);
    states.push(d);
  }
  return states;
}

test('a detection needs three readings in a row', () => {
  const s = run([5, 5, 5]);
  assert.equal(s[0].active, false);
  assert.equal(s[1].active, false);
  assert.equal(s[2].active, true);
});

test('a single glitch does not flip the state', () => {
  const s = run([5, 5, 5, 80, 5, 5]);
  assert.equal(s[5].active, true);
});

test('hysteresis keeps the car detected just beyond the threshold', () => {
  const s = run([5, 5, 5, 16.5, 16.5, 16.5, 16.5]);
  assert.equal(s[6].active, true); // 16.5 < 15 + 2
  const gone = run([5, 5, 5, 18, 18, 18]);
  assert.equal(gone[5].active, false);
});
