import { createActionSchema, createActionSpike, decodeSnapshot, type InputOf,
  type DeepReadonly, type Draft } from '../index.js';

export interface State {
  count: number;
  name: string;
  rows: readonly { readonly id: number; readonly label: string }[];
  settings: { theme?: string };
}
export interface NamePayload { name: string }
export const isName = (value: unknown): value is NamePayload =>
  value !== null && typeof value === 'object' && 'name' in value && typeof value.name === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number';
const isOptionalName = (value: unknown): value is string | undefined => value === undefined || typeof value === 'string';
const isRows = (value: unknown): value is { rows: { id: number; label: string }[] } =>
  value !== null && typeof value === 'object' && 'rows' in value && Array.isArray(value.rows)
  && value.rows.every(row => row && typeof row.id === 'number' && typeof row.label === 'string');

export const schema = createActionSchema<State>({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action(isName, (draft, payload) => { draft.name = payload.name; }),
  amount: action(isNumber, (draft, payload) => { draft.count += payload; }),
  optionalName: action(isOptionalName, (draft, payload) => { draft.name = payload ?? 'default'; }),
  rows: action(isRows, (draft, payload) => { draft.rows = [...payload.rows]; draft.rows[0]!.label = 'editable draft'; }),
  edit: action(draft => { draft.rows.push({ id: 1, label: 'New' }); draft.settings.theme = 'dark'; }),
}));
export const app = createActionSpike({ initialState: { count: 0, name: 'Ada', rows: [], settings: {} }, schema });
app.dispatch('increment'); app.actions.increment();
app.dispatch('rename', { name: 'Grace' }); app.actions.rename({ name: 'Ada' });
app.dispatch('amount', 3); app.actions.amount(2);
app.dispatch('optionalName', undefined); app.dispatch('optionalName', 'Lin');
app.actions.rows({ rows: [{ id: 1, label: 'First' }] });
app.actions.edit();

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type StateInference = Expect<Equal<typeof app.state.count, number>>;
type NameInference = Expect<Equal<Parameters<typeof app.actions.rename>[0], DeepReadonly<NamePayload>>>;
type NoPayload = Expect<Equal<Parameters<typeof app.actions.increment>, []>>;
type OptionalValueRequiredArg = Expect<Equal<Parameters<typeof app.actions.optionalName>, [payload: string | undefined]>>;
type WritableRows = Expect<Equal<Draft<State>['rows'], { id: number; label: string }[]>>;
type Names = Expect<Equal<typeof schema.names[number], 'increment' | 'rename' | 'amount' | 'optionalName' | 'rows' | 'edit'>>;

export type Input = InputOf<typeof schema>;
function dispatchInput(input: Input) {
  if (input.name === 'rename') app.dispatch(input.name, input.payload);
  else if (input.name === 'increment') app.dispatch(input.name);
}
const input: Input = { name: 'rename', payload: { name: 'Ada' } }; dispatchInput(input);
// Decode stays unknown until explicit validation; imported bytes never get a free generic assertion.
const imported: unknown = decodeSnapshot(app.snapshot());
if (isName(imported)) app.actions.rename(imported);
export type PositiveAssertions = [StateInference, NameInference, NoPayload, OptionalValueRequiredArg, WritableRows, Names];
// TypeScript deliberately allows void-typed callbacks to return values. Once
// erased to void, a Promise return cannot be inferred; runtime must reject it.
const erasedPromise: (draft: Draft<State>) => void = async draft => { draft.count++; };
createActionSchema<State>()(({ action }) => ({ erasedPromise: action(erasedPromise) }));
