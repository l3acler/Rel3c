# mini-framework public documentation

This guide describes the framework's implemented public API and is updated with
every framework addition or change. Current functionality is experimental:
application lifecycle, read-only state and synchronous named actions, exact observers and lazy computed values (A.1–A.5).
Import from `src/index.js`; applications do not need runtime internals.

## What works today

| Capability | Available behavior |
| --- | --- |
| Application lifecycle | Create headlessly, mount a text view, register cleanup and dispose |
| State ownership | Private deeply frozen snapshots; nested objects, arrays and acyclic aliases |
| Named actions | Validated inputs, writable transaction drafts, atomic commit or rollback |
| Nested dispatch | Bounded FIFO execution with defined parent and child failure behavior |
| Reactive observers | Exact property, presence, key and array subscriptions with dynamic reads |
| Computed values | Lazy caching, chained/dynamic dependencies, disposal and cycle errors |
| Error reporting | Readable framework error codes and a synchronous application error hook |
| TypeScript | Inferred action names/payloads and read-only state declarations |

Views currently render once per mount. Actions update state but do not update
mounted text automatically. Element functions, bindings, keyed lists and frame batching are unimplemented. Observers invalidate after commits but do not render DOM. Events,
routing, persistence, controlled clock/random services, recording, replay and
inspection also remain later work. Examples below use only implemented APIs.

## Start from the project root

Use Node.js 18 or later; verification currently uses Node.js 26. No dependency
installation, compiler or bundler is needed for browser startup.

```sh
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/). The root redirects to the
basic example, which initializes state through a named action and then mounts a
text report. The package has zero third-party runtime dependencies. Development
tools are the built-in Node test runner/server, installed Chrome for browser
checks, and TypeScript 5.9.3 for type checks.

For your own page, save this as `guide.html` at the repository root and open
`http://localhost:3000/guide.html` while the server runs:

```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <title>Framework example</title>
  <div id="app" class="counter" aria-live="polite"></div>
  <script type="module">
    import { createApp, createActionSchema } from './src/index.js';

    const schema = createActionSchema()(({ action }) => ({
      increment: action(draft => { draft.count++; }),
    }));
    const app = createApp({
      initialState: { count: 0 },
      schema,
      view: ({ state }) => `Count: ${state.count}`,
    });

    app.actions.increment();
    app.mount(); // Framework invokes the view and displays Count: 1.
  </script>
</html>
```

The `div` is a native HTML mount container. The framework owns the text it adds
inside it. Element construction through framework functions follows later.

## Public exports

| Export | Purpose |
| --- | --- |
| `createApp(config)` | Create an application with owned state, registered actions and a view |
| `createActionSchema(options)(build)` | Define explicit action input modes and an optional schema version |
| `FrameworkError` | Framework error class with a readable message and `code` |
| `VERSION` | Package version string |
| `FRAMEWORK_INFO` | Frozen metadata describing implemented and planned capabilities |

## Application lifecycle and views

`createApp()` works without browser globals. Without a configured target, the
app stays `created` and its view does not run. `app.mount()` finds `#app` when
called; `app.mount(element)` uses a custom DOM Element. Passing `target` to
`createApp` mounts immediately. Invalid explicit targets do not fall back to `#app`.
A missing target/document rejects clearly, and the app may retry later.

Config supports only `initialState`, `schema`, `view`, `target` and `onError`.
Defaults are `{}` state, an empty schema and an empty text view. Unknown options
and accessor configuration properties reject. Inline `actions` and `seed`
configuration are not implemented.

A view receives `{ state, actions, dispatch, observe, computed, onDispose }`. It returns synchronous
text, null or undefined. HTML-looking strings become text, preserving text
escaping. Element descriptors, numbers, booleans and async view results reject.
`context.state` and `app.state` read the latest complete committed snapshot;
destructuring or saving that snapshot retains that particular version.

Mount preserves host-owned children, native focus and selection. One application
owns a target at a time. Double mount and target migration reject. Failed mounts
release ownership and clean up their attempted view scope.

`app.dispose()` removes owned text and runs cleanup. Disposal is terminal and
idempotent. Afterward, state reads, mounting and dispatch reject. It does not
invalidate snapshots already saved by callers.

## State and named actions

