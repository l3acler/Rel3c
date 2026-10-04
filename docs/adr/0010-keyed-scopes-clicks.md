# ADR 0010: Keyed scopes and minimal click delegation

Status: implemented in A.8/A.9, experimental public API. Date: 5 October 2026.

## Context

ADR 0009 establishes declarative bindings, conditional scopes and frame batching.
Collections need stable DOM ownership across index changes and object replacement.
The Phase A click mechanism must call registered actions without exposing native
events as serializable payloads. General event options and semantic inputs remain
Phase B/C work.

## Decisions

`keyed(itemsBinding, keyOfItem, itemView)` validates a complete array/key set before
preparing new scopes. Keys are strings or finite numbers with Map equality; holes,
missing keys and duplicates reject explicitly. Each key owns a comment-delimited
DOM range and child scope. Its factory runs once on admission; removal disposes
its entire tree. Failed preparation cleans new candidates and retains the old list.

Renderer-owned reactive cells hold the current item and position. `context.item`
path bindings and `context.value`/`position` getters read those cells. All changed
cell values publish before invalidating dependents. This preserves logical object
property tracking, retargets same-key replacement even when the previous object
remains aliased elsewhere, and keeps index changes separate from non-key fields.
Cells are internal resources with the same disposal graph as computed values.
Static factory captures intentionally remain static; applications read current
context getters inside bindings/callbacks instead of saving obsolete item values.

Reconciliation arranges retained/new ranges around the retained range containing
the active element, leaving that range connected and unmoved. Native selection
and focus survive without blur/refocus. Other ranges move with insertBefore.
Removing a focused item follows native focus behavior. This is correctness-driven
range placement; no minimum-move, linear-time or performance improvement is claimed.

`onClick` is a synchronous, zero-argument callback. This allows a no-payload named
action wrapper directly; payload actions use closures. A single bubbling delegate
on each mounted target exists while owned handlers exist. It snapshots matching
handlers child-to-parent, then checks scope liveness before each invocation.
Native events/defaults/propagation stay native. There is no Event argument,
cancellation/capture API or general keyboard/input registration yet.

Live handlers after a failing handler still run. Uncaught failures aggregate in
route order, reach onError once with phase `event`, then escape the native listener.
Actions retain their existing transactional rollback/commit guarantees. Explicit
flush/dispose calls retain their own error phases. Recursive event invocation
and clicks during action/render/reactive/error work reject EVENT_REENTRANT.

Scope removal unregisters handlers and stops pending jobs before removing nodes.
App disposal makes delegates inert, cancels frames, ends the tracking graph, and
attempts all cleanup despite errors. Failed native removal/cancellation is reported
without preventing terminal disposal. An internal WeakMap diagnostic reads scalar
resource counts for tests; it is not a public inspector or retained object registry.

## Consequences and evidence

The framework owns list/event lifetimes, with public examples requiring no DOM
patches or application-managed listeners. Key/type/async diagnostics are independently
validated at runtime. Repeated cycles restore all instrumented ownership counts;
this does not prove garbage collection of externally retained objects or failed
native removals. Rendering remains non-atomic for native DOM errors. Derived
objects use their source dependencies rather than automatic independent identity.

See the [A.8/A.9 report](../reports/task-A.8-A.9-keyed-events.md), [collections API](../api/collections.md)
and [click API](../api/events.md) for acceptance evidence and limits. A.8 was gated
before A.9; the full A.10 vertical-slice acceptance task remains separate.
