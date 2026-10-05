import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const setup = view => {
  const browser = fakeBrowser();
  const app = createApp({ target: browser.target, initialState: { n: 0, show: true },
    schema: createActionSchema()(({ action }) => ({ increment: action(d => { d.n++; }), hide: action(d => { d.show = false; }) })),
    view: view ?? (({ bind }) => bind.n) });
  return { ...browser, app };
};
const empty = app => assert.ok(Object.values(resourceCounts(app)).every(value => value === 0));

test('B.4 immediate state commits precede deferred lanes; visual work precedes frame callbacks', () => {
  const order = [], { app, document, target, turn, idleTurn } = setup();
  app.schedule('idle', () => order.push('idle')); app.schedule('normal', () => order.push('normal'));
  app.schedule('frame', () => { order.push('frame:' + target.textContent); });
  app.schedule('immediate', () => { app.actions.increment(); order.push('immediate'); });
  assert.deepEqual(order, ['immediate']); assert.equal(app.state.n, 1); assert.equal(document.pendingFrames, 1);
  idleTurn(); assert.deepEqual(order, ['immediate']);
  document.flushFrame(); assert.deepEqual(order, ['immediate', 'frame:1']);
  turn(); idleTurn(); assert.deepEqual(order, ['immediate', 'frame:1', 'normal', 'idle']); app.dispose(); empty(app);
});

test('B.4 normal work makes progress without frames and consumes at most 32 FIFO callbacks per turn', () => {
  const order = [], { app, turn, document } = setup();
  for (let n = 0; n < 70; n++) app.schedule('normal', () => order.push(n));
  for (let n = 0; n < 100; n++) app.schedule('immediate', () => app.actions.increment());
  assert.equal(order.length, 0); assert.equal(document.pendingFrames, 1);
  turn(); assert.deepEqual(order, Array.from({ length: 32 }, (_, n) => n));
  app.actions.increment(); turn(); assert.equal(order.length, 64); turn(); assert.equal(order.length, 70);
  app.dispose(); empty(app);
});

test('B.4 reentrant normal work stays bounded and a queued sibling cannot be starved', () => {
  const order = [], { app, turn } = setup(); let calls = 0;
  const repeat = () => { calls++; if (calls < 100) app.schedule('normal', repeat); };
  app.schedule('normal', repeat); app.schedule('normal', () => order.push('sibling'));
  turn(); assert.equal(calls, 31); assert.deepEqual(order, ['sibling']); assert.equal(resourceCounts(app).normalTasks, 1);
  app.dispose(); empty(app);
});

test('B.4 idle budgets and deadline/fallback policy never block normal correctness', () => {
  const { app, idleTurn, turn, view } = setup(); let calls = 0;
  for (let n = 0; n < 12; n++) app.schedule('idle', () => calls++);
  idleTurn(0); assert.equal(calls, 0); idleTurn(0, true); assert.equal(calls, 8); idleTurn(); assert.equal(calls, 12);
  delete view.requestIdleCallback; app.schedule('idle', () => calls++); app.schedule('normal', () => app.actions.increment());
  turn(32); assert.equal(calls, 12); turn(); assert.equal(app.state.n, 1); turn(32); assert.equal(calls, 13); app.dispose(); empty(app);
});

test('B.4 explicit flush handles frame work only, and reentrant frame work waits for another frame', () => {
  const { app, document, turn } = setup(); const order = [];
  app.schedule('frame', () => { order.push('first'); app.schedule('frame', () => order.push('second')); });
  app.schedule('normal', () => order.push('normal')); app.actions.increment(); app.flush();
  assert.deepEqual(order, ['first']); assert.equal(document.pendingFrames, 1);
  document.flushFrame(); assert.deepEqual(order, ['first', 'second']); turn(); assert.deepEqual(order, ['first', 'second', 'normal']); app.dispose(); empty(app);
});

test('B.4 cancellation is idempotent, removes empty native drivers and guards stale callbacks', () => {
  const { app, document, timers, view } = setup(); let calls = 0, frame;
  const native = view.requestAnimationFrame;
  view.requestAnimationFrame = callback => { frame = callback; return native(callback); };
  const normal = app.schedule('normal', () => calls++), callback = [...timers.values()][0].callback;
  const visual = app.schedule('frame', () => calls++); normal(); normal(); visual(); visual();
  assert.equal(timers.size, 0); assert.equal(document.pendingFrames, 0); callback(); frame(); assert.equal(calls, 0); app.dispose(); empty(app);
});

