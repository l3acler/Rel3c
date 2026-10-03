import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, span, input } from '../src/index.js';
import { fakeDocument } from './helpers/fake-dom.js';
const setup = (view, extra = {}) => {
  const document = fakeDocument(), target = document.createElement('main');
  const app = createApp({ target, initialState: { n: 0, show: true, other: 0 },
    schema: createActionSchema()(({ action }) => ({
      increment: action(d => { d.n++; }), revert: action(d => { d.n = 0; }),
      other: action(d => { d.other++; }), hide: action(d => { d.show = false; }),
      show: action(d => { d.show = true; }), noop: action(() => {}),
      fail: action(d => { d.n++; throw Error('rollback'); }),
    })), view, ...extra });
  return { document, target, app };
};
function spyValue(object, name) {
  let value = object[name], writes = 0;
  Object.defineProperty(object, name, { configurable: true, get: () => value, set(next) { writes++; value = next; } });
  return () => writes;
}
const code = name => error => error.code === name;

test('A.7 bursts evaluate once per binding and write only the latest committed value', () => {
  let reads = 0, unrelated = 0;
  const { app, document, target } = setup(({ derive }) => div(
    span(derive(s => { reads++; return s.n; })), span(derive(s => { unrelated++; return s.other; }))));
  const [left, right] = target.childNodes[0].childNodes;
  const writes = spyValue(left.childNodes[0], 'data'), otherWrites = spyValue(right.childNodes[0], 'data');
  for (let i = 0; i < 5; i++) app.actions.increment();
  assert.equal(app.state.n, 5); assert.equal(app.stateVersion, 6); assert.equal(left.textContent, '0');
  assert.equal(document.pendingFrames, 1); assert.equal(reads, 1);
  document.flushFrame(); assert.equal(left.textContent, '5'); assert.equal(writes(), 1);
  assert.equal(reads, 2); assert.equal(unrelated, 1); assert.equal(otherWrites(), 0); assert.equal(document.pendingFrames, 0);
  app.dispose();
});

test('A.7 explicit flush is detachable, cancels frames and prevents late callback duplicate writes', () => {
  const { app, target, document } = setup(({ bind }) => bind.n);
  const original = document.defaultView.requestAnimationFrame;
  let callback; document.defaultView.requestAnimationFrame = fn => { callback = fn; return original(fn); };
  const writes = spyValue(target.childNodes[0], 'data'); app.actions.increment();
  const flush = app.flush; assert.equal(flush(), undefined); assert.equal(target.textContent, '1');
  assert.equal(document.pendingFrames, 0); callback(); document.flushFrame(); flush();
  assert.equal(writes(), 1); app.actions.increment(); flush(); assert.equal(writes(), 2); app.dispose();
});

test('A.7 reverted and equivalent normalized text/class/style values produce zero writes', () => {
  const { app, target, document } = setup(({ derive, bind }) => div({
    class: derive(s => ({ even: s.n % 2 === 0 })), style: derive(s => ({ color: s.n % 2 === 0 ? 'red' : 'blue' })),
  }, bind.n, derive(s => s.n % 2)));
  const node = target.childNodes[0]; let attrs = 0;
  const set = node.setAttribute.bind(node); node.setAttribute = (...args) => { attrs++; set(...args); };
  const styleWrites = spyValue(node.style, 'cssText'), direct = spyValue(node.childNodes[0], 'data'), derived = spyValue(node.childNodes[1], 'data');
  app.actions.increment(); app.actions.revert(); document.flushFrame();
  assert.equal(direct(), 0); assert.equal(derived(), 0); assert.equal(attrs, 0); assert.equal(styleWrites(), 0);
  app.actions.increment(); app.actions.increment(); document.flushFrame();
  assert.equal(direct(), 1); assert.equal(derived(), 0); assert.equal(attrs, 0); assert.equal(styleWrites(), 0); app.dispose();
});

test('A.7 unchanged form values avoid setters even after unrelated dependent input changes', () => {
  const { app, target, document } = setup(({ derive }) => input({ value: derive(s => String(s.n % 2)) }));
  const writes = spyValue(target.childNodes[0], 'value'); app.actions.increment(); app.actions.increment(); document.flushFrame();
  assert.equal(writes(), 0); app.dispose();
});

test('A.7 attributes add/remove once for a committed burst', () => {
  const { app, target, document } = setup(({ derive }) => div({ title: derive(s => s.n ? null : 'zero'), 'data-n': derive(s => s.n) }));
  const node = target.childNodes[0]; let sets = 0, removes = 0;
  const set = node.setAttribute.bind(node), remove = node.removeAttribute.bind(node);
  node.setAttribute = (...args) => { sets++; set(...args); }; node.removeAttribute = (...args) => { removes++; remove(...args); };
  app.actions.increment(); app.actions.increment(); document.flushFrame(); assert.equal(sets, 1); assert.equal(removes, 1);
  assert.equal(node.getAttribute('data-n'), '2'); app.dispose();
});

