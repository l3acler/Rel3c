import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, FrameworkError } from '../src/index.js';
import { fakeDocument } from './helpers/fake-dom.js';

const code = expected => error => error instanceof FrameworkError && error.code === expected;
const schema = build => createActionSchema({ version: 'dispatch/1' })(build);

test('named dispatch and detached wrappers publish one complete version, no-ops included', () => {
  let calls = 0, leaked;
  const app = createApp({ initialState: { count: 0, nested: { n: 1 } }, schema: schema(({ action }) => ({
    increment: action(draft => {
      calls++; leaked = draft; draft.count++; draft.nested.n++;
      assert.equal(app.state.count, calls - 1);
      assert.equal(app.state.nested.n, calls);
      assert.equal(app.stateVersion, calls);
      return 'ignored';
    }),
    noop: action(() => {}),
  })) });
  const first = app.state, { dispatch } = app, { increment } = app.actions;
  assert.equal(dispatch('increment'), undefined);
  assert.equal(increment(), undefined);
  assert.deepEqual(app.state, { count: 2, nested: { n: 3 } });
  assert.deepEqual(first, { count: 0, nested: { n: 1 } });
  assert.equal(app.stateVersion, 3);
  assert.throws(() => leaked.count, TypeError);
  const before = app.state; app.actions.noop();
  assert.equal(app.state, before); assert.equal(app.stateVersion, 4);
  app.dispose(); assert.throws(increment, code('APP_DISPOSED'));
});

test('exact arity, unknown names and modes reject before guards or bodies', () => {
  let calls = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    none: action((draft = {}) => { calls++; }),
    payload: action(value => { calls++; return value === undefined; }, (...args) => {
      calls++; assert.equal(args.length, 3); assert.equal(args[1], undefined);
      assert.equal(typeof args[2].random, 'function'); // C.2's additional services argument.
    }),
  })) });
  for (const run of [() => app.dispatch('none', undefined), () => app.actions.none(1, 2),
    () => app.actions.payload(), () => app.dispatch('payload', 1, 2)]) assert.throws(run, code('ACTION_ARITY'));
  for (const name of [undefined, null, {}, 'missing', 'toString']) assert.throws(() => app.dispatch(name), code('ACTION_UNKNOWN'));
  assert.equal(calls, 0); assert.equal(app.stateVersion, 1);
  app.actions.payload(undefined); assert.equal(calls, 2); assert.equal(app.stateVersion, 2); app.dispose();
});

test('payloads preserve aliases, holes, null prototypes and scalar meaning without owning caller data', () => {
  const shared = Object.assign(Object.create(null), { n: -0 });
  const rows = new Array(3); rows[1] = shared; rows.extra = undefined;
  const input = { a: shared, b: shared, rows };
  let guarded;
  const app = createApp({ schema: schema(({ action }) => ({ set: action(value => {
    guarded = value; assert.notEqual(value, input);
    assert.equal(value.a, value.b); assert.equal(value.a, value.rows[1]);
    assert.equal(Object.getPrototypeOf(value.a), null);
    assert.ok(Object.is(value.a.n, -0)); assert.ok(!(0 in value.rows));
    assert.ok(Object.hasOwn(value.rows, 'extra'));
    assert.ok(Object.isFrozen(value) && Object.isFrozen(value.rows) && Object.isFrozen(value.a));
    assert.throws(() => { value.a.n = 2; }, TypeError); return true;
  }, (draft, payload) => { assert.equal(payload, guarded); draft.saved = payload; }) })) });
  app.actions.set(input); shared.n = 10; rows.push('caller');
  assert.ok(!Object.isFrozen(input) && !Object.isFrozen(shared));
  assert.ok(Object.is(app.state.saved.a.n, -0)); assert.equal(app.state.saved.rows.length, 3);
  assert.notEqual(app.state.saved, guarded); app.dispose();
});

test('supported primitive payload roots reach guards unchanged', () => {
  const values = [null, undefined, false, true, '', 'text', 0, -0, 1.5];
  const seen = [];
  const app = createApp({ schema: schema(({ action }) => ({ put: action(() => true, (draft, value) => { seen.push(value); }) })) });
  for (const value of values) app.actions.put(value);
  assert.deepEqual(seen, values); assert.equal(app.stateVersion, 1 + values.length); app.dispose();
});

