# Transaction spikes

These modules are internal experiments and are not exported from `src/index.js`.

Run `npm run test:spikes` from the root. See the [task 0.5 comparison report](../../docs/reports/task-0.5-correctness.md) for semantics, deterministic seeds, results, findings, and limitations.

`createCowEngine`, `createStagedEngine`, and `createReferenceEngine` implement the same begin/draft/commit/abort/run interface. Committed state is frozen; drafts are revoked after completion. Commit results expose net `changes`, diagnostic `affectedPaths`, and identity-based `affectedProperties`. Use `getObjectId(object)` to follow logical items across publication and reorder; never treat a mutable array path as identity.

The storage strategies remain separate. Common helpers provide graph identity, proxy/lifecycle semantics, and net metadata. Tests include an independent native-JavaScript state/observer oracle so shared helper bugs are not accepted merely because engines agree.

Task 0.6 historical measurements are available in the [measurement report](../../docs/reports/task-0.6-measurements.md). Task 0.9 corrects shared type validation, remeasures both backends and selects COW for Phase A; see [ADR 0003](../../docs/adr/0003-transaction-engine-identity.md) and the [fresh review/evidence](../../docs/reports/task-0.9-architecture-review.md). Test duration is not a benchmark. The raw spike still suppresses no-op versions and rejects simultaneous transactions; production successful named actions must publish one version (including no-op data) and queue nesting in A.3.

Validation accepts acyclic ordinary same-realm data and null-prototype objects,
with separate active/completed traversal sets. It rejects unsupported original
prototypes (including Array subclasses/foreign-realm arrays), accessors and
nonenumerable data except array length before import. Hostile Proxy traps are
not sandboxed. Production depth/growth limits remain A.2, not supplied by codec
import/export budgets alone. `type-policy.test.js` records the new regressions.
