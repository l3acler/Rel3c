import { createApp, createActionSchema, element, p, div, button, span, input, ul, li, a } from '../../src/index.js';
const schema = createActionSchema({ version: 'keyed-tasks/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  reverse: action(draft => { draft.rows.reverse(); }),
  add: action(draft => { const id = draft.nextId++; draft.rows.push({ id, name: `Task ${id}`, done: false }); }),
  toggle: action(value => Number.isInteger(value), (draft, id) => {
    const row = draft.rows.find(row => row.id === id); if (row) row.done = !row.done;
  }),
  remove: action(value => Number.isInteger(value), (draft, id) => { draft.rows = draft.rows.filter(row => row.id !== id); }),
  show: action(draft => { draft.showRows = !draft.showRows; }),
  fail: action(draft => { draft.count++; throw new Error('Intentional rollback'); }),
  notice: action(value => typeof value === 'string', (draft, value) => { draft.notice = value; }),
}));
export const app = createApp({ initialState: { count: 0, nextId: 4, showRows: true, notice: '',
  rows: [{ id: 1, name: 'Write the brief', done: false }, { id: 2, name: 'Build the prototype', done: false }, { id: 3, name: 'Review the launch', done: true }] }, schema,
  view({ actions, bind, derive, computed, when, keyed }) {
    const done = computed(state => state.rows.filter(row => row.done).length);
    return element('main',
      a({ href: '../features/' }, '← Launch Board'), element('h1', 'Tasks that keep their place'),
      p('Click actions without reloading. Reverse the list: retained rows keep their DOM nodes and local input edits.'),
      div({ class: 'toolbar' },
        button({ id: 'increment', type: 'button', onClick: actions.increment }, 'Increment'),
        button({ id: 'reverse', type: 'button', onClick: actions.reverse }, 'Reverse list'),
        button({ id: 'add', type: 'button', onClick: actions.add }, 'Add task'),
        button({ id: 'visibility', type: 'button', onClick: actions.show }, 'Show / hide tasks'),
        button({ id: 'rollback', type: 'button', onClick: () => {
          try { actions.fail(); } catch (error) {
            if (error.message !== 'Intentional rollback') throw error;
            actions.notice('The failed action left the counter unchanged.');
          }
        } }, 'Try rollback')),
      p('Counter: ', span({ id: 'counter' }, bind.count), ' · Completed: ', derive(() => done.value), '/', bind.rows.length),
      when(bind.showRows, () => ul({ id: 'tasks' }, keyed(bind.rows, row => row.id, context =>
        li({ 'data-key': context.key, class: { done: context.item.done } },
          span({ class: 'index' }, context.derive(() => context.position + 1)),
          element('label', { class: 'row-name' }, span({ class: 'hint' }, 'Task ', context.key),
            input({ 'aria-label': context.derive(() => `Task ${context.key}`), value: context.item.name })),
          button({ type: 'button', 'data-toggle': context.key, onClick: () => actions.toggle(context.key) }, context.derive(() => context.value.done ? 'Reopen' : 'Complete')),
          button({ type: 'button', 'data-remove': context.key, onClick: () => actions.remove(context.key) }, 'Remove'))))),
      p({ class: 'notice', id: 'notice', 'aria-live': 'polite' }, bind.notice),
      p({ class: 'hint' }, 'Text edits stay local to native inputs; input-to-state handlers come in Phase B. Hiding/removing a row disposes its scope, so local edits reset when that row is recreated.'));
  },
});
app.mount();
