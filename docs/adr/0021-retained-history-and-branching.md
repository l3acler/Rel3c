# ADR 0021 — Retained history, reversible roots and branching

Status: accepted and implemented in D.1/D.2.

createHistory({recording,schema?,router?,persistence?,simulation?,view?,reversible?})
imports one bounded v1 recording through the replay preflight. It starts at its
retained baseline. Inspection uses a stable replay app with native events, drivers,
History/storage writes, readers/effects/timers and scheduled callbacks suppressed.
seek(sequence) accepts only complete retained root endpoints, restores the nearest
preceding baseline/keyframe and replays its suffix with ordinary hash/trace checks.
No midpoint action/version/tick seek is supported. Checkpoints are structurally
validated snapshots; seeking does not verify bodies before the chosen checkpoint.
Use a full replay to verify the whole prefix. The source app/recording is untouched.

Snapshot restoration replaces authoritative state/version, clock/PRNG and virtual
route at an idle boundary, resets interpolation and empty input/driver bookkeeping,
and invalidates reactive consumers. The app, observers, bindings and mounted keyed
DOM remain owned by the same lifecycle. Coalesced render sees latest selected state;
restoration is a whole-graph invalidation, not an ordinary transaction. Previously
saved frozen snapshots remain valid; tracked facades detached by graph replacement
must be read again. Focus/selection and keyed identity follow normal render rules.

Undo/redo change the inspection cursor in whole-root groups. reversible is an
explicit list of registered action names whose application code has reversible
in-memory behavior. Default list is empty. All admitted names in a group, including
nested failed/discarded work, must be declared. Navigation/location/hydration
packets are barriers regardless of names. Pure clock/empty tick roots are eligible.
Named external-result actions may be declared, but undo restores only their state;
it does not cancel/reverse completed requests, storage writes or browser activity.
Arbitrary seek may inspect across barriers. Multi-root undo/redo validate the entire
range/policy before moving; they never partially cross a barrier. Expired/beyond-end
positions fail clearly. Redo remains available until explicit branching.

branch() creates a new headless live app from the selected state/control snapshot
and virtual route, then disposes inspection and releases its import/indexes. The
controller exposes that new app; redo future is discarded for this branch, while
the caller's immutable original recording remains unchanged. Its first mount
explicitly replaces the browser's current History entry with the selected local
URL, skips ambient startup hydration, and connects normal drivers/adapters. Storage
writes occur on later successful commits. A branch must acquire ordinary native
router ownership. It starts paused with empty queues/effects and a new input
admission session; old tickets and unrecorded pending work cannot transfer. Clock,
seed/draw continuation and state version are restored, so supplied fresh inputs
continue deterministic state. A new recording starts a fresh sequence baseline.

The controller owns both inspection and the resulting branch for disposal. The
inspection app identity is stable across seek/undo/redo, then replaced at branch;
callers bind nested dispatch/navigation closures to controller.app. Branching a
divergent selection rejects until a valid seek. Invalid targets/policy never mutate
inspection. Replay divergence finishes the current root and stays inspectable;
no later root runs. Observer failures after restoration retain the restored cursor
and state, and throw. Branch cleanup failure leaves the created live app reachable.

Memory: one already bounded immutable recording plus O(retained roots) checkpoint/
policy indexes and replay scratch; no second snapshot log. Seek reports restored
checkpoint and replayed root/charged-slot counts. Root-boundary checkpoints replay
at most configured interval plus one atomic root (plus restoration/index lookup).
No inspection state is automatically persisted/exported. D.3/D.4 inspector and
D.5/D.6 performance qualification remain separate. Ambient globals/closures remain
ordinary application code, not sandboxed or automatically made reversible.
