# D.1/D.2 — Retained history, undo/redo and explicit branching

Baseline: Batch 9 commit `3bc1163`, committed at user request before this batch.
ADR 0021 preceded implementation. Batch 10 remains uncommitted; no push.

createHistory imports one bounded recording with full replay/configuration/name/
arity/keyframe-route preflight. Root seeking uses the nearest indexed checkpoint
and verifies its suffix. Inspection keeps a stable app/reactive lifecycle/keyed
DOM while replacing authoritative state/version/clock/PRNG/virtual route, resetting
interpolation/input bookkeeping and invalidating reactive consumers. Normal action
property-level behavior remains unchanged. Seek statistics expose actual replayed
roots/charged slots without another retained snapshot log.

Explicit reversible names govern complete roots, including nested failed/discarded
work. Navigation/location/hydration form barriers; multi-root policy/range checks
complete before mutation. Arbitrary seek can inspect across barriers. Declared
external-result actions undo only state, never the completed originating effects.
Divergence finishes its consumed root, stays inspectable and blocks undo/branch
until a valid seek. Post-restore observer failure retains checkpoint/cursor.

Explicit branch snapshots selected authoritative continuation/local route into a
new headless live app, disposes inspection, releases its redo future/indexes and
starts empty paused queues/new input admission. First mount restores selected URL
with native replaceState and skips ambient startup hydration. Normal subsequent
native inputs/effects and URL/storage writes resume. Caller-held original recording
stays immutable. Inspection cleanup errors leave the new branch reachable; direct
app/controller disposal releases owned resources.

The PRD v2.20 clarifies continuation: executed-prefix logs omit pending work/live
accumulator, so old tickets cannot transfer; branches restore authoritative clock/
PRNG/version and begin fresh receipt sessions. History is a separate inspection
controller, not an automatic attachment to a running source. Source app is untouched.
Guide/README/API/declarations/example/browser-support documentation update together.

Focused Node qualification: 31 cases cover exact bidirectional hashes, nearest
keyframes/suffix counts, nested grouping, default/declared policy, failed/discarded
work, all-or-nothing barrier moves, clock/empty ticks, expired ranges/counts,
state/control/route branches, deterministic fixed continuation, stable observers/
keyed nodes/focus/selection, no ambient browser sampling, URL/storage startup,
divergence/recovery, graphs/aliases/holes/frozen snapshots, reentrancy, notification/
cleanup errors, direct disposal, owned configuration/descriptor validation,
randomized recent/session retention, null route baselines, hash routing and empty
histories. Each randomized retention fixture records 80 source iterations and
makes 80 pseudo-random seeks, comparing independent node:crypto hashes and root
slot bounds. Changed bodies diverge on replayed suffixes. Snapshot checkpoints
are trusted data; seeking directly to one does not execute its earlier bodies.

Four new Chrome fixtures cover repeated seek with stable app/keyed DOM/native
focus/selection and exact hashes; multi-root undo barrier validation; virtual
inspection without History changes followed by explicit selected-route branch
mount; and restored seeded fixed-tick continuation with fresh paused queues.
The public history example also exercises seek/undo/redo/branch and owned cleanup.

Final verification: `npm run audit:frontend -- --offline` passes. The
[raw artifact](../../tests/results/auditor-1791358072246-bda11166.json) records all
eight command outputs/exit codes, native browser results and 166 matching final
source fingerprints. The candidate is a fresh temporary copy without .git,
node_modules or old results; the README reconstructs the auditor app. It is a
candidate copy rather than a committed Git checkout.

| Check | Result |
| --- | --- |
| npm test | 644 passed, including 31 history/branching cases |
| npm run test:spikes | 292 passed |
| npm run test:benchmarks | 15 correctness tests passed; no timing claim |
| npm run smoke | Root startup/public modules/examples passed before installation |
| npm ci --ignore-scripts --offline | Lockfile/cache install of TypeScript 5.9.3 |
| npm run test:types | Positive TS/checked JS pass; 163 independent negative lines rejected |
| npm ls --omit=dev | Empty; zero third-party runtime dependencies |
| npm run test:browser | 143 Chrome checks including history example and README walkthrough |

Environment: Apple M4, Darwin 24.6.0 arm64, Node v26.3.0, Chrome 154.0.8037.98
with fresh temporary profile, TypeScript 5.9.3 (development-only). Browser/server
verification required authorized execution outside the filesystem sandbox. No
approval rejection or remote write occurred. Root guide/README history snippets
execute successfully; local Markdown links and git diff --check pass. Evidence
reports/ADRs/plan are excluded from the source manifest; executable code, public
docs/declarations/examples match it. The stale Phase C browser metadata assertion
was updated for D.1/D.2 before the passing final qualification.

Formatting-only edits appeared elsewhere in src during this batch. They were
preserved. Syntax-tree comparison against the baseline (ignoring equivalent quote/
parenthesis formatting) found no behavior changes in those 18 files: action dispatch,
diagnostics, DOM modules, input adapters/ownership, persistence codec, recording
format/recorder, scheduler and serialization modules. History behavior changes are
in its new controller and the store/control/tracking/tick/interpolation/input/route/
persistence/app/replay integration. Final audit fingerprints include all formatting.

Limits: standalone imported history, complete roots only, explicit reversible
state policy, checkpoint trust and synchronous seeking. No automatic live-history
attachment, custom effect compensation, inspector or performance qualification.
Ambient globals/application closures are ordinary JS; use history.app dynamically
after branching. Root endpoint hashes do not certify authenticity/code identity,
paint timing, all ambient reads, heap collection or universal browser support.
OS IME/system clipboard/mobile/other-browser/background behavior remain open.
No completed external side effect is reversed, and no deployment/publication or
separate assignment demonstration app is included. Next: D.3/D.4 instrumentation
and inspector.
