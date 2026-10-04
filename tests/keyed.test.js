import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, keyed, div, span, input, when } from '../src/index.js';
import { fakeDocument } from './helpers/fake-dom.js';
const code = expected => error => error.code === expected;
const setup = (view, initialState = { rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, actions = {}) => {
  const document = fakeDocument(), target = document.createElement();
  const app = createApp({ target, initialState, schema: createActionSchema()(({ action }) =>
    Object.fromEntries(Object.entries(actions).map(([name, run]) => [name, action(run)]))), view });
  return { app, target, document };
};
const elements = node => node.childNodes.filter(child => child.nodeType === 1);
const defaultView = ({ bind, keyed }) => div(keyed(bind.rows, row => row.id, ({ item, index }) => span(index, ':', item.name)));

test('A.8 keyed reorder/insert/remove preserve nodes and update scoped indices', () => {
  const { app, target } = setup(defaultView, undefined, {
    reverse: d => { d.rows.reverse(); }, add: d => { d.rows.splice(1, 0, { id: 'c', name: 'C' }); }, remove: d => { d.rows.splice(0, 1); },
  });
  const parent = target.childNodes[0], [a, b] = elements(parent);
  app.actions.reverse(); app.flush(); assert.deepEqual(elements(parent), [b, a]); assert.equal(parent.textContent, '0:B1:A');
  app.actions.add(); app.flush(); const c = elements(parent)[1]; assert.deepEqual(elements(parent), [b, c, a]); assert.equal(parent.textContent, '0:B1:C2:A');
  app.actions.remove(); app.flush(); assert.deepEqual(elements(parent), [c, a]); assert.equal(parent.textContent, '0:C1:A'); app.dispose();
});

test('A.8 editing a non-key field reruns only its leaf binding, not list keys or unrelated items', () => {
  let keys = 0, factories = 0; const reads = { a: 0, b: 0 };
  const { app, target } = setup(({ bind, keyed }) => div(keyed(bind.rows, row => { keys++; return row.id; }, ctx => {
    factories++; return span(ctx.derive(() => { reads[ctx.key]++; return ctx.value.name; }));
  })), undefined, { edit: d => { d.rows[0].name = 'AA'; } });
  const before = elements(target.childNodes[0]); app.actions.edit(); app.flush();
  assert.equal(keys, 2); assert.equal(factories, 2); assert.deepEqual(reads, { a: 2, b: 1 });
  assert.deepEqual(elements(target.childNodes[0]), before); assert.equal(target.textContent, 'AAB'); app.dispose();
});

test('A.8 same-key replacement retargets item values/computed/observer resources even if old item remains aliased', () => {
  const shared = { id: 'a', name: 'A' }; let ctx, notifications = 0;
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, context => {
    ctx = context; const name = context.computed(() => context.value.name.toLowerCase());
    context.observe(() => context.value.name, () => { notifications++; });
    return span(context.item.name, context.derive(() => name.value));
  }), { rows: [shared], alias: shared }, { replace: d => { d.rows[0] = { id: 'a', name: 'New' }; }, old: d => { d.alias.name = 'unused'; } });
  const node = elements(target)[0]; app.actions.replace(); app.flush();
  assert.equal(elements(target)[0], node); assert.equal(target.textContent, 'Newnew'); assert.equal(ctx.value.name, 'New'); assert.equal(notifications, 1);
  app.actions.old(); app.flush(); assert.equal(target.textContent, 'Newnew'); assert.equal(notifications, 1); app.dispose();
});

test('A.8 removed item scopes dispose computed, observers, cleanup and captured tokens', () => {
  let ctx, computed, observer, cleanup = 0;
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, context => {
    ctx = context; context.onDispose(() => { cleanup++; });
    computed = context.computed(() => context.value.name); observer = context.observe(() => context.value.name);
    return span(context.item.name);
  }), { rows: [{ id: 'a', name: 'A' }] }, { remove: d => { d.rows.length = 0; } });
  app.actions.remove(); app.flush(); assert.equal(cleanup, 1); assert.equal(target.textContent, '');
  for (const read of [() => ctx.value, () => ctx.position, () => ctx.item.name, () => computed.value, () => observer.read()])
    assert.throws(read, code('SCOPE_DISPOSED'));
  app.dispose(); assert.equal(cleanup, 1); assert.equal(target.childNodes.length, 0);
});

