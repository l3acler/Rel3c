import { createApp, createActionSchema, div, button, form, input, textarea } from '../../src/index.js';
import { resourceCounts } from '../../src/runtime/diagnostics.js';
export async function runInputTests(test, assert, host) {
  const empty = app => assert(Object.values(resourceCounts(app)).every(value => value === 0), 'Owned input resources remain');
  const schema = createActionSchema()(({ action }) => ({
    text: action(value => typeof value === 'string', (draft, value) => { draft.text = value; }),
    hide: action(draft => { draft.show = false; }),
  }));
  const setup = (view, initialState = { text: 'initial', show: true }) => {
    const target = host(); const app = createApp({ target, initialState, schema, view });
    return { app, target };
  };
  const dispatch = (node, type, options = {}) => node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...options }));
  const compose = (node, type, data = '') => node.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
  await test('B.1 native capture, delegated targets, once and propagation cancellation', () => {
    const order = []; let child, saved;
    const { app, target } = setup(() => div({ on: { click: { capture: true, handler: () => order.push('capture') } } },
      div({ on: { click: () => order.push('parent') } }, button({ on: { click: { once: true, handler: event => {
        saved = event; order.push('child'); event.preventDefault(); event.stopPropagation();
      } } } }, 'go'))));
    child = target.querySelector('button'); assert(!dispatch(child, 'click'));
    assert(order.join(',') === 'capture,child' && saved.target === child && saved.currentTarget === child && saved.defaultPrevented);
    child.click(); assert(order.join(',') === 'capture,child,capture,parent'); app.dispose(); empty(app); target.remove();
  });
  await test('B.1 nonbubbling scroll is scoped; native submit is canceled only on request', () => {
    let scrolls = 0, submits = 0;
    const { app, target } = setup(() => div({ on: { scroll: () => scrolls++ } },
      div({ style: { height: '10px', overflow: 'auto' } }, 'child'),
      form({ on: { submit: event => { submits++; event.preventDefault(); } } }, button({ type: 'submit' }, 'submit'))));
    const root = target.firstChild;
    dispatch(root.firstChild, 'scroll', { bubbles: false }); assert(scrolls === 0);
    dispatch(root, 'scroll', { bubbles: false }); assert(scrolls === 1);
    target.querySelector('button').click(); assert(submits === 1); app.dispose(); empty(app); target.remove();
  });
  await test('B.2 native KeyboardEvent normalization handles held keys, repeat, releases, focus and window blur', () => {
    const inputs = [];
    const { app, target } = setup(() => div(input({ onKey: value => inputs.push(value) }), button('next')));
    const field = target.querySelector('input'); field.focus();
    for (const options of [{ key: 'A', code: 'KeyA', shiftKey: true }, { key: 'A', code: 'KeyA', repeat: true }])
      field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...options }));
    assert(inputs[0].shiftKey && inputs[1].repeat && inputs[1].held.length === 1);
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a', code: 'KeyA' })); assert(inputs[2].held.length === 0);
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'x', code: 'KeyX' }));
    target.querySelector('button').focus(); assert(inputs.at(-1).type === 'reset' && inputs.at(-1).reason === 'focus');
    field.focus(); field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'x', code: 'KeyX' }));
    window.dispatchEvent(new Event('blur')); assert(inputs.at(-1).reason === 'window-blur' && !inputs.at(-1).held.length);
    app.dispose(); empty(app); target.remove();
  });
  await test('B.3 native InputEvent snapshots preserve paste values, selection, deletion and textarea semantics', () => {
    const values = [];
    const { app, target } = setup(({ bind, actions }) => textarea({ value: bind.text, onText: value => { values.push(value); actions.text(value.value); } }));
    const field = target.querySelector('textarea'); field.focus(); field.value = 'مرحبا 😀'; field.setSelectionRange(2, 4, 'backward');
    field.dispatchEvent(new ClipboardEvent('paste', { bubbles: true })); assert(!values.length);
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: null })); app.flush();
    assert(values[0].value === 'مرحبا 😀' && values[0].inputType === 'insertFromPaste' && values[0].selectionDirection === 'backward');
    assert(field.selectionStart === 2 && field.selectionEnd === 4 && document.activeElement === field);
    field.value = ''; field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); app.flush();
    assert(app.state.text === '' && field.value === ''); app.dispose(); empty(app); target.remove();
  });
  await test('B.3 composition defers writes across real render frames and reconciles latest committed acceptance', async () => {
    const values = [];
    const { app, target } = setup(({ bind, actions }) => input({ value: bind.text, onText: value => { values.push(value); actions.text(value.value); } }));
    const field = target.querySelector('input'); field.focus(); compose(field, 'compositionstart'); field.value = 'に';
    field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: 'に', inputType: 'insertCompositionText' }));
    await new Promise(resolve => requestAnimationFrame(resolve)); assert(app.state.text === 'に' && field.value === 'に');
    app.actions.text('external'); await new Promise(resolve => requestAnimationFrame(resolve)); assert(field.value === 'に');
    field.value = '日本'; compose(field, 'compositionend', '日本');
    field.dispatchEvent(new InputEvent('input', { bubbles: true, data: '日本', inputType: 'insertFromComposition' }));
    await new Promise(resolve => requestAnimationFrame(resolve)); assert(field.value === '日本' && app.state.text === '日本' && values.length === 2);
    app.dispose(); empty(app); target.remove();
  });
  await test('B.3 active selection survives differing bound values and composition protects controls without callbacks', () => {
    const { app, target } = setup(({ bind }) => textarea({ value: bind.text })); const field = target.querySelector('textarea');
    field.focus(); field.setSelectionRange(2, 5, 'backward'); app.actions.text('abc'); app.flush();
    assert(field.selectionStart === 2 && field.selectionEnd === 3 && field.selectionDirection === 'backward');
    compose(field, 'compositionstart'); field.value = '한'; app.actions.text('remote'); app.flush(); assert(field.value === '한');
    target.focus(); field.blur(); app.flush(); assert(field.value === 'remote'); app.dispose(); empty(app); target.remove();
  });
  await test('B.3 static initial values do not dispatch spurious text changes and canceled composition reconciles once', () => {
    const values = [];
    const { app, target } = setup(() => input({ value: 'static', onText: value => values.push(value) }));
    const field = target.querySelector('input'); dispatch(field, 'input'); assert(values.length === 0);
    compose(field, 'compositionstart'); field.value = '한';
    field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }));
    field.value = 'static'; compose(field, 'compositionend'); dispatch(field, 'input');
    assert(values.length === 2 && values[0].isComposing && !values[1].isComposing && values[1].value === 'static');
    app.dispose(); empty(app); target.remove();
  });
  await test('B.1–B.3 removed scopes disable direct input/scroll listeners, root delegates and global resets', () => {
    let calls = 0;
    const { app, target } = setup(({ bind, when }) => when(bind.show, () => input({ value: bind.text,
      onText: () => calls++, onKey: () => calls++, on: { scroll: () => calls++, click: () => calls++ } })));
    const field = target.querySelector('input'); field.focus(); compose(field, 'compositionstart'); app.actions.text('later'); app.flush();
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'x', code: 'KeyX' })); const before = calls;
    app.actions.hide(); app.flush(); target.appendChild(field); dispatch(field, 'input'); dispatch(field, 'scroll'); field.click();
    window.dispatchEvent(new Event('blur')); compose(field, 'compositionend'); assert(calls === before && field.value === 'initial');
    assert(resourceCounts(app).listeners === 0); app.dispose(); empty(app); target.remove();
  });
}