Application code cannot directly change committed state. Register actions and
edit their writable drafts so observers of committed state never see partial work:

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  setCount: action(
    value => typeof value === 'number' && Number.isFinite(value),
    (draft, count) => { draft.count = count; },
  ),
  fail: action(draft => { draft.count = 99; throw new Error('Stop'); }),
}));
const app = createApp({ initialState: { count: 0 }, schema });

const original = app.state;
app.actions.increment(); // Equivalent to app.dispatch('increment').
app.dispatch('setCount', 10);
console.log(app.state.count, app.stateVersion); // 10, 3
console.log(original.count); // 0: saved snapshots remain unchanged.

try { app.actions.fail(); } catch (error) { console.log(error.message); }
console.log(app.state.count, app.stateVersion); // Still 10, 3.
app.dispose();
```

Use `action(run)` for zero payload arguments, and `action(validate, run)` for
exactly one payload. Explicit undefined counts as a payload. Unknown names and
wrong argument counts reject before guards or bodies. Modes are explicit rather
than inferred from function arity, so default/rest parameters remain predictable.

Payloads are copied and deeply frozen before a pure synchronous guard, which
must return exactly true. Caller data remains mutable. Bodies receive `(draft)`
or `(draft, ownedPayload)` and are invoked without binding `this`.

The body reads its own writes through the draft; `app.state` still exposes the
previous committed version until success. A successful action publishes one
version, including no-ops; `stateVersion` starts at 1. A throw, invalid final
graph or Promise/thenable return publishes none. Every completed draft is revoked,
preventing later reads/writes. Return values are ignored; dispatch and wrappers
return undefined. These functions can be detached and called without binding.

State roots must be objects or arrays. State and payload values support null,
undefined, booleans, strings, finite numbers including negative zero, ordinary
same-realm objects/arrays and null-prototype objects. Acyclic aliases, distinct
identities, array holes and custom enumerable string properties are preserved.
Cycles, accessors, symbols, unsupported prototypes/native values and nonenumerable
data other than array length reject. Do not pass native browser Events as payloads.

Keep async effects outside actions and dispatch their results as supported data.
Action code must not read ambient layout/storage/time/random values for
reproducibility. Controlled services and external-input recording are not yet
available. Rollback cannot undo arbitrary external side effects or cancel async
callbacks; revocation prevents deferred draft mutation.

## Exact reactive observers

Use `app.observe(read, onInvalidate?)` for a precise subscription. The framework
calls `read(trackedState)` once at registration to establish dependencies. After
a commit changes one of those dependencies, it marks the observer dirty and calls
`onInvalidate()` synchronously. It does not automatically rerun `read`. Calling
`observer.read()` evaluates the latest committed state, replaces the entire read
set and clears `observer.dirty`. Repeated commits notify once until that refresh.
This lets later DOM scheduling choose when to consume a dirty read.

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.user.score++; }),
  rename: action(draft => { draft.user.name = 'Grace'; }),
}));
const app = createApp({
  initialState: { user: { name: 'Ada', score: 0 } }, schema,
});
const score = app.observe(state => state.user.score, () => {
  console.log('Score subscription is dirty');
});
app.actions.rename(); // No score invalidation.
app.actions.increment(); // Invalidates score; state is already fully committed.
console.log(score.dirty, score.read()); // true, 1
score.dispose(); // Idempotent; read/dirty afterward reject SCOPE_DISPOSED.
app.dispose();
```

Direct reads track property values; `in`/`Object.hasOwn` track presence;
`Object.keys`/`Reflect.ownKeys` track key membership/order. Array length, indices
and iteration are separate from item fields. Editing `rows[0].name` does not
invalidate `rows.length`, an array spread, or `rows[1].name`. Aliases share logical
node identities, which survive array moves and copy-on-write publication.
Branches replace stale dependencies each time a read runs. No-op commits and
rolled-back actions produce no invalidation.

The callback's state argument is a read-only current-state facade. `app.state`
and a view context's `state` also track while a reactive read is running; outside
reads they retain their existing deep-frozen snapshot semantics. Saving an
ordinary snapshot before registration does not create reactive dependencies.
Facades preserve aliases and array behavior, follow reachable nodes across
commits and reject mutations with `STATE_READONLY`. A captured facade whose node
is removed rejects with `STATE_DETACHED`; read the current item from the root.
Facades are not frozen snapshots and cannot be frozen. When dispatching captured
state data, admission copies the currently reachable values; save an ordinary
snapshot instead if you need historical values. Read fields directly to track
values: descriptor reflection tracks presence, not the descriptor's `.value`.
Reading only an object-valued property tracks its logical identity, not every
field beneath it.

