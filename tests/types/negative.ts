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
// @ts-expect-error plain objects are not framework-created element descriptors
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
// @ts-expect-error dispatch does not expose an action result or transaction receipt
const receipt: { version: number } = app.actions.increment();
// @ts-expect-error tracked state is read-only
app.observe(state => { state.count++; });
// @ts-expect-error computed state is read-only
app.computed(state => { state.rows.push({ id: 'x' }); });
// @ts-expect-error async observer reads reject
app.observe(async state => state.count);
// @ts-expect-error async invalidation callbacks reject
app.observe(state => state.count, async () => {});
// @ts-expect-error async computed reads reject
app.computed(async state => state.count);
const computed = app.computed(state => state.count);
// @ts-expect-error computed values are read-only
computed.value = 1;
// @ts-expect-error wrong computed result type
const text: string = computed.value;
const observed = app.observe(state => state.name);
// @ts-expect-error observer result types remain inferred
const number: number = observed.read();
// @ts-expect-error dirty is read-only
observed.dirty = false;
import { div, input, derive, when } from 'mini-framework';
// @ts-expect-error functions must be explicit binding tokens
createApp({ view: () => div(() => 'text') });
// @ts-expect-error click handlers cannot be strings
div({ onClick: 'handler' }, 'button');
// @ts-expect-error raw CSS strings are unsupported
div({ style: 'color:red' });
// @ts-expect-error checked accepts boolean values
input({ checked: 'false' });
// @ts-expect-error numeric class flags are not accepted
div({ class: { active: 1 } });
// @ts-expect-error bindings are read-only
app.bind.count = app.bind.count;
// @ts-expect-error object bindings cannot be text children
div(app.bind.rows);
// @ts-expect-error derived state remains read-only
app.derive(state => { state.count++; return state.count; });
// @ts-expect-error async derive callbacks reject
app.derive(async state => state.count);
// @ts-expect-error global derive callbacks must also be synchronous
derive(async () => 'text');
// @ts-expect-error branch factories must be synchronous
when(true, async () => div('text'));

// @ts-expect-error flush takes no arguments
app.flush(1);

import { keyed } from 'mini-framework';
// @ts-expect-error list sources require binding tokens
keyed([], (row: string) => row, () => div());
// @ts-expect-error missing keys must not typecheck
keyed(app.bind.rows, () => undefined, () => div());
// @ts-expect-error object keys are unsupported
keyed(app.bind.rows, row => row, () => div());
// @ts-expect-error async keys are unsupported
keyed(app.bind.rows, async () => 'key', () => div());
// @ts-expect-error async item views are unsupported
keyed(app.bind.rows, () => 'key', async () => div());
// @ts-expect-error item state is read-only
keyed(app.bind.rows, () => 'key', context => { context.value.id = 'changed'; return div(); });
// @ts-expect-error index bindings cannot be mutated
keyed(app.bind.rows, () => 'key', context => { context.index = derive(() => 0); return div(); });

// @ts-expect-error async click handlers are unsupported
div({ onClick: async () => {} });
// @ts-expect-error a required native Event parameter is not supplied by the A.9 API
div({ onClick: (event: MouseEvent) => { event.preventDefault(); } });

// @ts-expect-error Native callbacks must be synchronous.
button({ on: { click: async () => {} } });
// @ts-expect-error Options must be boolean.
button({ on: { click: { handler() {}, capture: 'yes' } } });
// @ts-expect-error Option callbacks must be synchronous.
button({ on: { click: { handler: async () => {}, once: true } } });
// @ts-expect-error Semantic keyboard callbacks must be synchronous.
input({ onKey: async () => {} });
// @ts-expect-error Semantic text callbacks must be synchronous.
input({ onText: async () => {} });
// @ts-expect-error Semantic input snapshots are read-only.
input({ onKey: value => { value.held.push({ key: 'x', code: 'KeyX', location: 0 }); } });
// @ts-expect-error Semantic input snapshots are read-only.
input({ onText: value => { value.value = 'overwrite'; } });

// @ts-expect-error Unknown lanes reject.
app.schedule('urgent', () => {});
// @ts-expect-error Scheduled callbacks must be synchronous.
app.schedule('normal', async () => {});
// @ts-expect-error Navigation requires a URL string.
app.navigate({ path: '/' });
// @ts-expect-error Replace must be boolean.
app.navigate('/', { replace: 'yes' });
// @ts-expect-error Route snapshots are read-only.
app.route!.path = '/';
// @ts-expect-error Query values are read-only arrays.
app.route!.query.tab!.push('changed');
// @ts-expect-error Framework links own href.
app.link('/', { href: '/override' }, 'Home');
// @ts-expect-error Framework links own click.
app.link('/', { on: { click() {} } }, 'Home');
// @ts-expect-error Framework links own legacy click.
app.link('/', { onClick() {} }, 'Home');
// @ts-expect-error Router modes are constrained.
createApp({ router: { mode: 'memory', routes: [] } });
// @ts-expect-error Route factories must be synchronous.
createApp({ router: { routes: [{ path: '/', view: async () => div() }] } });

// @ts-expect-error Locations must be declared.
createApp({ initialState: { n: 0 }, persistence: { namespace: 'test', fields: { n: { location: 'database', validate: () => true } } } });
// @ts-expect-error Unknown state fields reject.
createApp({ initialState: { n: 0 }, persistence: { namespace: 'test', fields: { missing: { location: 'memory' } } } });
// @ts-expect-error External fields require a validator.
createApp({ initialState: { n: 0 }, persistence: { namespace: 'test', fields: { n: { location: 'local' } } } });
// @ts-expect-error Persistence validators must be synchronous.
createApp({ initialState: { n: 0 }, persistence: { namespace: 'test', fields: { n: { location: 'local', validate: async () => true } } } });
// @ts-expect-error Keys are URL-only.
createApp({ initialState: { n: 0 }, persistence: { namespace: 'test', fields: { n: { location: 'local', key: 'n', validate: () => true } } } });
// @ts-expect-error Status diagnostics are read-only.
app.persistence.errors.push({ code: 'x', source: 'local', field: null, message: 'x' });
// @ts-expect-error Flush accepts no arguments.
app.flushPersistence('local');

// B.9: error hooks have the same synchronous contract in both createApp overloads.
// @ts-expect-error Promise-returning error hooks are rejected.
createApp({ onError: async () => {} });
// @ts-expect-error Promise-returning error hooks are rejected with a schema too.
createApp({ schema, initialState: { count: 0, name: 'Ada', rows: [] }, onError: async () => {} });
// @ts-expect-error Error metadata is read-only.
createApp({ onError: (error, info) => { info.phase = 'mount'; } });
// @ts-expect-error Event snapshots preserve contextual native event types.
input({ on: { keydown: event => { const number: number = event.nativeEvent.key; } } });
// @ts-expect-error Native events are not a supported action payload.
app.actions.rename(new Event('input'));
// @ts-expect-error Persisted issue entries are read-only too.
app.persistence.errors[0]!.code = 'changed';
// @ts-expect-error Route parameter maps cannot be mutated.
app.route!.params.id = 'changed';
