// Shared spike graph/metadata protocol. Transaction storage strategies stay separate.
export const isObject = value => value !== null && typeof value === 'object';
export const own = (value, key) => Object.hasOwn(value, key);
export const keysOf = value => Reflect.ownKeys(value);
export const arrayIndex = key => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)
  && Number(key) < 4294967295;

export function put(target, key, value) {
  if (Array.isArray(target) && key === 'length') target.length = value;
  else Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

export function emptyLike(value) {
  return Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
}

export function createIdentities() {
  const ids = new WeakMap();
  let next = 1;
  return {
    get(value) {
      if (!isObject(value)) throw new TypeError('Object identity requires an object.');
      if (!ids.has(value)) ids.set(value, next++);
      return ids.get(value);
    },
    copy(source, target) { ids.set(target, this.get(source)); },
  };
}

export function cloneGraph(root, identities, memo = new Map()) {
  if (!isObject(root)) return root;
  if (memo.has(root)) return memo.get(root);
  const result = emptyLike(root);
  memo.set(root, result);
  if (identities) identities.copy(root, result);
  for (const key of keysOf(root)) put(result, key, cloneGraph(root[key], identities, memo));
  return result;
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

// Net changes use logical identity, not physical copies or transient write logs.
export function graphDelta(before, after, identities) {
  const oldNodes = indexGraph(before, identities);
  const newNodes = indexGraph(after, identities);
  const changes = [];
  const affectedProperties = [];
  const affectedPaths = new Set();
  const equal = (a, b) => isObject(a) && isObject(b)
    ? identities.get(a) === identities.get(b) : Object.is(a, b);
  for (const [targetId, { value: previous, path }] of oldNodes) {
    const current = newNodes.get(targetId)?.value;
    if (!current) continue;
    const oldKeys = keysOf(previous);
    const newKeys = keysOf(current);
    let iterationChanged = false;
    const mark = (kind, key = null) => affectedProperties.push({ targetId, kind, key });
    for (const key of new Set([...oldKeys, ...newKeys])) {
      const had = own(previous, key);
      const has = own(current, key);
      const valueChanged = !equal(previous[key], current[key]);
      if (had === has && !valueChanged) continue;
      changes.push({ targetId, type: !has ? 'delete' : !had ? 'add' : 'set',
        path: [...path, key], key, oldValue: previous[key], value: current[key] });
      affectedPaths.add([...path, key].join('.'));
      if (valueChanged) mark('value', key);
      if (had !== has) mark('has', key);
      if (Array.isArray(previous) && (key === 'length' || arrayIndex(key))) iterationChanged = true;
    }
    const oldEnumerable = Object.keys(previous);
    const newEnumerable = Object.keys(current);
    if (oldEnumerable.length !== newEnumerable.length
      || oldEnumerable.some((key, i) => key !== newEnumerable[i])) mark('keys');
    if (iterationChanged) mark('iterate');
  }
  return { changes, affectedProperties, affectedPaths: [...affectedPaths] };
}
