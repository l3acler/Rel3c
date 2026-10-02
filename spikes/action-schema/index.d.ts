// Task 0.8 declarations; not package public exports.
export type DeepReadonly<T> = T extends (...args: any[]) => any ? T
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type Draft<T> = T extends (...args: any[]) => any ? T
  : T extends object ? { -readonly [K in keyof T]: Draft<T[K]> } : T;
type Sync<F extends (...args: any[]) => unknown> =
  Extract<ReturnType<F>, PromiseLike<unknown>> extends never ? unknown : never;
declare const specBrand: unique symbol;
declare const schemaBrand: unique symbol;
export interface ActionSpec<S, Args extends [] | [unknown]> {
  readonly input: 'none' | 'payload';
  readonly [specBrand]: { state: S; args: Args };
}
export interface ActionBuilder<S> {
  action<F extends (draft: Draft<S>) => unknown>(run: F & Sync<F>): ActionSpec<S, []>;
  action<P, F extends (draft: Draft<S>, payload: DeepReadonly<P>) => unknown>(
    validate: (value: unknown) => value is P, run: F & Sync<F>): ActionSpec<S, [payload: DeepReadonly<P>]>;
}
type Definitions<S> = Record<string, ActionSpec<S, [] | [unknown]>>;
export interface ActionSchema<S, D extends Definitions<S>> {
  readonly version: string;
  readonly names: readonly (keyof D & string)[];
  readonly [schemaBrand]: { state: S; definitions: D };
}
export function createActionSchema<S extends object = Record<string, unknown>>(
  options?: { version?: string }): <D extends Definitions<S>>(
    build: (helpers: ActionBuilder<S>) => D) => ActionSchema<S, D>;

type ArgsOf<T> = T extends ActionSpec<any, infer Args> ? Args : never;
export type DispatchArgs<D> = { [K in keyof D & string]: [name: K, ...ArgsOf<D[K]>] }[keyof D & string];
export type ActionInput<D> = { [K in keyof D & string]: ArgsOf<D[K]> extends []
  ? { name: K; payload?: never } : { name: K; payload: ArgsOf<D[K]>[0] } }[keyof D & string];
export type InputOf<T> = T extends ActionSchema<infer S, infer D> ? ActionInput<D> : never;
export interface CommitResult<S> {
  readonly state: DeepReadonly<S>;
  readonly version: number;
  readonly isNoop: boolean;
  readonly changes: readonly unknown[];
  readonly affectedPaths: readonly string[];
  readonly affectedProperties: readonly { targetId: number; kind: 'value' | 'has' | 'keys' | 'iterate'; key: string | null }[];
}
export interface TransactionEngine<S> {
  getState(): S;
  getVersion(): number;
  run(action: (draft: Draft<S>) => unknown): CommitResult<S>;
}
export interface ActionSpike<S, D extends Definitions<S>> {
  readonly state: DeepReadonly<S>;
  readonly version: number;
  readonly schemaVersion: string;
  readonly actions: { readonly [K in keyof D]: (...args: ArgsOf<D[K]>) => CommitResult<S> };
  dispatch(...args: DispatchArgs<D>): CommitResult<S>;
  snapshot(): string;
}
export function createActionSpike<S extends object, D extends Definitions<S>>(config: {
  initialState: NoInfer<S>;
  schema: ActionSchema<S, D>;
  engineFactory?: (state: S) => TransactionEngine<S>;
  limits?: SnapshotLimits;
}): ActionSpike<S, D>;
export interface SnapshotLimits {
  maxBytes?: number;
  maxNodes?: number;
  maxEntries?: number;
  maxDepth?: number;
  maxArrayLength?: number;
  maxArraySlots?: number;
}
export const SNAPSHOT_FORMAT: 'mini-framework-graph-spike';
export const SNAPSHOT_VERSION: 1;
export const DEFAULT_LIMITS: Readonly<Required<SnapshotLimits>>;
export class SnapshotError extends TypeError {}
export class ActionSchemaError extends TypeError {}
export function encodeSnapshot(value: unknown, limits?: SnapshotLimits): string;
// Imported data must be narrowed/validated, never asserted safe by a generic.
export function decodeSnapshot(text: string, limits?: SnapshotLimits): unknown;
