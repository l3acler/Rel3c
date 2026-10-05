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
  onError(error, info) { const phase: 'create' | 'mount' | 'dispatch' | 'event' | 'render' | 'dispose' = info.phase; void phase; void error; },
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
