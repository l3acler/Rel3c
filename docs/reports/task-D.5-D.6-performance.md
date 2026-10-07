# D.5/D.6 — Reproducible workloads and measured performance

Completed 7 October 2026. Owner: Codex. Runtime baseline: committed Batch 11
`0eb88ca`, experimental package `0.1.0`. This batch adds measurement tools,
correctness probes and documentation; public runtime semantics are unchanged.

The runtime preserves exact binding updates, coalescing, keyed identity and
checkpoint equivalence in all seven fixture workloads. It pays substantial
transaction/lifecycle costs against the limited native reference. Diagnostics
capture adds measurable time and transient memory, especially with many writes.
Replay completes with matching endpoint hashes and lower median time than this
particular eager-clone evaluator. None of these results establish a universal
speedup, a display-frame budget, leak freedom or a stable release qualification.

## Reproduce and inspect evidence

```sh
npm run test:benchmarks
npm run bench:tooling:node
npm run bench:tooling:browser
npm run audit:frontend -- --offline
```

Run campaigns sequentially with other tests/benchmarks stopped. Chrome must be
installed, or selected through `MINI_FRAMEWORK_CHROME_PATH`. No dependency was
added; serving, measurement, tests and CDP automation use Node standard-library
modules and installed Chrome. TypeScript 5.9.3 remains the sole development
dependency and supplies no runtime behavior. Only optional `-- --quick` is
accepted; other arguments fail before measurement. Results use unique filenames,
source changes/hash mismatches fail the run, and owned processes/profiles/pages
are cleaned up on success or failure.

- [Full Node raw results](../../benchmarks/results/tooling-node-1791363287690-f260e8c0.json):
  2026-10-07T08:54:47.689Z, 36 timing trials and 12 separate memory children.
- [Full Chrome raw results](../../benchmarks/results/tooling-browser-1791363790767-1c1d046f.json):
  2026-10-07T09:03:10.767Z, 126 timing trials, 42 separate native probes and
  42 separate memory profiles.
- [Quick Node smoke](../../benchmarks/results/tooling-node-quick-1791362767950-68740c28.json)
  and [quick Chrome smoke](../../benchmarks/results/tooling-browser-quick-1791362887879-c7baec64.json)
  verify the harness only and are excluded from all tables below.
- [Workload specification](../../benchmarks/runtime/README.md),
  [implementation](../../benchmarks/runtime/workloads.js),
  [browser runner](../../benchmarks/runtime/browser.js) and
  [commands](../api/benchmarks.md).

All executable source fingerprints in both full artifacts match the candidate.
The workload README's public diagnostics signature was clarified after measurement;
its historical fingerprint is preserved in the artifacts. Public explanatory docs
and this report were completed after the campaigns. Historical architecture spike
and production-port datasets remain separate in [their guide](../../benchmarks/README.md).

## Environment and method

Apple M4, 10 logical CPUs, 16 GiB RAM, Darwin 24.6.0 arm64. Node v26.3.0, V8
14.6.202.34-node.20. Chrome 154.0.8037.98, browser V8 15.4.80.20, CDP 1.3,
headless foreground/visible pages, device pixel ratio 1. Chrome flags, revision,
user agent, OS and timing clock are recorded in the full artifact. This campaign
has no OS power/thermal/frequency telemetry or fixed CPU affinity.

Both campaigns use workload version 1, integer seed `0x5eed1234`, sizes 64/256,
eight warmup callbacks/batches followed by 30 measured samples, three rotated
reference/runtime/diagnostics trials per case, churn batch eight, replay length
128 roots and 60 separate memory samples. Each table timing cell is pooled
**median / p95 in milliseconds**, from 90 samples (3 × 30). Median averages the
two middle values; p95 uses nearest rank. Round medians/raw samples accompany
results; this is one local campaign, not independent-session confidence intervals.
Warmups advance state and are excluded from timing; comparisons use identical
cumulative work within each timing/probe/memory group.

