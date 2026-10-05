import { createApp, createActionSchema, div, input, outlet } from '../../src/index.js';
import { resourceCounts } from '../../src/runtime/diagnostics.js';
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const traverse = direction => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { window.removeEventListener('popstate', done); reject(Error('History traversal timeout')); }, 2000);
  function done() { clearTimeout(timeout); resolve(); }
  window.addEventListener('popstate', done, { once: true }); history[direction]();
});

export async function runRoutingSchedulerTests(test, assert, throws, host) {
  const originalURL = location.href, originalState = history.state;
  const routes = [
    { path: '/', view: ({ bind }) => div('home:', bind.n) },
    { path: '/people/:id', view(c) { return div(input({ id: 'route-test-input', value: 'native' }),
      c.derive(() => c.route.params.id + ':' + (c.route.query.tab?.join(',') ?? 'none')), ':', c.bind.n); } },
  ];
  const config = () => ({ initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({
    increment: action(d => { d.n++; }),
  })), router: { base: '/test-routing', routes } });
  const begin = () => history.replaceState({ host: true }, '', '/test-routing/');
  const cleanup = (app, target) => {
    app.dispose(); assert(Object.values(resourceCounts(app)).every(n => n === 0)); target.remove();
    history.replaceState(originalState, '', originalURL);
  };

  await test('B.4 native task queue runs FIFO, lets timers progress and writes visuals before frame callbacks', async () => {
    const target = host(), app = createApp({ target, ...config(), router: undefined, view: ({ bind }) => bind.n });
    try {
      const order = [];
      for (let n = 0; n < 70; n++) app.schedule('normal', () => order.push(n));
      let timerProgress = false, timerAt;
      setTimeout(() => { timerProgress = true; timerAt = order.length; }, 0);
      for (let n = 0; n < 200; n++) app.schedule('immediate', app.actions.increment);
      app.schedule('frame', () => { assert(app.state.n === 200 && target.textContent === '200'); });
      for (let n = 0; n < 8 && order.length < 70; n++) await turn();
      assert(timerProgress && timerAt < 70 && order.length === 70 && order.every((value, index) => value === index));
      await frame();
    } finally { app.dispose(); target.remove(); }
  });
  await test('B.4 actual idle host runs a callback after normal work while cancellation removes its sibling', async () => {
    const target = host(), app = createApp({ target }), order = [];
    try {
      const cancel = app.schedule('idle', () => order.push('canceled')); cancel();
      const completed = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('Idle work timeout')), 2500);
        app.schedule('idle', () => { order.push('idle'); clearTimeout(timeout); resolve(); });
      });
      app.schedule('normal', () => order.push('normal')); await completed;
      assert(order.join(',') === 'normal,idle');
    } finally { app.dispose(); target.remove(); }
  });
  await test('B.4 disposed apps cancel actual timers, idle and animation-frame callbacks', async () => {
    const target = host(), app = createApp({ target }); let calls = 0;
    for (const lane of ['normal', 'idle', 'frame']) app.schedule(lane, () => { calls++; });
    app.dispose(); await new Promise(resolve => setTimeout(resolve, 40)); await frame();
    assert(calls === 0 && Object.values(resourceCounts(app)).every(n => n === 0)); target.remove();
  });
  await test('B.6 native History back/forward retains shared state and the persistent shell', async () => {
    begin(); const target = host(), app = createApp({ target, ...config(), view: () => div({ id: 'route-shell' }, outlet()) });
    try {
      const shell = target.firstChild; app.actions.increment(); app.navigate('/people/7?tab=a'); await frame();
      assert(target.textContent === '7:a:1' && location.pathname === '/test-routing/people/7' && history.state.host);
      await traverse('back'); await frame(); assert(app.route.path === '/' && target.textContent === 'home:1');
      await traverse('forward'); await frame(); assert(app.route.params.id === '7' && target.textContent === '7:a:1' && target.firstChild === shell);
    } finally { cleanup(app, target); }
  });
  await test('B.6 query changes retain native input/focus/selection; route changes release scoped work and handlers', async () => {
    begin(); const target = host(), app = createApp({ target, ...config() });
    try {
      app.navigate('/people/8'); await frame();
      const field = target.querySelector('input'); field.focus(); field.setSelectionRange(1, 4);
      app.navigate('?tab=b'); await frame();
      assert(target.querySelector('input') === field && document.activeElement === field && field.selectionStart === 1 && field.selectionEnd === 4,
        JSON.stringify({ identity: target.querySelector('input') === field, focus: document.activeElement === field,
          value: field.value, start: field.selectionStart, end: field.selectionEnd, route: app.route }));
      app.navigate('/'); await frame(); assert(!field.isConnected && target.textContent === 'home:0');
    } finally { cleanup(app, target); }
  });
  await test('B.6 action rollback keeps actual browser URL/history and committed state unchanged', async () => {
    begin(); const target = host(); let app;
    const schema = createActionSchema()(({ action }) => ({
      save: action(d => { d.n++; app.navigate('/people/9'); }),
      fail: action(d => { d.n++; app.navigate('/'); throw Error('rollback'); }),
    }));
    app = createApp({ target, initialState: { n: 0 }, schema, router: { base: '/test-routing', routes } });
    try {
      app.actions.save(); await frame(); const url = location.href, length = history.length, state = app.state;
      let failed = false; try { app.actions.fail(); } catch { failed = true; }
      assert(failed && location.href === url && history.length === length && app.state === state && target.textContent === '9:none:1');
    } finally { cleanup(app, target); }
  });
  await test('B.6 native link default cancellation/modifiers and route ownership preserve browser semantics', async () => {
    begin(); const target = host(), app = createApp({ target, ...config(), view(c) {
      return div(c.link('/people/1', { id: 'test-link' }, 'Go'), outlet());
    } });
    const secondary = createApp({ ...config() }), other = host();
    try {
      throws(() => secondary.mount(other), 'ROUTER_OWNED');
      const link = target.querySelector('a');
      // Prevent the test browser opening a new tab after confirming the router did not cancel.
      let nativeAllowed = false;
      const observer = event => { nativeAllowed = !event.defaultPrevented; event.preventDefault(); };
      target.addEventListener('click', observer);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      target.removeEventListener('click', observer); assert(nativeAllowed && app.route.path === '/');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(click); await frame(); assert(click.defaultPrevented && app.route.params.id === '1');
    } finally { secondary.dispose(); other.remove(); cleanup(app, target); }
  });
  await test('B.6 actual hash traversal deduplicates popstate/hashchange and preserves document query', async () => {
    history.replaceState(originalState, '', '/tests/browser/app-lifecycle.html?host=yes#/');
    const target = host(), app = createApp({ target, initialState: { n: 0 }, router: { mode: 'hash', routes } });
    let count = 0;
    const observed = app.observe(() => app.route, () => { count++; observed.read(); });
    try {
      app.navigate('/people/3?tab=c#section'); await frame();
      assert(location.pathname === '/tests/browser/app-lifecycle.html' && location.search === '?host=yes' && app.route.hash === '#section');
      await traverse('back'); await frame(); assert(count === 2 && app.route.path === '/' && target.textContent === 'home:0');
      location.hash = '/people/4?tab=d'; await new Promise(resolve => setTimeout(resolve, 30)); await frame();
      assert(count === 3 && target.textContent === '4:d:0');
    } finally { cleanup(app, target); }
  });
}
