import { createApp, createActionSchema } from '../../src/index.js';
import { resourceCounts } from '../../src/runtime/diagnostics.js';
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const config = namespace => ({ initialState: { count: 0, filter: '', temp: 0 },
  schema: createActionSchema()(({ action }) => ({
    set: action(value => typeof value === 'number', (d, value) => { d.count = value; d.temp = value; }),
    filter: action(value => typeof value === 'string', (d, value) => { d.filter = value; }),
    fail: action(d => { d.count++; d.filter = 'discard'; throw Error('rollback'); }),
  })), persistence: { namespace, version: '1', fields: {
    count: { location: 'local', validate: value => typeof value === 'number' },
    filter: { location: 'url', validate: value => typeof value === 'string' },
  } }, router: { mode: 'hash', routes: [{ path: '/', view: ({ bind }) => bind.count },
    { path: '/next', view: ({ bind }) => bind.filter }] } });
export async function runPersistenceTests(test, assert, throws, host) {
  const originalURL = location.href, originalState = history.state, namespace = 'browser-persistence';
  const key = 'mini-framework:' + namespace + ':local';
  const clean = (app, target) => {
    app.dispose(); assert(Object.values(resourceCounts(app)).every(n => n === 0)); target.remove();
    localStorage.removeItem(key); history.replaceState(originalState, '', originalURL);
  };
  await test('B.8 real Storage restores before first view, retains only selected fields and deduplicates writes', async () => {
    history.replaceState(originalState, '', originalURL.split('#')[0] + '#/'); localStorage.removeItem(key);
    const target = host(), first = createApp({ target, ...config(namespace) });
    try {
      first.actions.set(8); first.actions.filter('home'); first.flushPersistence();
      const stored = localStorage.getItem(key), url = location.href; assert(stored && target.textContent === '0');
      await frame(); assert(target.textContent === '8'); first.dispose();
      const next = createApp({ target, ...config(namespace) });
      try {
        assert(next.state.count === 8 && next.state.temp === 0 && next.state.filter === 'home' && target.textContent === '8');
        assert(location.href === url); const version = next.stateVersion;
        throws(next.actions.fail, undefined); // Checked separately below because application throws an ordinary Error.
        assert(next.stateVersion === version && localStorage.getItem(key) === stored && location.href === url);
        await turn();
      } finally { next.dispose(); }
    } finally { clean(first, target); }
  });
  await test('B.8 native History restores URL fields once with synchronized route/state and no feedback writes', async () => {
    history.replaceState(originalState, '', originalURL.split('#')[0] + '#/'); localStorage.removeItem(key);
    const target = host(), app = createApp({ target, ...config(namespace) }); let notifications = 0, latest;
    const observer = app.observe(() => [app.route.path, app.state.filter], () => { notifications++; latest = observer.read(); });
    const back = () => new Promise(resolve => { window.addEventListener('popstate', resolve, { once: true }); history.back(); });
    try {
      app.actions.filter('home'); app.navigate('/next'); app.actions.filter('next');
      const length = history.length, before = notifications; await back(); await frame();
      assert(latest[0] === '/' && latest[1] === 'home' && notifications === before + 1 && history.length === length);
    } finally { clean(app, target); }
  });
  await test('B.8 invalid external wire falls back before first view and explicit flush reports recoverable persistence errors', () => {
    history.replaceState(originalState, '', originalURL.split('#')[0] + '#/');
    localStorage.setItem(key, '{invalid'); const target = host(), phases = [];
    const app = createApp({ target, ...config(namespace), onError(error, { phase }) { phases.push(phase); } });
    try {
      assert(app.state.count === 0 && target.textContent === '0' && app.persistence.errors.length === 1);
      throws(app.flushPersistence, 'PERSIST_FAILED'); assert(phases.join(',') === 'persistence');
      assert(localStorage.getItem(key) === '{invalid' && !app.persistence.pending);
      app.actions.set(2); app.flushPersistence(); assert(localStorage.getItem(key) !== '{invalid');
    } finally { clean(app, target); }
  });
}