All fixtures begin with N values/rows and two aliases to the first row. Selected
indices derive from the fixed seed. Public-runtime subjects import the public
entry; private checkpoint encoding/decoding and resource counters are test oracles.
The benchmark-only reference uses eager native `structuredClone` plus recursive
freezing, native retained keyed elements/full scans and a flat-log evaluator with
every root's endpoint hash. It omits general growth/admission guards, subscriptions,
nested dispatch/input/effect/routing/history features and full replay trace checks.
Runtime keyed ranges also own comment anchors/scopes absent from the reference.
Comparisons preserve fixture effects, committed versions/controls/aliases and
visible values/order/element identity, but are not equal feature sets or a
comparison with another frontend framework.

Diagnostics are off for `runtime`; `diagnostics` attaches
`createDiagnostics(app,{maxEntries:8,maxBytes:65536})`. This measures bounded
capture with truncation/eviction, not an open inspector panel, exports or the
larger default retention window. Actual counters continue after details truncate.

Independent binding callbacks change one selected property. Bursts dispatch eight
actions on that same property then render once. Keyed edits alternate a field
change, remove/insert with a new key, and last-to-first rotation at constant size.
Moving elements change N transform positions. Mount/unmount creates, mounts and
disposes a keyed app each callback. Churn attempts eight transactions, each with
48 alias writes and a reversal; every fifth throws and publishes no version.
Replay creates/imports/preflights, runs all 128 flat committed action roots with
endpoint comparisons, hashes the endpoint and disposes inside each sample.
Source recording creation is outside timing. Full replay is deliberately headless.

## Browser callback scripting

| Workload | N | Reference ms | Runtime ms | Diagnostics ms | Capture median change |
| --- | --- | --- | --- | --- | --- |
| independent-bindings | 64 | 0.300 / 0.400 | 1.950 / 2.400 | 2.150 / 2.700 | +10.3% |
| pre-frame-burst | 64 | 1.300 / 1.500 | 3.600 / 4.600 | 3.700 / 4.500 | +2.8% |
| keyed-list-edits | 64 | 0.500 / 0.800 | 2.450 / 4.000 | 2.550 / 4.200 | +4.1% |
| moving-elements | 64 | 0.700 / 0.800 | 3.050 / 4.100 | 3.400 / 4.600 | +11.5% |
| mount-unmount | 64 | 0.600 / 0.700 | 4.750 / 5.700 | 4.500 / 5.400 | -5.3% |
| transaction-churn | 64 | 1.300 / 1.500 | 4.050 / 5.100 | 5.400 / 6.100 | +33.3% |
| replay-throughput | 64 | 102.500 / 106.400 | 85.650 / 88.000 | 88.600 / 91.800 | +3.4% |
| independent-bindings | 256 | 0.700 / 1.000 | 2.500 / 3.300 | 2.600 / 3.600 | +4.0% |
| pre-frame-burst | 256 | 2.500 / 4.000 | 7.400 / 8.200 | 7.700 / 8.500 | +4.1% |
| keyed-list-edits | 256 | 0.800 / 1.200 | 3.250 / 4.200 | 4.300 / 6.300 | +32.3% |
| moving-elements | 256 | 1.100 / 1.300 | 3.600 / 4.600 | 5.700 / 6.800 | +58.3% |
| mount-unmount | 256 | 1.700 / 2.000 | 5.550 / 6.500 | 7.800 / 9.200 | +40.5% |
| transaction-churn | 256 | 2.600 / 4.300 | 8.150 / 8.800 | 12.950 / 14.800 | +58.9% |
| replay-throughput | 256 | 385.150 / 391.100 | 315.400 / 322.000 | 318.550 / 324.500 | +1.0% |

Browser work runs inside native RAF callbacks. `scriptingMs` measures synchronous
callback work; separate regions measure dispatch and explicit flush, or complete
mount/dispose. Explicit flush cancels automatic visual work. No native counter
hooks, explicit GC or memory observer run in these timing trials. Final normal-case
hash/UI/resource checks and disposal are outside timing; replay/cycle disposal is
part of the workload. Timing-call overhead is included.

