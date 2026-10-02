import { fail } from "./errors.js";

// Read configuration/registration data without running ordinary accessors.
// Live Proxy traps and modified host intrinsics are not sandboxed.
export function readRecord(value, code, label, allowedKeys) {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(code, `${label} must be a plain or null-prototype object.`);
  }
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail(code, `${label} requires enumerable string-keyed data properties.`);
    }
    if (allowedKeys && !allowedKeys.includes(key))
      fail(code, `Unknown ${label} option: ${key}.`);
    result[key] = descriptor.value;
  }
  return result;
}
