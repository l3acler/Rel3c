# Task A.2 — Production transaction evidence

Completed: 2026-10-02 (Bahrain). [ADR 0006](../adr/0006-production-transactions.md)
records the implemented internal contract. Public lifecycle documentation remains
in [application API](../api/application.md).

## Delivered and boundaries

Applications now own the production copy-on-write engine under src/runtime/state.
It owns frozen state, runs deep transactions against native-revocable drafts,
atomically commits or rolls back, preserves aliases/stable logical IDs/untouched
physical branches, and produces immutable net property/presence/key/iteration
metadata. Successful commits advance one version even for no-op data; failures
publish none. Disposal aborts active work and drops owned state.

Initial ownership and assignments share original-prototype/descriptor validation.
Active/completed DAG traversal preserves sharing, detects cycles and checks
subtree heights on deeper aliases. Commit validates the complete proposed graph
before materialization. Guarded graph construction/growth caps 128 levels,
10,000 logical nodes, 100,000 entries, 100,000 aggregate array slots and 1,000,000
UTF-16 string/key units. Transaction charges are monotonic and include detached
imports/growth; deleting or shrinking does not refund scratch. These are
conservative logical guards, not exact heap/history/CPU budgets.

No runtime module imports spikes or external dependencies. Test-only ports/oracles
and development benchmarks may use spike fixtures. Existing spike implementations
and historical measurements are unchanged. Public exports do not include the
transaction store/begin/run; named action bodies still do not execute through
the application API. Payload guards/ownership, nested dispatch queues, reactive
subscriptions/computed values, DOM bindings/events/routing and replay remain later
gates. The root example still renders one lifecycle report through public imports.

## Verification

Commands:

```sh
npm test
npm run test:spikes
npm run test:benchmarks
npm run test:types
npm run test:browser
npm run smoke
npm run bench:runtime
npm ls --omit=dev
git diff --check
```

- **424/424 Node tests pass:** 31 public lifecycle checks, 86 production transaction
  checks, 292 unchanged spike checks and 15 workload checks (seven new runtime/
  spike equivalence checks). The suites can also run together with node --test.
- Ported all **28 transaction fixtures**, the **18 identity regressions**, **five
  type-policy cases**, and **12 seeded oracle cases**. The production ports use
  FrameworkError codes/native revoked TypeError and successful no-op versions;
  they do not adapt runtime errors back to spike behavior.
- The independent native model runs **12 seeds × 160 = 1,920 programmed attempts**
  plus **960 recovery no-op commits**. It verifies native state/aliases/prototypes/
  holes/key order, snapshot isolation, persistent IDs and net invalidations after
  successes, throws, explicit aborts, thenables, invalid types and draft cycles.
- **23 new production boundary tests** cover physical sharing, historical/foreign
  snapshot imports, wrapped/current/foreign/stale drafts, reflected revocation,
  disposal, immutable metadata, negative zero, DAG descriptor counts and depth
  grafts. They test scalar/property/node/text/sparse-slot limits, discarded imports
  and length churn, caught-error recovery, rollback and post-await mutation.
  Native copyWithin/fill/unshift/pop/slice/spread, scalar array-length conversion,
  invalid length errors and throwing sort comparators preserve atomic array work.
  A 31-node imported DAG has 61 descriptor inspections and zero ordinary value
  gets. It is a traversal observation, not an arbitrary Proxy sandbox guarantee.
- **45 negative type lines reject**, positive TS/checked JS pass with TypeScript
  5.9.3 and no emit. No new public mutation surface/declarations were added.
- **33/33 real Chrome checks pass:** the prior 27 lifecycle/root checks plus six
  internal-engine checks for atomic publication/rollback, arrays/aliases/identity/
  sharing, exact metadata/freeze, no-op versions/reflection revocation, growth
  limits and illegal native async work. [Final fingerprint evidence](../../tests/results/app-lifecycle-1790972441405-bd843470.json).
