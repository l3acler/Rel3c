# Task 0.9 — Architecture review and corrected engine measurements

Completed: 2026-10-02 (Bahrain). Phase 0 selection: **copy-on-write** for Phase A,
not a completed public runtime. See [ADR 0003](../adr/0003-transaction-engine-identity.md)
and [browser/input policy](../adr/0004-browser-input-support.md).

## Review outcome

| Decision | Outcome | Evidence / remaining gate |
| --- | --- | --- |
| Transaction strategy | Adapt COW; keep staged/reference experiments | Correctness + fresh timing/memory/GC below; production port A.2 |
| Object identity | App-local logical IDs, not paths/positions | Independent graph/observer tests; checkpoint restore policy C.1 |
| Supported types | Acyclic aliases, ordinary same-realm data, finite numbers | Codec matrix + corrected transaction validation; runtime budgets A.2 |
| View syntax | Elements + explicit property/derived bindings | ADR 0001, 40 Chrome checks; templates deferred, public renderer A.6 |
| Actions / schemas | Explicit input modes, owned payloads, runtime validation + inferred types | ADR 0002, runtime/positive/negative fixtures; public integration A.3/B.9 |
| Versions / nesting | Successful named no-op still publishes one version; queued nested dispatch required | PRD contract; raw spikes deliberately differ, queue failure details/tests A.3 |
| Browsers / input | Broad modern browser targets; publish only qualified cells | ADR 0004; current Chrome spike evidence, real cross-browser/IME gates B/C |
| Snapshot / recording | Versioned alias-preserving codec is experimental data only | No clock/PRNG/version continuation or bounded replay implemented; C.1/C.7–C.9 |

Phase 0's strategy gate is passed after correcting and remeasuring its two
known type-policy findings. Production adaptation, scheduler/queue integration
and general frontend/native-input acceptance remain later tasks, not hidden
waivers or completed runtime features. No third-party frontend/state capability
was introduced. src/index.js and its placeholder declarations are unchanged.

## Corrections before selection

Task 0.8 identified unsupported Array subclasses normalized during imports and
repeated validation of aliased DAG nodes. Both storage candidates shared that
validator, so neither was approved with those gaps intact.

The shared contract now checks original prototypes before import, reads own data
descriptors without invoking ordinary property getters, and uses active ancestors
for cycles plus completed nodes for alias memoization. Arrays require the local
Array.prototype; objects require the local Object.prototype or null. Foreign-realm
plain objects/arrays reject rather than normalize; null-prototype data remains
supported. Live Proxy traps/modified host intrinsics
are not sandboxed. Validation completion is local to a call, not cached across
later caller mutations.

17 new tests run the same type/assignment policy against all three backends:
23 unsupported values, rollback after earlier valid edits, revoked drafts and
recovery, inherited/own getters without execution, accepted graph meaning,
30-level shared DAG import/commit, cycles after a completed sibling and failed
traversal cleanup. An instrumented 31-node DAG receives 61 descriptor inspections
and zero ordinary value reads. The two task 0.8 audit tests now assert rejection
and completed-node memoization instead of preserving known bad behavior.

Storage algorithms, benchmark harnesses/workloads and public runtime are unchanged.
Only the shared validation implementation changes measured engine sources.
Historical artifacts are preserved unchanged: their hashes identify the earlier
contract available in commit 515f406 (task 0.8) and b67e3db (tasks 0.5–0.7).
Fresh datasets below fingerprint the corrected sources. Do not mix samples
across campaigns or attribute differences solely to the fix: browser patch,
runtime/JIT/GC noise and execution conditions can also differ.

## Fresh datasets and reproduction

- [Full Node comparison](../../benchmarks/results/node-1790960264641-a12d0e33.json),
  recorded 2026-10-02T16:57:44.639Z: 126 clean timing trials, 7,560 samples,
  42 separate memory/GC profiles.
- [Full Chrome comparison](../../benchmarks/results/browser-1790960398521-3214f283.json),
  recorded 2026-10-02T16:59:58.520Z: 126 rAF trials, 3,780 callback samples.
- [DOM regression artifact](../../benchmarks/results/view-syntax-quick-1790960433800-c03943fb.json):
  all 40 checks including trusted Enter/Tab; quick measurements are smoke-only,
  excluded from engine selection and not a replacement for 0.7's timing report.

```sh
npm run test:spikes
npm run test:benchmarks
npm test
npm ci
npm run test:types
npm run smoke
npm run bench:spikes
npm run bench:spikes:browser
npm run check:view-syntax -- --quick
```

