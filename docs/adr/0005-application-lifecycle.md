# ADR 0005 — Owned application lifecycle and experimental registration surface

Status: accepted and implemented for A.1; experimental public API, not a complete
Phase A core or stable release.

A.2 follow-up: the owned initial store is now backed by the production COW engine.
[ADR 0006](0006-production-transactions.md) supersedes the initial-only guard
limitation below with transaction growth/commit validation. A.1 evidence remains
historical; public action execution still waits for A.3.

Date: 2026-10-02 (Bahrain). Sources: Framework_PRD.md §3/§7, LIFE-1/PACK-1/TECH-1;
development task A.1; ADRs 0001–0004.

## Decisions

1. `createApp()` creates one owned, frozen initial data graph and an independent
   private action registry. It can run without DOM globals. With a configured
   `target`, mount automatically; otherwise call `app.mount()` explicitly to
   resolve the conventional `#app` container, or `app.mount(element)` for a custom
   target. Resolve the default at mount time, never during targetless creation.
   Missing DOM/`#app` throws `TARGET_INVALID` and permits retry; explicit invalid
   targets never silently fall back. This keeps beginner startup concise without
   implicit creation side effects, file discovery or whole-document ownership.
2. Use the curried `createActionSchema()` registration proven in Phase 0, with
   explicit `action(run)` / `action(validatePayload, run)` modes. Pass it as
   `schema`, not a raw callback map whose payload mode depends on function arity.
   Reusable schemas share registration definitions, not app stores/registry maps.
3. The framework invokes `view({ state, actions, dispatch, onDispose })` once per
   mount attempt. Context and committed initial state are read-only. A.1 accepts
   synchronous text/null/undefined output only; its owned Text node is temporary
   lifecycle plumbing, not a replacement for A.6's declarative element/binding API.
4. Reserve one exact DOM Element target per mounted app. Append only app-owned
   content; never clear host children. Remove the owned node on disposal, even
   if external code moved it. Disconnected and iframe Element targets work;
   documents, text nodes, ShadowRoots, selectors and DOM-shaped objects are not
   supported mount targets in A.1. Cross-realm DOM targets do not imply foreign
   ordinary state objects are accepted.
5. Lifecycle is created → mounting → mounted → disposing → disposed. A failed
   mount unwinds its view scope and target claim, returning to created for retry.
   Reject double-mount/target changes and disposal during a mounting view. Disposal
   is terminal and idempotent; construct a new app to mount after disposal.
6. View cleanup runs LIFO before app cleanup. `context.onDispose` belongs to that
   mount attempt; `app.onDispose` belongs to app lifetime, including disposal
   before any mount. Failed mounts drain only their attempt, preserving app hooks
   for retry/later disposal. Inactive contexts cannot register new resources.
   Cleanup failures are aggregated after all hooks run and disposal completes.
7. Operation failures throw readable `FrameworkError` codes or `AggregateError`.
   Optional synchronous `onError(error, { phase })` observes create/mount/dispatch/
   dispose failures without swallowing them. Observer failures preserve both
   errors, and reporting is reentrancy-guarded. Illegal same-realm native Promise
   returns are observed to avoid secondary unhandled rejections; arbitrary async
   effects cannot be cancelled or rolled back.
8. Until A.2/A.3, registered action wrappers/dispatch throw `FEATURE_UNAVAILABLE`,
   and unknown action names throw `ACTION_UNKNOWN`. No registered body executes,
   stateVersion stays 1, and no faux transaction/queue behavior is presented as
   implemented. Bind tokens, computed values, events, routes and controlled services
   remain later work. Unsupported config keys such as placeholder `seed` or raw
   `actions` fail instead of being silently ignored.

## Initial-state boundary

Production construction code is separate from spikes and preserves aliases,
distinct nodes, ordered keys, null prototypes, undefined, negative zero and sparse
arrays. It rejects unsupported original prototypes/accessors/nonenumerable data
(except array length), native containers, cycles and DOM-shaped nodeType data,
without invoking ordinary accessors/toJSON. Accepted graphs are copied before
deep freezing; caller objects are not frozen. Active/completed traversal memoizes
aliases and checks subtree height on deeper revisits.

Construction guards currently cap 128 object levels, 10,000 objects/arrays,
100,000 entries, 100,000 aggregate array slots and 1,000,000 UTF-16 string/key
units. These fixed initial guards prevent pathological startup recursion/graph
expansion; they are not byte/heap/history accounting or final production growth
limits. A.2 must integrate and test transaction assignment/growth policy. Live
Proxy traps and modified host intrinsics are not sandboxed.

Disposal drops owned state, registry entries, view/error callbacks and DOM target
references. Immutable metadata remains readable; `app.state`/`stateVersion` and
action/mount operations reject after disposal. A caller that retained a state
snapshot/context still owns that reference; resource-counter tests do not prove
that every user-held object is collectible.

## Compatibility and evidence

The Phase 0 createApp placeholder silently accepted unused options and fake mount
targets. A.1 intentionally replaces that behavior. The PRD's inline-action/seed/
element samples remain future design sketches; current usage is in
[application API docs](../api/application.md). Public declarations cover the
implemented lifecycle and infer schema state/names/payloads without emitting code.
Dispatch is typed `never` while it always throws; final commit results follow A.3.
TypeScript 5.9.3 is verified development tooling, not a runtime requirement or a
frozen minimum supported public checker version.

See the [A.1 report](../reports/task-A.1-application-lifecycle.md) for 331 Node tests,
45 negative type lines, 27 Chrome checks, startup smoke, source fingerprints and
limits. Native focus/selection and host-child preservation are exercised; keyboard/
IME/router/transaction and general subscription cleanup are not implemented.

Alternatives: auto-mount-only loses headless/lazy setup; remount-after-dispose
complicates ownership revival; replacing target contents destroys host nodes;
executing registered callbacks against frozen initial state would fake a broken
transaction contract. The chosen lifecycle keeps later stores/renderers/scopes
integrable without importing spike code into public runtime modules.