At N=256 independent updates spend most time dispatching (2.450 ms median), while
one-bound-text rendering is below this clock's approximately 0.1 ms resolution.
That zero median is not zero work. Eight-action bursts still perform one native
text write, but commit/guard costs accumulate. Keyed replacement/rotation has
structural range-move costs. Updating all N styles and constructing/disposing all
scopes exposes broader lifecycle/capture costs.

At N=256 capture median changes range from +1.0% for replay to +58.9% for churn
among these cases. N=64 mount/unmount's -5.3% observed difference is trial noise,
not evidence that capture makes mounting faster. The reference is cheaper in the
non-replay cases because it lacks substantial runtime contracts; exact binding
selection does not imply cheaper total callbacks in this campaign.

| Workload (N=256) | Dispatch ms | Render/cycle ms | Three round scripting medians ms | RAF intervals ms |
| --- | --- | --- | --- | --- |
| independent-bindings | 2.450 / 3.300 | 0.000 / 0.100 | 2.550, 2.250, 2.650 | 16.700 / 16.700 |
| pre-frame-burst | 7.350 / 8.200 | 0.000 / 0.100 | 7.400, 7.400, 7.300 | 16.700 / 16.800 |
| keyed-list-edits | 2.100 / 2.800 | 1.000 / 1.400 | 3.250, 3.250, 3.250 | 16.700 / 16.700 |
| moving-elements | 2.700 / 3.400 | 0.900 / 1.200 | 3.600, 3.650, 3.600 | 16.700 / 16.700 |
| mount-unmount | 0.000 / 0.000 | 5.550 / 6.500 | 5.450, 5.600, 5.550 | 16.700 / 16.700 |
| transaction-churn | 8.150 / 8.800 | 0.000 / 0.000 | 8.100, 8.150, 8.200 | 16.700 / 16.700 |
| replay-throughput | 315.400 / 322.000 | 0.000 / 0.000 | 315.400, 315.450, 316.050 | 316.700 / 333.300 |

Phase medians/p95 cannot be added to reconstruct the overall distribution.
Intervals are between measured RAF timestamps, not traced whole-frame time, paint,
input latency or a refresh guarantee. The N=256 runtime replay median callback is
315.400 ms; its approximately 316.700 ms median interval demonstrates long blocking
synchronous work. Replaying large logs inside visual callbacks is not a real-time
frame-budget promise.

## Headless Node updates and replay throughput

| Workload | N | Reference ms | Runtime ms | Diagnostics ms | Capture median change |
| --- | --- | --- | --- | --- | --- |
| transaction-churn | 64 | 0.269 / 0.337 | 2.784 / 3.354 | 4.383 / 5.265 | +57.4% |
| replay-throughput | 64 | 111.381 / 114.989 | 91.825 / 94.592 | 95.607 / 97.462 | +4.1% |
| transaction-churn | 256 | 0.984 / 1.049 | 9.756 / 10.567 | 15.753 / 17.292 | +61.5% |
| replay-throughput | 256 | 415.415 / 434.482 | 339.288 / 359.138 | 345.794 / 354.434 | +1.9% |

Churn timings are per **eight attempted actions**, including failed candidates.
Divide by eight for attempted-action time; do not label them successful-commit
latency. N=256 runtime churn is 1.220 ms median per attempt versus 0.123 ms for the
reference. Diagnostics increases that runtime batch median by 61.5%. General
validation/indexing/ownership and repeated preview work are plausible cost sources
from the implementation, but this campaign contains no CPU/allocation profiler
that isolates their contributions. The numbers justify profiling these paths;
they do not justify changing the transaction architecture by assertion.

Replay throughput below is **128 × 1000 / pooled median sample milliseconds**,
including create/import/preflight/per-root verification/final hashing/disposal.
It is not body-only dispatch throughput. Full artifacts also contain distributions
of per-sample roots/second, whose p95 is the fast end rather than the latency tail.

