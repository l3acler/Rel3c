import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema } from '../src/index.js';
import { fakeDocument } from './helpers/fake-dom.js';

const code = expected => error => error.code === expected;
function fixture(initialState, actions) {
  return createApp({ initialState, schema: createActionSchema()(({ action }) =>
    Object.fromEntries(Object.entries(actions).map(([name, run]) => [name, action(run)]))) });
}
function watch(app, read) {
  let calls = 0;
  const observer = app.observe(read, () => { calls++; });
  return { observer, get calls() { return calls; } };
}

test('A.4 nested properties and aliases invalidate independently without rerunning reads', () => {
  const shared = { n: 0, other: 0 };
  const app = fixture({ a: shared, b: shared, unrelated: { n: 0 } }, {
    edit: d => { d.b.n++; }, other: d => { d.a.other++; }, separate: d => { d.unrelated.n++; },
  });
  let evaluations = 0;
  const a = watch(app, s => { evaluations++; return s.a.n; });
  const b = watch(app, s => s.b.n), other = watch(app, s => s.a.other), separate = watch(app, s => s.unrelated.n);
  app.actions.edit();
  assert.deepEqual([a.calls, b.calls, other.calls, separate.calls], [1, 1, 0, 0]);
  assert.equal(evaluations, 1); assert.equal(a.observer.dirty, true);
  assert.equal(a.observer.read(), 1); assert.equal(evaluations, 2);
  app.actions.other(); assert.equal(other.calls, 1); assert.equal(a.calls, 1);
  app.actions.separate(); assert.equal(separate.calls, 1); app.dispose();
});

test('A.4 value, own/inherited presence and key reads use distinct dependencies', () => {
  const app = fixture({ obj: { n: 0 } }, {
    set: d => { d.obj.n++; }, add: d => { d.obj.extra = undefined; }, remove: d => { delete d.obj.extra; },
    shadow: d => { d.obj.toString = 3; },
  });
  const value = watch(app, s => s.obj.n), missing = watch(app, s => s.obj.extra);
  const own = watch(app, s => Object.hasOwn(s.obj, 'extra')), has = watch(app, s => 'extra' in s.obj);
  const keys = watch(app, s => Object.keys(s.obj));
  const inherited = watch(app, s => 'toString' in s.obj);
  app.actions.set(); assert.deepEqual([value.calls, own.calls, has.calls, keys.calls], [1, 0, 0, 0]);
  app.actions.add(); assert.deepEqual([missing.calls, own.calls, has.calls, keys.calls], [0, 1, 1, 1]);
  assert.deepEqual(keys.observer.read(), ['n', 'extra']);
  own.observer.read(); has.observer.read();
  app.actions.remove(); assert.deepEqual([missing.calls, own.calls, has.calls, keys.calls], [0, 2, 2, 2]);
  app.actions.shadow(); assert.equal(inherited.calls, 0); app.dispose();
});

test('A.4 key order changes invalidate iteration even when the same keys remain', () => {
  const app = fixture({ obj: { a: 1, b: 2 } }, { reorder: d => { delete d.obj.a; d.obj.a = 1; } });
  const keys = watch(app, s => Reflect.ownKeys(s.obj)), value = watch(app, s => s.obj.a);
  app.actions.reorder(); assert.equal(keys.calls, 1); assert.equal(value.calls, 0);
  assert.deepEqual(keys.observer.read(), ['b', 'a']); app.dispose();
});

test('A.4 dynamic branches replace stale dependencies on explicit read', () => {
  const app = fixture({ left: true, a: { n: 1 }, b: { n: 2 } }, {
    toggle: d => { d.left = !d.left; }, a: d => { d.a.n++; }, b: d => { d.b.n++; },
  });
  const current = watch(app, s => s.left ? s.a.n : s.b.n);
  app.actions.b(); assert.equal(current.calls, 0);
  app.actions.toggle(); assert.equal(current.calls, 1); assert.equal(current.observer.read(), 3);
  app.actions.a(); assert.equal(current.calls, 1);
  app.actions.b(); assert.equal(current.calls, 2); app.dispose();
});

