// Browser instrumentation may construct fixtures/read DOM. Applications use public exports.
import { createApp, createActionSchema, FrameworkError, FRAMEWORK_INFO } from '../../src/index.js';
const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
const throws = (run, code) => {
  try { run(); } catch (error) { assert(error.code === code, 'Expected ' + code + ', got ' + error); return error; }
  throw new Error('Expected failure: ' + code);
};

window.runAppLifecycleTests = async () => {
  const results = []; const fixtures = document.getElementById('fixtures');
  const test = async (name, run) => {
    try { await run(); results.push({ name, passed: true }); }
    catch (error) { throw new Error(name + ': ' + error.message); }
  };
  const host = () => { const element = document.createElement('section'); fixtures.appendChild(element); return element; };
  await test('default mount resolves #app only at mount time and preserves host children', () => {
    const target = host(); target.id = 'app'; const foreign = document.createTextNode('host '); target.appendChild(foreign);
    let calls = 0; const app = createApp({ view: () => { calls++; return 'owned'; } });
    assert(app.status === 'created' && calls === 0 && target.textContent === 'host ');
    const { mount } = app; assert(mount() === app && calls === 1 && target.textContent === 'host owned');
    app.dispose(); assert(target.childNodes.length === 1 && target.firstChild === foreign); target.remove();
  });
  await test('missing default target fails before view invocation and retries when #app appears', () => {
    let calls = 0; const app = createApp({ view: () => { calls++; return 'retry'; } });
    const error = throws(() => app.mount(), 'TARGET_INVALID');
    assert(error.message.includes('id is "app"') && app.status === 'created' && calls === 0);
    const target = host(); target.id = 'app'; app.mount(undefined);
    assert(app.mounted && calls === 1 && target.textContent === 'retry'); app.dispose(); target.remove();
  });
  await test('explicit invalid/custom targets never silently use available #app', () => {
    const target = host(); target.id = 'app'; const custom = host(); const app = createApp({ view: () => 'custom' });
    for (const invalid of [null, '#app', {}, { nodeType: 1 }]) throws(() => app.mount(invalid), 'TARGET_INVALID');
    throws(() => createApp({ target: null }), 'TARGET_INVALID'); assert(!target.firstChild);
    app.mount(custom); assert(custom.textContent === 'custom' && !target.firstChild);
    app.dispose(); custom.remove(); target.remove();
  });
  await test('default mount preserves exclusive ownership and lifecycle errors without a target', () => {
    const target = host(); target.id = 'app'; const a = createApp(); const b = createApp();
    a.mount(); throws(() => a.mount(), 'APP_MOUNTED'); throws(() => b.mount(), 'TARGET_OWNED');
    a.dispose(); b.mount(); assert(b.mounted); b.dispose(); target.remove();
    throws(() => a.mount(), 'APP_DISPOSED');
  });
  await test('public browser-native module exports current lifecycle metadata', () => {
    assert(FRAMEWORK_INFO.phase.startsWith('A.1')); assert(Object.isFrozen(FRAMEWORK_INFO));
    assert(typeof createActionSchema === 'function' && typeof FrameworkError === 'function');
  });
  await test('lazy create, explicit mount, terminal/idempotent dispose', () => {
    let calls = 0; const target = host(); const app = createApp({ view: () => { calls++; return 'hello'; } });
    assert(app.status === 'created' && calls === 0); assert(app.mount(target) === app);
    assert(app.mounted && calls === 1 && target.textContent === 'hello'); app.dispose(); app.dispose();
    assert(app.status === 'disposed' && target.childNodes.length === 0); throws(() => app.mount(target), 'APP_DISPOSED'); target.remove();
  });
  await test('configured target mounts automatically with immutable context', () => {
    const target = host(); let received;
    const app = createApp({ target, initialState: { message: 'text' }, view(context) { received = context; return context.state.message; } });
    assert(Object.isFrozen(received) && received.state === app.state && received.actions === app.actions);
    assert(app.mounted && target.textContent === 'text'); app.dispose(); target.remove();
  });
  await test('owned initial state is deep read-only without freezing caller data', () => {
    const caller = { nested: { count: 1 } }; const app = createApp({ initialState: caller }); caller.nested.count = 2;
    assert(app.state.nested.count === 1 && !Object.isFrozen(caller.nested));
    let failed = false; try { app.state.nested.count = 3; } catch { failed = true; }
    assert(failed && app.state.nested.count === 1); app.dispose();
  });
  await test('aliases, holes and null prototypes preserve meaning in native JS', () => {
    const shared = Object.assign(Object.create(null), { n: -0 }); const rows = new Array(3); rows[1] = shared;
    const app = createApp({ initialState: { a: shared, b: shared, rows } });
    assert(app.state.a === app.state.b && app.state.a === app.state.rows[1]);
    assert(Object.getPrototypeOf(app.state.a) === null && Object.is(app.state.a.n, -0));
    assert(!(0 in app.state.rows) && app.state.rows.length === 3); app.dispose();
  });
  await test('dynamic text cannot inject HTML', () => {
    const target = host(); const text = '<img src=x onerror="window.injected=true"><script>bad</script>';
    const app = createApp({ target, view: () => text });
    assert(target.childNodes.length === 1 && target.firstChild.nodeType === Node.TEXT_NODE);
    assert(target.textContent === text && !target.querySelector('img,script')); app.dispose(); target.remove();
  });
  await test('host children, native focus and selection survive mount/dispose', () => {
    const target = host(); const input = document.createElement('input'); input.value = 'native'; target.appendChild(input);
    input.focus(); input.setSelectionRange(1, 4); const app = createApp({ target, view: () => 'owned' });
    assert(document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 4);
    app.dispose(); assert(target.firstChild === input && target.childNodes.length === 1);
    assert(document.activeElement === input && input.value === 'native'); target.remove();
  });
  await test('target claim is exclusive and released after disposal', () => {
    const target = host(); const a = createApp({ target }); const b = createApp();
    throws(() => b.mount(target), 'TARGET_OWNED'); a.dispose(); b.mount(target); b.dispose(); target.remove();
  });
  await test('invalid DOM-like targets/documents/shadow roots reject', () => {
    const app = createApp(); const element = document.createElement('div'); const shadow = element.attachShadow({ mode: 'open' });
    for (const target of [null, {}, { nodeType: 1 }, document, document.createTextNode('x'), shadow]) throws(() => app.mount(target), 'TARGET_INVALID');
    app.dispose();
  });
  await test('same app cannot double-mount or move to another target', () => {
    const first = host(); const second = host(); const app = createApp({ target: first, view: () => 'first' });
    throws(() => app.mount(second), 'APP_MOUNTED'); assert(second.childNodes.length === 0 && first.textContent === 'first');
    app.dispose(); first.remove(); second.remove();
  });
  await test('failed view unwinds its scope and permits retry on the same target', () => {
    let attempts = 0; let cleanups = 0; let stale; const target = host();
    const app = createApp({ view(context) { attempts++; context.onDispose(() => { cleanups++; });
      if (attempts === 1) { stale = context; throw new Error('first mount'); } return 'second'; } });
    throws(() => app.mount(target), 'VIEW_FAILED'); assert(app.status === 'created' && cleanups === 1 && !target.firstChild);
    app.mount(target); throws(() => stale.onDispose(() => {}), 'SCOPE_DISPOSED');
    app.dispose(); assert(cleanups === 2 && !target.firstChild); target.remove();
  });
  await test('cleanup is reverse-order and repeated disposal does not rerun it', () => {
    const sequence = []; const target = host();
    const app = createApp({ view({ onDispose }) { onDispose(() => { sequence.push('view'); }); return ''; } });
    app.onDispose(() => { sequence.push('first'); }); app.onDispose(() => { sequence.push('last'); });
    app.mount(target); app.dispose(); app.dispose(); assert(sequence.join(',') === 'view,last,first'); target.remove();
  });
  await test('cleanup errors do not block later cleanup/DOM removal/claim release', () => {
    let cleaned = false; const target = host(); const app = createApp({ target });
    app.onDispose(() => { cleaned = true; }); app.onDispose(() => { throw Error('cleanup'); });
    try { app.dispose(); } catch (error) { assert(error instanceof AggregateError && error.errors.length === 1); }
    assert(cleaned && app.status === 'disposed' && !target.firstChild); const next = createApp({ target }); next.dispose(); target.remove();
  });
  await test('owned node removal follows a moved node but does not remove unrelated nodes', () => {
    const first = host(); const second = host(); const other = document.createTextNode('foreign'); second.appendChild(other);
    const app = createApp({ target: first, view: () => 'owned' }); second.appendChild(first.firstChild); app.dispose();
    assert(second.childNodes.length === 1 && second.firstChild === other); first.remove(); second.remove();
  });
  await test('registered action wrappers are inert until A.3 and names are owned', () => {
    let calls = 0; const schema = createActionSchema({ version: 'test/1' })(({ action }) => ({
      increment: action(() => { calls++; }),
    }));
    const app = createApp({ schema }); assert(app.schemaVersion === 'test/1' && app.actionNames[0] === 'increment');
    throws(() => app.actions.increment(), 'FEATURE_UNAVAILABLE'); throws(() => app.dispatch('missing'), 'ACTION_UNKNOWN');
    assert(calls === 0 && app.stateVersion === 1); app.dispose(); throws(() => app.actions.increment(), 'APP_DISPOSED');
  });
  await test('schema shared by apps does not share stores or disposal', () => {
    const schema = createActionSchema()(({ action }) => ({ run: action(() => {}) })); const initialState = { count: 0 };
    const a = createApp({ schema, initialState }); const b = createApp({ schema, initialState });
    assert(a.state !== b.state && a.actions !== b.actions); a.dispose();
    assert(b.state.count === 0); throws(() => b.actions.run(), 'FEATURE_UNAVAILABLE'); b.dispose();
  });
  await test('view mutation fails before publishing text', () => {
    const target = host(); const app = createApp({ initialState: { count: 0 }, view({ state }) { state.count++; return ''; } });
    throws(() => app.mount(target), 'VIEW_FAILED'); assert(app.state.count === 0 && !target.firstChild); app.dispose(); target.remove();
  });
  await test('Promise-returning views reject with cleanup and no unhandled native rejection', async () => {
    const target = host(); let unhandled = 0; const handler = () => { unhandled++; };
    window.addEventListener('unhandledrejection', handler);
    const app = createApp({ view: async () => { throw Error('illegal async view'); } });
    throws(() => app.mount(target), 'VIEW_RESULT_INVALID'); app.dispose();
    await new Promise(resolve => setTimeout(resolve, 20)); window.removeEventListener('unhandledrejection', handler);
    assert(unhandled === 0 && !target.firstChild); target.remove();
  });
  await test('DOM state and unsupported Array prototypes reject', () => {
    throws(() => createApp({ initialState: { element: document.createElement('div') } }), 'STATE_INVALID');
    throws(() => createApp({ initialState: { rows: new (class Rows extends Array {})() } }), 'STATE_INVALID');
  });
  await test('iframe DOM targets work while foreign-realm state is not normalized', () => {
    const frame = document.createElement('iframe'); fixtures.appendChild(frame);
    const target = frame.contentDocument.body; const app = createApp({ target, view: () => 'iframe-owned' });
    assert(target.textContent === 'iframe-owned'); app.dispose(); assert(!target.firstChild);
    throws(() => createApp({ initialState: new frame.contentWindow.Array() }), 'STATE_INVALID'); frame.remove();
  });
  await test('detached DOM targets can mount and dispose without a connected page', () => {
    const target = document.createElement('div'); const app = createApp({ target, view: () => 'detached' });
    assert(!target.isConnected && target.textContent === 'detached'); app.dispose(); assert(!target.firstChild);
  });
  await test('100 cycles return owned nodes, cleanup counts and target claims to baseline', () => {
    const target = host(); let resources = 0;
    for (let i = 0; i < 100; i++) {
      const app = createApp({ target, view({ onDispose }) { resources++; onDispose(() => { resources--; }); return 'cycle'; } });
      assert(target.childNodes.length === 1 && resources === 1); app.dispose(); assert(!target.firstChild && resources === 0);
    }
    target.remove(); assert(fixtures.childNodes.length === 0);
  });
  return { passed: results.length, results };
};
