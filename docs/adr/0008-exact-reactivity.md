# ADR 0008: Exact committed reads and lazy computed values

- Status: accepted, experimental A.4/A.5 implementation
- Date: 3 October 2026
- Scope: precise subscriptions, derived values and their existing lifecycle ownership

## Context

A.2's COW store publishes frozen graphs and property deltas keyed by logical
node IDs. Physical copies of ancestors are not semantic property replacements.
Whole-view reads would overinvalidate unrelated bindings; JSON paths would lose
item identity on reorder. A.4 must establish exact read sets before A.5 builds
lazy cached derivations. DOM rendering and scheduling remain A.6/A.7.

## Decision

Use an app-owned tracking coordinator over the production store's commit
metadata. `app.observe(read, onInvalidate?)` initially evaluates a read, then
notifies on clean-to-dirty transitions. The returned observer refreshes
explicitly with `read()`. `app.computed(read)` initially stays lazy; `.value`
evaluates when dirty, caches, and registers a source edge when consumed by
another reactive read. View-context variants use the existing mount cleanup
scope. Both resources support idempotent disposal.

Track value, presence, key/order and array structure tokens by stable object ID.
Use reverse token subscriptions and source/dependent edges. Replace all reads
and source edges after each evaluation, including failed reads' partial sets.
Propagate dirty flags through the graph before delivering any notifications.
Traverse dependents even when their source was already dirty: a consumer that
caught an upstream error can be clean and still require later invalidation.
Never recompute during invalidation or compare derived results eagerly.

Use read-only facades with mutable shadow Proxy targets, because the frozen
snapshot's nonconfigurable object-valued descriptors cannot be transparently
wrapped. Facades resolve the latest reachable node by logical ID and preserve
aliases. Ordinary `app.state` reads outside derivations remain frozen historical
snapshots. Inside derivations, the getter and explicit callback state argument
track. This also lets a computed returning a state object stay cached while its
consumer tracks that object's current fields after COW updates. Detached facades
reject rather than silently reading old snapshots. Descriptor reflection tracks
presence; ordinary field reads provide value dependencies.

Reject async reads/notifications, state mutation and dispatch/lifecycle
reentrancy. Computed/observer recursion reports a labeled read chain. Failed
reads stay dirty for explicit retry. Source disposal invalidates consumers and
releases its cache/edges; app disposal suppresses notifications and shuts down
the graph before cleanup hooks. Notification errors cannot roll back an already
published version or discard its successfully admitted children. Dispatch still
drains siblings/children and reports errors afterward.

## Consequences and limits

- No store mutation escape hatch or third-party runtime dependency is added.
- Observers can establish precise subscriptions before a DOM scheduler exists;
  their invalidations do not themselves update mounted text.
- Derived values with equal results still invalidate based on changed inputs.
  This preserves lazy evaluation rather than introducing eager equality work.
- Facades are current-state views, not frozen snapshots; captured detached nodes
  reject. Reads across application instances do not establish graph edges.
- Callback side effects and later async work remain application responsibility.
- The coordinator indexes committed graphs, holds reachable facade identities
  and live resources, and prunes removed nodes/subscription buckets. No timing,
  memory or GC improvement is claimed; measurements remain future work.
- Broad browser qualification, DOM bindings, frames, keyed DOM ownership and
  generalized child scopes are outside this batch.

See [public reactivity API](../api/reactivity.md),
[public guide](../../DOCUMENTATION.md) and [verification](../reports/task-A.4-A.5-reactivity.md).