test('A.4 array item edits, length, structure, holes and custom keys are independent', () => {
  const rows = [{ id: 'a', n: 0 }, { id: 'b', n: 0 }]; rows.extra = 1;
  const app = fixture({ rows }, {
    edit: d => { d.rows[0].n++; }, reverse: d => { d.rows.reverse(); },
    insert: d => { d.rows.splice(1, 0, { id: 'c', n: 0 }); },
    hole: d => { delete d.rows[0]; }, fill: d => { d.rows[0] = undefined; },
    extra: d => { d.rows.extra++; }, shrink: d => { d.rows.length = 0; },
  });
  const first = watch(app, s => s.rows[0].n), second = watch(app, s => s.rows[1].n);
  const structure = watch(app, s => [...s.rows]), length = watch(app, s => s.rows.length);
  const keys = watch(app, s => Object.keys(s.rows)), own = watch(app, s => Object.hasOwn(s.rows, '0'));
  app.actions.edit(); assert.deepEqual([first.calls, second.calls, structure.calls, length.calls, keys.calls], [1, 0, 0, 0, 0]);
  first.observer.read();
  app.actions.reverse(); assert.deepEqual([first.calls, second.calls, structure.calls, length.calls, keys.calls], [2, 1, 1, 0, 0]);
  first.observer.read(); second.observer.read(); structure.observer.read();
  app.actions.insert(); assert.deepEqual([first.calls, second.calls, structure.calls, length.calls, keys.calls], [2, 2, 2, 1, 1]);
  first.observer.dispose(); second.observer.dispose(); structure.observer.read(); keys.observer.read();
  app.actions.extra(); assert.equal(structure.calls, 2); assert.equal(keys.calls, 1);
  app.actions.hole(); assert.equal(own.calls, 1); assert.equal(keys.calls, 2); assert.equal(length.calls, 1);
  structure.observer.read(); own.observer.read();
  app.actions.fill(); assert.equal(own.calls, 2); assert.equal(structure.calls, 4);
  length.observer.read(); app.actions.shrink(); assert.equal(length.calls, 2); app.dispose();
});

test('A.4 captured items follow stable IDs across reorders and detect detach', () => {
  const app = fixture({ rows: [{ n: 0 }, { n: 10 }] }, {
    move: d => { d.rows.reverse(); }, edit: d => { d.rows[1].n++; }, remove: d => { d.rows.pop(); },
  });
  let item;
  const selector = app.observe(s => { item = s.rows[0]; }); selector.dispose();
  const captured = watch(app, () => item.n);
  app.actions.move(); assert.equal(captured.calls, 0);
  app.actions.edit(); assert.equal(captured.calls, 1); assert.equal(captured.observer.read(), 1);
  app.actions.remove(); assert.equal(captured.calls, 2); assert.throws(() => captured.observer.read(), code('STATE_DETACHED'));
  app.dispose();
});

test('A.4 tracked state aliases and reflection work while mutation paths reject', () => {
  const item = { n: 0 }; const app = createApp({ initialState: { a: item, b: item, rows: [item] } });
  let tracked;
  const observer = app.observe(s => {
    tracked = s; assert.equal(s.a, s.b); assert.equal(s.a, s.rows[0]);
    assert.equal(Array.isArray(s.rows), true); assert.deepEqual(Reflect.ownKeys(s.rows), ['0', 'length']);
    assert.equal(Object.getOwnPropertyDescriptor(s.rows, 'length').value, 1);
    assert.equal(Object.getOwnPropertyDescriptor(s.a, 'n').value, 0);
    for (const mutate of [() => { s.a.n = 1; }, () => { delete s.a.n; },
      () => Object.defineProperty(s.a, 'x', { value: 1 }), () => Object.setPrototypeOf(s.a, null),
      () => Object.freeze(s.a), () => s.rows.push({ n: 1 }), () => { s.rows.length = 0; }])
      assert.throws(mutate, code('STATE_READONLY'));
    return s.a.n;
  });
  assert.ok(Object.isFrozen(app.state.a)); assert.notEqual(app.state, tracked);
  observer.dispose(); app.dispose(); assert.throws(() => tracked.a, code('SCOPE_DISPOSED'));
});

test('A.4 app.state reads inside evaluations track; saved snapshots remain historical', () => {
  const app = fixture({ nested: { n: 0 } }, { edit: d => { d.nested.n++; } });
  const before = app.state, snapshot = watch(app, () => before.nested.n);
  const tracked = watch(app, () => app.state.nested.n);
  app.actions.edit(); assert.equal(tracked.calls, 1); assert.equal(snapshot.calls, 0);
  assert.equal(before.nested.n, 0); assert.equal(tracked.observer.read(), 1); app.dispose();
});

test('A.4 observers see complete commits only; no-op and rollback produce no notifications', () => {
  const seen = [];
  const app = fixture({ a: 0, b: 0 }, {
    edit: d => { d.a++; d.b++; }, noop: () => {}, fail: d => { d.a++; throw Error('fail'); },
  });
  const observer = app.observe(s => s.a + s.b, () => { seen.push([app.state.a, app.state.b, app.stateVersion, observer.read()]); });
  app.actions.noop(); assert.throws(() => app.actions.fail(), /fail/); assert.deepEqual(seen, []);
  app.actions.edit(); app.actions.edit(); assert.deepEqual(seen, [[1, 1, 3, 2], [2, 2, 4, 4]]); app.dispose();
});

test('A.4 dirty observers notify once until refreshed, and all are dirty before callbacks run', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  const events = [];
  const first = app.observe(s => s.n, () => { events.push(second.observer.dirty); });
  const second = watch(app, s => s.n);
  app.actions.edit(); app.actions.edit(); assert.deepEqual(events, [true]); assert.equal(second.calls, 1);
  assert.equal(first.read(), 2); first.read(); app.actions.edit(); assert.deepEqual(events, [true, true]); app.dispose();
});

