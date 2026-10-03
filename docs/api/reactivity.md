# Exact observers and lazy computed values — A.4/A.5

Experimental API, available on applications and their view contexts. Import
`createApp` and `createActionSchema` from `src/index.js` (or `mini-framework` when
consuming the package). No internal imports or external reactive library are
needed. See [the public guide](../../DOCUMENTATION.md#exact-reactive-observers)
for complete copyable examples.

## Signatures

```ts
app.observe<T>(read: (state: DeepReadonly<State>) => T,
               onInvalidate?: () => void): Observer<T>
app.computed<T>(read: (state: DeepReadonly<State>) => T): Computed<T>
```

The declarations additionally reject statically visible Promise-returning reads
and callbacks. JavaScript runtime checks independently reject Promise/thenable
results. Invalid callback arguments reject immediately with `REACTIVITY_INVALID`.
The `state` argument is a tracked, read-only view of the latest committed graph.

| Handle | Member | Behavior |
| --- | --- | --- |
| Observer | `read(): T` | Always runs the read; replaces dependencies and clears dirty on success |
| Observer | `dirty: boolean` | True after an affected commit until successful read |
| Observer | `dispose(): void` | Releases reads/callback/subscriptions; idempotent |
| Computed | `value: T` | Runs a dirty read once and caches its result; otherwise returns the cache |
| Computed | `dirty: boolean` | Initially true; checking it never evaluates |
| Computed | `dispose(): void` | Clears cache/subscriptions and invalidates surviving consumers; idempotent |

`observe` runs one read at registration to establish its subscription, but does
not call the invalidation callback at registration. Its callback runs only on a
clean-to-dirty transition. No invalidation callback means an observer can simply
be polled and explicitly refreshed. `computed` does not run at registration.
Callbacks run without a bound `this`; internal graph records are never passed.
Both handles are frozen; their result types are inferred from their read.

## Read and invalidation contract

| Read | Dependency | Invalidated by |
| --- | --- | --- |
| `state.user.name` | Root user identity and user name value | User replacement, name change |
| `'name' in state.user` | Existence | Presence change, except always-present inherited keys |
| `Object.hasOwn(state.user, 'name')` | Own existence | Add/delete, including undefined values |
| `Object.keys(state.user)` | Own keys/order and own presence | Addition, deletion, changed key order |
| `Reflect.ownKeys(state.user)` | Own keys/order | Addition, deletion, changed key order |
| `state.rows.length` | Length value | Growth/truncation |
| `[...state.rows]` or iterator methods | Array iteration/indices/length | Insert/remove/reorder/hole changes, replacing entries |
| `state.rows[0].name` | Index identity and item name | Index replacement/move or that item's name change |
| `computed.value` inside a read | Computed source edge | Any invalidation of that computed source |

State-object values compare by logical identity, surviving COW copies and array
moves. Reading an object alone does not subscribe to every descendant. Item
edits do not invalidate array structure, length or unrelated item fields. A
hole-to-undefined transition affects presence/keys/iteration while an ordinary
value read remains undefined. No-op commits advance the state version without
invalidation; aborted actions produce no version or invalidation.

Each evaluation replaces its complete state and computed dependency sets. This
removes stale branches. Chained invalidation visits all dependents before any
observer callback runs, without evaluating computed values. Diamonds deduplicate
dirty resources. Result equality does not suppress invalidation; equality would
require eagerly consuming dirty derivations. A read with no dependencies stays
cached indefinitely until disposed.

The read's state argument, and `app.state`/`context.state` during evaluation,
use stable read facades. Outside evaluations, those getters still return
ordinary deeply frozen snapshots. Earlier saved snapshots do not track.
Facades preserve aliases, ordinary array access and null prototypes, and resolve
current reachable nodes on each read. A captured removed node throws
`STATE_DETACHED`; use a fresh root/item selection to follow replacements.
Facades are not frozen snapshots. Descriptor reflection tracks presence;
use direct field reads for value tracking. Cached derived objects use reference
semantics; treat ordinary derived results as immutable. Dependencies do not span
application instances. Metadata such as `stateVersion` and `dirty` is not a
reactive state property.

## Errors and ordering

Reads and notifications must be synchronous and pure. Mutation through a facade
throws `STATE_READONLY`. Dispatch rejects `ACTION_REENTRANT` during reads or
notifications; app mounting/disposal rejects `LIFECYCLE_REENTRANT`. Creating
reactive resources during reads/notifications, or disposing resources during a
read, rejects `REACTIVITY_REENTRANT`.

Computed cycles throw `COMPUTED_CYCLE` with a path such as
`computed#1 -> computed#2 -> computed#1`. Recursive observer reads throw
`REACTIVITY_CYCLE`. Failed evaluations stay dirty and replace old dependencies
with those reached before failure; an explicit subsequent read retries. Failed
observer registration disposes the incomplete subscription. Illegal async results
throw `REACTIVITY_ASYNC`; native rejections are observed, unknown thenables are
not executed. Application async side effects are not cancelled.

Notifications run synchronously after each successful action commit and before
the next queued action. They may read/refresh/dispose resources. Other callbacks
still run when one fails. Queued children of the successful action still run.
The outer dispatch throws the notification/body failures after draining; earlier
commits remain. `onError` observes phase `dispatch`. Registration and explicit
read/disposal errors are thrown directly to their caller. A disposed computed
invalidates its consumers; their later attempt to consume it throws
`SCOPE_DISPOSED`. Disposal is complete even if a notification fails.

## Ownership and compatibility

`app.observe`/`app.computed` resources belong to the application. Explicit handle
disposal releases them earlier. `context.observe`/`context.computed` resources
belong to that mount attempt; failed mounts dispose them, and stale contexts
reject further creation with `SCOPE_DISPOSED`. Application disposal stops the
graph before user/view cleanup, with no reactive callbacks during shutdown.
Read/dirty/value access after resource disposal rejects `SCOPE_DISPOSED`.

Declarative DOM bindings use these subscriptions to update exact targets on render
frames; `app.flush()` drains pending visual work. Root views still construct once;
conditional child scopes own their observers/computed values. See [DOM API](dom.md).
Events, routing, recording and replay remain unimplemented. State/type/transaction
limits are unchanged. The coordinator indexes the current graph on commits and
stores live subscriptions; this is correctness evidence, not a measured performance
improvement or heap leak proof.
