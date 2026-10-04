import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, element, div, span, p, form, label, input,
  textarea, select, option, section, when, derive } from '../src/index.js';
import { fakeDocument } from './helpers/fake-dom.js';
const code = expected => error => error.code === expected;
const setup = (state, actions, view) => {
  const target = fakeDocument().createElement('main');
  const app = createApp({ target, initialState: state, view, schema: createActionSchema()(({ action }) =>
    Object.fromEntries(Object.entries(actions).map(([name, run]) => [name, action(run)]))) });
  return { target, app };
};
const elements = node => node.childNodes.filter(child => child.nodeType === 1);

test('A.6 public elements nest, copy children/props and escape text without using HTML', () => {
  const props = { id: 'card', className: 'card', 'data-label': 'one', 'aria-hidden': false };
  const children = ['<script>not HTML</script>', 0, null, false, [true, p('nested')]];
  const view = div(props, children); props.id = 'caller'; children[0] = 'caller';
  const { app, target } = setup({}, {}, () => view);
  const node = target.childNodes[0]; assert.equal(node.getAttribute('id'), 'card');
  assert.equal(node.getAttribute('class'), 'card'); assert.equal(node.getAttribute('aria-hidden'), 'false');
  assert.equal(node.textContent, '<script>not HTML</script>0nested');
  assert.equal(node.childNodes[0].nodeType, 3); assert.equal(node.childNodes.length, 3);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.props) && Object.isFrozen(view.children)); app.dispose();
});

test('A.6 direct/deep bindings and derived text update exact nodes without rerunning the view', () => {
  let views = 0, untouchedReads = 0, countReads = 0;
  const { app, target } = setup({ user: { n: 0, label: 'Ada' } }, { edit: d => { d.user.n++; } }, ({ bind, derive }) => {
    views++; return div(span(bind.user.n), span(derive(s => { untouchedReads++; return s.user.label; })),
      span(derive(s => { countReads++; return s.user.n * 2; })));
  });
  const [count, label, doubled] = elements(target.childNodes[0]);
  const original = [count.childNodes[0], label.childNodes[0], doubled.childNodes[0]];
  app.actions.edit(); app.flush(); assert.equal(count.textContent, '1'); assert.equal(doubled.textContent, '2');
  assert.equal(label.textContent, 'Ada'); assert.equal(views, 1); assert.equal(untouchedReads, 1); assert.equal(countReads, 2);
  assert.equal(label.childNodes[0], original[1]); assert.equal(count.childNodes[0], original[0]); app.dispose();
});

test('A.6 attributes, classes and CSS maps track direct fields and remove missing values', () => {
  const { app, target } = setup({ title: 'a', visible: true, color: 'red', gap: '2px' }, {
    edit: d => { d.title = null; d.visible = false; d.color = 'blue'; d.gap = null; },
  }, ({ bind }) => div({ title: bind.title, class: { active: bind.visible, fixed: true },
    style: { color: bind.color, marginTop: bind.gap, '--scale': 1 }, 'data-visible': bind.visible }));
  const node = target.childNodes[0];
  assert.equal(node.getAttribute('class'), 'active fixed'); assert.match(node.style.cssText, /margin-top: 2px/);
  app.actions.edit(); app.flush(); assert.equal(node.getAttribute('title'), null); assert.equal(node.getAttribute('class'), 'fixed');
  assert.equal(node.getAttribute('data-visible'), 'false'); assert.equal(node.style.cssText, 'color: blue; --scale: 1;'); app.dispose();
});

test('A.6 computed-backed and whole state class/style maps retain nested dependencies', () => {
  let reads = 0;
  const { app, target } = setup({ n: 1, styles: { color: 'red' }, classes: { active: true } }, {
    edit: d => { d.n++; d.styles.color = 'blue'; d.classes.active = false; },
  }, ({ computed, derive, bind }) => {
    const result = computed(s => { reads++; return s.n * 2; });
    return div({ style: bind.styles, class: bind.classes }, derive(() => result.value));
  });
  app.actions.edit(); app.flush(); assert.equal(target.textContent, '4'); assert.equal(reads, 2);
  assert.equal(target.childNodes[0].style.cssText, 'color: blue;'); assert.equal(target.childNodes[0].getAttribute('class'), ''); app.dispose();
});

