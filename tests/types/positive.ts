import { createApp, createActionSchema, FrameworkError, type DeepReadonly, type Draft } from 'mini-framework';
interface State { count: number; name: string; rows: { id: string }[] }
const namePayload = (value: unknown): value is { name: string } =>
  !!value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string';
const schema = createActionSchema<State>({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action(namePayload, (draft, payload) => { draft.name = payload.name; }),
}));
const initialState: State = { count: 0, name: 'Ada', rows: [] };
const app = createApp({ schema, initialState,
  view({ state, actions, dispatch, onDispose }) {
    const count: number = state.count;
    const noPayload: () => never = actions.increment;
    const payload: (value: DeepReadonly<{ name: string }>) => never = actions.rename;
    const named: typeof app.dispatch = dispatch;
    onDispose(() => {}); void noPayload; void payload; void named;
    return String(count);
  },
  onError(error, info) { const phase: 'create' | 'mount' | 'dispatch' | 'dispose' = info.phase; void phase; void error; },
});
const detached: typeof app.mount = app.mount;
const defaultMounted: typeof app = detached();
void defaultMounted;
const readOnly: DeepReadonly<State> = app.state;
const draft: Draft<Readonly<State>> = initialState; draft.count++;
const element = document.querySelector('main'); if (element) { detached(element); app.dispose(); }
const inferred = createApp({ initialState: { label: 'hello' }, view: ({ state }) => state.label });
const label: string = inferred.state.label;
const version: string = app.schemaVersion;
const name: 'increment' | 'rename' = app.actionNames[0]!;
const error = new FrameworkError('EXAMPLE', 'Test error', { cause: new Error('cause') });
void label; void version; void name; void error; void readOnly;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type StateInference = Expect<Equal<typeof app.state, DeepReadonly<State>>>;
type NoPayloadInference = Expect<Equal<Parameters<typeof app.actions.increment>, []>>;
type PayloadInference = Expect<Equal<Parameters<typeof app.actions.rename>, [payload: DeepReadonly<{ name: string }> ]>>;
type NameInference = Expect<Equal<typeof app.actionNames[number], 'increment' | 'rename'>>;
type InferredState = Expect<Equal<typeof inferred.state.label, string>>;