| Environment | N | Reference roots/s | Runtime roots/s | Diagnostics roots/s |
| --- | --- | --- | --- | --- |
| Node | 64 | 1149.2 | 1394.0 | 1338.8 |
| Node | 256 | 308.1 | 377.3 | 370.2 |
| Chrome | 64 | 1248.8 | 1494.5 | 1444.7 |
| Chrome | 256 | 332.3 | 405.8 | 401.8 |

For these flat fixtures the runtime's replay median is lower than the eager-clone
reference in Node and Chrome, with all endpoint hashes agreeing. This result does
not compare replay systems generally or establish a novel algorithm. Runtime
trace validation and reference cloning costs differ even when checkpoints agree.

## Native writes, bindings and listeners

Probes run outside timing, with successful native CharacterData/style setters and
tree/attribute methods counted independently of diagnostics. Hooks are restored
on failure. Visible values/order/styles and retained keyed element identity are
checked after each of six probe cycles. All 42 probe groups pass; runtime without
capture has the same native write sequences as the diagnostics variant.

| N=256 workload | Variant | Boundary | Native writes | Text at step 0 | Styles at step 0 | Owned listeners after sample |
| --- | --- | --- | --- | --- | --- | --- |
| independent-bindings | reference | per callback/cycle | 1 | 1 | 0 | 1 |
| independent-bindings | diagnostics | per callback/cycle | 1 | 1 | 0 | 1 |
| pre-frame-burst | reference | per callback/cycle | 1 | 1 | 0 | 1 |
| pre-frame-burst | diagnostics | per callback/cycle | 1 | 1 | 0 | 1 |
| keyed-list-edits | reference | six-step sequence | 1, 175, 255, 1, 36, 255 | 1 | 0 | 1 |
| keyed-list-edits | diagnostics | six-step sequence | 1, 780, 765, 1, 780, 765 | 1 | 0 | 1 |
| moving-elements | reference | per callback/cycle | 256 | 0 | 256 | 1 |
| moving-elements | diagnostics | per callback/cycle | 256 | 0 | 256 | 1 |
| mount-unmount | reference | per callback/cycle | 1285 | 256 | 0 | 0 |
| mount-unmount | diagnostics | per callback/cycle | 3852 | 256 | 0 | 0 |

Independent/burst probes have one text write, zero unrelated tree/attribute/style
writes and one delegated click listener, for both N=64 and N=256. Diagnostics
observes one evaluated binding; bursts record eight dirty causes and eight
committed versions for that one evaluation/write. The reference scans N values
and also avoids writing equal strings. This proves exact work selection and
coalescing, not a DOM-write advantage over an already careful reference.

N=256 keyed edits have 780 native calls for each replacement and 765 for each
rotation in the runtime versus varying reference sequences above. Runtime moves
anchored ranges and owns scope cleanup; the reference handles only single keyed
elements. A field-only edit writes one text node. Moving-elements probes change
256 styles without structural/text writes. Mount probes include detached
construction and removal: 3,852 runtime native calls versus 1,285 reference calls
per N=256 cycle. Counters describe successful calls, not browser layout/paint cost.
Mounted fixtures own one delegated click listener; headless churn/replay and
completed mount cycles own zero. Every subject's disposal asserts all internal
owned counts are zero and its fixture container is empty.

## Separate memory and GC observations

Memory jobs run after timing. Node uses fresh `--expose-gc` children, natural GC
PerformanceObserver entries within the work interval, heap/RSS samples and separately
labeled forced collections before work, while live, and after disposal. The three
forced regions are excluded from natural event counts. Warmup precedes the
baseline; sampling/observer/JIT overhead is included. Heap high-water delta is
sampled, not total allocated bytes or the exact peak. RSS, external and backing
buffer values remain available in raw data.

