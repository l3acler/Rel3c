import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, button, input, textarea, form } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeDocument } from './helpers/fake-dom.js';
const code = expected => error => error.code === expected;
const empty = app => assert.ok(Object.values(resourceCounts(app)).every(value => value === 0));
function setup(view) {
  const document = fakeDocument(), target = document.createElement();
  const app = createApp({ target, initialState: { text: 'initial', show: true, count: 0 },
    schema: createActionSchema()(({ action }) => ({
      text: action(value => typeof value === 'string', (d, value) => { d.text = value; }),
      toggle: action(d => { d.show = !d.show; }), increment: action(d => { d.count++; }),
    })), view });
  return { app, document, target, node: target.childNodes[0] };
}
const fire = (node, type, fields = {}) => node.dispatchEvent({ type, ...fields });

test('B.1 event maps own options and preserve currentTarget, native target, capture and child-to-parent order', () => {
  const order = []; let saved;
  const registration = { handler: context => { saved = context; order.push('child'); } };
  const descriptor = button({ on: { click: registration } }, 'go'); registration.handler = () => { throw Error('caller mutation'); };
  const { app, node } = setup(() => div({ on: { click: { capture: true, handler: () => order.push('capture') } } },
    div({ on: { click: () => order.push('parent') } }, descriptor)));
  const child = node.childNodes[0].childNodes[0]; fire(child, 'click');
  assert.deepEqual(order, ['capture', 'child', 'parent']);
  assert.equal(saved.target, child); assert.equal(saved.currentTarget, child); assert.ok(Object.isFrozen(saved));
  assert.equal(saved.nativeEvent.currentTarget, null); app.dispose(); empty(app);
});

test('B.1 framework cancellation stops ancestors and reports native default prevention', () => {
  let parent = 0, saved;
  const { app, node } = setup(() => div({ on: { click: () => parent++ } },
    button({ on: { click: context => { saved = context; context.preventDefault(); context.stopPropagation(); } } }, 'go')));
  const event = { type: 'click', cancelable: true };
  assert.equal(node.childNodes[0].dispatchEvent(event), false); assert.equal(parent, 0); assert.equal(saved.defaultPrevented, true);
  app.dispose(); empty(app);
});

test('B.1 once is consumed before a throwing handler; passive cancellation fails without preventing defaults', () => {
  let calls = 0;
  const { app, node } = setup(() => button({ on: { click: { once: true, handler: () => { calls++; throw Error('once'); } } } }));
  assert.throws(() => node.click(), /once/); node.click(); assert.equal(calls, 1); assert.equal(resourceCounts(app).listeners, 0);
  app.dispose(); empty(app);
  const passive = setup(() => button({ on: { click: { passive: true, handler: context => context.preventDefault() } } }));
  const event = { type: 'click', cancelable: true };
  assert.throws(() => passive.node.dispatchEvent(event), code('EVENT_PASSIVE')); assert.equal(event.defaultPrevented, false);
  passive.app.dispose(); empty(passive.app);
});

test('B.1 scroll uses a direct listener and submit can explicitly cancel native default', () => {
  let scroll = 0, submitted = 0;
  const { app, node } = setup(() => div({ on: { scroll: () => scroll++ } }, form({ on: { submit: context => { submitted++; context.preventDefault(); } } })));
  fire(node.childNodes[0], 'scroll', { bubbles: false }); assert.equal(scroll, 0);
  fire(node, 'scroll', { bubbles: false }); assert.equal(scroll, 1);
  assert.equal(fire(node.childNodes[0], 'submit', { cancelable: true }), false); assert.equal(submitted, 1); app.dispose(); empty(app);
});

test('B.1 event configuration rejects invalid types/options, accessors and duplicates without running getters', () => {
  for (const [props, expected] of [
    [{ on: { Click() {} } }, 'EVENT_TYPE_INVALID'], [{ on: { click: {} } }, 'EVENT_HANDLER_INVALID'],
    [{ on: { click: { handler() {}, capture: 'yes' } } }, 'EVENT_OPTIONS_INVALID'],
    [{ on: { click: { handler() {}, signal: {} } } }, 'EVENT_OPTIONS_INVALID'],
    [{ on: { click() {} }, onClick() {} }, 'EVENT_DUPLICATE'],
    [{ on: { get click() { throw Error('getter ran'); } } }, 'EVENT_OPTIONS_INVALID'],
  ]) assert.throws(() => button(props), code(expected));
});

