# Task 0.6 — equivalent-work transaction measurements

**Date:** 2 October 2026 (Bahrain). **Status:** measurement task complete; production engine selection is still task 0.9.

Historical evidence note: task 0.9 corrects the shared validator and selects COW
using [fresh full comparisons and correctness review](task-0.9-architecture-review.md).
This report's numbers and raw artifacts remain unchanged; their fingerprints
describe the earlier sources retained in git, not the corrected current contract.

The two prototypes and eager reference finish every measured workload with matching alias/identity-aware state hashes, versions, and invalidation totals. The results show workload-dependent tradeoffs. They do not establish a general speedup, near-zero allocation, or a selected engine.

## Dataset and reproduction

- [Full Node dataset](../../benchmarks/results/node-1790893706897-d731f06f.json): 126 timing trials, **7,560 timing samples**, and 42 separate memory/GC profiles.
- [Full browser dataset](../../benchmarks/results/browser-1790893806968-3000696b.json): 126 trials and **3,780 real animation-frame callback samples**.
- [Harness instructions and workload source](../../benchmarks/README.md); [workloads](../../benchmarks/transactions/workloads.js).
- Quick smoke datasets are labeled `quick: true` and excluded from the tables below.

Run from the root:

```sh
npm run test:benchmarks
npm run bench:spikes
npm run bench:spikes:browser
```

Results include raw samples, per-round medians, heap/RSS traces, GC entries, versions, checksums, configuration, browser flags, and source SHA-256 fingerprints. Outputs use unique filenames and do not overwrite earlier runs. Node and browser suites ran sequentially. No development dependencies were installed.

## Environment and method

| Item | Recorded value |
| --- | --- |
| Machine | Apple M4, 10 CPU cores, 16 GiB RAM |
| OS | Darwin 24.6.0, arm64 |
| Node / V8 | v26.3.0 / 14.6.202.34-node.20 |
| Browser / browser V8 | Chrome 154.0.8037.92 / 15.4.80.19 |
| Node artifact time (UTC) | 2026-10-01T22:28:26.896Z |
| Browser artifact time (UTC) | 2026-10-01T22:30:06.968Z |
| Browser mode | Isolated headless Chrome, visible document, rAF timestamps around 16.7 ms |
| State sizes | Arrays of 128 and 1,024 rows, with nested state and shared aliases |

The artifact dates are UTC; they correspond to 2 October in Bahrain. Chrome's user-agent/platform strings report MacIntel for compatibility; the measured machine architecture comes from the Node OS record and is arm64.

Node timing uses fresh processes per engine/workload/size/round, 12 warmup transactions, 60 measured transactions, and 3 rounds. The engine order rotates each round. Clean timing excludes explicit GC and memory observers. Each sample includes begin, synchronous body, validation, materialization, freeze, change metadata, and failure handling. Closure creation and state hashing/file output are outside the sample.

Memory/GC profiles use different fresh processes with `--expose-gc`, 12 warmups, and 30 instrumented workload updates. A forced collection precedes the baseline; another follows the profile. Their durations are recorded separately. Natural GC entries are selected by start time within the workload interval. Heap/RSS are sampled every five updates.

Browser trials use one isolated Chrome process/tab, 8 warmup frames and 30 measured frames per case, with 3 rotating-order rounds. Each frame callback runs one full transaction. The callback timer excludes closure creation, state hashing, and UI updates. No forced browser GC is enabled. Browser checksums cover its own warmup/update count; different Node/browser counts intentionally produce different final checkpoints.

Medians pool all measured samples per case; p95 uses nearest rank. Per-round medians remain in the raw artifacts to expose variation. The Node reference is an eager whole-graph clone under the same action, graph-identity, validation, and metadata contract. It is an equivalent-work baseline, not another frontend framework.

## Workloads