test('invalid payload types, descriptors and cycles reject without getters, guards or bodies', () => {
  let gets = 0, calls = 0;
  const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { gets++; return 1; } });
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
  const cycle = {}; cycle.self = cycle;
  const app = createApp({ schema: schema(({ action }) => ({ put: action(() => { calls++; return true; }, () => { calls++; }) })) });
  for (const input of [NaN, Infinity, 1n, Symbol(), () => {}, new Date(), new Map(),
    new (class extends Array {})(), Object.create({}), { [Symbol()]: 1 }, getter, hidden,
    { nodeType: 1 }, { then() {} }]) assert.throws(() => app.actions.put(input), code('PAYLOAD_INVALID'));
  assert.throws(() => app.actions.put(cycle), code('PAYLOAD_CYCLE'));
  assert.equal(gets, 0); assert.equal(calls, 0); assert.equal(app.stateVersion, 1); app.dispose();
});

test('guards require exactly true and preserve thrown causes without committing', () => {
  const failure = new Error('guard'); let calls = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    truthy: action(() => 'yes', () => { calls++; }),
    false: action(() => false, () => { calls++; }),
    throws: action(() => { throw failure; }, () => { calls++; }),
    mutates: action(payload => { payload.x = 2; return true; }, () => { calls++; }),
  })) });
  assert.throws(() => app.actions.truthy(null), code('PAYLOAD_INVALID'));
  assert.throws(() => app.actions.false(null), code('PAYLOAD_INVALID'));
  assert.throws(() => app.actions.throws(null), error => error.code === 'PAYLOAD_INVALID' && error.cause === failure);
  const input = { x: 1 }; assert.throws(() => app.actions.mutates(input), code('PAYLOAD_INVALID'));
  assert.equal(input.x, 1); assert.equal(calls, 0); assert.equal(app.stateVersion, 1); app.dispose();
});

test('Promise guards reject and observe rejection; unknown thenables are not executed', async () => {
  let thenCalls = 0, calls = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    async: action(async () => { throw new Error('async guard'); }, () => { calls++; }),
    thenable: action(() => ({ then() { thenCalls++; } }), () => { calls++; }),
  })) });
  assert.throws(() => app.actions.async(1), code('PAYLOAD_ASYNC'));
  assert.throws(() => app.actions.thenable(1), code('PAYLOAD_ASYNC'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0); assert.equal(thenCalls, 0); assert.equal(app.stateVersion, 1); app.dispose();
});

test('throwing or invalid final action graphs roll back and revoke every leaked draft', () => {
  const failure = new Error('body'); let leaked;
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    throws: action(draft => { leaked = draft; draft.n++; throw failure; }),
    cycle: action(draft => { leaked = draft; draft.self = draft; }),
    recover: action(draft => { draft.n++; }),
  })) });
  const before = app.state;
  assert.throws(() => app.actions.throws(), error => error === failure);
  assert.throws(() => leaked.n, TypeError);
  assert.throws(() => app.actions.cycle(), code('STATE_CYCLE'));
  assert.throws(() => Reflect.ownKeys(leaked), TypeError);
  assert.equal(app.state, before); assert.equal(app.stateVersion, 1);
  app.actions.recover(); assert.equal(app.state.n, 1); assert.equal(app.stateVersion, 2); app.dispose();
});

test('Promise actions roll back, revoke deferred writes and never execute returned thenables', async () => {
  let deferredError, thenCalls = 0;
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    async: action(async draft => {
      draft.n = 1; await Promise.resolve();
      try { draft.n = 2; } catch (error) { deferredError = error; }
      throw new Error('after await');
    }),
    thenable: action(draft => { draft.n++; return { then() { thenCalls++; } }; }),
  })) });
  assert.throws(() => app.actions.async(), code('ACTION_ASYNC'));
  assert.throws(() => app.actions.thenable(), code('ACTION_ASYNC'));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(deferredError instanceof TypeError); assert.equal(thenCalls, 0);
  assert.equal(app.state.n, 0); assert.equal(app.stateVersion, 1); app.dispose();
});

test('nested work executes FIFO after parent commit and captures payload at admission', () => {
  const trace = []; const input = { n: 1 }; let nestedReturn;
  const app = createApp({ initialState: { rows: [] }, schema: schema(({ action }) => ({
    root: action(draft => {
      draft.rows.push('root'); nestedReturn = app.actions.a(input); app.dispatch('b'); input.n = 9;
      assert.deepEqual(app.state.rows, []); assert.equal(app.stateVersion, 1);
      assert.deepEqual(draft.rows.slice(), ['root']);
    }),
    a: action(value => value.n === 1, (draft, payload) => {
      trace.push(['a', app.stateVersion, [...app.state.rows], payload.n]);
      draft.rows.push('a'); app.actions.c();
    }),
    b: action(draft => { trace.push(['b', app.stateVersion, [...app.state.rows]]); draft.rows.push('b'); }),
    c: action(draft => { trace.push(['c', app.stateVersion, [...app.state.rows]]); draft.rows.push('c'); }),
  })) });
  app.actions.root(); assert.equal(nestedReturn, undefined);
  assert.deepEqual(app.state.rows, ['root', 'a', 'b', 'c']); assert.equal(app.stateVersion, 5);
  assert.deepEqual(trace, [['a', 2, ['root'], 1], ['b', 3, ['root', 'a']], ['c', 4, ['root', 'a', 'b']]]); app.dispose();
});