| Workload | N | Variant | Sampled high-water delta MiB | Live delta KiB | Disposed delta KiB | Natural GC events | GC duration median/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| transaction-churn | 64 | reference | 4.03 | +45.8 | +193.9 | 3 | 0.058 / 0.060 |
| transaction-churn | 64 | runtime | 8.49 | +101.7 | +111.0 | 70 | 0.069 / 0.103 |
| transaction-churn | 64 | diagnostics | 84.05 | +397.6 | -66.3 | 33 | 0.168 / 3.205 |
| replay-throughput | 64 | reference | 38.50 | +241.2 | +215.3 | 520 | 0.076 / 0.139 |
| replay-throughput | 64 | runtime | 37.81 | +284.4 | +260.1 | 475 | 0.064 / 0.150 |
| replay-throughput | 64 | diagnostics | 38.85 | +298.3 | +273.4 | 448 | 0.081 / 0.159 |
| transaction-churn | 256 | reference | 3.91 | +69.2 | +213.1 | 9 | 0.040 / 0.053 |
| transaction-churn | 256 | runtime | 28.43 | +106.4 | +37.3 | 76 | 0.129 / 0.168 |
| transaction-churn | 256 | diagnostics | 120.75 | +412.9 | -93.9 | 76 | 0.524 / 0.686 |
| replay-throughput | 256 | reference | 37.08 | +380.2 | +335.1 | 1946 | 0.107 / 0.177 |
| replay-throughput | 256 | runtime | 38.57 | -51.6 | -72.5 | 1622 | 0.086 / 0.165 |
| replay-throughput | 256 | diagnostics | 45.79 | -29.7 | -68.8 | 1627 | 0.088 / 0.156 |

The N=256 churn capture profile reaches a sampled heap delta of approximately
120.75 MiB, versus 28.43 MiB with capture off, despite a bounded retained entry
window. Bounded retained JSON does not bound transient allocation or GC cost.
N=256 churn natural GC p95 is 0.686 ms with capture versus 0.168 ms without; this
profile has one run and cannot establish a long-term GC distribution. Replay
has many short GC events and retains its source recording in both baseline and
final measurements. Negative deltas reflect collector/JIT/harness variability,
not negative allocation or proof of leak freedom.

Browser profiles use fresh targets with CDP `Runtime.getHeapUsage` and
`Memory.getDOMCounters`, sampling every four work cycles. Baseline follows warmup
and a forced collection; live/disposed samples also follow forced collection.
All queried capabilities were available in this campaign; unsupported environments
produce explicit unavailable objects, not invented zero values. The N=256
observations below report deltas from that mounted/warmed baseline, not absolute
application bytes. The sampled high-water may include verification/harness
allocations because memory jobs deliberately perform checkpoint checks.

| N=256 workload | Variant | Sampled heap delta MiB | Live delta KiB | Disposed delta KiB | Live/disposed CDP nodes | Live/disposed CDP listeners |
| --- | --- | --- | --- | --- | --- | --- |
| independent-bindings | reference | 4.80 | +68.2 | +50.5 | 530 / 530 | 1 / 0 |
| independent-bindings | runtime | 7.35 | +191.2 | -271.5 | 530 / 530 | 1 / 0 |
| independent-bindings | diagnostics | 7.69 | +177.5 | -322.3 | 530 / 530 | 1 / 0 |
| pre-frame-burst | reference | 5.07 | +70.6 | +46.6 | 530 / 530 | 1 / 0 |
| pre-frame-burst | runtime | 9.71 | +222.1 | -288.2 | 530 / 530 | 1 / 0 |
| pre-frame-burst | diagnostics | 18.27 | +246.0 | -348.4 | 530 / 15 | 1 / 0 |
| keyed-list-edits | reference | 5.37 | +83.7 | +44.8 | 786 / 786 | 1 / 0 |
| keyed-list-edits | runtime | 14.25 | +346.4 | -1278.3 | 1346 / 785 | 1 / 0 |
| keyed-list-edits | diagnostics | 22.50 | +387.7 | -1360.1 | 1346 / 15 | 1 / 0 |
| moving-elements | reference | 4.67 | +86.0 | +44.3 | 786 / 786 | 1 / 0 |
| moving-elements | runtime | 11.66 | +220.6 | -2337.6 | 1556 / 15 | 1 / 0 |
| moving-elements | diagnostics | 24.16 | +227.6 | -2336.2 | 1556 / 785 | 1 / 0 |
| mount-unmount | reference | 3.62 | +71.9 | +59.9 | 15 / 15 | 0 / 0 |
| mount-unmount | runtime | 37.64 | +255.4 | +242.2 | 15 / 15 | 0 / 0 |
| mount-unmount | diagnostics | 49.54 | +350.7 | +337.5 | 15 / 15 | 0 / 0 |
| transaction-churn | reference | 4.50 | +61.2 | +41.2 | 15 / 15 | 0 / 0 |
| transaction-churn | runtime | 43.09 | +325.5 | +87.5 | 15 / 15 | 0 / 0 |
| transaction-churn | diagnostics | 31.16 | +238.3 | -120.2 | 15 / 15 | 0 / 0 |
| replay-throughput | reference | 32.58 | +56.9 | +54.4 | 15 / 15 | 0 / 0 |
| replay-throughput | runtime | 23.25 | +120.2 | +116.0 | 15 / 15 | 0 / 0 |
| replay-throughput | diagnostics | 28.90 | +123.7 | +119.6 | 15 / 15 | 0 / 0 |