- Root startup smoke serves the public entry and every new runtime module with
  correct MIME types; imports/create/dispose and the default #app example pass.
  Runtime dependency tree remains empty. Source fingerprints and local docs links
  are checked; user ADR 0001 edits are preserved. No commit or push is requested.

The browser skill could not discover an available browser after troubleshooting.
Verification used the repository's approved isolated Chrome runner, without a
signed-in profile or third-party browser library; its server/profile were cleaned
up. Synthetic Chrome coverage is not cross-browser, real IME, heap-leak, replay or
whole-frame performance qualification.

## Equivalent changing-workload remeasurement

The accepted spike and production port run the same seven workload bodies and
initial graphs at 128/1,024 rows. All final alias/identity-aware state hashes,
versions and aggregate net invalidation totals match. These workloads actually
change state (or throw); no-op versions/resource-limit policy intentionally differ
outside the measured inputs. Creation, closure construction and final hashing are
outside timing; begin/body/validation/materialization/freezing/metadata/errors are
included. The port retains full scans, not an unmeasured incremental index.

[Final Node dataset](../../benchmarks/results/runtime-node-1790971933166-d5bb2b13.json):
84 timing trials / 5,040 samples, three rounds, 12 warmups / 60 measured updates,
and 28 separate 30-update memory/GC profiles. Engine order alternates by round.
The final collection ran without concurrent agent test/browser/benchmark jobs.
An [earlier exploratory run](../../benchmarks/results/runtime-node-1790971744988-017ba3a6.json)
is retained but not pooled into this report; its early trials overlapped Node
correctness tests.

At 1,024 rows, pooled median / p95 transaction milliseconds:

| Workload | Selected COW spike | Production COW |
| --- | --- | --- |
| Sparse nested | 2.484 / 2.805 | 3.407 / 4.290 |
| Repeated writes | 2.496 / 2.842 | 3.453 / 4.294 |
| Dense updates | 4.206 / 5.067 | 6.145 / 7.755 |
| Insert/replace | 2.867 / 3.703 | 3.927 / 5.272 |
| Reorder | 3.686 / 5.839 | 5.081 / 6.119 |
| Alias edits | 2.573 / 3.293 | 3.633 / 4.584 |
| Rollback | 0.848 / 2.733 | 2.230 / 2.624 |

The production port is slower in every median in this run. Source inspection
shows additional descriptor/budget validation and native proxy/scratch handling;
these are plausible contributors, not measured CPU attribution. No universal
speedup, release latency target or browser timing claim is made.

Memory observations are mixed. At 1,024 rows, sampled heap high-water deltas in
MiB (spike/production) are about 14.96/16.48 sparse, 66.88/62.76 dense,
71.74/40.41 reorder, 15.41/46.45 aliases and 35.57/7.97 rollback. Natural GC counts
are respectively 26/19, 14/16, 12/16, 26/14 and 5/19. Dense natural-GC median/p95
is about 0.613/3.772 ms for the spike and 0.561/3.029 ms for the port. Both allocate
and collect; one separate profile per case is noisy and cannot establish a
memory win or leak. Retained deltas include JIT/harness noise and can be negative.
Exact allocated bytes/peaks, retained histories and browser GC are not measured.

Environment: Apple M4, 10 cores, 16 GiB, Darwin 24.6.0 arm64; Node v26.3.0 /
V8 14.6.202.34-node.20; TypeScript 5.9.3 development-only; headless Chrome
154.0.8037.93 / V8 15.4.80.19 for correctness. Raw datasets record source SHA-256,
sample/round detail, configuration, machine, heap samples and GC events.

## Next

A.3 integrates named dispatch, payload ownership/guards and FIFO/error/parent-abort
queue policy. A.4 adds subscriptions to the tested metadata; later Phase A tasks
add computations, binding rendering, frames, keyed views and scoped events.
Public action/schema/state semantics remain experimental. No A.3 implementation,
commit, push, optimization claim or public transaction escape hatch is included.