Observers created through a view's `observe` belong to that mount attempt and
are disposed automatically on failure/disposal. `app.observe` resources live
until explicit disposal or application disposal. Invalid registration/read
arguments reject with `REACTIVITY_INVALID`; reads and callbacks must be synchronous
(`REACTIVITY_ASYNC`). Recursive observer reads reject `REACTIVITY_CYCLE`.
Registration during reads/notifications rejects `REACTIVITY_REENTRANT`.

All affected observers become dirty before any notification runs. Notifications
may refresh or dispose observers, but reads/notifications cannot dispatch actions
or mount/dispose the application. Callback errors reach the outer dispatch after
other notifications and queued actions finish; the successful commit and its
children remain committed/admitted. The error hook receives phase `dispatch`.
A failed explicit read remains dirty and keeps only dependencies reached before
its error, so an explicit retry can recover. Creation/read errors are thrown to
the caller directly.

## Lazy computed values

Use `app.computed(read)` to cache a pure synchronous derivation. The returned
`Computed<T>` has read-only `value`, read-only `dirty`, and idempotent `dispose()`.
Registration does not run the callback. First access to `.value` runs
`read(trackedState)` and records dependencies; further accesses reuse the cache
until a dependency changes. Reading `.dirty` never evaluates the value.
Unobserved dirty values stay lazy through any number of commits.

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
}));
const app = createApp({ initialState: { count: 1, useDouble: true }, schema });
const doubled = app.computed(state => state.count * 2);
const label = app.computed(state =>
  state.useDouble ? `Count: ${doubled.value}` : `Count: ${state.count}`,
);
const subscriber = app.observe(() => label.value);
console.log(label.value); // Count: 2, already cached by observer registration.
app.actions.increment(); // Marks doubled, label and subscriber dirty; no recalculation.
console.log(subscriber.dirty); // true
console.log(subscriber.read()); // Count: 4; dirty caches recalculate once.
subscriber.dispose();
label.dispose();
doubled.dispose();
app.dispose();
```

Computed reads can consume other computed values in the same application.
Changes propagate through chains and diamonds before notifications run; each
computation evaluates once when consumed. Callbacks receive no bound `this` or internal resource. Changing a branch replaces its state
and computed dependencies, so an unused branch stops invalidating it after the
next evaluation. Invalidation is based on dependencies, without eager equality
checks: an input change dirties consumers even if recalculation later produces
the same value. Ordinary derived objects are cached by reference; treat results
as immutable. A returned tracked state object remains a current-state facade,
so downstream field reads still track current nested state after COW commits.

Direct/indirect cycles throw `COMPUTED_CYCLE` with the computed read chain.
A throw or Promise/thenable result (`REACTIVITY_ASYNC`) leaves the value dirty;
the next `.value` access retries. Failed reads replace dependencies with those
reached before the error. Reads must be pure: state mutation, action dispatch,
reactive registration, and disposal during evaluation reject. Async callbacks
or arbitrary ambient effects in application code cannot be cancelled by this
rule; keep them outside derivations.

`context.computed` owns values for the mount attempt; `app.computed` owns them
for the application. Disposing an individual computed clears its cache and
subscriptions and invalidates surviving dependents. Reading a disposed value
rejects `SCOPE_DISPOSED`; update/dispose consumers too, or let their read handle
that error. Disposal notification errors are thrown to the disposing caller
without reversing disposal. Application disposal stops the entire graph before
running view/user cleanup and emits no reactive notifications. All dependencies
are local to one application; cross-application reads are not tracked.

## Nested dispatch and failure ordering

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  parent: action(draft => {
    draft.order.push('parent');
    app.actions.first();
    app.actions.second();
  }),
  first: action(draft => { draft.order.push('first'); app.actions.last(); }),
  second: action(draft => { draft.order.push('second'); }),
  last: action(draft => { draft.order.push('last'); }),
}));
const app = createApp({ initialState: { order: [] }, schema });
app.actions.parent();
console.log(app.state.order); // ['parent', 'first', 'second', 'last']
console.log(app.stateVersion); // 5
app.dispose();
```

