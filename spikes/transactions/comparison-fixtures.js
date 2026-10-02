// Independent native-JavaScript model/observer oracle. Do not import engine
// graph, clone, equality, membrane or delta helpers in this file.
import assert from 'node:assert/strict';

export function initialComparisonState() {
  const shared = { count: 1, label: 'shared', details: { enabled: false } };
  const a = { id: 'a', count: 0, details: { enabled: true } };
  return {
    user: { profile: { age: 20, name: 'Ada' }, preferences: { theme: 'dark' } },
    primary: shared, secondary: shared, nested: { shared },
    items: [a, { id: 'b', count: 2, details: { enabled: false } }],
    selected: a,
    values: [1, 2, 3],
    extra: {},
  };
}

export function createRandom(seed) {
  let value = seed >>> 0;
  return maximum => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) % maximum;
  };
}

export function createProgram(random, step) {
  return Array.from({ length: 1 + random(5) }, (_, index) => ({
    kind: random(16), value: random(20), index: random(6), key: `field${random(4)}`,
    id: `new-${step}-${index}`,
  }));
}

export function applyOperation(state, op) {
  switch (op.kind) {
    case 0: state.user.profile.age = op.value; break;
    case 1: state.secondary.count += op.value; break;
    case 2: state.primary.details.enabled = !state.primary.details.enabled; break;
    case 3: state.extra[op.key] = op.value; break;
    case 4: delete state.extra[op.key]; break;
    case 5: {
      const old = state.user.profile.name;
      state.user.profile.name = 'temporary';
      state.user.profile.name = old;
      break;
    }
    case 6: if (state.items.length) state.items.push(state.items.shift()); break;
    case 7: state.items.reverse(); break;
    case 8: state.items.splice(op.index % (state.items.length + 1), 0,
      { id: op.id, count: op.value, details: { enabled: false } }); break;
    case 9: if (state.items.length) state.items[op.index % state.items.length].count += op.value; break;
    case 10: state.selected.count = op.value; break;
    case 11: state.values.length = op.index; break;
    case 12: state.values[op.index] = op.value; break;
    case 13: delete state.values[op.index]; break;
    case 14: state.extra[op.key] = undefined; break;
    case 15: state.items.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)); break;
  }
}

// Clone with alias/hole preservation, tagging old nodes with engine IDs.
export function createNativeModel(engine) {
  const copies = new Map();
  const ids = new WeakMap();
  let next = 1;
  function clone(node) {
    if (node === null || typeof node !== 'object') return node;
    if (copies.has(node)) return copies.get(node);
    const result = Array.isArray(node) ? [] : Object.create(Object.getPrototypeOf(node));
    copies.set(node, result);
    ids.set(result, engine.getObjectId(node));
    for (const key of Reflect.ownKeys(node)) {
      if (Array.isArray(node) && key === 'length') result.length = node.length;
      else Object.defineProperty(result, key, { value: clone(node[key]), enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  const state = clone(engine.getState());
  function id(node) {
    if (!ids.has(node)) ids.set(node, `new-${next++}`);
    return ids.get(node);
  }
  const value = node => node !== null && typeof node === 'object' ? { identity: id(node) } : node;
  function observe() {
    const nodes = new Map();
    function visit(node) {
      if (node === null || typeof node !== 'object' || nodes.has(id(node))) return;
      nodes.set(id(node), {
        array: Array.isArray(node), keys: Object.keys(node), prototype: Object.getPrototypeOf(node),
        properties: new Map(Reflect.ownKeys(node).map(key => [key, value(node[key])])),
      });
      for (const key of Object.keys(node)) visit(node[key]);
    }
    visit(state);
    return nodes;
  }
  return { state, id, observe };
}

export function expectedInvalidations(before, after) {
  const result = [];
  const same = (a, b) => a && b && typeof a === 'object' && typeof b === 'object'
    ? a.identity === b.identity : Object.is(a, b);
  for (const [targetId, old] of before) {
    const current = after.get(targetId);
    if (!current) continue;
    let iterates = false;
    const add = (kind, key = null) => result.push({ targetId, kind, key });
    for (const key of new Set([...old.properties.keys(), ...current.properties.keys()])) {
      const oldValue = old.properties.has(key) ? old.properties.get(key) : old.prototype?.[key];
      const newValue = current.properties.has(key) ? current.properties.get(key) : current.prototype?.[key];
      const valueChanged = !same(oldValue, newValue);
      const existsChanged = old.properties.has(key) !== current.properties.has(key);
      if (valueChanged) add('value', key);
      if (existsChanged) add('has', key);
      if (old.array && (key === 'length' || /^(0|[1-9]\d*)$/.test(key))
        && (valueChanged || existsChanged)) iterates = true;
    }
    if (JSON.stringify(old.keys) !== JSON.stringify(current.keys)) add('keys');
    if (iterates) add('iterate');
  }
  return sortInvalidations(result);
}

export function sortInvalidations(values) {
  return values.map(value => JSON.stringify(value)).sort();
}

// A bijection catches both alias splitting and merging, which deep equality
// alone does not reliably detect. Identity checks are optional for active drafts.
export function assertGraphMatches(actual, model, engine = null, modelIds = null) {
  const forward = new Map();
  const reverse = new Map();
  function compare(a, b) {
    if (b === null || typeof b !== 'object') { assert.ok(Object.is(a, b)); return; }
    assert.ok(a !== null && typeof a === 'object');
    if (forward.has(b)) { assert.equal(a, forward.get(b)); return; }
    assert.equal(reverse.has(a), false, 'distinct model objects must not merge');
    forward.set(b, a);
    reverse.set(a, b);
    if (engine && typeof modelIds(b) === 'number') assert.equal(engine.getObjectId(a), modelIds(b));
    assert.equal(Array.isArray(a), Array.isArray(b));
    assert.equal(Object.getPrototypeOf(a), Object.getPrototypeOf(b));
    assert.deepEqual(Reflect.ownKeys(a), Reflect.ownKeys(b));
    for (const key of Reflect.ownKeys(b)) compare(a[key], b[key]);
  }
  compare(actual, model);
}
