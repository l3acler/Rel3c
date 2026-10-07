# C.5/C.6 — Semantic inputs and display interpolation

Baseline: Batch 6 commit `6504d2b`. ADR 0018 precedes implementation. This batch
adds owned semantic/native-location/navigation/hydration packets, synchronous
scoped execution observation and compatible supplied-packet application.
Fixed roots queue while bootstrap/derived work preserves frontend contracts.
Optional interpolation reads two frozen tick roots and bounded display-only alpha.
Ordinary bindings/forms and authoritative checkpoint versions/hashes stay unchanged.

Public entry/types, DOCUMENTATION.md, README/API references, PRD and a root-served
public-import example are updated together. Runtime stays independent JavaScript
without packages; TypeScript remains development tooling.

Verification: `npm run audit:frontend -- --offline` passes in a fresh candidate
copy without `.git`, existing tooling or old results. The auditor reconstructs
the documented application from README, runs root smoke before installing
development tooling, and checks public imports and runtime independence.
The [final raw artifact](../../tests/results/auditor-1791232680040-b641b70c.json)
contains exact commands, outputs, source hashes and the embedded browser report.

All eight commands exit zero: `npm test`, `npm run test:spikes`,
`npm run test:benchmarks`, `npm run smoke`, `npm ci --ignore-scripts --offline`,
`npm run test:types`, `npm ls --omit=dev` and `npm run test:browser`.
Results: 547 runtime tests (13 new semantic input and nine interpolation cases),
292 spike tests, 15 benchmark workload/correctness tests, strict positive
TypeScript/checked JavaScript, 135 independently rejected negative type lines,
128 isolated Chrome checks, root startup smoke and an empty runtime dependency
tree. Candidate source hashes remain unchanged during verification and match
the final workspace. This is a temporary candidate copy, not a committed checkout.

Environment: Apple M4, Darwin 24.6.0 arm64, Node 26.3.0, TypeScript 5.9.3
(sole development dependency), isolated Chrome 154.0.8037.93 with CLI/CDP.
Native browser checks cover semantic keyboard/text forwarding, navigation,
interpolation/state-hash isolation and trusted Unicode editing in the new public
example. Unit checks cover saved-packet ownership/validation/hydration, future
tick ordering, observer failure/reentry, scope/resource disposal, frozen historical
roots, failed prefixes, restore and display fractions. The final audit required
local server/browser access outside the filesystem sandbox after a sandboxed
startup attempt returned `listen EPERM`; the authorized rerun passes.

Batch 6 is committed as `6504d2b`; Batch 7 and Batch 8 were later committed
together as `eaa118b` at user request on 7 October 2026. No push.

Boundaries: packet observation reports attempted execution, not durable outcomes.
Direct dispatch/nested action ownership remains separate for C.7 recording.
Supplied location packets can update cells headlessly; navigation repeats History
normally. There is no retained recording/full replay/live-source suppression.
Snapshots exclude route cells and pending inputs; display roots reset on restore.
Broad OS IME/clipboard/mobile/other-browser and native background qualification
remain open. Resource counts are not a heap proof and no performance claim is made.
