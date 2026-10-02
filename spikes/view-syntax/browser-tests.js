import { createSyntaxApp, div, span, button, input, html, when, keyed, li, derive } from './index.js';
import { modes, initialState, actions, exampleView } from './examples.js';
import { createCowEngine } from '../transactions/cow-engine.js';
import { createStagedEngine } from '../transactions/staged-engine.js';

const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
function throws(fn, pattern) {
  let error; try { fn(); } catch (value) { error = value; }
  assert(error && pattern.test(error.message), 'Expected error ' + pattern + ', got ' + error);
}
export async function runSyntaxTests() {
  const results = [];
  const test = async (name, fn) => {
    const target = document.createElement('section'); document.body.append(target);
    const apps = [];
    const mount = config => { const app = createSyntaxApp({ target, initialState: initialState(), actions,
      view: exampleView('elements'), ...config }); apps.push(app); return app; };
    try { await fn(target, mount); results.push({ name, passed: true }); }
    catch (error) { throw new Error(name + ': ' + error.stack); }
    finally { apps.forEach(app => app.dispose()); target.remove(); }
  };
  for (const mode of modes) {
    await test(mode + ': native form, event ownership, exact changed writes', (target, mount) => {
      const app = mount({ view: exampleView(mode) });
      const count = target.querySelector('#count'); const untouched = target.querySelector('#unrelated');
      const before = app.metrics;
      target.querySelector('#inc').click();
      assert(app.state.count === 1 && count.textContent === '0', 'Commit immediate, DOM delayed');
      app.flush();
      assert(count.textContent === '1' && untouched === target.querySelector('#unrelated'));
      assert(app.metrics.valueWrites - before.valueWrites === 2, 'One text + one attribute write');
      assert(app.metrics.structuralWrites === before.structuralWrites, 'No structural churn');
      assert(app.metrics.viewEvaluations - before.viewEvaluations === (mode === 'template-eager' ? 1 : 0), 'View dependency gate');
      const field = target.querySelector('#name'); field.focus(); field.setSelectionRange(1, 2);
      field.value = 'Grace'; field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      app.flush(); assert(app.state.name === 'Grace' && field.value === 'Grace');
      assert(document.activeElement === field && field.selectionStart === 5, 'No overwrite of native input');
      assert(target.querySelector('label').control === field && field.required);
      assert(!target.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      app.actions.disable(); app.flush(); assert(target.querySelector('#inc').disabled);
      target.querySelector('#inc').click(); assert(app.state.count === 1, 'Native disabled button does not activate');
      assert(!target.querySelector('[onclick]') && !target.querySelector('[\\@click]'));
    });
    await test(mode + ': coalescing, rollback, readonly and async rejection', (target, mount) => {
      const app = mount({ view: exampleView(mode) }); const version = app.version;
      throws(() => { app.state.count = 9; }, /read-only/);
      throws(() => app.actions.fail(), /rollback/); throws(() => app.actions.async(), /synchronous/);
      app.flush(); assert(app.version === version && target.querySelector('#count').textContent === '0');
      const before = app.metrics; app.actions.increment(); app.actions.increment(); app.flush();
      assert(app.state.count === 2 && app.metrics.valueWrites - before.valueWrites === 2);
    });
    await test(mode + ': keyed reorder, insertion, row invalidation and focused identity', (target, mount) => {
      const app = mount({ view: exampleView(mode) });
      const rows = [...target.querySelectorAll('li')]; const focused = rows[1].querySelector('input');
      focused.focus(); focused.setSelectionRange(1, 3);
      app.actions.reverse(); app.flush();
      assert([...target.querySelectorAll('li')].every((node, index) => node === rows[3 - index]));
      assert(document.activeElement === focused && focused.selectionStart === 1 && focused.selectionEnd === 3);
      app.actions.insert(); app.flush(); assert(target.querySelectorAll('li').length === 5);
      assert(rows.every(row => row.isConnected));
      const before = app.metrics; app.actions.edit({ id: 2, label: 'Edited' }); app.flush();
      assert(rows[2].querySelector('.row-label').textContent === 'Edited');
      assert(app.metrics.valueWrites - before.valueWrites === 2, 'Only row text and input');
      assert(app.metrics.viewEvaluations === before.viewEvaluations, 'No list/row view reevaluation');
      app.actions.replace(); app.flush(); assert(target.querySelector('li').textContent === 'Replacement');
      app.actions.remove(2); app.flush(); assert(!rows[2].isConnected);
    });
    await test(mode + ': conditional and full resource disposal', (target, mount) => {
      const app = mount({ view: exampleView(mode) }); const effects = app.metrics.effects;
      app.actions.show(); app.flush(); assert(!target.querySelector('#conditional'));
      assert(app.metrics.effects < effects);
      app.actions.show(); app.flush(); assert(target.querySelector('#conditional'));
      const button = target.querySelector('#inc'); const state = app.state.count;
      app.dispose(); const metrics = app.metrics;
      assert(!target.childNodes.length && !metrics.effects && !metrics.handlers && !metrics.listeners && !metrics.subscriptions);
      button.click(); assert(app.state.count === state); throws(() => app.actions.increment(), /disposed/);
      app.dispose();
    });
  }
  for (const engineFactory of [createCowEngine, createStagedEngine]) {
    await test(engineFactory.name + ': shared renderer adapter', (target, mount) => {
      const app = mount({ engineFactory, view: exampleView('template-bind') });
      app.actions.increment(); app.actions.reverse(); app.actions.edit({ id: 1, label: 'Changed' }); app.flush();
      assert(target.querySelector('#count').textContent === '1');
      assert(target.querySelector('[data-id="1"]').textContent === 'Changed');
    });
  }
  await test('text and quoted attributes never become markup', (target, mount) => {
    const injection = '<img src=x onerror=alert(1)><script>bad()</script>" onclick="bad()';
    const app = mount({ initialState: { value: injection }, view: ({ bind }) => html`<p title=${bind.value}>${bind.value}</p>` });
    assert(target.querySelector('p').textContent === injection && target.querySelector('p').title === injection);
    assert(!target.querySelector('img,script,[onclick]'));
    app.dispose();
    mount({ initialState: { value: injection }, view: ({ bind }) => div({ title: bind.value }, bind.value) });
    assert(target.querySelector('div').textContent === injection && !target.querySelector('img,script'));
  });
  await test('one property evaluates/writes one text binding, not the unrelated binding', (target, mount) => {
    let unrelatedReads = 0;
    const app = mount({ view: ({ state, bind }) => div(span({ id: 'count' }, bind.count),
      span({ id: 'unrelated' }, derive(() => { unrelatedReads++; return state.unrelated; }))) });
    const before = app.metrics; const other = target.querySelector('#unrelated').firstChild;
    app.actions.increment(); app.flush();
    assert(app.metrics.evaluations - before.evaluations === 1 && app.metrics.valueWrites - before.valueWrites === 1);
    assert(unrelatedReads === 1 && target.querySelector('#unrelated').firstChild === other);
  });
  await test('equal-valued eager expressions remain correct through conservative capture', (target, mount) => {
    const app = mount({ initialState: { a: 0, b: 0 }, actions: { b: state => { state.b++; } },
      view: ({ state }) => html`<span id="first">${state.a + state.b}</span><span id="second">${state.a}</span>` });
    app.actions.b(); app.flush();
    assert(target.querySelector('#first').textContent === '1' && target.querySelector('#second').textContent === '0');
    assert(app.metrics.viewEvaluations === 2, 'Whole view reevaluated to retain correctness');
  });
  await test('deep bindings, replacement and alias identity invalidate exact leaves', (target, mount) => {
    const shared = { name: 'Ada' };
    const app = mount({ initialState: { user: shared, alias: shared, untouched: 'same' },
      actions: { edit: state => { state.alias.name = 'Grace'; }, replace: state => { state.user = { name: 'Lin' }; } },
      view: ({ bind }) => div(span({ id: 'user' }, bind.user.name), span({ id: 'alias' }, bind.alias.name), span(bind.untouched)) });
    const before = app.metrics;
    app.actions.edit(); app.flush(); assert(app.metrics.evaluations - before.evaluations === 2);
    assert(target.querySelector('#user').textContent === 'Grace' && app.state.user === app.state.alias);
    const next = app.metrics; app.actions.replace(); app.flush();
    assert(app.metrics.evaluations - next.evaluations === 1 && target.querySelector('#user').textContent === 'Lin');
    assert(target.querySelector('#alias').textContent === 'Grace');
  });
  await test('dynamic attributes remove cleanly and safe links retain native semantics', (target, mount) => {
    const app = mount({ initialState: { title: '"quoted"', href: '/safe' },
      actions: { clear: state => { state.title = null; state.href = 'https://example.com/path'; } },
      view: ({ bind }) => html`<a title=${bind.title} href=${bind.href}>Link</a>` });
    const link = target.querySelector('a'); assert(link.title === '"quoted"' && link.getAttribute('href') === '/safe');
    app.actions.clear(); app.flush(); assert(!link.hasAttribute('title') && link.href === 'https://example.com/path');
  });
  await test('keyed eager closures receive updated captures without replacing nodes', (target, mount) => {
    const app = mount({ view: ({ state, bind }) => {
      const count = state.count;
      return keyed(bind.rows, row => row.id, ({ bind }) => li(count, ':', bind.label));
    } });
    const row = target.querySelector('li'); app.actions.increment(); app.flush();
    assert(row === target.querySelector('li') && row.textContent === '1:Row 0');
  });
  const invalid = [
    ['inline template event', () => html`<button onclick="bad()">No</button>`, /Unsafe attribute/],
    ['element inline event', () => button({ onclick: 'bad()' }, 'No'), /Unsafe attribute/],
    ['dynamic event string', () => html`<button @click=${'bad()'}>No</button>`, /function handler/],
    ['script tag', () => html`<script>bad()</script>`, /unsafe prototype tag/],
    ['javascript URL', () => html`<a href=${'javascript:alert(1)'}>No</a>`, /Unsafe URL/],
    ['static javascript URL', () => html`<a href="javascript:alert(1)">No</a>`, /Unsafe URL/],
    ['comment slot', () => html`<!-- ${'value'} -->`, /comments/],
    ['dynamic attribute name', () => html`<p ${'title'}="value">No</p>`, /Dynamic attribute/],
    ['raw styles', () => html`<p style=${'color:red'}>No</p>`, /style/],
    ['raw function child', () => span(() => 1), /Children/],
    ['render dispatch', context => { context.actions.increment(); return null; }, /during render/],
    ['render state mutation', context => { context.state.count++; return null; }, /read-only/],
    ['duplicate keys', ({ bind }) => keyed(bind.rows, () => 'same', () => li('row')), /duplicate list key/],
    ['missing keys', ({ bind }) => keyed(bind.rows, () => undefined, () => li('row')), /list key/],
  ];
  for (const [name, view, pattern] of invalid) await test('reject ' + name + ' and clean failed mount', (target, mount) => {
    throws(() => mount({ view }), pattern); assert(target.childNodes.length === 0, 'Failed mount must clean DOM');
  });
  await test('style objects, derived expressions and mixed attributes', (target, mount) => {
    const app = mount({ view: ({ bind, state }) => div({ style: derive(() => ({ color: state.disabled ? 'red' : 'blue' })) },
      html`<span class="count-${bind.count}" title="${bind.name}: ${bind.count}">${derive(() => state.count * 2)}</span>`) });
    app.actions.increment(); app.actions.disable(); app.flush();
    assert(target.querySelector('div').style.color === 'red');
    assert(target.querySelector('span').className === 'count-1' && target.querySelector('span').title === 'Ada: 1');
    assert(target.querySelector('span').textContent === '2');
  });
  await test('scroll, keyboard, bubbling cancellation and unmount handlers', (target, mount) => {
    const app = mount({ initialState: { count: 0 }, view: ({ actions }) => div({ onClick: () => actions.increment(),
      onScroll: () => actions.increment(), onKeydown: event => { if (event.key === 'Enter') actions.increment(); } },
    button({ onClick: event => { event.stopPropagation(); actions.increment(); } }, 'Go')) });
    target.querySelector('button').click(); assert(app.state.count === 1);
    target.querySelector('div').dispatchEvent(new Event('scroll'));
    target.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert(app.state.count === 3 && app.metrics.listeners === 3);
  });
  await test('conditional handler cleanup and cached template clones', (target, mount) => {
    const app = mount({ view: ({ bind, actions }) => when(bind.show,
      () => html`<button @click=${() => actions.increment()}>Go</button>`) });
    const removed = target.querySelector('button');
    app.actions.show(); app.flush(); assert(app.metrics.handlers === 0 && app.metrics.listeners === 0);
    removed.click(); assert(app.state.count === 0);
    app.actions.show(); app.flush(); assert(app.metrics.templateParses === 1 && app.metrics.templateClones === 2);
  });
  await test('automatic requestAnimationFrame rendering', async (target, mount) => {
    const app = mount({ view: ({ bind }) => span(bind.count) }); app.actions.increment();
    await new Promise(resolve => requestAnimationFrame(resolve)); assert(target.textContent === '1');
  });
  await test('repeated mount/conditional cycles do not grow owned resources', (target, mount) => {
    const app = mount({ view: exampleView('template-bind') }); const before = app.metrics;
    for (let cycle = 0; cycle < 100; cycle++) { app.actions.show(); app.flush(); app.actions.show(); app.flush(); }
    const next = app.metrics;
    for (const key of ['effects', 'handlers', 'listeners', 'subscriptions']) assert(next[key] === before[key], 'Resource growth: ' + key);
    assert(next.templateParses === before.templateParses, 'No extra parses');
  });
  return { passed: results.length, results };
}
