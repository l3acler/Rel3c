import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema } from '../src/index.js';
import { fakeDocument } from './helpers/fake-dom.js';

const code = expected => error => error.code === expected;
function fixture(initialState, actions) {
  return createApp({ initialState, schema: createActionSchema()(({ action }) =>
    Object.fromEntries(Object.entries(actions).map(([name, run]) => [name, action(run)]))) });
}

test('A.5 initial and dirty unobserved computations are lazy and cache repeated reads', () => {
  const app = fixture({ n: 1, other: 0 }, { edit: d => { d.n++; }, other: d => { d.other++; } });
  let reads = 0;
  const doubled = app.computed(s => { reads++; return s.n * 2; });
  assert.equal(doubled.dirty, true); assert.equal(reads, 0);
  app.actions.edit(); assert.equal(reads, 0);
  assert.equal(doubled.value, 4); assert.equal(doubled.value, 4); assert.equal(reads, 1);
  assert.equal(doubled.dirty, false);
  app.actions.other(); assert.equal(doubled.dirty, false); assert.equal(doubled.value, 4); assert.equal(reads, 1);
  app.actions.edit(); app.actions.edit(); assert.equal(doubled.dirty, true); assert.equal(reads, 1);
  assert.equal(doubled.value, 8); assert.equal(reads, 2); app.dispose();
});

test('A.5 observed computed values invalidate without recomputing until consumed', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  let reads = 0, callbacks = 0;
  const result = app.computed(s => { reads++; return s.n + 1; });
  const observer = app.observe(() => result.value, () => { callbacks++; });
  assert.equal(reads, 1); app.actions.edit(); app.actions.edit();
  assert.equal(reads, 1); assert.equal(callbacks, 1); assert.equal(observer.dirty, true);
  assert.equal(observer.read(), 3); assert.equal(reads, 2);
  app.actions.edit(); assert.equal(callbacks, 2); assert.equal(reads, 2); app.dispose();
});

test('A.5 chains and diamonds invalidate fully before callbacks with one evaluation per computed', () => {
  const app = fixture({ n: 1 }, { edit: d => { d.n++; } });
  const counts = [0, 0, 0, 0];
  const source = app.computed(s => { counts[0]++; return s.n; });
  const left = app.computed(() => { counts[1]++; return source.value + 10; });
  const right = app.computed(() => { counts[2]++; return source.value * 10; });
  const sum = app.computed(() => { counts[3]++; return left.value + right.value; });
  const seen = [];
  const observer = app.observe(() => sum.value, () => {
    assert.ok(source.dirty && left.dirty && right.dirty && sum.dirty && observer.dirty);
    seen.push(observer.read());
  });
  assert.deepEqual(counts, [1, 1, 1, 1]); app.actions.edit();
  assert.deepEqual(seen, [32]); assert.deepEqual(counts, [2, 2, 2, 2]);
  assert.equal(sum.value, 32); assert.deepEqual(counts, [2, 2, 2, 2]); app.dispose();
});

test('A.5 computed branch dependencies replace both properties and computed edges', () => {
  const app = fixture({ chooseA: true, a: 1, b: 10 }, {
    toggle: d => { d.chooseA = !d.chooseA; }, a: d => { d.a++; }, b: d => { d.b++; },
  });
  const a = app.computed(s => s.a), b = app.computed(s => s.b);
  let reads = 0, notifications = 0;
  const branch = app.computed(s => { reads++; return s.chooseA ? a.value : b.value; });
  const observer = app.observe(() => branch.value, () => { notifications++; });
  app.actions.b(); assert.equal(branch.dirty, false); assert.equal(reads, 1);
  app.actions.toggle(); assert.equal(observer.read(), 11); assert.equal(reads, 2);
  app.actions.a(); assert.equal(branch.dirty, false); assert.equal(observer.dirty, false); assert.equal(notifications, 1);
  app.actions.b(); assert.equal(observer.read(), 12); assert.equal(reads, 3); app.dispose();
});

test('A.5 direct dynamic state dependencies, aliases and item structure remain exact', () => {
  const shared = { n: 1, other: 0 };
  const app = fixture({ a: shared, b: shared, rows: [shared, { n: 5 }] }, {
    edit: d => { d.b.n++; }, second: d => { d.rows[1].n++; }, move: d => { d.rows.reverse(); },
  });
  let reads = 0, listReads = 0;
  const first = app.computed(s => { reads++; return s.a.n; });
  const structure = app.computed(s => { listReads++; return [...s.rows]; });
  assert.equal(first.value, 1); const originalList = structure.value;
  app.actions.second(); assert.equal(first.dirty, false); assert.equal(structure.dirty, false);
  app.actions.edit(); assert.equal(first.dirty, true); assert.equal(structure.dirty, false);
  assert.equal(first.value, 2); assert.equal(reads, 2); assert.equal(listReads, 1);
  // Cached facades resolve current nodes even when list structure is unchanged.
  assert.equal(originalList[0].n, 2); assert.equal(originalList[1].n, 6);
  app.actions.move(); assert.equal(first.dirty, false); assert.equal(structure.dirty, true);
  assert.equal(structure.value[0].n, 6); assert.equal(listReads, 2); app.dispose();
});