Run the benchmark suites sequentially, without other benchmark/test jobs.
The original [harness method](../../benchmarks/README.md) is unchanged: seven
bounded workloads, row sizes 128/1,024, engine order rotated over three rounds.
Node uses fresh timing processes (12 warmups, 60 measured updates) and separate
--expose-gc memory processes (12 warmups, 30 profiled updates). Chrome uses an
isolated profile/tab with eight warmup and 30 measured frames per case/round.
Transactions include begin/body/validation/materialization/freeze/deltas or
failure; closure creation, hashing and report writes are outside samples.
All measured groups pass alias-aware state hash/version/invalidation equivalence.

Environment: Apple M4, 10 cores, 16 GiB RAM, Darwin 24.6.0 arm64; Node v26.3.0 /
V8 14.6.202.34-node.20; Chrome 154.0.8037.93 / V8 15.4.80.19. Chrome differs
from task 0.6/0.7's 154.0.8037.92 by a patch version. Temporary local server and
isolated browser profile were closed/removed by each runner; no signed-in profile
was used. TypeScript 5.9.3 remains development-only, with no runtime dependency.

## Node full-transaction timing

Pooled median / nearest-rank p95 in **milliseconds**, 180 samples per cell.

| Workload | Rows | Eager reference | COW | Staged |
| --- | ---: | ---: | ---: | ---: |
| sparse-nested | 128 | 0.332 / 0.468 | 0.348 / 0.445 | 0.388 / 0.466 |
| repeated-writes | 128 | 0.341 / 0.438 | 0.364 / 0.456 | 0.392 / 0.471 |
| dense-updates | 128 | 0.419 / 0.674 | 0.536 / 0.791 | 0.519 / 0.852 |
| array-insert | 128 | 0.336 / 0.452 | 0.394 / 0.485 | 0.413 / 0.500 |
| array-reorder | 128 | 0.410 / 0.688 | 0.455 / 0.671 | 0.470 / 0.718 |
| alias-edits | 128 | 0.333 / 0.456 | 0.362 / 0.440 | 0.391 / 0.459 |
| rollback | 128 | 0.200 / 0.615 | 0.123 / 0.372 | 0.106 / 0.388 |
| sparse-nested | 1024 | 2.416 / 3.021 | 2.535 / 3.124 | 2.642 / 3.094 |
| repeated-writes | 1024 | 2.463 / 3.056 | 2.503 / 2.859 | 2.649 / 3.161 |
| dense-updates | 1024 | 3.164 / 4.119 | 4.203 / 5.031 | 4.062 / 5.125 |
| array-insert | 1024 | 2.424 / 3.117 | 2.748 / 3.040 | 2.781 / 3.359 |
| array-reorder | 1024 | 3.144 / 4.609 | 3.622 / 5.129 | 6.665 / 7.789 |
| alias-edits | 1024 | 2.468 / 3.223 | 2.554 / 2.861 | 2.745 / 3.232 |
| rollback | 1024 | 1.550 / 3.550 | 0.826 / 2.764 | 3.498 / 4.495 |

## Chrome transaction callback timing

Pooled median / nearest-rank p95 in **milliseconds**, 90 samples per cell.
This is synchronous scripting inside rAF, not full-frame scripting/paint latency.

| Workload | Rows | Eager reference | COW | Staged |
| --- | ---: | ---: | ---: | ---: |
| sparse-nested | 128 | 1.200 / 1.900 | 1.500 / 2.000 | 1.600 / 2.000 |
| repeated-writes | 128 | 1.250 / 1.800 | 1.200 / 1.800 | 1.500 / 2.000 |
| dense-updates | 128 | 1.700 / 2.200 | 1.700 / 2.700 | 1.950 / 2.400 |
| array-insert | 128 | 1.400 / 1.800 | 1.400 / 2.100 | 1.400 / 2.100 |
| array-reorder | 128 | 1.650 / 2.100 | 1.400 / 2.500 | 1.600 / 2.400 |
| alias-edits | 128 | 1.050 / 1.700 | 1.050 / 1.800 | 1.250 / 2.000 |
| rollback | 128 | 0.700 / 1.000 | 0.600 / 0.800 | 0.500 / 0.700 |
| sparse-nested | 1024 | 4.400 / 5.800 | 4.050 / 5.200 | 4.150 / 4.900 |
| repeated-writes | 1024 | 4.300 / 5.500 | 4.400 / 5.500 | 3.900 / 5.300 |
| dense-updates | 1024 | 4.600 / 5.500 | 4.900 / 5.500 | 4.700 / 5.400 |
| array-insert | 1024 | 4.600 / 6.100 | 4.400 / 5.500 | 4.800 / 5.900 |
| array-reorder | 1024 | 4.700 / 5.400 | 4.750 / 5.500 | 6.600 / 7.300 |
| alias-edits | 1024 | 4.400 / 5.800 | 4.550 / 5.500 | 4.800 / 5.600 |
| rollback | 1024 | 4.300 / 6.300 | 3.100 / 4.200 | 5.600 / 6.000 |

