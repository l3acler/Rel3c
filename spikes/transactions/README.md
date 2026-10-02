# Transaction spikes

These modules are internal experiments and are not exported from `src/index.js`.

Run `npm run test:spikes` from the root. See the [task 0.5 comparison report](../../docs/reports/task-0.5-correctness.md) for semantics, deterministic seeds, results, findings, and limitations.

`createCowEngine`, `createStagedEngine`, and `createReferenceEngine` implement the same begin/draft/commit/abort/run interface. Committed state is frozen; drafts are revoked after completion. Commit results expose net `changes`, diagnostic `affectedPaths`, and identity-based `affectedProperties`. Use `getObjectId(object)` to follow logical items across publication and reorder; never treat a mutable array path as identity.

The storage strategies remain separate. Common helpers provide graph identity, proxy/lifecycle semantics, and net metadata. Tests include an independent native-JavaScript state/observer oracle so shared helper bugs are not accepted merely because engines agree.

Task 0.6 measurements are available in the [measurement report](../../docs/reports/task-0.6-measurements.md). Task 0.9 engine selection is pending. Test duration is not a benchmark.
