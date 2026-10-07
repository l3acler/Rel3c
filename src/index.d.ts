/** Experimental public frontend runtime. See DOCUMENTATION.md for compatibility and browser qualification. */
export const VERSION: string;
export interface FrameworkInfo {
  readonly name: string; readonly version: string; readonly phase: string;
  readonly capabilities: readonly string[];
}
export const FRAMEWORK_INFO: FrameworkInfo;
export class FrameworkError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions);
}
export function hashSnapshot(snapshot: string): string;
export interface RecordingOptions {
  readonly mode?: 'recent' | 'session'; readonly maxActions?: number;
  readonly maxBytes?: number; readonly keyframeInterval?: number;
}
export interface RecordingStatus {
  readonly status:'off'|'active'|'stopped'|'limit-reached'; readonly mode:'recent'|'session'|null;
  readonly reason:'action-limit'|'byte-limit'|'baseline-limit'|'capture-failed'|null;
  readonly records:number; readonly actions:number; readonly bytes:number;
  readonly maxBytes:number; readonly maxActions:number; readonly keyframeInterval:number;
  readonly baselineSequence:number; readonly endSequence:number;
  readonly evictedRecords:number; readonly evictedActions:number;
}
export interface RecordedError { readonly name:string; readonly message:string; readonly code:string|null; }
export interface RecordedRoute { readonly mode:'history'|'hash'; readonly base:string; readonly url:string; }
export interface RecordingPoint { readonly sequence:number; readonly snapshot:string; readonly route:RecordedRoute|null; }
export type RecordingRoot =
  | Readonly<{kind:'dispatch';packet:Extract<InputPacket,{kind:'action'}>}>
  | Readonly<{kind:'input';input:InputExecution;queued:boolean}>
  | Readonly<{kind:'tick';tick:number;action:string|null}>
  | Readonly<{kind:'time';time:number}>;
export type RecordingEvent =
  | Readonly<{type:'action';phase:'queued';id:number;parent:number|null;packet:Extract<InputPacket,{kind:'action'}>}>
  | Readonly<{type:'action';phase:'dispatched'|'committed'|'failed'|'discarded';id:number;stateVersion:number;error:RecordedError|null}>
  | Readonly<{type:'input';phase:'dispatched';id:number;parent:number|null;input:InputExecution;queued:boolean}>
  | Readonly<{type:'input';phase:'succeeded'|'failed';id:number;stateVersion:number;error:RecordedError|null}>;