| Workload | Equivalent work |
| --- | --- |
| sparse-nested | Increment one nested counter while retaining the rest of the graph |
| repeated-writes | Increment that same counter 24 times in one transaction |
| dense-updates | Increment every row's count |
| array-insert | Replace one row through splice; collection length stays bounded |
| array-reorder | Reverse positions of existing rows |
| alias-edits | Increment one shared logical row through three aliases |
| rollback | Edit a nested counter and row, reverse rows, then throw |

Rows include stable logical identities. Insertions use deterministic update-derived positions and new IDs. Rollback throws a pre-created error so exception allocation is not an accidental extra workload. The collection remains the configured length; root aliases may retain the original first row after replacement.

## Node full-transaction time

Values are **median / p95 in milliseconds**, based on 180 samples per cell.

| Workload | Rows | Eager reference median / p95 | COW median / p95 | Staged median / p95 |
| --- | ---: | ---: | ---: | ---: |
| sparse-nested | 128 | 0.320 / 0.434 | 0.344 / 0.444 | 0.376 / 0.452 |
| repeated-writes | 128 | 0.332 / 0.457 | 0.348 / 0.445 | 0.375 / 0.453 |
| dense-updates | 128 | 0.419 / 0.757 | 0.567 / 1.279 | 0.530 / 0.873 |
| array-insert | 128 | 0.339 / 0.484 | 0.390 / 0.543 | 0.422 / 0.559 |
| array-reorder | 128 | 0.429 / 0.774 | 0.465 / 0.826 | 0.496 / 0.849 |
| alias-edits | 128 | 0.331 / 0.444 | 0.360 / 0.524 | 0.384 / 0.455 |
| rollback | 128 | 0.213 / 0.835 | 0.130 / 0.464 | 0.110 / 0.446 |
| sparse-nested | 1024 | 2.519 / 3.580 | 2.569 / 3.051 | 2.711 / 3.860 |
| repeated-writes | 1024 | 2.537 / 4.445 | 2.590 / 3.105 | 2.691 / 3.169 |
| dense-updates | 1024 | 3.406 / 5.702 | 4.077 / 5.786 | 3.995 / 5.394 |
| array-insert | 1024 | 2.500 / 3.670 | 2.809 / 4.317 | 2.877 / 3.394 |
| array-reorder | 1024 | 3.132 / 4.458 | 3.698 / 5.669 | 5.728 / 8.139 |
| alias-edits | 1024 | 2.456 / 3.234 | 2.711 / 3.403 | 2.971 / 5.335 |
| rollback | 1024 | 1.675 / 3.872 | 0.956 / 2.128 | 4.110 / 4.981 |

The eager reference is competitive in successful-commit medians here because the prototypes still pay graph-wide validation, materialization, and delta costs. COW does reduce the measured large rollback median relative to the eager reference. Staged operations have a much larger large-array rollback/reorder cost than COW in this run. These observations apply to these implementations and workloads, not all possible COW/staged designs.

## Browser frame-callback scripting time

Values are **median / p95 in milliseconds**, based on 90 samples per cell. These are full transaction costs inside rAF, not traced total-frame scripting or paint latency.

