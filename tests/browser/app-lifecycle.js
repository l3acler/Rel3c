// Browser instrumentation may construct fixtures/read DOM. Applications use public exports.
import { createApp, createActionSchema, FrameworkError, FRAMEWORK_INFO } from '../../src/index.js';
// Internal engine imports are test instrumentation, never normal application APIs.
import { createTransactionStore } from '../../src/runtime/state/transactions.js';
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
    assert(FRAMEWORK_INFO.phase.startsWith('A.3')); assert(Object.isFrozen(FRAMEWORK_INFO));
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
  await test('registered action wrappers execute synchronous commits and names are owned', () => {
    let calls = 0; const schema = createActionSchema({ version: 'test/1' })(({ action }) => ({
      increment: action(() => { calls++; }),
    }));
    const app = createApp({ schema }); assert(app.schemaVersion === 'test/1' && app.actionNames[0] === 'increment');
    assert(app.actions.increment() === undefined); throws(() => app.dispatch('missing'), 'ACTION_UNKNOWN');
    assert(calls === 1 && app.stateVersion === 2); app.dispose(); throws(() => app.actions.increment(), 'APP_DISPOSED');
  });
  await test('schema shared by apps does not share stores or disposal', () => {
    const schema = createActionSchema()(({ action }) => ({ run: action(() => {}) })); const initialState = { count: 0 };
    const a = createApp({ schema, initialState }); const b = createApp({ schema, initialState });
    assert(a.state !== b.state && a.actions !== b.actions); a.dispose();
    assert(b.state.count === 0); b.actions.run(); assert(b.stateVersion === 2); b.dispose();
  });
  await test('public action rollback preserves committed snapshots, text, native focus and selection', () => {
    const target = host(); const input = document.createElement('input'); input.value = 'native'; target.appendChild(input);
    input.focus(); input.setSelectionRange(1, 4); let context, draft;
    const schema = createActionSchema()(({ action }) => ({
      increment: action(state => { state.n++; }),
      fail: action(state => { draft = state; state.n++; throw new Error('rollback'); }),
    }));
    const app = createApp({ target, schema, initialState: { n: 0 }, view(received) { context = received; return String(received.state.n); } });
    const snapshot = app.state, text = target.lastChild; context.actions.increment();
    assert(context.state.n === 1 && snapshot.n === 0 && app.stateVersion === 2);
    let failed = false; try { app.actions.fail(); } catch (error) { failed = error.message === 'rollback'; }
    let revoked = false; try { draft.n++; } catch (error) { revoked = error instanceof TypeError; }
    assert(failed && revoked && app.state.n === 1 && app.stateVersion === 2);
    assert(target.lastChild === text && text.data === '0' && document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 4);
    app.dispose(); assert(target.firstChild === input); target.remove();
  });
  await test('public payload admission copies aliases and sparse arrays without invoking unsupported getters', () => {
    let calls = 0, gets = 0, captured; const shared = { n: -0 }, rows = new Array(3); rows[1] = shared;
    const payload = { a: shared, b: shared, rows };
    const schema = createActionSchema()(({ action }) => ({ put: action(value => {
      assert(Object.isFrozen(value.a) && value.a === value.b && value.rows[1] === value.a && !(0 in value.rows)); return true;
    }, (draft, value) => { calls++; captured = value; draft.saved = value; }) }));
    const app = createApp({ schema }); app.actions.put(payload); shared.n = 9;
    assert(captured !== payload && Object.is(app.state.saved.a.n, -0) && !Object.isFrozen(shared));
    const bad = Object.defineProperty({}, 'value', { enumerable: true, get() { gets++; return 1; } });
    throws(() => app.actions.put(bad), 'PAYLOAD_INVALID'); throws(() => app.actions.put(), 'ACTION_ARITY');
    assert(gets === 0 && calls === 1 && app.stateVersion === 2); app.dispose();
  });
  await test('public FIFO dispatch commits parent before children and runs grandchildren after siblings', () => {
    const schema = createActionSchema()(({ action }) => ({
      root: action(draft => { draft.rows.push('root'); app.actions.a(); app.actions.b(); assert(app.state.rows.length === 0); }),
      a: action(draft => { assert(app.stateVersion === 2); draft.rows.push('a'); app.actions.c(); }),
      b: action(draft => { draft.rows.push('b'); }), c: action(draft => { draft.rows.push('c'); }),
    }));
    const app = createApp({ schema, initialState: { rows: [] } }); app.actions.root();
    assert(app.state.rows.join(',') === 'root,a,b,c' && app.stateVersion === 5); app.dispose();
  });
  await test('failed public children discard descendants, continue siblings and report after draining', () => {
    let descendant = false, reports = 0;
    const schema = createActionSchema()(({ action }) => ({
      root: action(draft => { draft.n++; app.actions.bad(); app.actions.good(); }),
      bad: action(draft => { draft.n++; app.actions.descendant(); throw new Error('child'); }),
      good: action(draft => { draft.n++; }), descendant: action(() => { descendant = true; }),
    }));
    const app = createApp({ schema, initialState: { n: 0 }, onError(error, info) {
      reports++; assert(error.message === 'child' && info.phase === 'dispatch' && app.state.n === 2 && app.stateVersion === 3);
    } });
    let failed = false; try { app.actions.root(); } catch (error) { failed = error.message === 'child'; }
    assert(failed && reports === 1 && !descendant); app.dispose();
  });
  await test('public illegal async actions reject atomically and revoke post-await mutation', async () => {
    let lateError, thenCalls = 0; const schema = createActionSchema()(({ action }) => ({
      bad: action(async draft => { draft.n++; await Promise.resolve(); try { draft.n++; } catch (error) { lateError = error; } throw new Error('late'); }),
      masked: action(draft => {
        draft.n++; return Object.defineProperty(Promise.reject(new Error('masked')), 'then', { value: undefined });
      }),
      guard: action(() => ({ then() { thenCalls++; } }), draft => { draft.n++; }),
    }));
    const app = createApp({ schema, initialState: { n: 0 } }); throws(() => app.actions.bad(), 'ACTION_ASYNC');
    throws(() => app.actions.masked(), 'ACTION_ASYNC'); throws(() => app.actions.guard(null), 'PAYLOAD_ASYNC');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert(lateError instanceof TypeError && thenCalls === 0 && app.state.n === 0 && app.stateVersion === 1); app.dispose();
  });
  await test('public self-dispatch has a batch bound and recovers for a later call', () => {
    const schema = createActionSchema()(({ action }) => ({
      loop: action(draft => { draft.n++; app.actions.loop(); }), good: action(draft => { draft.n++; }),
    }));
    const app = createApp({ schema, initialState: { n: 0 } }); throws(() => app.actions.loop(), 'ACTION_QUEUE_LIMIT');
    assert(app.state.n === 1023 && app.stateVersion === 1024); app.actions.good(); assert(app.state.n === 1024); app.dispose();
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
  await test('A.2 transactions publish atomically and throwing bodies roll back', () => {
    const store = createTransactionStore({ n: 0, rows: [1, 2] }); const before = store.getState();
    const tx = store.begin(); tx.draft.n = 1; tx.draft.rows.reverse();
    assert(store.getState() === before && before.n === 0); const result = tx.commit();
    assert(result.version === 2 && result.state.n === 1 && result.state.rows.join(',') === '2,1');
    const published = store.getState(); const failure = Error('abort');
    try { store.run(draft => { draft.n = 9; throw failure; }); } catch (error) { assert(error === failure); }
    assert(store.getState() === published && store.getVersion() === 2); store.dispose();
  });
  await test('A.2 aliases, moved item identity and untouched branches survive native array operations', () => {
    const shared = { n: 0 }; const store = createTransactionStore({ a: shared, b: shared, rows: [shared, { n: 1 }], untouched: {} });
    const before = store.getState(), id = store.getObjectId(before.a);
    store.run(draft => { const held = draft.rows.shift(); draft.rows.push(held); held.n++; });
    const after = store.getState(); assert(after.a === after.b && after.a === after.rows[1]);
    assert(store.getObjectId(after.a) === id && after.a.n === 1 && before.a.n === 0 && after.untouched === before.untouched);
    store.dispose();
  });
  await test('A.2 committed metadata is exact and freezes supported data', () => {
    const store = createTransactionStore({ a: { n: -0 }, b: { n: 0 } }); const id = store.getObjectId(store.getState().a);
    const result = store.run(draft => { draft.a.n = 0; draft.a.extra = undefined; });
    assert(result.affectedProperties.length === 3 && result.affectedProperties.every(change => change.targetId === id));
    assert(Object.hasOwn(result.state.a, 'extra') && Object.isFrozen(result.state.a) && Object.isFrozen(result.changes)); store.dispose();
  });
  await test('A.2 successful no-op advances a version and native revocation also blocks reflection', () => {
    const store = createTransactionStore({ rows: [1] }); const before = store.getState(); const tx = store.begin(), held = tx.draft.rows;
    const result = tx.commit(); assert(result.isNoop && result.version === 2 && result.state === before);
    for (const read of [() => held.length, () => Object.isExtensible(held), () => Array.isArray(held)]) {
      let rejected = false; try { read(); } catch (error) { rejected = error instanceof TypeError; } assert(rejected);
    }
    store.dispose();
  });
  await test('A.2 array and depth growth limits reject without partial publication', () => {
    const store = createTransactionStore({ rows: [] }); const before = store.getState();
    throws(() => store.run(draft => { draft.rows[100000] = 1; }), 'STATE_LIMIT'); assert(store.getState() === before);
    throws(() => store.run(draft => { let node = draft; for (let i = 0; i < 128; i++) { node.child = {}; node = node.child; } }), 'STATE_LIMIT');
    assert(store.getState() === before && store.getVersion() === 1); store.dispose();
  });
  await test('A.2 illegal native async work is rejected and its late draft mutation is observed', async () => {
    let unhandled = 0; const handler = () => { unhandled++; }; window.addEventListener('unhandledrejection', handler);
    const store = createTransactionStore({ n: 0 });
    try {
      throws(() => store.run(async draft => { draft.n = 1; await 0; draft.n = 2; }), 'TRANSACTION_ASYNC');
      await new Promise(resolve => setTimeout(resolve, 20));
      assert(store.getVersion() === 1 && store.getState().n === 0 && unhandled === 0);
    } finally { store.dispose(); window.removeEventListener('unhandledrejection', handler); }
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
