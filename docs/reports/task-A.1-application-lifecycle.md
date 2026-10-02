# Task A.1 — Public application ownership and lifecycle evidence

Completed: 2026-10-02 (Bahrain). See [ADR 0005](../adr/0005-application-lifecycle.md)
and [current API/example](../api/application.md).

## Delivered and excluded

Public createApp now owns a copied/deep-frozen initial graph and private action
registry, invokes a synchronous text view, mounts/removes owned DOM, reserves
exact targets and disposes resources. createActionSchema registers explicit
action modes; wrappers/dispatch deliberately throw until A.3. FrameworkError and
optional synchronous error observation report actual failures without swallowing
them. Initial construction has explicit traversal/graph/sparse/text guards.

Runtime modules live under src/runtime with no spike imports or external runtime
dependencies. The root example uses public src/index.js only; all previous manual
innerHTML writes are removed. It creates one app and calls mount() to render a
live text report into the conventional #app container, without manual target
lookup. The browser verifier imports the app and calls dispose() to verify owned
text removal. It remains browser-native JavaScript, with no build step.

After user review, explicit mount() now resolves #app at mount time (undefined
also uses the default). Creation without target remains lazy/headless. Missing
DOM/#app fails with TARGET_INVALID before view invocation, leaves the app created
and permits retry; explicit invalid targets never fall back. Custom Element
targets, exclusive claims and terminal lifecycle errors retain their behavior.
This ergonomic choice is recorded in ADR 0005; no file-based startup, document
ownership or Next.js-style server rendering is introduced.

The former permissive placeholder is replaced, not retained as a fake fallback.
Unsupported options reject, disposal is terminal, views return text/null/undefined
only, and caller state remains unfrozen. Exact public errors/lifecycle are documented.
The initial store is not reactive, actions do not execute, stateVersion remains 1,
and COW transactions, bindings/elements, events, router, services/recording/replay
remain later work. A.1 does not complete the Phase A vertical slice.

## Commands and results

```sh
npm test
npm run test:spikes
npm run test:benchmarks
npm ci
npm run test:types
npm run test:browser
npm run smoke
npm ls --omit=dev
```

- **331/331 Node tests pass:** 31 public tests (28 new lifecycle/module ownership
  checks + three updated scaffold checks), 292 spike tests and eight workload tests.
  Unit DOM doubles test error/retry/cleanup cases; independent real-browser checks
  below verify actual DOM behavior.
- **45 negative type lines reject:** 20 new public API lines plus the existing
  25 spike lines. Positive public/spike TS and checked JavaScript pass; disabling
  every directive independently confirms diagnostics on all expected lines.
  Five new public type equalities preserve inferred state/names/arguments, alongside
  the six prior spike assertions. Root example also passes checkJs; no code emitted.
- **27/27 real Chrome checks pass**, including default-target lookup/retry/override,
  lifecycle ownership, the public root example and 100 lifecycle cycles.
  [Current fingerprinted browser evidence](../../tests/results/app-lifecycle-1790969628972-f91f2ae7.json).
  [Earlier explicit-target lifecycle evidence](../../tests/results/app-lifecycle-1790965315808-e0e83f81.json)
  is retained as historical evidence, not a fingerprint of the revised sources.
- **Expanded root smoke passes:** import/create/dispose, localhost redirect/example,
  public entry and every new runtime module served with JavaScript MIME types;
  example uses public disposal and no normal DOM patch/listener code.
- **Runtime dependency tree is empty.** Runtime module-graph test rejects imports
  outside production src/relative files. TypeScript 5.9.3 remains development-only.
- Diff whitespace and local documentation link checks pass; raw browser source
  fingerprints match the checked runtime/example/test/harness files.

## Coverage and environment

Tests cover headless/lazy construction, auto/explicit mount, immutable instance/
context/state, detached methods, config/schema/getter rejection, action-name safety,
independent app stores/registries, graph aliases/distinct nodes/key order/prototypes/
holes/undefined/-0, unsupported state types, cycles and construction budgets.
A 30-level DAG visits its shared leaf descriptor once with zero ordinary value
gets; this is not a throughput or hostile-Proxy security claim.

Lifecycle checks cover lazy default lookup, missing DOM/target retry, explicit
override/no invalid fallback, target validation/exclusivity, double mount, iframe and
detached targets, host nodes/focus/selection, safe HTML-looking text, failed mount
unwind/retry, stale scopes, partial DOM insertion failure, LIFO cleanup, dispose
before mount, aggregate cleanup/observer errors, reentrancy and illegal native
Promise rejection observation. Resource counters/owned nodes return to baseline
over 100 cycles; this is not exact heap/leak proof or general subscription cleanup.

Environment: Node v26.3.0, npm 11.16.0, TypeScript 5.9.3, Darwin 24.6.0 arm64,
Apple M4; isolated headless Chrome 154.0.8037.93 / V8 15.4.80.19. The in-app browser
connection had no available browser after discovery/troubleshooting. Automated
verification used the repository's isolated Chrome pipe approach with explicit
localhost/browser permission, no signed-in profile or third-party browser library.
The runner closed its server/browser and removed only its generated temporary
profile. No cross-browser/real IME or performance evidence is claimed.

## Follow-up

A.2 must adapt/test the selected COW engine, identity and transaction growth/depth
policy against production code. A.3 must implement payload guards/ownership,
successful-action versions including no-op data, rollback and nested dispatch.
A.4–A.10 add reactive bindings, elements, batching, keyed views and event/scope
integration. Public declarations stay experimental until integrated/qualified;
B.9 still owns stable declaration/browser compatibility acceptance. Existing
ADR 0001 user edits are preserved and excluded from the user-requested A.1 commit.
No push or A.2 implementation is included.