| Workload | Rows | Eager reference median / p95 | COW median / p95 | Staged median / p95 |
| --- | ---: | ---: | ---: | ---: |
| sparse-nested | 128 | 1.200 / 1.700 | 1.200 / 2.000 | 1.300 / 2.100 |
| repeated-writes | 128 | 1.100 / 1.700 | 1.150 / 1.900 | 1.300 / 1.900 |
| dense-updates | 128 | 1.550 / 2.200 | 1.900 / 2.800 | 1.800 / 2.700 |
| array-insert | 128 | 1.500 / 1.900 | 1.200 / 2.000 | 1.500 / 2.100 |
| array-reorder | 128 | 1.350 / 2.200 | 1.600 / 2.400 | 2.000 / 2.500 |
| alias-edits | 128 | 1.300 / 1.700 | 1.200 / 1.800 | 1.400 / 1.900 |
| rollback | 128 | 0.900 / 1.100 | 0.500 / 0.800 | 0.400 / 0.700 |
| sparse-nested | 1024 | 4.400 / 5.700 | 3.850 / 5.400 | 4.500 / 5.500 |
| repeated-writes | 1024 | 3.800 / 5.500 | 4.200 / 5.300 | 4.600 / 5.600 |
| dense-updates | 1024 | 4.700 / 5.600 | 5.100 / 5.500 | 4.400 / 5.200 |
| array-insert | 1024 | 4.400 / 5.900 | 4.500 / 5.700 | 4.700 / 5.400 |
| array-reorder | 1024 | 4.700 / 5.500 | 4.700 / 5.400 | 6.600 / 7.700 |
| alias-edits | 1024 | 4.400 / 5.700 | 4.750 / 5.500 | 4.650 / 5.600 |
| rollback | 1024 | 4.100 / 5.800 | 2.350 / 3.900 | 5.600 / 5.900 |

The staged large-array reorder/rollback penalty is also visible in Chrome. Other engine rankings vary by workload and differ from Node; browser round medians also vary substantially in some cases. For example, COW sparse updates at 1,024 rows have round medians of 2.250, 4.700, and 3.900 ms. Read the raw round results alongside pooled values before treating small differences as conclusive.

### Browser scheduling observations

Consecutive rAF timestamp intervals for 1,024-row cases are **median / p95 in milliseconds**:

| Workload | Rows | Eager reference median / p95 | COW median / p95 | Staged median / p95 |
| --- | ---: | ---: | ---: | ---: |
| sparse-nested | 1024 | 16.700 / 16.800 | 16.700 / 16.700 | 16.700 / 16.700 |
| repeated-writes | 1024 | 16.700 / 16.800 | 16.700 / 16.800 | 16.700 / 16.800 |
| dense-updates | 1024 | 16.700 / 16.800 | 16.700 / 16.700 | 16.700 / 16.800 |
| array-insert | 1024 | 16.700 / 16.700 | 16.700 / 16.700 | 16.700 / 16.800 |
| array-reorder | 1024 | 16.700 / 16.800 | 16.700 / 16.700 | 16.700 / 16.800 |
| alias-edits | 1024 | 16.700 / 16.700 | 16.700 / 16.700 | 16.700 / 16.800 |
| rollback | 1024 | 16.700 / 16.700 | 16.700 / 16.700 | 16.700 / 16.700 |

The near-16.7 ms intervals describe this isolated headless schedule. They do not prove a production app meets a 60 Hz budget: this harness has no framework binding evaluation, DOM writes, layout, application effects, or competing workload. Browser GC pause events are not exposed by this harness and remain explicitly `null`; frame stalls are not relabeled as GC pauses.

## Memory and GC observations

For each 1,024-row case, **H / R / GC** means sampled heap high-water delta in **MiB**, after-forced-GC retained heap delta in **KiB**, and the count of natural GC events during the 30-update profile:

| Workload (1,024 rows) | Eager H / R / GC | COW H / R / GC | Staged H / R / GC |
| --- | ---: | ---: | ---: |
| sparse-nested | 26.70 / 536.1 / 19 | 13.75 / 27.4 / 27 | 17.27 / -31.8 / 29 |
| repeated-writes | 27.82 / 528.9 / 19 | 8.25 / 19.7 / 28 | 16.67 / -41.7 / 27 |
| dense-updates | 76.36 / 792.3 / 11 | 84.32 / 793.7 / 14 | 68.44 / -198.3 / 13 |
| array-insert | 48.36 / -6.0 / 14 | 15.38 / 19.9 / 25 | 16.46 / -93.4 / 27 |
| array-reorder | 62.09 / 272.7 / 12 | 67.30 / 146.1 / 13 | 55.18 / -49.3 / 12 |
| alias-edits | 26.41 / 537.3 / 19 | 14.36 / 21.8 / 28 | 16.69 / 22.8 / 28 |
| rollback | 24.76 / -376.1 / 6 | 25.10 / 23.2 / 5 | 36.39 / 27.7 / 5 |

