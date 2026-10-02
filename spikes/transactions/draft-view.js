import { DraftRevokedError, UnsupportedTypeError, validateStateValue } from './contract.js';
import { isObject, emptyLike, keysOf, put } from './graph.js';

// One membrane enforces the same JavaScript semantics for all storage backends.
// Array methods run natively on the proxy; writes reach the selected backend.
export function createDraftView(root, storage, identities) {
  let active = true;
  const proxies = new Map();
  const targets = new WeakMap();
  const imports = new Map();
  const check = () => { if (!active) throw new DraftRevokedError(); };
  const reject = () => { check(); throw new UnsupportedTypeError('Descriptors and prototype changes are unsupported in drafts.'); };
  const resolve = value => storage.resolve?.(value) ?? (storage.owns(value) ? value : undefined);

  function adopt(value) {
    if (!isObject(value)) { validateStateValue(value); return value; }
    if (targets.has(value)) return targets.get(value);
    if (resolve(value)) return resolve(value);
    if (imports.has(value)) return imports.get(value);
    validateStateValue(value);
    function copy(source) {
      if (!isObject(source)) return source;
      if (targets.has(source)) return targets.get(source);
      if (resolve(source)) return resolve(source);
      if (imports.has(source)) return imports.get(source);
      const result = emptyLike(source);
      // Imported objects get fresh IDs, unlike copies of committed versions.
      identities.get(result);
      imports.set(source, result);
      storage.register(result);
      for (const key of keysOf(source)) put(result, key, copy(source[key]));
      return result;
    }
    return copy(value);
  }

  function proxy(node) {
    if (!isObject(node)) return node;
    if (proxies.has(node)) return proxies.get(node);
    const dummy = emptyLike(node);
    const result = new Proxy(dummy, {
      get(_target, key, receiver) {
        check();
        const value = storage.read(node, key);
        return proxy(value);
      },
      set(_target, key, value) {
        check();
        if (typeof key === 'symbol') throw new UnsupportedTypeError('Symbol state keys are unsupported.');
        storage.write(node, key, adopt(value));
        return true;
      },
      deleteProperty(_target, key) {
        check();
        if (typeof key === 'symbol') throw new UnsupportedTypeError('Symbol state keys are unsupported.');
        return storage.remove(node, key);
      },
      has(_target, key) { check(); return storage.has(node, key); },
      ownKeys() { check(); return storage.keys(node); },
      getOwnPropertyDescriptor(_target, key) {
        check();
        if (!storage.keys(node).includes(key)) return undefined;
        return { value: proxy(storage.read(node, key)), writable: true,
          enumerable: !(Array.isArray(node) && key === 'length'),
          configurable: !(Array.isArray(node) && key === 'length') };
      },
      getPrototypeOf() { check(); return Object.getPrototypeOf(node); },
      setPrototypeOf: reject,
      defineProperty: reject,
      preventExtensions: reject,
    });
    proxies.set(node, result);
    targets.set(result, node);
    return result;
  }

  return { draft: proxy(root), revoke() { active = false; } };
}
