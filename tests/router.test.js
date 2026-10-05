import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, input, outlet } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const empty = app => assert.ok(Object.values(resourceCounts(app)).every(value => value === 0));
const routes = [
  { path: '/', view: ({ bind }) => div('home:', bind.n) },
  { path: '/people/:id', view: context => div(context.derive(() => context.route.params.id), ':', context.bind.n) },
];
const setup = (options = {}, url) => {
  const browser = fakeBrowser(url), app = createApp({ target: browser.target,
    initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({
      increment: action(d => { d.n++; }),
    })), router: { base: '/app', routes }, ...options });
  return { ...browser, app };
};

test('B.6 direct entry decodes route parameters/query into owned immutable snapshots', () => {
  const { app, target } = setup({}, 'https://example.test/app/people/Ada%20Lovelace/?tag=a&tag=b&__proto__=safe#bio');
  assert.equal(target.textContent, 'Ada Lovelace:0'); assert.equal(app.route.path, '/people/Ada%20Lovelace');
  assert.equal(app.route.params.id, 'Ada Lovelace'); assert.deepEqual(app.route.query.tag, ['a', 'b']);
  assert.deepEqual(app.route.query.__proto__, ['safe']); assert.equal(Object.getPrototypeOf(app.route.query), null);
  assert.equal(app.route.hash, '#bio'); assert.equal(app.route.search, '?tag=a&tag=b&__proto__=safe');
  for (const value of [app.route, app.route.params, app.route.query, app.route.query.tag]) assert.ok(Object.isFrozen(value));
  assert.throws(() => app.route.params.id = 'changed', TypeError); app.dispose(); empty(app);
});

test('B.6 navigation synchronizes URL/route immediately and preserves shared state and unrelated nodes on frames', () => {
  let shell;
  const { app, view, target, document } = setup({ view(context) {
    shell = context; return div(context.derive(s => 'shared:' + s.n), outlet());
  } });
  const wrapper = target.childNodes[0], text = wrapper.childNodes[0], state = app.state;
  app.actions.increment(); app.navigate('/people/7'); assert.equal(view.location.pathname, '/app/people/7');
  assert.equal(app.route.params.id, '7'); assert.equal(app.state.n, 1); assert.equal(app.stateVersion, 2);
  assert.equal(target.textContent, 'shared:0home:0'); document.flushFrame();
  assert.equal(target.textContent, 'shared:17:1'); assert.equal(wrapper.childNodes[0], text);
  assert.equal(shell.state, app.state); assert.notEqual(app.state, state);
  app.navigate('/'); app.flush(); assert.equal(target.textContent, 'shared:1home:1'); app.dispose(); empty(app);
});

test('B.6 query/hash changes retain route scope, focus and input identity; only route-dependent bindings invalidate', () => {
  let mounts = 0, disposed = 0, reads = 0, context;
  const { app, target, document } = setup({ router: { base: '/app', routes: [{ path: '/', view(c) {
    context = c; mounts++; c.onDispose(() => { disposed++; });
    return div(input({ value: 'edit' }), c.derive(() => c.route.query.q?.join(',') ?? 'none'),
      c.derive(s => { reads++; return s.n; }));
  } }] } });
  const field = target.childNodes.find(n => n.nodeType === 1).childNodes[0]; field.focus(); field.setSelectionRange(1, 3);
  app.navigate('?q=a&q=b#here'); document.flushFrame(); assert.equal(target.textContent, 'a,b0');
  assert.equal(mounts, 1); assert.equal(disposed, 0); assert.equal(reads, 1);
  assert.equal(document.activeElement, field); assert.equal(field.selectionStart, 1);
  assert.equal(context.route.hash, '#here'); app.navigate('/missing'); app.flush(); assert.equal(disposed, 1);
  assert.throws(() => context.route, code('SCOPE_DISPOSED')); app.dispose(); empty(app);
});

