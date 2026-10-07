# ADR 0020 — Isolated replay and first divergence

Status: accepted and implemented in C.9/C.10.

createReplay({recording,schema,router?,persistence?,simulation?,view?}) imports an
explicit canonical string (or immutable readRecording result), validates the
entire format/configuration and action names/arities before execution, and creates
a separate app from its baseline. No existing app is mutated. Its app may mount
optional public views; controller step(count=1)/run() own authoritative mutation.
Outside controller execution, live dispatch/navigation/input/control/recording
mutations reject. Nested dispatch/navigation from executing bodies remain owned
by the usual dispatcher. Mount/flush/dispose are supported presentation operations.

The replay app never connects native tick/location drivers, reads mount-time
storage/URL, writes History/storage, runs adapter readers/effects/timers or scheduled
application callbacks, or delivers native events. Suppressed sync adapters return
an inert canceled receipt with sequence 0; effects resolve null. Views/guards/action
bodies/cleanup are still application code; direct ambient reads/writes cannot be
sandboxed. They must obey the deterministic contract and bind app closures to the
replay app. Native browser presentation remains outside checkpoint guarantees.

Roots execute exactly once. Tick roots inject their recorded consumed inputs and
run configured tick logic. Nested named actions execute through original FIFO
semantics; child traces are comparison evidence, never extra commands. Accepted
derived hydration and state-to-URL locations are injected at their recorded
publication points, avoiding live storage and unrecorded initial URL defaults.
Action-requested navigation still derives from the body and is compared before
virtual application. Native History failure without a recorded location update
leaves virtual route cells unchanged. Separate baseline route metadata restores
virtual location without hydration; ordinary snapshots remain unchanged. The wire
stores local URLs without host origin. Absolute body requests can use their
recorded admitted local destination without reading a replay host origin.

Each root compares authoritative action/input ownership and state/control hash,
version, clock, PRNG and route endpoint. Admission sequence and queued presentation
metadata do not affect state; saved tick/time/order do. Notification/render/native
observer error messages need not recur, while action failure/rollback/discard and
successful version ordering must match. The first divergence identifies sequence,
tick/time, action and optional event, reason, expected/actual hashes or bounded
trace summaries. Stop before the next root; completed commits in the divergent
root remain inspectable. A new controller restarts from the baseline.

Replay uses bounded per-root comparison scratch rather than another retained log.
It imports existing v1 recordings without migration. End/checkpoint hashes verify
committed state under varied source/replay render schedules; recording limits can
describe a prefix older than live state. Public seek, undo/redo, inspector and
performance qualification remain Phase D. Randomized fixtures cover failures,
arrays/aliases, retention, external results and render cadence in C.10.