export interface RecordingRecord {
  readonly sequence:number; readonly root:RecordingRoot; readonly events:readonly RecordingEvent[];
  readonly actions:number; readonly commits:number;
  readonly after:Readonly<{hash:string;stateVersion:number;tick:number;time:number;draws:number;randomState:number;route:RecordedRoute|null}>;
  readonly checkpoint:string|null; readonly outcome:'succeeded'|'failed'; readonly error:RecordedError|null;
}
export interface Recording {
  readonly format:'mini-framework-recording'; readonly version:1; readonly runtimeVersion:'mini-framework-runtime/1'; readonly schemaVersion:string;
  readonly policy:Required<RecordingOptions>; readonly status:'active'|'stopped'|'limit-reached'; readonly reason:RecordingStatus['reason'];
  readonly evictedRecords:number; readonly evictedActions:number; readonly baseline:RecordingPoint;
  readonly records:readonly RecordingRecord[]; readonly end:RecordingPoint;
}
/** Validate a canonical recording and decode frozen traces without executing it. */
export function readRecording(text:string, options?:Readonly<{schemaVersion?:string}>): Recording;
/** Return the canonical wire of an immutable recording returned by readRecording. */
export function serializeRecording(recording:Recording): string;
export interface ActionServices {
  /** Logical microseconds; constant throughout an action batch. */
  readonly now: () => number;
  /** Transactional simulation draw in [0, 1); expires after the body finishes. */
  readonly random: () => number;
}
export interface ControlOptions { readonly seed?: number; readonly time?: number; }
export interface ControlSnapshot {
  readonly clock: { readonly mode: 'manual'; readonly time: number; readonly tick: 0; readonly tickDuration: null }
    | { readonly mode: 'fixed'; readonly time: number; readonly tick: number; readonly tickDuration: number };
  readonly random: { readonly algorithm: 'xorshift32-13-17-5/1'; readonly seed: number; readonly state: number; readonly draws: number };
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type Draft<T> = T extends object ? { -readonly [K in keyof T]: Draft<T[K]> } : T;
type Sync<F extends (...args: never[]) => unknown> =
  Extract<ReturnType<F>, PromiseLike<unknown>> extends never ? unknown : never;
declare const specification: unique symbol;
declare const schemaState: unique symbol;
export interface ActionSpec<S, Args extends [] | [unknown]> {
  readonly input: 'none' | 'payload'; readonly [specification]: { state: S; args: Args };
}
export interface ActionBuilder<S> {
  action<F extends (draft: Draft<S>, services: ActionServices) => unknown>(run: F & Sync<F>): ActionSpec<S, []>;
  action<P, F extends (draft: Draft<S>, payload: DeepReadonly<P>, services: ActionServices) => unknown>(
    validate: (value: unknown) => value is P, run: F & Sync<F>
  ): ActionSpec<S, [payload: DeepReadonly<P>]>;
}
export type Definitions<S> = Record<string, ActionSpec<S, [] | [unknown]>>;
export interface ActionSchema<S, D extends Definitions<S>> {
  readonly version: string; readonly names: readonly (keyof D & string)[];
  readonly [schemaState]: { state: S; definitions: D };
}
export function createActionSchema<S extends object = Record<string, unknown>>(options?: { version?: string }):
  <D extends Definitions<S>>(build: (helpers: ActionBuilder<S>) => D) => ActionSchema<S, D>;
type ArgsOf<T> = T extends ActionSpec<unknown, infer Args> ? Args : never;
type DispatchArgs<D> = { [K in keyof D & string]: [name: K, ...ArgsOf<D[K]>] }[keyof D & string];
type TickNames<D> = { [K in keyof D & string]: ArgsOf<D[K]> extends [] ? K : never }[keyof D & string];
type ExternalNames<D> = { [K in keyof D & string]: [ExternalInput] extends ArgsOf<D[K]> ? K : never }[keyof D & string];
export interface SimulationConfig<D> {
  readonly tickDuration: number; readonly maxCatchUp?: number; readonly action?: TickNames<D>;
}
export interface TickStatus {
  readonly enabled: boolean; readonly paused: boolean; readonly hidden: boolean; readonly accumulator: number;
  readonly queuedInputs: number; readonly maxCatchUp: number | null;
}
export interface InputTicket {
  readonly sequence: number; readonly tick: number; readonly time: number;
  readonly cancel: () => void;
}
export interface ExternalInput {
  readonly version: 1; readonly origin: string; readonly status: 'success' | 'error' | 'cancelled';
  readonly value: unknown; readonly error: Readonly<{ name: string; message: string }> | null;
}
export interface ExternalReceipt extends InputTicket { readonly input: ExternalInput; }
export type InputPacket =
  | Readonly<{ version:1; kind:'action'; name:string; args:readonly [] | readonly [unknown] }>
  | Readonly<{ version:1; kind:'navigation'; mode:'history'|'hash'; base:string; url:string; replace:boolean }>
  | Readonly<{ version:1; kind:'location'; mode:'history'|'hash'; base:string; url:string;
      cause:'native'|'mount'|'navigation'|'state'; hydrate:boolean }>
  | Readonly<{ version:1; kind:'hydration'; namespace:string; schemaVersion:string;
      groups:readonly Readonly<{ location:'session'|'local'|'url'; values:Readonly<Record<string,unknown>> }>[] }>;
export interface InputExecution {
  readonly sequence:number; readonly tick:number; readonly time:number; readonly derived:boolean;
  readonly packet:InputPacket;
}
export interface InterpolationFrame<S> {
  readonly previous:DeepReadonly<S>; readonly current:DeepReadonly<S>;
  readonly alpha:number; readonly tick:number; readonly time:number;
}
export interface EffectTask {
  readonly cancel: () => void; readonly done: Promise<ExternalReceipt | null>;
}
export interface InputAdapters<D> {
  keyboard(origin:string, action:ExternalNames<D>): KeyboardHandler;
  text(origin:string, action:ExternalNames<D>): TextHandler;
  send(origin: string, action: ExternalNames<D>, value: unknown): ExternalReceipt;
  sample<F extends () => unknown>(origin: string, action: ExternalNames<D>, read: F & Sync<F>): ExternalReceipt;
  effect(origin: string, action: ExternalNames<D>, run: (signal: AbortSignal) => unknown): EffectTask;
  measure(origin: string, action: ExternalNames<D>, kind: 'viewport'): ExternalReceipt;
  measure(origin: string, action: ExternalNames<D>, kind: 'layout', target: Element): ExternalReceipt;
  measure(origin: string, action: ExternalNames<D>, kind: 'scroll', target?: Element): ExternalReceipt;
  storage(origin: string, action: ExternalNames<D>, storage: Pick<Storage, 'getItem'>, key: string): ExternalReceipt;
  timer(origin: string, action: ExternalNames<D>, delay: number, value?: unknown): EffectTask;
}
export type AppStatus = 'created' | 'mounting' | 'mounted' | 'disposing' | 'disposed';
export type ErrorPhase = 'create' | 'mount' | 'dispatch' | 'event' | 'render' | 'dispose' | 'schedule' | 'navigation' | 'persistence' | 'control' | 'snapshot' | 'input' | 'recording';
export type ErrorHandler = (error: Error, info: Readonly<{ phase: ErrorPhase }>) => unknown;
type SyncErrorHook<F extends ErrorHandler> = { readonly onError?: F & Sync<F> };
type Cleanup<F extends () => unknown> = F & Sync<F>;
export interface Observer<T> {
  /** Rerun the read and replace its dependency set. */
  read(): T;
  readonly dirty: boolean;
  dispose(): void;
}
export interface Computed<T> {
  /** Evaluate once when dirty, otherwise return the cached value. */
  readonly value: T;
  readonly dirty: boolean;
  dispose(): void;
}
declare const bindingValue: unique symbol;
declare const viewNode: unique symbol;
export interface Binding<T> { readonly [bindingValue]: T; }
export interface ViewNode { readonly [viewNode]: true; }
export type TextValue = string | number | boolean | null | undefined;
export type Child = TextValue | Binding<TextValue> | ViewNode | readonly Child[];
export type Bindings<T> = Binding<DeepReadonly<T>> & (T extends object ? { readonly [K in keyof T]: Bindings<T[K]> } : {});
export type AttributeValue = TextValue | Binding<TextValue>;
export type StyleValue = string | number | null | undefined;
export type StyleMap = Readonly<Record<string, StyleValue | Binding<StyleValue>>>;
export type ClassMap = Readonly<Record<string, boolean | null | undefined | Binding<boolean | null | undefined>>>;
export type ClickHandler = (...args: []) => unknown;
export interface FrameworkEvent<E extends Event = Event> {
  readonly type: string;
  readonly target: EventTarget | null;
  /** The framework element owning this handler, including delegated events. */
  readonly currentTarget: EventTarget;
  /** Live browser object: never dispatch this as an action payload. */
  readonly nativeEvent: E;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}
export type NativeEventHandler<E extends Event = Event> = {
  callback(event: FrameworkEvent<E>): unknown;
}['callback'];
export type EventRegistration<E extends Event = Event> = NativeEventHandler<E> | Readonly<{
  handler: NativeEventHandler<E>; capture?: boolean; passive?: boolean; once?: boolean;
}> | null | undefined;
export type NativeEvents = Readonly<{ [K in keyof HTMLElementEventMap]?: EventRegistration<HTMLElementEventMap[K]> }>
  & Readonly<Record<string, EventRegistration>>;
export interface HeldKey { readonly key: string; readonly code: string; readonly location: number; }
export interface KeyboardInput extends HeldKey {
  readonly type: 'keydown' | 'keyup' | 'reset';
  readonly reason: 'focus' | 'window-blur' | 'hidden' | null;
  readonly repeat: boolean; readonly isComposing: boolean;
  readonly altKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean;
  readonly held: readonly HeldKey[];
}
export interface TextInput {
  readonly type: 'text'; readonly phase: 'input' | 'composition' | 'commit';
  readonly value: string; readonly isComposing: boolean;
  readonly inputType: string; readonly data: string | null;
  readonly selectionStart: number | null; readonly selectionEnd: number | null;
  readonly selectionDirection: string | null;
}
export type KeyboardHandler = (input: KeyboardInput, event: FrameworkEvent) => unknown;
export type TextHandler = (input: TextInput, event: FrameworkEvent) => unknown;
export interface ElementProps {
  readonly onClick?: ClickHandler | null;
  readonly on?: NativeEvents | null;
  readonly onKey?: KeyboardHandler | null;
  readonly onText?: TextHandler | null;
  readonly [name: string]: AttributeValue | StyleMap | ClassMap | Binding<StyleMap | null | undefined> | Binding<ClassMap> | ClickHandler | NativeEvents | KeyboardHandler | TextHandler;
  readonly class?: string | null | Binding<string | null | undefined> | ClassMap | Binding<ClassMap>;
  readonly className?: string | null | Binding<string | null | undefined> | ClassMap | Binding<ClassMap>;
  readonly style?: StyleMap | null | Binding<StyleMap | null | undefined>;
  readonly value?: string | number | null | Binding<string | number | null | undefined>;
  readonly checked?: boolean | null | Binding<boolean | null | undefined>;
  readonly selected?: boolean | null | Binding<boolean | null | undefined>;
  readonly disabled?: boolean | null | Binding<boolean | null | undefined>;
}
export function element(tag: string, ...children: readonly Child[]): ViewNode;
type SyncCallback<F> = F extends (...args: never[]) => unknown ? Sync<F> : unknown;
type SyncRegistration<R> = R extends { readonly handler: infer F } ? SyncCallback<F> : SyncCallback<R>;
type SyncProps<P> = (P extends { readonly onClick: infer F } ? SyncCallback<F> : unknown)
  & (P extends { readonly onKey: infer F } ? SyncCallback<F> : unknown)
  & (P extends { readonly onText: infer F } ? SyncCallback<F> : unknown)
  & (P extends { readonly on: infer M } ? { readonly on: { readonly [K in keyof M]: M[K] & SyncRegistration<M[K]> } } : unknown);
export function element<P extends ElementProps>(tag: string, props: P & SyncProps<P>, ...children: readonly Child[]): ViewNode;
export interface ElementBuilder {
  (...children: readonly Child[]): ViewNode;
  <P extends ElementProps>(props: P & SyncProps<P>, ...children: readonly Child[]): ViewNode;
}
export const div: ElementBuilder, span: ElementBuilder, p: ElementBuilder, button: ElementBuilder,
  form: ElementBuilder, label: ElementBuilder, input: ElementBuilder, textarea: ElementBuilder,
  select: ElementBuilder, option: ElementBuilder, section: ElementBuilder, a: ElementBuilder,
  ul: ElementBuilder, li: ElementBuilder;
export function derive<F extends () => unknown>(read: F & Sync<F>): Binding<ReturnType<F>>;
export function when<S extends object = Record<string, unknown>, D extends Definitions<S> = {}>(
  condition: boolean | Binding<boolean>, yes: (context: ViewContext<S, D>) => Child | void,
  no?: (context: ViewContext<S, D>) => Child | void
): ViewNode;
export function outlet(): ViewNode;
export type WorkLane = 'immediate' | 'frame' | 'normal' | 'idle';
export interface RouteSnapshot {
  readonly path: string; readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, readonly string[]>>;
  readonly search: string; readonly hash: string; readonly url: string;
  readonly matched: boolean; readonly outsideBase: boolean;
}
export interface NavigationOptions { readonly replace?: boolean; }
export interface RouteContext<S, D extends Definitions<S>> extends ViewContext<S, D> {
  readonly route: RouteSnapshot;
}
export interface RouterConfig<S, D extends Definitions<S>> {
  readonly mode?: 'history' | 'hash'; readonly base?: string;
  readonly routes: readonly { readonly path: string; readonly view: (context: RouteContext<S, D>) => Child | void }[];
  readonly notFound?: (context: RouteContext<S, D>) => Child | void;
}
export type LinkProps = ElementProps & { readonly href?: never; readonly onClick?: never;
  readonly on?: (NativeEvents & { readonly click?: null }) | null; };
export interface LinkBuilder {
  (to: string, ...children: readonly Child[]): ViewNode;
  <P extends LinkProps>(to: string, props: P & SyncProps<P>, ...children: readonly Child[]): ViewNode;
}
export type ListKey = string | number;
export interface ItemContext<S, D extends Definitions<S>, T, K extends ListKey = ListKey> extends ViewContext<S, D> {
  readonly key: K;
  readonly item: Bindings<T>;
  readonly index: Binding<number>;
  /** Read the current read-only item/position at use time; do not save stale captures. */
  readonly value: DeepReadonly<T>;
  readonly position: number;
}
export function keyed<T, K extends ListKey, S extends object = Record<string, unknown>, D extends Definitions<S> = {}>(
  items: Binding<readonly T[]>, key: (item: DeepReadonly<T>) => K,
  view: (context: ItemContext<S, D, T, K>) => Child | void
): ViewNode;
export interface ViewContext<S, D extends Definitions<S>> {
  readonly state: DeepReadonly<S>;
  readonly bind: Bindings<S>;
  derive<F extends (state: DeepReadonly<S>) => unknown>(read: F & Sync<F>): Binding<ReturnType<F>>;
  when(condition: boolean | Binding<boolean>, yes: (context: ViewContext<S, D>) => Child | void,
    no?: (context: ViewContext<S, D>) => Child | void): ViewNode;
  keyed<T, K extends ListKey>(items: Binding<readonly T[]>, key: (item: DeepReadonly<T>) => K,
    view: (context: ItemContext<S, D, T, K>) => Child | void): ViewNode;
  readonly actions: { readonly [K in keyof D]: (...args: ArgsOf<D[K]>) => void };
  /** Drains an outer batch synchronously; nested calls only admit queued work. */
  readonly dispatch: (...args: DispatchArgs<D>) => void;
  readonly inputs: InputAdapters<D>;
  observeInputs<F extends (input:InputExecution) => unknown>(callback:F & Sync<F>): () => void;
  interpolate<F extends (frame:InterpolationFrame<S>) => unknown>(read:F & Sync<F>): Binding<ReturnType<F>>;
  readonly route: RouteSnapshot | null;
  navigate(to: string, options?: NavigationOptions): void;
  readonly link: LinkBuilder;
  outlet(): ViewNode;
  schedule<F extends () => unknown>(lane: WorkLane, callback: F & Sync<F>): () => void;
  observe<F extends (state: DeepReadonly<S>) => unknown, N extends () => unknown = () => void>(
    read: F & Sync<F>, onInvalidate?: N & Sync<N>
  ): Observer<ReturnType<F>>;
  computed<F extends (state: DeepReadonly<S>) => unknown>(read: F & Sync<F>): Computed<ReturnType<F>>;
  onDispose<F extends () => unknown>(cleanup: Cleanup<F>): void;
}
export interface AppConfig<S extends object, D extends Definitions<S> = {}> {
  readonly target?: Element;
  readonly initialState?: S;
  readonly schema?: ActionSchema<S, D>;
  readonly view?: (context: ViewContext<S, D>) => Child | void;
  readonly onError?: ErrorHandler;
  readonly router?: RouterConfig<S, D>;
  readonly persistence?: PersistenceConfig<S>;
  readonly controls?: ControlOptions;
  readonly snapshot?: string;
  readonly simulation?: SimulationConfig<D>;
}
export type PersistenceField =
  | Readonly<{ location: 'memory'; validate?: never; key?: never }>
  | Readonly<{ location: 'session' | 'local'; validate: (value: unknown) => boolean; key?: never }>
  | Readonly<{ location: 'url'; validate: (value: unknown) => boolean; key?: string }>;
export interface PersistenceConfig<S> {
  readonly namespace: string; readonly version?: string;
  readonly fields: { readonly [K in keyof S]?: PersistenceField };
}
export interface PersistenceIssue {
  readonly code: string; readonly source: string; readonly field: string | null; readonly message: string;
}
export interface PersistenceStatus {
  readonly active: boolean; readonly pending: boolean; readonly errors: readonly PersistenceIssue[];
}
export interface AppInstance<S extends object, D extends Definitions<S> = {}> extends ViewContext<S, D> {
  readonly version: string; readonly stateVersion: number; readonly schemaVersion: string;
  readonly actionNames: readonly (keyof D & string)[];
  readonly status: AppStatus; readonly mounted: boolean; readonly replaying: boolean;
  /** Cancel the pending frame and apply latest dirty bindings synchronously. */
  flush(): void;
  flushPersistence(): void;
  readonly persistence: PersistenceStatus;
  /** Export committed state/version and service continuation as canonical JSON. */
  snapshot(): string;
  startRecording(options?:RecordingOptions): RecordingStatus;
  stopRecording(): RecordingStatus;
  clearRecording(): void;
  exportRecording(): string;
  readonly recording:RecordingStatus;
  /** Monotone manual time input, in integer logical microseconds. */
  setLogicalTime(time: number): void;
  /** Frozen, nonreactive committed control snapshot. */
  readonly controls: ControlSnapshot;
  /** Validate and admit a saved versioned packet. This is not a recording importer. */
  receiveInput(packet:InputPacket, options?:Readonly<{tick?:number}>): InputTicket;
  readonly ticks: TickStatus;
  readonly enqueue: (...args: DispatchArgs<D>) => InputTicket;
  readonly enqueueAt: (tick: number, ...args: DispatchArgs<D>) => InputTicket;
  advanceTicks(elapsedMicroseconds: number): number;
  pauseTicks(): void;
  resumeTicks(): void;
  /** Without a target, resolves #app at mount time (or uses the configured target). */
  mount(target?: Element): AppInstance<S, D>;
  dispose(): void;
}
export function createApp<S extends object, D extends Definitions<S>, F extends ErrorHandler = ErrorHandler>(
  config: Omit<AppConfig<NoInfer<S>, D>, 'schema' | 'onError'> & { schema: ActionSchema<S, D> } & SyncErrorHook<F>
): AppInstance<S, D>;
export function createApp<S extends object = Record<string, unknown>, F extends ErrorHandler = ErrorHandler>(
  config?: Omit<AppConfig<S>, 'onError'> & SyncErrorHook<F>
): AppInstance<S>;

export interface ReplayConfig<S extends object, D extends Definitions<S> = {}> {
  readonly recording: string | Recording;
  readonly schema?: ActionSchema<S, D>;
  readonly router?: RouterConfig<S, D>;
  readonly persistence?: PersistenceConfig<S>;
  readonly simulation?: SimulationConfig<D>;
  readonly view?: (context: ViewContext<S, D>) => Child | void;
}
export interface ReplayDivergence {
  readonly sequence:number; readonly tick:number; readonly time:number;
  readonly action:string|null; readonly eventIndex:number|null;
  readonly reason:'trace'|'state'|'route'|'root';
  readonly expected:string; readonly actual:string;
  readonly expectedHash:string|null; readonly actualHash:string;
}
export interface ReplayStatus {
  readonly status:'ready'|'running'|'complete'|'diverged'|'disposed';
  readonly position:number; readonly total:number; readonly sequence:number;
  readonly divergence:ReplayDivergence|null;
}
export interface ReplayController<S extends object, D extends Definitions<S> = {}> {
  readonly app:AppInstance<S,D>; readonly status:ReplayStatus;
  step(count?:number):ReplayStatus;
  run():ReplayStatus;
  dispose():void;
}
/** Restore an isolated app, then re-execute complete roots with effects suppressed. */
export function createReplay<S extends object,D extends Definitions<S>>(
  config:Omit<ReplayConfig<NoInfer<S>,D>,'schema'> & {readonly schema:ActionSchema<S,D>}
):ReplayController<S,D>;
export function createReplay<S extends object=Record<string,unknown>>(
  config:ReplayConfig<S>
):ReplayController<S>;

export interface HistoryConfig<S extends object,D extends Definitions<S> = {}> extends ReplayConfig<S,D> {
  /** Explicitly declare reversible in-memory action behavior; root groups are atomic. */
  readonly reversible?:readonly (keyof D & string)[];
}
export interface HistoryStatus {
  readonly status:'inspecting'|'diverged'|'branched'|'disposed';
  readonly baselineSequence:number; readonly endSequence:number; readonly sequence:number;
  readonly position:number; readonly records:number;
  readonly canUndo:boolean; readonly canRedo:boolean;
  readonly checkpointSequence:number; readonly replayedRoots:number; readonly replayedSlots:number;
  readonly discardedRecords:number; readonly divergence:ReplayDivergence|null;
}
export interface HistoryController<S extends object,D extends Definitions<S> = {}> {
  /** Stable throughout inspection; replaced with the new live app after branch(). */
  readonly app:AppInstance<S,D>; readonly status:HistoryStatus;
  seek(sequence:number):HistoryStatus;
  undo(count?:number):HistoryStatus;
  redo(count?:number):HistoryStatus;
  branch():AppInstance<S,D>;
  dispose():void;
}
export function createHistory<S extends object,D extends Definitions<S>>(
  config:Omit<HistoryConfig<NoInfer<S>,D>,'schema'> & {readonly schema:ActionSchema<S,D>}
):HistoryController<S,D>;
export function createHistory<S extends object=Record<string,unknown>>(
  config:HistoryConfig<S>
):HistoryController<S>;
