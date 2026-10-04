import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, span, button, input } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeDocument } from './helpers/fake-dom.js';
const code = expected => error => error.code === expected;
const elements = node => node.childNodes.filter(child => child.nodeType === 1);
const setup = (view, extra = {}) => {
  const document = fakeDocument(), target = document.createElement();
  const app = createApp({ target, initialState: { n: 0, show: true, rows: [{ id: 'a', name: 'A' }] },
    schema: createActionSchema()(({ action }) => ({
      increment: action(d => { d.n++; }), toggle: action(d => { d.show = !d.show; }),
      fail: action(d => { d.n++; throw Error('action failed'); }),
      replace: action(d => { d.rows[0] = { id: 'a', name: 'new' }; }),
    })), view, ...extra });
  return { document, target, app };
};
const zero = app => assert.ok(Object.values(resourceCounts(app)).every(value => value === 0), JSON.stringify(resourceCounts(app)));

test('A.9 direct action wrappers receive zero arguments and clicks queue only dependent visual work', () => {
  let reads = 0;
  const { app, document, target } = setup(({ actions, bind, derive }) => div(button({ type: 'button', onClick: actions.increment }, span('Go')), bind.n,
    derive(s => { reads++; return s.rows[0].name; })));
  const node = target.childNodes[0]; elements(node)[0].childNodes[0].click();
  assert.equal(app.state.n, 1); assert.equal(app.stateVersion, 2); assert.equal(node.textContent, 'Go0A');
  assert.equal(document.pendingFrames, 1); document.flushFrame(); assert.equal(node.textContent, 'Go1A'); assert.equal(reads, 1);
  assert.equal(resourceCounts(app).handlers, 1); assert.equal(resourceCounts(app).listeners, 1); app.dispose(); zero(app);
});

