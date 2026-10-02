import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionSchema, createActionSpike, decodeSnapshot } from './index.js';
import { createReferenceEngine } from '../transactions/reference-evaluator.js';
import { createCowEngine } from '../transactions/cow-engine.js';
import { createStagedEngine } from '../transactions/staged-engine.js';
import { exerciseJavaScript } from './types/javascript.js';

const number = value => typeof value === 'number';
const named = value => value && typeof value === 'object' && typeof value.name === 'string';
const buildSchema = () => createActionSchema({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  amount: action(number, (draft, payload) => { draft.count += payload; }),
  rename: action(named, (draft, payload) => { draft.name = payload.name; }),
  fail: action(draft => { draft.count++; throw new Error('rollback'); }),
      promise: action(draft => { draft.count++; return Promise.reject(new Error('invalid async rejection')); }),
  thenable: action(draft => { draft.count++; return { then() { throw new Error('should not execute'); } }; }),
}));

for (const engineFactory of [createReferenceEngine, createCowEngine, createStagedEngine]) {
  const mount = config => createActionSpike({ initialState: { count: 0, name: 'Ada' }, schema: buildSchema(), engineFactory, ...config });
  test(engineFactory.name + ': names, wrappers and payload validators work in plain JS', () => {
    const app = mount(); app.actions.increment(); app.dispatch('amount', 4); app.actions.rename({ name: 'Grace' });
    assert.equal(app.state.count, 5); assert.equal(app.state.name, 'Grace'); assert.equal(app.version, 4);
    assert.equal(app.schemaVersion, 'counter/1'); assert.ok(Object.isFrozen(app.state)); assert.ok(Object.isFrozen(app.actions));
    assert.throws(() => { app.state.count = 9; }, TypeError); assert.throws(() => { app.actions.increment = () => {}; }, TypeError);
  });
  test(engineFactory.name + ': invalid name/arity/shape/serializability publish no version', () => {
    const app = mount(); const state = app.state; const version = app.version;
    for (const args of [['missing'], ['amount'], ['amount', 1, 2], ['increment', undefined], ['amount', 'wrong'],
      ['rename', {}], ['amount', NaN], ['amount', Infinity], ['rename', { name: 'Ada', callback() {} }],
      ['rename', new Date(0)], ['rename', Promise.resolve({ name: 'Ada' })], ['rename', { name: 'Ada', nodeType: 1 }]]) {
      assert.throws(() => app.dispatch(...args)); assert.equal(app.state, state); assert.equal(app.version, version);
    }
    let coerced = false;
    assert.throws(() => app.dispatch({ toString() { coerced = true; return 'increment'; } }), /string/);
    assert.equal(coerced, false); app.actions.increment(); assert.equal(app.state.count, 1);
  });
  test(engineFactory.name + ': throw/Promise/thenable rollback and recovery', () => {
    const app = mount(); const before = app.state;
    for (const name of ['fail', 'promise', 'thenable']) {
      assert.throws(() => app.dispatch(name)); assert.equal(app.state, before); assert.equal(app.version, 1);
    }
    app.actions.increment(); assert.equal(app.version, 2);
  });
  test(engineFactory.name + ': unsupported assigned state rolls back and leaked drafts revoke', async () => {
    let held;
    let asynchronous;
    const schema = createActionSchema()(({ action }) => ({
      assign: action(() => true, (draft, payload) => { held = draft; draft.name = payload; draft.invalid = () => {}; }),
      nonfinite: action(draft => { draft.count = NaN; }),
      erasedAsync: action(draft => {
        held = draft;
        asynchronous = (async () => { draft.count++; await Promise.resolve(); draft.count++; })();
        return asynchronous;
      }),
    }));
    const app = mount({ schema }); const initial = app.state;
    assert.throws(() => app.actions.assign('Grace')); assert.throws(() => { held.count++; }, /draft/i);
    assert.throws(() => app.actions.nonfinite());
    assert.throws(() => app.actions.erasedAsync(), /synchronous/);
    await assert.rejects(asynchronous, /draft/i);
    assert.equal(app.state, initial); assert.equal(app.version, 1);
  });
  test(engineFactory.name + ': invalid graph/accessor payload fails before guard/action runs', () => {
    let calls = 0;
    const schema = createActionSchema()(({ action }) => ({
      accept: action(() => { calls++; return true; }, () => { calls++; }),
    }));
    const app = mount({ schema }); const cycle = {}; cycle.self = cycle;
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { calls++; return 'bad'; } });
    for (const payload of [cycle, accessor, 1n, { [Symbol('key')]: 1 }, new Uint8Array(2)]) assert.throws(() => app.actions.accept(payload));
    assert.equal(calls, 0); assert.equal(app.version, 1);
  });
  test(engineFactory.name + ': payload ownership, deep freeze, aliases and explicit undefined', () => {
    let captured;
    const schema = createActionSchema()(({ action }) => ({
      import: action(value => value && typeof value === 'object', (draft, payload) => {
        captured = payload; draft.a = payload.a; draft.b = payload.b; draft.a.value++;
      }),
      optional: action(value => value === undefined, draft => { draft.count++; }),
    }));
    const app = mount({ schema }); const shared = { value: 1 }; const payload = { a: shared, b: shared };
    app.actions.import(payload);
    assert.notEqual(captured, payload); assert.equal(captured.a, captured.b); assert.ok(Object.isFrozen(captured.a));
    assert.ok(!Object.isFrozen(payload) && !Object.isFrozen(shared)); assert.equal(shared.value, 1);
    assert.equal(app.state.a, app.state.b); assert.equal(app.state.a.value, 2); assert.equal(captured.a.value, 1);
    assert.throws(() => app.actions.optional(), /arity/); app.actions.optional(undefined); assert.equal(app.state.count, 1);
  });
  test(engineFactory.name + ': payload mutation and throwing/async validators reject before action', () => {
    let calls = 0;
    const schema = createActionSchema()(({ action }) => ({
      mutate: action(value => typeof value === 'object', (draft, payload) => { draft.count++; payload.nested.value++; }),
      invalid: action(() => { throw new Error('guard failed'); }, () => { calls++; }),
      truthy: action(() => 1, () => { calls++; }),
      asynchronous: action(() => Promise.reject(new Error('invalid async validator')), () => { calls++; }),
    }));
    const app = mount({ schema }); const initial = app.state;
    assert.throws(() => app.actions.mutate({ nested: { value: 1 } }), TypeError);
    for (const name of ['invalid', 'truthy', 'asynchronous']) assert.throws(() => app.dispatch(name, 1));
    assert.equal(calls, 0); assert.equal(app.state, initial); assert.equal(app.version, 1);
  });
  test(engineFactory.name + ': snapshot restore preserves aliases/reorders, not runtime versions', () => {
    const shared = { value: -0 }; const initialState = { count: 0, a: shared, b: shared, rows: [, shared, undefined] };
    const schema = createActionSchema()(({ action }) => ({
      update: action(draft => { draft.rows.reverse(); draft.a.value = 3; draft.count++; }),
    }));
    const app = mount({ schema, initialState }); app.actions.update();
    const restored = mount({ schema, initialState: decodeSnapshot(app.snapshot()) });
    assert.equal(restored.state.a, restored.state.b); assert.equal(restored.state.rows[1], restored.state.a);
    assert.ok(0 in restored.state.rows && !(2 in restored.state.rows));
    assert.equal(restored.snapshot(), app.snapshot()); assert.equal(restored.version, 1);
    app.actions.update(); restored.actions.update(); assert.equal(restored.snapshot(), app.snapshot());
    assert.ok(!Object.isFrozen(initialState) && Object.is(shared.value, -0));
  });
  test(engineFactory.name + ': explicit mode handles default/rest callbacks without function.length', () => {
    const schema = createActionSchema()(({ action }) => ({
      amount: action(number, (draft = {}, value = 2) => { draft.count += value; }),
      rest: action(number, (draft, ...args) => { draft.count += args[0]; }),
      none: action((...args) => { assert.equal(args.length, 1); args[0].count++; }),
    }));
    const app = mount({ schema }); app.actions.amount(3); app.actions.rest(4); app.actions.none(); assert.equal(app.state.count, 8);
    assert.throws(() => app.actions.amount(), /arity/);
  });
  test(engineFactory.name + ': nested dispatch explicitly remains outside this spike', () => {
    let app;
    const schema = createActionSchema()(({ action }) => ({
      parent: action(draft => { draft.count++; app.actions.child(); }), child: action(draft => { draft.count += 10; }),
    }));
    app = mount({ schema }); assert.throws(() => app.actions.parent(), /Phase A.3/); assert.equal(app.state.count, 0);
    app.actions.child(); assert.equal(app.state.count, 10);
  });
  test(engineFactory.name + ': inherited no-op version policy is not silently changed', () => {
    const schema = createActionSchema()(({ action }) => ({ noop: action(() => {}) })); const app = mount({ schema });
    const result = app.actions.noop(); assert.equal(result.isNoop, true); assert.equal(app.version, 1);
  });
}

