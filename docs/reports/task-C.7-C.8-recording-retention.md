# C.7/C.8 — Ordered recording and bounded retention

Baseline: verified uncommitted C.5/C.6 candidate, auditor artifact
1791232680040-b641b70c. At qualification the last commit was Batch 6 `6504d2b`. Both Batch 7 and this
batch were committed together as `eaa118b` at user request on 7 October 2026.
ADR 0019 preceded implementation.

Opt-in recording captures complete dispatch/input/tick/manual-time roots with
nested FIFO action and derived packet ownership, version/failure/discard traces,
controlled baseline/end continuation, separate route metadata and checkpoint
hashes. Explicit canonical export/import preserves supported graph data and
rejects malformed/incompatible input without calling application code.
Recent retention evicts complete checkpoint segments; oversized roots advance
the baseline. Session limits stop visibly without aborting live actions.
Budget accounting includes all retained canonical wire data and a status reserve;
root scratch is independently bounded, with encoding temporaries outside that
accounting. Public guide, README, detailed references, declarations, example and
PRD v2.18 are updated together.

The PRD seeking bound changes to the configured charged-slot interval plus one
atomic root. A plain state snapshot cannot restore pending child/navigation
continuation midway through a dispatch/tick. Keyframes therefore sit at complete
root boundaries. This batch does not implement public seeking or replay.

Final verification: `npm run audit:frontend -- --offline` passes. The
[raw artifact](../../tests/results/auditor-1791235249124-c85bbae4.json) contains
exact commands/outputs, source fingerprints, environment and embedded browser
evidence. It verifies a fresh candidate copy without `.git`, dependencies or old
results and reconstructs the documented application from README. Root startup
and runtime verification precede installing locked development tooling with
scripts disabled. Runtime imports remain independent JavaScript; runtime
dependency tree is empty. All 155 candidate source fingerprints match the final
workspace and remain unchanged during the audit.

All eight command exits are zero: `npm test`, `npm run test:spikes`,
`npm run test:benchmarks`, `npm run smoke`, `npm ci --ignore-scripts --offline`,
`npm run test:types`, `npm ls --omit=dev`, `npm run test:browser`.
Results: 581 runtime tests (34 new recording/retention cases), 292 spike tests,
15 benchmark workload/correctness tests, strict positive TypeScript/checked
JavaScript and 144 independently rejected negative lines, 133 Chrome checks
(four new fixtures and the public recording example), root startup and README
auditor walkthrough. No new timing benchmark claim is made.

Environment: Apple M4, Darwin 24.6.0 arm64, Node 26.3.0, development-only
TypeScript 5.9.3, isolated Chrome 154.0.8037.98 via CLI/CDP. Local server and
isolated Chrome checks ran with authorized sandbox escalation. This verifies a
temporary candidate copy, not a newly committed Git checkout.

Coverage includes nested FIFO/rollback/discarded children, action/notification/
input failures, controlled clock/random continuation, arrays/reorders/aliases,
future-tick metadata, external results, live route/hydration ownership, varied
render schedules, long retained-prefix restoration, baseline/keyframe eviction,
oversized entries/baselines, UTF-8 wire accounting, visible session limits,
canonical graph/version/trace validation and disposal. Native browser fixtures
cover semantic text recording, failed tick ownership, retention limits, route
continuations and explicit example export/validation.

Qualification limits: imported traces are structurally validated, not authentic
or behavior-certified. A test-only state continuation harness reproduces retained
suffix hashes without providing a public replay/effect suppression API. Later
pending work is excluded from executed-prefix exports. Capture limits can leave
the recorded endpoint behind current live state. No heap/performance claim,
automatic publication/export, full replay/divergence/seek, OS IME/system clipboard,
mobile/other-browser release qualification or separate demonstration app.
