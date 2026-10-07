# Reproducible benchmark commands

These development tools measure the existing public runtime; they do not add or
change action, rendering, recording or replay semantics. The [root guide](../../DOCUMENTATION.md#reproducible-benchmarks)
and [workload specification](../../benchmarks/runtime/README.md) explain the domain.

```sh
npm run test:benchmarks
npm run bench:tooling:node
npm run bench:tooling:browser
```

Run sequentially with other tests/benchmarks stopped. Startup is still `npm run dev`;
no installation/build/runtime dependency was added. The browser runner requires
installed Chrome (default macOS/Linux paths from the existing browser harness),
or `MINI_FRAMEWORK_CHROME_PATH`. Only optional `-- --quick` is accepted; other
arguments fail before measurement. Quick data verifies the harness and is not a
published baseline. Output uses unique filenames under `benchmarks/results/`;
previous files are never overwritten. Browser/server/temporary-profile cleanup
runs on failure. Checkpoint/UI/resource or source-change failures abort the run.

The default campaign uses sizes 64/256, eight warmups, 30 measured samples and
three trials per case with rotating reference/runtime/diagnostics order. It uses
128 flat replay roots, eight attempted churn actions per sample and 60 separate
memory samples. Exact config, seed/workload version, source fingerprints, raw
samples and environment accompany each artifact. Warmup advances state; pooled
median/p95 summarize equal-sized trials and round medians expose variability.

Node measures headless transaction churn and replay in fresh children. Browser
measures seven workloads in native RAF callbacks: independent bindings, bursts,
keyed edits, moving elements, mount/unmount, headless churn and replay. The limited
reference uses eager native cloning/freezing, full DOM scans with retained keyed
elements and flat-log evaluation with every endpoint hash; it omits other runtime
guards/trace/features. It is an equivalent-work baseline on these valid fixtures,
not another frontend framework or a production implementation.

The diagnostics variant uses eight retained entries/65,536 bytes; this measures
bounded capture overhead, not an open inspector panel. Native write-counter probes
run separately from timing and restore their hooks even on failure. They check
actual setters/tree calls, exact text writes and keyed identity. Final state/control/
version/alias hashes, visible DOM and disposed owned resources must agree.

Timing is synchronous callback/update/render scripting, not paint/input latency or
refresh-rate guarantees. Memory/GC is separate: Node has natural GC events plus
labeled forced collections; browser has CDP heap/DOM/listener samples and forced
collector command round trips. Missing capabilities are explicit; browser natural
GC pauses/total allocated bytes remain unavailable. Heap deltas include JIT,
modules, snapshots and harness overhead, and cannot prove leak freedom.

The [technical report](../reports/task-D.5-D.6-performance.md) publishes full-run
results, strengths, costs, provisional same-environment regression alerts and
limits. Historical spike/production-port results remain separate. No numeric
latency promise or stable cross-machine threshold follows from one campaign;
exact correctness/work/cleanup checks remain the enforced gates.