for (const mode of ['throw', 'async', 'invalid']) test(`failed ${mode} parent discards its admitted children`, () => {
  let childCalls = 0;
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    parent: action(draft => {
      draft.n++; app.actions.child();
      if (mode === 'throw') throw new Error('parent');
      if (mode === 'async') return Promise.resolve();
      draft.self = draft;
    }),
    child: action(draft => { childCalls++; draft.n++; }),
  })) });
  assert.throws(() => app.actions.parent()); assert.equal(childCalls, 0);
  assert.equal(app.state.n, 0); assert.equal(app.stateVersion, 1);
  app.actions.child(); assert.equal(childCalls, 1); assert.equal(app.stateVersion, 2); app.dispose();
});

test('failed child drops its descendants, siblings continue, outer caller sees the original failure', () => {
  const failure = new Error('child'); const trace = [], observed = [];
  const app = createApp({ initialState: { rows: [] }, onError(error, info) {
    observed.push([error, info.phase, [...app.state.rows], app.stateVersion]);
  }, schema: schema(({ action }) => ({
    root: action(draft => { draft.rows.push('root'); app.actions.bad(); app.actions.good(); }),
    bad: action(draft => { draft.rows.push('bad'); app.actions.descendant(); throw failure; }),
    good: action(draft => { trace.push('good'); draft.rows.push('good'); }),
    descendant: action(() => { trace.push('descendant'); }),
  })) });
  assert.throws(() => app.actions.root(), error => error === failure);
  assert.deepEqual(trace, ['good']); assert.deepEqual(app.state.rows, ['root', 'good']);
  assert.deepEqual(observed, [[failure, 'dispatch', ['root', 'good'], 3]]);
  app.actions.good(); assert.equal(app.stateVersion, 4); app.dispose();
});

test('multiple failed children aggregate in FIFO order after other successes', () => {
  const one = new Error('one'), two = new Error('two'); let reports = 0;
  const app = createApp({ initialState: { n: 0 }, onError(error) {
    reports++; assert.deepEqual(error.errors, [one, two]); assert.equal(app.state.n, 2);
  }, schema: schema(({ action }) => ({
    root: action(draft => { draft.n++; app.actions.one(); app.actions.good(); app.actions.two(); }),
    one: action(() => { throw one; }), two: action(() => { throw two; }), good: action(draft => { draft.n++; }),
  })) });
  assert.throws(() => app.actions.root(), error => error instanceof AggregateError && error.errors[0] === one && error.errors[1] === two);
  assert.equal(reports, 1); assert.equal(app.stateVersion, 3); app.dispose();
});

test('nested admission failures can be caught; uncaught failures abort the parent', () => {
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    catch: action(draft => {
      assert.throws(() => app.actions.payload('bad'), code('PAYLOAD_INVALID'));
      assert.throws(() => app.dispatch('missing'), code('ACTION_UNKNOWN'));
      draft.n++; app.actions.payload(2);
    }),
    uncaught: action(draft => { draft.n++; app.actions.payload('bad'); }),
    payload: action(Number.isFinite, (draft, n) => { draft.n += n; }),
  })) });
  app.actions.catch(); assert.equal(app.state.n, 3); assert.equal(app.stateVersion, 3);
  assert.throws(() => app.actions.uncaught(), code('PAYLOAD_INVALID'));
  assert.equal(app.state.n, 3); assert.equal(app.stateVersion, 3); app.dispose();
});

test('guard dispatch and lifecycle changes reject before action execution', () => {
  let bodyCalls = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    child: action(() => { bodyCalls++; }),
    guarded: action(() => {
      assert.throws(() => app.actions.child(), code('ACTION_REENTRANT'));
      assert.throws(() => app.dispose(), code('LIFECYCLE_REENTRANT'));
      assert.throws(() => app.mount(), code('LIFECYCLE_REENTRANT'));
      assert.equal(app.status, 'created'); return true;
    }, () => { bodyCalls++; }),
  })) });
  app.actions.guarded(null); assert.equal(bodyCalls, 1); assert.equal(app.stateVersion, 2); app.dispose();
});