test('A.5 computed object-valued state reads do not trap downstream readers in an old COW copy', () => {
  const app = fixture({ user: { n: 0, other: 0 } }, {
    edit: d => { d.user.n++; }, other: d => { d.user.other++; }, replace: d => { d.user = { n: 20, other: 0 }; },
  });
  let parentReads = 0, childReads = 0;
  const user = app.computed(s => { parentReads++; return s.user; });
  const n = app.computed(() => { childReads++; return user.value.n; });
  assert.equal(n.value, 0); app.actions.edit();
  assert.equal(user.dirty, false); assert.equal(n.dirty, true); assert.equal(n.value, 1);
  app.actions.other(); assert.equal(n.dirty, false);
  app.actions.replace(); assert.equal(user.dirty, true); assert.equal(n.value, 20);
  assert.deepEqual([parentReads, childReads], [2, 3]); app.dispose();
});

for (const length of [1, 2, 3]) test(`A.5 useful cycle diagnostic for ${length} computed nodes and recovery`, () => {
  const app = fixture({ cycle: true }, { recover: d => { d.cycle = false; } });
  const values = Array.from({ length }, (_, i) => app.computed(s => s.cycle ? values[(i + 1) % length].value : 42));
  assert.throws(() => values[0].value, error => {
    assert.equal(error.code, 'COMPUTED_CYCLE'); assert.match(error.message, /computed#1/);
    assert.match(error.message, / -> /); return true;
  });
  for (const value of values) assert.equal(value.dirty, true);
  app.actions.recover(); assert.equal(values[0].value, 42); assert.equal(values[0].dirty, false); app.dispose();
});

test('A.5 errors remain dirty and replace partial dependencies; caught upstream errors can recover', () => {
  const app = fixture({ broken: true, a: 0, b: 0 }, {
    recover: d => { d.broken = false; }, a: d => { d.a++; }, b: d => { d.b++; },
  });
  let failures = 0, notifications = 0;
  const source = app.computed(s => { if (s.broken) { s.a; failures++; throw Error('broken'); } return s.b; });
  const recovered = app.computed(() => { try { return source.value; } catch { return -1; } });
  const observer = app.observe(() => recovered.value, () => { notifications++; });
  assert.equal(source.dirty, true); assert.equal(recovered.value, -1); assert.equal(failures, 1);
  // A dirty failing source must still propagate to a clean downstream fallback.
  app.actions.a(); assert.equal(notifications, 1); assert.equal(observer.read(), -1); assert.equal(failures, 2);
  app.actions.recover(); assert.equal(observer.read(), 0);
  app.actions.a(); assert.equal(recovered.dirty, false); assert.equal(observer.dirty, false);
  app.actions.b(); assert.equal(observer.read(), 1); app.dispose();
});

test('A.5 computed readers cannot mutate state, dispatch or destroy app lifecycle', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  const computed = app.computed(s => {
    assert.throws(() => { s.n++; }, code('STATE_READONLY'));
    assert.throws(() => app.actions.edit(), code('ACTION_REENTRANT'));
    assert.throws(() => app.dispose(), code('LIFECYCLE_REENTRANT'));
    assert.throws(() => app.mount(), code('LIFECYCLE_REENTRANT'));
    assert.throws(() => app.computed(() => 1), code('REACTIVITY_REENTRANT'));
    assert.throws(() => app.observe(() => 1), code('REACTIVITY_REENTRANT'));
    assert.throws(() => computed.dispose(), code('REACTIVITY_REENTRANT'));
    return app.state.n;
  });
  assert.equal(computed.value, 0); assert.equal(app.stateVersion, 1); app.dispose();
});

test('A.5 async computed results reject lazily and observe native rejections without thenable execution', async () => {
  const app = createApp(); let thenCalls = 0;
  const async = app.computed(async () => { throw Error('async'); });
  const masked = app.computed(() => Object.defineProperty(Promise.reject(Error('masked')), 'then', { value: undefined }));
  const thenable = app.computed(() => ({ then() { thenCalls++; } }));
  for (const value of [async, masked, thenable]) {
    assert.throws(() => value.value, code('REACTIVITY_ASYNC')); assert.equal(value.dirty, true);
  }
  await new Promise(resolve => setImmediate(resolve)); assert.equal(thenCalls, 0); app.dispose();
});

