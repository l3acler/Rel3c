// Internal syntax tokens; no primitive boxing or changes to normal state reads.
const readers = new WeakMap();
export const isBinding = value => value !== null && (typeof value === 'object' || typeof value === 'function') && readers.has(value);
export const readBinding = value => readers.get(value)();

export function derive(reader) {
  if (typeof reader !== 'function') throw new TypeError('derive requires a synchronous reader');
  const token = Object.freeze({});
  readers.set(token, reader);
  return token;
}

export function createBindings(rootReader, path = []) {
  const token = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      return createBindings(rootReader, [...path, property]);
    },
    set() { throw new TypeError('Binding tokens are read-only'); },
  });
  readers.set(token, () => {
    let value = rootReader();
    for (const key of path) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    return value;
  });
  return token;
}
