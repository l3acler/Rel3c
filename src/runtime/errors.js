export class FrameworkError extends Error {
  constructor(code, message, options) {
    super(`[mini-framework:${code}] ${message}`, options);
    this.name = "FrameworkError";
    this.code = code;
  }
}

export function fail(code, message) {
  throw new FrameworkError(code, message);
}

// Observe illegal native Promise returns without executing unknown thenables.
// This prevents a secondary unhandled rejection, not asynchronous side effects.
export function observePromise(value) {
  if (value instanceof Promise)
    Promise.prototype.then.call(value, undefined, () => {});
}

export function requireSync(value, code, message) {
  observePromise(value);
  if (
    value instanceof Promise ||
    (value &&
      (typeof value === "object" || typeof value === "function") &&
      typeof value.then === "function")
  )
    fail(code, message);
}
