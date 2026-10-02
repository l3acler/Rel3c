# ADR 0003 — Copy-on-write transactions and stable graph identity

Status: accepted Phase 0 architecture decision for Phase A; not a shipped core.

Date: 2026-10-02 (Bahrain). Task: 0.9. Sources: Framework_PRD.md §3/§4/§9;
STATE-1/STATE-2, ACTION-1, DOM-2; tasks 0.5–0.8.

## Decision

Adapt the copy-on-write (COW) spike into the Phase A transaction engine. Keep
staged operations as a comparison experiment and the eager-clone evaluator as
a test/benchmark baseline, not public runtime imports.

Use opaque, app-local logical object identities, retained across physical
copies and array movement. Dependency keys are `(targetId, kind, key)`, where
kind is value, property existence, own-key enumeration or array iteration.
Paths are diagnostic labels, never identities or a replay/undo protocol.

Adopt the state/payload type policy and explicit action modes from
[ADR 0002](0002-action-schema-serialization.md). Initial-state and assignment
validation must reject unsupported original prototypes before import. Traverse
own data descriptors with separate active/completed sets so aliases do not
expand validation by path and cycles still fail. Both fixes are now applied
to the shared spike contract and covered by regression tests.

Adopt element functions/explicit bindings from [ADR 0001](0001-view-syntax.md)
and the proposed browser/native-input qualification policy in
[ADR 0004](0004-browser-input-support.md). No template dependency relaxation,
third-party runtime, compiler or primitive boxing is part of this decision.

## Correctness gate

All three storage backends pass the same transaction fixtures, the independent
native state/observer oracle and seeded mutation/failure sequences. The 0.5
comparison exercises 12 seeds × 160 steps × three engines: 5,760 programmed
attempts plus 2,880 recovery no-ops. Coverage includes unread aliases, held/moved
items, sparse arrays, insertion/reorder, snapshot isolation, throw/thenable/cycle
rollback, draft revocation and exact net invalidations. Engine agreement is
not the sole oracle.

Task 0.8 exposed Array-subclass normalization and repeated DAG validation.
Neither was accepted by assertion. Task 0.9 fixes the shared validator, changes
those audit tests into rejection/memoization regressions, and adds 17 type-policy
tests. They check a 23-value unsupported matrix at initialization and assignment
for every backend, getters on unsupported prototypes, foreign-realm objects,
accepted graph/prototype/hole/negative-zero meaning, 30-level shared DAGs,
cycle detection after a completed sibling, rollback/recovery and memo cleanup.
The instrumented 31-node DAG has 61 descriptor inspections and zero value gets;
this is a traversal observation, not a timing or hostile-Proxy security guarantee.

Current totals: 303 Node tests (292 spike + eight workload + three scaffold),
25 negative type lines plus positive TS/checked JS, and 40 Chrome DOM checks.
Phase A must rerun these contracts against production modules; this gate does
not claim production named queues, dependencies or public views are implemented.

## Measured choice and counterevidence

The [0.9 review and fresh datasets](../reports/task-0.9-architecture-review.md)
measure corrected sources on the same seven bounded workloads at 128/1,024 rows.
The full Node run has 126 timing trials/7,560 samples plus 42 separate memory/GC
profiles. Chrome has 126 rAF trials/3,780 callback samples. All equivalent-work
checks match final alias-aware state hashes, versions and invalidation totals.
Historical task 0.6 evidence remains available with its original fingerprints.

At 1,024 rows, median / p95 in milliseconds:

| Case | COW | Staged | Interpretation |
| --- | --- | --- | --- |
| Node reorder | 3.622 / 5.129 | 6.665 / 7.789 | Prefer COW for large collections |
| Chrome reorder callback | 4.750 / 5.500 | 6.600 / 7.300 | Same direction in the browser |
| Node rollback | 0.826 / 2.764 | 3.498 / 4.495 | COW avoids the large staged penalty |
| Chrome rollback callback | 3.100 / 4.200 | 5.600 / 6.000 | Same direction, not total frame latency |
| Node dense updates | 4.203 / 5.031 | 4.062 / 5.125 | Staged has the lower median here |
| Chrome repeated writes | 4.400 / 5.500 | 3.900 / 5.300 | Staged is competitive; COW is not universally fastest |

