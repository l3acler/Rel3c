# C.3/C.4 — Fixed ticks and external-input adapters

Baseline: Batch 5 commit `3a4c6b8`. ADR 0017 preceded implementation. Batch 6
adds optional owned fixed-tick clocks, next/future FIFO input admission, retained
elapsed backlog, bounded catch-up, pause/hidden epochs and fixed checkpoint
continuation. App/view adapters normalize supported values from measurements,
storage, timers and async network/effects. Cancellation/disposal aborts and
suppresses pending outcomes and removes scoped queued results.

Public entry/declarations, DOCUMENTATION.md, README/API references, PRD and
root-served public-import example are updated together. Runtime remains owned
JavaScript without dependencies; locked TypeScript is development tooling.

Verified from a fresh temporary copy with no .git, node_modules or old results.
The README auditor app is reconstructed from its literal snippets. Runtime tests
and startup run before installing the locked development dependency. Final raw
commands, environment, browser results and source fingerprints are in the
[clean-candidate artifact](../../tests/results/auditor-1791230788151-c4970703.json).

| Check | Result |
| --- | --- |
| npm test | 525 pass, including 24 fixed-tick and 15 adapter cases |
| npm run test:spikes | 292 pass |
| npm run test:benchmarks | 15 workload/correctness checks pass; no new timing claim |
| npm run test:types | Strict positive TypeScript/checked JavaScript; 127 independent negative lines reject |
| npm run test:browser | 123 Chrome checks pass, including four native tick/input fixtures and the new public example |
| npm run smoke | Root startup, public imports, runtime modules, examples and routing HTTP checks pass |
| npm ls --omit=dev | Empty runtime dependency tree |
| npm run audit:frontend -- --offline | Clean-candidate walkthrough passes; all eight command exits are zero |

Environment: Apple M4, Darwin 24.6 arm64, Node 26.3.0, TypeScript 5.9.3,
isolated Chrome 154.0.8037.93. Browser/server/profile resources are closed by the
runner. Final source fingerprints match the workspace. git diff --check passes.

Focused evidence covers 30/60/120 Hz and irregular input schedules at every
corresponding tick, retained bounded catch-up, FIFO/nested ordering, rolled-back
draws, guard/body failure recovery, queue capacity and aggregate reclamation,
fixed import conflicts/continuation, pause/hidden epochs, native frame failures,
stale callbacks after disposal, normalized browser/storage/network/timer values,
completion/cancellation races, failed/later view construction, late outcomes and
saved external-envelope forwarding without re-running live readers/effects.
Native browser checks independently exercise the frame/measurement/effect path.

Batch 5 was committed as 3a4c6b8 at user request. Batch 6 is complete and remains
uncommitted; no push/publication is included. Next is C.5/C.6.

Boundaries: application guards run when queued inputs execute; failed tick roots
retain successful prefixes and consumed clock tick, then pause. Snapshots reject
pending inputs/effects. Fixed restoration resets pause/frame/backlog while
retaining authoritative clock/PRNG/state. Saved envelope forwarding is tested,
but public recording/replay and live-source suppression are C.7–C.9 work.
Semantic input integration/interpolation remain C.5/C.6. Broad native background,
OS IME/clipboard/mobile/other-browser qualification is open. Resource counters
are not a heap-collection proof; no performance/security certification is claimed.