Browser medians vary by round: COW dense-updates/1,024 rounds are 3.000, 5.000,
5.300 ms; COW repeated-writes rounds are 3.350, 4.600, 4.700 ms. Staged reorder
rounds are 6.600, 6.600, 6.700 ms. Node staged reorder rounds are 6.804, 4.604,
6.923 ms. These observations support a workload-specific choice, not a confidence
interval, universal ranking or controlled before/after speedup.

At 1,024 rows all pooled rAF intervals have median 16.7 ms and p95 16.7/16.8 ms.
That headless schedule does not prove a 60 Hz production budget: no framework
renderer, layout, effects or competing workload is included in these trials.

## Memory / GC observations

For 1,024 rows, each cell is **H / R / count; GC median / p95**:
sampled heap high-water delta H in MiB, after-forced-GC retained delta R in KiB,
natural GC event count, and natural event durations in milliseconds.

| Workload | Eager reference | COW | Staged |
| --- | ---: | ---: | ---: |
| sparse-nested | 32.69 / 533.1 / 18; 0.195 / 2.621 | 14.09 / 25.2 / 25; 0.121 / 0.198 | 14.30 / -35.1 / 29; 0.124 / 0.164 |
| repeated-writes | 13.67 / 527.7 / 22; 0.207 / 0.309 | 14.12 / 17.9 / 25; 0.135 / 0.186 | 13.79 / -40.8 / 29; 0.120 / 0.156 |
| dense-updates | 77.59 / 786.9 / 12; 0.830 / 3.121 | 67.51 / 361.8 / 14; 0.605 / 3.561 | 44.07 / -206.8 / 13; 0.710 / 4.223 |
| array-insert | 12.03 / 530.9 / 21; 0.201 / 0.284 | 14.33 / 18.9 / 25; 0.119 / 0.174 | 15.69 / -96.2 / 28; 0.119 / 0.167 |
| array-reorder | 48.03 / -65.6 / 12; 0.687 / 2.135 | 71.64 / 142.3 / 12; 0.919 / 2.804 | 48.33 / -104.1 / 14; 0.585 / 2.477 |
| alias-edits | 30.69 / 535.0 / 19; 0.201 / 2.879 | 17.42 / 23.9 / 26; 0.129 / 0.168 | 14.94 / 23.3 / 28; 0.119 / 0.153 |
| rollback | 24.75 / 22.6 / 6; 1.149 / 1.243 | 35.54 / -305.5 / 5; 0.857 / 1.321 | 24.49 / -310.7 / 5; 0.919 / 1.403 |

H is a sampled churn proxy, not exact allocation or transient peak. R includes
harness/JIT/observer noise; negative values mean earlier allocations were
collected, not negative engine allocation. There is one memory profile per
engine/workload/size, not a leak study/confidence interval. Raw artifacts retain
RSS/external/array-buffer samples and forced-GC durations separately.

Natural entries include minor/major/incremental/weak-callback categories, not
identical stop-the-world pauses. They come from instrumented memory runs and
must not be subtracted from clean timing. Browser GC events, precise allocated
bytes, exact heap peaks and total traced frame/paint cost remain unavailable.

## Interpretation and verification

COW is chosen for tested structural sharing and better large-array reorder /
failure costs, not because it wins every timing or memory cell. Staged operations
have lower dense Node median and markedly lower sampled dense/reorder churn.
The eager reference wins most successful Node medians. Full-graph work remains
in both prototypes, and native key-array membership in staged writes is a
source-backed suspected contributor rather than measured attribution. Keep
these tradeoffs visible during production adaptation and remeasure optimizations.

- Combined Node suite: **303/303 pass**, including all prior seeds/oracles and
  the 17 new type-policy tests; no skipped or failing tests.
- Type fixtures: positive TS and checked JS pass; all **25 negative lines** reject,
  with no emitted code. Runtime independently rejects illegal Promise returns.
- Root startup/public imports: smoke passes. Runtime dependency tree remains empty.
- Both full benchmark runs pass equivalent-work checks; fresh source fingerprints
  match the corrected engine/workload/harness files.
- Chrome syntax/DOM regression: **40/40 pass**, including trusted Enter/Tab,
  keyed focus/selection, owned events, coalescing, rollback and cleanup.
- Markdown links and whitespace checks pass; the separate pre-existing ADR 0001
  formatting edit is preserved and excluded from task 0.8's commit.

PRD v2.3 records the supported-type/engine/view decisions without removing the
unmet template gate or changing the mandatory successful-action version contract.
The development plan advances to A.1. Broad browser/IME support, runtime state
budgets, queues, computed values, routing, services, bounded recording and replay
remain explicitly unimplemented. Task 0.9 is committed separately from task 0.8;
no push or Phase A implementation is included.
