# D.7 — Experimental product acceptance and release review

7 October 2026. Owner: Codex. Baseline: Batch 12 commit `809bce9`, committed at
user request before this batch. The framework remains experimental `0.1.0`.
This review changes audit tooling and current documentation; no runtime API,
declarations, authoritative semantics, package version or serialized formats change.
No npm publication, tag, remote release or push is performed.

The implemented feature scope has an acceptance contract and focused evidence for
all 24 PRD IDs below. Experimental implementation acceptance is separate from broad
stable browser/OS qualification. The [release notes](../../RELEASE_NOTES.md) list
completed phases and remaining limits; the [public guide](../../DOCUMENTATION.md)
remains the runnable API source, with the [README](../../README.md) walkthrough.

## Requirement coverage

| PRD ID | Accepted fixture behavior / public contract | Focused Node evidence | Native/integration evidence |
| --- | --- | --- | --- |
| DOM-1 | [Declarative forms, conditions and keyed views](../api/dom.md) | [dom.test.js](../../tests/dom.test.js), [keyed.test.js](../../tests/keyed.test.js) | [dom.js](../../tests/browser/dom.js), [keyed.js](../../tests/browser/keyed.js) |
| DOM-2 | [Exact writes, stable nodes and native focus](../api/dom.md) | [core-slice.test.js](../../tests/core-slice.test.js), [render-queue.test.js](../../tests/render-queue.test.js), [keyed.test.js](../../tests/keyed.test.js) | [core-slice.js](../../tests/browser/core-slice.js), [keyed.js](../../tests/browser/keyed.js) |
| STATE-1 | [Deep reads and one store across routes](../api/reactivity.md) | [reactivity.test.js](../../tests/reactivity.test.js), [router.test.js](../../tests/router.test.js) | [reactivity.js](../../tests/browser/reactivity.js), [routing-scheduler.js](../../tests/browser/routing-scheduler.js) |
| STATE-2 | [Item-field versus structural dependencies](../api/collections.md) | [reactivity.test.js](../../tests/reactivity.test.js), [keyed.test.js](../../tests/keyed.test.js) | [keyed.js](../../tests/browser/keyed.js) |
| STATE-3 | [Lazy caching, chained/dynamic reads and cycles](../api/reactivity.md) | [computed.test.js](../../tests/computed.test.js) | [reactivity.js](../../tests/browser/reactivity.js) |
| ACTION-1 | [Single-version commits, rollback, synchronous/FIFO guards](../api/application.md) | [dispatch.test.js](../../tests/dispatch.test.js), [transaction-production.test.js](../../tests/transaction-production.test.js) | [core-slice.js](../../tests/browser/core-slice.js) |
| SCHED-1 | [Latest-value frame batching and explicit flush](../api/dom.md) | [render-queue.test.js](../../tests/render-queue.test.js) | [render-queue.js](../../tests/browser/render-queue.js) |
| SCHED-2 | [Priority ordering and bounded fairness](../api/scheduling.md) | [scheduler.test.js](../../tests/scheduler.test.js) | [routing-scheduler.js](../../tests/browser/routing-scheduler.js) |
| TIME-1 | [Fixed ticks, ordered input and rate-independent hashes](../api/ticks-inputs.md) | [fixed-ticks.test.js](../../tests/fixed-ticks.test.js) | [ticks-inputs.js](../../tests/browser/ticks-inputs.js) |
| TIME-2 | [Display-only interpolation with unchanged hashes](../api/semantic-interpolation.md) | [interpolation.test.js](../../tests/interpolation.test.js) | [semantic-interpolation.js](../../tests/browser/semantic-interpolation.js), [replay.js](../../tests/browser/replay.js) |
| EVENT-1 | [Native click/scroll/key handlers and cleanup](../api/events.md) | [events-input.test.js](../../tests/events-input.test.js), [click.test.js](../../tests/click.test.js) | [events-input.js](../../tests/browser/events-input.js), [click.js](../../tests/browser/click.js) |
| EVENT-2 | [Semantic held/repeat/text/paste/composition inputs](../api/events.md) | [events-input.test.js](../../tests/events-input.test.js), [semantic-inputs.test.js](../../tests/semantic-inputs.test.js), [replay.test.js](../../tests/replay.test.js) | [events-input.js](../../tests/browser/events-input.js), [replay.js](../../tests/browser/replay.js) |
| INPUT-1 | [Recorded browser measurements and async results](../api/ticks-inputs.md) | [external-inputs.test.js](../../tests/external-inputs.test.js), [replay.test.js](../../tests/replay.test.js) | [ticks-inputs.js](../../tests/browser/ticks-inputs.js), [replay.js](../../tests/browser/replay.js) |
| ROUTE-1 | [URL/state/shared-store navigation, direct loads/back-forward](../api/routing.md) | [router.test.js](../../tests/router.test.js) | [routing-scheduler.js](../../tests/browser/routing-scheduler.js) |
| PERSIST-1 | [Selected memory/session/local/URL hydration and precedence](../api/persistence.md) | [persistence.test.js](../../tests/persistence.test.js), [persistence-codec.test.js](../../tests/persistence-codec.test.js) | [persistence.js](../../tests/browser/persistence.js) |
| RNG-1 | [Controlled logical time and transactional seeded draws](../api/determinism.md) | [deterministic-services.test.js](../../tests/deterministic-services.test.js), [checkpoint.test.js](../../tests/checkpoint.test.js) | [determinism.js](../../tests/browser/determinism.js) |
| RECORD-1 | [Versioned roots, retention and usable baselines](../api/recording.md) | [recording.test.js](../../tests/recording.test.js) | [recording.js](../../tests/browser/recording.js) |
| REPLAY-1 | [Isolated roots, varied schedules and first divergence](../api/replay.md) | [replay.test.js](../../tests/replay.test.js) | [replay.js](../../tests/browser/replay.js) |
| HISTORY-1 | [Retained seek, undo barriers and explicit branching](../api/history.md) | [history.test.js](../../tests/history.test.js) | [history.js](../../tests/browser/history.js) |
| INSPECT-1 | [Inputs/change/dependency/work displays and explicit exports](../api/inspector.md) | [inspector.test.js](../../tests/inspector.test.js) | [inspector.js](../../tests/browser/inspector.js) |
| LIFE-1 | [App/view/route/panel handler and subscription disposal](../api/application.md) | [app.test.js](../../tests/app.test.js), [keyed.test.js](../../tests/keyed.test.js), [external-inputs.test.js](../../tests/external-inputs.test.js), [inspector.test.js](../../tests/inspector.test.js) | [app-lifecycle.js](../../tests/browser/app-lifecycle.js), [history.js](../../tests/browser/history.js), [inspector.js](../../tests/browser/inspector.js) |
| DOC-1 | [Public-import Markdown walkthrough and declarations](../api/application.md) | [public-contract.test.js](../../tests/public-contract.test.js) | README reconstruction and eight B.11 auditor checks |
| PACK-1 | [Root startup, public exports and clean checkout](../api/application.md) | [smoke.test.js](../../tests/smoke.test.js), [audit-checkout.test.js](../../tests/audit-checkout.test.js) | root smoke and README auditor walkthrough |
| TECH-1 | [Own DOM/state/router/events and zero runtime dependencies](../api/application.md) | [smoke.test.js](../../tests/smoke.test.js), [public-contract.test.js](../../tests/public-contract.test.js) | auditor AST imports/dependency review |

