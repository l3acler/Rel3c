import { fail } from "../errors.js";
import { isObject, emptyLike, put, arrayIndex } from "./data.js";

export function createIdentities() {
  const ids = new WeakMap();
  let next = 1;
  return {
    assign(value) {
      if (!ids.has(value)) ids.set(value, next++);
      return ids.get(value);
    },
    peek: (value) => ids.get(value),
    get(value) {
      if (!isObject(value) || !ids.has(value))
        fail("STATE_ID_INVALID", "Object is not an owned state snapshot node.");
      return ids.get(value);
    },
    copy(source, target) {
      ids.set(target, this.get(source));
    },
  };
}
export function indexGraph(root, identities) {
  const nodes = new Map();
  function visit(value, path) {
    if (!isObject(value)) return;
    const id = identities.get(value);
    if (nodes.has(id)) return;
    nodes.set(id, { value, path });
    for (const key of Object.keys(value)) visit(value[key], [...path, key]);
  }
  visit(root, []);
  return nodes;
}

// Full validated edge scan includes unread aliases. Sharing follows physical
// references, whereas deltas below compare logical identities.
export function materialize(root, records, identities) {
  const memo = new Map();
  function visit(node) {
    if (!isObject(node)) return node;
    if (memo.has(node)) return memo.get(node);
    const result = emptyLike(node);
    const descriptors = records.get(node).descriptors;
    const baseKeys = Reflect.ownKeys(node);
    let changed = descriptors.length !== baseKeys.length;
    for (let i = 0; i < descriptors.length; i++) {
      const [key, raw] = descriptors[i];
      const value = visit(raw);
      if (
        key !== baseKeys[i] ||
        !Object.hasOwn(node, key) ||
        !Object.is(node[key], value)
      )
        changed = true;
      put(result, key, value);
    }
    if (changed) identities.copy(node, result);
    memo.set(node, changed ? result : node);
    return memo.get(node);
  }
  return visit(root);
}

export function graphDelta(before, after, identities) {
  const oldNodes = indexGraph(before, identities);
  const newNodes = indexGraph(after, identities);
  const changes = [],
    affectedProperties = [],
    affectedPaths = new Set();
  const equal = (a, b) =>
    Object.is(a, b) ||
    (isObject(a) &&
      isObject(b) &&
      identities.peek(a) !== undefined &&
      identities.peek(a) === identities.peek(b));
  for (const [targetId, { value: previous, path }] of oldNodes) {
    const current = newNodes.get(targetId)?.value;
    if (!current || current === previous) continue;
    let iterationChanged = false;
    const mark = (kind, key = null) =>
      affectedProperties.push(Object.freeze({ targetId, kind, key }));
    for (const key of new Set([
      ...Reflect.ownKeys(previous),
      ...Reflect.ownKeys(current),
    ])) {
      const had = Object.hasOwn(previous, key),
        has = Object.hasOwn(current, key);
      const valueChanged = !equal(previous[key], current[key]);
      if (had === has && !valueChanged) continue;
      changes.push(
        Object.freeze({
          targetId,
          type: !has ? "delete" : !had ? "add" : "set",
          path: Object.freeze([...path, key]),
          key,
          oldValue: previous[key],
          value: current[key],
        }),
      );
      affectedPaths.add([...path, key].join("."));
      if (valueChanged) mark("value", key);
      if (had !== has) mark("has", key);
      if (Array.isArray(previous) && (key === "length" || arrayIndex(key)))
        iterationChanged = true;
    }
    const oldKeys = Object.keys(previous),
      newKeys = Object.keys(current);
    if (
      oldKeys.length !== newKeys.length ||
      oldKeys.some((key, i) => key !== newKeys[i])
    )
      mark("keys");
    if (iterationChanged) mark("iterate");
  }
  return {
    changes: Object.freeze(changes),
    affectedProperties: Object.freeze(affectedProperties),
    affectedPaths: Object.freeze([...affectedPaths]),
  };
}