test('A.9 delegation invokes live child-to-parent handlers without preventing native defaults', () => {
  const order = []; const { app, target } = setup(() => div({ onClick: () => order.push('parent') }, button({ onClick: () => order.push('child') }, 'Go')));
  const event = { type: 'click', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  elements(target.childNodes[0])[0].dispatchEvent(event); assert.deepEqual(order, ['child', 'parent']); assert.equal(event.defaultPrevented, false);
  assert.equal(resourceCounts(app).listeners, 1); app.dispose(); zero(app);
});

test('A.9 null/undefined click props register no listener and foreign host clicks are ignored', () => {
  const { app, target } = setup(() => div(button({ onClick: null }, 'A'), button({ onClick: undefined }, 'B')));
  assert.equal(resourceCounts(app).listeners, 0); const foreign = target.ownerDocument.createElement('button'); target.appendChild(foreign); foreign.click();
  app.dispose(); assert.equal(target.childNodes[0], foreign); zero(app);
});

test('A.9 removed conditional handlers are unregistered, stale nodes cannot act, and remount adds one delegate', () => {
  const { app, target } = setup(({ actions, bind, when }) => when(bind.show, () => button({ onClick: actions.increment }, 'Go')));
  const old = elements(target)[0]; app.actions.toggle(); app.flush(); assert.equal(resourceCounts(app).handlers, 0); assert.equal(resourceCounts(app).listeners, 0);
  target.appendChild(old); old.click(); assert.equal(app.state.n, 0); target.removeChild(old);
  app.actions.toggle(); app.flush(); assert.equal(resourceCounts(app).handlers, 1); assert.equal(resourceCounts(app).listeners, 1);
  elements(target)[0].click(); assert.equal(app.state.n, 1); app.dispose(); zero(app);
});

test('A.9 same-key replacement handlers read current item rather than obsolete factory captures', () => {
  const names = []; const { app, target } = setup(({ bind, keyed }) => keyed(bind.rows, row => row.id, context =>
    button({ onClick: () => names.push(context.value.name) }, context.item.name)));
  const node = elements(target)[0]; app.actions.replace(); app.flush(); assert.equal(elements(target)[0], node); node.click(); assert.deepEqual(names, ['new']); app.dispose(); zero(app);
});

test('A.9 events after application disposal cannot dispatch even when old nodes are reattached', () => {
  const { app, target } = setup(({ actions }) => button({ onClick: actions.increment }, 'Go'));
  const node = elements(target)[0]; app.dispose(); target.appendChild(node); assert.doesNotThrow(() => node.click()); zero(app);
});

test('A.9 a handler may dispose its app; later handlers on that click path are skipped', () => {
  let app, parent = 0; const target = fakeDocument().createElement();
  app = createApp({ target, view: () => div({ onClick: () => { parent++; } }, button({ onClick: () => app.dispose() }, 'Close')) });
  elements(target.childNodes[0])[0].click(); assert.equal(app.status, 'disposed'); assert.equal(parent, 0); zero(app);
});

test('A.9 a handler can explicitly flush removal before an ancestor handler runs', () => {
  let app, parent = 0; const target = fakeDocument().createElement();
  app = createApp({ target, initialState: { show: true }, schema: createActionSchema()(({ action }) => ({ hide: action(d => { d.show = false; }) })),
    view: ({ bind, when }) => when(bind.show, () => div({ onClick: () => { parent++; } }, button({ onClick: () => { app.actions.hide(); app.flush(); } }, 'Hide'))) });
  elements(elements(target)[0])[0].click(); assert.equal(parent, 0); assert.equal(resourceCounts(app).handlers, 0); app.dispose(); zero(app);
});

test('A.9 action failures in clicks roll back and report once at the event boundary', () => {
  const phases = []; const { app, target } = setup(({ actions, bind }) => div(button({ onClick: actions.fail }, 'Fail'), bind.n),
    { onError(error, { phase }) { phases.push(phase); assert.equal(error.message, 'action failed'); } });
  assert.throws(() => elements(target.childNodes[0])[0].click(), /action failed/);
  assert.equal(app.state.n, 0); assert.equal(app.stateVersion, 1); assert.deepEqual(phases, ['event']); app.dispose(); zero(app);
});

test('A.9 click handler failures aggregate after healthy parent handlers commit', () => {
  let reports = 0; const { app, target } = setup(({ actions }) => div({ onClick: () => { actions.increment(); throw Error('parent'); } },
    button({ onClick: () => { throw Error('child'); } }, 'Go')), { onError(error, { phase }) { assert.equal(phase, 'event'); assert.equal(error.errors.length, 2); reports++; } });
  assert.throws(() => elements(target.childNodes[0])[0].click(), error => error instanceof AggregateError && error.errors[0].message === 'child');
  assert.equal(app.state.n, 1); assert.equal(reports, 1); app.dispose(); zero(app);
});

test('A.9 recursive click invocation is rejected without recursively reporting errors', () => {
  let app, node, reports = 0; const target = fakeDocument().createElement();
  app = createApp({ target, view: () => button({ onClick: () => node.click() }, 'Recursive'), onError() { reports++; } });
  node = elements(target)[0]; assert.throws(() => node.click(), code('EVENT_REENTRANT')); assert.equal(reports, 1); app.dispose(); zero(app);
});

test('A.9 error hooks reject dispatch and preserve both handler/hook errors', () => {
  let app; const target = fakeDocument().createElement();
  app = createApp({ target, schema: createActionSchema()(({ action }) => ({ noop: action(() => {}) })),
    view: () => button({ onClick: () => { throw Error('handler'); } }, 'Go'), onError() { app.actions.noop(); } });
  assert.throws(() => elements(target)[0].click(), error => error instanceof AggregateError && error.errors[1].code === 'ACTION_REENTRANT'); app.dispose(); zero(app);
});

test('A.9 Promise/thenable handlers reject without unhandled native rejections or thenable execution', async () => {
  let called = 0;
  for (const handler of [async () => { throw Error('async handler'); }, () => ({ then() { called++; } })]) {
    const { app, target } = setup(() => button({ onClick: handler }, 'Go'));
    assert.throws(() => elements(target)[0].click(), code('EVENT_ASYNC')); app.dispose(); zero(app);
  }
  await new Promise(resolve => setImmediate(resolve)); assert.equal(called, 0);
});

test('A.9 invalid handlers and later failed mounts release delegates/scopes and allow retry', () => {
  for (const handler of ['bad', 1, false, {}]) {
    const app = createApp({ view: () => button({ onClick: handler }, 'Go') });
    assert.throws(() => app.mount(fakeDocument().createElement()), code('EVENT_HANDLER_INVALID')); zero(app); app.dispose();
  }
  let bad = true; const target = fakeDocument().createElement();
  const app = createApp({ view: () => div(button({ onClick() {} }, 'Go'), span({ title: bad ? {} : 'valid' })) });
  assert.throws(() => app.mount(target)); zero(app); assert.equal(target.listeners.get('click').size, 0);
  bad = false; app.mount(target); assert.equal(resourceCounts(app).handlers, 1); app.dispose(); zero(app);
});

test('A.9 repeated scoped remount/disposal restores exact resource counts without growing handlers', () => {
  for (let cycle = 0; cycle < 20; cycle++) {
    const { app, target, document } = setup(({ actions, bind, when, keyed }) => div(button({ onClick: actions.toggle }, 'Toggle'),
      when(bind.show, () => keyed(bind.rows, row => row.id, context => {
        const doubled = context.computed(() => context.value.name + context.value.name);
        context.observe(() => context.value.name); return button({ onClick: actions.increment }, context.derive(() => doubled.value), context.index);
      }))));
    const initial = resourceCounts(app);
    for (let step = 0; step < 10; step++) {
      elements(target.childNodes[0])[0].click(); app.flush(); assert.equal(resourceCounts(app).handlers, 1);
      elements(target.childNodes[0])[0].click(); app.flush(); assert.deepEqual(resourceCounts(app), initial);
    }
    app.actions.increment(); app.dispose(); assert.equal(document.pendingFrames, 0); zero(app);
  }
});

test('A.9 delegate/cancellation failures still dispose all scopes and run user hooks', () => {
  let cleaned = 0; const { app, target, document } = setup(({ actions, bind, onDispose }) => {
    onDispose(() => { cleaned++; }); return div(button({ onClick: actions.increment }, 'Go'), bind.n);
  });
  target.removeEventListener = () => { throw Error('listener removal'); };
  document.defaultView.cancelAnimationFrame = () => { throw Error('frame cancellation'); };
  app.actions.increment(); assert.throws(app.dispose, error => error instanceof AggregateError && error.errors.length === 2);
  assert.equal(app.status, 'disposed'); assert.equal(cleaned, 1); assert.equal(target.childNodes.length, 0);
  document.flushFrame(); zero(app);
});
