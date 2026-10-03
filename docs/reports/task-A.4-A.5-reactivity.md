# A.4/A.5 verification: exact reads and lazy computed values

Date: 3 October 2026. Status: complete; approved for commit by the user.
Scope: A.4 exact dependencies and A.5 computed values only. A.6 is not started.

## Delivered behavior

- Public `app.observe(read, onInvalidate?)` establishes exact property, presence,
  key/order and array dependencies. `read()` refreshes and replaces stale sets;
  dirty notifications coalesce until consumption.
- Stable logical IDs preserve aliases and captured item reads across COW copies
  and array moves. Unrelated nested fields/items and list structure invalidate
  independently. Read facades stay current; ordinary saved snapshots stay frozen
  and historical. Removed captured nodes reject clearly.
- Public `app.computed(read)` is lazy from registration, caches consumption,
  propagates chained/diamond dependencies and replaces dynamic branches. Dirty
  values remain lazy when unobserved. Direct/indirect cycles report read chains.
- Read-only state, sync result validation, callback receiver isolation, explicit
  disposal and existing app/view scope cleanup protect ownership. Notifications
  run only after complete commits, never after rollback/no-op publication.
- Notification failures preserve the committed version and its queued children;
  sibling notifications/actions complete before errors reach outer dispatch.
  App disposal stops the graph before scoped/user cleanup.

## Dependency-order evidence

A.4 was implemented and validated before A.5: its initial 19 focused checks and
all 165 runtime tests passed, as did the root startup smoke and existing type
suite (46 negative lines). Computed implementation then used the validated graph.
Final review added A.4 cases for custom iterator-named array fields, invalid
callbacks and callback receiver isolation; final totals below include these.

## Final verification

| Command | Result |
| --- | --- |
| `node --test tests/reactivity.test.js tests/computed.test.js` (included in `npm test`) | 45 focused cases: 22 A.4/shared and 23 A.5 |
| `npm test` | 191/191 runtime cases, no failures |
| `npm run test:spikes` | 292/292 unchanged architecture-spike cases |
| `npm run test:benchmarks` | 15/15 workload/equivalence/quantile checks; no timing claims |
| `npm run test:types` | Positive TS and checked JS pass; 55 independently verified negative lines |
| `npm run test:browser` | 49/49 isolated Chrome checks, including 10 new public reactivity scenarios |
| `npm run smoke` | Public observer/computed consumption and root server/module/example startup pass |
| `npm ls --omit=dev` | Empty runtime dependency tree |
| `git diff --check` and local documentation-link check | Pass |

Total Node correctness coverage: 498 checks across runtime, spikes and workload
suites. Browser evidence: [final source-fingerprinted raw result](../../tests/results/app-lifecycle-1791048572171-0ef6c712.json).
The runner hashes the production modules and browser fixtures; hashes match the
final runtime. The root example still uses public imports without manual DOM
patches/listeners. Node checks also cover 100 repeated app/graph disposal cycles.
These behavior/count checks are not a heap-leak proof.

Environment: Apple M4, darwin 24.6.0 arm64,
Node v26.3.0, Chrome/154.0.8037.93; TypeScript 5.9.3 is development-only.
Browser profiles and ephemeral localhost servers are isolated and cleaned by the
runner. Startup/browser checks required the sandbox's localhost/browser execution
permission. A first sandbox-only startup attempt failed with `listen EPERM`;
the permitted run passed. No test/acceptance failures remain.

## Documentation and review

Updated root [public guide](../../DOCUMENTATION.md), [README](../../README.md),
[application API](../api/application.md), new [reactivity API](../api/reactivity.md),
[ADR 0008](../adr/0008-exact-reactivity.md), PRD v2.5 implemented status and
[development plan](../../DEVELOPMENT_PLAN.md). A.4 and A.5 are checked complete;
A.6 remains unchecked. The user requested a commit after implementation and
verification. This commit includes the framework, documentation, focused tests
and final browser evidence. The existing AGENTS.md edit and intermediate browser
results remain outside the implementation commit.

An external commit made during implementation was previously undone with a mixed
reset at the user's request; all 143 saved file hashes matched immediately after
that reset. The subsequent commit request supersedes the original instruction
to leave the batch uncommitted.

Primary runtime diff: `src/runtime/reactivity/tracking.js`, app/context ownership
in `src/runtime/app.js`, post-commit delivery in `actions/dispatch.js`, public
metadata/declarations and public-import Node/browser/type/smoke fixtures. The
transaction algorithm and existing limits are unchanged.

## Remaining limits

- Mounted text still runs once; declarative DOM, frames, keyed DOM, events and
  routes remain later tasks. No DOM updates are claimed by this batch.
- Dependencies are local to one app. Metadata (`dirty`/`stateVersion`) and saved
  ordinary snapshots are not reactive reads. Descriptor reflection tracks
  presence; direct property reads are required for value subscriptions.
- Read facades are current-state views rather than immutable historical values;
  removed nodes reject. Ordinary derived objects are cached by reference and
  should be treated as immutable. Equal derived results still invalidate when
  their inputs change, preserving lazy evaluation.
- Only isolated installed Chrome is qualified here; broad browser/IME acceptance
  remains later work. Async user effects cannot be rolled back/cancelled.
- Graph indexing/subscription retention are not benchmarked in this batch; no
  speed, allocation, GC or memory improvement is asserted.
