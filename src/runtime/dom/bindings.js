import { fail } from '../errors.js';

const readers = new WeakMap();
export const isBinding = value => value !== null &&
  (typeof value === 'object' || typeof value === 'function') && readers.has(value);

export function derive(read, owner = null, presentation = false) {
  if (typeof read !== 'function') fail('BINDING_INVALID', 'derive requires a synchronous read function.');
  const token = Object.freeze({});
  readers.set(token, { read, owner, presentation });
  return token;
}
export const isPresentationBinding = value => isBinding(value) && readers.get(value).presentation === true;

export function createBindings(owner, check, path = [], source = state => state) {
  const children = new Map();
  const immutable = () => fail('BINDING_READONLY', 'Binding tokens are read-only.');
  const token = new Proxy(Object.create(null), {
    get(_target, key) {
      check();
      if (typeof key !== 'string') return undefined;
      if (!children.has(key)) children.set(key, createBindings(owner, check, [...path, key], source));
      return children.get(key);
    },
    set: immutable, deleteProperty: immutable, defineProperty: immutable,
    setPrototypeOf: immutable, preventExtensions: immutable,
  });
  readers.set(token, { owner, read(state) {
    check();
    state = source(state);
    for (const key of path) {
      if (state === null || state === undefined) return undefined;
      state = state[key];
    }
    return state;
  } });
  return token;
}

export function resolveBinding(value, state, owner) {
  if (!isBinding(value)) return value;
  const source = readers.get(value);
  if (source.owner !== null && source.owner !== owner)
    fail('BINDING_OWNER', 'A state binding belongs to a different application.');
  const { read } = source;
  return read(state);
}
