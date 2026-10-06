# ADR 0018 — Semantic input packets and display interpolation

Status: implemented and verified for C.5/C.6. See the
[batch report](../reports/task-C.5-C.6-semantic-interpolation.md) for commands,
source fingerprints and qualification limits.

Follow-up: [ADR 0019](0019-ordered-recording-retention.md) adds opt-in C.7/C.8
outcome/root recording and retention. The packet observation API below remains
an execution-attempt subscription rather than an automatic log or replay API.

An owned version-1 packet boundary admits named action roots, normalized route
locations/navigation requests, and validated persistence hydration projections.
It has no retained log. `observeInputs(callback)` receives frozen execution
receipts; `receiveInput(packet)` validates and admits a saved packet. Receipts
include sequence/tick/time and `derived` metadata. Nested location hydration and
action-requested/state-derived navigation remain derived work, not independent
roots for a later recorder. Invalid packets reject before execution. Observers
cannot enter runtime mutations; observer failure does not prevent healthy input
execution and is reported after it. C.7–C.9 still own recording, import, outcome
logs, baseline retention and replay-side-effect suppression.

Manual inputs execute immediately. Fixed-mode action/native-location/imperative
navigation roots wait for the next tick; boot location/hydration and derived work
execute synchronously. The latter preserves initial views and post-commit URL
projection. Native URL changes precede their observed application location; route
state catches up at its assigned tick. Imperative navigation writes History when
its packet executes. Recorded location application changes route cells without
reading the live URL. Hydration packets contain namespace/version, location and
accepted field values, never Storage objects/guards. Saved packets still run
configured guards and compatible route/persistence policies.

`context.inputs.keyboard(origin,action)` and `.text(origin,action)` produce
onKey/onText callbacks feeding the existing normalized semantic snapshots through
the external payload boundary. Native Event/targets/cancellation, active focus and
composition remain browser presentation. Applications may wrap a callback to
preventDefault synchronously. Existing callbacks/direct dispatch retain their
immediate behavior; fixed queuing is explicit through these helpers or adapters.

`interpolate(read)` creates an app-owned presentation binding whose callback
receives frozen previous/current tick roots, alpha, tick and logical time. Only
two roots are retained, sharing COW data. It creates no frame driver. The fixed
driver updates alpha from retained elapsed microseconds; manual advances also
update it. Paused/hidden/backlogged simulation uses alpha 1; otherwise alpha is
accumulator/duration in [0,1). No extrapolation. Direct commits outside ticks reset
both roots to latest state, preventing stale smoothing of immediate UI updates.
Initial/restored roots are identical. Completed ticks, including healthy prefixes
of failed ticks, replace the pair; callbacks cannot mutate roots or dispatch.

Presentation bindings are supported in text/attributes/style, not structural
conditions/keyed sources, which could otherwise create effects from paint timing.
Ordinary bindings and native forms retain current committed semantics.
Interpolation changes no state versions/clock/random/checkpoint hashes. Its
reactive cell is lazy; view removal releases its binding subscriptions and app
disposal releases retained roots/cell. Saved caller references remain caller-owned.
