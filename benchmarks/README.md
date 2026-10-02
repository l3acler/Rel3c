# Architecture spike measurements

Task 0.6 measures internal transaction engines. These benchmarks do not implement or measure a frontend renderer. The eager full-clone reference is an equivalent-work baseline; it is not a comparison to React, Vue, or another framework.

Task 0.7 is a separate syntax/DOM prototype measurement, not part of the transaction suite below. Run `npm run check:view-syntax` for browser correctness and rotated element/token-template/eager-template mount/update/reorder/disposal trials. See the [syntax report](../docs/reports/task-0.7-view-syntax.md) for its configuration, raw evidence, cache microprobe and limits. Collect measurement runs without concurrent test/benchmark jobs.

## Run from the root

```sh
npm run test:benchmarks
npm run bench:spikes
npm run bench:spikes:browser
```

Use `-- --quick` on either benchmark command to verify the harness with a small sample set. Quick artifacts are smoke checks and are not the published full-run dataset. Runs write unique, non-overwriting JSON files under `benchmarks/results/` and print their paths.

The Node suite uses Node's built-in modules, fresh child processes, and an eager-clone/COW/staged comparison. Clean timing trials do not enable explicit GC or a memory observer. Separate `--expose-gc` children collect heap/RSS samples, natural GC entries, and separately labeled forced collection times. Exact allocated bytes and exact heap peaks are not available; sampled heap high-water deltas are an allocation/churn proxy, and retained deltas include harness/JIT/observer noise.

The browser suite starts a localhost server and an isolated headless Chrome with a temporary profile, then runs the same actions inside real animation-frame callbacks. Chrome must be installed; the default macOS path is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and the default Linux path is `/usr/bin/google-chrome`. Override with `MINI_FRAMEWORK_CHROME_PATH` if needed. It uses Chromium's debugging pipe with Node's built-in child-process support, closes its browser/server, and removes only the temporary profile it created. No browser-automation packages or runtime dependencies are added.

Browser measurements are callback scripting time and rAF timestamp intervals, not total traced frame cost or paint latency. The harness performs no framework binding/DOM rendering. Chromium heap observations are not retained-memory measurements. Browser GC pause instrumentation is unavailable in this harness and is reported as `null`, rather than inferred from frame stalls.

## Workloads and configuration

All engines start with identical nested objects, an array of rows, and aliases to its first row. Deterministic indices depend on the update number; no ambient randomness enters actions. Array insertion replaces one row at a time to keep size bounded. Reorder reverses the array. Rollback edits nested/item fields and reorders, then throws the same pre-created error.

| Workload | Mutations per transaction |
| --- | --- |
| `sparse-nested` | One deeply nested counter increment |
| `repeated-writes` | 24 increments to that counter |
| `dense-updates` | Increment every row's count |
| `array-insert` | One insert/removal through splice, keeping array length constant |
| `array-reorder` | Reverse row positions with identities retained |
| `alias-edits` | Three increments through different aliases to one logical row |
| `rollback` | Nested/item changes and reverse, then throw without publication |

Default Node configuration: row counts 128/1,024; 12 warmup updates; 60 measured updates; 3 independent timing trials per engine/workload/size; one separate 30-update memory profile after 12 warmups. This is 126 timing trials and 42 memory trials.

Default browser configuration: row counts 128/1,024; 8 warmup frames; 30 measured frames; 3 trials per engine/workload/size, in one isolated browser process/tab. This is 126 trials. Both suites rotate engine order by round and run cases sequentially. Do not run the suites concurrently when collecting a report.

Actions/closure creation, source hashing, final canonical state hashing, file output, and report construction are outside timing samples. Timed work includes transaction initialization, action body, validation, materialization, freeze, net metadata, and failure handling. Raw samples are retained; medians use the usual middle-value average, and p95 uses nearest rank. Reports retain round medians to expose variation rather than averaging away slow trials.

Each group checks matching SHA-256 of alias/identity-aware state, committed versions, and aggregate invalidation counts. The workload tests independently check state/graph and exact per-property invalidations against native JavaScript. Checksums describe these workloads; they are not a production replay-format commitment.

Raw JSON records source SHA-256 fingerprints, full configuration, environment/browser versions, order, samples, heap traces, GC events, and summary values. See the [task 0.6 report](../docs/reports/task-0.6-measurements.md) for the collected dataset and interpretation. Engine selection is a later ADR gate; these measurements alone do not select a public implementation.