The final full audit runs these tests together rather than using the coverage
mapping as a substitute for verification. EVENT-2 acceptance is supported semantic
fixture behavior, including synthetic paste/composition and trusted Chrome editing;
it does not qualify a real OS IME or system clipboard. LIFE-1 evidence verifies
owned handles/empty DOM, not collection of all caller/browser heap objects.
DOC-1 examples create/nest elements, set ID/class/attributes, handle events, update
shared routed state, persist selected fields and navigate from actions through
public imports. Native handlers remain inside the framework.

## Architecture, determinism and performance gates

The measured two-engine comparison and corrected validation selection are covered
by [0.9](task-0.9-architecture-review.md), [ADR 0003](../adr/0003-transaction-engine-identity.md)
and the re-run spike contract tests. Copy-on-write was selected from equivalent
correctness/work; the current runtime's guards and indexing have separate measured
costs. No strategy switch or performance inference by assertion is made here.
[ADR 0001](../adr/0001-view-syntax.md) and [0.7](task-0.7-view-syntax.md) select
explicit element/binding functions after the tagged-template prototype gate.
The fresh syntax browser check passes 40 correctness checks; its quick timing
samples only verify the harness, not a new performance baseline.

[The D.5/D.6 report](task-D.5-D.6-performance.md) retains the full sequential Node/
Chrome campaigns with source fingerprints, seeded equivalent checkpoint effects,
raw samples, medians/p95, native writes/listeners and separate memory/GC data.
Runtime and workload executable fingerprints still identify the measured code;
D.7 changes no measured runtime. Repeated full timing campaigns are unnecessary
for a documentation/audit-tooling review. No timing work runs concurrently with
the acceptance suite. Capture overhead, anchored range costs and guarded churn
remain documented; global speed/novelty/paint/heap guarantees are not claimed.

