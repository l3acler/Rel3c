import { createApp, createActionSchema, div, button, span, a, form } from '../../src/index.js';
import { resourceCounts } from '../../src/runtime/diagnostics.js';
export async function runClickTests(test, assert, throws, host) {
  const setup = (target, view, onError) => createApp({ target, initialState: { n: 0, show: true, rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
    schema: createActionSchema()(({ action }) => ({ increment: action(d => { d.n++; }),
      toggle: action(d => { d.show = !d.show; }), fail: action(d => { d.n++; throw Error('expected click rollback'); }),
      reverse: action(d => { d.rows.reverse(); }), replace: action(d => { d.rows[0] = { id: d.rows[0].id, name: 'new' }; }),
    })), view, onError });
  const empty = app => assert(Object.values(resourceCounts(app)).every(value => value === 0));
  await test('A.9 native clicks invoke direct action wrappers once and write only dependent text', async () => {
    const target = host(), app = setup(target, ({ actions, bind }) => div(button({ type: 'button', onClick: actions.increment }, span('Increment')), span({ id: 'count' }, bind.n), span({ id: 'unrelated' }, bind.rows[0].name)));
    const count = target.querySelector('#count').firstChild, unrelated = target.querySelector('#unrelated').firstChild;
    const descriptor = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data'); let writes = 0, otherWrites = 0;
    for (const [node, increment] of [[count, () => { writes++; }], [unrelated, () => { otherWrites++; }]]) {
      Object.defineProperty(node, 'data', { get() { return descriptor.get.call(this); }, set(value) { increment(); descriptor.set.call(this, value); } });
    }
    target.querySelector('button span').click(); assert(app.state.n === 1 && count.data === '0');
    await new Promise(resolve => requestAnimationFrame(resolve)); assert(count.data === '1' && writes === 1 && otherWrites === 0);
    assert(resourceCounts(app).listeners === 1 && resourceCounts(app).handlers === 1); app.dispose(); empty(app); target.remove();
  });
  await test('A.9 bubbling handlers preserve native link/form defaults and disabled controls', () => {
    const target = host(), order = []; const previousURL = location.href;
    const app = setup(target, ({ actions }) => div({ onClick: () => order.push('parent') },
      a({ href: '#native-click', onClick: () => { order.push('link'); actions.increment(); } }, 'Link'),
      button({ type: 'button', disabled: true, onClick: actions.increment }, 'Disabled'),
      form(button({ type: 'submit', onClick: actions.increment }, 'Submit'))));
    target.querySelector('a').click(); assert(order.join(',') === 'link,parent' && location.hash === '#native-click' && app.state.n === 1);
    target.querySelector('button[disabled]').click(); assert(app.state.n === 1);
    let submitted = false, prevented = true;
    const listener = event => { submitted = true; prevented = event.defaultPrevented; event.preventDefault(); };
    target.querySelector('form').addEventListener('submit', listener);
    target.querySelector('form button').click(); assert(submitted && !prevented && app.state.n === 2);
    target.querySelector('form').removeEventListener('submit', listener);
    history.replaceState(null, '', previousURL); app.dispose(); empty(app); target.remove();
  });
  await test('A.9 stale removed/disposing handlers cannot run and native keyed handlers follow current items', () => {
    const target = host(), names = [];
    const app = setup(target, ({ bind, keyed, when }) => when(bind.show, () => keyed(bind.rows, row => row.id, context =>
      button({ onClick: () => names.push(context.value.name) }, context.item.name))));
    const original = target.querySelector('button'); app.actions.replace(); app.flush(); original.click(); assert(names[0] === 'new');
    app.actions.reverse(); app.flush(); assert(target.querySelectorAll('button')[1] === original);
    app.actions.toggle(); app.flush(); target.appendChild(original); original.click(); assert(names.length === 1);
    assert(resourceCounts(app).handlers === 0 && resourceCounts(app).listeners === 0); target.removeChild(original);
    app.actions.toggle(); app.flush(); app.dispose(); target.appendChild(original); original.click(); assert(names.length === 1); empty(app); target.remove();
  });
  await test('A.9 native action failure reports once, rolls back and does not change bound DOM', () => {
    const target = host(); let reports = 0, browserErrors = 0;
    const listener = event => { if (event.error?.message === 'expected click rollback') { browserErrors++; event.preventDefault(); } };
    window.addEventListener('error', listener);
    const app = setup(target, ({ actions, bind }) => div(button({ onClick: actions.fail }, 'Fail'), bind.n),
      (error, { phase }) => { assert(phase === 'event'); reports++; });
    try { target.querySelector('button').click(); app.flush(); assert(reports === 1 && browserErrors === 1 && app.state.n === 0 && app.stateVersion === 1 && target.textContent === 'Fail0'); }
    finally { window.removeEventListener('error', listener); app.dispose(); target.remove(); }
  });
  await test('A.9 repeated native app/conditional cycles return all resource counts to baseline', () => {
    for (let cycle = 0; cycle < 12; cycle++) {
      const target = host(), app = setup(target, ({ actions, bind, when, keyed }) => div(button({ onClick: actions.toggle }, 'Toggle'),
        when(bind.show, () => keyed(bind.rows, row => row.id, context => {
          const name = context.computed(() => context.value.name); context.observe(() => context.value.name);
          return button({ onClick: actions.increment }, context.derive(() => name.value), context.index);
        }))));
      const before = resourceCounts(app);
      for (let step = 0; step < 8; step++) {
        target.querySelector('button').click(); app.flush(); assert(resourceCounts(app).handlers === 1);
        target.querySelector('button').click(); app.flush(); assert(JSON.stringify(resourceCounts(app)) === JSON.stringify(before));
      }
      app.actions.increment(); app.dispose(); empty(app); target.remove();
    }
  });
  await test('A.9 failed native mounts leave no handlers/listeners and can retry', () => {
    const target = host(); let invalid = true;
    const app = createApp({ view: () => div(button({ onClick() {} }, 'Go'), span({ title: invalid ? {} : 'valid' })) });
    throws(() => app.mount(target), 'DOM_ATTRIBUTE_INVALID'); empty(app); invalid = false; app.mount(target);
    assert(resourceCounts(app).handlers === 1 && resourceCounts(app).listeners === 1); app.dispose(); empty(app); target.remove();
  });
}
