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
 * @param {Set<object>} seen Set of visited objects for cycle detection
 */
export function validateStateValue(value, path = [], seen = new Set()) {
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
    // Reject descriptors before reading their values; getters are ambient code.
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key === 'symbol' || !('value' in descriptor)
        || (!descriptor.enumerable && !(Array.isArray(value) && key === 'length'))) {
        throw new UnsupportedTypeError('State requires enumerable string-keyed data properties (plus array length).');
      }
    }
    // Check for Promise / thenable
    if (typeof value.then === 'function') {
      throw new UnsupportedTypeError(
        `Promises/thenables cannot be stored in state at path "${path.join('.') || '<root>'}".`
      );
    }

    // Check for DOM nodes (browser or mock environments)
    if (
      (typeof Node !== 'undefined' && value instanceof Node) ||
      value.nodeType !== undefined ||
      value.window === value
    ) {
      throw new UnsupportedTypeError(
        `DOM Nodes cannot be stored in state at path "${path.join('.') || '<root>'}".`
      );
    }

    // Cycle detection
    if (seen.has(value)) {
      throw new CircularReferenceError(
        `Circular reference detected at path "${path.join('.') || '<root>'}".`
      );
    }
    seen.add(value);

    // Arrays
    if (Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        validateStateValue(value[key], [...path, key], seen);
      }
      seen.delete(value);
      return;
    }

    // Plain objects check: prototype must be Object.prototype or null
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      const className = value.constructor ? value.constructor.name : 'Unknown';
      throw new UnsupportedTypeError(
        `Class instances (${className}) are not supported in state at path "${path.join('.') || '<root>'}". Only plain objects and arrays are allowed.`
      );
    }

    // Validate object keys and properties
    for (const key of Object.keys(value)) {
      validateStateValue(value[key], [...path, key], seen);
    }
    seen.delete(value);
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