Determinism is limited to synchronous bodies, transaction views, supported owned
payloads and controlled time/random/recorded external inputs. Tests exercise failed
parents/children, discarded input, aliases/holes, randomized collection transitions,
changed live browser/network, retained baselines, varied render schedules and
first divergence. Direct global calls/mutable closures are not sandboxed. Interpolation
changes display values only; history inspection suppresses live sources and branching
resets pending input admission. Undo cannot reverse completed external effects.

## API, documentation and migration review

The package/browser entry and declarations agree on public exports. Positive
TypeScript and checked JavaScript include the current examples; independent negative
fixtures cover action arity/payloads, readonly state, configuration and synchronous
hooks. Runtime checks remain authoritative for type-erased callbacks and imported
data. Public applications contain no `addEventListener`, manual tree writes or
`innerHTML`; runtime imports stay within local `src` JavaScript and do not load
third-party frontend libraries, spikes or tooling.

This review fixes stale compatibility text that still called implemented ticks,
recording/replay and history future work. It clarifies recording/diagnostic wire
budgets versus heap and links current list measurements. The root guide, README,
API references, PRD v2.23 and [ADR 0015](../adr/0015-public-frontend-compatibility.md)
now agree with the release notes. The metadata phase still names D.3/D.4, the latest
public runtime API addition; later milestones are development measurements/review.

Package `0.1.0`, checkpoint/recording format version 1 and compatibility runtime
`mini-framework-runtime/1` remain unchanged. Application action-schema and storage
versions/namespaces are independent. Incompatible public imports reject before
execution; storage mismatch uses documented fallback/reporting. No automatic
converter or required migration is introduced. Keep old exports/buckets when
implementing application-specific schema conversion. Original PRD syntax sketches
are prototype candidates rather than runnable current configuration.

## Clean Git checkout qualification

```sh
npm run audit:frontend -- --checkout --offline
```

Omit `--offline` if installing locked TypeScript needs registry access. Only
`--checkout`/`--offline` are accepted. Without checkout mode, the existing fresh-copy
walkthrough remains available. Startup itself is still `npm run dev`, no install
or Git required. Tests use Node; one new checkout regression test requires Git.

Checkout mode first copies the candidate without old results, node_modules or
source Git metadata, reconstructs both app files from README, then creates a local
commit inside its temporary directory and clones a separate actual Git checkout.
Git hooks/signing/global Git configuration are disabled for this audit operation.
The clone has the same revision/tree and starts clean. Eight existing feature/
startup/type/dependency/browser commands run there; tracked files and all recorded
source fingerprints must remain unchanged. The local revision is a candidate
snapshot, not the source repository HEAD or a published release. Both temporary
repositories/install/browser profiles are cleaned up. The source branch/index/
commits and remotes are untouched. Artifacts are uniquely written to `tests/results/`.

