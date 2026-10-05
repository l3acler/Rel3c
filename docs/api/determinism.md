# Checkpoints and controlled services — C.1/C.2

Implemented: versioned state/control checkpoints, canonical SHA-256 comparison,
manual logical time and transactional seeded simulation draws. Fixed ticks,
recording, replay, external-input logs and interpolation remain unimplemented.
Public APIs are experimental; [ADR 0016](../adr/0016-deterministic-checkpoints-services.md)
defines the exact format and compatibility contract.

## Action services

```js
import { createApp, createActionSchema, hashSnapshot } from '../../src/index.js';
const schema = createActionSchema({ version: 'samples/1' })(({ action }) => ({
  sample: action((draft, services) => {
    draft.value = services.random();
    draft.time = services.now();
  }),
  scale: action(value => typeof value === 'number' && Number.isFinite(value),
    (draft, value, services) => { draft.value = value * services.random(); }),
}));
const app = createApp({ schema, initialState: { value: 0, time: 0 },
  controls: { seed: 123, time: 0 } });
app.setLogicalTime(1000); // Integer logical microseconds: 1 ms after origin.
app.actions.sample();
const checkpoint = app.snapshot();
const fork = createApp({ schema, snapshot: checkpoint });
app.actions.scale(2); fork.actions.scale(2);
console.log(hashSnapshot(app.snapshot()) === hashSnapshot(fork.snapshot())); // true
app.dispose(); fork.dispose();
```

The relative import is for a module in an `examples/*` folder; package consumers
import `mini-framework`. Plain JavaScript runs directly. TypeScript users specify
schema state with `createActionSchema<State>()` and type-predicate payload guards.

No-payload callbacks now receive `(draft, services)`. Payload callbacks receive
`(draft, ownedPayload, services)`. Existing functions that ignore extra arguments
continue to work; code inspecting `arguments`/rest arrays sees the extra argument.
Dispatch arity stays zero/one payload. No `this` is bound. Both service methods
are synchronous, frozen and detachable; they work only during that action body,
outside payload admission. Leaked references throw `CONTROL_EXPIRED` after the
body, including in queued children, notification callbacks and deferred work.
Calling captured parent services inside a child's guard throws `CONTROL_REENTRANT`.

`now()` returns integer logical microseconds. It reads neither wall time nor a
browser timestamp and stays constant across a dispatch batch. `random()` returns
a seeded simulation draw in `[0,1)`. Draw order is call order, with nested
requests consuming the stream only when their bodies execute FIFO.

Each action stages draws. Success commits the PRNG word/count with state before
notifications/navigation; failure, invalid final state, Promise/thenable return
or state-version overflow discards draws. Failed parents discard queued children;
failed children discard only their own draws, and healthy siblings continue.
An outer error after successful commits does not undo those commits/draws.
Successful service-only/no-op actions still publish one state version without
dirtying unrelated bindings. The PRNG is reproducible simulation randomness,
not cryptographic randomness. Arbitrary ambient API reads are not sandboxed;
actions must obey the documented boundary for reproducibility.

## Initialization and manual time

`controls` accepts only optional `seed` (default 1) and `time` (default 0).
Seed must be an integer from 0 through 4,294,967,295. Time must be a nonnegative
safe integer in microseconds. Null, fractions, negative zero, invalid prototypes,
ordinary getters and unknown options reject. Configuration is owned; later caller
changes have no effect. Seed zero initializes the nonzero word `0x6d2b79f5`.
The versioned recurrence is `xorshift32-13-17-5/1`; its exact integer operations
and normalization are in the ADR. This is not a statistical quality claim.

`app.setLogicalTime(time)` accepts a numeric time at or after the current time.
Equal time is a no-op. It advances only the manual clock, not state versions,
bindings or tick IDs. It may run before/after mount and in an event handler
outside action dispatch. It rejects during actions, payload/persistence guards,
mounting, rendering, reactive reads/notifications and error reporting. Invalid or
backward time leaves the clock unchanged. This explicit input is not yet recorded.