COW's sparse/alias-heavy successful transactions are competitive with staged
operations, while staged has a repeatable large-array reorder/rollback penalty
in both measurement campaigns (0.6 and corrected 0.9). Source inspection shows
staged keys stored in arrays with linear membership/removal work; that is a
plausible contributor, not measured CPU attribution or a claim about all staged
designs. Both preserve logical identity; COW additionally retains untouched
physical branches, whereas the eager reference clones the entire graph.

Memory does **not** make COW an unqualified winner. In the fresh 1,024-row Node
profile, COW/staged sampled heap high-water deltas are 67.51/44.07 MiB for dense
updates, 71.64/48.33 MiB for reorder and 35.54/24.49 MiB for rollback. Sparse
updates are 14.09/14.30 MiB. These are noisy churn proxies, not exact allocated
bytes, retained snapshot history or browser memory budgets. Both allocate and
trigger GC; one memory run per case cannot establish a leak or confidence bound.

The eager reference is often faster in successful Node medians. The choice is
therefore COW's tested sharing/identity behavior and collection/failure cost
tradeoff, not a universal timing win over cloning. Full-graph scans remain in
begin/validation/materialization/delta generation; sparse cost grows with state
size and even untouched nodes can generate discarded temporary materializations.
Numeric product/regression budgets remain future measured baselines.

## Identity and metadata boundaries

- A logical object ID survives committed copies, aliases and remove/reinsert
  within a transaction. Distinct objects never merge solely because data matches.
- Imported objects get owned copies/new app-local IDs; caller graphs are not
  frozen or mutated. Do not use array position or business `id` as internal identity.
- Physical snapshot references are stable when COW leaves a branch untouched,
  but render subscriptions follow logical identity, not physical-copy equality.
- Primitive comparisons use Object.is; presence differs from a missing property
  containing an inherited value. Changes report net observable invalidations,
  not every transient write or every physically copied ancestor.
- A keyed view's application key is a separate declared reconciliation key.
  A.8 must reject missing/duplicate keys and prove retained DOM/focus behavior.
- IDs are engine-local and opaque. Diagnostic ID gaps from aborted work are not
  version ordering. Data snapshot ref IDs are separate and restore aliases only.
  C.1 must define checkpoint identity/service/version restoration before replay
  or active-scope time travel is exposed.

## Required Phase A adaptation and later decisions

1. A.1: establish app ownership/public entry without importing spikes in shipped
   modules. Public registration/lifecycle shapes and errors still need integration.
2. A.2: port the corrected prototype policy, retain independent correctness tests,
   own/freeze committed graphs and revoke drafts. Add production state-growth /
   traversal-depth limits or safe traversal; codec budgets alone do not bound an
   action or the whole backend. Preserve failures atomically. Remeasure changes
   to scanning/indexing, materialization or metadata before making cost claims.
3. A.3: a successful named action publishes **one version, even for no-op data**;
   failure publishes none. Existing raw-spike no-op versions are historical,
   not a competing production contract. Queue nested dispatches after the parent;
   specify FIFO, parent-abort discard, child failure/error reporting and queue
   bounds in tests before implementing. Nested rejection in the action harness
   is not the final queue. Reject Promise/thenable results, observe illegal native
   Promise rejections, and do not claim arbitrary side effects can be undone.
4. A.4–A.10: production dependency tracking, lazy computed values, binding batching,
   keyed reconciliation and scope cleanup must be implemented and pass the full
   public click→commit→single-bound-text vertical slice.
5. B.9: finalize public declarations, minimum supported checker versions and
   plain-JS examples; prototype TypeScript 5.9.3 checks do not freeze the API.
6. C.1/C.7–C.9: finalize recording/action/runtime format compatibility, app state
   validation, canonical hashing, clock/PRNG/version continuation, snapshot
   budgets and usable retained baselines. The experimental codec is not replay.

These later gates are tracked explicitly rather than marked implemented. Phase
0 selects the implementation strategy; Phase A proves the production contract.

## Alternatives and review triggers

Staged operations remain worth revisiting if a measured key-index redesign
removes collection penalties or a target workload favors their memory tradeoff.
Eager cloning stays useful as an oracle/baseline, but does not retain untouched
physical branches. No hybrid or incremental parent-index optimization is assumed
without new shared fixtures and equivalent-work measurements. Reopen this ADR if
supported types, identity semantics, target browsers or representative workloads
change materially. Do not freeze an unjustified optimization as architecture.
