/** Experimental public lifecycle, named actions and exact observers/computed values and declarative frame-batched DOM (A.1–A.7). */
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
export type ErrorPhase = 'create' | 'mount' | 'dispatch' | 'render' | 'dispose';
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
export interface ElementProps {
  readonly [name: string]: AttributeValue | StyleMap | ClassMap | Binding<StyleMap | null | undefined> | Binding<ClassMap>;
  readonly class?: string | null | Binding<string | null | undefined> | ClassMap | Binding<ClassMap>;
  readonly className?: string | null | Binding<string | null | undefined> | ClassMap | Binding<ClassMap>;
  readonly style?: StyleMap | null | Binding<StyleMap | null | undefined>;
  readonly value?: string | number | null | Binding<string | number | null | undefined>;
  readonly checked?: boolean | null | Binding<boolean | null | undefined>;
  readonly selected?: boolean | null | Binding<boolean | null | undefined>;
  readonly disabled?: boolean | null | Binding<boolean | null | undefined>;
}
export function element(tag: string, ...children: readonly Child[]): ViewNode;
export function element(tag: string, props: ElementProps, ...children: readonly Child[]): ViewNode;
export interface ElementBuilder {
  (...children: readonly Child[]): ViewNode;
  (props: ElementProps, ...children: readonly Child[]): ViewNode;
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
export interface ViewContext<S, D extends Definitions<S>> {
  readonly state: DeepReadonly<S>;
  readonly bind: Bindings<S>;
  derive<F extends (state: DeepReadonly<S>) => unknown>(read: F & Sync<F>): Binding<ReturnType<F>>;
  when(condition: boolean | Binding<boolean>, yes: (context: ViewContext<S, D>) => Child | void,
    no?: (context: ViewContext<S, D>) => Child | void): ViewNode;
  readonly actions: { readonly [K in keyof D]: (...args: ArgsOf<D[K]>) => void };
  /** Drains an outer batch synchronously; nested calls only admit queued work. */
  readonly dispatch: (...args: DispatchArgs<D>) => void;
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
  readonly onError?: (error: Error, info: Readonly<{ phase: ErrorPhase }>) => void;
}
export interface AppInstance<S extends object, D extends Definitions<S> = {}> extends ViewContext<S, D> {
  readonly version: string; readonly stateVersion: number; readonly schemaVersion: string;
  readonly actionNames: readonly (keyof D & string)[];
  readonly status: AppStatus; readonly mounted: boolean;
  /** Cancel the pending frame and apply latest dirty bindings synchronously. */
  flush(): void;
  /** Without a target, resolves #app at mount time (or uses the configured target). */
  mount(target?: Element): AppInstance<S, D>;
  dispose(): void;
}
export function createApp<S extends object, D extends Definitions<S>>(
  config: Omit<AppConfig<NoInfer<S>, D>, 'schema'> & { schema: ActionSchema<S, D> }
): AppInstance<S, D>;
export function createApp<S extends object = Record<string, unknown>>(config?: AppConfig<S>): AppInstance<S>;
