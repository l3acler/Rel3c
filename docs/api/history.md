# Retained history and branching — D.1/D.2

See the [guide](../../DOCUMENTATION.md#retained-history-and-branching),
[ADR 0021](../adr/0021-retained-history-and-branching.md),
[example](../../examples/history/README.md) and
[verification](../reports/task-D.1-D.2-history-branching.md).

| API | Behavior |
| --- | --- |
| createHistory({recording,schema?,router?,persistence?,simulation?,view?,reversible?}) | Import/preflight a bounded recording; start at its retained baseline without mounting |
| history.app | Stable inspection app; replaced with a new live app after branch |
| history.status | Frozen nonreactive current cursor/policy/seek/divergence information |
| history.seek(sequence) | Restore nearest preceding checkpoint, replay suffix to a complete retained root endpoint |
| history.undo(count=1) / redo(count=1) | Move 1–1024 complete eligible roots; validate entire range before moving |
| history.branch() | Return new headless live app, dispose inspection, discard this branch's redo future and release imported history |
| history.dispose() | Idempotently dispose inspection or the resulting branch and release owned history/indexes |

The recording/schema/router/persistence/simulation/view configuration matches
createReplay; no target, existing app, mutable initial state, controls or live error
hook is accepted. Configuration records/arrays are owned without ordinary getter
invocation. Functions remain application code. The recording is canonical string
or branded immutable readRecording result. All names/arities/packets and keyframe
route configurations preflight before any history transition. Incompatible data
keeps recording/replay errors; checkpoint route mismatch uses HISTORY_INCOMPATIBLE.

Root sequences are consecutive from baselineSequence through endSequence; they
are neither stateVersion nor tick IDs. The baseline itself is selectable. Empty
retained histories have only that baseline. Seek supports any root endpoint,
including navigation/hydration barriers and failed roots with healthy commits.
It trusts structurally validated stored snapshots and compares only the replayed
suffix. To verify bodies before a selected keyframe, run createReplay over the
whole prefix. Versions/hashes do not establish authenticity or code equivalence.

The same inspection app, observers/bindings and native target survive seeks.
Restoration replaces state/version/control/virtual route at an idle boundary,
resets display interpolation and empty tick/input bookkeeping, and invalidates
all reactive consumers. Normal actions retain exact property invalidation. Flush
applies the selected values, retaining keyed identity/focus/selection under normal
render rules. Saved immutable state snapshots remain valid; tracked facades from
a replaced graph detach and must be read again from current state. Inspection
uses replay suppression/read-only rules; it does not rewrite the source app,
browser History/storage, or automatically persist/export inspection.

reversible is an optional dense unique list of registered names (maximum 1024;
default empty). It declares reversible in-memory application behavior. Every
admitted name in a root, including nested failed/discarded work, must be listed.
Navigation/location/hydration packets always make a barrier. Pure time/empty tick
roots have no undeclared names and are eligible. A recorded external-result action
can be declared, but undoing its state never cancels or reverses the originating
request or other completed browser/storage effects. Application code is responsible
for truthful declarations; ambient globals/closures are not sandboxed.

All-or-nothing range/policy validation prevents multi-root moves partly crossing
a barrier. Arbitrary seek can inspect across barriers. Undo/redo group whole ticks,
input roots and nested batches; no per-child/version/mid-tick seek is supported.
Redo remains until branch. Imported original recording stays immutable after
branch; another controller can inspect its original future.

branch snapshots selected state/version, clock/duration/seed/draw continuation and
virtual local route into a new app, disposes the inspection lifecycle, and drops
its retained redo future/indexes. The new app is headless and ticks remain paused.
Its first mount replaces the browser's current History entry with the selected
local URL (when routed), skips ambient URL/storage hydration, and connects normal
native handlers/drivers/adapters. It must acquire normal native router ownership.
Explicitly mount a new view even if inspection had been mounted. Subsequent commits
use normal URL/storage projection; stored values are not automatically rewritten
by branch itself. Native mount/History failures use ordinary app lifecycle errors.

Branch queues/effects are empty. New tickets form a new input-admission session;
old receipts, unrecorded future work, live frame accumulators and scoped effects
cannot transfer. Fresh supplied inputs continue deterministic state; input labels
are session metadata outside state hashes. A new recording starts at sequence 0
from selected state/control. Read history.app dynamically in nested dispatch/
navigation closures so they bind to the new branch; saved old app references are
disposed. The controller owns the new app until disposal.

Status: status (inspecting/diverged/branched/disposed), baselineSequence,
endSequence, sequence, position, records, canUndo, canRedo, checkpointSequence,
replayedRoots, replayedSlots, discardedRecords, divergence. Position counts consumed
retained roots. Seek statistics describe the last effective seek; same-position
seek is a no-op unless recovering divergence. replayedSlots charges admitted
actions or one for an empty root, including replayed divergent work. The nearest
keyframe bounds suffix slots by configured interval plus one atomic root; lookup
uses a precomputed index. Stored checkpoints and O(roots) policy/index arrays add
no second snapshot log. No timing/heap-collection guarantee is made.

Divergence preserves the first report and actual consumed root/cursor; no later
root executes. Undo/redo/branch reject HISTORY_DIVERGED until a valid seek; seek can
restore a valid checkpoint and clear divergence. canUndo/canRedo are false while
diverged. Post-restore notification failure throws HISTORY_RESTORE_FAILED while
keeping restored state/checkpoint cursor; there is no rollback of that publication.
Branch inspection cleanup failure throws while leaving the new live app reachable
through history.app. Disposal still releases owned resources on cleanup failure.
Direct inspection/branch app disposal makes the controller terminal.

Errors: HISTORY_INVALID (options/names/count/sequence), HISTORY_EXPIRED (before
retained baseline), HISTORY_RANGE (beyond captured end), HISTORY_IRREVERSIBLE,
HISTORY_INCOMPATIBLE, HISTORY_RESTORE_FAILED, HISTORY_REENTRANT, HISTORY_DIVERGED,
HISTORY_BRANCHED, HISTORY_DISPOSED and existing replay/recording/app errors.
There are no asynchronous history methods. Reentrancy from actions, mounting,
reactive work or callbacks during a history operation rejects. Caller-held logs,
snapshots and status reports remain caller-owned after disposal.

Inspector, automatic live-history attachment/group labeling, custom effect
compensation, cross-tab merges and performance qualification remain future work.

D.3/D.4 [diagnostics and inspector](inspector.md) can attach to `history.app` before mounting/seeking. Diagnostic selection reads summaries; separate inspector history controls explicitly seek/undo/redo. Branching disposes the old diagnostics; attach a new session/panel to the new app.
