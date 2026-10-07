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

// C.1/C.2 controlled services have a synchronous, read-only typed surface.
// @ts-expect-error Seed accepts numbers, with the uint32 range enforced at runtime.
createApp({ controls: { seed: '123' } });
// @ts-expect-error Unknown control options reject.
createApp({ controls: { tickDuration: 1000 } });
// @ts-expect-error Snapshots are canonical wire text rather than decoded objects.
createApp({ snapshot: {} });
// @ts-expect-error Hashing accepts checkpoint text.
hashSnapshot(12);
// @ts-expect-error Snapshot export has no arguments.
app.snapshot(1);
// @ts-expect-error Clock advances require a numeric logical time.
app.setLogicalTime('1000');
// @ts-expect-error Control snapshots are read-only.
app.controls.random.state = 1;
// @ts-expect-error Controls provide committed metadata, not a live random method.
app.controls.random();
// @ts-expect-error Services are read-only, including their methods.
createActionSchema<State>()(({ action }) => ({ bad: action((draft, services) => { services.random = () => 0; }) }));
// @ts-expect-error Services do not permit action-driven clock advancement.
createActionSchema<State>()(({ action }) => ({ bad: action((draft, services) => { services.setLogicalTime(1); }) }));
// @ts-expect-error Async action bodies remain forbidden when using services.
createActionSchema<State>()(({ action }) => ({ bad: action(async (draft, services) => { draft.count = services.random(); }) }));
import { hashSnapshot } from 'mini-framework';

// C.3/C.4 queue arity and adapter callback contracts remain strict.
// @ts-expect-error Missing payload remains invalid at queue admission.
app.enqueue('rename');
// @ts-expect-error Queue no-payload actions still accept no arguments.
app.enqueue('increment', 1);
// @ts-expect-error Future ticks are numeric.
app.enqueueAt('one', 'increment');
// @ts-expect-error A configured tick action must take no payload.
createApp({ schema, simulation:{tickDuration:10,action:'rename'} });
// @ts-expect-error Unknown simulation options reject.
createApp({ simulation:{tickDuration:10,clock:'wall'} });
// @ts-expect-error Runtime tick status is read-only.
app.ticks.paused=false;
// @ts-expect-error Ordinary payload actions do not accept the external envelope.
app.inputs.send('origin','rename', 'value');
const anyEnvelope=createApp({schema:createActionSchema<State>()(({action})=>({ any:action((v:unknown):v is unknown=>true,()=>{}) }))});
// @ts-expect-error Samplers must be synchronous.
anyEnvelope.inputs.sample('origin','any',async()=>1);

// @ts-expect-error Input observation callbacks are synchronous.
app.observeInputs(async input=>{});
// @ts-expect-error Packets use version 1.
app.receiveInput({version:2,kind:'action',name:'increment',args:[]});
// @ts-expect-error Dense action argument tuples accept at most one payload.
app.receiveInput({version:1,kind:'action',name:'increment',args:[1,2]});
// @ts-expect-error Typed keyboard adapters require envelope payload actions.
app.inputs.keyboard('origin','increment');
// @ts-expect-error Typed text adapters require envelope payload actions.
app.inputs.text('origin','rename');
// @ts-expect-error Interpolation callbacks must be synchronous.
app.interpolate(async frame=>1);
// @ts-expect-error Previous tick state is read-only.
app.interpolate(frame=>{frame.previous.count=2;return 0;});
// @ts-expect-error Display alpha is read-only.
app.interpolate(frame=>{frame.alpha=1;return 0;});

// C.7/C.8 recording options, imported readonly traces and string wire input.
import { readRecording, serializeRecording } from '../../src/index.js';
// @ts-expect-error Unknown recording mode.
app.startRecording({mode:'full'});
// @ts-expect-error Numeric retention budget.
app.startRecording({maxBytes:'large'});
// @ts-expect-error Unknown recording option.
app.startRecording({upload:true});
// @ts-expect-error Canonical string import only.
readRecording({});
// @ts-expect-error Expected schema version is a string.
readRecording('',{schemaVersion:3});
// @ts-expect-error Status is read-only.
app.recording.status='off';
// @ts-expect-error Imported record list is read-only.
readRecording('').records.push({});
// @ts-expect-error Baseline continuation is read-only.
readRecording('').baseline.snapshot='changed';

// @ts-expect-error Only recording values have the serialization shape.
serializeRecording({});

import { createReplay } from 'mini-framework';
// @ts-expect-error A recording is required.
createReplay({});
// @ts-expect-error Replay creates its own app; an existing target is not configuration.
createReplay({recording:'',target:document.body});
// @ts-expect-error Replay does not accept live error hooks.
createReplay({recording:'',onError:()=>{}});
// @ts-expect-error Replay view must return synchronous public view nodes.
createReplay({recording:'',view:async()=>div()});
// @ts-expect-error Registered tick action must have zero payload.
createReplay({recording:'',schema,simulation:{tickDuration:10,action:'rename'}});
// @ts-expect-error Replay status is read-only.
createReplay({recording:''}).status.position=2;
// @ts-expect-error Replay step count is numeric.
createReplay({recording:''}).step('one');
// @ts-expect-error Replay infers the registered payload type.
createReplay({recording:'',schema}).app.actions.rename(2);
// @ts-expect-error Replay app state remains read-only.
createReplay({recording:'',schema}).app.state.count=3;

import { createHistory } from 'mini-framework';
// @ts-expect-error A recording is required.
createHistory({});
// @ts-expect-error Reversible action names must be registered.
createHistory({recording:'',schema,reversible:['missing']});
// @ts-expect-error Reversible names require an array.
createHistory({recording:'',schema,reversible:'increment'});
// @ts-expect-error History starts headlessly; mount explicitly.
createHistory({recording:'',target:document.body});
// @ts-expect-error History cannot accept caller mutable initial state.
createHistory({recording:'',initialState:{}});
// @ts-expect-error Seek is a numeric complete root sequence.
createHistory({recording:''}).seek('last');
// @ts-expect-error Status is readonly.
createHistory({recording:''}).status.canUndo=true;
// @ts-expect-error Undo count is numeric.
createHistory({recording:''}).undo('one');
// @ts-expect-error Branching preserves registered payload inference.
createHistory({recording:'',schema}).branch().actions.rename(2);
// @ts-expect-error History views must be synchronous.
createHistory({recording:'',view:async()=>div()});