test('A.7 disposed app cancels queued reads and writes, including a stale frame callback', () => {
  let reads = 0;
  const { app, target, document } = setup(({ derive }) => derive(s => { reads++; return s.n; }));
  let callback; const request = document.defaultView.requestAnimationFrame;
  document.defaultView.requestAnimationFrame = fn => { callback = fn; return request(fn); };
  const writes = spyValue(target.childNodes[0], 'data'); app.actions.increment(); app.dispose();
  assert.equal(document.pendingFrames, 0); callback(); document.flushFrame(); assert.equal(reads, 1); assert.equal(writes(), 0);
  assert.equal(target.childNodes.length, 0); assert.throws(app.flush, code('APP_DISPOSED'));
});

test('A.7 structural parents dispose dirty descendants before evaluating their queued work', () => {
  let reads = 0, cleanups = 0;
  const { app, document, target } = setup(({ bind, when }) => when(bind.show, ({ derive, onDispose }) => {
    onDispose(() => { cleanups++; }); return div(derive(s => { reads++; return s.n; }));
  }, () => 'hidden'));
  const old = target.childNodes[1]; const writes = spyValue(old.childNodes[0], 'data');
  app.actions.increment(); app.actions.hide(); document.flushFrame(); assert.equal(reads, 1); assert.equal(writes(), 0);
  assert.equal(cleanups, 1); assert.equal(target.textContent, 'hidden'); app.dispose();
});

test('A.7 branch toggles coalesce without reconstructing a retained final branch', () => {
  let factories = 0;
  const { app, document, target } = setup(({ bind, when }) => when(bind.show, () => { factories++; return div('visible'); }));
  const node = target.childNodes[1]; app.actions.hide(); app.actions.show(); document.flushFrame();
  assert.equal(factories, 1); assert.equal(target.childNodes[1], node); app.dispose();
});

test('A.7 new branch initial bindings consume latest state once', () => {
  let reads = 0;
  const { app, document, target } = setup(({ bind, when }) => when(bind.show, () => 'visible', ({ derive }) => derive(s => { reads++; return s.n; })));
  app.actions.hide(); app.actions.increment(); app.actions.increment(); document.flushFrame();
  assert.equal(reads, 1); assert.equal(target.textContent, '2'); assert.equal(document.pendingFrames, 0); app.dispose();
});

test('A.7 no-ops and rolled-back actions do not schedule work', () => {
  const { app, document, target } = setup(({ bind }) => bind.n);
  app.actions.noop(); assert.throws(app.actions.fail, /rollback/); assert.equal(document.pendingFrames, 0);
  assert.equal(target.textContent, '0'); app.dispose();
});

test('A.7 separate applications independently schedule and flush their own work', () => {
  const a = setup(({ bind }) => bind.n), b = setup(({ bind }) => bind.n);
  a.app.actions.increment(); b.app.actions.increment(); a.app.flush();
  assert.equal(a.target.textContent, '1'); assert.equal(b.target.textContent, '0'); assert.equal(b.document.pendingFrames, 1);
  b.document.flushFrame(); assert.equal(b.target.textContent, '1'); a.app.dispose(); b.app.dispose();
});

test('A.7 explicit flush supports headless creation and DOM environments without animation frames', () => {
  const app = createApp(); app.flush(); app.dispose();
  const document = fakeDocument(); delete document.defaultView.requestAnimationFrame;
  const target = document.createElement();
  const { app: mounted } = setup(({ bind }) => bind.n, { target });
  mounted.actions.increment(); assert.equal(target.textContent, '0');
  mounted.flush(); assert.equal(target.textContent, '1'); assert.equal(document.pendingFrames, 0); mounted.dispose();
});

test('A.7 failing bindings preserve commits, report render errors and permit explicit/next-commit retries', () => {
  const failure = Error('render failure'); let bad = true, reports = 0;
  const { app, document, target } = setup(({ derive }) => div(derive(s => { const n = s.n; if (n && bad) throw failure; return n; }), derive(s => s.n)),
    { onError(error, info) { assert.equal(error, failure); assert.equal(info.phase, 'render'); reports++; } });
  app.actions.increment(); assert.equal(reports, 0); assert.throws(app.flush, error => error === failure);
  assert.equal(app.state.n, 1); assert.equal(target.textContent, '01'); assert.equal(reports, 1); assert.equal(document.pendingFrames, 0);
  assert.throws(app.flush, error => error === failure); assert.equal(reports, 2);
  bad = false; app.actions.noop(); assert.equal(document.pendingFrames, 1); document.flushFrame();
  assert.equal(target.textContent, '11'); app.dispose();
});

test('A.7 frame callback failures report once and do not spin in failing frames', () => {
  let reports = 0;
  const { app, document } = setup(({ derive }) => derive(s => { if (s.n) throw Error('frame'); return 0; }),
    { onError(error, { phase }) { assert.equal(error.message, 'frame'); assert.equal(phase, 'render'); reports++; } });
  app.actions.increment(); assert.throws(() => document.flushFrame(), /frame/);
  assert.equal(reports, 1); assert.equal(document.pendingFrames, 0); app.dispose();
});