test('B.1 async handlers reject, healthy ancestors run, and recursive events are guarded', async () => {
  let parent = 0;
  const { app, node } = setup(() => div({ on: { click: () => parent++ } }, button({ on: { click: async () => { throw Error('illegal'); } } })));
  assert.throws(() => node.childNodes[0].click(), code('EVENT_ASYNC')); assert.equal(parent, 1);
  app.dispose(); empty(app); await new Promise(resolve => setImmediate(resolve));
  let recursive;
  const other = setup(() => button({ on: { click: () => recursive.click() } })); recursive = other.node;
  assert.throws(() => recursive.click(), code('EVENT_REENTRANT')); other.app.dispose(); empty(other.app);
});

test('B.2 held keys, repeat, modifiers and releases are immutable serializable semantic inputs', () => {
  const values = [];
  const { app, node } = setup(() => input({ onKey: value => values.push(value) }));
  fire(node, 'keydown', { key: 'A', code: 'KeyA', shiftKey: true, location: 0 });
  fire(node, 'keydown', { key: 'A', code: 'KeyA', shiftKey: true, repeat: true });
  fire(node, 'keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true, location: 1 });
  fire(node, 'keyup', { key: 'a', code: 'KeyA' });
  assert.equal(values[1].repeat, true); assert.equal(values[1].held.length, 1); assert.equal(values[2].held.length, 2);
  assert.equal(values[0].shiftKey, true); assert.equal(values[3].held[0].code, 'ControlLeft');
  assert.deepEqual(JSON.parse(JSON.stringify(values[0])), values[0]); assert.ok(Object.isFrozen(values[0].held[0]));
  app.dispose(); empty(app);
});

test('B.2 focus moving inside a keyboard scope retains held keys; focus exit/window blur/hidden reset once', () => {
  const values = [];
  const { app, document, node } = setup(() => div({ onKey: value => values.push(value) }, input(), button('go')));
  const field = node.childNodes[0], other = node.childNodes[1];
  fire(field, 'keydown', { key: 'x', code: 'KeyX' }); fire(field, 'focusout', { relatedTarget: other });
  assert.equal(values.length, 1);
  fire(other, 'focusout', { relatedTarget: null }); assert.equal(values[1].reason, 'focus'); assert.deepEqual(values[1].held, []);
  fire(field, 'keydown', { key: 'x', code: 'KeyX' }); fire(document.defaultView, 'blur', { bubbles: false });
  fire(document.defaultView, 'blur', { bubbles: false }); assert.equal(values.length, 4); assert.equal(values[3].reason, 'window-blur');
  fire(field, 'keydown', { key: 'x', code: 'KeyX' }); document.visibilityState = 'hidden'; fire(document, 'visibilitychange');
  assert.equal(values[5].reason, 'hidden'); app.dispose(); empty(app);
});

test('B.2 shortcuts can explicitly cancel defaults while native events never enter action payloads', () => {
  let data;
  const { app, node } = setup(({ actions }) => input({ onKey: (value, context) => {
    data = value;
    if (value.ctrlKey && value.key === 's') { context.preventDefault(); actions.increment(); }
  } }));
  assert.equal(fire(node, 'keydown', { key: 's', code: 'KeyS', ctrlKey: true }), false);
  assert.equal(app.state.count, 1); assert.equal(data.type, 'keydown'); assert.equal('nativeEvent' in data, false);
  app.dispose(); empty(app);
});

test('B.3 ordinary edits, paste and deletion dispatch actual control values with selection snapshots', () => {
  const values = [];
  const { app, node } = setup(({ bind, actions }) => textarea({ value: bind.text, onText: value => { values.push(value); actions.text(value.value); } }));
  node.value = 'مرحبا 😀'; node.setSelectionRange(2, 4, 'backward');
  fire(node, 'paste'); assert.equal(values.length, 0);
  fire(node, 'input', { inputType: 'insertFromPaste', data: null });
  assert.equal(values[0].value, 'مرحبا 😀'); assert.equal(values[0].inputType, 'insertFromPaste'); assert.equal(values[0].selectionDirection, 'backward');
  app.flush(); assert.equal(node.value, 'مرحبا 😀'); assert.equal(app.state.text, node.value);
  node.value = ''; fire(node, 'input', { inputType: 'deleteContentBackward' }); app.flush(); assert.equal(app.state.text, '');
  assert.deepEqual(JSON.parse(JSON.stringify(values[0])), values[0]); app.dispose(); empty(app);
});

test('B.3 active composition survives external commits and resumes from latest state after acceptance', () => {
  const values = [];
  const { app, document, node } = setup(({ bind, actions }) => input({ value: bind.text, onText: value => { values.push(value); actions.text(value.value); } }));
  node.focus(); fire(node, 'compositionstart'); node.value = 'に';
  fire(node, 'input', { isComposing: true, data: 'に', inputType: 'insertCompositionText' });
  assert.equal(app.state.text, 'に'); document.flushFrame(); assert.equal(node.value, 'に');
  app.actions.text('remote'); app.flush(); assert.equal(node.value, 'に');
  node.value = '日本'; fire(node, 'compositionend', { data: '日本' });
  fire(node, 'input', { inputType: 'insertFromComposition', data: '日本' });
  assert.equal(values.length, 2); assert.equal(values[1].phase, 'commit'); assert.equal(values[1].isComposing, false);
  app.flush(); assert.equal(node.value, '日本'); assert.equal(app.state.text, '日本'); app.dispose(); empty(app);
});

test('B.3 bound controls without onText also protect composition; blur reconciles the latest external value', () => {
  const { app, node } = setup(({ bind }) => input({ value: bind.text }));
  fire(node, 'compositionstart'); node.value = 'live'; app.actions.text('external'); app.flush(); assert.equal(node.value, 'live');
  fire(node, 'blur', { bubbles: false }); app.flush(); assert.equal(node.value, 'external'); app.dispose(); empty(app);
});

test('B.3 differing bound values preserve and clamp active selection; equal values require no native setter', () => {
  const { app, node } = setup(({ bind }) => textarea({ value: bind.text })); node.focus(); node.setSelectionRange(2, 5, 'backward');
  app.actions.text('abc'); app.flush(); assert.equal(node.selectionStart, 2); assert.equal(node.selectionEnd, 3); assert.equal(node.selectionDirection, 'backward');
  let writes = 0, value = node.value; Object.defineProperty(node, 'value', { get: () => value, set: next => { writes++; value = next; } });
  app.actions.text('abc'); app.flush(); assert.equal(writes, 0); app.dispose(); empty(app);
});

test('B.3 canceled composition and final input are deduplicated; changed selection alone is presentation', () => {
  const values = [];
  const { app, node } = setup(() => textarea({ onText: value => values.push(value) }));
  fire(node, 'compositionstart'); node.value = '한'; fire(node, 'compositionupdate'); fire(node, 'input', { isComposing: true });
  node.value = ''; fire(node, 'compositionend'); fire(node, 'input');
  node.setSelectionRange(0, 0); fire(node, 'input');
  assert.equal(values.length, 2); assert.equal(values[0].isComposing, true); assert.equal(values[1].value, ''); app.dispose(); empty(app);
});

test('B.1–B.3 invalid semantic handlers/control types and failed mounts release all resources', () => {
  for (const props of [{ onKey: 'bad' }, { onText: 123 }, { type: 'checkbox', onText() {} }]) {
    const app = createApp({ view: () => input(props) }); const target = fakeDocument().createElement();
    assert.throws(() => app.mount(target)); empty(app); app.dispose();
  }
  const app = createApp({ view: () => div(input({ onText() {}, onKey() {}, on: { scroll() {} } }), button({ title: {} })) });
  assert.throws(() => app.mount(fakeDocument().createElement())); empty(app); app.dispose();
});

test('B.1–B.3 scoped removal and app disposal cancel listeners, held keys and deferred writes', () => {
  for (let cycle = 0; cycle < 10; cycle++) {
    let callbacks = 0;
    const { app, target, document } = setup(({ bind, when }) => when(bind.show, () => input({ value: bind.text,
      onText: () => callbacks++, onKey: () => callbacks++, on: { scroll: () => callbacks++ } })));
    const node = target.childNodes.find(child => child.nodeType === 1), baseline = resourceCounts(app);
    fire(node, 'compositionstart'); node.value = 'live'; app.actions.text('remote'); app.flush();
    fire(node, 'keydown', { key: 'x', code: 'KeyX' }); const before = callbacks;
    app.actions.toggle(); app.flush(); assert.equal(resourceCounts(app).listeners, 0);
    target.appendChild(node); fire(node, 'input'); fire(node, 'keyup'); fire(node, 'scroll'); fire(node, 'compositionend');
    assert.equal(callbacks, before); target.removeChild(node);
    app.actions.toggle(); app.flush(); assert.deepEqual(resourceCounts(app), baseline);
    app.dispose(); document.flushFrame(); empty(app);
  }
});

test('B.1 custom events preserve native direct propagation and stopImmediatePropagation cancels later native listeners', () => {
  const order = [];
  const { app, node } = setup(() => div({ on: { 'data-ready': () => order.push('parent') } },
    button({ on: { 'data-ready': event => { order.push('child'); event.stopImmediatePropagation(); } } })));
  const child = node.childNodes[0]; child.addEventListener('data-ready', () => order.push('native'));
  fire(child, 'data-ready'); assert.deepEqual(order, ['child']); app.dispose(); empty(app);
});

test('B.2 keyboard scopes stay independent and held-key growth is bounded', () => {
  const left = [], right = [];
  const { app, node } = setup(() => div(input({ onKey: value => left.push(value) }), input({ onKey: value => right.push(value) })));
  fire(node.childNodes[0], 'keydown', { key: 'x', code: 'KeyX' });
  fire(node.childNodes[1], 'keydown', { key: 'y', code: 'KeyY' });
  assert.equal(left[0].held[0].code, 'KeyX'); assert.equal(right[0].held[0].code, 'KeyY');
  for (let key = 1; key < 256; key++) fire(node.childNodes[0], 'keydown', { code: 'Test' + key });
  assert.throws(() => fire(node.childNodes[0], 'keydown', { code: 'Overflow' }), code('EVENT_INPUT_LIMIT'));
  fire(node.childNodes[0], 'keydown', { key: 'z', code: 'KeyZ' }); assert.equal(left.at(-1).held.length, 1);
  app.dispose(); empty(app);
});

test('B.2/B.3 async semantic callbacks reject and observe native Promise failures', async () => {
  for (const [prop, type] of [['onKey', 'keydown'], ['onText', 'input']]) {
    const { app, node } = setup(() => input({ [prop]: async () => { throw Error('illegal semantic callback'); } }));
    node.value = 'changed'; assert.throws(() => fire(node, type, { key: 'x', code: 'KeyX' }), code('EVENT_ASYNC'));
    app.dispose(); empty(app);
  }
  await new Promise(resolve => setImmediate(resolve));
});

test('B.3 programmatic initial/bound values establish the input baseline without spurious semantic callbacks', () => {
  let calls = 0;
  const { app, node } = setup(({ bind }) => input({ value: bind.text, onText: () => calls++ }));
  fire(node, 'input'); assert.equal(calls, 0);
  app.actions.text('external'); app.flush(); fire(node, 'input'); assert.equal(calls, 0);
  node.value = 'native edit'; fire(node, 'input'); assert.equal(calls, 1); app.dispose(); empty(app);
  const fixed = setup(() => input({ value: 'static', onText: () => calls++ }));
  fire(fixed.node, 'input'); assert.equal(calls, 1); fixed.app.dispose(); empty(fixed.app);
});

test('B.1–B.3 failing native listener removal attempts all cleanup and leaves surviving callbacks inert', () => {
  let calls = 0, removed = 0, cleaned = false;
  const { app, node, document } = setup(({ bind, onDispose }) => {
    onDispose(() => { cleaned = true; }); return input({ value: bind.text, onText: () => calls++, onKey: () => calls++ });
  });
  const original = node.removeEventListener.bind(node);
  node.removeEventListener = (...args) => { removed++; if (removed === 1) throw Error('native cleanup failed'); original(...args); };
  assert.throws(app.dispose, error => error instanceof AggregateError &&
    error.errors.some(cause => cause.message === 'native cleanup failed'));
  assert.equal(cleaned, true); assert.ok(removed >= 8); empty(app);
  node.value = 'stale'; fire(node, 'input'); fire(node, 'compositionstart'); fire(node, 'keydown'); fire(document.defaultView, 'blur');
  assert.equal(calls, 0);
});