The new focused checkout test verifies identical content, ignored-install exclusion,
source isolation, refusal to initialize an existing repository and detection of
tracked-file changes. Runtime independence checks still apply only to runtime code;
audit Git/Node facilities provide no DOM/state/event/router implementation.

## Package and dependency review

Node standard-library modules provide serving/tests/measurement/CDP automation;
installed Chrome and Git provide development checks. TypeScript 5.9.3 remains the
sole pinned development dependency; runtime/optional/peer dependencies are empty.
No bundler/build or borrowed frontend/state framework is present. Node 18+ is the
stated engine minimum, with this acceptance campaign verified on Node 26.3.0;
the campaign does not qualify every intermediate Node or OS/browser version.

The package export points to `src/index.js` with `src/index.d.ts`; raw browser
modules and examples stay runnable from the root. Package review inspects the
archive and executes a public-import consumer from its extracted contents.
The archive includes development examples/scripts/tests and historical evidence,
rather than implying a minimal runtime-only distribution. The npm registry is not
contacted and no package is published. Final archive metrics/evidence are recorded
below after the consumer check.

## Remaining release limits

All implementation phases have evidence in their supported fixture scope. Broad
OS IME candidate/commit/cancel, native system clipboard paste, mobile keyboards,
other browsers and assistive technology remain unverified; [support](../browser-support.md)
and [ADR 0004](../adr/0004-browser-input-support.md) proposed targets are not a
shipping support promise. Native hidden-tab policies have controlled tests, not
a cross-browser release matrix. SVG/custom elements, public templates, SSR,
distributed/cross-tab merging and ongoing-history/effect compensation remain
unimplemented extensions. The separate assignment app remains later integration.
No final product name, stable API freeze, stable latency/leak guarantee or automatic
schema migration is inferred from this experimental acceptance.

## Final verification artifacts

The final [checkout audit](../../tests/results/auditor-1791370194943-1773614d.json)
passes all eight commands with exit code 0: **661 Node checks (660 runtime and one
new audit-tooling test), 292 spike tests, 24 benchmark correctness tests, positive
TypeScript/checked JavaScript and 174 independently rejected negative lines,
149 native Chrome checks**, root startup and the reconstructed README walkthrough.
Runtime dependencies are empty. All **195 source fingerprints** match the final
candidate. Its local Git checkout revision is
`443a09f9384dcda8371d79d2029d2c67c7097b6a`, tree
`5efd5bd045722051af312ba146d3e98756c13c91`; it starts clean and retains unchanged
tracked sources. Node v26.3.0, Git 2.39.5 (Apple Git-154), Chrome 154.0.8037.98,
Darwin 24.6.0 arm64/Apple M4 are the verified environment.

The [syntax smoke](../../benchmarks/results/view-syntax-quick-1791369819135-1aed1b8a.json)
passes 40 browser correctness checks. Quick timing data is not a performance claim.
The final [packed-consumer review](../../tests/results/release-package-1791370237223-8a21adbc.json)
passes package-name import, seeded actions, rollback, recording/replay endpoint
hashes, readonly state and diagnostic/replay/app disposal. All 40 runtime/declaration
files are byte-identical to the candidate; package exports and dependency fields
are checked, and current guide/README/release notes/root server/walkthrough files
are present. The reviewed archive is **1,749,650 compressed bytes / 10,736,950
unpacked bytes / 337 entries**, including historical development evidence. It is
a temporary local package snapshot, not a registry release; final evidence-only
report/log edits follow packaging. The first checkout/package runs passed too;
final runs followed public documentation status/consistency fixes.

Local Markdown targets and `git diff --check` pass. Source-architecture review
confirms independent runtime imports and public-only example behavior. Measured
D.5/D.6 executable fingerprints remain unchanged. At final verification, the source repository HEAD was
Batch 12 `809bce9`; all checkout commits are temporary and deleted after auditing.

**D.7 acceptance/release review is complete for the experimental fixture scope.**
All implementation tasks are checked in the plan. Batch 13 is included in this
commit at user request; no push/publication occurred. Broader native/browser release qualification and the
separate assignment integration are subsequent work, not completed by this record.