test('B.4 scoped work cancels on unmount and app disposal clears every lane before hooks', () => {
  const { app, turn, idleTurn, document } = setup(({ bind, when }) => when(bind.show, context => {
    for (const lane of ['normal', 'idle', 'frame']) context.schedule(lane, () => { throw Error('disposed scope ran'); });
    return div('scope');
  }));
  app.actions.hide(); app.flush(); turn(); idleTurn(); document.flushFrame(); assert.equal(resourceCounts(app).scheduledWork, 0);
  for (const lane of ['normal', 'idle', 'frame']) app.schedule(lane, () => { throw Error('disposed app ran'); });
  app.onDispose(() => assert.equal(resourceCounts(app).scheduledWork, 0)); app.dispose(); empty(app);
});

test('B.4 admission errors, immediate recursion, render/action mutation guards and queue bound are explicit', () => {
  const { app, document } = setup();
  assert.throws(() => app.schedule('bad', () => {}), code('SCHEDULE_LANE_INVALID'));
  assert.throws(() => app.schedule('normal', null), code('SCHEDULE_CALLBACK_INVALID'));
  assert.throws(() => app.schedule('immediate', () => app.schedule('immediate', () => {})), code('SCHEDULE_REENTRANT'));
  app.schedule('frame', () => { assert.throws(app.actions.increment, code('ACTION_REENTRANT')); }); document.flushFrame();
  for (let n = 0; n < 1024; n++) app.schedule('normal', () => {});
  assert.throws(() => app.schedule('normal', () => {}), code('SCHEDULE_LIMIT')); app.dispose(); empty(app);
});

test('B.4 scheduled callbacks have no bound this and async returns reject independently', async () => {
  const { app, turn } = setup(); app.schedule('normal', function () { assert.equal(this, undefined); }); turn();
  app.schedule('normal', async () => { throw Error('illegal async work'); });
  assert.throws(turn, code('SCHEDULE_ASYNC')); await new Promise(resolve => setImmediate(resolve)); app.dispose(); empty(app);
});

test('B.4 failed callbacks are consumed, healthy work runs, errors report once and later turns still progress', () => {
  const browser = fakeBrowser(), phases = [], app = createApp({ target: browser.target, onError(error, { phase }) { phases.push(phase); } });
  let calls = 0; app.schedule('normal', () => { throw Error('scheduled failure'); }); app.schedule('normal', () => calls++);
  assert.throws(browser.turn, /scheduled failure/); assert.equal(calls, 1); assert.deepEqual(phases, ['schedule']);
  app.schedule('normal', () => calls++); browser.turn(); assert.equal(calls, 2); app.dispose(); empty(app);
});

test('B.4 native cancellation failures still invalidate drivers and attempt every lane on disposal', () => {
  const { app, view, timers, idle } = setup(); let calls = 0, cancels = 0;
  app.schedule('normal', () => calls++); app.schedule('idle', () => calls++);
  const timer = [...timers.values()][0].callback, idleCallback = [...idle.values()][0];
  view.clearTimeout = () => { cancels++; throw Error('timer cancel'); };
  view.cancelIdleCallback = () => { cancels++; throw Error('idle cancel'); };
  assert.throws(app.dispose, AggregateError); assert.equal(cancels, 2); empty(app);
  timer(); idleCallback({ timeRemaining: () => 10 }); assert.equal(calls, 0);
});

test('B.4 completed context tasks release pending work and frame failures are consumed with render phase', () => {
  const browser = fakeBrowser(), phases = []; let context, calls = 0;
  const app = createApp({ target: browser.target, view(c) { context = c; return ''; },
    onError(error, { phase }) { phases.push(phase); } });
  for (let turn = 0; turn < 40; turn++) {
    for (let n = 0; n < 32; n++) context.schedule('normal', () => { calls++; });
    browser.turn(); assert.equal(resourceCounts(app).normalTasks, 0);
  }
  assert.equal(calls, 1280);
  context.schedule('frame', () => { throw Error('frame work'); });
  context.schedule('frame', () => { calls++; });
  assert.throws(app.flush, /frame work/); assert.equal(calls, 1281); assert.deepEqual(phases, ['render']);
  app.flush(); assert.equal(phases.length, 1); app.dispose(); empty(app);
});
