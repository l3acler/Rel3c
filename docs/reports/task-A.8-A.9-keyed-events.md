# A.8/A.9: Keyed collections, scoped clicks and cleanup

Completed 5 October 2026 (Asia/Bahrain). Experimental public API. Initially left
uncommitted; the user subsequently requested a local commit.
Baseline HEAD: `7006e5355c97c35d5f7624bd7455a350d6d3e80b`.

## Completed behavior

A.8 adds public `keyed` descriptors and app/view-context helpers. String/finite
number keys own stable item scopes and comment-delimited DOM ranges. Insertion,
removal and reorder preserve retained nodes. Reconciliation leaves the focused
retained range connected; native input focus, selection and local edits survive.
Property-level item bindings skip unrelated fields and structural key reads.
Same-key replacement retargets item/index cells, including aliased old objects,
computed values and observers, without rerunning retained factories. Key changes
replace scopes. Missing/duplicate/invalid keys, holes, impure/async callbacks and
foreign tokens reject. Candidate failures clean resources and permit retry.

A.9 adds `onClick` with synchronous zero-argument callbacks. No-payload action
wrappers work directly; closures pass serializable payloads. One app-root bubbling
delegate exists while handlers exist. Live child-to-parent handlers run without
preventing native defaults; native button keyboard activation, disabled controls,
links and form submission work. Scope removal unregisters handlers and pending
work; stale nodes cannot act after removal/reattachment. Explicit removal flush
or app disposal during a callback skips later disposed handlers. Uncaught failures
report once at the event boundary after remaining live handlers; failed actions
roll back while earlier successful commits survive. Async/reentrant handlers reject.

Scopes own handlers, reactive resources, child scopes, bindings, hooks and queued
work. Terminal disposal still attempts all cleanup when native cancellation or
user hooks fail. Internal scalar counters verify ownership without adding a
public inspector API. Public declarations, the root guide/README, API references,
PRD v2.9, plan and ADR 0010 describe implemented behavior. `/examples/keyed/` uses
public imports for increment, add/remove/reverse, completion, visibility and rollback.
No third-party frontend framework, runtime dependency or application DOM listener
was introduced. Development tools remain Node's runner/server, TypeScript and Chrome.

## Dependency-order verification

A.8 passed before A.9 implementation: 256 runtime tests, including 21 focused
keyed tests; positive TS/checked JS and 74 independent negative type lines;
65 isolated Chrome checks; root startup smoke. The [A.8 browser report](../../tests/results/app-lifecycle-1791152187299-c45e039b.json)
records that source state and environment.

Final verification:

| Command | Result |
| --- | --- |
| `npm test` | 272 passed; zero failures; includes 21 keyed and 16 click/resource tests |
| `npm run test:types` | Positive TypeScript/checked JavaScript pass; 76 independent negative lines rejected; no files emitted |
| `npm run test:browser` | 73 Chrome checks passed, including three public examples and native Enter/Space activation |
| `npm run smoke` | Root startup/redirect, public exports, runtime modules and example paths pass |
| `npm run test:spikes` | 292 passed; zero failures |
| `npm run test:benchmarks` | 15 workload correctness checks passed |
| `git diff --check` | Pass |

Node v26.3.0, TypeScript 5.9.3, Chrome 154.0.8037.93, Darwin 24.6.0 arm64,
Apple M4 (10 CPUs). The [final browser report](../../tests/results/app-lifecycle-1791153737700-6f31c964.json)
includes machine/browser metadata and SHA-256 fingerprints of runtime, declarations,
browser fixtures, driver and examples. Verification did not run new performance
benchmarks or claim allocation/GC improvements.

Native tests instrument Text.data writes: one click dirties/writes only its bound
text and leaves unrelated text unchanged. Focus checks exercise 18 permutations
with each of three inputs focused, retaining selection/node identity with zero
blur events. Node stress checks use 20 app cycles × 10 hide/show cycles; native
checks use 12 × 8. Every recreated subtree restores counts to its original baseline;
app disposal returns scopes, bindings, owned nodes, handlers/listeners, observers,
computed values/cells, subscription edges, queued bindings and frames to zero.
Additional tests cover placement/factory failures, cleanup errors, same-key
retargeting, rollback, stale callbacks, async results and event-route errors.

The browser runner initially timed out. Isolation confirmed fixture correctness;
the runner now explicitly activates pages and sends correct platform-neutral
Enter/Space key data with text. Enter activates on keydown and Space on keyup in
the final check. Native requestAnimationFrame was retained; there is no synthetic
frame replacement or skipped test. Chrome's display-link stderr was investigated
but was not treated as evidence of a runtime failure.

## Remaining limitations

A.10's full instrumented vertical-slice gate remains planned. General event
registration/options, native Event arguments/cancellation, scroll/key/input APIs,
IME synchronization, routing, priority scheduling, deterministic inputs, recording
and replay remain unimplemented. Text edits are native/local until input adapters
exist; removed/recreated inputs initialize from state. Same-key static captures
remain static. Derived objects inherit source dependencies. Rendering is not an
atomic DOM transaction; native errors may leave successful moves/writes. Lists
have no total size/per-frame CPU bound beyond existing nesting/state limits.

The evidence qualifies Chrome only, not cross-browser or IME behavior. Resource
counts establish framework ownership cleanup, not heap collection. Externally
retained contexts/nodes/closures and a native listener whose removal throws can
remain allocated; callbacks are made inert and failures reported. Arbitrary
illegal async callbacks cannot be cancelled after they start.

## Review and preservation

Task changes were initially left unstaged/uncommitted, then the user requested
a local commit. No push was requested. The pre-existing AGENTS.md edit and four
untracked browser reports are preserved byte-for-byte outside the task commit,
as are earlier tracked reports. Review the committed batch with `git show`;
new files include implementation, tests,
references, example, ADR and two raw browser reports. A complete task-only patch,
excluding pre-existing changes and including new files, is
`/private/tmp/mini-framework-A8-A9.patch`. It is checked for whitespace and applies
to a clean temporary archive of the baseline with `git apply --check`.
