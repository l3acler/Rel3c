# Task A.3 — Named dispatch and ordering evidence

Completed: 2026-10-03 (Bahrain). [ADR 0007](../adr/0007-named-dispatch-ordering.md)
specified the ordering/error/budget decisions before implementing them.

## Delivered

Public `app.dispatch(name, ...args)` and immutable registered wrappers now execute
named synchronous bodies through the A.2 transaction store. Validate exact names
and arity, copy/freeze payloads using descriptor-based supported-data validation,
then require a synchronous guard result of exactly true. Guard and action async
returns reject; same-realm native rejected Promises are observed, including native
Promises with a shadowed non-callable `then`. Arbitrary thenables are not executed.

Success publishes one version (no-ops included); body/final-graph failure publishes
none and revokes the draft. Retained view-context getters read latest committed
state. Payloads preserve acyclic aliases, holes, distinct identity, null prototypes
and negative zero without freezing or retaining caller data as owned state.

Nested requests capture validated payloads immediately but wait for their parent's
successful commit. FIFO execution places grandchildren after existing siblings.
Failed parents discard children; failed children discard their descendants and
continue siblings. The outer call throws one original error or ordered aggregate
after draining; committed ancestors/siblings remain. Non-Error single failures
normalize at the lifecycle boundary. Error callbacks see completed state once per
batch; reusing the same thrown Error reports on subsequent batches too.

Dispatch during view mounting, guards or error reporting rejects. Mount/dispose
during a dispatch batch rejects, avoiding store disposal and partial-state error
callbacks. Batches admit at most 1,024 actions with aggregate payload node/entry/
slot/text bounds. Charges include consumed/discarded requests and reset for each
new outer call. Exact limits and admission/error recovery appear in the
[public API](../api/application.md).

The public declarations now return void while retaining correlated names/payloads
and read-only state/payloads. The root public-import example executes initialize
before mounting; smoke verifies a public payload action and serves the new module.
Runtime imports still contain no spike modules or external framework dependencies.

## Verification

```sh
npm test
npm run test:spikes
npm run test:benchmarks
npm run test:types
npm run test:browser
npm run smoke
npm ls --omit=dev
git diff --check
```

- **146/146 runtime/public Node tests pass:** 31 lifecycle, 86 transaction and
  **29 new dispatch tests**. These cover guards, exact modes/arity, data ownership,
  reflection-safe revocation, rollback, thenables/native async/post-await writes,
  aliases/reorders/unchanged branches, complete committed reads, captured nested
  payloads, FIFO order, all parent failure modes, child/descendant failure,
  single/multiple errors, admission recovery, lifecycle reentrancy, per-batch
  reporting, queue limits and aggregate payload accounting/recovery.
- **292/292 spike and 15/15 workload tests pass** (453 total Node tests).
  Existing transaction equivalence and independent seeded oracles still pass.
- Positive TypeScript and checked JavaScript pass with **46 independent negative
  lines rejected**, including the new unsupported action-result receipt case.
  TypeScript 5.9.3 emits no application code.
- **39/39 real Chrome checks pass**, including six new public-dispatch checks.
  They cover committed context/snapshot state and rollback with native focus/
  selection, payload graph semantics/getter rejection, FIFO ordering, child
  failure/sibling continuation, Promise rejection/deferred draft mutation and
  bounded self-dispatch with recovery. Root initialization, default mount and
  disposal use public imports only. [Final fingerprinted browser evidence](../../tests/results/app-lifecycle-1791045705758-294f30fe.json).
- Root startup smoke, empty runtime dependency tree and whitespace checks pass.
  Local documentation links and final browser source fingerprints are verified.

Environment: Apple M4, 10 cores; Darwin 24.6.0 arm64, Node 26.3.0; installed
headless Chrome 154.0.8037.93. The repository runner uses an isolated temporary
profile and localhost server, both cleaned up afterward. Chrome/server runs
require execution outside the filesystem/network sandbox; no signed-in profile,
third-party browser library or in-app Browser control is used.

## Boundaries and next task

Text views still run once per mount. Actions do not yet update DOM, and no public
reactive subscriptions exist; committed reads inside bodies/guards and terminal
error callbacks establish the complete-state boundary for future observers.
Batch errors may follow successful commits; a whole batch is not one transaction.
Callback ambient side effects cannot roll back, and illegal async code cannot be
cancelled. Resource limits are logical work/retention guards, not exact heap, leak
or CPU measurements. No performance improvement is claimed or benchmark strategy
changed in A.3. Cross-browser/IME, controlled services, recording and replay remain
later gates. A.3 is committed at the user's request; no push is included.

Next: A.4 property/presence/key/array dependencies and dynamic subscriptions;
computed values and DOM bindings follow A.5/A.6.
