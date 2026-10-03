import { fail } from "../errors.js";
import { isObject, emptyLike } from "./data.js";

const draftOwners = new WeakMap();
export function createDraftView(root, storage) {
  const proxies = new Map(),
    targets = new WeakMap(),
    revokers = [];
  const owner = {};
  function resolve(value) {
    if (draftOwners.has(value) && draftOwners.get(value) !== owner)
      fail(
        "STATE_INVALID",
        "Drafts from another transaction cannot be imported.",
      );
    return targets.get(value) ?? (storage.owns(value) ? value : undefined);
  }
  function reject() {
    fail(
      "STATE_INVALID",
      "Descriptors and prototype changes are unsupported in drafts.",
    );
  }
  function proxy(node) {
    if (!isObject(node) || !storage.owns(node)) return node;
    if (proxies.has(node)) return proxies.get(node);
    const { proxy: result, revoke } = Proxy.revocable(emptyLike(node), {
      get(_target, key) {
        return proxy(storage.read(node, key));
      },
      set(_target, key, value) {
        if (typeof key === "symbol")
          fail("STATE_INVALID", "Symbol state keys are unsupported.");
        if (key === "nodeType" && value !== undefined)
          fail("STATE_INVALID", "DOM-shaped nodeType values are unsupported.");
        storage.write(node, key, storage.adopt(value, resolve));
        return true;
      },
      deleteProperty(_target, key) {
        if (typeof key === "symbol")
          fail("STATE_INVALID", "Symbol state keys are unsupported.");
        return storage.remove(node, key);
      },
      has(_target, key) {
        return key in storage.source(node);
      },
      ownKeys() {
        return Reflect.ownKeys(storage.source(node));
      },
      getOwnPropertyDescriptor(_target, key) {
        if (!Object.hasOwn(storage.source(node), key)) return undefined;
        return {
          value: proxy(storage.read(node, key)),
          writable: true,
          enumerable: !(Array.isArray(node) && key === "length"),
          configurable: !(Array.isArray(node) && key === "length"),
        };
      },
      getPrototypeOf() {
        return Object.getPrototypeOf(node);
      },
      setPrototypeOf: reject,
      defineProperty: reject,
      preventExtensions: reject,
    });
    targets.set(result, node);
    proxies.set(node, result);
    draftOwners.set(result, owner);
    revokers.push(revoke);
    return result;
  }
  return {
    draft: proxy(root),
    revoke() {
      for (const revoke of revokers) revoke();
      revokers.length = 0;
      proxies.clear();
      storage = null;
    },
  };
}
