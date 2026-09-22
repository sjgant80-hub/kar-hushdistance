// kernel.mjs
// HushDistance — a pure, total scorer for how "quiet" an edit to a JSON-like
// object is. Structural changes (added/removed keys) are weighted heavier
// than value-only tweaks, so callers can gate "loud" mutations from "quiet"
// ones without needing a schema.
//
// No I/O. Never throws. Bad input returns { ok:false, why:... }.

const STRUCTURAL_WEIGHT = 3;
const VALUE_WEIGHT = 1;

function isPlainObject(x) {
  return (
    x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x)
  );
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// hushDistance(oldState, newState) -> { ok, value, added, removed, changed }
// value is a non-negative number: 0 means no observable difference.
export function hushDistance(oldState, newState) {
  if (!isPlainObject(oldState) || !isPlainObject(newState)) {
    return { ok: false, why: 'both arguments must be plain (non-array, non-null) objects' };
  }

  const oldKeys = Object.keys(oldState);
  const newKeys = Object.keys(newState);
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);

  const added = newKeys.filter((k) => !oldSet.has(k)).sort();
  const removed = oldKeys.filter((k) => !newSet.has(k)).sort();
  const common = oldKeys.filter((k) => newSet.has(k));

  const changed = common.filter((k) => !deepEqual(oldState[k], newState[k])).sort();

  const structuralCount = added.length + removed.length;
  const valueCount = changed.length;
  const value = structuralCount * STRUCTURAL_WEIGHT + valueCount * VALUE_WEIGHT;

  return { ok: true, value, added, removed, changed };
}

// isQuiet(oldState, newState, threshold=3) -> { ok, value, distance }
// value is a boolean: true when the edit's hushDistance is <= threshold.
export function isQuiet(oldState, newState, threshold = 3) {
  const result = hushDistance(oldState, newState);
  if (!result.ok) return result;

  if (typeof threshold !== 'number' || Number.isNaN(threshold) || threshold < 0) {
    return { ok: false, why: 'threshold must be a non-negative number' };
  }

  return { ok: true, value: result.value <= threshold, distance: result.value };
}