test('mount/dispose from action bodies reject and cannot destroy the transaction', () => {
  let reports = 0;
  const app = createApp({ initialState: { n: 0 }, onError() { reports++; }, schema: schema(({ action }) => ({
    safe: action(draft => {
      assert.throws(() => app.dispose(), code('LIFECYCLE_REENTRANT'));
      assert.throws(() => app.mount(), code('LIFECYCLE_REENTRANT'));
      draft.n++;
    }),
    unsafe: action(draft => { draft.n++; app.dispose(); }),
  })) });
  app.actions.safe(); assert.equal(reports, 0); assert.equal(app.state.n, 1);
  assert.throws(() => app.actions.unsafe(), code('LIFECYCLE_REENTRANT'));
  assert.equal(reports, 1); assert.equal(app.state.n, 1); assert.equal(app.stateVersion, 2); app.dispose();
});

test('error callbacks see committed state and cannot dispatch recovery work', () => {
  const bodyFailure = new Error('body');
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    bad: action(draft => { draft.n++; throw bodyFailure; }), good: action(draft => { draft.n++; }),
  })), onError(error) {
    assert.equal(error, bodyFailure); assert.equal(app.state.n, 0);
    assert.throws(() => app.actions.good(), code('ACTION_REENTRANT'));
  } });
  assert.throws(() => app.actions.bad(), bodyFailure);
  assert.equal(app.stateVersion, 1); app.actions.good(); assert.equal(app.state.n, 1); app.dispose();
});

test('self-dispatch is bounded without stack recursion and the next outer batch recovers', () => {
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    loop: action(draft => { draft.n++; app.actions.loop(); }),
    good: action(draft => { draft.n++; }),
  })) });
  assert.throws(() => app.actions.loop(), code('ACTION_QUEUE_LIMIT'));
  assert.equal(app.state.n, 1023); assert.equal(app.stateVersion, 1024);
  app.actions.good(); assert.equal(app.state.n, 1024); assert.equal(app.stateVersion, 1025); app.dispose();
});

test('wide batch count limit discards a failed root and allows caught admission recovery', () => {
  let children = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    overflow: action(() => { for (let i = 0; i < 1024; i++) app.actions.child(); }),
    catches: action(() => {
      for (let i = 0; i < 1023; i++) app.actions.child();
      assert.throws(() => app.actions.child(), code('ACTION_QUEUE_LIMIT'));
    }), child: action(() => { children++; }),
  })) });
  assert.throws(() => app.actions.overflow(), code('ACTION_QUEUE_LIMIT'));
  assert.equal(children, 0); assert.equal(app.stateVersion, 1);
  app.actions.catches(); assert.equal(children, 1023); assert.equal(app.stateVersion, 1025); app.dispose();
});

test('payload graph limits reject before guard; aggregate batch limits include consumed payloads', () => {
  let calls = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    slots: action(() => { calls++; return true; }, () => {}),
    root: action(() => { app.actions.slots(new Array(60_000)); app.actions.slots(new Array(60_000)); }),
    chain: action(() => true, () => { app.actions.chain('x'.repeat(400_000)); }),
  })) });
  assert.throws(() => app.actions.slots(new Array(100_001)), code('PAYLOAD_LIMIT'));
  let deep = {}; for (let i = 0; i < 128; i++) deep = { next: deep };
  assert.throws(() => app.actions.slots(deep), code('PAYLOAD_LIMIT')); assert.equal(calls, 0);
  assert.throws(() => app.actions.root(), code('PAYLOAD_LIMIT'));
  assert.equal(calls, 1); assert.equal(app.stateVersion, 1);
  assert.throws(() => app.actions.chain('x'.repeat(400_000)), code('PAYLOAD_LIMIT'));
  assert.equal(app.stateVersion, 2);
  app.actions.slots([]); assert.equal(app.stateVersion, 3); app.dispose();
});

test('mounted actions update state and retained context getters while text stays unchanged until bindings exist', () => {
  const target = fakeDocument().createElement(); let context, views = 0;
  const app = createApp({ target, initialState: { n: 0 },
    schema: schema(({ action }) => ({ increment: action(draft => { draft.n++; }) })),
    view(received) { context = received; views++; return String(received.state.n); },
  });
  const first = context.state;
  context.actions.increment(); context.dispatch('increment');
  assert.equal(context.state, app.state); assert.equal(context.state.n, 2);
  assert.equal(first.n, 0); assert.equal(views, 1); assert.equal(target.textContent, '0');
  app.dispose(); assert.throws(() => context.state, code('APP_DISPOSED'));
  assert.throws(() => context.dispatch('increment'), code('APP_DISPOSED'));
});

