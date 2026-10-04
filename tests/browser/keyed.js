import { createApp, createActionSchema, div, span, input, keyed } from '../../src/index.js';
export async function runKeyedTests(test, assert, throws, host) {
  const setup = (target, view, actions, initialState = { rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }) =>
    createApp({ target, initialState, view, schema: createActionSchema()(({ action }) =>
      Object.fromEntries(Object.entries(actions).map(([name, run]) => [name, action(run)]))) });
  await test('A.8 keyed permutations preserve focused inputs, selection and node identity without blur', () => {
    const target = host(), app = setup(target, ({ bind }) => div(keyed(bind.rows, row => row.id, ({ item, key, index }) =>
      [span(index), input({ id: key, value: item.name })])), {
      rotate: d => { d.rows.push(d.rows.shift()); }, reverse: d => { d.rows.reverse(); },
      add: d => { d.rows.splice(1, 0, { id: 'd', name: 'D' }); }, remove: d => { d.rows = d.rows.filter(row => row.id !== 'd'); },
    });
    const original = Object.fromEntries([...target.querySelectorAll('input')].map(node => [node.id, node]));
    let blurs = 0; // Browser instrumentation only, outside example/application APIs.
    for (const focus of ['a', 'b', 'c']) {
      original[focus].focus(); original[focus].setSelectionRange(0, 1);
      const listener = () => { blurs++; }; original[focus].addEventListener('blur', listener);
      for (const action of ['rotate', 'reverse', 'add', 'remove', 'reverse', 'rotate']) {
        app.actions[action](); app.flush();
        assert(document.activeElement === original[focus] && original[focus].selectionStart === 0 && original[focus].selectionEnd === 1);
        assert([...target.querySelectorAll('input')].map(node => node.id).join(',') === app.state.rows.map(row => row.id).join(','));
        for (const id of ['a', 'b', 'c']) assert(target.querySelector('#' + id) === original[id]);
      }
      original[focus].removeEventListener('blur', listener);
    }
    assert(blurs === 0); app.dispose(); target.remove();
  });
  await test('A.8 native same-key replacement keeps DOM and retargets bindings/positions', () => {
    const target = host(), app = setup(target, ({ bind, keyed }) => keyed(bind.rows, row => row.id, ({ item, index }) => span(index, item.name)), {
      replace: d => { d.rows[0] = { id: 'a', name: 'new' }; }, reverse: d => { d.rows.reverse(); },
    });
    const nodes = [...target.querySelectorAll('span')]; app.actions.replace(); app.flush(); assert(target.querySelector('span') === nodes[0] && nodes[0].textContent === '0new');
    app.actions.reverse(); app.flush(); assert(target.querySelector('span') === nodes[2] && nodes[0].textContent === '2new'); app.dispose(); target.remove();
  });
  await test('A.8 non-key edits leave key reads and unrelated native text writes untouched', () => {
    let keys = 0, reads = 0; const target = host();
    const app = setup(target, ({ bind, keyed }) => keyed(bind.rows, row => { keys++; return row.id; }, ({ item, derive }) => span(derive(() => { reads++; return String('row') + ':'; }), item.name)), {
      edit: d => { d.rows[0].name = 'new'; },
    });
    const unrelated = target.querySelectorAll('span')[1].lastChild, descriptor = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data'); let writes = 0;
    Object.defineProperty(unrelated, 'data', { get() { return descriptor.get.call(this); }, set(value) { writes++; descriptor.set.call(this, value); } });
    app.actions.edit(); app.flush(); assert(keys === 3 && reads === 3 && writes === 0 && target.querySelector('span').textContent === 'row:new'); app.dispose(); target.remove();
  });
  await test('A.8 removed scopes skip queued reads and clean native DOM/resources', () => {
    let reads = 0, cleanups = 0, captured; const target = host();
    const app = setup(target, ({ bind, keyed }) => keyed(bind.rows, row => row.id, context => {
      captured = context; context.onDispose(() => { cleanups++; });
      return span(context.derive(() => { reads++; return context.value.name; }));
    }), { remove: d => { d.rows = []; } });
    app.actions.remove(); app.flush(); assert(!target.querySelector('span') && reads === 3 && cleanups === 3);
    throws(() => captured.value, 'SCOPE_DISPOSED'); app.dispose(); target.remove();
  });
  await test('A.8 duplicate key render failures preserve prior native list and recover', () => {
    const target = host(), app = setup(target, ({ bind }) => keyed(bind.rows, row => row.id, ({ item }) => span(item.name)), {
      bad: d => { d.rows.push({ id: 'a', name: 'duplicate' }); }, repair: d => { d.rows.pop(); },
    });
    const before = [...target.querySelectorAll('span')]; app.actions.bad(); throws(app.flush, 'LIST_KEY_DUPLICATE');
    assert([...target.querySelectorAll('span')].every((node, index) => node === before[index])); app.actions.repair(); app.flush();
    assert(target.textContent === 'ABC'); app.dispose(); target.remove();
  });
}