test('B.6 replace, duplicate URL and native back/forward preserve host history state', () => {
  const { app, view, target } = setup(); const nativeState = view.history.state;
  app.navigate('/people/1'); app.flush(); assert.equal(view.history.length, 2);
  app.navigate('/people/1'); assert.equal(view.history.length, 2);
  app.navigate('/people/2', { replace: true }); app.flush(); assert.equal(view.history.length, 2);
  assert.equal(view.history.state, nativeState); view.history.back(); assert.equal(app.route.path, '/');
  app.flush(); assert.equal(target.textContent, 'home:0'); view.history.forward(); app.flush();
  assert.equal(target.textContent, '2:0'); app.dispose(); empty(app);
});

test('B.6 first matching route wins, literal and parameter rules are explicit, outside-base native URLs use notFound', () => {
  const { app, view, target } = setup({ router: { base: '/app', routes: [
    { path: '/people/new', view: () => 'literal' }, ...routes,
  ], notFound: context => context.derive(() => 'missing:' + context.route.path) } });
  app.navigate('/people/new'); app.flush(); assert.equal(target.textContent, 'literal');
  app.navigate('/unknown'); app.flush(); assert.equal(target.textContent, 'missing:/unknown'); assert.equal(app.route.matched, false);
  view.history.pushState({}, '', '/other'); view.dispatchEvent({ type: 'popstate' }); app.flush();
  assert.equal(target.textContent, 'missing:/other'); assert.equal(app.route.outsideBase, true);
  app.navigate('/'); app.flush(); assert.equal(target.textContent, 'home:0'); app.dispose(); empty(app);
});

test('B.6 hash mode preserves document path/search and deduplicates popstate + hashchange', () => {
  const { app, view, target } = setup({ router: { mode: 'hash', routes } }, 'https://example.test/static/index.html?host=yes#/people/1?x=a#bio');
  assert.equal(target.textContent, '1:0'); assert.equal(app.route.hash, '#bio');
  let notifications = 0; const observer = app.observe(() => app.route, () => { notifications++; observer.read(); });
  app.navigate('/'); app.flush(); assert.equal(view.location.pathname, '/static/index.html');
  assert.equal(view.location.search, '?host=yes'); assert.equal(notifications, 1);
  view.history.back(); app.flush(); assert.equal(target.textContent, '1:0'); assert.equal(notifications, 2);
  view.history.forward(); app.flush(); assert.equal(target.textContent, 'home:0'); assert.equal(notifications, 3);
  app.dispose(); empty(app);
});

test('B.6 action navigation publishes after state commit before nested FIFO children; rollback drops URL writes and children', () => {
  const browser = fakeBrowser(), order = [];
  const schema = createActionSchema()(({ action }) => ({
    root: action(d => { d.n++; app.navigate('/people/1'); app.navigate('/people/2');
      app.actions.child(); assert.equal(app.route.path, '/'); }),
    child: action(d => { order.push('child:' + app.route.path + ':' + app.state.n); d.n++; }),
    fail: action(d => { d.n++; app.navigate('/'); app.actions.child(); throw Error('rollback'); }),
  }));
  const app = createApp({ target: browser.target, initialState: { n: 0 }, schema, router: { base: '/app', routes } });
  const observer = app.observe(() => app.route, () => { order.push('route:' + app.route.path + ':' + app.state.n); observer.read(); });
  app.actions.root(); assert.deepEqual(order, ['route:/people/1:1', 'route:/people/2:1', 'child:/people/2:1']);
  assert.equal(app.state.n, 2); assert.equal(app.stateVersion, 3); const url = browser.view.location.href, length = browser.view.history.length;
  assert.throws(app.actions.fail, /rollback/); assert.equal(app.state.n, 2); assert.equal(app.stateVersion, 3);
  assert.equal(browser.view.location.href, url); assert.equal(browser.view.history.length, length);
  assert.equal(order.length, 3); app.flush(); assert.equal(browser.target.textContent, '2:2'); app.dispose(); empty(app);
});

