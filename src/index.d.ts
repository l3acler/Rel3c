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
  action<F extends (draft: Draft<S>) => unknown>(run: F & Sync<F>): ActionSpec<S, []>;
  action<P, F extends (draft: Draft<S>, payload: DeepReadonly<P>) => unknown>(
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
export type AppStatus = 'created' | 'mounting' | 'mounted' | 'disposing' | 'disposed';
export type ErrorPhase = 'create' | 'mount' | 'dispatch' | 'event' | 'render' | 'dispose' | 'schedule' | 'navigation' | 'persistence';
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
  readonly status: AppStatus; readonly mounted: boolean;
  /** Cancel the pending frame and apply latest dirty bindings synchronously. */
  flush(): void;
  flushPersistence(): void;
  readonly persistence: PersistenceStatus;
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
