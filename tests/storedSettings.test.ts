import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_THRESHOLDS, loadThresholds, saveThresholds } from '../src/config/storedSettings';

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
