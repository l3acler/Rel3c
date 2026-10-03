# ADR 0006 — Production transactions, revocation and growth limits

Status: accepted and implemented for A.2. Internal runtime contract, not a new
public transaction API or completed Phase A vertical slice.

A.3 follow-up: [ADR 0007](0007-named-dispatch-ordering.md) now integrates public
named dispatch, payload guards and FIFO queues with this internal store. Statements
below describing A.3 as future work record the A.2 milestone boundary.

Date: 2026-10-02 (Bahrain). Sources: Framework_PRD.md §3/§4/§5; ACTION-1,
STATE-1/STATE-2; A.2; ADRs 0002/0003/0005.

## Decisions

1. Apps own a production copy-on-write store in `src/runtime/state`. All runtime
   imports stay inside `src`; no spike/backend/framework dependency is shipped.
   Initial ownership, descriptor/type validation and growth policy share one
   production data module. The store is internal; application code continues
   to use public createApp. Named dispatch/payload guards/queues remain A.3.
2. Begin one transaction at a time. Reads use a revocable proxy membrane over
   mutable dummy targets, not frozen committed nodes. Make at most one writable
   shallow copy per logical node. Array methods execute natively on that view.
   Include unread aliases and all reachable edges when materializing a commit.
   Validate the complete prospective graph before recursive materialization.
3. Keep committed graphs deeply frozen and physically share unchanged branches.
   Retain app-local logical object IDs through copies, aliases and movement.
   Current reachable committed nodes and same-transaction drafts are aliases;
   other/historical changed snapshots are copied with fresh IDs. Imported caller
   graphs are descriptor-copied and memoized for that transaction, never frozen.
   Reassigning the same caller object uses its first owned import; later caller
   mutations do not silently refresh that snapshot. Foreign/stale drafts reject.
4. Successful commits publish exactly one version, including no-op data. A no-op
   may retain the same frozen root and empty invalidation metadata; version
   publication and data invalidation are separate. Abort/body/validation failure
   publishes neither state nor version. This adopts ADR 0003's production policy,
   rather than the historical raw spike's no-op version behavior. Queued named
   action semantics still require A.3, not nested raw transaction execution.
5. Emit immutable net delta metadata keyed by `(targetId, kind, key)` for value,
   own-property presence, keys and array iteration. Compare nodes by logical ID,
   primitives by Object.is. Copied ancestors are not automatically dirty; an item
   field edit need not dirty array structure. Diagnostic paths identify one
   reachable route, not every alias or a replay protocol. Subscriptions are A.4.
6. Revoke with native `Proxy.revocable` on commit, abort, commit failure and store
   disposal. This also rejects reflection and Array.isArray on leaked drafts,
   not just common reads/writes. Native revoked access throws TypeError; lifecycle
   and validation use readable FrameworkError codes. Clear import/copy/membrane
   collections on completion. Store disposal aborts active work and drops state.
7. Internal run rejects Promise/thenable results atomically and observes rejected
   same-realm native Promises. It does not execute unknown thenables, cancel async
   code, undo ambient side effects, or sandbox hostile Proxies/modified intrinsics.

## Bounded state and transaction scratch

Use fixed production guards: 128 object levels, 10,000 logical nodes, 100,000
enumerable entries, 100,000 aggregate array slots (including holes), and
1,000,000 UTF-16 string/key units. Validate initial/imported graphs via own data
descriptors, original prototypes and active/completed nodes with subtree heights.
Validate the whole proposed reachable state again before materialization, so
deeper alias grafts and draft-created cycles cannot bypass completion memoization.

A transaction starts charged for its committed graph. New imported logical
nodes/entries/slots/text add to that charge; new properties, array slot growth and
string writes add further charges before the write. Charges are monotonic within
the transaction: deleting a property, shortening an array or detaching imported
nodes does not refund scratch growth. Equal own-value writes do not charge again.
This bounds retained imports and growth/churn, rather than only the final root.
It is conservative: a transaction can reject even when its eventual root would
fit. A fresh transaction starts its charge from the current committed graph.

The same finite thresholds apply independently to the proposed committed graph.
Depth across existing aliases is enforced at commit; import depth is enforced
before copying. Array length/index growth is checked before expanding the draft.
Invalid input/limit errors may be caught by a synchronous body; safe later work
can commit if validation and remaining charge permit. Failed imports do not write
the destination or freeze caller data. A body that propagates failure rolls back.

These are not exact allocated-byte/peak-heap/history budgets, a CPU deadline,
limits on arbitrary user callbacks, or protection against externally retained
snapshots. Mutable copies, temporary materializations, Maps and proxies add
overhead. Committed history retention is a later phase. Logical ID/version gaps
from failed work are not recorded action ordering; IDs are not snapshot ref IDs.

## Evidence and alternatives

See [A.2 evidence](../reports/task-A.2-production-transactions.md) for the ported
fixtures, independent seeded oracle, growth/revocation tests, real Chrome checks
and equivalent changing-workload timing/memory observations. Full scans remain
in begin, commit validation/materialization and delta indexing. The production
port costs more than the selected spike in this run; no performance win is claimed.

Final-root-only limits allow unbounded retained scratch; silently relaxing type
policy loses graph meaning; non-native soft revocation misses some reflection.
Incremental indexing/materialization and configurable resource budgets may be
revisited with fresh correctness fixtures and measurements, not asserted now.
