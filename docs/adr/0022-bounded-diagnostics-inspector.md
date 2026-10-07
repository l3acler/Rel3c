# ADR 0022: Optional bounded observations and a separate inspector app

Date: 7 October 2026. Status: accepted for experimental D.3/D.4.

## Problem

INSPECT-1 requires connecting inputs/actions and state changes to dirty/evaluated
bindings, writes and scheduling. The internal resource-counter reader alone cannot
explain a transition. Diagnostics must remain optional, bounded, independent of
authoritative execution and safe to dispose. Recordings contain sensitive values
and must be exported explicitly.

## Decision

Expose `createDiagnostics(app,options?)` as an explicit single-session attachment
through a private WeakMap port. A disabled hub retains no trace and reads no wall
clock. Hooks describe grouped executed roots, transaction deltas, reactive resource
IDs/property tokens/computed edges, binding targets and successful renderer writes.
Replay groups its roots through the same private hook; history restoration gets
its own bulk-restore entry. Optional timing observes synchronous work/native RAF
without changing controlled clock/random services or recorder trace IDs/order.

Keep a recent completed-entry window bounded by count and serialized UTF-8 bytes.
Limit scratch event count/bytes and descriptor-only lossy previews; continue actual
work counters after detailed capture truncation. Capture failures only increment a
diagnostic counter. Never retain native nodes, state/payload graphs, closures or
application Error objects in entry values. A render references the diagnostic
sequences whose invalidation it coalesced; selection explains these connections
without conflating diagnostic sequences, recording sequences and state versions.

Expose `createInspector({diagnostics,target?,history?,onExport?})` as a separate
framework app with a declarative view and registered actions/events. Native select,
buttons, labeled read-only textareas and a status region provide keyboard/focus
semantics. Refresh is explicit, with no polling, source observers or timer handles.
Selection/export do not drive the source. Separate optional history buttons seek
or apply its declared undo policy; branching remains a history API operation.

Show included values before explicit export controls. Diagnostic export includes
lossy previews/work; full recording export delegates to the existing API and does
not silently start recording. Return full strings and optionally invoke a
synchronous developer export callback; cap only the UI preview. Inspector disposal
releases its UI/source references and does not take ownership of supplied sessions,
history or apps. Session/app disposal clears capture data and source references.

## Tradeoffs and limits

Explicit refresh avoids inspector work entering the source frame schedule, at the
cost of no automatic live-updating panel. Truncated previews/current graphs can
omit details; recordings remain the complete deterministic source. Byte bounds
describe serialized entry data, not JS heap retention. Frame intervals describe
captured visual RAF calls, not display rate. Counters exclude node allocation,
listener operations, selection restoration and browser internals. No speed, heap
or instrumentation-overhead claim follows from passing correctness/resource
fixtures; D.5/D.6 must measure instrumented and uninstrumented workloads.

## Verification

Focused runtime/native tests verify exact coalesced writes, property/dependency
relationships, FIFO/rollback, payload origins, fixed-tick/replay/restore grouping,
count/byte/truncation limits, identical recorder bytes/hashes, explicit exports,
keyboard controls, history policy integration and repeated cleanup. Public
declarations/examples/root guide accompany the API. See the
[qualification report](../reports/task-D.3-D.4-diagnostics-inspector.md).
