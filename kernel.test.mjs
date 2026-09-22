import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from './kernel.mjs';

test('identical objects have hushDistance 0', () => {
  const a = { x: 1, y: 'hi' };
  const b = { x: 1, y: 'hi' };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 0);
});

test('a single value-only change costs 1 (VALUE_WEIGHT)', () => {
  const a = { x: 1, y: 'hi' };
  const b = { x: 2, y: 'hi' };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('a single added key costs 3 (STRUCTURAL_WEIGHT)', () => {
  const a = { x: 1 };
  const b = { x: 1, z: true };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 3);
  assert.deepEqual(result.added, ['z']);
});

test('one added key plus one changed value costs 4 (3+1)', () => {
  const a = { x: 1, y: 'hi' };
  const b = { x: 2, y: 'hi', z: true };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 4);
  assert.deepEqual(result.added, ['z']);
  assert.deepEqual(result.changed, ['x']);
});

test('non-object input returns ok:false instead of throwing', () => {
  assert.equal(K.hushDistance(null, {}).ok, false);
  assert.equal(K.hushDistance([1, 2], { a: 1 }).ok, false);
  assert.equal(K.hushDistance('nope', {}).ok, false);
});

test('isQuiet gates on threshold using the same pinned distances', () => {
  const a = { x: 1 };
  const b = { x: 1, z: true }; // distance 3
  const strict = K.isQuiet(a, b, 2);
  const loose = K.isQuiet(a, b, 3);
  assert.equal(strict.ok, true);
  assert.equal(strict.distance, 3);
  assert.equal(strict.value, false);
  assert.equal(loose.value, true);
});

// --- mutation-gap tests: deepEqual was only ever exercised via primitives
// (a === b short-circuit), so every branch past that line was unwitnessed.
// Each test below pins a value that a single named mutant would flip.

test('typeof mismatch (object vs number) is a change, not equal (kills line22 !==->=== )', () => {
  const a = { x: {} };
  const b = { x: 5 };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('null vs object (a is null) is a change, not equal (kills line23 a===null->!== )', () => {
  const a = { x: null };
  const b = { x: {} };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('object vs null (b is null) is a change, not equal (kills line23 b===null->!== )', () => {
  const a = { x: {} };
  const b = { x: null };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('an array is never equal to an array-like plain object of the same length (kills line25 !==->=== )', () => {
  const a = { x: [1, 2] };
  const b = { x: { length: 2, 0: 1, 1: 2 } };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('two distinct same-length same-value arrays are equal, not a change (kills line27 !==->=== )', () => {
  const a = { arr: [1, 2, 3] };
  const b = { arr: [1, 2, 3] };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 0);
  assert.deepEqual(result.changed, []);
});

test('arrays of different length are a change, not falsely equal (kills line27 return false->true)', () => {
  const a = { arr: [1, 2] };
  const b = { arr: [1, 2, 3] };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['arr']);
});

test('array comparison never reads index === length (kills line28 i<a.length -> i<=a.length)', () => {
  const real = [1, 2, 3];
  // A length-3 proxy that only differs from `real` if something reads the
  // nonexistent index 3 (the one extra step the <= mutant would take).
  const ghostAtLength = new Proxy([1, 2, 3], {
    get(target, prop) {
      if (prop === '3') return 'ghost';
      return target[prop];
    },
  });
  const a = { arr: real };
  const b = { arr: ghostAtLength };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 0);
  assert.deepEqual(result.changed, []);
});

test('same-length arrays with a differing element are a change, not falsely equal (kills line29 return false->true)', () => {
  const a = { arr: [1, 2, 3] };
  const b = { arr: [1, 9, 3] };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['arr']);
});

test('two distinct same-shape same-value nested objects are equal, not a change (kills line35 !==->=== )', () => {
  const a = { x: { a: 1, b: 2 } };
  const b = { x: { a: 1, b: 2 } };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 0);
  assert.deepEqual(result.changed, []);
});

test('nested objects with different key counts are a change, not falsely equal (kills line35 return false->true)', () => {
  const a = { x: { p: 1, q: 2 } };
  const b = { x: { p: 1 } };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('nested objects with same key count but a missing own key are a change, not falsely equal (kills line37 return false->true)', () => {
  const a = { x: { p: 1, q: 2 } };
  const b = { x: { p: 1, r: 2 } };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('nested objects with same keys but a differing value are a change, not falsely equal (kills line38 return false->true)', () => {
  const a = { x: { p: 1, q: 2 } };
  const b = { x: { p: 1, q: 99 } };
  const result = K.hushDistance(a, b);
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
  assert.deepEqual(result.changed, ['x']);
});

test('isQuiet treats threshold 0 as valid, not rejected (kills line74 threshold<0 -> <=0)', () => {
  const a = { x: 1 };
  const b = { x: 1 }; // distance 0
  const result = K.isQuiet(a, b, 0);
  assert.equal(result.ok, true);
  assert.equal(result.distance, 0);
  assert.equal(result.value, true);
});

test('isQuiet rejects a NaN threshold (kills line74 || -> && on both operators)', () => {
  const a = { x: 1 };
  const b = { x: 1 };
  const result = K.isQuiet(a, b, NaN);
  assert.equal(result.ok, false);
  assert.equal(result.why, 'threshold must be a non-negative number');
});