test('B.6 post-commit notifications/history errors retain committed state and drain healthy children', () => {
  const browser = fakeBrowser(), phases = [];
  const schema = createActionSchema()(({ action }) => ({
    root: action(d => { d.n++; app.navigate('/people/1'); app.actions.child(); }),
    child: action(d => { d.n++; }),
  }));
  const app = createApp({ target: browser.target, initialState: { n: 0 }, schema, router: { base: '/app', routes },
    onError(error, { phase }) { phases.push(phase); } });
  app.observe(s => s.n, () => { throw Error('notification'); });
  browser.view.history.pushState = () => { throw Error('host history'); };
  assert.throws(app.actions.root, AggregateError); assert.equal(app.state.n, 2); assert.equal(app.stateVersion, 3);
  assert.equal(app.route.path, '/'); assert.equal(browser.view.location.pathname, '/app/');
  assert.deepEqual(phases, ['dispatch']); app.dispose(); empty(app);
});

test('B.6 links own href/click and preserve native modifiers, download, target, fragments and external behavior', () => {
  const { app, target, view } = setup({ view(c) { return div(
    c.link('/people/1', { id: 'internal' }, 'person'),
    c.link('/people/2', { download: true }, 'download'),
    c.link('/people/2', { target: '_blank' }, 'new'),
    c.link('/people/2', { rel: 'external' }, 'native'),
    c.link('https://outside.test/', 'external'),
    c.link('https://example.test/other', 'outside base'),
    c.link('#native', 'fragment'),
  ); } });
  const links = target.childNodes[0].childNodes; assert.equal(links[0].getAttribute('href'), '/app/people/1');
  for (const fields of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const event = { type: 'click', ...fields }; links[0].dispatchEvent(event);
    assert.equal(app.route.path, '/');
  }
  for (const node of links.slice(1)) { const event = { type: 'click' }; node.dispatchEvent(event); assert.equal(event.defaultPrevented, false); }
  const event = { type: 'click', button: 0 }; links[0].dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.equal(view.location.pathname, '/app/people/1');
  for (const props of [{ href: '/override' }, { onClick() {} }, { on: { click() {} } }])
    assert.throws(() => app.link('/', props, 'invalid'), code('ROUTE_LINK_INVALID'));
  for (const to of ['javascript:alert(1)', 'https://user:password@outside.test/', 'bad url'])
    assert.throws(() => app.link(to, 'invalid'), code('ROUTE_URL_INVALID'));
  app.dispose(); empty(app);
});

test('B.6 route transition disposes native/input handlers and scoped tasks; stale events cannot dispatch', () => {
  let context, cleanups = 0, called = 0;
  const { app, target, turn, idleTurn, document } = setup({ router: { base: '/app', routes: [
    { path: '/', view(c) { context = c; c.onDispose(() => { cleanups++; });
      c.schedule('normal', () => { called++; }); c.schedule('idle', () => { called++; });
      return input({ onKey: () => { called++; }, onText: () => { called++; }, on: { click: () => c.actions.increment() } });
    } }, { path: '/next', view: () => 'next' },
  ] } });
  const node = target.childNodes.find(n => n.nodeType === 1); app.navigate('/next'); document.flushFrame();
  assert.equal(cleanups, 1); turn(); idleTurn(); node.click(); node.dispatchEvent({ type: 'keydown', key: 'a', code: 'KeyA' });
  assert.equal(called, 0); assert.equal(app.state.n, 0); assert.equal(target.textContent, 'next');
  assert.throws(() => context.schedule('normal', () => {}), code('SCOPE_DISPOSED'));
  assert.equal(resourceCounts(app).normalTasks, 0); assert.equal(resourceCounts(app).handlers, 0);
  assert.equal(resourceCounts(app).listeners, 0);
  app.dispose(); empty(app);
});