test('prototype-colliding names stay own actions rather than prototype lookups', () => {
  const schema = createActionSchema()(({ action }) => ({
    ['__proto__']: action(draft => { draft.count++; }), constructor: action(draft => { draft.count++; }),
  }));
  const app = createActionSpike({ schema, initialState: { count: 0 } });
  app.actions.__proto__(); app.dispatch('constructor'); assert.equal(app.state.count, 2);
  assert.equal(Object.getPrototypeOf(app.actions), null); assert.throws(() => app.dispatch('toString'), /Unknown/);
});
test('schemas/specs cannot be forged, expose getters or use invalid builder arguments', () => {
  assert.throws(() => createActionSchema({ version: '' }));
  assert.throws(() => createActionSchema({ version: 1 }));
  assert.throws(() => createActionSchema()({}));
  for (const build of [() => [], () => new Date(0), () => null, () => ({ x: {} }),
    ({ action }) => ({ x: action(null, () => {}) }), ({ action }) => ({ x: action(1) }),
    ({ action }) => ({ x: action(() => {}, () => {}, () => {}) }),
    ({ action }) => ({ [Symbol('x')]: action(() => {}) })]) assert.throws(() => createActionSchema()(build));
  let getter = 0;
  assert.throws(() => createActionSchema()(() => Object.defineProperty({}, 'x', { enumerable: true, get() { getter++; return {}; } })));
  assert.equal(getter, 0); assert.throws(() => createActionSpike({ initialState: {}, schema: { version: 'fake', names: [] } }));
});
test('state initialization validates and copies without freezing the caller', () => {
  const schema = createActionSchema()(() => ({})); const initialState = { nested: { value: 1 } };
  const app = createActionSpike({ schema, initialState }); initialState.nested.value = 2;
  assert.equal(app.state.nested.value, 1); assert.ok(!Object.isFrozen(initialState));
  for (const initialState of [1, null, { value: new Date(0) }, { value: Infinity }]) assert.throws(() => createActionSpike({ schema, initialState }));
});
test('checked JavaScript fixture runs without TypeScript compilation', () => {
  const app = exerciseJavaScript(); assert.deepEqual(app.state, { count: 1, name: 'Grace' }); assert.equal(app.version, 3);
});
test('audit finding: legacy engine assignment normalizes Array subclasses, unlike codec boundary', () => {
  class Rows extends Array {}
  const schema = createActionSchema()(({ action }) => ({ replace: action(draft => { draft.rows = new Rows(1, 2); }) }));
  for (const engineFactory of [createReferenceEngine, createCowEngine, createStagedEngine]) {
    assert.throws(() => createActionSpike({ schema, engineFactory, initialState: { rows: new Rows() } }), /ordinary arrays/);
    const app = createActionSpike({ schema, engineFactory, initialState: { rows: [] } }); app.actions.replace();
    assert.equal(Object.getPrototypeOf(app.state.rows), Array.prototype);
    assert.deepEqual(app.state.rows, [1, 2]);
  }
  // This records the existing prototype gap; it does not approve normalization
  // for the proposed production type policy. Fix before core type acceptance.
});
