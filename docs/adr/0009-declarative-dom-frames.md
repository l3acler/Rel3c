# ADR 0009: Declarative DOM ownership and render frames

Status: implemented in A.6/A.7, experimental public API. Date: 3 October 2026.

ADR 0001 selected element functions and explicit binding tokens. Production now
uses immutable branded descriptors, app-owned path tokens and explicit derived
reads. Each bound target has its own A.4 observer; no root rerender, compiler,
spike import, virtual DOM or third-party framework supplies rendering behavior.
Text stays escaped. HTML helpers construct supported native elements.

Null/undefined/boolean children are empty; finite numbers are text. Class and CSS
maps normalize as one binding per target. Live input/textarea/select values and
checked/selected properties are distinct from ordinary attributes. Initial reset
defaults are written once. Unchanged live properties avoid selection-destroying
setters. Native editing/reset does not itself dispatch state changes; event APIs
remain later work. Raw HTML, inline handlers, active URLs and unsupported tags
reject rather than quietly bypass framework ownership.

Conditional branches own scopes with observers/computed values/hooks and nodes.
A boolean change constructs a candidate before disposing the old branch. Failed
construction cleans the candidate and retains the old branch. Structural jobs
precede descendants; removed scopes never consume queued visual work. Disposal
stops the tracking graph, cancels pending callbacks and drains child scopes before
root view and application hooks. Host-owned nodes remain intact.

A.6 was independently validated using synchronous visual publication before the
A.7 queue was built. The final API commits actions synchronously and schedules
visual reads/writes via one requestAnimationFrame per app. A Set deduplicates dirty
bindings across commits; reads use latest committed state. Equal normalized text,
attributes and style values avoid writes. Style caches the last successful authored
normalization because native cssText serialization can differ. Live form values
compare actual properties so unchanged values avoid disturbing native editing.

Explicit app.flush cancels the pending frame and drains current jobs synchronously.
Generation guards invalidate callbacks even if cancellation arrives too late.
Missing animation-frame APIs require explicit flush; no timer-based fallback is
introduced. Reentrant flush rejects. Render errors attempt remaining jobs, preserve
committed state and successful DOM writes, report phase render, and retain failed
jobs for retry by explicit flush or a later commit. Failed frames do not loop.

These decisions implement A.6/A.7; keyed lists, event delegates, priorities/fairness
budgets and deterministic ticks are not included. There is no performance claim.
See [DOM reference](../api/dom.md), [guide](../../DOCUMENTATION.md), and
[verification](../reports/task-A.6-A.7-dom-frames.md).
