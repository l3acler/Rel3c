import { createApp, createActionSchema, type Draft } from 'mini-framework';
interface State { count: number; name: string; rows: { id: string }[] }
const schema = createActionSchema<State>()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action((value: unknown): value is { name: string } => true, (draft, payload) => { draft.name = payload.name; }),
}));
const app = createApp({ schema, initialState: { count: 0, name: 'Ada', rows: [] } });
// @ts-expect-error unknown action
app.dispatch('missing');
// @ts-expect-error missing required payload
app.dispatch('rename');
// @ts-expect-error extra payload for no-payload action
app.dispatch('increment', undefined);
// @ts-expect-error payload mismatch
app.actions.rename({ name: 1 });
// @ts-expect-error unknown wrapper
app.actions.missing();
// @ts-expect-error read-only app metadata
app.mounted = true;
// @ts-expect-error read-only state
app.state.count = 1;
// @ts-expect-error nested arrays are read-only
app.state.rows.push({ id: 'x' });
// @ts-expect-error nested properties are read-only
app.state.rows[0]!.id = 'x';
// @ts-expect-error invalid target
app.mount({ nodeType: 1 });
// @ts-expect-error schema state cannot be replaced by incompatible initial data
createApp({ schema, initialState: { count: 'bad', name: 'Ada', rows: [] } });
// @ts-expect-error async views do not satisfy the text boundary
createApp({ view: async () => 'text' });
// @ts-expect-error element descriptors are not implemented yet
createApp({ view: () => ({ tag: 'div' }) });
// @ts-expect-error placeholder seed is not an implemented option
createApp({ seed: 1 });
// @ts-expect-error actions must use an explicit schema rather than implicit arity
createApp({ actions: { increment() {} } });
// @ts-expect-error statically visible async cleanup
app.onDispose(async () => {});
// @ts-expect-error statically visible async action
createActionSchema<State>()(({ action }) => ({ bad: action(async (draft: Draft<State>) => { draft.count++; }) }));
declare const unionName: 'increment' | 'rename';
// @ts-expect-error uncorrelated action/payload
app.dispatch(unionName, { name: 'Ada' });
// @ts-expect-error wrappers are immutable
app.actions.increment = () => { throw Error(); };
// @ts-expect-error mounted is read-only in view context too
createApp({ initialState: { count: 0 }, view: ({ state }) => { state.count = 1; return ''; } });
