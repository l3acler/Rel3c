import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, outlet } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { encodeSnapshot } from '../src/runtime/persistence/codec.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const number = value => typeof value === 'number' && Number.isFinite(value);
const string = value => typeof value === 'string';
const key = area => 'mini-framework:demo:' + area;
const envelope = (values, version = '1') => encodeSnapshot({ namespace: 'demo', version, values });
const fields = {
  saved: { location: 'local', validate: number }, session: { location: 'session', validate: string },
  filter: { location: 'url', key: 'filter', validate: string }, temp: { location: 'memory' },
};
const config = { namespace: 'demo', version: '1', fields };
const routes = [{ path: '/', view: ({ bind }) => div(bind.saved, ':', bind.filter, ':', bind.temp) },
  { path: '/next', view: ({ bind }) => div('next:', bind.saved, ':', bind.filter) }];
const initial = { saved: 0, session: 'initial', filter: '', temp: 0 };
function setup(browser = fakeBrowser(), options = {}) {
  const app = createApp({ initialState: initial, persistence: config, router: { base: '/app', routes },
    schema: createActionSchema()(({ action }) => ({
      set: action(value => value && typeof value === 'object', (d, value) => { Object.assign(d, value); }),
      fail: action(d => { d.saved++; d.filter = 'discard'; throw Error('rollback'); }),
    })), ...options });
  return { ...browser, app };
}
const empty = app => assert.ok(Object.values(resourceCounts(app)).every(n => n === 0));
const queryURL = (values, path = '/app/') => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.set('mf:demo:' + key, envelope({ [key]: value }));
  return 'https://example.test' + path + '?' + params;
};

test('B.8 mount hydrates before first view and commits one owned input while memory-only fields reset', () => {
  const browser = fakeBrowser(queryURL({ filter: 'url' })); let seen;
  browser.view.localStorage.setItem(key('local'), envelope({ saved: 7, temp: 999, filter: 'wrong source' }));
  browser.view.sessionStorage.setItem(key('session'), envelope({ session: 'tab' }));
  const { app } = setup(browser, { view(c) { seen = [c.state.saved, c.state.session, c.state.filter, c.state.temp]; return outlet(); } });
  assert.equal(app.stateVersion, 1); assert.equal(app.state.saved, 0);
  app.mount(browser.target); assert.deepEqual(seen, [7, 'tab', 'url', 0]); assert.equal(app.stateVersion, 2);
  assert.equal(browser.target.textContent, '7:url:0'); assert.equal(app.persistence.pending, false);
  assert.equal(browser.view.localStorage.writes.length, 1); app.dispose(); empty(app);
});

test('B.8 only successful commits queue coalesced writes; visual flush is separate, explicit persistence flush cancels the task', () => {
  const { app, target, view, turn } = setup(); app.mount(target);
  app.actions.set({ saved: 1, session: 'one', temp: 4 }); app.actions.set({ saved: 2, session: 'two' });
  assert.equal(view.localStorage.writes.length, 0); assert.equal(resourceCounts(app).persistenceTasks, 1);
  assert.throws(app.actions.fail, /rollback/); assert.equal(app.state.saved, 2);
  app.flush(); assert.equal(view.localStorage.writes.length, 0);
  app.flushPersistence(); assert.equal(view.localStorage.writes.length, 1); assert.equal(view.sessionStorage.writes.length, 1);
  assert.equal(app.persistence.pending, false); turn(); assert.equal(view.localStorage.writes.length, 1);
  app.actions.set({ temp: 5 }); turn(); assert.equal(view.localStorage.writes.length, 1);
  app.dispose(); empty(app);
});

test('B.8 reload restores selected fields and leaves memory-only state at defaults', () => {
  const browser = fakeBrowser(), first = setup(browser).app; first.mount(browser.target);
  first.actions.set({ saved: 9, session: 'session data', filter: 'URL data', temp: 15 }); first.flushPersistence();
  const url = browser.view.location.href; first.dispose(); empty(first);
  const next = setup(browser).app; next.mount(browser.target);
  assert.deepEqual(next.state, { saved: 9, session: 'session data', filter: 'URL data', temp: 0 });
  assert.equal(browser.view.location.href, url); assert.equal(browser.view.history.length, 1);
  next.dispose(); empty(next);
});

