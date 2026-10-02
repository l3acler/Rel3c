import { createActionSchema, createActionSpike, decodeSnapshot, type DeepReadonly, type Draft } from '../index.js';
import { app, schema, isName, type State, type Input, type NamePayload } from './positive.js';

// @ts-expect-error unknown dispatch name
app.dispatch('missing');
// @ts-expect-error required payload is missing
app.dispatch('rename');
// @ts-expect-error incorrect payload shape
app.dispatch('rename', { name: 2 });
// @ts-expect-error no-payload actions reject payloads, including undefined
app.dispatch('increment', undefined);
// @ts-expect-error extra payload arguments
app.dispatch('amount', 1, 2);
// @ts-expect-error action wrapper has inferred payload type
app.actions.amount('wrong');
// @ts-expect-error unknown action wrapper
app.actions.missing();
// @ts-expect-error wrappers retain no-payload arity
app.actions.increment(1);
// @ts-expect-error a payload union containing undefined still requires its argument
app.dispatch('optionalName');
// @ts-expect-error committed state is read-only
app.state.count++;
// @ts-expect-error committed nested state is read-only
app.state.settings.theme = 'light';
// @ts-expect-error committed arrays are read-only
app.state.rows.push({ id: 2, label: 'No' });
// @ts-expect-error committed array items are read-only
app.state.rows[0]!.label = 'No';
// @ts-expect-error wrappers cannot be replaced
app.actions.increment = () => app.dispatch('increment');
declare const name: 'increment' | 'rename';
// @ts-expect-error uncorrelated union names cannot be paired with a guessed payload
app.dispatch(name, { name: 'Ada' });
// @ts-expect-error discriminated action input requires payload
const missing: Input = { name: 'rename' };
// @ts-expect-error discriminated action input rejects a no-payload action's payload
const extra: Input = { name: 'increment', payload: 1 };
// @ts-expect-error initial state is checked against schema state
createActionSpike({ schema, initialState: { count: 'wrong', name: 'Ada', rows: [], settings: {} } });
// @ts-expect-error decoded imports are unknown until validated
const state: State = decodeSnapshot(app.snapshot());
// @ts-expect-error snapshot API must not assert arbitrary imported types
decodeSnapshot<State>(app.snapshot());
createActionSchema<State>()(({ action }) => ({
  // @ts-expect-error statically visible Promise-returning actions are rejected
  asynchronous: action(async (draft: Draft<State>) => { draft.count++; }),
  // @ts-expect-error payload actions also reject known Promise returns
  asyncPayload: action(isName, async (draft: Draft<State>, payload: DeepReadonly<NamePayload>) => { draft.name = payload.name; }),
  payloadMutation: action(isName, (draft, payload) => {
    // @ts-expect-error payloads are deeply read-only inside actions
    payload.name = 'No';
    draft.name = payload.name;
  }),
  draftCheck: action(draft => {
    // @ts-expect-error draft fields are contextually typed, not any
    draft.count = 'No';
  }),
}));
const readonlyState: DeepReadonly<State> = app.state;
// @ts-expect-error readonly nested data is enforced outside the app instance too
readonlyState.rows[0]!.id = 4;