test('B.6 failed replacement view keeps old DOM, disposes candidate resources and retries on flush', () => {
  let failed = true, disposed = 0, phases = [];
  const { app, target } = setup({ router: { base: '/app', routes: [
    routes[0], { path: '/bad', view(c) { c.onDispose(() => { disposed++; }); c.schedule('normal', () => {});
      if (failed) throw Error('candidate'); return 'recovered'; } },
  ] }, onError(error, { phase }) { phases.push(phase); } });
  app.navigate('/bad'); assert.throws(app.flush, /candidate/); assert.equal(app.route.path, '/bad');
  assert.equal(target.textContent, 'home:0'); assert.equal(disposed, 1); assert.equal(resourceCounts(app).normalTasks, 0);
  assert.deepEqual(phases, ['render']); failed = false; app.flush(); assert.equal(target.textContent, 'recovered');
  app.dispose(); assert.equal(disposed, 2); empty(app);
});

test('B.6 router ownership and failed mount cleanup release URL/target claims and permit retry', () => {
  const browser = fakeBrowser(), first = createApp({ target: browser.target, router: { base: '/app', routes } });
  const second = createApp({ router: { base: '/app', routes } }), other = browser.document.createElement('section');
  assert.throws(() => second.mount(other), code('ROUTER_OWNED')); first.dispose(); second.mount(other); second.dispose(); empty(second);
  let fails = true, notifications = 0;
  const retry = createApp({ router: { base: '/app', routes }, view: () => { if (fails) throw Error('first'); return outlet(); } });
  assert.equal(retry.route, null); assert.throws(() => retry.mount(browser.target), code('VIEW_FAILED'));
  assert.equal(retry.route, null); assert.equal(browser.view.listeners.get('popstate').size, 0);
  fails = false; retry.mount(browser.target); const observer = retry.observe(() => retry.route, () => { notifications++; observer.read(); });
  retry.dispose(); assert.equal(notifications, 0); empty(retry);
});

test('B.6 duplicate outlets, missing routers and synchronous route view contracts reject explicitly', async () => {
  const browser = fakeBrowser();
  assert.throws(() => createApp({ target: browser.target, view: outlet }), code('ROUTER_MISSING'));
  const plain = createApp(); assert.equal(plain.route, null); assert.throws(() => plain.navigate('/'), code('ROUTER_MISSING')); plain.dispose();
  assert.throws(() => createApp({ target: browser.target, router: { base: '/app', routes }, view: () => [outlet(), outlet()] }), code('ROUTE_OUTLET_DUPLICATE'));
  assert.throws(() => createApp({ target: browser.target, router: { base: '/app', routes: [{ path: '/', view: async () => { throw Error('async'); } }] } }), code('VIEW_RESULT_INVALID'));
  await new Promise(resolve => setImmediate(resolve));
  const app = createApp({ router: { base: '/app', routes } });
  assert.throws(() => app.navigate('/'), code('NAVIGATION_REENTRANT')); assert.throws(() => app.link('/', 'link'), code('ROUTER_NOT_MOUNTED'));
  app.mount(browser.target); app.dispose(); empty(app);
});

test('B.6 URL/options/config admission rejects malformed and unsupported inputs without writes', () => {
  const { app, view } = setup(); const url = view.location.href;
  for (const to of ['', null, {}, '/%ZZ', 'https://outside.test/', '//outside.test/', 'https://example.test/other',
    'https://user:password@example.test/app/', 'javascript:alert(1)', '/bad path', '/bad\\path', '/' + 'a'.repeat(8192)])
    assert.throws(() => app.navigate(to), code('ROUTE_URL_INVALID'));
  for (const options of [{ replace: 1 }, { unknown: true }, null, Object.defineProperty({}, 'replace', { get() { throw Error('getter ran'); } })])
    assert.throws(() => app.navigate('/', options), code('ROUTE_OPTIONS_INVALID'));
  assert.equal(view.location.href, url); assert.equal(view.history.length, 1); app.dispose(); empty(app);
  for (const router of [{ routes: [] , mode: 'bad' }, { routes: [], base: '/a/../b' }, { routes: [], base: 1 },
    { routes: [{ path: '/:id/:id', view() {} }] }, { routes: [{ path: 'relative', view() {} }] },
    { routes: [{ path: '/wild/*', view() {} }] }, { routes: [{ path: '/', view() {} }, { path: '/', view() {} }] },
    { routes: new Array(1) }, { routes: [], notFound: 1 }, { routes: Object.assign([], { extra: true }) }])
    assert.throws(() => createApp({ router }), code('ROUTER_CONFIG_INVALID'));
});