test('A.6 aliases and dynamic derived dependencies remain precise per binding', () => {
  const shared = { name: 'a' }; let reads = 0;
  const { app, target } = setup({ left: true, a: shared, alias: shared, b: { name: 'b' } }, {
    alias: d => { d.alias.name = 'A'; }, toggle: d => { d.left = false; }, a: d => { d.a.name = 'unused'; }, b: d => { d.b.name = 'B'; },
  }, ({ derive }) => div(derive(s => { reads++; return s.left ? s.a.name : s.b.name; })));
  app.actions.alias(); app.flush(); assert.equal(target.textContent, 'A');
  app.actions.toggle(); app.flush(); assert.equal(target.textContent, 'b'); app.actions.a(); app.flush(); assert.equal(reads, 3);
  app.actions.b(); app.flush(); assert.equal(target.textContent, 'B'); assert.equal(reads, 4); app.dispose();
});

test('A.6 form values use live properties, initialize native defaults and keep boolean attributes distinct from ARIA', () => {
  const { app, target } = setup({ name: 'Ada', checked: true, disabled: false, selected: 'b' }, {
    edit: d => { d.name = 'Grace'; d.checked = false; d.disabled = true; d.selected = 'a'; },
  }, ({ bind }) => form({ id: 'profile', action: '/save', method: 'get' },
    label({ htmlFor: 'name' }, 'Name'), input({ id: 'name', value: bind.name, required: true, disabled: bind.disabled }),
    input({ type: 'checkbox', checked: bind.checked }), textarea({ value: bind.name }),
    select({ value: bind.selected }, option({ value: 'a' }, 'A'), option({ value: 'b' }, 'B'))));
  const [labelNode, field, check, area, choice] = elements(target.childNodes[0]);
  assert.equal(labelNode.getAttribute('for'), 'name'); assert.equal(field.value, 'Ada'); assert.equal(field.defaultValue, 'Ada');
  assert.equal(check.checked, true); assert.equal(check.defaultChecked, true); assert.equal(choice.value, 'b');
  app.actions.edit(); app.flush(); assert.equal(field.value, 'Grace'); assert.equal(field.defaultValue, 'Ada');
  assert.equal(check.checked, false); assert.equal(area.value, 'Grace'); assert.equal(choice.value, 'a');
  assert.equal(field.hasAttribute('disabled'), true); assert.equal(field.hasAttribute('required'), true); app.dispose();
});

test('A.6 conditional branches preserve unrelated nodes, replace on toggles, and dispose branch resources', () => {
  let cleaned = 0, extraReads = 0, firstContext, resource;
  const { app, target } = setup({ show: true, n: 0 }, { toggle: d => { d.show = !d.show; }, edit: d => { d.n++; } }, ({ bind, when }) =>
    div(span('stable'), when(bind.show, context => {
      firstContext = context; context.onDispose(() => { cleaned++; });
      resource = context.computed(s => s.n + 1);
      context.observe(s => { extraReads++; return s.n; });
      return section(context.derive(() => resource.value));
    }, () => p('hidden'))));
  const parent = target.childNodes[0], stable = elements(parent)[0], originalBranch = elements(parent)[1];
  app.actions.edit(); app.flush(); assert.equal(elements(parent)[1], originalBranch); assert.equal(parent.textContent, 'stable2');
  app.actions.toggle(); app.flush(); assert.equal(cleaned, 1); assert.equal(elements(parent)[0], stable); assert.equal(parent.textContent, 'stablehidden');
  assert.throws(() => resource.value, code('SCOPE_DISPOSED')); assert.throws(() => firstContext.computed(() => 1), code('SCOPE_DISPOSED'));
  app.actions.edit(); app.flush(); assert.equal(extraReads, 1); app.dispose();
});

test('A.6 conditional reads normalized to the same branch do not reconstruct it', () => {
  let factories = 0;
  const { app, target } = setup({ n: 0 }, { edit: d => { d.n++; } }, ({ derive }) =>
    when(derive(s => s.n >= 0), () => { factories++; return span('yes'); }));
  const node = elements(target)[0]; app.actions.edit(); app.flush(); assert.equal(factories, 1); assert.equal(elements(target)[0], node); app.dispose();
});

test('A.6 failed actions leave reactive DOM untouched; successful no-ops do not read bindings', () => {
  let reads = 0;
  const { app, target } = setup({ n: 0 }, { noop: () => {}, fail: d => { d.n++; throw Error('failure'); } }, ({ derive }) =>
    derive(s => { reads++; return s.n; }));
  const node = target.childNodes[0]; app.actions.noop(); app.flush(); assert.throws(() => app.actions.fail(), /failure/); app.flush();
  assert.equal(reads, 1); assert.equal(target.childNodes[0], node); assert.equal(target.textContent, '0'); app.dispose();
});