test('A.8 primitives, empty rows and same textual string/number keys are supported', () => {
  const { app, target } = setup(({ bind }) => keyed(bind.rows, row => row, ({ item, index }) => [index, ':', item, ';']),
    { rows: [1, '1', ''] }, { clear: d => { d.rows = []; }, fill: d => { d.rows = ['x']; } });
  assert.equal(target.textContent, '0:1;1:1;2:;'); app.actions.clear(); app.flush(); assert.equal(target.textContent, '');
  app.actions.fill(); app.flush(); assert.equal(target.textContent, '0:x;'); app.dispose();
});

test('A.8 key changes replace that scope while preserved keys keep node identity', () => {
  let cleanup = 0;
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, ({ item, onDispose }) => {
    onDispose(() => { cleanup++; }); return span(item.name);
  }), undefined, { change: d => { d.rows[0].id = 'new'; } });
  const [a, b] = elements(target); app.actions.change(); app.flush(); const next = elements(target);
  assert.notEqual(next[0], a); assert.equal(next[1], b); assert.equal(cleanup, 1); app.dispose(); assert.equal(cleanup, 3);
});

test('A.8 pre-frame reorders coalesce and rolled-back/no-op actions do not rebuild', () => {
  let factories = 0, keys = 0;
  const { app, target, document } = setup(({ bind, keyed }) => keyed(bind.rows, row => { keys++; return row.id; }, ({ item }) => { factories++; return span(item.name); }),
    undefined, { reverse: d => { d.rows.reverse(); }, fail: d => { d.rows.reverse(); throw Error('rollback'); }, noop: () => {} });
  const before = elements(target); app.actions.reverse(); app.actions.reverse(); assert.equal(document.pendingFrames, 1); document.flushFrame();
  assert.deepEqual(elements(target), before); assert.equal(factories, 2); assert.equal(keys, 4);
  app.actions.noop(); assert.throws(app.actions.fail, /rollback/); assert.equal(document.pendingFrames, 0); app.dispose();
});

test('A.8 validates complete key sets before constructing or changing item views', () => {
  let factories = 0;
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, ({ item }) => { factories++; return span(item.name); }),
    undefined, { duplicate: d => { d.rows.push({ id: 'a', name: 'bad' }); }, repair: d => { d.rows.pop(); } });
  const before = elements(target); app.actions.duplicate(); assert.throws(app.flush, code('LIST_KEY_DUPLICATE'));
  assert.equal(factories, 2); assert.deepEqual(elements(target), before); app.actions.repair(); app.flush(); assert.equal(factories, 2); app.dispose();
});

test('A.8 staged new item factories clean failures and retain the existing list for retry', () => {
  let bad = true, cleaned = 0;
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, ({ item, key, onDispose }) => {
    onDispose(() => { cleaned++; }); if (key === 'd' && bad) throw Error('new row failed'); return span(item.name);
  }), undefined, { add: d => { d.rows.push({ id: 'c', name: 'C' }, { id: 'd', name: 'D' }); } });
  const before = elements(target); app.actions.add(); assert.throws(app.flush, /new row failed/);
  assert.deepEqual(elements(target), before); assert.equal(cleaned, 2); bad = false; app.flush(); assert.equal(target.textContent, 'ABCD');
  assert.deepEqual(elements(target).slice(0, 2), before); app.dispose(); assert.equal(cleaned, 6);
});

test('A.8 nested conditions and nested keyed lists are owned by item scopes', () => {
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, ({ item, when, keyed }) =>
    div(when(item.show, () => keyed(item.children, child => child.id, ({ item }) => span(item.name))))),
    { rows: [{ id: 'a', show: true, children: [{ id: 1, name: 'one' }] }] }, {
      edit: d => { d.rows[0].children[0].name = 'changed'; }, hide: d => { d.rows[0].show = false; },
    });
  app.actions.edit(); app.flush(); assert.equal(target.textContent, 'changed'); app.actions.hide(); app.flush(); assert.equal(target.textContent, ''); app.dispose();
});