test('A.5 computed disposal invalidates dependents and removes source subscriptions', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  let notifications = 0;
  const source = app.computed(s => s.n), child = app.computed(() => source.value + 1);
  const observer = app.observe(() => child.value, () => { notifications++; });
  source.dispose(); source.dispose(); assert.equal(notifications, 1); assert.equal(child.dirty, true);
  assert.throws(() => child.value, code('SCOPE_DISPOSED'));
  assert.throws(() => source.value, code('SCOPE_DISPOSED')); assert.throws(() => source.dirty, code('SCOPE_DISPOSED'));
  app.actions.edit(); assert.equal(notifications, 1); observer.dispose(); child.dispose(); app.dispose();
});

test('A.5 disposing a source from a notification dirties clean dependents in the same notification drain', () => {
  const app = fixture({ n: 0, other: 0 }, { edit: d => { d.other++; } });
  const source = app.computed(s => s.n);
  app.observe(s => s.other, () => source.dispose());
  let notifications = 0;
  app.observe(() => source.value, () => { notifications++; });
  app.actions.edit(); assert.equal(notifications, 1); app.dispose();
});

test('A.5 no-op and failed actions do not dirty computed caches', () => {
  const app = fixture({ n: 0 }, { noop: () => {}, fail: d => { d.n++; throw Error('fail'); } });
  let reads = 0; const result = app.computed(s => { reads++; return s.n; });
  assert.equal(result.value, 0); app.actions.noop(); assert.throws(() => app.actions.fail(), /fail/);
  assert.equal(result.dirty, false); assert.equal(result.value, 0); assert.equal(reads, 1); app.dispose();
});

test('A.5 constant results stay cached; dependents are invalidated when inputs change even if the result is equal', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  let constants = 0, reads = 0, callbacks = 0;
  const constant = app.computed(() => { constants++; return undefined; });
  const equal = app.computed(s => { reads++; s.n; return 1; });
  const observer = app.observe(() => equal.value, () => { callbacks++; });
  assert.equal(constant.value, undefined); app.actions.edit();
  assert.equal(callbacks, 1); assert.equal(reads, 1); assert.equal(observer.read(), 1); assert.equal(reads, 2);
  assert.equal(constant.value, undefined); assert.equal(constants, 1); app.dispose();
});

test('A.5 app-owned and failed/successful mount-owned computed lifetimes are independent', () => {
  const target = fakeDocument().createElement(); let mounted, stale, fail = true;
  const app = createApp({ initialState: { n: 0 }, view(c) {
    stale = c; mounted = c.computed(s => s.n); assert.equal(mounted.value, 0);
    if (fail) throw Error('mount'); return String(mounted.value);
  } });
  const owned = app.computed(s => s.n + 1);
  assert.throws(() => app.mount(target), code('VIEW_FAILED'));
  assert.throws(() => mounted.value, code('SCOPE_DISPOSED')); assert.equal(owned.value, 1);
  assert.throws(() => stale.computed(() => 1), code('SCOPE_DISPOSED'));
  fail = false; app.mount(target); assert.equal(mounted.value, 0);
  app.dispose(); assert.throws(() => owned.value, code('SCOPE_DISPOSED')); assert.throws(() => mounted.value, code('SCOPE_DISPOSED'));
});

test('A.5 reactive graph ownership is isolated between apps and 100 dispose cycles restore behavior', () => {
  for (let i = 0; i < 100; i++) {
    const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
    const other = fixture({ n: 0 }, { edit: d => { d.n++; } });
    const one = app.computed(s => s.n), two = other.computed(s => s.n);
    assert.equal(one.value, 0); assert.equal(two.value, 0);
    app.actions.edit(); assert.equal(one.value, 1); assert.equal(two.dirty, false);
    app.dispose(); other.actions.edit(); assert.equal(two.value, 1); other.dispose();
  }
});

for (const read of [null, {}, 42]) test(`A.5 invalid computed read ${String(read)} rejects at registration`, () => {
  const app = createApp(); assert.throws(() => app.computed(read), code('REACTIVITY_INVALID')); app.dispose();
});

test('A.5 app disposal stops computed-dependent notifications before scoped and user cleanup', () => {
  const target = fakeDocument().createElement(); let source, notifications = 0;
  const app = createApp({ target, initialState: { n: 0 }, view({ computed }) {
    source = computed(s => s.n); return String(source.value);
  } });
  app.observe(() => source.value, () => { notifications++; });
  app.onDispose(() => source.dispose()); app.dispose();
  assert.equal(notifications, 0); assert.equal(target.textContent, '');
});

test('A.5 internal thenable checks add no accidental state dependencies', () => {
  const app = fixture({ user: { n: 0 } }, { add: d => { d.user.then = 1; } });
  const user = app.computed(s => s.user);
  const observer = app.observe(() => user.value);
  user.value; app.actions.add();
  assert.equal(user.dirty, false); assert.equal(observer.dirty, false); app.dispose();
});
