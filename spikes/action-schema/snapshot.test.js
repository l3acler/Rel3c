import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSnapshot, decodeSnapshot, SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from './snapshot.js';
import { validateStateValue } from '../transactions/contract.js';

function assertGraphEqual(before, after, forward = new Map(), reverse = new Map()) {
  if (before === null || typeof before !== 'object') { assert.ok(Object.is(before, after)); return; }
  assert.ok(after !== null && typeof after === 'object');
  if (forward.has(before)) { assert.equal(after, forward.get(before)); return; }
  assert.ok(!reverse.has(after), 'Distinct nodes must not merge');
  forward.set(before, after); reverse.set(after, before);
  assert.notEqual(before, after, 'Restored graphs are independent');
  assert.equal(Object.getPrototypeOf(before), Object.getPrototypeOf(after));
  assert.deepEqual(Reflect.ownKeys(before), Reflect.ownKeys(after));
  for (const key of Reflect.ownKeys(before)) assertGraphEqual(before[key], after[key], forward, reverse);
}
const define = (object, key, value) => Object.defineProperty(object, key,
  { value, writable: true, enumerable: true, configurable: true });
const roundTrip = value => {
  const text = encodeSnapshot(value); const restored = decodeSnapshot(text);
  assertGraphEqual(value, restored); assert.equal(encodeSnapshot(restored), text);
  return restored;
};
const supported = [
  ['null', null], ['undefined', undefined], ['false', false], ['true', true],
  ['empty string', ''], ['unicode/quotes/control/lone surrogate', 'Ada "\n\0 😀 العربية \ud800'],
  ['zero', 0], ['negative zero', -0], ['negative fraction', -3.25],
  ['maximum finite', Number.MAX_VALUE], ['minimum subnormal', Number.MIN_VALUE],
  ['already-rounded unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ['empty object', {}], ['null prototype', Object.assign(Object.create(null), { value: 2 })],
  ['empty array', []], ['sparse array', [, undefined, , null]],
  ['undefined own property', { present: undefined }],
  ['frozen/sealed data values', Object.freeze({ nested: Object.seal({ count: 1 }) })],
];
for (const [name, value] of supported) test('snapshot round trip: ' + name, () => roundTrip(value));

test('preserves aliases, distinct equal-shaped nodes, own __proto__, and key order', () => {
  const shared = { name: 'Ada' }; const object = { first: shared, alias: shared, distinct: { name: 'Ada' } };
  define(object, '__proto__', { safe: true }); define(object, 'constructor', 'data');
  define(object, 'z', undefined); define(object, '2', 'integer key'); define(object, '1', 'first');
  const restored = roundTrip(object);
  assert.equal(restored.first, restored.alias); assert.notEqual(restored.first, restored.distinct);
  assert.equal(Object.getPrototypeOf(restored), Object.prototype); assert.equal({}.safe, undefined);
  restored.first.name = 'Grace'; assert.equal(restored.alias.name, 'Grace'); assert.equal(shared.name, 'Ada');
});
test('preserves sparse length, aliases and custom enumerable array properties', () => {
  const row = Object.assign(Object.create(null), { label: 'one' });
  const rows = new Array(5); rows[1] = row; rows[3] = undefined;
  define(rows, 'named', row); define(rows, '__proto__', 'safe'); define(rows, '4294967295', 'not an index');
  const restored = roundTrip(rows); assert.equal(restored[1], restored.named);
  assert.ok(!(0 in restored) && 3 in restored && !(4 in restored)); assert.equal(restored.length, 5);
});
test('plain JSON loses distinctions that the codec retains', () => {
  const shared = {}; const value = { a: shared, b: shared, undefined: undefined, n: -0, rows: [, undefined] };
  const json = JSON.parse(JSON.stringify(value)); assert.notEqual(json.a, json.b);
  assert.ok(!Object.hasOwn(json, 'undefined')); assert.ok(!Object.is(json.n, -0)); assert.equal(json.rows[0], null);
  roundTrip(value);
});
test('encoding preserves observable property order rather than lexically sorting keys', () => {
  const first = { b: 1, a: 2 }; const second = { a: 2, b: 1 };
  assert.notEqual(encodeSnapshot(first), encodeSnapshot(second));
  assert.deepEqual(Object.keys(roundTrip(first)), ['b', 'a']);
});

const unsupported = [
  ['NaN', NaN], ['Infinity', Infinity], ['negative Infinity', -Infinity], ['BigInt', 1n],
  ['symbol value', Symbol('no')], ['function', () => 1], ['Promise', Promise.resolve(1)],
  ['Date', new Date(0)], ['Map', new Map()], ['Set', new Set()], ['RegExp', /x/],
  ['typed array', new Uint8Array([1])], ['ArrayBuffer', new ArrayBuffer(1)],
  ['class instance', new (class Data { value = 1; })()],
  ['Array subclass', new (class Rows extends Array {})()],
  ['custom object prototype', Object.create({ inherited: 1 })],
  ['symbol key', { [Symbol('key')]: 1 }],
  ['nonenumerable property', Object.defineProperty({}, 'hidden', { value: 1 })],
  ['thenable', { then() {} }], ['DOM-shaped object', { nodeType: 1 }],
];
for (const [name, value] of unsupported) test('snapshot rejects: ' + name, () => {
  assert.throws(() => encodeSnapshot(value)); assert.throws(() => encodeSnapshot({ nested: value }));
});
test('getters, setters and toJSON are never invoked', () => {
  let calls = 0;
  for (const value of [Object.defineProperty({}, 'getter', { enumerable: true, get() { calls++; return 1; } }),
    Object.defineProperty({}, 'setter', { enumerable: true, set() { calls++; } }),
    { toJSON() { calls++; return {}; } }]) assert.throws(() => encodeSnapshot(value));
  assert.equal(calls, 0);
});
test('rejects object and array cycles while allowing repeated DAG nodes', () => {
  const object = {}; object.self = object; const array = []; array.push(array);
  assert.throws(() => encodeSnapshot(object), /Cycles/); assert.throws(() => encodeSnapshot(array), /Cycles/);
  let graph = { value: 1 };
  for (let depth = 0; depth < 30; depth++) graph = { left: graph, right: graph };
  const text = encodeSnapshot(graph); assert.equal(JSON.parse(text).nodes.length, 31);
  assertGraphEqual(graph, decodeSnapshot(text)); // Oracle memoizes both directions too.
});
test('audit finding: legacy type validator revisits shared nodes once per path', () => {
  let reads = 0;
  const leaf = new Proxy({ value: 1 }, { get(target, key) { if (key === 'value') reads++; return target[key]; } });
  let graph = leaf;
  for (let level = 0; level < 8; level++) graph = { left: graph, right: graph };
  validateStateValue(graph); assert.equal(reads, 256);
  // Snapshot encoding instead visits nine graph nodes and reads data descriptors.
  const before = reads; assert.equal(JSON.parse(encodeSnapshot(graph)).nodes.length, 9); assert.equal(reads, before);
});

const envelope = (root = ['ref', 0], nodes = [{ kind: 'object', prototype: 'plain', entries: [] }]) =>
  ({ format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, root, nodes });
const malformed = [
  ['wrong format', { ...envelope(), format: 'other' }, /Incompatible/],
  ['wrong version', { ...envelope(), version: 2 }, /Incompatible/],
  ['extra field', { ...envelope(), extra: 1 }, /Malformed/],
  ['missing root', { format: SNAPSHOT_FORMAT, version: 1, nodes: [] }, /Malformed/],
  ['wrong node table', { ...envelope(), nodes: {} }, /node table/],
  ['unknown tag', envelope(['bigint', '2'], []), /token/],
  ['extra token field', envelope(['null', 0], []), /token/],
  ['wrong primitive type', envelope(['number', '2'], []), /token/],
  ['unknown reference', envelope(['ref', 9]), /token/],
  ['negative reference', envelope(['ref', -1]), /token/],
  ['fractional reference', envelope(['ref', .5]), /token/],
  ['unknown node kind', envelope(['ref', 0], [{ kind: 'date', value: 0 }]), /node kind/],
  ['invalid prototype', envelope(['ref', 0], [{ kind: 'object', prototype: 'custom', entries: [] }]), /prototype/],
  ['duplicate property', envelope(['ref', 0], [{ kind: 'object', prototype: 'plain', entries: [['a', ['null']], ['a', ['null']]] }]), /Duplicate/],
  ['bad property key', envelope(['ref', 0], [{ kind: 'object', prototype: 'plain', entries: [[2, ['null']]] }]), /property entry/],
  ['bad property list', envelope(['ref', 0], [{ kind: 'object', prototype: 'plain', entries: {} }]), /property entries/],
  ['cycle', envelope(['ref', 0], [{ kind: 'object', prototype: 'plain', entries: [['self', ['ref', 0]]] }]), /Cycles/],
  ['unreachable node', envelope(['null']), /Unreachable/],
  ['negative array length', envelope(['ref', 0], [{ kind: 'array', length: -1, entries: [] }]), /array length/],
  ['index beyond length', envelope(['ref', 0], [{ kind: 'array', length: 1, entries: [['1', ['null']]] }]), /array property/],
  ['array length property', envelope(['ref', 0], [{ kind: 'array', length: 1, entries: [['length', ['number', 1]]] }]), /array property/],
  ['noncanonical integer-key order', envelope(['ref', 0], [{ kind: 'object', prototype: 'plain', entries: [['2', ['null']], ['1', ['null']]] }]), /Noncanonical/],
  ['imported DOM-shaped object', envelope(['ref', 0], [{ kind: 'object', prototype: 'plain', entries: [['nodeType', ['number', 1]]] }]), /DOM-shaped/],
];
for (const [name, value, pattern] of malformed) test('snapshot import rejects: ' + name, () => assert.throws(() => decodeSnapshot(JSON.stringify(value)), pattern));
test('rejects malformed JSON, duplicate envelope keys, pretty printing and nonfinite/negative-zero number tokens', () => {
  assert.throws(() => decodeSnapshot('{'), /JSON/); assert.throws(() => decodeSnapshot({}), /string/);
  const text = encodeSnapshot({ a: 1 });
  assert.throws(() => decodeSnapshot(JSON.stringify(JSON.parse(text), null, 2)), /Noncanonical/);
  assert.throws(() => decodeSnapshot(text.replace('"version":1', '"version":0,"version":1')), /Noncanonical/);
  assert.throws(() => decodeSnapshot(encodeSnapshot(1).replace('["number",1]', '["number",1e999]')), /token/);
  assert.throws(() => decodeSnapshot(encodeSnapshot(0).replace('["number",0]', '["number",-0]')), /token/);
});

test('encoding/import enforce byte, node, property, depth and sparse-slot limits', () => {
  const text = encodeSnapshot({ name: 'العربية' }); const bytes = new TextEncoder().encode(text).length;
  assert.equal(encodeSnapshot({ name: 'العربية' }, { maxBytes: bytes }), text);
  assertGraphEqual({ name: 'العربية' }, decodeSnapshot(text, { maxBytes: bytes }));
  assert.throws(() => encodeSnapshot({ name: 'العربية' }, { maxBytes: bytes - 1 }), /maxBytes/);
  assert.throws(() => decodeSnapshot(text, { maxBytes: bytes - 1 }), /maxBytes/);
  for (const [value, limits, pattern] of [
    [{ a: {} }, { maxNodes: 1 }, /maxNodes/], [{ a: 1, b: 2 }, { maxEntries: 1 }, /maxEntries/],
    [{ a: {} }, { maxDepth: 1 }, /maxDepth/], [new Array(4), { maxArrayLength: 3 }, /maxArrayLength/],
    [[new Array(3), new Array(3)], { maxArraySlots: 7 }, /maxArraySlots/],
  ]) {
    assert.throws(() => encodeSnapshot(value, limits), pattern);
    assert.throws(() => decodeSnapshot(encodeSnapshot(value), limits), pattern);
  }
  assert.throws(() => encodeSnapshot(['x'.repeat(80), 'x'.repeat(80)], { maxBytes: 150 }), /maxBytes/);
});
test('shared node revisited at a deeper path cannot bypass maxDepth', () => {
  const shared = { leaf: {} }; const value = { shallow: shared, deeper: { next: shared } };
  assert.throws(() => encodeSnapshot(value, { maxDepth: 3 }), /maxDepth/);
  assert.throws(() => decodeSnapshot(encodeSnapshot(value), { maxDepth: 3 }), /maxDepth/);
});
test('invalid or accessor limits fail without invoking getters', () => {
  let calls = 0;
  for (const limits of [null, [], { other: 1 }, { maxNodes: -1 }, { maxDepth: 0 }, { maxDepth: 257 },
    { maxBytes: 1.5 }, { maxEntries: NaN }, Object.defineProperty({}, 'maxBytes', { get() { calls++; return 1; } })]) {
    assert.throws(() => encodeSnapshot(null, limits)); assert.throws(() => decodeSnapshot(encodeSnapshot(null), limits));
  }
  assert.equal(calls, 0);
});
test('seeded graphs preserve arbitrary alias topology and array/property distinctions', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let randomState = seed;
    const random = n => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState % n; };
    const pool = [{ value: undefined }, Object.assign(Object.create(null), { value: -0 })];
    for (let step = 0; step < 30; step++) {
      const value = random(2) ? { a: pool[random(pool.length)], b: pool[random(pool.length)] } : new Array(4);
      if (Array.isArray(value)) { value[random(4)] = pool[random(pool.length)]; define(value, 'label', seed + ':' + step); }
      pool.push(value);
    }
    roundTrip(pool);
  }
});