test('B.8 URL state replaces owned keys without new history entries, retaining route keys and one synchronized notification', () => {
  const { app, target, view } = setup(fakeBrowser('https://example.test/app/?tab=details&tag=a&tag=b#section'));
  app.mount(target); let calls = 0, latest;
  const observer = app.observe(() => [app.state.filter, app.route.query['mf:demo:filter']?.[0]], () => {
    calls++; latest = observer.read();
  });
  app.actions.set({ filter: 'Arabic مرحبا 😀' });
  assert.equal(calls, 1); assert.equal(latest[0], 'Arabic مرحبا 😀'); assert.ok(latest[1]);
  assert.equal(view.history.length, 1); assert.equal(app.route.query.tab[0], 'details');
  assert.deepEqual(app.route.query.tag, ['a', 'b']); assert.equal(app.route.hash, '#section');
  app.actions.set({ filter: '' }); assert.equal(app.route.query['mf:demo:filter'], undefined);
  assert.equal(view.history.length, 1); app.dispose(); empty(app);
});

test('B.8 native traversal and imperative/action navigation hydrate URL fields without feedback history writes', () => {
  let app;
  const browser = fakeBrowser(queryURL({ filter: 'first' }));
  const schema = createActionSchema()(({ action }) => ({
    navigate: action(d => { d.saved++; app.navigate('/next'); }),
    fail: action(d => { d.saved++; app.navigate('/'); throw Error('rollback'); }),
  }));
  app = setup(browser, { schema }).app; app.mount(browser.target);
  app.navigate(queryURL({ filter: 'second' }, '/app/next')); app.flush();
  assert.equal(app.state.filter, 'second'); assert.equal(browser.view.history.length, 2);
  let latest, calls = 0;
  const observer = app.observe(() => [app.route.path, app.state.filter], () => { calls++; latest = observer.read(); });
  browser.view.history.back(); assert.deepEqual(latest, ['/', 'first']); assert.equal(calls, 1);
  browser.view.history.forward(); assert.deepEqual(latest, ['/next', 'second']); assert.equal(calls, 2);
  const length = browser.view.history.length; app.actions.navigate();
  assert.equal(app.state.saved, 1); assert.equal(app.state.filter, '');
  assert.equal(browser.view.history.length, length + 1); // /next with absent URL field resets to default.
  assert.throws(app.actions.fail, /rollback/); assert.equal(app.state.saved, 1);
  assert.equal(browser.view.history.length, length + 1); app.dispose(); empty(app);
});

test('B.8 hash-mode URL fields use the inner route query, leaving document query and fragments intact', () => {
  const browser = fakeBrowser('https://example.test/static.html?host=keep#/?tab=details#section');
  const { app } = setup(browser, { router: { mode: 'hash', routes } }); app.mount(browser.target);
  app.actions.set({ filter: 'hash' });
  assert.equal(browser.view.location.search, '?host=keep'); assert.equal(app.route.query.tab[0], 'details');
  assert.ok(app.route.query['mf:demo:filter']); assert.equal(app.route.hash, '#section');
  app.navigate('/next'); assert.equal(app.state.filter, '');
  browser.view.history.back(); assert.equal(app.state.filter, 'hash');
  assert.equal(browser.view.history.length, 2); app.dispose(); empty(app);
});

test('B.8 malformed/version-mismatched/wrongly typed data falls back, queues reports and preserves healthy fields', () => {
  const browser = fakeBrowser(queryURL({ filter: 17 })), phases = [];
  browser.view.localStorage.setItem(key('local'), envelope({ saved: 'bad' }));
  browser.view.sessionStorage.setItem(key('session'), envelope({ session: 'wrong-version' }, 'old'));
  const { app } = setup(browser, { onError(error, { phase }) { phases.push([error.code, phase]); } });
  app.mount(browser.target); assert.deepEqual(app.state, initial); assert.equal(app.stateVersion, 1);
  assert.equal(app.persistence.errors.length, 3); assert.equal(phases.length, 0);
  assert.throws(app.flushPersistence, code('PERSIST_FAILED')); assert.deepEqual(phases, [['PERSIST_FAILED', 'persistence']]);
  assert.equal(app.persistence.pending, false); assert.equal(browser.view.localStorage.writes.length, 1);
  app.actions.set({ saved: 3 }); app.flushPersistence(); assert.equal(app.state.saved, 3);
  app.dispose(); empty(app);
});

test('B.8 read/access failures retain defaults; write quota failures preserve commits and attempt other areas', () => {
  const browser = fakeBrowser(), phases = [];
  Object.defineProperty(browser.view, 'localStorage', { configurable: true, get() { throw Error('access denied'); } });
  const { app } = setup(browser, { onError(error, { phase }) { phases.push(phase); } }); app.mount(browser.target);
  assert.equal(app.state.saved, 0); assert.throws(app.flushPersistence, code('PERSIST_FAILED'));
  Object.defineProperty(browser.view, 'localStorage', { value: { setItem() { throw Error('quota'); } }, configurable: true });
  app.actions.set({ saved: 10, session: 'healthy' }); const committed = app.state, version = app.stateVersion;
  assert.throws(browser.turn, code('PERSIST_FAILED')); assert.equal(app.state, committed); assert.equal(app.stateVersion, version);
  assert.equal(browser.view.sessionStorage.writes.length, 1); assert.deepEqual(phases, ['persistence', 'persistence']);
  app.dispose(); empty(app);
});

