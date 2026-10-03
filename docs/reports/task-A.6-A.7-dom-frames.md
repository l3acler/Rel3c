# A.6/A.7: Declarative DOM and render frames

Completed 3 October 2026. Experimental public API. The user requested a local
commit after reviewing the uncommitted implementation.
Baseline HEAD: `97baad871f786b1e8484ac3188e73a205b45dd56`.

## Completed behavior

A.6 implements immutable public element descriptors/helpers, static/explicitly
bound text, attributes, class/style maps, nested children and conditional scopes.
Path tokens and pure derived reads subscribe at binding/property level. Null,
undefined and boolean children are empty; finite numbers are text. Strings are
escaped. Form values/checked/selected use native live properties with initial
reset defaults. Selected conditional branches preserve identity until the boolean
changes; branch removal owns cleanup and failed construction retains the old branch.
Render computation state mutations and dispatch reject.

A.7 keeps action commits synchronous and batches visual bindings into one native
animation-frame request per application. Repeated commits read the latest state
once per dirty binding and avoid equal-value DOM writes. Structural jobs dispose
removed descendants before their queued reads/writes. Explicit `app.flush()`
cancels its frame, drains pending work synchronously and prevents stale callback
writes. New invalidations caused by scope cleanup are also drained, without
running a binding twice in the same batch. Disposal cancels scheduled work before
user cleanup. Errors attempt other bindings, preserve committed state/successful
writes and retain failed jobs for explicit or next-commit retries; errors report
phase `render` without an automatic failing-frame loop.

The public guide, README, application/reactivity/DOM API references, declarations,
PRD status and development checklist describe current behavior. ADR 0009 records
ownership/form/frame decisions. `/examples/dom/` is a public-import runnable form,
bound greeting and conditional example. No application DOM patches/listeners,
spike runtime imports or third-party frontend dependencies were added.

## Dependency-order verification

A.6 was validated with synchronous visual publication before A.7 scheduling was
implemented: `npm test` passed 213 tests (22 focused DOM checks), `npm run test:types`
passed positive TS/checked JS and rejected 66 independent negative lines,
`npm run test:browser` passed 54 Chrome checks, and `npm run smoke` passed root
startup/module serving. The [A.6 raw browser report](../../tests/results/app-lifecycle-1791052277376-3b89c628.json)
records that source state, browser version, machine and SHA-256 fingerprints.

Final verification:

| Command | Result |
| --- | --- |
| `npm test` | 235 passed, zero failures; includes 22 DOM and 22 render queue checks |
| `npm run test:spikes` | 292 passed, zero failures |
| `npm run test:benchmarks` | 15 workload correctness checks passed |
| `npm run test:types` | Positive TS/checked JS pass; 67 independently rejected negative lines; no output emitted |
| `npm run test:browser` | 60 passed in isolated Chrome, including both public examples |
| `npm run smoke` | Root redirect, startup, public exports/modules and both example paths pass |
| `git diff --check` | Pass |

Final Node runtime tests ran after the queue and fixture fixes. Spike/workload
checks ran earlier in the batch; those source trees remain unchanged. This is
correctness validation, not a new performance benchmark. Node v26.3.0,
TypeScript 5.9.3, Chrome 154.0.8037.93, Darwin 24.6.0 arm64 on Apple M4 (10 CPUs).
The [final raw browser report](../../tests/results/app-lifecycle-1791053151320-40bb5f48.json)
records final runtime/declaration/browser-fixture SHA-256 fingerprints.

Frame tests instrument Text.data, native cssText/value setters and ordinary
attribute writes. Five commits produce one latest-value text write; unchanged
normalizations produce zero setters, including CSS whose browser serialization
changes spacing. Unrelated input focus/selection and node identity remain intact.
Additional checks cover aliases/dynamic reads, reset defaults, failed mounts,
rollback/no-op actions, conditional cleanup, stale callbacks, nested dispatch,
multiple render errors, failed DOM setters, surviving consumers of disposed
computed values, retry and forbidden flush reentry.

## Remaining limitations

Keyed collections (A.8), event handling and its general cleanup (A.9/B), routing,
priorities/fairness budgets, fixed ticks, input adapters, recording/replay and
inspector remain unimplemented. Native editing/reset does not synchronize app
state yet. No SVG/custom elements/templates/raw HTML; supported HTML/CSS/URL limits
are documented. There is a nesting bound, without a total DOM-size/frame CPU budget.
Absent requestAnimationFrame requires explicit flush; hidden tabs follow browser
frame behavior. Cross-browser/IME qualification and heap-leak/performance claims
are outside this evidence. Rendering is not an atomic DOM transaction.

## Review and preservation

Task changes were initially left unstaged/uncommitted, then the user requested
a local commit. No push was requested. The commit excludes the pre-existing AGENTS.md edit and all nine earlier browser-result files (including
four untracked reports) are preserved byte-for-byte. The implementation was verified against the baseline above. Review the batch
commit with `git show`; new DOM modules/tests/reference/example/report files
are also part of the batch. The complete task patch (including new files and browser evidence,
excluding pre-existing changes) is `/private/tmp/mini-framework-A6-A7.patch`.
