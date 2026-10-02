import { fail } from "../errors.js";

// Construction guards, not transaction-growth or retained-history budgets.
const limits = {
  depth: 128,
  nodes: 10_000,
  entries: 100_000,
  arraySlots: 100_000,
  textUnits: 1_000_000,
};

export function ownInitialState(input) {
  if (input === null || typeof input !== "object")
    fail("STATE_INVALID", "initialState root must be an object or array.");
  const memo = new WeakMap();
  const active = new WeakSet();
  let nodes = 0;
  let entries = 0;
  let slots = 0;
  let textUnits = 0;
  const budget = (condition, label) => {
    if (condition) fail("STATE_LIMIT", `Initial state exceeds ${label}.`);
  };
  const text = (value) => {
    textUnits += value.length;
    budget(textUnits > limits.textUnits, "1,000,000 string/key UTF-16 units");
  };
  function copy(value, depth) {
    if (value === null || value === undefined || typeof value === "boolean")
      return { value, height: 0 };
    if (typeof value === "string") {
      text(value);
      return { value, height: 0 };
    }
    if (typeof value === "number" && Number.isFinite(value))
      return { value, height: 0 };
    if (typeof value !== "object")
      fail("STATE_INVALID", "State requires supported finite data values.");
    if (active.has(value))
      fail(
        "STATE_CYCLE",
        "State cycles are unsupported; acyclic aliases are allowed.",
      );
    const previous = memo.get(value);
    if (previous) {
      budget(depth + previous.height > limits.depth, "128 object levels");
      return previous;
    }
    budget(depth >= limits.depth, "128 object levels");
    budget(++nodes > limits.nodes, "10,000 objects/arrays");
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    ) {
      fail(
        "STATE_INVALID",
        "State accepts only ordinary same-realm objects/arrays or null-prototype objects.",
      );
    }
    const keys = Reflect.ownKeys(value);
    entries += keys.length - (array ? 1 : 0);
    budget(entries > limits.entries, "100,000 properties");
    const descriptors = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        !("value" in descriptor) ||
        (!descriptor.enumerable && !(array && key === "length"))
      ) {
        fail(
          "STATE_INVALID",
          "State requires enumerable string-keyed data properties (plus array length).",
        );
      }
      if (key === "nodeType" && descriptor.value !== undefined)
        fail("STATE_INVALID", "DOM-shaped nodeType values are unsupported.");
      text(key);
      return [key, descriptor.value];
    });
    const result = array ? [] : Object.create(prototype);
    if (array) {
      const length = descriptors.find(([key]) => key === "length")[1];
      if (!Number.isSafeInteger(length) || length < 0 || length > 4294967295)
        fail("STATE_INVALID", "Invalid array length.");
      slots += length;
      budget(slots > limits.arraySlots, "100,000 aggregate array slots");
      result.length = length;
    }
    active.add(value);
    let height = 1;
    for (const [key, data] of descriptors) {
      if (array && key === "length") continue;
      const child = copy(data, depth + 1);
      height = Math.max(height, 1 + child.height);
      Object.defineProperty(result, key, {
        value: child.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(value);
    const complete = { value: Object.freeze(result), height };
    memo.set(value, complete);
    return complete;
  }
  return copy(input, 0).value;
}