test('B.8 aliases, holes, custom properties, null prototypes, undefined and negative zero survive storage hydration', () => {
  const shared = Object.assign(Object.create(null), { zero: -0, missing: undefined }), rows = new Array(3);
  rows[1] = shared; rows.extra = shared;
  const state = { a: shared, b: shared, rows, temp: 0 }, browser = fakeBrowser();
  const persistence = { namespace: 'graph', fields: {
    a: { location: 'local', validate: value => typeof value === 'object' },
    b: { location: 'local', validate: value => typeof value === 'object' },
    rows: { location: 'local', validate: Array.isArray },
  } };
  const schema = createActionSchema()(({ action }) => ({ edit: action(d => { d.a.edited = true; }) }));
  const first = createApp({ target: browser.target, initialState: state, schema, persistence });
  first.actions.edit(); first.flushPersistence(); first.dispose();
  const next = createApp({ target: browser.target, initialState: state, schema, persistence });
  assert.equal(next.state.a, next.state.b); assert.equal(next.state.rows[1], next.state.a); assert.equal(next.state.rows.extra, next.state.a);
  assert.equal(Object.getPrototypeOf(next.state.a), null); assert.ok(Object.is(next.state.a.zero, -0));
  assert.ok(Object.hasOwn(next.state.a, 'missing')); assert.ok(!(0 in next.state.rows)); assert.equal(next.state.a.edited, true);
  next.dispose(); empty(next);
});

test('B.8 disposal and failed mount cancel jobs; retry rehydrates without leaking tasks or notifications', () => {
  const browser = fakeBrowser(); let fail = true;
  browser.view.localStorage.setItem(key('local'), envelope({ saved: 5 }));
  const { app } = setup(browser, { view() { if (fail) throw Error('view'); return outlet(); } });
  assert.throws(() => app.mount(browser.target), code('VIEW_FAILED'));
  assert.equal(app.state.saved, 5); assert.equal(resourceCounts(app).persistenceTasks, 0);
  fail = false; app.mount(browser.target); app.actions.set({ saved: 6 });
  let notifications = 0; app.observe(s => s.saved, () => { notifications++; });
  app.dispose(); browser.turn(); assert.equal(browser.view.localStorage.writes.length, 1); assert.equal(notifications, 0); empty(app);
});

test('B.8 guards are frozen, synchronous and cannot reenter runtime; invalid action values fail persistence after commit', async () => {
  const browser = fakeBrowser(); let app;
  const persistence = { namespace: 'guard', fields: { saved: { location: 'local', validate(value) {
    if (app) {
      assert.throws(() => app.actions.set({ temp: 1 }), code('ACTION_REENTRANT'));
      assert.throws(() => app.navigate('/'), code('NAVIGATION_REENTRANT'));
      assert.throws(() => app.flushPersistence(), code('PERSIST_REENTRANT'));
    }
    return number(value);
  } } } };
  app = setup(browser, { persistence }).app; app.mount(browser.target);
  app.actions.set({ saved: 'invalid' }); assert.equal(app.state.saved, 'invalid');
  assert.throws(app.flushPersistence, code('PERSIST_FAILED')); assert.equal(browser.view.localStorage.writes.length, 0);
  app.dispose(); empty(app);
  assert.throws(() => createApp({ initialState: { n: 0 }, persistence: { namespace: 'async', fields: {
    n: { location: 'local', validate: async () => { throw Error('async guard'); } },
  } } }), code('PERSIST_VALUE_INVALID'));
  await new Promise(resolve => setImmediate(resolve));
});

test('B.8 query duplicates, malformed wire and URL length errors remain bounded and preserve committed memory', () => {
  const browser = fakeBrowser('https://example.test/app/?mf%3Ademo%3Afilter=bad&mf%3Ademo%3Afilter=again');
  const { app } = setup(browser); app.mount(browser.target); assert.equal(app.state.filter, '');
  assert.throws(app.flushPersistence, code('PERSIST_FAILED'));
  app.actions.set({ filter: 'x'.repeat(9000) }); assert.equal(app.state.filter.length, 9000);
  assert.throws(app.flushPersistence, code('PERSIST_FAILED')); assert.ok(app.persistence.errors.some(issue => issue.source === 'url'));
  for (let n = 0; n < 30; n++) app.navigate('/?mf%3Ademo%3Afilter=bad' + n);
  assert.equal(app.persistence.errors.length, 16); assert.equal(resourceCounts(app).persistenceTasks, 1);
  assert.throws(app.flushPersistence, /older reports omitted/); app.dispose(); empty(app);
});

