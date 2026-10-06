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
    const noPayload: () => void = actions.increment;
    const payload: (value: DeepReadonly<{ name: string }>) => void = actions.rename;
    const named: typeof app.dispatch = dispatch;
    onDispose(() => {}); void noPayload; void payload; void named;
    return String(count);
  },
  onError(error, info) { const phase: import('mini-framework').ErrorPhase = info.phase; void phase; void error; },
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
type DispatchReturn = Expect<Equal<ReturnType<typeof app.dispatch>, void>>;
const completed: void = app.actions.increment();
app.dispatch('rename', { name: 'Grace' });
void completed;

const score = app.computed(state => state.count * 2);
const watched = app.observe(state => state.rows.map(row => row.id), () => {});
const scoreValue: number = score.value;
const ids: string[] = watched.read();
const dirty: boolean = watched.dirty;
const chained = app.computed(() => score.value.toFixed(2));
const chainValue: string = chained.value;
watched.dispose(); score.dispose(); chained.dispose();
createApp({ initialState: { n: 1 }, view({ observe, computed }) {
  const derived = computed(state => state.n * 2);
  const observer = observe(() => derived.value);
  const result: number = observer.read();
  return String(result);
} });
type ComputedInference = Expect<Equal<typeof score.value, number>>;
type ObserverInference = Expect<Equal<ReturnType<typeof watched.read>, string[]>>;
void scoreValue; void ids; void dirty; void chainValue;

import { div, span, form, input, label as labelElement, textarea, select, option, when, derive, element as htmlElement, type Child } from 'mini-framework';
const domApp = createApp({ initialState: { name: 'Ada', shown: true, color: 'red', checked: false },
  view({ bind, derive, when }) {
    return div({ id: 'card', class: { active: bind.shown }, style: { color: bind.color }, 'data-name': bind.name },
      form(labelElement({ htmlFor: 'name' }, 'Name'), input({ id: 'name', value: bind.name, checked: bind.checked }),
        textarea({ value: bind.name }), select({ value: 'one' }, option({ value: 'one' }, 'One'))),
      derive(state => state.name.toUpperCase()), when(bind.shown, ({ bind, onDispose }) => {
        onDispose(() => {}); return span(bind.name);
      }, () => null));
  },
});
const reusable: Child = when(true, () => htmlElement('main', derive(() => domApp.state.name)));
void reusable;

domApp.flush();
const renderPhase: import('mini-framework').ErrorPhase = 'render';
void renderPhase;

import { keyed, li, ul } from 'mini-framework';
const listApp = createApp({ initialState: { rows: [{ id: 'a', name: 'Ada' }] },
  view({ bind, keyed }) { return ul(keyed(bind.rows, row => row.id, context => {
    const name: string = context.value.name;
    const key: string = context.key;
    const position: number = context.position;
    void name; void key; void position;
    return li(context.index, ': ', context.item.name, context.derive(() => context.value.name));
  })); },
});
const standalone = keyed(listApp.bind.rows, row => row.id, ({ item }) => li(item.name));
void standalone;

import { button } from 'mini-framework';
const clickButton = button({ type: 'button', onClick: app.actions.increment }, 'Go');
const payloadButton = button({ onClick: () => app.actions.rename({ name: 'Grace' }) }, 'Rename');
void clickButton; void payloadButton;

// B.1–B.3: contextual native events, semantic data and registration options.
input({ on: { keydown: event => { const key: string = event.nativeEvent.key; event.preventDefault(); },
  scroll: { handler: event => { const target: EventTarget = event.currentTarget; }, passive: true },
  'custom-ready': event => { const native: Event = event.nativeEvent; } },
  onKey: (value, event) => { const held: readonly import('../../src/index.js').HeldKey[] = value.held; if (value.ctrlKey) event.preventDefault(); },
  onText: value => { const text: string = value.value; const composing: boolean = value.isComposing; },
});

// B.4–B.6: priority work and routed contexts preserve state/action inference.
import { outlet, type RouteSnapshot } from 'mini-framework';
const routed = createApp({ schema, initialState, router: { base: '/app', routes: [
  { path: '/people/:id', view(context) {
    const route: RouteSnapshot = context.route;
    const count: number = context.state.count;
    context.actions.rename({ name: route.params.id ?? 'Unknown' });
    context.schedule('normal', context.actions.increment);
    return div(context.derive(() => context.route.query.tab?.join(',') ?? ''),
      context.link('/', { id: 'home', on: { focus: event => { const native: FocusEvent = event.nativeEvent; } } }, 'Home'));
  } },
], notFound: context => context.link('/', 'Home') }, view: () => outlet() });
const cancel: () => void = routed.schedule('idle', () => {}); cancel();
routed.schedule('frame', () => {}); routed.schedule('immediate', routed.actions.increment);
routed.navigate('/people/7?tab=a', { replace: true });
const current: RouteSnapshot | null = routed.route; void current;

// B.7/B.8 field names and validator inputs stay typed.
const persisted = createApp({ initialState: { count: 0, filter: '' }, router: { mode: 'hash', routes: [] },
  persistence: { namespace: 'type-test', version: '1', fields: {
    count: { location: 'local', validate: value => typeof value === 'number' },
    filter: { location: 'url', key: 'q', validate: value => typeof value === 'string' },
  } } });