Nested calls validate and capture payloads immediately, then return before their
bodies execute. Their parent can catch admission errors and continue. Requests
enter the FIFO tail after their parent commits, so grandchildren wait behind
existing siblings. An outer dispatch drains the entire batch synchronously.

If a parent fails, its queued children are discarded. If a child fails, its own
children are discarded, while queued siblings continue. Earlier successful
commits remain. After draining, the outer call throws the single failure or an
ordered AggregateError for multiple failures. An outer call can therefore throw
after some actions succeeded. Catching a nested call only catches admission
errors; its later body errors reach the outer caller.

Dispatch during views, guards, reactive reads/notifications or error reporting rejects. Mounting or disposing
during a dispatch batch rejects too. These rules protect the transaction and
application lifecycle from reentrant changes.

## Cleanup and error reporting

`app.onDispose(fn)` registers application-lifetime cleanup. A view's
`onDispose(fn)` registers cleanup for that mount attempt. View hooks run in reverse
registration order, then application hooks do the same. A failed mount drains
only its attempted view scope. All hooks are attempted even if one fails;
disposal still completes and then throws an AggregateError. Hooks must be
synchronous, and disposed view scopes reject new registrations.

An optional synchronous `onError(error, { phase })` observes creation, mounting,
dispatch and disposal failures without swallowing them. For a dispatch batch it
runs once after draining, when committed state is complete. If the hook also
throws, its failure aggregates with the original. It cannot dispatch recovery
work; the caller can catch the outer error and dispatch afterward. Unknown
thenables reject without execution, and illegal native Promise rejections are
observed without cancelling their callbacks.

Common error codes include `ACTION_UNKNOWN`, `ACTION_ARITY`, `ACTION_ASYNC`,
`ACTION_REENTRANT`, `ACTION_QUEUE_LIMIT`, `PAYLOAD_INVALID`, `PAYLOAD_CYCLE`,
`PAYLOAD_LIMIT`, `PAYLOAD_ASYNC`, `STATE_INVALID`, `STATE_CYCLE`, `STATE_LIMIT`,
`TARGET_INVALID`, `APP_DISPOSED`, `LIFECYCLE_REENTRANT`, `STATE_READONLY`,
`STATE_DETACHED`, `SCOPE_DISPOSED`, `REACTIVITY_INVALID`, `REACTIVITY_ASYNC`,
`REACTIVITY_REENTRANT`, `REACTIVITY_CYCLE` and `COMPUTED_CYCLE`.

## Resource limits

Each state/payload graph supports at most 128 object levels, 10,000 nodes,
100,000 enumerable entries, 100,000 aggregate array slots (holes included) and
1,000,000 UTF-16 string/key units. Transactions also charge imported/growing
data conservatively; deleting or detaching it does not refund that transaction's
charge. The proposed committed graph must fit independently.

A dispatch batch admits at most 1,024 actions including its root. It also applies
the node/entry/slot/text limits to aggregate admitted payloads. Consumed/discarded
requests do not refund batch charges; failed admission does not charge. New outer
calls start fresh. A limit rejection is an admission error that a parent may catch;
otherwise it aborts that parent. Limits bound framework work/retention, not exact
heap bytes, externally retained snapshots or user callback CPU.

## TypeScript and verification

The package includes declarations. Bind schema state once with
`createActionSchema<State>()(...)` and use a type-predicate payload guard to infer
its payload type. Names and dispatch arguments remain correlated, state/payloads
are deeply read-only, and dispatch returns void. Types cannot establish runtime
prototypes, finiteness or input ownership; runtime validation remains necessary.

```sh
npm test
npm run smoke
npm run test:browser
npm ci
npm run test:types
```

Browser checks require installed Chrome. Type checks require the development-only
TypeScript installation; startup and Node tests do not. For the full reference,
see [application API](docs/api/application.md). For current validation results,
see [A.4/A.5 evidence](docs/reports/task-A.4-A.5-reactivity.md). The
[README](README.md) provides repository structure, feature status and the remaining
verification commands; the [PRD](Framework_PRD.md) defines future acceptance gates.
