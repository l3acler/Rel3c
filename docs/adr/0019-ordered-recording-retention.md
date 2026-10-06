# ADR 0019 — Ordered recording and bounded retention

Status: implemented and verified for C.7/C.8. See the
[batch report](../reports/task-C.7-C.8-recording-retention.md) for raw candidate
evidence, exact commands and qualification limits.

Recording is opt-in and app-owned: startRecording(options), stopRecording(),
clearRecording(), recording status and explicit exportRecording(). A standalone
readRecording(text,{schemaVersion}) validates without executing application code;
serializeRecording(value) returns the immutable import's identical canonical wire.
There is no automatic download, storage upload, or replay in this batch.

Version 1 records complete execution roots: a public dispatch batch, semantic
input execution, numbered tick (including inputs and configured tick action), or
manual logical-time change. Nested dispatch and derived packet work belong to
that root; their trace is not another replay command. Action traces distinguish
queued, dispatched, committed, failed and discarded children. Consumed input
traces retain their admission sequence, assigned tick/time and whether delivery
was queued. Canceled/unconsumed tickets cause no transition and are not retained.
Recording starts only after existing queued inputs/effects drain; later pending
work is excluded from exported executed prefixes. Each tick is its own root,
independent of render cadence, accumulator, pause and visibility.

Baselines/end snapshots contain state/version, schema/runtime versions, clock,
seed and PRNG continuation. Separate canonical local route metadata accompanies
them because ordinary checkpoints exclude route cells. Record endpoints include
hashes and periodic checkpoints. Payload traces use the shared tagged graph codec
to preserve aliases, holes, undefined, negative zero and null prototypes.
Import validates exact canonical fields, budgets, graph structure, sequence/hash/
clock/version continuity, trace ownership/order and checkpoint metadata before
returning frozen data. It does not certify application schema guards or behavior.

Retention evicts complete checkpoint segments; baseline advancement and removal
are atomic. If no intermediate keyframe fits, the latest endpoint becomes a
baseline with an empty suffix. Budgets count the entire canonical export (both
baseline/end snapshots, traces, metadata, keyframes), plus a 256-byte status
reserve. maxActions also charges one slot to a root with no admitted actions,
bounding empty ticks/control/navigation records. One in-progress root has its
own bounded scratch budget. An oversized root in recent mode is dropped together
with the older prefix and advances the baseline to its endpoint. If even that
baseline cannot fit, capture stops visibly and preserves the last usable prefix.
Session mode never evicts: limits stop capture visibly, with a reason, preserving
the complete captured prefix. Runtime commits/errors remain unchanged by capture.
No heap-byte or speed claim is made; encoding temporaries/caller exports and
authoritative state are outside retained-wire accounting.

Keyframes are safe root boundaries, after the configured charged transition
interval. Atomic batches/ticks may cross an interval. The PRD seeking bound must
therefore include one atomic root beyond the interval: a plain state snapshot
cannot restore pending child dispatch/navigation continuation midway through a
batch. C.9/D seeking will use these boundaries rather than replay children twice.

Start/export/stop/clear require idle boundaries; mounting while capture is active
is rejected so startup hydration and failed-mount route cleanup cannot create
unrecorded changes. Start after mount, or keep the recording app headless. Disposal
releases logs and scratch. Recording remains experimental; replay, divergence,
effect suppression and seeking remain C.9/C.10/D work.
