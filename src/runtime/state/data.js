import { fail } from "../errors.js";

export const STATE_LIMITS = Object.freeze({
  depth: 128, nodes: 10_000, entries: 100_000,
  arraySlots: 100_000, textUnits: 1_000_000,
});
export const isObject = value => value !== null && typeof value === "object";
export const arrayIndex = key => typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)
  && Number(key) < 4294967295;
export const emptyLike = value => Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
export function put(target, key, value) {
  if (Array.isArray(target) && key === "length") target.length = value;
  else Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}
export function checkScalar(value) {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))) return;
  fail("STATE_INVALID", "State requires supported finite data values.");
}
export const zeroUsage = () => ({ nodes: 0, entries: 0, arraySlots: 0, textUnits: 0 });
export function addUsage(before, extra) {
  const next = {};
  for (const key of Object.keys(before)) {
    next[key] = before[key] + (extra[key] ?? 0);
    if (next[key] > STATE_LIMITS[key])
      fail("STATE_LIMIT", `State/transaction exceeds ${STATE_LIMITS[key]} ${key}.`);
  }
  return next;
}

// Descriptor-only traversal. Completed subtree heights guard deeper alias paths.
// resolve skips already-owned imports; full commit validation never skips nodes.
export function inspectGraph(root, { source = value => value, resolve = () => undefined } = {}) {
  const records = new Map();
  const active = new Set();
  let usage = zeroUsage();
  function visit(value, depth) {
    if (!isObject(value)) {
      checkScalar(value);
      if (typeof value === "string") usage = addUsage(usage, { textUnits: value.length });
      return 0;
    }
    if (resolve(value) !== undefined) return 0;
    if (active.has(value)) fail("STATE_CYCLE", "State cycles are unsupported; acyclic aliases are allowed.");
    if (records.has(value)) {
      const height = records.get(value).height;
      if (depth + height > STATE_LIMITS.depth) fail("STATE_LIMIT", "State exceeds 128 object levels.");
      return height;
    }
    if (depth >= STATE_LIMITS.depth) fail("STATE_LIMIT", "State exceeds 128 object levels.");
    usage = addUsage(usage, { nodes: 1 });
    const current = source(value);
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      fail("STATE_INVALID", "State accepts only ordinary same-realm objects/arrays or null-prototype objects.");
    const keys = Reflect.ownKeys(current);
    usage = addUsage(usage, { entries: keys.length - (array ? 1 : 0) });
    const descriptors = keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (typeof key !== "string" || !descriptor || !("value" in descriptor)
        || (!descriptor.enumerable && !(array && key === "length")))
        fail("STATE_INVALID", "State requires enumerable string-keyed data properties (plus array length).");
      if (key === "nodeType" && descriptor.value !== undefined)
        fail("STATE_INVALID", "DOM-shaped nodeType values are unsupported.");
      usage = addUsage(usage, { textUnits: key.length });
      return [key, descriptor.value];
    });
    if (array) {
      const length = descriptors.find(([key]) => key === "length")[1];
      if (!Number.isInteger(length) || length < 0 || length > 4294967295)
        fail("STATE_INVALID", "Invalid array length.");
      usage = addUsage(usage, { arraySlots: length });
    }
    const record = { descriptors, height: 1 };
    records.set(value, record);
    active.add(value);
    try {
      for (const [key, child] of descriptors) {
        if (array && key === "length") continue;
        record.height = Math.max(record.height, 1 + visit(child, depth + 1));
      }
    } finally { active.delete(value); }
    return record.height;
  }
  visit(root, 0);
  return { records, usage };
}

export function copyGraph(root, records, resolve = () => undefined) {
  const copies = new Map([...records.keys()].map(value => [value, emptyLike(value)]));
  const copied = value => isObject(value) ? (resolve(value) ?? copies.get(value)) : value;
  for (const [value, { descriptors }] of records)
    for (const [key, data] of descriptors) put(copies.get(value), key, copied(data));
  return { root: copied(root), copies };
}
export function freezeGraph(root) {
  const seen = new Set();
  function freeze(value) {
    if (!isObject(value) || Object.isFrozen(value) || seen.has(value)) return;
    seen.add(value);
    for (const key of Object.keys(value)) freeze(value[key]);
    Object.freeze(value);
  }
  freeze(root);
  return root;
}
