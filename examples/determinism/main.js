import { createApp, createActionSchema, hashSnapshot, div, p, span, button } from '../../src/index.js';
/** @typedef {{ count: number, last: number, time: number, notice: string }} State */
/** @type {typeof createActionSchema<State>} */
const createSchema = createActionSchema;
export const schema = createSchema({ version: 'controlled-example/1' })(({ action }) => ({
  sample: action((draft, services) => {
    draft.last = services.random(); draft.time = services.now(); draft.count++;
  }),
  fail: action((draft, services) => {
    draft.last = services.random(); draft.count++;
    throw Error('Discard the state changes and random draw.');
  }),
  notice: action(/** @returns {value is string} */ value => typeof value === 'string',
    (draft, value) => { draft.notice = value; }),
}));
export const app = createApp({
  schema, initialState: { count: 0, last: 0, time: 0, notice: '' },
  controls: { seed: 123, time: 0 },
  view: ({ bind, actions }) => div(
    p('Seeded samples: ', span({ id: 'sample-count' }, bind.count)),
    p('Last draw: ', span({ id: 'sample-value' }, bind.last)),
    p('Sample logical time: ', span({ id: 'sample-time' }, bind.time), ' microseconds'),
    button({ id: 'sample', type: 'button', onClick: actions.sample }, 'Draw a sample'),
    button({ id: 'advance', type: 'button', onClick: () => {
      app.setLogicalTime(app.controls.clock.time + 1000); actions.sample();
    } }, 'Advance 1 ms and sample'),
    button({ id: 'failed-sample', type: 'button', onClick: () => {
      try { actions.fail(); } catch { /* The intentional failure leaves the checkpoint unchanged. */ }
    } }, 'Try a failed draw'),
    button({ id: 'compare-fork', type: 'button', onClick: () => {
      const checkpoint = app.snapshot();
      const fork = createApp({ schema, snapshot: checkpoint });
      try {
        actions.sample(); fork.actions.sample();
        const matches = hashSnapshot(app.snapshot()) === hashSnapshot(fork.snapshot());
        actions.notice(matches ? 'Restored continuation matches.' : 'Continuation differs.');
      } finally { fork.dispose(); }
    } }, 'Compare restored continuation'),
    p({ id: 'continuation-result', role: 'status' }, bind.notice),
    p('Clock changes are explicit. Draws commit with state; failed actions consume no committed draw.'),
  ),
});
app.mount();
