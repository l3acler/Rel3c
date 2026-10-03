import { createApp, createActionSchema, div, span, form, label, input, textarea, select,
  option, section, p, when, derive, element } from '../../src/index.js';

export async function runDOMTests(test, assert, throws, host) {
  const appFor = (target, initialState, actions, view) => createApp({ target, initialState, view,
    schema: createActionSchema()(({ action }) => Object.fromEntries(Object.entries(actions).map(([name, run]) => [name, action(run)]))) });
  await test('A.6 public form/conditional bindings preserve native focus, labels, defaults and unrelated node identity', () => {
    const target = host(); let views = 0, unrelated = 0;
    const app = appFor(target, { name: 'Ada', checked: true, choice: 'b', visible: true, n: 0 }, {
      edit: d => { d.n++; }, change: d => { d.name = 'Grace'; d.checked = false; d.choice = 'a'; }, hide: d => { d.visible = false; },
    }, ({ bind, derive, when }) => {
      views++;
      return div(form({ id: 'profile', method: 'get', action: '/save' }, label({ htmlFor: 'name' }, 'Name'),
        input({ id: 'name', value: bind.name, required: true }), input({ id: 'check', type: 'checkbox', checked: bind.checked }),
        textarea({ id: 'area', value: bind.name }), select({ id: 'choice', value: bind.choice },
          option({ value: 'a' }, 'A'), option({ value: 'b' }, 'B'))),
        span({ id: 'count' }, bind.n), span({ id: 'stable' }, derive(s => { unrelated++; return s.name; })),
        when(bind.visible, () => section({ id: 'conditional' }, 'Visible')));
    });
    const field = target.querySelector('#name'), nativeForm = target.querySelector('form');
    const count = target.querySelector('#count').firstChild, stable = target.querySelector('#stable').firstChild;
    assert(field.labels[0].textContent === 'Name' && nativeForm.checkValidity());
    assert(field.value === 'Ada' && field.defaultValue === 'Ada' && target.querySelector('#choice').value === 'b');
    field.focus(); field.setSelectionRange(1, 2); app.actions.edit(); app.flush();
    assert(count.data === '1' && target.querySelector('#count').firstChild === count);
    assert(views === 1 && unrelated === 1 && target.querySelector('#stable').firstChild === stable);
    assert(document.activeElement === field && field.selectionStart === 1 && field.selectionEnd === 2);
    app.actions.change(); app.flush(); assert(field.value === 'Grace' && field.defaultValue === 'Ada');
    assert(!target.querySelector('#check').checked && target.querySelector('#area').value === 'Grace');
    assert(target.querySelector('#choice').value === 'a');
    nativeForm.reset(); assert(field.value === 'Ada' && target.querySelector('#check').checked);
    app.actions.hide(); app.flush(); assert(!target.querySelector('#conditional') && document.activeElement === field);
    app.dispose(); assert(!target.firstChild); target.remove();
  });
  await test('A.6 native attributes, class/style maps and text escape safely through public exports', () => {
    const target = host(); const app = appFor(target, { n: 0, active: true, color: 'red', title: 'hello' }, {
      edit: d => { d.n++; d.active = false; d.color = 'blue'; d.title = null; },
    }, ({ bind }) => div({ id: 'card', class: { active: bind.active }, style: { color: bind.color },
      title: bind.title, 'aria-hidden': bind.active }, '<img src=x onerror=alert(1)>', bind.n, false, [null, 0]));
    const node = target.firstChild; assert(!node.querySelector('img') && node.style.color === 'red');
    app.actions.edit(); app.flush(); assert(node.style.color === 'blue' && node.className === '' && !node.hasAttribute('title'));
    assert(node.getAttribute('aria-hidden') === 'false' && node.textContent.endsWith('10')); app.dispose(); target.remove();
  });
  await test('A.6 conditional branch disposal removes resources and rejects stale scoped registration', () => {
    const target = host(); let context, result, cleaned = 0;
    const app = appFor(target, { shown: true, n: 0 }, { toggle: d => { d.shown = false; } }, ({ bind, when }) =>
      when(bind.shown, c => { context = c; result = c.computed(s => s.n); c.onDispose(() => { cleaned++; }); return span(c.derive(() => result.value)); }, () => p('hidden')));
    app.actions.toggle(); app.flush(); assert(cleaned === 1 && target.textContent === 'hidden');
    throws(() => result.value, 'SCOPE_DISPOSED'); throws(() => context.observe(() => 1), 'SCOPE_DISPOSED');
    app.dispose(); target.remove();
  });
  await test('A.6 DOM computations forbid state mutation/dispatch and clean failed native mounts', () => {
    const target = host(); let invalid = true;
    const app = createApp({ initialState: { n: 0 }, view: ({ derive }) => div(derive(s => { if (invalid) s.n++; return s.n; })) });
    throws(() => app.mount(target), 'STATE_READONLY'); assert(!target.firstChild);
    invalid = false; app.mount(target); app.dispose(); target.remove();
  });
  await test('A.6 native inline handlers, active URLs, unsafe tags and file-value assignments reject', () => {
    for (const view of [() => div({ onclick: 'bad' }), () => div({ href: 'javascript:alert(1)' }),
      () => input({ value: 'bad', type: 'file' })]) {
      const target = host(), app = createApp({ view });
      let failed = false; try { app.mount(target); } catch { failed = true; }
      assert(failed && !target.firstChild); app.dispose(); target.remove();
    }
    throws(() => element('script', 'bad'), 'DOM_TAG_INVALID');
  });
}
