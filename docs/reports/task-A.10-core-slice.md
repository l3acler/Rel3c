# A.10: Public core acceptance

Completed 5 October 2026 (Asia/Bahrain). Phase A exit gate passes. Public APIs
remain experimental. Left unstaged/uncommitted; no push.
Baseline HEAD: `7d85afde057d66a3ae3984b1397ed1662039d33f`.

## Completed behavior

`/examples/core/` combines a counter, an independent bound value, nested profile
state, conditional details and keyed editable rows. Named actions increment,
rename, toggle, reorder, insert/remove and intentionally fail. The rollback action
attempts counter, independent/nested/detail fields, visibility, item name/order,
membership and next-ID changes before throwing. No separate notice action changes
the UI after failure. Every application import uses the public entry point; no
normal application DOM patches/listeners or third-party framework were added.

The example exports a fresh configuration and registered view for each instance.
Test wrappers decorate public view contexts to count explicit derived reads and
factory/key calls. DOM instrumentation counts text/input setters and structural
operations, including redundant setter attempts. Browser MutationObserver records
independently validate actual mutations. Instrumentation lives in tests, not the
framework's public API or the example's UI. Internal scalar resource counts are
used only to verify cleanup, as in A.9.

No runtime contract or public API change was needed. Only runtime capability
metadata advances to the verified A.10 milestone. DOCUMENTATION.md, README,
application/DOM references, example guides, PRD v2.10 and DEVELOPMENT_PLAN.md now
describe Phase A as complete. General events, routing and determinism remain
future features. No new architectural choice requiring an ADR was introduced.

## Recorded acceptance results

The [final Chrome report](../../tests/results/app-lifecycle-1791155496740-a76b8603.json)
contains `tests.coreSlice` with the exact counters below, plus source fingerprints
and browser/machine metadata.

| Scenario | Committed versions | Binding evaluations | DOM writes/mutations |
| --- | --- | --- | --- |
| One increment click | 1 → 2 | Only `root.count`: 1 | Only `text:core-count`: 1; one characterData mutation |
| Throwing click across all sections | 1 → 1, original snapshot retained | None | No setters or mutations; node identity/focus/selection retained |
| Nested profile rename | One commit | Only `root.profileName`: 1 | One profile text write |
| Item 1 rename | One commit | Item 1 name/input bindings: 1 each | One item text and one input-value write; no list key/source or other-item work |
| Three increment clicks before explicit flush | Three commits | Counter: 1 | One latest-value text write; no duplicate frame write |

Before the natural render frame, an increment has committed state while the DOM
still shows the old value and read/write counters have not advanced. After the
frame, the unrelated binding, nested/conditional bindings, list source/keys and
factories have zero work. The root view and retained nodes remain unchanged.
The failing native click reaches onError once with phase `event`, then the expected
browser error is captured by test instrumentation; no frame remains pending.

Reorder rereads the source/key set and positions, retaining both item/input nodes,
local input edits, focus and selection with zero blur events. Add/remove restores
resource counts to baseline. Removed handlers remain inert when nodes are
reattached. A dirty detail binding followed by conditional removal never reads
or writes its removed text; a recreated scope reads the latest committed value.
Disposal removes the entire tree, returns ownership counters to zero and prevents
later queued binding work. Six integrated Node and six browser checks exercise
these scenarios using the actual public example configuration/view.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/core-slice.test.js` | Six focused integrated checks passed |
| `npm test` | 278 passed, zero failures; includes existing rollback/async/FIFO/alias/dependency/computed/list/frame/cleanup coverage |
| `npm run test:types` | Positive TS and checked JS, including core app/main modules, pass; 76 independent negative lines rejected; no files emitted |
| `npm run test:browser` | 80 checks passed, including six new integrated checks and the root-served core page |
| `npm run smoke` | Root startup/redirect, public imports/modules and core HTML/app/main serving pass |
| `npm run smoke` in a clean temporary candidate | Same root startup checks pass without node_modules or internal edits |
| `npm run test:spikes` | 292 passed, zero failures |
| `npm run test:benchmarks` | 15 workload correctness checks passed |
| `git diff --check` | Pass |

Node v26.3.0, TypeScript 5.9.3, Chrome 154.0.8037.93, Darwin 24.6.0 arm64,
Apple M4 (10 CPUs). The raw report fingerprints 42 runtime/declaration/example/
test/driver files. Native animation frames are used; no synthetic frame substitute
or skipped acceptance check. The Node DOM double is independently qualified by
native browser checks. Development tools remain Node's runner/server, TypeScript
and installed isolated Chrome; `npm ls --omit=dev` reports no runtime dependencies.
These are correctness tests, not new performance/allocation/GC measurements.
The clean candidate is a temporary archive of the baseline plus the task-only
patch; this startup check does not claim Phase B's routed auditor walkthrough.

## Limits and next work

Phase A is complete, with B.1 native event generalization next. Scroll/key/input
registration/options, Event arguments/cancellation, text synchronization/IME,
routing/shared routed state, priorities, controlled services, recording/replay,
history and inspector remain unimplemented. Native input edits remain local;
state-driven name changes can replace their bound input value. Same-key static
captures stay static. Render failures may leave successful writes/moves because
DOM rendering is non-atomic; state rollback does not undo external side effects.

Chrome evidence does not qualify other browsers or IME. Ownership counters do
not prove heap collection of externally retained objects or failed native removal.
No whole-list/frame CPU bound or speedup is claimed. Phase B's complete routed
auditor walkthrough and the full PRD definition of done remain separate gates.

## Review and preservation

HEAD remains the baseline above; nothing is staged or committed. The pre-existing
AGENTS.md edit, four untracked reports and all earlier tracked reports are preserved
byte-for-byte. Runtime implementation files under `src/runtime/`, declarations,
spikes and workloads are unchanged. Review tracked changes with `git diff` and
new files with `git status --short`. The full task-only patch, excluding earlier
changes and including the core example/tests/report/evidence, is
`/private/tmp/mini-framework-A10.patch`; it passes whitespace/application checks
against a clean temporary archive of the baseline.