for (const [name, rows, key, error] of [
  ['missing', [{}], row => row.id, 'LIST_KEY_MISSING'], ['null', [null], row => row, 'LIST_KEY_MISSING'],
  ['object', [{}], row => row, 'LIST_KEY_INVALID'], ['boolean', [true], row => row, 'LIST_KEY_INVALID'],
  ['zero', [0, -0], row => row, 'LIST_KEY_DUPLICATE'], ['holes', new Array(1), () => 'a', 'LIST_ITEM_MISSING'],
  ['non-array', {}, () => 'a', 'LIST_SOURCE_INVALID'],
]) test(`A.8 ${name} diagnostics clean a failed mount`, () => {
  const app = createApp({ initialState: { rows }, view: ({ bind }) => keyed(bind.rows, key, () => span('row')) });
  const target = fakeDocument().createElement(); assert.throws(() => app.mount(target), code(error)); assert.equal(target.childNodes.length, 0); app.dispose();
});

test('A.8 key reads and item factories forbid state mutation, dispatch and async results', async () => {
  for (const [key, view, error] of [
    [row => { row.id = 'mutated'; return row.id; }, () => '', 'STATE_READONLY'],
    [() => Promise.resolve('a'), () => '', 'REACTIVITY_ASYNC'],
    [row => row.id, async () => '', 'VIEW_RESULT_INVALID'],
    [row => row.id, ({ dispatch }) => { dispatch('noop'); return ''; }, 'ACTION_REENTRANT'],
  ]) {
    const app = createApp({ initialState: { rows: [{ id: 'a' }] }, schema: createActionSchema()(({ action }) => ({ noop: action(() => {}) })),
      view: ({ bind }) => keyed(bind.rows, key, view) });
    const target = fakeDocument().createElement(); assert.throws(() => app.mount(target), code(error)); assert.equal(target.childNodes.length, 0); app.dispose();
  }
  await new Promise(resolve => setImmediate(resolve));
});

test('A.8 keyed argument validation rejects snapshots/functions instead of bindings', () => {
  assert.throws(() => keyed([], row => row.id, () => ''), code('LIST_INVALID'));
  const app = createApp({ initialState: { rows: [] } });
  assert.throws(() => keyed(app.bind.rows, 'id', () => ''), code('LIST_INVALID'));
  assert.throws(() => keyed(app.bind.rows, () => 'id', 'view'), code('LIST_INVALID')); app.dispose();
});

test('A.8 native placement failure disposes candidate scopes and allows a clean retry', () => {
  let cleaned = 0;
  const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, ({ item, onDispose }) => {
    onDispose(() => { cleaned++; }); return span(item.name);
  }), undefined, { add: d => { d.rows.push({ id: 'c', name: 'C' }); } });
  const original = target.insertBefore.bind(target); let bad = true;
  target.insertBefore = (node, anchor) => { if (bad && node.nodeType === 1 && node.textContent === 'C') throw Error('placement failed'); return original(node, anchor); };
  app.actions.add(); assert.throws(app.flush, /placement failed/); assert.equal(target.textContent, 'AB'); assert.equal(cleaned, 1);
  bad = false; app.flush(); assert.equal(target.textContent, 'ABC'); app.dispose(); assert.equal(cleaned, 4);
});

test('A.8 derived filters preserve item identity and update membership', () => {
  const { app, target } = setup(({ derive, keyed }) => keyed(derive(s => s.rows.filter(row => row.name !== 'hidden')), row => row.id, ({ item }) => span(item.name)),
    undefined, { hide: d => { d.rows[0].name = 'hidden'; }, show: d => { d.rows[0].name = 'again'; } });
  const b = elements(target)[1]; app.actions.hide(); app.flush(); assert.deepEqual(elements(target), [b]);
  app.actions.show(); app.flush(); assert.equal(elements(target)[1], b); assert.equal(target.textContent, 'againB'); app.dispose();
});