persisted.flushPersistence();
const pending: boolean = persisted.persistence.pending;
const issues: readonly import('mini-framework').PersistenceIssue[] = persisted.persistence.errors;
void pending; void issues;

// B.9: inferred state survives a contextually typed synchronous error hook.
const withErrorHook = createApp({ initialState: { ready: true }, onError(error, info) {
  const message: string = error.message;
  const phase: import('mini-framework').ErrorPhase = info.phase;
  if (error instanceof FrameworkError) { const code: string = error.code; void code; }
  void message; void phase; return 1;
} });
type ErrorHookState = Expect<Equal<typeof withErrorHook.state.ready, boolean>>;
const withSchemaHook = createApp({ schema, initialState, onError: (error, info) => info.phase });
type ErrorHookActions = Expect<Equal<Parameters<typeof withSchemaHook.actions.rename>, [payload: DeepReadonly<{ name: string }> ]>>;
withSchemaHook.actions.rename({ name: 'Checked' });

// C.1/C.2: services add no dispatch payload and preserve schema inference on restore.
import { hashSnapshot, type ActionServices, type ControlSnapshot } from 'mini-framework';
const controlledSchema = createActionSchema<{ n: number; time: number }>()(({ action }) => ({
  draw: action((draft, services) => { const api: ActionServices = services; draft.n = api.random(); draft.time = api.now(); }),
  scale: action((value: unknown): value is number => typeof value === 'number',
    (draft, payload, services) => { draft.n = payload * services.random(); }),
}));
const controlled = createApp({ initialState: { n: 0, time: 0 }, schema: controlledSchema, controls: { seed: 123, time: 5000 } });
controlled.actions.draw(); controlled.actions.scale(3); controlled.setLogicalTime(6000);
const checkpoint: string = controlled.snapshot(), hash: string = hashSnapshot(checkpoint);
const fork = createApp({ snapshot: checkpoint, schema: controlledSchema });
const control: ControlSnapshot = fork.controls;
type RestoredInference = Expect<Equal<typeof fork.state.n, number>>;
type ServiceDispatchArgs = Expect<Equal<Parameters<typeof fork.actions.draw>, []>>;
type ServicePayloadArgs = Expect<Equal<Parameters<typeof fork.actions.scale>, [payload: number]>>;
void hash; void control;

// C.3/C.4 preserve action arity, tick names and the external envelope boundary.
import type { ExternalInput, EffectTask, InputTicket } from 'mini-framework';
const ticked = createApp({ schema: controlledSchema, initialState: { n:0,time:0 },
  simulation: { tickDuration:10000, action:'draw', maxCatchUp:4 } });
const queued: InputTicket = ticked.enqueue('scale', 2);
ticked.enqueueAt(10, 'draw'); ticked.resumeTicks();
const consumed: number = ticked.advanceTicks(10000); queued.cancel();
const externalSchema = createActionSchema<{ result: unknown }>()(({action})=>({
  result: action((value: unknown): value is ExternalInput => !!value && typeof value === 'object' && 'version' in value,
    (draft,input) => { draft.result=input.value; }),
}));
const externalApp=createApp({schema:externalSchema,initialState:{result:null}});
externalApp.inputs.send('typed','result', {width:100});
externalApp.inputs.sample('typed','result',()=>123);
const task: EffectTask=externalApp.inputs.effect('network','result',async signal=>{
  const response=await fetch('/data',{signal});return {status:response.status,body:await response.text()};
});
externalApp.inputs.measure('viewport','result','viewport');externalApp.inputs.timer('timer','result',10);
void task; void consumed;

// C.5/C.6 adapters preserve native callback types and interpolation state inference.
input({onKey:externalApp.inputs.keyboard('keys','result'),onText:externalApp.inputs.text('text','result')});
const inputStop:()=>void=externalApp.observeInputs(event=>{
  const observed:import('mini-framework').InputExecution=event;
  if(event.packet.kind==='action'){const name:string=event.packet.name;void name;}
  void observed;
});inputStop();
externalApp.receiveInput({version:1,kind:'action',name:'result',args:[{version:1,origin:'saved',status:'success',value:2,error:null}]});
const display=ticked.interpolate(frame=>{
  const before:number=frame.previous.n,after:number=frame.current.n;return before+(after-before)*frame.alpha;
});span(display);

// C.7/C.8 recording policy, frozen validated roots and explicit developer operations.
import { readRecording, serializeRecording } from '../../src/index.js';
app.startRecording({ mode:'recent', maxActions:32, maxBytes:65536, keyframeInterval:4 });
const recordingStatus = app.recording;
const recordingText:string = app.exportRecording();
const recording = readRecording(recordingText, { schemaVersion:app.schemaVersion });
const baselineText:string = recording.baseline.snapshot;
for(const record of recording.records) {
  if(record.root.kind==='dispatch') { const actionName:string=record.root.packet.name; void actionName; }
  if(record.root.kind==='tick') { const tick:number=record.root.tick; void tick; }
}
app.stopRecording();app.clearRecording();void [recordingStatus,baselineText];

const roundTripRecording:string=serializeRecording(recording);void roundTripRecording;