test('B.7 invalid field/config/default contracts reject without executing accessors', () => {
  for (const persistence of [{ namespace: 'bad space', fields: {} }, { namespace: 'demo', version: '', fields: {} },
    { namespace: 'demo', fields: { missing: { location: 'memory' } } },
    { namespace: 'demo', fields: { saved: { location: 'both', validate: number } } },
    { namespace: 'demo', fields: { saved: { location: 'local' } } },
    { namespace: 'demo', fields: { saved: { location: 'local', key: 'key', validate: number } } },
    { namespace: 'demo', fields: { saved: { location: 'url', key: 'same', validate: number }, filter: { location: 'url', key: 'same', validate: string } } },
    { namespace: 'demo', fields: Object.defineProperty({}, 'saved', { enumerable: true, get() { throw Error('getter'); } }) }])
    assert.throws(() => setup(undefined, { persistence }), code('PERSIST_CONFIG_INVALID'));
  assert.throws(() => createApp({ initialState: initial, persistence: config }), code('PERSIST_CONFIG_INVALID'));
  assert.throws(() => createApp({ initialState: [], persistence: { namespace: 'demo', fields: {} } }), code('PERSIST_CONFIG_INVALID'));
  assert.throws(() => setup(undefined, { persistence: { namespace: 'demo', fields: { saved: { location: 'local', validate: string } } } }), code('PERSIST_VALUE_INVALID'));
});

test('B.8 no-op hydration retains object identities and unrelated memory bindings remain exact', () => {
  const browser = fakeBrowser(); browser.view.localStorage.setItem(key('local'), envelope({ saved: 0 }));
  let reads = 0;
  const { app } = setup(browser, { view(c) { return c.derive(s => { reads++; return s.temp; }); } });
  const state = app.state; app.mount(browser.target); assert.equal(app.state, state); assert.equal(app.stateVersion, 1);
  app.navigate(queryURL({ filter: 'one' })); app.flush(); assert.equal(reads, 1);
  const version = app.stateVersion; app.navigate('/?other=one'); assert.equal(app.state.filter, '');
  assert.equal(app.stateVersion, version + 1); app.navigate('/?other=two'); assert.equal(app.stateVersion, version + 1);
  app.dispose(); empty(app);
});

test('B.8 individually valid storage inputs that exceed aggregate state limits roll back hydration and retain memory', () => {
  const browser = fakeBrowser(), phases = [];
  browser.view.localStorage.setItem(key('local'), envelope({ saved: 'a'.repeat(200000) }));
  browser.view.sessionStorage.setItem(key('session'), envelope({ session: 'b'.repeat(200000) }));
  const app = createApp({ target: browser.target, initialState: { saved: '', session: '', memory: 'x'.repeat(700000) },
    persistence: { namespace: 'demo', version: '1', fields: {
      saved: { location: 'local', validate: string }, session: { location: 'session', validate: string },
    } }, onError(error, { phase }) { phases.push(phase); } });
  assert.equal(app.state.saved, ''); assert.equal(app.state.session, ''); assert.equal(app.stateVersion, 1);
  assert.equal(app.persistence.errors[0].code, 'PERSIST_INPUT_FAILED');
  assert.throws(app.flushPersistence, code('PERSIST_FAILED')); assert.deepEqual(phases, ['persistence']);
  app.dispose(); empty(app);
});

test('B.8 validators receive independent frozen object graphs and cannot register reactive work during writes', () => {
  const browser = fakeBrowser(), source = { nested: { n: 2 } }; let app;
  browser.view.localStorage.setItem('mini-framework:owned:local',
    encodeSnapshot({ namespace: 'owned', version: '1', values: { saved: source } }));
  const schema = createActionSchema()(({ action }) => ({ touch: action(d => { d.temp++; }) }));
  app = createApp({ initialState: { saved: { nested: { n: 0 } }, temp: 0 }, schema,
    persistence: { namespace: 'owned', version: '1', fields: { saved: { location: 'local', validate(value) {
      assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.nested));
      if (app) {
        assert.throws(() => app.observe(s => s.temp), code('REACTIVITY_REENTRANT'));
        assert.throws(() => app.computed(s => s.temp), code('REACTIVITY_REENTRANT'));
      }
      return true;
    } } } } });
  app.mount(browser.target); source.nested.n = 9; assert.equal(app.state.saved.nested.n, 2);
  app.actions.touch(); app.flushPersistence(); assert.equal(resourceCounts(app).observers, 0);
  app.dispose(); empty(app);
});