`app.controls` returns frozen committed metadata:
`clock: {mode:'manual',time,tick:0,tickDuration:null}` and
`random: {algorithm,seed,state,draws}`. It is nonreactive; during actions it still
shows committed control state. Save a snapshot for historical values, or copy
`services.now()`/draws into state inside an action for reactive display.
There is no public reseed/reset or live random method outside action services.
Draw count overflow at `Number.MAX_SAFE_INTEGER` rejects without publication.

## Snapshot export, restoration and hash

`app.snapshot()` takes no arguments and synchronously returns canonical checkpoint
JSON. Export is explicit and includes the entire committed supported state,
state/action/runtime versions and control continuation. It changes no state,
bindings, storage or browser URL, and runs outside active runtime work under the
same boundary rule as clock advancement. Pending visual/normal/idle work does not
prevent export; those tasks are not captured. Disposed app access fails.

`createApp({snapshot, schema, view?, target?, router?, persistence?, onError?})`
restores into a new application. Do not also supply `initialState` or `controls`.
Runtime and action-schema versions must match exactly; omitted schema uses
`app/1` and no actions. Matching versions cannot prove action code/domain schemas
are identical: provide the correct compatible schema. Restored versions resume
exactly; the next successful action adds one. Root state is owned/frozen, with
fresh internal dependency IDs and preserved graph topology/values.

Restore validates before view invocation or target ownership. It restores no
DOM, subscriptions, handlers, queued work, URL/history, storage or external effects.
If configured, ordinary mount hydration can later change restored fields and
publish additional versions. Restoring a checkpoint is not replay and does not
suppress live adapters; replay will provide that boundary in C.9.

`hashSnapshot(text)` is a public standalone synchronous function returning 64
lowercase SHA-256 hex digits. It first validates canonical checkpoint text,
then hashes its UTF-8 bytes. Hashes include graph topology/key order, versions,
logical clock and PRNG position. There is no permissive JSON-object decoder,
hash algorithm/limit option, application error hook for this standalone function,
implicit export, authentication signature or automatic migration.

Format fields and all budgets are in the ADR. Checkpoint text is at most
8,388,608 UTF-8 bytes. State retains the existing 128-level/10,000-node/
100,000-entry/100,000-array-slot/1,000,000-UTF-16-unit budgets. A valid state can
still exceed the wire budget on export. Schema versions must be nonempty and
at most 128 UTF-16 units for checkpoint use; longer legacy schema registrations
still work but cannot export checkpoints. Ordinary schema version strings are
meaning labels, not executable migrations.

Preserved: undefined, negative zero, sparse holes/custom array keys, enumerable
key order, plain/null prototypes, distinct nodes and acyclic aliases. Rejected:
cycles, unsupported/native values, symbols, functions, accessors, nonenumerable
data except array length, nonfinite numbers, incompatible versions, invalid
references, unused nodes, duplicate fields and noncanonical encodings/whitespace.
Tick metadata is reserved at manual tick 0; fixed mode is rejected until C.3.

## Errors and cleanup

| Code | Meaning |
| --- | --- |
| `CONTROL_INVALID` | Invalid controls/time or backward clock movement |
| `CONTROL_REENTRANT` | Clock/service access during forbidden runtime work/admission |
| `CONTROL_EXPIRED` | A service was used after its action body ended |
| `CONTROL_LIMIT` | Draw count would overflow the safe integer range |
| `SNAPSHOT_CONFLICT` | Snapshot combined with initial state/control initialization |
| `SNAPSHOT_INVALID` | Malformed/noncanonical metadata or unsupported state |
| `SNAPSHOT_INCOMPATIBLE` | Format/runtime/schema/random/clock mode mismatch |
| `SNAPSHOT_LIMIT` | Wire or graph/state budget exceeded |
| `SNAPSHOT_REENTRANT` | Export attempted during active runtime work |
| `APP_DISPOSED` | Access after terminal app disposal |

Creation/import errors use `onError` phase `create`; explicit clock/snapshot
operations use `control`/`snapshot`; action service failures keep the normal
`dispatch` or `event` boundary. Hooks observe and do not swallow errors. App
disposal releases control metadata; leaked services remain expired. Snapshots
already exported or retained by callers remain caller-owned.
