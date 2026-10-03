import { createApp, createActionSchema } from '../../src/index.js';

export async function runReactivityTests(test, assert, throws, host) {
  const fixture = (initialState, actions) => createApp({ initialState,
    schema: createActionSchema()(({ action }) => Object.fromEntries(
      Object.entries(actions).map(([name, run]) => [name, action(run)]))) });
  await test('A.4 browser: aliases and independent nested fields invalidate exactly', () => {
    const shared = { n: 0, other: 0 }; let notifications = 0, unrelated = 0;
    const app = fixture({ a: shared, b: shared }, { edit: d => { d.b.n++; } });
    const n = app.observe(function(s) { assert(this === undefined); return s.a.n; }, function() {
      assert(this === undefined); notifications++;
    });
    app.observe(s => s.a.other, () => { unrelated++; });
    app.actions.edit(); assert(notifications === 1 && unrelated === 0 && n.read() === 1); app.dispose();
  });
  await test('A.4 browser: presence/key reads and sparse array reflection follow native behavior', () => {
    const rows = new Array(3); rows[1] = { n: 0 };
    const app = fixture({ rows }, { fill: d => { d.rows[0] = undefined; }, edit: d => { d.rows[1].n++; } });
    let structure = 0, length = 0, keys = 0, presence = 0;
    const list = app.observe(s => [...s.rows], () => { structure++; });
    app.observe(s => s.rows.length, () => { length++; });
    app.observe(s => Object.keys(s.rows), () => { keys++; });
    const own = app.observe(s => Object.hasOwn(s.rows, '0'), () => { presence++; });
    assert(!own.read()); app.actions.edit(); assert(structure === 0 && keys === 0);
    app.actions.fill(); assert(structure === 1 && keys === 1 && presence === 1 && length === 0);
    assert(own.read() && list.read().length === 3); app.dispose();
  });
  await test('A.4 browser: dynamic branch reads replace stale dependencies', () => {
    const app = fixture({ left: true, a: 1, b: 2 }, {
      toggle: d => { d.left = false; }, a: d => { d.a++; }, b: d => { d.b++; },
    });
    let calls = 0; const selected = app.observe(s => s.left ? s.a : s.b, () => { calls++; });
    app.actions.toggle(); assert(selected.read() === 2); app.actions.a(); assert(calls === 1 && !selected.dirty);
    app.actions.b(); assert(calls === 2 && selected.read() === 3); app.dispose();
  });
  await test('A.4 browser: captured items retain identity across reorder and reject after detach', () => {
    const app = fixture({ rows: [{ n: 0 }, { n: 9 }] }, {
      move: d => { d.rows.reverse(); }, edit: d => { d.rows[1].n++; }, remove: d => { d.rows.pop(); },
    });
    let item, calls = 0;
    const capture = app.observe(s => { item = s.rows[0]; }); capture.dispose();
    const observed = app.observe(() => item.n, () => { calls++; });
    app.actions.move(); assert(calls === 0); app.actions.edit(); assert(calls === 1 && observed.read() === 1);
    app.actions.remove(); throws(() => observed.read(), 'STATE_DETACHED'); app.dispose();
  });
  await test('A.5 browser: lazy caches and diamonds recompute once when observed', () => {
    const app = fixture({ n: 1 }, { edit: d => { d.n++; } });
    let sourceReads = 0, sumReads = 0;
    const source = app.computed(function(s) { assert(this === undefined); sourceReads++; return s.n; });
    const left = app.computed(() => source.value + 1), right = app.computed(() => source.value * 2);
    const sum = app.computed(() => { sumReads++; return left.value + right.value; });
    assert(sourceReads === 0 && sumReads === 0 && sum.value === 4);
    const observer = app.observe(() => sum.value);
    app.actions.edit(); app.actions.edit(); assert(sourceReads === 1 && sumReads === 1 && observer.dirty);
    assert(observer.read() === 10 && sourceReads === 2 && sumReads === 2); app.dispose();
  });
  await test('A.5 browser: cached object facades preserve downstream COW reads', () => {
    const app = fixture({ user: { n: 0 } }, { edit: d => { d.user.n++; } });
    const user = app.computed(s => s.user), n = app.computed(() => user.value.n);
    assert(n.value === 0); app.actions.edit(); assert(!user.dirty && n.dirty && n.value === 1);
    throws(() => { user.value.n++; }, 'STATE_READONLY'); app.dispose();
  });
  await test('A.5 browser: indirect cycles report the chain and can recover', () => {
    const app = fixture({ cycle: true }, { recover: d => { d.cycle = false; } });
    const a = app.computed(s => s.cycle ? b.value : 7), b = app.computed(() => a.value);
    const error = throws(() => a.value, 'COMPUTED_CYCLE');
    assert(error.message.includes('computed#1 -> computed#2 -> computed#1'));
    app.actions.recover(); assert(a.value === 7 && b.value === 7); app.dispose();
  });
  await test('A.4/A.5 browser: rollback and no-op actions do not dirty dependencies or alter focus/text', () => {
    const target = host(), input = document.createElement('input'); input.value = 'native'; target.appendChild(input);
    const app = createApp({ target, initialState: { n: 0 }, view: ({ state }) => String(state.n),
      schema: createActionSchema()(({ action }) => ({
        noop: action(() => {}), fail: action(d => { d.n++; throw Error('abort'); }),
      })) });
    input.focus(); input.setSelectionRange(1, 3);
    const text = target.lastChild, result = app.computed(s => s.n);
    const observer = app.observe(() => result.value);
    app.actions.noop(); try { app.actions.fail(); } catch (error) { assert(error.message === 'abort'); }
    assert(!observer.dirty && !result.dirty && target.lastChild === text && text.data === '0');
    assert(document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 3);
    app.dispose(); assert(target.firstChild === input); target.remove();
  });
  await test('A.4/A.5 browser: failed mount and terminal app disposal release reactive scopes', () => {
    const target = host(); let value, observer, context, fail = true, notifications = 0;
    const app = createApp({ initialState: { n: 0 }, view(c) {
      context = c; value = c.computed(s => s.n); observer = c.observe(() => value.value, () => { notifications++; });
      if (fail) throw Error('mount'); return String(value.value);
    } });
    throws(() => app.mount(target), 'VIEW_FAILED'); throws(() => value.value, 'SCOPE_DISPOSED');
    throws(() => observer.read(), 'SCOPE_DISPOSED'); throws(() => context.computed(() => 1), 'SCOPE_DISPOSED');
    fail = false; app.mount(target); app.dispose(); assert(notifications === 0 && !target.firstChild);
    throws(() => value.value, 'SCOPE_DISPOSED'); target.remove();
  });
  await test('A.4/A.5 browser: async computations reject without native unhandled rejections', async () => {
    let unhandled = 0; const listener = () => { unhandled++; };
    window.addEventListener('unhandledrejection', listener);
    const app = createApp();
    try {
      const value = app.computed(async () => { throw Error('async computed'); });
      throws(() => value.value, 'REACTIVITY_ASYNC');
      throws(() => app.observe(async () => { throw Error('async read'); }), 'REACTIVITY_ASYNC');
      await new Promise(resolve => setTimeout(resolve, 20)); assert(unhandled === 0);
    } finally { app.dispose(); window.removeEventListener('unhandledrejection', listener); }
  });
}