test('B.6 navigation from reactive reads, notifications and view construction rejects without recursion', () => {
  let app; const browser = fakeBrowser();
  app = createApp({ router: { base: '/app', routes }, view(c) {
    assert.throws(() => c.navigate('/people/1'), code('NAVIGATION_REENTRANT')); return outlet();
  } }); app.mount(browser.target);
  assert.throws(() => app.computed(() => { app.navigate('/people/1'); return 0; }).value, code('NAVIGATION_REENTRANT'));
  const observer = app.observe(() => app.route, () => {
    assert.throws(() => app.navigate('/'), code('NAVIGATION_REENTRANT')); observer.read();
  });
  app.navigate('/people/1'); assert.equal(app.route.path, '/people/1'); app.dispose(); empty(app);
});

test('B.6 stale listeners from failed mounts stay inert after another-window retry even if removal fails', () => {
  const first = fakeBrowser(), second = fakeBrowser(), nativeRemove = first.view.removeEventListener;
  first.view.removeEventListener = () => { throw Error('native removal'); };
  let fails = true;
  const app = createApp({ router: { base: '/app', routes }, view() {
    if (fails) throw Error('mount'); return outlet();
  } });
  assert.throws(() => app.mount(first.target), AggregateError); assert.equal(app.route, null);
  fails = false; app.mount(second.target); let callbacks = 0;
  app.observe(() => app.route, () => { callbacks++; });
  // If a listener from the old window reads the new window, it would publish.
  second.view.history.pushState({}, '', '/app/people/2');
  first.view.dispatchEvent({ type: 'popstate' }); assert.equal(callbacks, 0); assert.equal(app.route.path, '/');
  second.view.dispatchEvent({ type: 'popstate' }); assert.equal(callbacks, 1); assert.equal(app.route.path, '/people/2');
  app.dispose(); empty(app); first.view.removeEventListener = nativeRemove;
});

test('B.6 bounded action navigation and async rollback never write rejected requests', async () => {
  const browser = fakeBrowser();
  const schema = createActionSchema()(({ action }) => ({
    overflow: action(d => { d.n++; for (let n = 0; n < 1025; n++) app.navigate('/people/' + n); }),
    asyncFail: action(async d => { d.n++; app.navigate('/people/1'); }),
  }));
  const app = createApp({ target: browser.target, initialState: { n: 0 }, schema, router: { base: '/app', routes } });
  assert.throws(app.actions.overflow, code('ROUTE_QUEUE_LIMIT')); assert.equal(app.state.n, 0);
  assert.throws(app.actions.asyncFail, code('ACTION_ASYNC')); assert.equal(app.stateVersion, 1);
  assert.equal(browser.view.history.length, 1); assert.equal(app.route.path, '/');
  await new Promise(resolve => setImmediate(resolve)); app.navigate('/people/ok'); app.flush();
  assert.equal(browser.target.textContent, 'ok:0'); app.dispose(); empty(app);
});

test('B.6 navigation defaults require undefined; malformed pattern errors stay configuration errors', () => {
  for (const router of [{ mode: null, routes: [] }, { base: null, routes: [] }, { routes: [{ path: '/%bad%', view() {} }] }])
    assert.throws(() => createApp({ router }), code('ROUTER_CONFIG_INVALID'));
});
