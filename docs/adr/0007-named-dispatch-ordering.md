# ADR 0007 — Named dispatch, payload ownership and FIFO ordering

Status: accepted and implemented for A.3. Date: 2026-10-03 (Bahrain).
Sources: PRD ACTION-1, §3; development task A.3; ADRs 0002/0005/0006.

## Decisions (specified before implementation)

- Both `app.dispatch(name, ...args)` and registered `app.actions[name](...args)`
  return `undefined`. An outer call synchronously drains its entire batch. A
  nested call returns after admission, before its body executes. There is no
  action return-value or draft escape API.
- Validate exact names and explicit input-mode arity. Own supported payload data
  with the production descriptor/type policy, including primitive roots. Copy
  and deeply freeze before calling the synchronous guard; require exactly `true`.
  Caller data remains mutable. Validate and capture at admission, so a parent
  can catch an invalid child request and later caller edits cannot alter it.
- Each body uses a separate revocable transaction. Successful bodies publish
  exactly one version, including no-ops. Throwing, thenable-returning or invalid
  final graphs publish none. Bodies read previously committed state through app
  getters; only their draft exposes in-progress writes.
- Stage nested requests privately until their parent commits. Append them to
  the FIFO tail after success; discard them after parent failure. Thus root
  requests A/B, A requesting C yields root/A/B/C, with no recursive execution.
  A failed child does not undo ancestors or successful siblings. Continue queued
  siblings, then throw the single original failure or an ordered AggregateError
  for multiple failures from the outer call. `onError` observes this terminal
  dispatch error once, after draining; it cannot dispatch recovery actions.
- Dispatch from mounting views, payload guards or error reporting rejects.
  Mount/dispose while a dispatch batch or guard is active also rejects. This
  prevents reentrant lifecycle/store disposal and partial-version error callbacks.
  Dispatch in the created/headless and mounted states is supported. Disposal
  clears owned dispatch references; detached wrappers reject after disposal.
- Bound a batch to 1,024 admitted actions (root included) and aggregate admitted
  payload usage to the existing state graph node/entry/slot/text limits. Each
  payload also obeys the 128-level depth limit. Charges do not refund consumed
  or discarded requests within a batch. Failed admission does not consume the
  budget. The next outer call starts fresh. These bound framework work/retention,
  not user callback CPU, exact heap bytes or externally retained values.

## Consequences and boundaries

An outer call can throw after earlier actions committed. Catching a nested call
only catches admission errors; its eventual body errors reach the outer caller.
Accepted requests from a failed parent are discarded without calling their
bodies. Guards must be pure; runtime reentrancy checks cannot undo their ambient
side effects. Native Promise rejection observation does not cancel async code;
revoked drafts prevent deferred writes. Arbitrary thenables are never invoked.

There are no reactive subscriptions, DOM updates, controlled clock/random
services, external-input adapters, action recordings or replay in A.3. Views
remain text-only and do not rerun on commit. Clock/random services follow Phase C;
action code must not rely on ambient values for reproducibility. Public schema
and dispatch contracts remain experimental. Runtime code stays independent of
spike modules and frontend/state libraries.

Verification: [A.3 evidence](../reports/task-A.3-named-dispatch.md), 29 new public
dispatch tests, type fixtures and six additional real Chrome dispatch checks.
