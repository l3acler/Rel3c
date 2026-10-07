# D.3/D.4 qualification: bounded diagnostics and development inspector

Date: 7 October 2026. Baseline: Batch 10 commit `16305d8`, committed at the
user's request before this batch. Batch 11 adds experimental tooling; no push.

## Delivered behavior

`createDiagnostics(app,options?)` explicitly attaches one optional bounded session.
It groups live/replayed dispatch/input/tick/time roots and history restores,
captures actual transaction deltas/dirty resources/dependency-to-binding edges,
evaluations and successful renderer mutations, and observes simulation/render/
RAF timing outside authoritative services. Completed/scratch details and value
previews are bounded; omitted details/evictions/capture failures are visible.
Full application graphs/native handles/errors are not retained in summaries.
Session/app disposal clears its data and source references.

`createInspector({diagnostics,target?,history?,onExport?})` owns a separate
declarative framework app. It offers native transition selection, explicit refresh,
input/change/dependency/work details, owned resources/queues/performance observations,
included-value disclosure and explicit diagnostic/full-recording exports. Optional
history buttons explicitly seek/undo/redo under the existing policy. UI previews
are limited; full exports return to the caller/synchronous export hook. Panel
disposal releases only its own resources/references. Public imports/example,
declarations, README/root guide/API, PRD v2.21 and ADR 0022 are updated together.

## Verification

Final evidence: [clean-copy audit and embedded browser artifact](../../tests/results/auditor-1791360018476-61fbdbbd.json).
All eight commands exit 0; all **174 source fingerprints** match the final workspace.
The audit copies the candidate without `.git`, `node_modules` or previous results,
reconstructs the routed app from README and starts from the root before installation.
It is a candidate copy, not a committed clean Git checkout.

| Command | Result |
| --- | --- |
| `npm test` | **660 runtime checks**, including 16 new diagnostic/inspector cases |
| `npm run test:spikes` | 292 passing spike checks |
| `npm run test:benchmarks` | 15 passing benchmark correctness checks; no new timing measurements |
| `npm run smoke` | Public imports, root server/startup/routes/MIME types pass before install |
| `npm ci --ignore-scripts --offline` | Pinned TypeScript dev dependency installs from cache |
| `npm run test:types` | Positive strict TS/checked JS pass; **174 independent negative lines** reject |
| `npm ls --omit=dev` | Empty runtime dependency tree |
| `npm run test:browser` | **148 Chrome checks**, including four native inspector fixtures and one public example/Enter fixture |

Environment: Apple M4, Darwin 24.6.0 arm64, Node v26.3.0, TypeScript 5.9.3,
Chrome/154.0.8037.98 in the harness's isolated fresh profile. Node standard-library tools
provide testing/serving/CDP automation; no frontend/state framework supplies runtime
behavior. The final artifact records browser flags, commands/raw output and sources.

The README and guide inspector snippets were separately executed through public
imports with browser doubles and both cleaned up. Local Markdown links and
`git diff --check` pass. A wide 1,000-value tracked read retains only 32 sampled
property edges with its full dependency count. The public example was visually
reviewed in a local Chrome screenshot: labels, transition control, details/resource
textareas and explicit export controls fit and remain usable.

 Focused tests exercise optional/off attachment, exact coalesced
writes, actual input/value previews, nested FIFO/rollback/discard, fixed tick and
replay grouping, count/byte/truncation/eviction limits, unavailable observation
clocks, descriptor-only previews, unchanged recorder bytes/hashes, explicit
exports and errors, history integration and repeated source/session/panel disposal.
Native Chrome additionally checks frame timestamps/intervals, exact independent
bindings, keyed focus/selection/native form writes, panel controls/exports/history
policy and trusted Enter activation in the public example.

## Limits and remaining work

Byte bounds describe serialized entry data, excluding snapshot envelope/current
summaries and JS object overhead. Preview limits can omit values/edges; diagnostic
exports are inspection data and have no replay/import contract. Capture failures
are isolated from authoritative execution. Explicit refresh avoids source-driven
inspector polling; no inspector polling/observer/timer handles are created.
Disposed resource counters are correctness evidence, not a heap-leak/GC proof.

Observed duration/frame intervals make no speed, novelty, overhead or refresh-rate
claim. D.5/D.6 must establish reproducible equivalent-work workloads, instrumented
and uninstrumented baselines and the performance report. Chrome desktop fixtures
do not qualify OS IMEs, system clipboard paste, mobile or other browsers. User
action/view/export callback code remains ordinary JavaScript, with the existing
ambient-value responsibility. Native event/recording limits remain documented.
