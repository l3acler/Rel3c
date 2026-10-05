import { createApp, createActionSchema, hashSnapshot, div } from '../../src/index.js';
export async function runDeterminismTests({ test, host, assert, throws }) {
  await test('C.1 checkpoint graph/control continuation and SHA-256 match native browser crypto', async () => {
    const node = Object.assign(Object.create(null), { text: 'مرحبا 🎉', zero: -0, unset: undefined });
    const rows = new Array(3); rows[1] = node;
    const schema = createActionSchema({ version: 'browser-controls/1' })(({ action }) => ({
      draw: action((draft, services) => { draft.value = services.random(); draft.time = services.now(); }),
    }));
    const app = createApp({ initialState: { a: node, b: node, rows, value: 0, time: 0 }, schema, controls: { seed: 1, time: 5000 } });
    app.actions.draw(); const text = app.snapshot();
    const native = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    assert(hashSnapshot(text) === [...native].map(value => value.toString(16).padStart(2, '0')).join(''));
    const target = host(), restored = createApp({ snapshot: text, schema, target,
      view: ({ bind }) => div(bind.value, ':', bind.time) });
    assert(restored.state.a === restored.state.b && restored.state.a === restored.state.rows[1]);
    assert(Object.getPrototypeOf(restored.state.a) === null && Object.is(restored.state.a.zero, -0));
    assert(!(0 in restored.state.rows) && restored.state.value * 4294967296 === 270369);
    assert(restored.stateVersion === 2 && restored.controls.random.draws === 1 && restored.state.time === 5000);
    app.actions.draw(); restored.actions.draw(); restored.flush();
    assert(app.snapshot() === restored.snapshot() && target.textContent === restored.state.value + ':5000');
    app.dispose(); restored.dispose(); target.remove();
  });
  await test('C.2 browser actions roll back draws and revoke leaked services', () => {
    let leaked;
    const schema = createActionSchema()(({ action }) => ({
      fail: action((draft, services) => { leaked = services; draft.value = services.random(); throw Error('rollback'); }),
      draw: action((draft, services) => { draft.value = services.random(); }),
    }));
    const app = createApp({ initialState: { value: 0 }, schema }), before = app.snapshot();
    let failed = false; try { app.actions.fail(); } catch (error) { failed = error.message === 'rollback'; }
    assert(failed && app.snapshot() === before); throws(() => leaked.random(), 'CONTROL_EXPIRED');
    app.actions.draw(); assert(app.state.value * 4294967296 === 270369 && app.controls.random.draws === 1);
    throws(() => hashSnapshot(before + '\n'), 'SNAPSHOT_INVALID');
    const incompatible = JSON.parse(before); incompatible.runtimeVersion = 'other';
    throws(() => createApp({ schema, snapshot: JSON.stringify(incompatible) }), 'SNAPSHOT_INCOMPATIBLE'); app.dispose();
  });
  await test('C.1/C.2 manual inputs and restored draws match with different render-frame boundaries', async () => {
    const schema = createActionSchema()(({ action }) => ({
      draw: action((draft, services) => { draft.values.push(services.random()); draft.time = services.now(); }),
    }));
    const one = host(), two = host();
    const options = { schema, initialState: { values: [], time: 0 }, controls: { seed: 7 },
      view: ({ derive }) => div(derive(state => state.values.length)) };
    const app = createApp({ ...options, target: one }), other = createApp({ ...options, target: two });
    for (let i = 1; i <= 6; i++) { app.setLogicalTime(i*1000); app.actions.draw(); }
    for (let i = 1; i <= 6; i++) {
      other.setLogicalTime(i*1000); other.actions.draw(); other.flush();
      if (i % 2 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
    }
    app.flush(); assert(app.snapshot() === other.snapshot() && one.textContent === two.textContent);
    const restored = createApp({ schema, snapshot: app.snapshot() });
    for (const target of [app, other, restored]) { target.setLogicalTime(7000); target.actions.draw(); }
    assert(app.snapshot() === restored.snapshot() && hashSnapshot(other.snapshot()) === hashSnapshot(restored.snapshot()));
    app.dispose(); other.dispose(); restored.dispose(); one.remove(); two.remove();
  });
}
