# Ordered recording and bounded retention — C.7/C.8

See the [public guide](../../DOCUMENTATION.md#bounded-recording) for a complete
public-import example, [ADR 0019](../adr/0019-ordered-recording-retention.md) for the
design, and the [runnable example](../../examples/recording/README.md). Experimental
version-1 format; [isolated replay/suppression](replay.md) is implemented; [retained history](history.md) adds seek/undo/redo.

| API | Contract |
| --- | --- |
| app.startRecording(options={}) | Return frozen status; replace stopped/limited history only after validating the new baseline; reject active recording or existing pending inputs/effects |
| app.stopRecording() | Idempotent; preserve prefix and limit-reached reason |
| app.clearRecording() | Stop and release history; return undefined |
| app.recording | Frozen nonreactive current status; off before start/after clear |
| app.exportRecording() | Explicit canonical JSON string of the executed prefix; reject missing history |
| readRecording(text,{schemaVersion?}) | Standalone inert bounded validation/import; return deeply frozen decoded roots/events |
| serializeRecording(recording) | Return identical canonical wire only for a value returned by readRecording; no external write |

All app recording operations require an idle boundary and report phase recording.
Events/deferred callbacks may call them; actions/reactive reads/notifications,
input observers/render/ticks/error reporting/mounting cannot. Mounting during active
capture rejects: initialize live router/persistence first, or keep the app headless.
Disposal releases app logs/scratch. Caller exports/imports remain caller-owned.

Options: mode recent (default) or session; maxActions 1024 (1–100000); maxBytes
33554432 (1–67108864); keyframeInterval 64 (1–100000). Exact descriptor-only options;
ordinary accessors/unknown fields reject. maxActions charges every admitted action
including failed/discarded work; an otherwise empty root costs one slot. Periodic
keyframes use charged slots and complete root boundaries, possibly crossing the
interval within one atomic batch/tick. Mid-root continuation/seek is unavailable.

Byte accounting covers the entire canonical wire: duplicated baseline/end
snapshots, metadata, encoded roots/events and periodic checkpoints. Status bytes
normalize status/reason to active/null and add 256 bytes for terminal-status reserve;
actual exports fit the reported accounted bytes. This is retained wire accounting,
not heap size. One bounded in-progress root and encoding temporaries, authoritative
state and caller-held data are separate; encode may allocate a temporary before
rejecting an oversized entry. No performance/memory-collection guarantee.

Recent mode evicts whole checkpoint segments and advances the baseline atomically.
Without an intermediate keyframe, the end becomes baseline and suffix is empty.
An oversized root advances baseline to its endpoint, dropping the older prefix.
If the resulting baseline/end cannot fit, capture stops with baseline-limit and
preserves the last usable prefix. Session mode never evicts; action-limit/byte-limit
stop capture visibly. Unexpected encoding/capture failure yields capture-failed.
Runtime actions/ticks continue; exported end may precede live state after limits.
Status includes records/actions/bytes, configured budgets, baseline/end sequences,
evictedRecords/evictedActions and reason. Eviction counts include empty-root slots.

Wire envelope, in canonical field order:

```
format, version, runtimeVersion, schemaVersion, policy, status, reason,
evictedRecords, evictedActions, baseline, records, end
```

format is mini-framework-recording, version 1, runtime mini-framework-runtime/1.
Baseline/end are {sequence,snapshot,route}; snapshots use checkpoint v1. Route
metadata is null or {mode,base,url}, a canonical local location independent of
state/control hashes. Restoring app.snapshot alone still does not restore routes.
Root sequences are consecutive after baseline; end identifies the captured prefix.
Records are {sequence,root,events,actions,commits,after,checkpoint,outcome,error}.
Wire root/events are canonical mini-framework-record-data/v1 graph strings;
readRecording decodes them. Graph data preserves supported aliases/array holes/
custom properties, undefined, negative zero, prototypes and property order.
Decoded records cannot be spread/mutated and then serialized as a trusted import.

Roots: dispatch {packet}; input {input,queued}; tick {tick,action}; time {time}.
Each complete dispatch batch/tick/input owns its nested work. Action queued events
include local id/parent and owned action packet. Subsequent phases dispatched,
committed, failed, discarded include id/stateVersion/error. Input dispatched events
include id/parent, execution receipt and queued flag; succeeded/failed events include
id/stateVersion/error. Receipts retain admission sequence, assigned tick/time,
derived flag and packet. Error summaries are inert bounded name (128), message
(2048), code (128 or null); no retained error objects/stacks/accessors.

Consumed inputs are recorded at execution. Unconsumed/canceled queue tickets have
no transition and are excluded; later pending work is absent from prefix export.
Direct rejected admissions do not open roots; an admitted packet failing its guard
at execution records a failed input with zero admitted actions. Async requests,
render timing, fractional advances, pause/visibility and interpolation are not
commands. Nested action/derived input traces must not be replayed independently.
A failed root can contain healthy commits. after includes state version, tick/time,
PRNG draws/state, route and checkpoint SHA-256. commits is actual version delta,
including non-action hydration; action trace counts cannot exceed it.

Import checks hard/declared budgets, exact canonical fields, compatible versions/
optional expected schema, data graphs, sequences/clock/version progression,
FIFO action ownership/terminal outcomes, input nesting, keyframe hashes/control
policy and final continuation. It does not run guards/bodies or validate behavior,
authenticity, intermediate state hashes or ambient globals. No automatic migration.
[Replay/divergence](replay.md) verifies state transitions against these endpoints.

Errors: RECORDING_INVALID, RECORDING_INCOMPATIBLE, RECORDING_LIMIT,
RECORDING_ACTIVE, RECORDING_PENDING, RECORDING_MISSING, RECORDING_REENTRANT,
and existing APP_DISPOSED. Limit-reached reasons are status results, not runtime
exceptions. Plain malformed imports throw without app hooks or partial execution.

D.1/D.2 [history](history.md) uses the same replay suppression during inspection.
Its stable app restores whole state/control/route graphs, invalidating consumers;
normal actions retain their existing property-level behavior. Explicit branch
mount skips ambient startup hydration and restores the selected local URL before
normal live behavior. See history for barriers, ownership, errors and cleanup.
