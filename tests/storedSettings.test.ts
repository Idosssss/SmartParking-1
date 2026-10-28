import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DEMO_SETTINGS, ambientMsPerCell, msPerCell } from '../src/config/demoSettings';
import { DEFAULT_THRESHOLDS, loadDemoSettings, loadThresholds, saveDemoSettings, saveThresholds } from '../src/config/storedSettings';

function fakeStorage(initial?: string) {
  let value = initial;
  return {
    getItem: () => value ?? null,
    setItem: (_: string, v: string) => {
      value = v;
    },
    get value() {
      return value;
    },
  };
}

test('thresholds round-trip through storage', () => {
  const s = fakeStorage();
  saveThresholds({ entranceCm: 12, spotCm: 20 }, s);
  assert.deepEqual(loadThresholds(s), { entranceCm: 12, spotCm: 20 });
});

test('damaged or missing data falls back to the defaults', () => {
  assert.deepEqual(loadThresholds(fakeStorage()), DEFAULT_THRESHOLDS);
  assert.deepEqual(loadThresholds(fakeStorage('{not json')), DEFAULT_THRESHOLDS);
  assert.deepEqual(loadThresholds(fakeStorage('"a string"')), DEFAULT_THRESHOLDS);
  assert.deepEqual(loadThresholds(fakeStorage('{"entranceCm":"x","spotCm":null}')), DEFAULT_THRESHOLDS);
});

test('stored values are clamped to the range the board accepts', () => {
  const t = loadThresholds(fakeStorage('{"entranceCm":1,"spotCm":9999}'));
  assert.equal(t.entranceCm, 5);
  assert.equal(t.spotCm, 60);
});

test('blocked storage never throws', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.deepEqual(loadThresholds(broken), DEFAULT_THRESHOLDS);
  assert.doesNotThrow(() => saveThresholds(DEFAULT_THRESHOLDS, broken));
});

test('demo settings round-trip through storage', () => {
  const s = fakeStorage();
  const chosen = { traffic: 'busy', speed: 'slow', stealing: 'off', voice: true } as const;
  saveDemoSettings(chosen, s);
  assert.deepEqual(loadDemoSettings(s), chosen);
});

test('demo settings: nothing saved, damaged JSON, or blocked storage give the defaults', () => {
  assert.deepEqual(loadDemoSettings(fakeStorage()), DEFAULT_DEMO_SETTINGS);
  assert.deepEqual(loadDemoSettings(fakeStorage('{not json')), DEFAULT_DEMO_SETTINGS);
  assert.deepEqual(loadDemoSettings({ getItem: () => { throw new Error('blocked'); } }), DEFAULT_DEMO_SETTINGS);
  assert.deepEqual(loadDemoSettings(undefined), DEFAULT_DEMO_SETTINGS);
  assert.doesNotThrow(() => saveDemoSettings(DEFAULT_DEMO_SETTINGS, { setItem: () => { throw new Error('full'); } }));
});

test('demo settings: unknown values are replaced one by one, good ones are kept', () => {
  const s = fakeStorage(JSON.stringify({ traffic: 'gridlock', speed: 'fast', stealing: 'toString', voice: 'yes' }));
  assert.deepEqual(loadDemoSettings(s), { ...DEFAULT_DEMO_SETTINGS, speed: 'fast' });
});

test('driving speed scales your car and the other cars alike', () => {
  const normal = DEFAULT_DEMO_SETTINGS;
  const slow = { ...normal, speed: 'slow' } as const;
  const fast = { ...normal, speed: 'fast' } as const;
  assert.ok(msPerCell(slow) > msPerCell(normal) && msPerCell(normal) > msPerCell(fast));
  // Other cars stay faster than yours at every speed, so the "someone takes your spot" case always works.
  for (const st of [slow, normal, fast]) assert.ok(ambientMsPerCell(st) < msPerCell(st));
});