test('A.6 read computations and branch factories reject state mutation and dispatch', () => {
  let app, bad = true;
  const target = fakeDocument().createElement();
  app = createApp({ initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({ edit: action(d => { d.n++; }) })),
    view({ derive }) { return derive(s => { if (bad) s.n++; return s.n; }); } });
  assert.throws(() => app.mount(target), code('STATE_READONLY')); assert.equal(target.childNodes.length, 0);
  bad = false; app.mount(target); app.dispose();
  const second = createApp({ view: ({ when }) => when(true, ({ dispatch }) => { dispatch('edit'); return ''; }),
    schema: createActionSchema()(({ action }) => ({ edit: action(() => {}) })) });
  assert.throws(() => second.mount(target), code('ACTION_REENTRANT')); assert.equal(second.stateVersion, 1); second.dispose();
});

test('A.6 failed tree construction cleans partial subscriptions and DOM and allows retry', () => {
  let invalid = true, reads = 0;
  const target = fakeDocument().createElement();
  const app = createApp({ initialState: { n: 0 }, schema: createActionSchema()(({ action }) => ({ edit: action(d => { d.n++; }) })),
    view: ({ derive }) => div(derive(s => { reads++; return s.n; }), span({ title: invalid ? {} : 'valid' })) });
  assert.throws(() => app.mount(target), code('DOM_ATTRIBUTE_INVALID')); assert.equal(target.childNodes.length, 0);
  app.actions.edit(); app.flush(); assert.equal(reads, 1); invalid = false; app.mount(target); assert.equal(target.textContent, '1'); app.dispose();
});

test('A.6 async bindings and branches reject without executing unknown thenables', async () => {
  let calls = 0;
  for (const view of [() => derive(async () => { throw Error('async'); }),
    () => derive(() => ({ then() { calls++; } })), () => when(true, async () => { throw Error('branch'); })]) {
    const app = createApp({ view }); const target = fakeDocument().createElement();
    assert.throws(() => app.mount(target)); assert.equal(target.childNodes.length, 0); app.dispose();
  }
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 0);
});

test('A.6 malformed props/children reject before invoking accessors and forbid inline event/HTML escape hatches', () => {
  let calls = 0; const getter = Object.defineProperty({}, 'title', { enumerable: true, get() { calls++; } });
  assert.throws(() => div(getter), code('DOM_PROPS_INVALID'));
  const children = []; Object.defineProperty(children, '0', { get() { calls++; } });
  assert.throws(() => div(children), code('DOM_CHILD_INVALID')); assert.equal(calls, 0);
  const cyclic = []; cyclic.push(cyclic); assert.throws(() => div(cyclic), code('DOM_CHILD_INVALID'));
  assert.throws(() => div(() => 'text'), code('DOM_CHILD_INVALID')); assert.throws(() => input('child'), code('DOM_CHILD_INVALID'));
  for (const props of [{ onclick: 'bad' }, { onClick: 'bad' }, { innerHTML: '<b>x</b>' }, { srcdoc: 'bad' },
    { style: 'color:red' }, { href: 'javascript:alert(1)' }, { disabled: 'false' }, { class: 'a', className: 'b' }]) {
    const app = createApp({ view: () => div(props) }); assert.throws(() => app.mount(fakeDocument().createElement())); app.dispose();
  }
  for (const tag of ['script', 'iframe', 'custom-widget', 'svg', null]) assert.throws(() => element(tag), code('DOM_TAG_INVALID'));
});

test('A.6 bind tokens are immutable, paths are stable and foreign app bindings reject', () => {
  const a = createApp({ initialState: { name: 'Ada' } }), b = createApp({ view: () => span(a.bind.name) });
  assert.equal(a.bind.name, a.bind.name); assert.throws(() => { a.bind.name = 1; }, code('BINDING_READONLY'));
  assert.throws(() => b.mount(fakeDocument().createElement()), code('BINDING_OWNER')); b.dispose(); a.dispose();
});

for (const value of [true, false, null, undefined, 0, '', 'text', ['a', [1]]]) test(`A.6 root child semantics for ${JSON.stringify(value)}`, () => {
  const { app, target } = setup({}, {}, () => value);
  assert.equal(target.textContent, value === null || value === undefined || typeof value === 'boolean' ? '' :
    Array.isArray(value) ? 'a1' : String(value)); app.dispose(); assert.equal(target.childNodes.length, 0);
});
