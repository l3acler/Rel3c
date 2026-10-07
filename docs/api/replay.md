# Isolated replay — C.9/C.10

See the [public guide](../../DOCUMENTATION.md#isolated-replay),
[ADR 0020](../adr/0020-isolated-replay-divergence.md),
[runnable recording/replay example](../../examples/recording/README.md) and
[qualification report](../reports/task-C.9-C.10-replay-determinism.md).

| API | Behavior |
| --- | --- |
| createReplay({recording,schema?,router?,persistence?,simulation?,view?}) | Validate/import the entire prefix and restore a separate app; never automatically mount |
| controller.app | Read-only committed state/controls, optional mount/flush/views/observers; replaying is true |
| controller.status | Frozen nonreactive status: status, position, total, sequence, divergence |
| controller.step(count=1) | Execute 1–1024 complete roots synchronously; return current status |
| controller.run() | Execute remaining roots synchronously, stopping at first divergence |
| controller.dispose() | Idempotent; dispose app, release import/comparison scratch and view scopes |

recording is a canonical string or immutable readRecording result. Other objects
are not trusted imports. Schema defaults to empty app/1. Register compatible bodies
and guards; versions are checked, but a version cannot prove code equivalence.
Matching route mode/base and persistence fields/namespace/schema are required when
packets use them. Preflight checks every admitted action name/arity and packet
configuration before any transition/view. It can call hydration guards, which must
be pure. Named payload guards run at execution, allowing recorded guard failures.
No target, existing app, initialState, controls or onError configuration is accepted.

Fixed duration/continuation come from baseline. Omitted simulation infers duration
and the recorded tick role; an explicitly supplied action must match every tick
root. If no tick is retained, no tick action needs inference. Live accumulator,
pending inputs/effects and tick drivers are not restored. End means captured end,
which can precede live state after recording limits.

Status values: ready, running, complete, diverged, disposed. position counts consumed
roots; sequence identifies baseline/current root. Empty logs are complete. Root
errors/failed transactions are replay evidence rather than live exceptions. Every
root compares action/input trace ownership/order, versions, state/control SHA-256,
clock/tick/random metadata and local route. Admission sequence/queued flags and
input notification/native error messages are not authoritative comparisons.

First divergence contains sequence, tick, time, action (last dispatched name, at
most 128 units, or null), eventIndex (or null), reason (trace/state/route/root),
expected/actual (bounded graph strings, hashes for larger data), expectedHash and
actualHash. Hashes describe the root endpoints, including successful commits in a
failed/divergent root. The first trace mismatch is preserved; the current atomic
root finishes and the controller stops before the next. step/run then return the
same result. Restart with a new controller. No seek/undo is provided.

Native app handlers, tick/location drivers, mount-time URL/storage hydration,
History/storage writes, adapter readers/effects/timers and scheduled application
callbacks are suppressed. Sync adapters return inert canceled receipts with
sequence 0; effects/timers resolve done to null. Validation/scope/reentrancy rules
still apply. Scheduling validates lane/callback and returns an inert canceler.
Recorded results execute as packets. Nested dispatch runs through normal FIFO;
derived hydration and state-to-URL location packets execute at publication points.
Body navigation still produces compared packets; accepted navigation updates only
virtual routes. Recorded locations are local URLs, without host origins; admitted
absolute body navigation uses matching recorded local destinations. External links
remain rendered anchors with native HTML behavior, outside replay state guarantees.

Outside executing replay bodies, dispatch/navigation/input enqueue/control and
recording methods reject REPLAY_READONLY. Mounted views may read state and register
observers/effects, but cannot mutate authoritative state. step/run/dispose cannot
reenter a root or active reactive/render/mount boundary. Public app.dispose also
closes the controller. Disposal releases owned resources even when cleanup throws;
caller-held strings/imports/status snapshots remain caller-owned. Counters are not
a heap collection proof.

Errors: REPLAY_INVALID (options/count), REPLAY_INCOMPATIBLE (preflight configuration,
names/arity; cause preserved), REPLAY_READONLY, REPLAY_REENTRANT, REPLAY_DISPOSED,
plus recording/checkpoint version/format/budget and schema-registration errors.
Divergence is a status, not an exception. Controller operations have no live error
hook. Optional presentation uses ordinary app mount/render/disposal errors.

Application actions/guards/views/cleanup and Promise consumers are ordinary JS.
The runtime does not sandbox ambient globals, mutable closures or browser default
behavior. Bind nested dispatch/navigation closures to the new app; avoid closures
that mutate a live source app. Use controlled clock/random and recorded inputs.
Checkpoint agreement verifies committed state for that fixture, not authenticity,
all ambient-read detection, DOM paint timing, performance, or cross-browser support.
