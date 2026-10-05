// Shared graph wire implementation; each caller owns its format, limits and errors.
export function createGraphCodec({ format, version, defaultLimits, fail }) {
const indexKey = key => /^(0|[1-9]\d*)$/.test(key) && Number(key) < 4294967295;
const put = (object, key, value) => Object.defineProperty(object, key,
  { value, enumerable: true, configurable: true, writable: true });

function limitsFor(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('Limits must be an object');
  const result = { ...defaultLimits };
  for (const key of Reflect.ownKeys(options)) {
    if (!Object.hasOwn(result, key)) fail('Unknown snapshot limit');
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!('value' in descriptor)) fail('Limits cannot use accessors');
    result[key] = descriptor.value;
  }
  for (const [key, value] of Object.entries(result)) {
    const minimum = ['maxBytes', 'maxDepth'].includes(key) ? 1 : 0;
    if (!Number.isSafeInteger(value) || value < minimum) fail('Invalid limit: ' + key);
  }
  // This recursive codec intentionally caps stack depth, even with overrides.
  if (result.maxDepth > 256) fail('maxDepth cannot exceed 256 in this codec');
  return result;
}

function byteLimit(text, limits) {
  if (text.length > limits.maxBytes || new TextEncoder().encode(text).length > limits.maxBytes) {
    fail('Snapshot exceeds maxBytes');
  }
}

function encodeSnapshot(value, options = {}) {
  const limits = limitsFor(options);
  const nodes = [];
  const seen = new WeakMap();
  const active = new WeakSet();
  let entryCount = 0;
  let arraySlots = 0;
  let dataChars = 0;
  const accountString = text => {
    dataChars += text.length;
    if (dataChars > limits.maxBytes) fail('String/key data exceeds maxBytes');
  };
  function encode(input, depth) {
    if (input === null) return { token: ['null'], height: 0 };
    if (input === undefined) return { token: ['undefined'], height: 0 };
    if (typeof input === 'boolean') return { token: ['boolean', input], height: 0 };
    if (typeof input === 'string') {
      accountString(input);
      return { token: ['string', input], height: 0 };
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) fail('Non-finite numbers are unsupported');
      return { token: Object.is(input, -0) ? ['negative-zero'] : ['number', input], height: 0 };
    }
    if (typeof input !== 'object') fail('Unsupported snapshot type: ' + typeof input);
    if (active.has(input)) fail('Cycles are unsupported');
    const previous = seen.get(input);
    if (previous) {
      if (depth + previous.height > limits.maxDepth) fail('Snapshot exceeds maxDepth');
      return { token: ['ref', previous.id], height: previous.height };
    }
    if (depth >= limits.maxDepth) fail('Snapshot exceeds maxDepth');
    if (nodes.length >= limits.maxNodes) fail('Snapshot exceeds maxNodes');
    const isArray = Array.isArray(input);
    const prototype = Object.getPrototypeOf(input);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      fail('Only ordinary arrays and plain/null-prototype objects are supported');
    }
    const keys = Reflect.ownKeys(input);
    const ownEntryCount = keys.length - (isArray ? 1 : 0);
    if (entryCount + ownEntryCount > limits.maxEntries) fail('Snapshot exceeds maxEntries');
    const descriptors = keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== 'string' || !('value' in descriptor)
        || (!descriptor.enumerable && !(isArray && key === 'length'))) {
        fail('Only enumerable string-keyed data properties (plus array length) are supported');
      }
      return [key, descriptor.value];
    });
    // Match the transaction spike's conservative native-object boundary.
    if (descriptors.some(([key, item]) => key === 'nodeType' && item !== undefined)) fail('DOM-shaped values are unsupported');
    const entries = descriptors.filter(([key]) => !(isArray && key === 'length'));
    entryCount += entries.length;
    if (entryCount > limits.maxEntries) fail('Snapshot exceeds maxEntries');
    entries.forEach(([key]) => accountString(key));
    const length = isArray ? descriptors.find(([key]) => key === 'length')?.[1] : undefined;
    if (isArray && (!Number.isSafeInteger(length) || length < 0 || length > 4294967295)) fail('Malformed array length');
    const record = isArray ? { kind: 'array', length, entries: [] }
      : { kind: 'object', prototype: prototype === null ? 'null' : 'plain', entries: [] };
    if (isArray) {
      arraySlots += record.length;
      if (record.length > limits.maxArrayLength) fail('Snapshot exceeds maxArrayLength');
      if (arraySlots > limits.maxArraySlots) fail('Snapshot exceeds maxArraySlots');
    }
    const info = { id: nodes.length, height: 0 };
    seen.set(input, info); active.add(input); nodes.push(record);
    let childHeight = 0;
    for (const [key, item] of entries) {
      const child = encode(item, depth + 1);
      record.entries.push([key, child.token]); childHeight = Math.max(childHeight, child.height);
    }
    info.height = 1 + childHeight;
    if (depth + info.height > limits.maxDepth) fail('Snapshot exceeds maxDepth');
    active.delete(input);
    return { token: ['ref', info.id], height: info.height };
  }
  const root = encode(value, 0).token;
  const text = JSON.stringify({ format: format, version: version, root, nodes });
  byteLimit(text, limits);
  return text;
}