Every disposed CDP listener count is zero. CDP may still count hundreds of detached
nodes after disposal, despite an empty fixture and zero owned resources; some
profiles drop to the fixture's 15 nodes. These observations include the entire
renderer, module/JIT state and evaluation/harness references. We do not interpret
either retained detached nodes or one forced collection as a leak diagnosis or
proof that all objects were collected. Timing and memory data are separate runs.
Browser natural GC pauses remain explicitly `null`; forced collector command
round-trip milliseconds include CDP transport and are **not** pause durations.
Total allocated bytes, paint time and input latency remain unmeasured.

## Regression policy and remaining scope

Measured baselines support these initial **advisory** same-environment alerts:
median scripting/update time above **1.30 ×** the matching full baseline, or p95
above **1.50 ×**, triggers investigation and a repeat full campaign. Compare the
same workload/version/size/variant/configuration and Node/Chrome/machine; a changed
environment establishes a new baseline. These margins were selected after the
three-round data, allow observed clock/trial variation, and are not CI hard failures,
cross-machine thresholds or release latency promises. Confirm an alert in a second
campaign before attributing it to a code change. No memory-byte hard threshold is
set from these single profiles; compare trends and investigate persistent growth.

Hard gates remain numeric/observable correctness: zero hash divergences, one native
text write for isolated/burst callbacks, eight burst commits, zero replacements
of retained keyed elements, zero owned resources/listeners after disposal, and
capture within its configured eight entries/65,536 serialized bytes. Focused
runtime tests cover recorder/diagnostic retention limits independently of the
benchmark's small policy. The suite does not trade any of these gates for timing.

D.7 remains the next product acceptance/release review. Stable release browser/OS
IME/system clipboard/mobile qualification, open-inspector overhead, larger/default
capture policies, larger/longer application graphs, full frame tracing, repeated
independent-session variance and allocation profiling remain outside this evidence.
Future optimization should measure guard/indexing cost, preview allocation and
anchored range movement while preserving rollback/alias/identity/disposal contracts.
No runtime optimization or strategy switch was made in this batch.

## Final candidate verification

The final [clean-copy audit](../../tests/results/auditor-1791367735919-086ac69f.json)
passes all eight commands with exit code 0: **660 runtime tests, 292 spike tests,
24 benchmark correctness tests (nine new), positive TypeScript/checked JavaScript
and 174 independently rejected negative lines, 149 Chrome checks (one new)**,
root startup smoke, reconstructed README walkthrough and empty runtime dependencies.
All **190 candidate source fingerprints** match the working tree after verification.
Local Markdown targets and `git diff --check` pass. The copy contains no old results,
Git metadata or node_modules; cached locked TypeScript installation follows initial
startup/runtime checks. This is a fresh candidate copy rather than a committed
checkout, and OS/native input qualification remains limited as documented.

Full benchmark timing campaigns remain the separate artifacts above; the audit
runs small native correctness probes, not simultaneous performance work. D.5/D.6
acceptance is complete; Batch 12 remains uncommitted pending the next requested
commit. D.7 product acceptance/release review is the next batch.
