import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionStore } from '../src/runtime/state/transactions.js';
import { inspectGraph, STATE_LIMITS } from '../src/runtime/state/data.js';
import * as publicApi from 'mini-framework';

const code = expected => error => error.code === expected;
const revoked = error => error instanceof TypeError && /revoked/.test(error.message);
function unchangedOnFailure(store, body, expected) {
  const before = store.getState(), version = store.getVersion(); let held;
  assert.throws(() => store.run(draft => { held = draft; body(draft); }), expected);
  assert.equal(store.getState(), before); assert.equal(store.getVersion(), version);
  assert.equal(store.hasActiveTransaction(), false); assert.throws(() => held.x, revoked);
  store.run(draft => { draft.recovered = true; });
  assert.equal(store.getState().recovered, true);
  store.dispose();
}
test('untouched branches share physical references; changed nodes retain IDs across snapshots', () => {
  const store = createTransactionStore({ a: { child: { count: 0 } }, b: { count: 0 }, rows: [{ x: 1 }, { x: 2 }] });
  const before = store.getState(); const rootId = store.getObjectId(before), childId = store.getObjectId(before.a.child);
  const first = store.run(draft => { draft.a.child.count++; });
  assert.notEqual(first.state, before); assert.notEqual(first.state.a, before.a);
  assert.equal(first.state.b, before.b); assert.equal(first.state.rows, before.rows);
  assert.equal(store.getObjectId(first.state), rootId); assert.equal(store.getObjectId(first.state.a.child), childId);
  const second = store.run(draft => { draft.rows[1].x++; });
  assert.equal(second.state.a, first.state.a); assert.equal(second.state.rows[0], before.rows[0]);
  assert.equal(before.a.child.count, 0); assert.equal(first.state.rows[1].x, 2);
  assert.ok(Object.isFrozen(second.state.rows[1])); store.dispose();
});
test('successful no-op commits advance once, share the root and emit no data invalidation', () => {
  const store = createTransactionStore({ x: 0 }); const before = store.getState();
  for (const body of [() => {}, draft => { draft.x = 0; }, draft => { draft.x++; draft.x--; }]) {
    const version = store.getVersion(); const result = store.run(body);
    assert.equal(result.version, version + 1); assert.equal(result.state, before);
    assert.equal(result.isNoop, true); assert.deepEqual(result.affectedProperties, []);
    assert.ok(Object.isFrozen(result));
  }
  store.dispose();
});
test('initial nodes and copies belong only to their own store; foreign snapshots import with new identity', () => {
  const caller = { x: { n: 0 } }; const a = createTransactionStore(caller), b = createTransactionStore(caller);
  assert.throws(() => a.getObjectId(caller.x), code('STATE_ID_INVALID'));
  assert.throws(() => a.getObjectId(b.getState().x), code('STATE_ID_INVALID'));
  a.run(draft => { draft.y = b.getState().x; });
  assert.notEqual(a.getState().y, b.getState().x); assert.notEqual(a.getObjectId(a.getState().y), a.getObjectId(a.getState().x));
  a.dispose(); b.dispose();
});
test('historical changed snapshots import as distinct nodes instead of colliding logical IDs', () => {
  const store = createTransactionStore({ a: { n: 0 }, old: null }); const old = store.getState().a;
  store.run(draft => { draft.a.n = 1; }); const id = store.getObjectId(store.getState().a);
  store.run(draft => { draft.old = old; draft.old.n = 9; });
  assert.equal(store.getState().a.n, 1); assert.equal(store.getState().old.n, 9); assert.equal(old.n, 0);
  assert.notEqual(store.getObjectId(store.getState().old), id); store.dispose();
});
test('external wrappers containing current drafts/snapshots preserve aliases without leaking raw state', () => {
  const store = createTransactionStore({ a: { n: 0 }, wrapper: null }); const snapshot = store.getState();
  const wrapper = { current: snapshot.a, draft: null }; let held;
  store.run(draft => {
    held = draft.a; wrapper.draft = held; draft.wrapper = wrapper;
    assert.equal(draft.wrapper.current, draft.a); assert.equal(draft.wrapper.draft, draft.a);
    draft.wrapper.current.n = 2;
  });
  assert.equal(store.getState().wrapper.current, store.getState().a);
  assert.equal(store.getState().wrapper.draft, store.getState().a); assert.equal(snapshot.a.n, 0);
  assert.throws(() => held.n, revoked); assert.ok(!Object.isFrozen(wrapper)); store.dispose();
});
test('foreign and stale drafts reject direct and nested imports without invoking their bodies', () => {
  const a = createTransactionStore({ n: 0 }), b = createTransactionStore({ n: 0 });
  const foreign = b.begin(); let stale;
  a.run(draft => {
    for (const value of [foreign.draft, { child: foreign.draft }])
      assert.throws(() => { draft.foreign = value; }, code('STATE_INVALID'));
    stale = draft;
  });
  foreign.abort();
  a.run(draft => {
    assert.throws(() => { draft.old = stale; }, code('STATE_INVALID'));
    assert.throws(() => { draft.old = { child: stale }; }, code('STATE_INVALID'));
    draft.n = 1;
  });
  assert.equal(a.getState().n, 1); a.dispose(); b.dispose();
});
test('native revocation rejects reads, writes, reflection, arrays and held iterators after every finish path', () => {
  for (const mode of ['commit', 'abort', 'cycle', 'dispose']) {
    const store = createTransactionStore({ rows: [{ x: 1 }] }); const tx = store.begin();
    const root = tx.draft, rows = root.rows, item = rows[0], iterator = rows.values();
    if (mode === 'cycle') { root.self = root; assert.throws(() => tx.commit(), code('STATE_CYCLE')); }
    else if (mode === 'dispose') store.dispose();
    else tx[mode]();
    assert.equal(tx.isActive, false);
    for (const read of [() => root.rows, () => { item.x = 2; }, () => 'x' in item,
      () => Reflect.ownKeys(item), () => Object.getOwnPropertyDescriptor(item, 'x'),
      () => Object.getPrototypeOf(item), () => Object.isExtensible(item), () => Array.isArray(rows),
      () => iterator.next()]) assert.throws(read, revoked);
    assert.throws(() => tx.commit(), code('TRANSACTION_COMPLETED'));
    assert.throws(() => tx.abort(), code('TRANSACTION_COMPLETED')); store.dispose();
  }
});
test('commit metadata is immutable and prototype-named properties do not change real prototypes', () => {
  const store = createTransactionStore({ toString: 'own', constructor: undefined });
  const before = store.getState(); const result = store.run(draft => {
    draft.__proto__ = { safe: true }; delete draft.toString; draft.constructor = 'data';
  });
  assert.equal(Object.getPrototypeOf(result.state), Object.prototype);
  assert.ok(Object.hasOwn(result.state, '__proto__')); assert.equal(result.state.__proto__.safe, true);
  assert.equal(Object.getPrototypeOf(before), Object.prototype);
  assert.throws(() => { result.changes[0].path.push('bad'); }, TypeError);
  assert.throws(() => { result.affectedProperties[0].key = 'bad'; }, TypeError); store.dispose();
});
test('negative zero differs from positive zero and sparse holes differ from explicit undefined', () => {
  const store = createTransactionStore({ n: -0, rows: new Array(2) }); const rowId = store.getObjectId(store.getState().rows);
  const result = store.run(draft => { draft.n = 0; draft.rows[1] = undefined; });
  assert.ok(!Object.is(result.state.n, -0)); assert.ok(Object.hasOwn(result.state.rows, '1'));
  assert.ok(!result.affectedProperties.some(x => x.targetId === rowId && x.kind === 'value'));
  assert.ok(result.affectedProperties.some(x => x.targetId === rowId && x.kind === 'has')); store.dispose();
});
test('assignment validators memoize a shared DAG and never invoke ordinary value getters', () => {
  let reads = 0, descriptors = 0;
  const instrument = value => new Proxy(value, {
    get(target, key) { reads++; return Reflect.get(target, key); },
    getOwnPropertyDescriptor(target, key) { descriptors++; return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  let graph = instrument({ n: 0 });
  for (let i = 0; i < 30; i++) graph = instrument({ left: graph, right: graph });
  const store = createTransactionStore({ graph: null });
  store.run(draft => { draft.graph = graph; draft.other = graph; });
  assert.equal(reads, 0); assert.equal(descriptors, 61);
  assert.equal(store.getState().graph, store.getState().other); store.dispose();
});
test('validation memos are local; completed sibling aliases do not hide later cycles or depth', () => {
  const value = { n: 0 }; inspectGraph(value); value.n = Infinity;
  assert.throws(() => inspectGraph(value), code('STATE_INVALID'));
  let deep = { n: 0 }; for (let i = 0; i < 99; i++) deep = { child: deep };
  let longer = deep; for (let i = 0; i < 30; i++) longer = { child: longer };
  assert.throws(() => inspectGraph({ shallow: deep, deeper: longer }), code('STATE_LIMIT'));
  const shared = {}; const cycle = { shared }; cycle.self = cycle;
  assert.throws(() => inspectGraph({ first: shared, second: cycle }), code('STATE_CYCLE'));
});
test('depth growth through existing drafts is validated before materialization and publication', () => {
  let root = {}; for (let i = 0; i < 127; i++) root = { child: root };
  const store = createTransactionStore(root);
  unchangedOnFailure(store, draft => {
    let node = draft; for (let i = 0; i < 127; i++) node = node.child;
    node.extra = {};
  }, code('STATE_LIMIT'));
});
test('deeper alias grafts cannot evade the completed-height depth check', () => {
  let shared = {}; for (let i = 0; i < 99; i++) shared = { child: shared };
  const store = createTransactionStore({ shared });
  unchangedOnFailure(store, draft => {
    let nested = draft.shared;
    for (let i = 0; i < 30; i++) nested = { child: nested };
    draft.deep = nested;
  }, code('STATE_LIMIT'));
});
test('array length/index growth rejects before expanding the draft; caught errors permit safe recovery', () => {
  const store = createTransactionStore({ rows: [] });
  store.run(draft => {
    for (const body of [() => { draft.rows.length = 100_001; }, () => { draft.rows[100_000] = 1; },
      () => { draft.rows[4294967294] = 1; }]) {
      assert.throws(body, code('STATE_LIMIT')); assert.equal(draft.rows.length, 0);
      assert.deepEqual(Object.keys(draft.rows), []);
    }
    draft.rows.push(1);
  });
  assert.deepEqual(store.getState().rows, [1]); store.dispose();
});
test('aggregate sparse slots include imported and detached transaction nodes', () => {
  const store = createTransactionStore({ rows: new Array(60_000) });
  unchangedOnFailure(store, draft => {
    draft.rows = []; draft.extra = new Array(40_001);
  }, code('STATE_LIMIT'));
});
test('transaction growth budgets are monotonic across length churn and discarded imports', () => {
  const store = createTransactionStore({ rows: [] });
  unchangedOnFailure(store, draft => {
    draft.rows.length = 60_000; draft.rows.length = 0; draft.rows.length = 40_001;
  }, code('STATE_LIMIT'));
  const nodes = createTransactionStore({ value: null });
  unchangedOnFailure(nodes, draft => {
    for (let i = 0; i < STATE_LIMITS.nodes; i++) draft.value = {};
  }, code('STATE_LIMIT'));
});
test('aggregate property and text growth budgets reject writes and preserve prior snapshots', () => {
  unchangedOnFailure(createTransactionStore({}), draft => {
    for (let i = 0; i <= STATE_LIMITS.entries; i++) draft['k' + i] = i;
  }, code('STATE_LIMIT'));
  unchangedOnFailure(createTransactionStore({ text: '' }), draft => {
    draft.text = 'a'.repeat(600_000); draft.text = 'b'.repeat(400_001);
  }, code('STATE_LIMIT'));
  unchangedOnFailure(createTransactionStore({}), draft => {
    draft['k'.repeat(1_000_001)] = 1;
  }, code('STATE_LIMIT'));
});
test('an oversized import fails before mutation and does not freeze or modify caller data', () => {
  const store = createTransactionStore({ value: null }); const external = new Array(100_001);
  store.run(draft => {
    assert.throws(() => { draft.value = external; }, code('STATE_LIMIT'));
    assert.equal(draft.value, null); draft.value = { n: 1 };
  });
  assert.ok(!Object.isFrozen(external)); assert.equal(external.length, 100_001); store.dispose();
});
test('async/thenable rejection rolls back and observes illegal native Promise rejection', async () => {
  const store = createTransactionStore({ x: 0 }); let held;
  assert.throws(() => store.run(async draft => { held = draft; draft.x = 9; await 0; draft.x = 10; }), code('TRANSACTION_ASYNC'));
  assert.equal(store.getState().x, 0); assert.equal(store.getVersion(), 1);
  assert.throws(() => held.x, revoked);
  let calls = 0;
  assert.throws(() => store.run(draft => { draft.x = 1; return { then() { calls++; } }; }), code('TRANSACTION_ASYNC'));
  assert.equal(calls, 0);
  assert.throws(() => store.run(() => Promise.reject(Error('illegal async'))), code('TRANSACTION_ASYNC'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.getVersion(), 1); store.dispose();
});
test('dispose aborts active work, revokes drafts, releases state and makes the store terminal', () => {
  const store = createTransactionStore({ x: 0 }); const tx = store.begin(); tx.draft.x = 1;
  store.dispose(); store.dispose(); assert.equal(tx.isAborted, true);
  for (const method of [store.getState, store.getVersion, store.begin, store.hasActiveTransaction])
    assert.throws(method, code('STORE_DISPOSED'));
  assert.throws(() => tx.draft.x, revoked);
});
test('internal transactions are not a public mutation escape hatch', () => {
  assert.equal(publicApi.createTransactionStore, undefined);
  const app = publicApi.createApp({ initialState: { n: 0 } });
  assert.equal(app.begin, undefined); assert.equal(app.run, undefined); assert.equal(app.store, undefined);
  app.dispose();
});
test('native array copy/fill/unshift/pop and derived arrays preserve owned alias semantics', () => {
  const store = createTransactionStore({ rows: [{ n: 0 }, { n: 1 }, { n: 2 }], derived: null });
  const before = store.getState();
  store.run(draft => {
    draft.rows.copyWithin(1, 0, 1);
    assert.equal(draft.rows[0], draft.rows[1]);
    draft.rows.unshift({ n: 9 }); const removed = draft.rows.pop();
    assert.equal(removed.n, 2);
    draft.rows.fill(draft.rows[1], 2);
    draft.derived = [...draft.rows.slice(1)];
    draft.derived[0].n = 7;
    assert.equal(draft.rows[1].n, 7);
  });
  const after = store.getState();
  assert.deepEqual(after.rows.map(row => row.n), [9, 7, 7]);
  assert.equal(after.derived[0], after.rows[1]); assert.equal(after.derived[0], after.derived[1]);
  assert.equal(before.rows[0].n, 0); store.dispose();
});
test('invalid native array lengths and throwing comparators never publish partial array work', () => {
  const store = createTransactionStore({ rows: [3, 2, 1] }); const before = store.getState();
  for (const length of [-1, 1.5, 4294967296]) {
    assert.throws(() => store.run(draft => { draft.rows.length = length; }), RangeError);
    assert.equal(store.getState(), before); assert.equal(store.getVersion(), 1);
  }
  const failure = Error('sort failed');
  assert.throws(() => store.run(draft => { draft.rows[0] = 4; draft.rows.sort(() => { throw failure; }); }), error => error === failure);
  assert.equal(store.getState(), before); assert.equal(store.getVersion(), 1);
  store.run(draft => { draft.rows.length = '2'; });
  assert.deepEqual(store.getState().rows, [3, 2]); store.dispose();
});
