import { createActionSchema, createActionSpike } from '../index.js';
/** @typedef {{ count: number, name: string }} State */
/** @typedef {{ name: string }} NamePayload */
// Optional JSDoc; emitted/runtime code is plain JavaScript with no compiler step.
const defineCounter = /** @type {typeof createActionSchema<State>} */ (createActionSchema);
/** @param {unknown} value @returns {value is NamePayload} */
const isName = value => value !== null && typeof value === 'object' && 'name' in value && typeof value.name === 'string';
const schema = defineCounter({ version: 'javascript/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action(isName, (draft, payload) => { draft.name = payload.name; }),
}));
export function exerciseJavaScript() {
  const app = createActionSpike({ schema, initialState: { count: 0, name: 'Ada' } });
  app.dispatch('increment'); app.actions.rename({ name: 'Grace' });
  return app;
}