test('A.4 callback failures preserve commits, parent children, sibling notifications and next batches', () => {
  let calls = 0, reports = 0, app;
  const error = Error('notification');
  app = createApp({ initialState: { n: 0 }, onError(e, info) { reports++; assert.equal(e, error); assert.equal(info.phase, 'dispatch'); },
    schema: createActionSchema()(({ action }) => ({
      parent: action(d => { d.n++; app.actions.child(); }), child: action(d => { d.n++; }),
    })) });
  const bad = app.observe(s => s.n, () => { throw error; });
  app.observe(s => s.n, () => { calls++; });
  assert.throws(() => app.actions.parent(), e => e === error);
  assert.equal(app.state.n, 2); assert.equal(app.stateVersion, 3); assert.equal(calls, 1); assert.equal(reports, 1);
  bad.dispose(); app.actions.child(); assert.equal(app.state.n, 3); app.dispose();
});

test('A.4 read/notification dispatch and lifecycle reentrancy reject without state changes', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  const check = () => {
    assert.throws(() => app.actions.edit(), code('ACTION_REENTRANT'));
    assert.throws(() => app.dispose(), code('LIFECYCLE_REENTRANT'));
    assert.throws(() => app.mount(), code('LIFECYCLE_REENTRANT'));
  };
  app.observe(s => { check(); return s.n; }, check);
  app.actions.edit(); assert.equal(app.state.n, 1); app.dispose();
});

test('A.4 async reads/callbacks reject without executing thenables; failed registration leaves no subscriptions', async () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  let notifications = 0, thenCalls = 0;
  assert.throws(() => app.observe(s => { s.n; throw Error('read'); }, () => { notifications++; }), /read/);
  assert.throws(() => app.observe(async () => { throw Error('async'); }), code('REACTIVITY_ASYNC'));
  assert.throws(() => app.observe(() => ({ then() { thenCalls++; } })), code('REACTIVITY_ASYNC'));
  app.observe(s => s.n, () => Promise.reject(Error('notify')));
  assert.throws(() => app.actions.edit(), code('REACTIVITY_ASYNC'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 0); assert.equal(thenCalls, 0); assert.equal(app.state.n, 1); app.dispose();
});

test('A.4 disposal cancels callbacks already queued and is idempotent', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  let calls = 0;
  app.observe(s => s.n, () => later.dispose());
  const later = app.observe(s => s.n, () => { calls++; });
  app.actions.edit(); assert.equal(calls, 0); later.dispose();
  assert.throws(() => later.read(), code('SCOPE_DISPOSED')); app.dispose();
});

test('A.4 failed view scopes dispose observers automatically while application observers survive', () => {
  const target = fakeDocument().createElement(); let fail = true, context, calls = 0;
  const app = createApp({ initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({ edit: action(d => { d.n++; }) })),
    view(c) { context = c; c.observe(s => s.n, () => { calls++; }); if (fail) throw Error('view'); return 'once'; } });
  const outer = watch(app, s => s.n);
  assert.throws(() => app.mount(target), code('VIEW_FAILED'));
  assert.throws(() => context.observe(s => s.n), code('SCOPE_DISPOSED'));
  app.actions.edit(); assert.equal(calls, 0); assert.equal(outer.calls, 1);
  fail = false; app.mount(target); app.actions.edit(); assert.equal(calls, 1); assert.equal(target.textContent, 'once');
  app.dispose(); assert.throws(() => outer.observer.read(), code('SCOPE_DISPOSED'));
});

for (const read of [null, 1, {}, 'read']) test(`A.4 invalid observer read ${String(read)} rejects`, () => {
  const app = createApp(); assert.throws(() => app.observe(read), code('REACTIVITY_INVALID')); app.dispose();
});

test('A.4 custom array properties named like iterator methods remain ordinary exact fields', () => {
  const rows = [1, 2]; rows.values = 10;
  const app = fixture({ rows }, { move: d => { d.rows.reverse(); }, edit: d => { d.rows.values++; } });
  const custom = watch(app, s => s.rows.values);
  app.actions.move(); assert.equal(custom.calls, 0);
  app.actions.edit(); assert.equal(custom.calls, 1); assert.equal(custom.observer.read(), 11); app.dispose();
});

test('A.4 invalid observer callbacks reject at registration', () => {
  const app = createApp();
  for (const callback of [null, 1, {}, 'callback'])
    assert.throws(() => app.observe(() => 1, callback), code('REACTIVITY_INVALID'));
  app.dispose();
});

test('A.4/A.5 read and notification callbacks never receive an internal resource as this', () => {
  const app = fixture({ n: 0 }, { edit: d => { d.n++; } });
  let notifications = 0;
  const computed = app.computed(function(state) { assert.equal(this, undefined); return state.n; });
  const observer = app.observe(function(state) { assert.equal(this, undefined); return computed.value; }, function() {
    assert.equal(this, undefined); notifications++;
  });
  app.actions.edit(); assert.equal(notifications, 1); assert.equal(observer.read(), 1); app.dispose();
});
