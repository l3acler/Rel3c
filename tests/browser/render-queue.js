import { createApp, createActionSchema, div, span, input } from '../../src/index.js';
export async function runRenderQueueTests(test, assert, throws, host) {
  const setup = (target, view) => createApp({ target, initialState: { n: 0, show: true },
    schema: createActionSchema()(({ action }) => ({ increment: action(d => { d.n++; }), hide: action(d => { d.show = false; }) })), view });
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const spy = (node, name, prototype) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name); let writes = 0;
    Object.defineProperty(node, name, { configurable: true, get() { return descriptor.get.call(this); },
      set(value) { writes++; descriptor.set.call(this, value); } });
    return () => writes;
  };
  await test('A.7 native frame burst writes latest text once and preserves unrelated control focus/selection', async () => {
    const target = host(); let reads = 0;
    const app = setup(target, ({ derive }) => div(span(derive(s => { reads++; return s.n; })), input({ value: 'native' })));
    const text = target.querySelector('span').firstChild, field = target.querySelector('input');
    const writes = spy(text, 'data', CharacterData.prototype); field.focus(); field.setSelectionRange(1, 3);
    for (let i = 0; i < 5; i++) app.actions.increment();
    assert(app.state.n === 5 && text.data === '0' && reads === 1); await nextFrame();
    assert(text.data === '5' && writes() === 1 && reads === 2);
    assert(document.activeElement === field && field.selectionStart === 1 && field.selectionEnd === 3);
    app.dispose(); target.remove();
  });
  await test('A.7 native explicit flush cancels its scheduled duplicate write', async () => {
    const target = host(), app = setup(target, ({ bind }) => bind.n);
    const writes = spy(target.firstChild, 'data', CharacterData.prototype);
    app.actions.increment(); app.flush(); assert(target.textContent === '1'); await nextFrame();
    assert(writes() === 1); app.flush(); assert(writes() === 1); app.dispose(); target.remove();
  });
  await test('A.7 native CSS normalization and equal form values avoid redundant setters', async () => {
    const target = host(), app = setup(target, ({ derive }) => div({ style: derive(s => ({ color: s.n % 2 ? 'blue' : 'rgb(1,2,3)' })) },
      input({ value: derive(s => String(s.n % 2)) })));
    const node = target.firstChild, field = node.firstChild;
    assert(node.style.cssText.includes('rgb(1, 2, 3)')); // Native canonicalization differs from authored text.
    const styles = spy(node.style, 'cssText', CSSStyleDeclaration.prototype), values = spy(field, 'value', HTMLInputElement.prototype);
    field.focus(); field.setSelectionRange(0, 1); app.actions.increment(); app.actions.increment(); await nextFrame();
    assert(styles() === 0 && values() === 0 && field.selectionEnd === 1);
    app.dispose(); target.remove();
  });
  await test('A.7 native disposal and conditional removal cancel queued descendant reads/writes', async () => {
    let reads = 0; const target = host();
    const app = setup(target, ({ bind, when }) => when(bind.show, ({ derive }) => span(derive(s => { reads++; return s.n; }))));
    const text = target.querySelector('span').firstChild, writes = spy(text, 'data', CharacterData.prototype);
    app.actions.increment(); app.actions.hide(); await nextFrame(); assert(reads === 1 && writes() === 0 && !target.querySelector('span'));
    app.dispose(); target.remove();
    const second = host(), closing = setup(second, ({ bind }) => bind.n), removed = second.firstChild;
    const closedWrites = spy(removed, 'data', CharacterData.prototype); closing.actions.increment(); closing.dispose(); await nextFrame();
    assert(closedWrites() === 0 && !second.firstChild); second.remove();
  });
  await test('A.7 native failed render leaves committed state intact and allows explicit recovery', () => {
    const target = host(); let bad = true, reports = 0;
    const app = createApp({ target, initialState: { n: 0 },
      schema: createActionSchema()(({ action }) => ({ increment: action(d => { d.n++; }) })),
      view: ({ derive }) => derive(s => { if (s.n && bad) throw Error('render'); return s.n; }),
      onError(error, { phase }) { assert(phase === 'render'); reports++; } });
    app.actions.increment(); let failed = false; try { app.flush(); } catch { failed = true; }
    assert(failed && reports === 1 && app.state.n === 1 && target.textContent === '0');
    bad = false; app.flush(); assert(target.textContent === '1'); app.dispose(); target.remove();
  });
}
