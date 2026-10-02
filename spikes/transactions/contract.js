/**
 * spikes/transactions/contract.js
 *
 * Prototype Transaction Contract Specification for Phase 0 Spikes.
 * Defines the shared interface, error types, change metadata specification,
 * and supported type rules for both Copy-on-Write and Staged-Operation prototypes.
 *
 * NOTE: This is internal spike code and is NOT part of the public runtime exports.
 */

// Error classes for transaction lifecycle and validation
export class TransactionActiveError extends Error {
  constructor(message = 'A transaction is already active on this store.') {
    super(message);
    this.name = 'TransactionActiveError';
  }
}

export class TransactionCompletedError extends Error {
  constructor(message = 'Transaction has already completed (committed or aborted).') {
    super(message);
    this.name = 'TransactionCompletedError';
  }
}

export class DraftRevokedError extends Error {
  constructor(message = 'Cannot access or mutate draft after transaction has completed.') {
    super(message);
    this.name = 'DraftRevokedError';
  }
}

export class UnsupportedTypeError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedTypeError';
  }
}

export class CircularReferenceError extends TypeError {
  constructor(message = 'Circular references are not supported in state.') {
    super(message);
    this.name = 'CircularReferenceError';
  }
}

/**
 * Validates that a value is of a supported serializable type.
 * Recursively inspects objects and arrays to ensure:
 * 1. No functions, symbols, DOM nodes, promises, or non-plain class instances.
 * 2. No circular references.
 *
 * @param {*} value The value to validate
 * @param {string[]} path Path prefix for descriptive error messages
 * @param {Set<object>} seen Active ancestors for cycle detection
 * @param {Set<object>} completed Nodes already validated in this traversal
 */
export function validateStateValue(value, path = [], seen = new Set(), completed = new Set()) {
  if (value === null || value === undefined) {
    return;
  }

  const type = typeof value;

  if (type === 'boolean' || type === 'string') {
    return;
  }

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new UnsupportedTypeError(
        `Non-finite number at path "${path.join('.') || '<root>'}" (${value}) is not supported.`
      );
    }
    return;
  }

  if (type === 'function') {
    throw new UnsupportedTypeError(
      `Functions cannot be stored in state at path "${path.join('.') || '<root>'}".`
    );
  }

  if (type === 'symbol') {
    throw new UnsupportedTypeError(
      `Symbols cannot be stored in state at path "${path.join('.') || '<root>'}".`
    );
  }

  if (type === 'bigint') {
    throw new UnsupportedTypeError('BigInt values are not supported in state.');
  }

  if (type === 'object') {
    if (seen.has(value)) {
      throw new CircularReferenceError(`Circular reference detected at path "${path.join('.') || '<root>'}".`);
    }
    if (completed.has(value)) return;
    // Check the original prototype before an import can normalize an array.
    // Do not read inherited then/nodeType/constructor getters on rejected types.
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== null && proto !== Object.prototype) {
      throw new UnsupportedTypeError('Only ordinary arrays and plain/null-prototype objects are supported in state.');
    }
    // Reject descriptors before reading their values; getters are ambient code.
    const descriptors = [];
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key === 'symbol' || !('value' in descriptor)
        || (!descriptor.enumerable && !(array && key === 'length'))) {
        throw new UnsupportedTypeError('State requires enumerable string-keyed data properties (plus array length).');
      }
      if (key === 'nodeType' && descriptor.value !== undefined) {
        throw new UnsupportedTypeError('DOM-shaped nodeType data cannot be stored in state.');
      }
      descriptors.push([key, descriptor.value]);
    }
    seen.add(value);
    try {
      for (const [key, data] of descriptors) {
        validateStateValue(data, [...path, key], seen, completed);
      }
      completed.add(value);
    } finally {
      seen.delete(value);
    }
  }
}

/**
 * Normalizes an array of path segments to a dot-string notation.
 * e.g., ['users', 0, 'name'] -> 'users.0.name'
 */
export function formatPath(path) {
  return path.map(String).join('.');
}

/**
 * Deep freezes an object and its nested properties, preventing runtime mutation.
 * Handles graph structures with shared aliases without infinite loops.
 */
export function deepFreeze(obj, seen = new Set()) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  if (seen.has(obj)) {
    return obj;
  }
  seen.add(obj);

  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val, seen);
    }
  }
  return obj;
}
