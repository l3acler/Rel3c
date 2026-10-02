/** Experimental A.1 public lifecycle; dispatch always throws until A.3. */
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
type Definitions<S> = Record<string, ActionSpec<S, [] | [unknown]>>;
export interface ActionSchema<S, D extends Definitions<S>> {
  readonly version: string; readonly names: readonly (keyof D & string)[];
  readonly [schemaState]: { state: S; definitions: D };
}
export function createActionSchema<S extends object = Record<string, unknown>>(options?: { version?: string }):
  <D extends Definitions<S>>(build: (helpers: ActionBuilder<S>) => D) => ActionSchema<S, D>;
type ArgsOf<T> = T extends ActionSpec<unknown, infer Args> ? Args : never;
type DispatchArgs<D> = { [K in keyof D & string]: [name: K, ...ArgsOf<D[K]>] }[keyof D & string];
export type AppStatus = 'created' | 'mounting' | 'mounted' | 'disposing' | 'disposed';
export type ErrorPhase = 'create' | 'mount' | 'dispatch' | 'dispose';
type Cleanup<F extends () => unknown> = F & Sync<F>;
export interface ViewContext<S, D extends Definitions<S>> {
  readonly state: DeepReadonly<S>;
  readonly actions: { readonly [K in keyof D]: (...args: ArgsOf<D[K]>) => never };
  readonly dispatch: (...args: DispatchArgs<D>) => never;
  onDispose<F extends () => unknown>(cleanup: Cleanup<F>): void;
}
export interface AppConfig<S extends object, D extends Definitions<S> = {}> {
  readonly target?: Element;
  readonly initialState?: S;
  readonly schema?: ActionSchema<S, D>;
  readonly view?: (context: ViewContext<S, D>) => string | null | undefined | void;
  readonly onError?: (error: Error, info: Readonly<{ phase: ErrorPhase }>) => void;
}
export interface AppInstance<S extends object, D extends Definitions<S> = {}> extends ViewContext<S, D> {
  readonly version: string; readonly stateVersion: number; readonly schemaVersion: string;
  readonly actionNames: readonly (keyof D & string)[];
  readonly status: AppStatus; readonly mounted: boolean;
  /** Without a target, resolves #app at mount time (or uses the configured target). */
  mount(target?: Element): AppInstance<S, D>;
  dispose(): void;
}
export function createApp<S extends object, D extends Definitions<S>>(
  config: Omit<AppConfig<NoInfer<S>, D>, 'schema'> & { schema: ActionSchema<S, D> }
): AppInstance<S, D>;
export function createApp<S extends object = Record<string, unknown>>(config?: AppConfig<S>): AppInstance<S>;