test('view dispatch rejects before commit and failed mounting releases its target', () => {
  const target = fakeDocument().createElement(); let shouldDispatch = true;
  const app = createApp({ initialState: { n: 0 },
    schema: schema(({ action }) => ({ increment: action(draft => { draft.n++; }) })),
    view({ actions }) { if (shouldDispatch) actions.increment(); return 'safe'; },
  });
  assert.throws(() => app.mount(target), code('ACTION_REENTRANT'));
  assert.equal(app.stateVersion, 1); assert.equal(app.state.n, 0); assert.equal(target.textContent, '');
  shouldDispatch = false; app.mount(target); app.actions.increment();
  assert.equal(app.stateVersion, 2); app.dispose();
});

test('reusing the same thrown error reports once for each outer batch', () => {
  const failure = new Error('reused'); let reports = 0;
  const app = createApp({ schema: schema(({ action }) => ({ fail: action(() => { throw failure; }) })),
    onError(error) { reports++; assert.equal(error, failure); },
  });
  assert.throws(() => app.actions.fail(), error => error === failure);
  assert.throws(() => app.actions.fail(), error => error === failure);
  assert.equal(reports, 2); assert.equal(app.stateVersion, 1); app.dispose();
});

test('aggregate payload accounting includes requests discarded by failed children', () => {
  const failure = new Error('child'); let descendantCalls = 0;
  const app = createApp({ schema: schema(({ action }) => ({
    root: action(() => { app.actions.bad(); app.actions.next(); }),
    bad: action(() => { app.actions.payload(new Array(60_000)); throw failure; }),
    next: action(() => { app.actions.payload(new Array(60_000)); }),
    payload: action(() => true, () => { descendantCalls++; }),
  })) });
  assert.throws(() => app.actions.root(), error => error instanceof AggregateError &&
    error.errors[0] === failure && error.errors[1].code === 'PAYLOAD_LIMIT');
  assert.equal(descendantCalls, 0); assert.equal(app.stateVersion, 2);
  app.actions.payload([]); assert.equal(descendantCalls, 1); app.dispose();
});

test('native Promises reject even with a shadowed non-callable then property', async () => {
  const masked = () => Object.defineProperty(Promise.reject(new Error('masked')), 'then', { value: undefined });
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    body: action(draft => { draft.n++; return masked(); }),
    guard: action(masked, draft => { draft.n++; }),
  })) });
  assert.throws(() => app.actions.body(), code('ACTION_ASYNC'));
  assert.throws(() => app.actions.guard(null), code('PAYLOAD_ASYNC'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.state.n, 0); assert.equal(app.stateVersion, 1); app.dispose();
});

test('public bodies preserve aliases across array reorder and share unrelated branches', () => {
  const shared = { n: 0 }, untouched = { value: 'same' };
  const app = createApp({ initialState: { a: shared, b: shared, rows: [shared, { n: 5 }], untouched },
    schema: schema(({ action }) => ({ change: action(draft => {
      const held = draft.rows[0]; draft.rows.reverse(); held.n++;
      draft.rows.splice(1, 0, { n: 9 }); draft.added = undefined;
    }) })),
  });
  const before = app.state; app.actions.change();
  assert.equal(app.state.a, app.state.b); assert.equal(app.state.a, app.state.rows[2]);
  assert.equal(app.state.a.n, 1); assert.equal(before.a.n, 0);
  assert.equal(app.state.untouched, before.untouched); assert.ok(Object.hasOwn(app.state, 'added'));
  app.dispose();
});

test('non-Error action throws normalize at the outer error boundary without publishing', () => {
  let observed;
  const app = createApp({ initialState: { n: 0 }, schema: schema(({ action }) => ({
    bad: action(draft => { draft.n++; throw 'application failure'; }),
  })), onError(error, info) { observed = [error, info.phase]; } });
  assert.throws(() => app.actions.bad(), error => error.code === 'OPERATION_FAILED' && error.cause === 'application failure');
  assert.equal(observed[0].cause, 'application failure'); assert.equal(observed[1], 'dispatch');
  assert.equal(app.state.n, 0); assert.equal(app.stateVersion, 1); app.dispose();
});