test('A.7 several binding errors aggregate while healthy bindings still render', () => {
  const { app, target } = setup(({ derive }) => div(...['first', 'second'].map(message => derive(s => { if (s.n) throw Error(message); return 0; })), derive(s => s.n)));
  app.actions.increment(); assert.throws(app.flush, error => error instanceof AggregateError && error.errors.length === 2);
  assert.equal(target.textContent, '001'); assert.equal(app.state.n, 1); app.dispose();
});

test('A.7 failed conditional construction keeps the old branch and retries without leaks', () => {
  let bad = true, cleanup = 0;
  const { app, target } = setup(({ bind, when }) => when(bind.show, () => div('old'), ({ onDispose }) => {
    onDispose(() => { cleanup++; }); if (bad) throw Error('branch failed'); return div('new');
  }));
  const old = target.childNodes[1]; app.actions.hide(); assert.throws(app.flush, /branch failed/);
  assert.equal(target.childNodes[1], old); assert.equal(cleanup, 1); bad = false; app.flush();
  assert.equal(target.textContent, 'new'); app.dispose(); assert.equal(cleanup, 2);
});

test('A.7 flush rejects reentry from actions, reads, notifications, branch factories and error hooks', () => {
  let app;
  const document = fakeDocument();
  app = createApp({ initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({
    edit: action(d => { assert.throws(app.flush, code('FLUSH_REENTRANT')); d.n++; }),
  })), view({ derive, when }) { return div(derive(s => { assert.throws(app.flush, code('FLUSH_REENTRANT')); return s.n; }),
    when(derive(s => s.n > 0), () => { assert.throws(app.flush, code('FLUSH_REENTRANT')); return 'yes'; })); } });
  app.mount(document.createElement()); app.observe(s => s.n, () => assert.throws(app.flush, code('FLUSH_REENTRANT')));
  app.actions.edit(); app.flush(); app.dispose();
});

test('A.7 nested action commits share a frame and read the final FIFO state', () => {
  const document = fakeDocument(), target = document.createElement(); let app;
  app = createApp({ target, initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({
    parent: action(d => { d.n++; app.actions.child(); app.actions.child(); }), child: action(d => { d.n++; }),
  })), view: ({ bind }) => bind.n });
  const writes = spyValue(target.childNodes[0], 'data'); app.actions.parent();
  assert.equal(app.stateVersion, 4); assert.equal(document.pendingFrames, 1); document.flushFrame();
  assert.equal(target.textContent, '3'); assert.equal(writes(), 1); app.dispose();
});

test('A.7 scope cleanup invalidations of surviving computed consumers are drained in the same flush', () => {
  let source;
  const { app, target } = setup(({ bind, when, derive }) => div(
    when(bind.show, context => { source = context.computed(s => s.n); return span('branch'); }),
    derive(() => source.value),
  ));
  app.actions.hide(); assert.throws(app.flush, code('SCOPE_DISPOSED'));
  assert.equal(target.textContent, '0'); app.dispose();
});

test('A.7 failed DOM writes retain jobs and retry latest committed reads', () => {
  let reads = 0;
  const { app, target, document } = setup(({ derive }) => derive(s => { reads++; return s.n; }));
  const node = target.childNodes[0]; let value = node.data, bad = true, writes = 0;
  Object.defineProperty(node, 'data', { get: () => value, set(next) { if (bad) throw Error('DOM setter'); writes++; value = next; } });
  app.actions.increment(); assert.throws(app.flush, /DOM setter/); assert.equal(reads, 2); assert.equal(value, '0');
  bad = false; app.flush(); assert.equal(reads, 3); assert.equal(writes, 1); assert.equal(value, '1');
  assert.equal(document.pendingFrames, 0); app.dispose();
});

test('A.7 branch cleanup runs before root/app hooks and pending callbacks are cancelled before hooks', () => {
  const order = [];
  const { app, document } = setup(({ bind, when, onDispose }) => {
    onDispose(() => { assert.equal(document.pendingFrames, 0); order.push('root'); });
    return when(bind.show, ({ onDispose, bind }) => { onDispose(() => order.push('branch')); return bind.n; });
  });
  app.onDispose(() => order.push('app')); app.actions.increment(); app.dispose();
  assert.deepEqual(order, ['branch', 'root', 'app']);
});

test('A.7 flush rejects payload guard and render error-hook reentry without recursive reporting', () => {
  let app, reports = 0;
  const document = fakeDocument();
  app = createApp({ initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({
    edit: action(value => { assert.throws(app.flush, code('FLUSH_REENTRANT')); return value === 1; }, d => { d.n++; }),
  })), view: ({ derive }) => derive(s => { if (s.n) throw Error('render'); return 0; }),
    onError(error, { phase }) { assert.equal(phase, 'render'); assert.throws(app.flush, code('FLUSH_REENTRANT')); reports++; } });
  app.mount(document.createElement()); app.actions.edit(1); assert.throws(app.flush, /render/);
  assert.equal(reports, 1); // A caught guard error stays inside dispatch; outer render reports once.
  app.dispose();
});
