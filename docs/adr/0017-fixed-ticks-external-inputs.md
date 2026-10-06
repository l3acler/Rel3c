# ADR 0017 — Fixed ticks and owned external inputs

Status: implemented and verified; see [C.3/C.4 evidence](../reports/task-C.3-C.4-ticks-inputs.md).
Extends ADR 0016's reserved fixed clock.

`simulation: {tickDuration, action?, maxCatchUp?}` selects integer microsecond
ticks. Duration is positive and safe; the optional action must take no payload.
Catch-up defaults to 8, with a maximum of 1024 ticks per advance/frame. Apps start
paused. `resumeTicks()` enables explicit `advanceTicks(elapsedMicroseconds)` and,
when mounted, an owned animation-frame driver. Its first frame establishes an
epoch. Rounded absolute frame timestamps avoid accumulating rounding drift.
Pause and document hiding cancel sampling; resume/visibility resets the epoch.
Existing accumulator backlog survives. Hidden wall time does not enter the clock.

Each tick advances clock/time before consuming its FIFO inputs, then dispatches
the configured tick action. Nested dispatch still follows the existing FIFO
contract. Inputs may explicitly target a future tick through `enqueueAt`; ordinary
`enqueue` targets the next tick. Input bodies/guards fail independently, healthy
inputs and tick logic continue. The tick remains consumed and committed action
prefixes remain; failures pause the driver and propagate once. Nothing retries
implicitly or skips a numbered tick. Queue admission owns supported payload data;
application guards run at execution. Active runtime work cannot enqueue or drive
ticks. Direct dispatch stays synchronous in fixed mode, at current logical time.

Queues hold at most 1024 roots and aggregate existing payload graph budgets.
Snapshots reject pending queued inputs or effects. Empty-queue fixed checkpoints
retain clock/tick/duration and PRNG continuation using format/runtime version 1's
reserved clock shape. Restore requires matching simulation duration; it starts
paused with zero elapsed accumulator. Frame epoch, pause policy, catch-up budget
and tick callback identity are live configuration, not serialized state. Manual
checkpoints retain their existing exact encoding and require manual configuration.

`inputs.send/sample/effect` deliver a version-1 payload containing origin,
success/error/cancelled status, supported value and plain error information.
Sequence/tick/time are admission receipts, outside the action payload; sequences
are local to this app session and are not restored recording cursors. Manual mode
dispatches immediately; fixed mode queues at the next tick. `measure` normalizes
viewport/layout/scroll, `storage` normalizes getItem, and `timer` delivers an
elapsed timer result. Network work uses `effect` with an AbortSignal and an async
callback returning supported data. Adapters sample outside action bodies and
reactive/render work; they do not sandbox arbitrary global reads in user code.

Effects begin in a microtask, return `{cancel, done}`, and have at most one terminal
delivery. Explicit cancellation delivers a cancellation input while its scope is
live, aborts the signal, and consumes late outcomes. Scope/app disposal aborts and
suppresses delivery, removes queued scoped inputs, and resolves done to null.
Errors from action delivery reject done; internal rejection handling prevents
unobserved cleanup-related rejection warnings. At most 1024 pending effects per
app. Caller-created promises/remote side effects cannot necessarily be stopped by
abort. Scoped adapters may register effects during view construction; delivery
always occurs later. Measurement/send remain forbidden during construction.

This batch provides ordered, serializable input boundaries. Durable recording,
record import, replay suppression, semantic event integration and interpolation
remain C.5–C.10 work. Different-live-source tests manually inject saved payloads;
they do not establish the later public replay gate.

## C.5/C.6 follow-up

[ADR 0018](0018-semantic-inputs-interpolation.md) integrates normalized semantic/
route/hydration packets and adds optional display interpolation. The C.3/C.4
claims above describe that milestone; C.7–C.10 recording/replay remain planned.