H is a heap-churn proxy, not total allocated bytes or an exact peak. Sampling can miss allocations and intervening peaks; heap/RSS observations include harness, runtime/JIT, and observer overhead. R is noisy: negative values mean the runtime reclaimed earlier warmup/harness allocations, not that an engine has negative allocations. One memory trial per case is an observation, not a confidence interval or leak proof. The raw files retain RSS, external/array-buffer values, and each trace point; RSS is a whole-process observation.

Natural GC event durations in the same profiles are **median / p95 in milliseconds**:

| Workload (1,024 rows) | Eager GC median / p95 | COW GC median / p95 | Staged GC median / p95 |
| --- | ---: | ---: | ---: |
| sparse-nested | 0.203 / 2.713 | 0.120 / 0.188 | 0.109 / 0.181 |
| repeated-writes | 0.186 / 2.663 | 0.121 / 0.173 | 0.130 / 0.194 |
| dense-updates | 1.225 / 2.704 | 0.953 / 2.841 | 0.746 / 2.955 |
| array-insert | 0.427 / 1.978 | 0.127 / 0.184 | 0.125 / 0.163 |
| array-reorder | 0.818 / 2.269 | 1.098 / 1.497 | 0.913 / 2.571 |
| alias-edits | 0.210 / 3.126 | 0.131 / 0.288 | 0.155 / 1.748 |
| rollback | 1.159 / 1.275 | 0.908 / 1.477 | 0.910 / 1.106 |

Counts include minor, major, incremental, and weak-callback entries as labeled in the raw data; they are not all equivalent stop-the-world pauses. Forced collections are excluded from this table. GC timing belongs to the instrumented memory run and must not be subtracted from clean timing medians. Both competing engines allocate and trigger collection in these workloads. Dense changes and reorders still produce substantial heap churn.

Exact allocation bytes, true transient heap peaks, browser GC pauses, and traced whole-frame/paint cost are unavailable in this harness. Their absence is explicit; Node observations and callback timing are the evidence actually collected.

## Design implications for task 0.9

1. Full-graph scans remain a cost even when only one property changes. Sparse-update timing grows with graph size. Measure any later attempt to avoid those scans against the same alias/rollback/invalidation fixtures.
2. The staged backend maintains keys in arrays and uses linear membership checks during index writes. Reverse writes many indices; this offers a source-backed explanation for the large-array penalty, but the current measurements do not separately attribute its CPU cost. Optimize/re-measure it if that strategy remains a candidate.
3. Structural sharing preserves snapshots and untouched references but has not established a universal timing or allocation advantage in these prototypes.
4. Default retention/recording and real renderer costs remain separate future work. This benchmark intentionally retains no action history or old snapshots.
5. These results supply the required measurement evidence; the engine ADR must also consider task 0.5 correctness, supported types, syntax/schema prototypes, limitations, and any justified follow-up measurements. Numeric product budgets are not set by this report.

## Verification and boundaries

- `npm run test:benchmarks`: **8/8 pass**, including independent native-model checks for every workload and quantile/order checks.
- `npm run test:spikes`: **157/157 pass**.
- `npm test`: **3/3 pass**.
- `npm run smoke`: root public-import and HTTP startup checks pass.
- Both full benchmark commands completed and passed every equivalent-work check.
- Chromium runner closed its browser/server and removed its generated temporary profile.

The in-app browser connection was unavailable. Browser measurements were collected by the checked-in local Chrome driver with an isolated temporary profile and explicit permission for localhost/browser execution. No signed-in user browser or browsing data was used.

The PRD and production public entry point were not changed by this task. Benchmark pages use native DOM/listener calls as development instrumentation; they are not framework application examples or evidence that framework-owned DOM/event capabilities are implemented.