function exactFields(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) {
    fail('Malformed snapshot record');
  }
}

function decodeSnapshot(text, options = {}) {
  const limits = limitsFor(options);
  if (typeof text !== 'string') fail('Snapshot input must be a canonical JSON string');
  byteLimit(text, limits);
  let envelope;
  try { envelope = JSON.parse(text); } catch { fail('Malformed snapshot JSON'); }
  exactFields(envelope, ['format', 'version', 'root', 'nodes']);
  if (envelope.format !== format || envelope.version !== version) fail('Incompatible snapshot format/version');
  if (!Array.isArray(envelope.nodes)) fail('Malformed node table');
  if (envelope.nodes.length > limits.maxNodes) fail('Snapshot exceeds maxNodes');
  const refs = envelope.nodes.map(() => []);
  let entryCount = 0;
  let arraySlots = 0;
  function token(value, references) {
    if (!Array.isArray(value)) fail('Malformed value token');
    const [tag, item] = value;
    if (['null', 'undefined', 'negative-zero'].includes(tag) && value.length === 1) return;
    if (value.length !== 2) fail('Malformed value token');
    if (tag === 'string' && typeof item === 'string') return;
    if (tag === 'boolean' && typeof item === 'boolean') return;
    if (tag === 'number' && typeof item === 'number' && Number.isFinite(item) && !Object.is(item, -0)) return;
    if (tag === 'ref' && Number.isSafeInteger(item) && item >= 0 && item < envelope.nodes.length) {
      references.push(item); return;
    }
    fail('Unsupported or malformed value token');
  }
  envelope.nodes.forEach((node, id) => {
    if (node?.kind === 'array') {
      exactFields(node, ['kind', 'length', 'entries']);
      if (!Number.isSafeInteger(node.length) || node.length < 0 || node.length > 4294967295) fail('Malformed array length');
      if (node.length > limits.maxArrayLength) fail('Snapshot exceeds maxArrayLength');
      arraySlots += node.length;
      if (arraySlots > limits.maxArraySlots) fail('Snapshot exceeds maxArraySlots');
    } else if (node?.kind === 'object') {
      exactFields(node, ['kind', 'prototype', 'entries']);
      if (!['plain', 'null'].includes(node.prototype)) fail('Unsupported object prototype');
    } else fail('Unsupported node kind');
    if (!Array.isArray(node.entries)) fail('Malformed property entries');
    entryCount += node.entries.length;
    if (entryCount > limits.maxEntries) fail('Snapshot exceeds maxEntries');
    const keys = new Set();
    for (const entry of node.entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') fail('Malformed property entry');
      const [key, value] = entry;
      if (keys.has(key)) fail('Duplicate property entry');
      keys.add(key);
      if (node.kind === 'array' && (key === 'length' || indexKey(key) && Number(key) >= node.length)) fail('Invalid array property entry');
      token(value, refs[id]);
    }
  });
  const rootRefs = [];
  token(envelope.root, rootRefs);
  const colors = new Uint8Array(envelope.nodes.length);
  const heights = new Uint16Array(envelope.nodes.length);
  function visit(id, depth) {
    if (colors[id] === 1) fail('Cycles are unsupported');
    if (colors[id] === 2) {
      if (depth + heights[id] > limits.maxDepth) fail('Snapshot exceeds maxDepth');
      return heights[id];
    }
    if (depth >= limits.maxDepth) fail('Snapshot exceeds maxDepth');
    colors[id] = 1;
    let height = 1;
    for (const child of refs[id]) height = Math.max(height, 1 + visit(child, depth + 1));
    if (depth + height > limits.maxDepth) fail('Snapshot exceeds maxDepth');
    heights[id] = height; colors[id] = 2;
    return height;
  }
  rootRefs.forEach(id => visit(id, 0));
  if (colors.some(color => color !== 2)) fail('Unreachable snapshot node');
  // Allocate only after wire shape, reference, cycle and resource checks pass.
  const objects = envelope.nodes.map(node => node.kind === 'array' ? new Array(node.length)
    : Object.create(node.prototype === 'null' ? null : Object.prototype));
  function resolve([tag, item]) {
    if (tag === 'ref') return objects[item];
    if (tag === 'null') return null;
    if (tag === 'undefined') return undefined;
    if (tag === 'negative-zero') return -0;
    return item;
  }
  envelope.nodes.forEach((node, id) => {
    for (const [key, value] of node.entries) put(objects[id], key, resolve(value));
  });
  const root = resolve(envelope.root);
  // Canonical wire only: rejects duplicate JSON fields, reordered IDs/keys,
  // whitespace variants, and any representation that silently normalizes.
  if (encodeSnapshot(root, limits) !== text) fail('Noncanonical snapshot encoding');
  return root;
}

return Object.freeze({ encode: encodeSnapshot, decode: decodeSnapshot });
}
