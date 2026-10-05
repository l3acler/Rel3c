import { createApp, createActionSchema, div, p, span, button, label, input, outlet } from '../../src/index.js';

/** @typedef {{saved: number, note: string, filter: string, temp: number}} State */
/** @type {typeof createActionSchema<State>} */
const createSchema = createActionSchema;
const schema = createSchema({ version: 'persistence-example-1' })(({ action }) => ({
  increment: action(draft => { draft.saved++; draft.temp++; }),
  note: action(/** @returns {value is string} */ value => typeof value === 'string',
    (draft, value) => { draft.note = value; }),
  filter: action(/** @returns {value is string} */ value => typeof value === 'string',
    (draft, value) => { draft.filter = value; }),
  fail: action(draft => { draft.saved++; draft.filter = 'discard'; throw Error('Discard this transaction'); }),
}));

export const app = createApp({
  initialState: { saved: 0, note: '', filter: '', temp: 0 }, schema,
  persistence: {
    namespace: 'public-example', version: '1',
    fields: {
      saved: { location: 'local', validate: value => typeof value === 'number' && Number.isFinite(value) },
      note: { location: 'session', validate: value => typeof value === 'string' },
      filter: { location: 'url', key: 'filter', validate: value => typeof value === 'string' },
      temp: { location: 'memory' },
    },
  },
  router: { mode: 'hash', routes: [
    { path: '/', view: ({ link }) => div({ id: 'persist-home' }, 'Home. ', link('/details', { id: 'persist-details-link' }, 'Details')) },
    { path: '/details', view: ({ link }) => div({ id: 'persist-details' }, 'Details. ', link('/', { id: 'persist-home-link' }, 'Home')) },
  ] },
  view: ({ bind, actions }) => div(
    outlet(),
    p('Local saved count: ', span({ id: 'persist-saved' }, bind.saved)),
    p('Memory count (resets on reload): ', span({ id: 'persist-temp' }, bind.temp)),
    button({ id: 'persist-increment', type: 'button', onClick: actions.increment }, 'Increment both'),
    p(label({ for: 'persist-note' }, 'Session note'),
      input({ id: 'persist-note', value: bind.note, onText: value => actions.note(value.value) })),
    p(label({ for: 'persist-filter' }, 'URL filter (specific to this history entry)'),
      input({ id: 'persist-filter', value: bind.filter, onText: value => actions.filter(value.value) })),
    button({ id: 'persist-flush', type: 'button', onClick: () => { app.flushPersistence(); } }, 'Flush storage now'),
    button({ id: 'persist-fail', type: 'button', onClick: () => {
      try { actions.fail(); } catch { /* Expected demonstration rollback; nothing is persisted. */ }
    } }, 'Try rollback'),
  ),
  onError: (error, { phase }) => console.error('Framework error during ' + phase, error),
});
app.mount();
