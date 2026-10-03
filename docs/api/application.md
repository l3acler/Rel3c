# Application lifecycle, named actions and reactivity — A.1–A.5

Experimental public API. Implemented: owned initial state/schema registration,
synchronous text mounting, cleanup and disposal. A.2/A.3 add production COW
transactions, payload ownership/guards and bounded FIFO named dispatch.
A.4/A.5 add exact observers and lazy computed values.
Reactive elements (A.6–A.8), events (A.9/B), routing and replay remain
unimplemented. This document describes what actually runs today.

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
(default empty text), optional Element `target` and optional `onError`. Unknown
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

Mount appends one Text node, treating HTML-looking strings as text. Other view
objects, numbers, booleans, Promises and thenables reject. Element functions and
bind/derived tokens are not exported until their runtime exists. Host children,
focus and selection are preserved. One app claims an exact target at a time;
double-mount/target migration reject. Failed mount cleans up and may be retried.
Disposed apps cannot mount or read `state`/`stateVersion`; construct a new app.
`context.state` has the same snapshot/tracking behavior as `app.state`.
A saved ordinary snapshot remains unchanged after later commits. Text views run
once per mount and do not update after actions yet. Dispatch inside a view rejects with
`ACTION_REENTRANT`; prepare state before mounting or dispatch afterward.

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

Bodies receive `(draft)` or `(draft, ownedPayload)` with no bound `this`. Only the
draft exposes in-progress writes; app/context state reads still see the previous
complete version. Bodies must be synchronous. A throw, Promise/thenable return
or invalid final state rolls back and revokes the draft; success commits once
and revokes it too. Action return values are ignored, and both dispatch forms
return `undefined`. Keep async effects outside actions and dispatch their results
as supported payloads. Do not read ambient layout/storage/time/random values
inside actions. Controlled services, input adapters and recording are Phase C;
replay is not available yet. Arbitrary external side effects cannot be undone.

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
Both are synchronous; view hooks run LIFO, then app hooks LIFO. Failed mounts
drain only the failed view scope. Disposed/failed view contexts cannot register
more hooks. All callbacks are attempted even if some fail; disposal completes
and throws an AggregateError afterward. No listener/subscription scheduler is
claimed by these generic cleanup hooks; their general ownership follows A.9.

```js
const app = createApp({
  view: () => 'Ready',
  onError(error, { phase }) {
    console.error(`Application ${phase} failed`, error);
  },
});
```

`onError` observes create/mount/dispatch/dispose operation errors and does not
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
Verification: [A.3 evidence report](../reports/task-A.3-named-dispatch.md).

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
