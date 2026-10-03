import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createTransactionStore } from '../src/runtime/state/transactions.js';
const hasCode = (...codes) => error => codes.includes(error.code);
const TransactionActiveError = hasCode('TRANSACTION_ACTIVE');
const TransactionCompletedError = hasCode('TRANSACTION_COMPLETED');
const DraftRevokedError = error => error instanceof TypeError && /revoked/.test(error.message);
const UnsupportedTypeError = hasCode('STATE_INVALID', 'TRANSACTION_ASYNC');
const CircularReferenceError = hasCode('STATE_CYCLE');

import { assertGraphMatches } from '../spikes/transactions/comparison-fixtures.js';
import { encodeSnapshot } from '../spikes/action-schema/snapshot.js';

const factories = [createTransactionStore];
const unsupported = () => [NaN, Infinity, -Infinity, 1n, Symbol('value'), () => {},
  new Date(0), new Map(), new Set(), /x/, new Uint8Array(1), new ArrayBuffer(1),
  Promise.resolve(1), { then() {} }, { nodeType: 1 }, new (class Data {})(),
  new (class Rows extends Array {})(1, 2), Object.setPrototypeOf([], null),
  Object.create({ inherited: 1 }), { [Symbol('key')]: 1 },
  Object.defineProperty({}, 'hidden', { value: 1 }),
  vm.runInNewContext('({ value: 1 })'), vm.runInNewContext('[1, 2]')];

for (const factory of factories) {
  test(factory.name + ': rejected type matrix at initialization and nested assignment', () => {
    for (const value of unsupported()) {
      assert.throws(() => factory({ nested: value }), UnsupportedTypeError);
      const engine = factory({ count: 0, nested: null });
      const before = engine.getState(); const version = engine.getVersion(); let leaked;
      assert.throws(() => engine.run(draft => {
        leaked = draft; draft.count = 1; draft.nested = { value };
      }), UnsupportedTypeError);
      assert.equal(engine.getState(), before); assert.equal(engine.getVersion(), version);
      assert.equal(engine.hasActiveTransaction(), false);
      assert.throws(() => leaked.count, DraftRevokedError);
      engine.run(draft => { draft.count = 2; });
      assert.equal(engine.getState().count, 2);
    }
  });

  test(factory.name + ': original unsupported prototypes/accessors never execute getters', () => {
    let calls = 0;
    const inherited = { get then() { calls++; }, get nodeType() { calls++; },
      get constructor() { calls++; } };
    for (const value of [Object.create(inherited),
      Object.setPrototypeOf([], inherited),
      ...['value', 'then', 'nodeType'].map(key => Object.defineProperty({}, key,
        { enumerable: true, get() { calls++; return 1; } })),
      Object.defineProperty({}, 'value', { enumerable: true, set() { calls++; } }),
      { toJSON() { calls++; return {}; } }]) {
      assert.throws(() => factory({ value }), UnsupportedTypeError);
      const engine = factory({ value: null });
      assert.throws(() => engine.run(draft => { draft.value = value; }), UnsupportedTypeError);
    }
    assert.equal(calls, 0);
  });

  test(factory.name + ': adopted values preserve native graph meaning through imports', () => {
    const shared = Object.assign(Object.create(null), { count: 1, missing: undefined, n: -0 });
    const rows = new Array(4); rows[1] = shared; rows[3] = undefined; rows.named = shared;
    Object.defineProperty(rows, '__proto__', { value: 'data', enumerable: true });
    const value = Object.freeze({ shared, alias: shared, distinct: { count: 1 }, rows,
      nodeType: undefined, then: 'data', scalars: [null, false, '', Number.MAX_VALUE, Number.MIN_VALUE],
      foreignNull: vm.runInNewContext('Object.assign(Object.create(null), { value: 2 })') });
    const initial = factory({ value }); assertGraphMatches(initial.getState(), { value });
    const engine = factory({ value: null });
    engine.run(draft => { draft.value = value; });
    assertGraphMatches(engine.getState(), { value });
    assert.equal(encodeSnapshot(engine.getState()), encodeSnapshot({ value }));
    assert.equal(engine.getState().value.shared, engine.getState().value.rows.named);
    engine.run(draft => { draft.value.rows.reverse(); draft.value.shared.count = 2; });
    assert.equal(engine.getState().value.rows[2], engine.getState().value.shared);
    assert.equal(shared.count, 1); // The caller and old frozen root are not mutated.
    assert.throws(() => { engine.getState().value.shared.count = 3; }, TypeError);
  });

  test(factory.name + ': large shared DAG imports/commits without alias expansion', () => {
    let graph = { count: 0 };
    for (let level = 0; level < 30; level++) graph = { left: graph, right: graph };
    const engine = factory({ graph: null });
    engine.run(draft => { draft.graph = graph; });
    engine.run(draft => {
      let node = draft.graph;
      for (let level = 0; level < 30; level++) { assert.equal(node.left, node.right); node = node.left; }
      node.count = 1;
    });
    let node = engine.getState().graph;
    for (let level = 0; level < 30; level++) { assert.equal(node.left, node.right); node = node.left; }
    assert.equal(node.count, 1); assert.equal(JSON.parse(encodeSnapshot(engine.getState())).nodes.length, 32);
  });

  test(factory.name + ': memoization does not hide cycles after a completed sibling', () => {
    const shared = { count: 0 }; const cyclic = { shared }; cyclic.self = cyclic;
    assert.throws(() => factory({ first: shared, second: cyclic }), CircularReferenceError);
    const engine = factory({ first: shared, second: shared }); const before = engine.getState();
    assert.throws(() => engine.run(draft => { draft.first.count = 1; draft.second.back = draft; }), CircularReferenceError);
    assert.equal(engine.getState(), before); assert.equal(engine.getVersion(), 1);
  });
}
