# Incremental recorder accounting

The recorder caches canonical UTF-8 sizes of immutable records and snapshot
points, sums retained record bytes/charged actions, and accounts array commas
separately. Admission serializes a small metadata envelope with normalized
`status:'active', reason:null` and the unchanged 256-byte reserve. Replacing two
`null` placeholders subtracts eight bytes before adding baseline/end sizes.
Counter digit changes are included on each refresh. Export still serializes the
original complete wire. No public API, recording version, replay contract, policy
limit or application dependency changes are involved.

Session rejection pops the provisional charge and restores the end. Recent
mode saves rollback state only when eviction is necessary, subtracts removed
charges, and restores totals/counters on baseline rejection. Weakly held sizes
allow removed points/records to be collected. Disposal zeros cached totals.

## Reproduce

```sh
node scripts/bench-recording.js
```

The script warms 150 updates, then measures 1,200 identical updates without
recording followed by 1,200 with session recording. A 15×15 compact integer tile
grid, four players and twelve bombs model authoritative updates at 20/s for 60
simulated seconds without wall-clock waiting. Each update carries a new frame,
positions, fuse values and Unicode/escaped event text. Payload construction and
status reads occur outside dispatch timing. Both variants run the same actions.
Policy: 2,000 action slots, 67,108,864 bytes, checkpoint interval 64; all 1,200
roots must remain active and retained. The script validates canonical export
round-trip and public replay equality against the final source snapshot.

To compare an older source revision, copy this script into that revision's
`scripts/` directory in a separate temporary checkout. For the original slow
recorder use `BENCH_STATUS_READS=10 node scripts/bench-recording.js`; the default
10,000 final status reads would take several minutes there. Timing windows contain
updates 1–200, 501–700 and 1001–1200. No other benchmarks/tests ran concurrently
with the reported dispatch measurements.

## Measurements

Environment: Node v26.3.0, macOS (`darwin`) arm64, Apple M4. Baseline revision:
`c7ad9e2b90a2a9b727673e2cab2f8cdb0885e5be`. One run per variant, same host.
Raw aggregate results: [original](../../benchmarks/results/recorder-accounting-before.json),
[incremental](../../benchmarks/results/recorder-accounting-after.json).

| Window | Retained bytes | Original dispatch median / p95 ms | Incremental dispatch median / p95 ms | Incremental recording overhead median / p95 estimate ms |
| --- | ---: | ---: | ---: | ---: |
| Early | 4,476,958 | 4.487 / 7.519 | 1.172 / 1.395 | 0.628 / 0.791 |
| Middle | 15,638,300 | 21.284 / 25.078 | 1.165 / 1.350 | 0.627 / 0.755 |
| Late | 26,811,883 | 37.806 / 42.357 | 1.161 / 1.286 | 0.626 / 0.698 |

Original recording overhead estimates were 3.934/6.879, 20.741/24.448 and
37.275/41.676 ms respectively. The unrecorded median was about 0.53–0.55 ms
in both runs. “Overhead” subtracts unrecorded median from recorded median and
unrecorded p95 from recorded p95; these differences of quantiles are **not**
paired overhead latency percentiles. Final cached status reads averaged 0.044 µs
(10,000 reads); original reads averaged 36,377 µs (10 reads). Microbenchmarks can
be optimized by the engine; regression tests separately forbid serialization and
retained-record reductions during repeated status/count reads. Ordinary admission
is also checked against serializing any nonempty retained-record array.

These results demonstrate flat ordinary admission cost for this fixed-size
workload as retained history grows. They do not qualify the game itself, browsers,
heap retention or arbitrary payloads. Capture, hashing, graph encoding and measuring
new snapshots/records still scale with current state/payload size. Recent eviction
still searches/removes segments and prepares an array for rollback; that path can
scale with retained record count. Explicit export/import/replay remain proportional
to history. The benchmark intentionally tests session retention without eviction.
No history is downsampled or discarded to obtain these results.

## Verification

Recording tests compare cached totals with an independent full-wire
`Buffer.byteLength(JSON.stringify({...wire,status:'active',reason:null})) +
STATUS_RESERVE` oracle and a retained-action reduction. Existing Unicode, graph,
checkpoint, failure, session/recent, oversized-root and lifecycle fixtures now
exercise that oracle through their import helper. Added cases cross 9/10, 99/100
and 999/1000 sequence/counter boundaries, exact byte/action limits, capture/codec
failures, normal and oversized baseline rejection, and repeated status/count reads.
Export/import/replay fixtures and benchmark final replay cover compatibility.

Validation: `npm test` passed all 678 tests; `npm run test:types` passed positive
TypeScript/JavaScript checks and rejected 174 negative cases; `npm run docs:check`
passed. `git diff --check` passed. The repository audit
(`npm run audit:frontend -- --checkout --offline`) also passed Node, spike and
benchmark fixtures before stopping at startup smoke: this sandbox rejects
listening on 127.0.0.1 with EPERM. Separate `npm run test:browser` and
`npm run check:view-syntax` attempts hit the same restriction. Startup, browser,
view-syntax and the remainder of the full audit must be repeated in an environment
allowing a local server.
