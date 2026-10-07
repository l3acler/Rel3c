// Consumer contract checks use the package entry; fixtures supply only a browser double.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as framework from 'mini-framework';
import { fakeBrowser } from './helpers/fake-browser.js';
const { createApp, createActionSchema, FrameworkError, div, keyed } = framework;
const code = name => error => error instanceof FrameworkError && error.code === name && error.message.includes(name);

test('B.9 package exports match the documented browser surface', () => {
  assert.deepEqual(Object.keys(framework).sort(), [
    'VERSION', 'FRAMEWORK_INFO', 'FrameworkError', 'createApp', 'createActionSchema', 'hashSnapshot', 'readRecording', 'serializeRecording', 'createReplay', 'createHistory', 'createDiagnostics', 'createInspector',
    'element', 'div', 'span', 'p', 'button', 'form', 'label', 'input', 'textarea',
    'select', 'option', 'section', 'a', 'ul', 'li', 'when', 'keyed', 'outlet', 'derive',
  ].sort());
  assert.equal(framework.VERSION, framework.FRAMEWORK_INFO.version);
  assert.ok(Object.isFrozen(framework.FRAMEWORK_INFO.capabilities));
});

test('B.9 JavaScript payload admission rejects unknown actions, native values and accessors before mutation', () => {
  let calls = 0, getters = 0;
  const schema = createActionSchema()(({ action }) => ({
    update: action(value => typeof value === 'string', (draft, value) => { calls++; draft.name = value; }),
  }));
  const app = createApp({ schema, initialState: { name: 'Ada' } }), state = app.state;
  assert.throws(() => app.dispatch('missing'), code('ACTION_UNKNOWN'));
  assert.throws(() => app.actions.update(), code('ACTION_ARITY'));
  for (const value of [new Date(), new Event('input'), NaN, { get name() { getters++; return 'bad'; } }])
    assert.throws(() => app.actions.update(value), code('PAYLOAD_INVALID'));
  assert.throws(() => app.actions.update(12), code('PAYLOAD_INVALID'));
  assert.equal(calls, 0); assert.equal(getters, 0); assert.equal(app.state, state); assert.equal(app.stateVersion, 1);
  app.actions.update('Grace'); assert.equal(calls, 1); assert.equal(app.state.name, 'Grace'); app.dispose();
});

test('B.9 frozen snapshots and tracked reads both reject writes through public state', () => {
  const app = createApp({ initialState: { nested: { n: 1 } } });
  assert.throws(() => { app.state.nested.n = 2; }, TypeError);
  assert.throws(() => app.observe(state => { state.nested.n = 2; }), code('STATE_READONLY'));
  assert.equal(app.state.nested.n, 1); assert.equal(app.stateVersion, 1); app.dispose();
});

test('B.9 computed cycle diagnostics identify the public read cycle without a commit', () => {
  const app = createApp({ initialState: {} });
  const first = app.computed(() => second.value), second = app.computed(() => first.value);
  assert.throws(() => first.value, error => code('COMPUTED_CYCLE')(error) && error.message.includes('->'));
  assert.equal(app.stateVersion, 1); app.dispose();
});

test('B.9 missing and duplicate list keys fail mounting with a reusable target', () => {
  for (const [key, errorCode] of [[() => undefined, 'LIST_KEY_MISSING'], [() => 'same', 'LIST_KEY_DUPLICATE']]) {
    const { target } = fakeBrowser();
    const app = createApp({ initialState: { rows: [{ id: 1 }, { id: 2 }] },
      view: ({ bind }) => div(keyed(bind.rows, key, () => div('row'))) });
    assert.throws(() => app.mount(target), code(errorCode)); assert.equal(app.status, 'created');
    assert.equal(target.childNodes.length, 0); app.dispose();
    const retry = createApp({ target, view: () => 'healthy' }); assert.equal(target.textContent, 'healthy'); retry.dispose();
  }
});

test('B.9 render-time actions fail at a public boundary and release mount resources', () => {
  const { target } = fakeBrowser();
  const schema = createActionSchema()(({ action }) => ({ edit: action(draft => { draft.n++; }) }));
  const app = createApp({ initialState: { n: 0 }, schema, view: ({ actions }) => { actions.edit(); return div(); } });
  assert.throws(() => app.mount(target), code('ACTION_REENTRANT'));
  assert.equal(app.state.n, 0); assert.equal(app.stateVersion, 1); assert.equal(target.childNodes.length, 0); app.dispose();
});

test('B.9 sync error hooks observe original errors; async hooks aggregate after rollback', () => {
  let phase, original;
  const app = createApp({ onError(error, info) { original = error; phase = info.phase; assert.ok(Object.isFrozen(info)); } });
  assert.throws(() => app.dispatch('missing'), error => error === original && code('ACTION_UNKNOWN')(error));
  assert.equal(phase, 'dispatch'); app.dispose();
  const illegal = createApp({ onError: async () => {} });
  assert.throws(() => illegal.dispatch('missing'), error => error instanceof AggregateError
    && code('ACTION_UNKNOWN')(error.errors[0]) && code('ERROR_HANDLER_ASYNC')(error.errors[1]));
  assert.equal(illegal.stateVersion, 1); illegal.dispose();
});
