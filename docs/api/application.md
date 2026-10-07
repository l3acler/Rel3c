# Application lifecycle, named actions and reactivity

Experimental public API. Implemented: owned initial state/schema registration,
synchronous declarative mounting, cleanup and disposal. A.2/A.3 add production COW
transactions, payload ownership/guards and bounded FIFO named dispatch.
A.4/A.5 add exact observers and lazy computed values.
Declarative elements, exact bindings and frame batching are implemented in A.6/A.7; see [DOM API](dom.md).
A.8/A.9 add keyed collections and scoped click callbacks. B.1–B.3 add [native events and semantic keyboard/text inputs](events.md); B.4–B.6 add [priority work](scheduling.md) and [shared-state routing](routing.md); B.7/B.8 add [state locations and hydration](persistence.md); [isolated replay](replay.md) is implemented. [Optional diagnostics and inspector](inspector.md) explain transition work without changing authoritative state. This document describes what actually runs today.

B.9 aligns the declarations with the existing synchronous `onError` contract:
statically visible Promise-returning hooks reject during checking. Synchronous
return values are ignored; type-erased callbacks still require runtime checking.
TypeScript 5.4+ is needed for `NoInfer`, with 5.9.3 verified. This changes typing,
not execution. See [compatibility policy](../adr/0015-public-frontend-compatibility.md),
[browser qualification](../browser-support.md) and the complete
[root public walkthrough](../../README.md#build-the-walkthrough-using-public-imports).

A.10 verifies these APIs together in the [public core example](../../examples/core/README.md)
and [core acceptance report](../reports/task-A.10-core-slice.md). No new runtime API
or compatibility change was required. One click commits one version and updates
only its dependent text on a frame; rollback publishes no version or UI change.

## Run from the root

```sh
npm run dev
```

Open http://localhost:3000/ (redirects to `/examples/basic/`). The example imports
only `src/index.js`; no compiler/install is needed. The framework creates/removes
its text nodes. Applications do not patch DOM nodes or install normal listeners.

With `<div id="app"></div>` in an HTML page, put the following in a browser module
at the repository root:

```js
import { createApp } from './src/index.js';

const app = createApp({
  initialState: { message: 'Hello from an owned view' },
  view: ({ state, onDispose }) => {
    onDispose(() => console.log('View disposed'));
    return state.message;
  },
});

app.mount(); // finds #app, returns app; framework calls the view
console.log(app.status, app.mounted); // mounted, true
app.dispose(); // removes only app-owned text; runs cleanup
app.dispose(); // harmless; disposal is terminal
```

Alternatively specify `target` in createApp to mount immediately. Invalid or null
targets throw; lookup failure is not treated as a request for headless mode.
Without a target, views do not run until mount. Creating/importing an app works
without browser globals; mounting requires a DOM Element.

`app.mount()` (including `app.mount(undefined)`) uses a configured target if
present, otherwise looks up `document.getElementById('app')` at mount time. A
missing document or missing `#app` throws `TARGET_INVALID` with a clear message;
the app stays created and can retry once the container exists. Creation never
silently mounts into `#app`. For custom containers or multiple apps, use
`app.mount(element)` or pass `target` to createApp. Explicit null, selectors or
invalid objects reject even when `#app` exists; they do not trigger fallback.

## Config and instance

Config keys: `initialState` (default `{}`), `schema` (default empty), `view`
(default empty text, or outlet with routing), optional Element `target`, optional `onError`, `router`, `persistence`, `controls`, `snapshot` and `simulation`. Unknown
keys/accessors/symbol keys reject. The placeholder's `actions`/`seed` options
are not implemented; do not treat planned PRD sketches as current examples.

Instance properties are immutable: `version` is the framework package version;
`stateVersion` starts at 1 and advances once per successful action, including no-ops;
it is separate from the package version. `schemaVersion`, `actionNames`
and `actions` describe registration. `status` and `mounted` expose lifecycle.
`state` is an owned deeply frozen graph, never the caller's original object.
Outside reactive reads this remains a frozen snapshot. During observer/computed
reads it is a read-only current-state facade that tracks accessed properties.
Supported data follows ADR 0002/0005. Construction
guards are fixed (128 levels, 10,000 nodes, 100,000 properties/array slots,
1,000,000 UTF-16 text/key units). A.2 applies these guards to the internal engine's
imports, monotonic transaction growth and prospective committed graph. See
[ADR 0006](../adr/0006-production-transactions.md) for the conservative accounting;
exact heap/history budgets remain later work.

Mount appends owned declarative nodes while preserving host children, focus and
selection. Views accept strings, finite numbers, null/undefined/booleans, arrays,
bindings and framework descriptors; raw functions/objects and async results reject.
One app claims an exact target; double mount/migration reject. Failed mounting
cleans its resources and releases the target for retry. Static snapshot text runs
once; `bind`/`derive` updates exact targets on render frames; `app.flush()` drains them
synchronously, runs queued frame callbacks and cancels the frame. State commits remain synchronous. See [DOM API](dom.md).
`context.state` follows the same snapshot/tracking rules as `app.state`.
Dispatch inside views or render computations rejects `ACTION_REENTRANT`.

## Named synchronous actions

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  setCount: action(
    value => typeof value === 'number' && Number.isFinite(value),
    (draft, value) => { draft.count = value; },
  ),
}));
const app = createApp({ initialState: { count: 0 }, schema });
console.log(app.actionNames); // ['increment', 'setCount']
app.actions.increment(); // equivalent to app.dispatch('increment')
console.log(app.state.count, app.stateVersion); // 1, 2
app.dispatch('setCount', 10);
console.log(app.state.count, app.stateVersion); // 10, 3
app.dispose();
```

No-payload/payload modes are explicit, never inferred from function.length. The
schema builder/specs/names/versions are validated; public metadata does not expose
callbacks. Each app owns a registry and store. Use zero arguments for `action(run)`
and exactly one for `action(validate, run)`; an explicit `undefined` counts as a
payload. Unknown names and wrong arity reject before any guard or body runs.

Payloads support the same acyclic data types as state, plus primitive roots.
The runtime copies and deeply freezes the graph before the guard, preserving
aliases, distinct identities, array holes, custom enumerable properties and
null prototypes. Caller data stays mutable. Accessors, symbols, unsupported
native values/prototypes, cycles and excessive graphs reject before the guard.
Guards must be pure and synchronous, return exactly `true`, and cannot dispatch
or change lifecycle. False/truthy non-booleans and throwing guards reject. A
throwing guard becomes `PAYLOAD_INVALID` with its original `cause`.

Bodies receive `(draft, services)` or `(draft, ownedPayload, services)` with no bound `this`.
C.2 adds the frozen action-scoped service argument; existing callbacks can ignore
it. Dispatch still accepts zero/one payload and does not infer mode from arity. Only the
draft exposes in-progress writes; app/context state reads still see the previous
complete version. Bodies must be synchronous. A throw, Promise/thenable return
or invalid final state rolls back and revokes the draft; success commits once
and revokes it too. Action return values are ignored, and both dispatch forms
return `undefined`. Keep async effects outside actions and dispatch their results
as supported payloads. Do not read ambient layout/storage/time/random values
inside actions. C.1/C.2 add [controlled services/checkpoints](determinism.md);
[input adapters](ticks-inputs.md) and [bounded recording](recording.md) are implemented; [isolated replay](replay.md) is implemented. Arbitrary external side effects cannot be undone.

## Nested dispatch and failures

```js
const schema = createActionSchema()(({ action }) => ({
  parent: action(draft => {
    draft.order.push('parent');
    app.actions.first(); // validates/adopts now; body waits for parent commit
    app.actions.second();
  }),
  first: action(draft => { draft.order.push('first'); app.actions.last(); }),
  second: action(draft => { draft.order.push('second'); }),
  last: action(draft => { draft.order.push('last'); }),
}));
const app = createApp({ initialState: { order: [] }, schema });
app.actions.parent(); // synchronously drains the whole batch
console.log(app.state.order); // ['parent', 'first', 'second', 'last']
console.log(app.stateVersion); // 5
app.dispose();
```

Nested calls validate and capture payloads at admission and return before the
queued body runs. A parent may catch an admission error and continue. Its queued
children join the FIFO tail only after it commits; if it fails, they are discarded.
A failing child also discards its own children. Previously committed actions
remain committed and queued siblings continue. After the queue drains, the outer
call throws the single failure, or an `AggregateError` containing multiple failures
in execution order. Non-Error throws normalize at the outer lifecycle error boundary.
An outer call can therefore throw after earlier actions succeeded. Catching a
nested call catches admission errors, not its later execution errors. `onError`
observes the terminal batch error once, after draining.

A batch admits at most 1,024 actions including its root. Aggregate admitted payload
usage is bounded by 10,000 nodes, 100,000 enumerable entries, 100,000 array slots
and 1,000,000 UTF-16 text/key units; each payload has at most 128 object levels.
Consumed/discarded requests do not refund charges; failed admission does not charge.
A new outer call gets a fresh budget. These conservative limits bound framework
retention/work, not exact heap bytes or callback CPU. A bound failure behaves like
any other admission failure: catching it permits safe parent work; propagating it
aborts that parent. Self-dispatch reaches the bound without recursive body execution.
Mount/dispose during a batch and dispatch during guards/views/error reporting reject.

For TypeScript, bind state once: `createActionSchema<State>()(...)`. Use a type
predicate payload guard (`(value: unknown): value is Payload => ...`) for payload
inference. Dispatch names/arguments are correlated and state is deeply read-only.
Public type fixtures and the native checked-JS example run with `npm run test:types`
after `npm ci`; no application code is emitted. Types do not validate prototypes,
finiteness or imported values, and `void`/`any` can hide async callbacks. Runtime
validation must remain independent. Dispatch returns `void` in declarations;
the experimental surface is not a stable API freeze.

## Cleanup and errors

`app.onDispose(fn)` registers app-lifetime cleanup, including before any mount.
`context.onDispose(fn)` registers cleanup for its specific mount/view attempt.
Both are synchronous; conditional child scopes dispose before root view hooks,
then app hooks run. Each scope runs hooks LIFO. Failed mounts
drain only the failed view scope. Disposed/failed view contexts cannot register
more hooks. All callbacks are attempted even if some fail; disposal completes
and throws an AggregateError afterward. Bindings and pending visual work are
disposed with their scopes; click delegates and handlers share scope ownership.

```js
const app = createApp({
  view: () => 'Ready',
  onError(error, { phase }) {
    console.error(`Application ${phase} failed`, error);
  },
});
```

`onError` observes create/mount/dispatch/event/render/dispose/schedule/navigation operation errors and does not
swallow them. Config validation before a valid observer exists and property/scope
access errors throw directly. FrameworkError exposes a code and readable message;
view failures preserve their original `cause`. Observer failures aggregate with
the original error; recursive reporting does not repeatedly invoke the observer.
Illegal same-realm native Promise returns from actions/guards/views/cleanup/observers are
observed for rejection, not cancelled. Arbitrary callback side effects are not
rolled back. Caller-held old snapshots remain caller-held after app disposal.

Common codes: CONFIG_INVALID, STATE_INVALID/STATE_CYCLE/STATE_LIMIT, SCHEMA_INVALID,
TARGET_INVALID/TARGET_OWNED, APP_MOUNTED/APP_DISPOSED, SCOPE_DISPOSED,
VIEW_FAILED/VIEW_RESULT_INVALID, CLEANUP_INVALID/CLEANUP_ASYNC,
LIFECYCLE_REENTRANT, ACTION_UNKNOWN/ACTION_ARITY/ACTION_ASYNC/ACTION_REENTRANT,
ACTION_QUEUE_LIMIT and PAYLOAD_INVALID/PAYLOAD_CYCLE/PAYLOAD_LIMIT/PAYLOAD_ASYNC.

Rationale: [ADR 0005](../adr/0005-application-lifecycle.md) and
[ADR 0007](../adr/0007-named-dispatch-ordering.md).
Verification: [A.6/A.7 evidence report](../reports/task-A.6-A.7-dom-frames.md).

## Exact subscriptions (A.4)

`app.observe(read, onInvalidate?)` and `context.observe(...)` establish exact
property/presence/key/array dependencies with an initial synchronous read.
The returned `Observer<T>` has `read(): T`, `dirty: boolean`, and idempotent
`dispose(): void`. Dirty transitions notify synchronously after commit; refresh
is explicit. View resources are scoped to that mount; app resources are owned
until disposal. See [the public guide](../../DOCUMENTATION.md#exact-reactive-observers)
for copyable imports, current-state facades, errors and failure ordering.

## Lazy computed values (A.5)

`app.computed(read)` and `context.computed(read)` return a `Computed<T>` with
read-only `value: T`, `dirty: boolean`, and idempotent `dispose(): void`.
`read(trackedState)` first runs on value consumption and caches until dependencies
change. Invalidation never eagerly recomputes, and dependencies through other
computed values propagate before observer callbacks run. View resources belong
to the mount attempt; app resources belong to the app. See the full
[reactivity API](reactivity.md) and [public guide](../../DOCUMENTATION.md#lazy-computed-values)
for runnable public-import examples, errors, disposal and cache semantics.

`onError` also observes render failures (phase `render`); state remains committed.
See [DOM scheduling API](dom.md#scheduling-and-flush-a7) for retry/disposal behavior.

See [keyed collections](collections.md) and [click events](events.md) for current
item contexts, listener ownership, native defaults and event error boundaries.

## Priorities and routing (B.4–B.6)

The app/context surface also provides `schedule(lane, callback)`, `navigate(to, options?)`,
`link(to, props?, ...children)`, `outlet()` and read-only `route`. Router configuration
is owned at creation, activated at mount and released on failure/disposal. Without
a router, route is null and navigation/links/outlets reject `ROUTER_MISSING`.

Every route shares the original store/schema/actions. Successful action navigation
runs after state notifications and before queued children; rollback discards its URL
requests. Location-only navigation does not advance the user-state version. Configured URL
fields publish a separate input version when their values change. Route views replace on path changes and retain native nodes on
query/hash-only changes. Disposal stops reactive notifications before releasing
routing listeners, scheduled work and views, so disposal does not publish location
changes to application observers.

See the [public guide](../../DOCUMENTATION.md#routing-and-shared-application-state),
[routing reference](routing.md) and [scheduling reference](scheduling.md) for copyable
examples, ownership, queue/error ordering, options and limits. Error phases now also
include `navigation` and `schedule`; frame work still uses `render`. APIs remain experimental.

## State locations (B.7/B.8)

Optional persistence config owns top-level memory/session/local/URL fields and
guards; external data is sampled at mount before views run. Successful actions
queue coalesced storage writes and replace URL state. Adapter inputs commit
through the same state engine and batch route/state notifications without an
application action name. See [persistence reference](persistence.md) and the
[public guide](../../DOCUMENTATION.md#state-locations-and-hydration).

Instance additions: flushPersistence() synchronously drains pending persistence
work; read-only persistence exposes nonreactive active/pending/error summaries.
onError phases include persistence. Invalid input fallback queues asynchronous
reporting; failures preserve committed memory. Dispose cancels rather than
flushing writes. Session/local fields are sampled on mount, never on route changes.

## Checkpoints and controlled services (C.1/C.2)

`controls: {seed?,time?}` initializes seeded simulation draws and a manual logical
clock in integer microseconds. Action callbacks receive synchronous scoped
`now()`/`random()` methods; failed actions discard their draws.
`app.setLogicalTime(time)` advances time outside active runtime work without
a state version/DOM notification. `app.controls` is frozen, nonreactive committed
metadata. `app.snapshot()` exports canonical state/version/control JSON;
`createApp({snapshot,schema,...})` restores a new app without `initialState` or
`controls`. `hashSnapshot(text)` validates and compares checkpoints with SHA-256.
See [the full contract](determinism.md) for versions, limits, expiration, errors,
ordinary mount hydration and the boundary between restoration and isolated replay.

## Fixed ticks and owned external inputs (C.3/C.4)

`simulation` configures positive integer microsecond ticks, a no-payload action
and bounded catch-up. `enqueue`/`enqueueAt` admit future inputs; `resumeTicks`,
`pauseTicks` and `advanceTicks` drive the clock independently of rendering.
`app.ticks` exposes frozen nonreactive status. `app.inputs` owns adapter work for
the app; `context.inputs` owns it for that view. See [ticks/inputs](ticks-inputs.md)
and the [guide](../../DOCUMENTATION.md#fixed-ticks-and-external-inputs) for arguments,
errors, hidden policy, cancellation and fixed-checkpoint restoration. Bounded recording is available in C.7/C.8; [Isolated replay](replay.md) is implemented.

## Semantic input packets and optional display interpolation (C.5/C.6)

`inputs.keyboard/text` connect normalized native snapshots to owned payload
inputs. `observeInputs` subscribes to scoped execution attempts; `receiveInput`
validates supplied packets (and optional future tick) without retaining a log.
Live navigation/location/hydration are integrated with boot/derived policies.
`interpolate` creates presentation bindings from frozen previous/current tick
roots and clamped alpha; ordinary forms/bindings stay committed. See
[semantic/interpolation](semantic-interpolation.md) and the
[guide](../../DOCUMENTATION.md#semantic-input-packets) for arguments, errors,
compatibility and cleanup. Bounded recording is available in C.7/C.8; [Isolated replay](replay.md) is implemented.

## Ordered recording and bounded retention (C.7/C.8)

App-only startRecording(options), stopRecording(), clearRecording(),
exportRecording() and nonreactive recording status own executed-prefix history.
Standalone public readRecording(text,{schemaVersion?}) validates without running
application code; serializeRecording(value) round-trips that immutable import.
Recent mode advances whole checkpoint baselines; session mode stops visibly at
limits. Capture never changes runtime commit/error semantics. Mount and drain
existing inputs/effects before starting; all recording operations require idle
boundaries. See [recording](recording.md) and [the guide](../../DOCUMENTATION.md#bounded-recording)
for options, byte accounting, ownership, errors, cleanup and an executable example.
[Isolated replay and live-source suppression](replay.md) are implemented; [retained history](history.md) adds seek/undo/redo.

## Isolated replay

`createReplay({recording,schema,...})` restores a separate app after complete
preflight; its controller owns step/run and first-divergence comparison.
`app.replaying` is false for createApp and true for the controller app.
See [replay](replay.md) for readonly mutation boundaries, suppression, optional
mount/flush, errors and disposal. Public app.dispose also closes its controller.

D.1/D.2 [history](history.md) uses the same replay suppression during inspection.
Its stable app restores whole state/control/route graphs, invalidating consumers;
normal actions retain their existing property-level behavior. Explicit branch
mount skips ambient startup hydration and restores the selected local URL before
normal live behavior. See history for barriers, ownership, errors and cleanup.
