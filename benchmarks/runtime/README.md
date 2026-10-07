# Reproducible runtime tooling workloads — D.5/D.6

Run from the root, sequentially with other tests/benchmarks stopped:

```sh
npm run test:benchmarks
npm run bench:tooling:node
npm run bench:tooling:browser
```

Add `-- --quick` for harness verification only. Full and quick runs write separate,
unique non-overwriting JSON artifacts in `benchmarks/results/`. These commands add
no dependency: Node standard-library modules provide processes, serving, timing,
source hashes and Chrome CDP automation. The browser runner uses installed Chrome
through `scripts/local-browser.js`; set `MINI_FRAMEWORK_CHROME_PATH` if needed.
It uses a fresh temporary profile, foreground pages and cleanup on failure.
The framework subjects consume public exports; the deliberately limited reference,
checkpoint oracle, native probes and resource verification are benchmark internals.

## Work and comparisons

Each fixture starts with the same values/rows and two aliases to the first row.
Indices derive from a fixed integer seed `0x5eed1234`; no ambient randomness enters
state. Same source action bodies, payloads, initial control state, versions and
alias-preserving checkpoint hashes must agree across three variants:

| Variant | What it supplies |
| --- | --- |
| `reference` | Benchmark-only eager native `structuredClone`/recursive freeze transactions; retained keyed native DOM with whole-view scans; flat-log endpoint-hash evaluator |
| `runtime` | Public app/action/binding/keyed/lifecycle/replay APIs with diagnostics off |
| `diagnostics` | The same public runtime plus bounded `createDiagnostics(app,{maxEntries:8,maxBytes:65536})` during work |

The reference covers this ordinary fixture domain, not arbitrary framework state
contracts. It omits general growth/admission guards, reactive subscriptions, nested
FIFO, routing/effects/history/inspector and full replay trace comparison. Reference
and runtime preserve visible values, order, stable keyed elements and checkpoint
state/control/version on these workloads. Keyed runtime ranges have comment anchors
and nested scope cleanup; the reference keeps one element per row, so structural
native-operation counts can differ. This is a limited equivalent-work reference,
not another frontend-framework comparison or a general replacement architecture.

| Workload | Per measured browser callback |
| --- | --- |
| `independent-bindings` | Increment one selected array property; render one dependent text binding among N values |
| `pre-frame-burst` | Eight committed actions on one selected property, then one render |
| `keyed-list-edits` | Alternate one item-field edit, one remove/insert with a new key, and rotation; size stays constant |
| `moving-elements` | Update every row's transform position and render all N styles |
| `mount-unmount` | Create, mount and dispose a keyed view with a delegated click handler; verify cleanup |
| `transaction-churn` | Headless eight attempted transactions; each performs 48 writes through two aliases and reverses rows; every fifth throws and rolls back |
| `replay-throughput` | Create/import/preflight, replay 128 valid flat one-action roots with endpoint hashes, final hash and dispose; recording creation outside timing |

Full configuration: sizes **64/256**, **8 warmup / 30 measured samples**, **3
rotated trials per variant/case**. Node covers headless churn/replay in a fresh
process per trial (36 timing trials, 12 separate memory children). Browser covers
all seven workloads in a fresh foreground target per trial (126 timing trials,
42 native correctness probes and 42 separate memory targets). Both use 60 memory
samples, churn batch 8 and replay length 128. Browser profiles sample heap every
four work samples. Quick config: sizes 16/64, 2 warmup/6 measured, one trial,
churn batch 4, replay length 16, eight memory samples. Warmups advance deterministic
state and are excluded from timing; hashes compare identical cumulative work.

## What the numbers mean

Browser `scriptingMs` measures synchronous work in real RAF callbacks. Separate
`dispatchMs` and `renderMs` measure action work and explicit flush (or complete
mount/dispose); measurements include timing-call overhead. Automatic rendering is
cancelled by explicit flush. RAF timestamp intervals are recorded but are not
input latency, display refresh, total traced frame time or paint time. Final
hashing/UI validation/output are outside timing; replay's mandatory verification,
final hash and disposal are inside replay samples. Mount/unmount retains only one
caller-owned frozen state for a checksum outside timing. Diagnostics captures
truncated details while all actual counters continue; overhead applies to that
specified retention policy, not an open inspector UI.

Native method/setter probes run separately, restore patches on failure, verify
successful text/tree/attribute/style calls against diagnostic counters, assert
one independent/burst text write and preserve retained keyed identity. Probes
include construction/removal on mount cycles; normal case construction occurs
before their counter hook. Owned listener counts and queue/resource counts are
recorded; these count framework handles, not all browser internals.

Memory is a separate observation, with no memory observer/forced GC/native hooks
in timing. Node `--expose-gc` children report sampled heap/RSS, live/post-disposal
retained deltas, natural GC counts/durations inside the work interval and separately
labeled forced collections. Browser CDP reports heap and DOM/listener observations
before/live/after disposal and separately labeled forced-GC command round trips.
Browser natural GC pauses remain `null`; command round trips include transport
and are not pause durations. Missing CDP capabilities are explicit unavailable
objects. Both include harness/JIT/modules/observer overhead. Heap high water is
sampled, not allocated bytes/exact peak; positive or negative retained deltas do
not prove a leak or leak freedom.

Artifacts record environment/browser versions/flags, seed/workload version,
source SHA-256 fingerprints, configuration/order, raw timing/interval samples,
round medians, median/p95/min/max, state hashes, native probes and memory/GC data.
Source changes during a campaign abort it. Median uses the middle-value average;
p95 uses nearest rank. Compare full campaigns on the same environment; never
pool smoke runs, sizes, environments or differently instrumented variants.

See the [public guide](../../DOCUMENTATION.md#reproducible-benchmarks) and
[technical report](../../docs/reports/task-D.5-D.6-performance.md). The historical
transaction spike/port datasets remain separate under the parent benchmark guide.
