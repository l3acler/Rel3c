# Framework development plan

**Status:** Phase 0 and Phase A complete. B.1–B.11 frontend implementation and auditor verification complete; broad native-input/browser release qualification remains open. C.1/C.2 are implemented; remaining C/D tasks are planned.

**Created:** 30 September 2026.

**Source:** [Framework_PRD.md](Framework_PRD.md), version 2.16, and [AGENTS.md](AGENTS.md).

**Current milestone:** C.1–C.4 implement checkpoints, controlled services, fixed ticks and external-input/effect adapters. B.1–B.11 frontend candidate remains verified. Native OS/clipboard/mobile/other-browser qualification stays open. Next implementation batch: C.5 semantic event input integration and C.6 display interpolation; recording/replay remain later gates.

## 1. Purpose and scope

This document turns the product requirements into an implementation backlog. The framework is the product: its state engine, DOM abstraction, event system, router, scheduler, deterministic runtime, tools, package, and documentation. Small examples validate public APIs. The assignment's separate demonstration application is a later integration task and must not determine the framework architecture.

The repository contains browser-native public lifecycle exports, a development server/public-only text example, tested transaction/view/action-schema spikes, equivalent-work Node/browser measurements, and typed dispatch/graph snapshot evidence. Phase 0 is complete: copy-on-write is selected for Phase A, with stable graph IDs, explicit action inputs, acyclic supported data, element/binding syntax and proposed browser/input qualification recorded in ADRs. Task 0.8's shared validation findings were corrected and remeasured in 0.9. A.1 implements initial ownership, schema registration, mount/dispose and cleanup/errors; A.2 adds app-owned production COW transactions, revocation, stable IDs and state/scratch growth guards with fresh port evidence. A.3 implements public dispatch with owned payloads, synchronous guards, bounded FIFO queues and failure propagation. A.4/A.5 add exact observers, current-state read facades, lazy computed caches, chained/dynamic dependencies, cycle errors and scoped disposal. A.6/A.7 add declarative DOM and frame batching; A.8/A.9 add keyed collection scopes and minimal click events with resource cleanup. A.10 verifies the integrated public core example with binding/setter counters and native mutation records. Unchecked tasks and proposed future paths/commands describe planned deliverables, not existing functionality.

The PRD remains the source of truth for acceptance criteria. Changes to product scope or execution contracts require corresponding PRD changes and an explanation. Architecture choices require an architecture decision record (ADR), supporting tests, and measurements where applicable.

### Scope clarification

The PRD's non-goals mention shared state, while `STATE-1` and `ROUTE-1` explicitly require application-wide state across routes. Its state-location extension clarifies the intended boundary: one application store shared by routed views is required; distributed/shared synchronization between runtimes is future research. Follow that distinction throughout implementation.

Server rendering, DOM hydration, distributed synchronization, JSX/compiler transforms, and the separate demonstration app are outside this backlog. Storage hydration is required and is distinct from DOM hydration. No separate assignment specification is present; when supplied, check it against the PRD and preserve its mandatory requirements as directed by AGENTS.md.

## 2. Development rules

- Implement DOM, state, routing, and events in JavaScript within this project. Do not use another frontend or state framework to provide these capabilities.
- Ship browser-native public imports without mandatory third-party runtime dependencies. Disclose development dependencies used for serving, tests, and benchmarks.
- Let the framework call registered views, actions, and handlers. Application examples use public exports; they do not manually patch DOM or manage ordinary browser listeners.
- Keep committed state read-only. Successful synchronous actions publish one version; failed actions publish none. Reject Promise-returning actions and invalidate transaction views after completion.
- Track properties and bindings precisely. Batch visual writes separately from transactions. Preserve native form, focus, keyboard, and history behavior.
- Keep external effects outside transactions. Admit their results through serializable inputs. Never imply that state rollback reverses an external side effect.
- Keep tick IDs, state versions, and render frame IDs separate. Replay guarantees apply to committed state, not paint timing or interpolated visuals.
- Bound retained history, including snapshots. Never retain an action sequence without a usable baseline.
- Preserve user changes and keep implementation increments reviewable. Report actual verification results, remaining work, and limitations.
- Do not claim novelty, speedups, low allocation, or completed features without evidence.

## 3. Milestones and dependencies

| Phase | Outcome | Depends on | Exit evidence |
| --- | --- | --- | --- |
| 0 | Root scaffold, transaction comparison, syntax/schema prototypes, ADRs | Source documents | Both engines pass identical fixtures; measured selection and public syntax decision |
| A | Atomic state, precise reactivity, computed values, declarative DOM, keyed lists, cleanup | Phase 0 engine gate | A click commits state and changes only its bound text; rollback and identity tests pass |
| B | Assignment-ready events, routing, state locations, priorities, declarations, documentation | Phase A | General frontend acceptance suite and clean-checkout auditor walkthrough |
| C | Ticks, controlled time/random, external inputs, interpolation, recording/replay | Phase B and versioned format decisions | Matching checkpoint hashes across frame schedules; retention and external-input tests |
| D | History/undo, inspector, benchmark suite, technical report | Phase C | Retained states can be sought and inspected; published claims have reproducible evidence |

Phase A includes minimal click handling and frame batching to prove the core vertical slice. Phase B completes their general contracts. Early schema and serialization design keeps Phase C compatible with the core; complete deterministic behavior is accepted only in Phase C.

### Task tracking

Task IDs are stable references for changes, tests, ADRs, and review notes. Check a task only when its deliverable and acceptance checks pass. Record status as `planned`, `in progress`, `blocked`, or `done`; include the owner, change reference, verification command/results, and remaining limitations in the implementation log. Unchecked tasks remain planned; completed tasks have evidence in the log.

Each task below specifies dependencies, work, and evidence. Tasks sharing satisfied dependencies may proceed independently; phase gates control integration. Calendar estimates should follow the Phase 0 findings rather than assume the engine or browser-testing cost.

## 4. Proposed repository structure

```text
mini-framework/
├── AGENTS.md
├── Framework_PRD.md
├── DEVELOPMENT_PLAN.md
├── README.md
├── package.json
├── src/
│   ├── index.js                 # Supported public exports
│   ├── index.d.ts               # Public TypeScript declarations
│   └── runtime/
│       ├── state/               # Transactions, identities, validation
│       ├── reactivity/          # Tracking and computed values
│       ├── dom/                 # Elements, bindings, conditions, lists
│       ├── events/              # Native and semantic input handling
│       ├── scheduler/           # Frame work, priorities, ticks
│       ├── router/
│       ├── persistence/
│       ├── inputs/              # External values and effect results
│       ├── recording/
│       ├── history/
│       └── inspector/
├── spikes/                      # Experimental code, never public exports
│   ├── transactions/
│   ├── view-syntax/
│   └── action-schema/
├── examples/basic/              # Public-import acceptance examples
├── tests/                       # Unit, browser, type, randomized fixtures
├── benchmarks/                  # Identical workloads and raw results
└── docs/
    ├── adr/
    ├── api/
    └── reports/
```

These are responsibility boundaries, not a requirement to create every directory immediately. Keep the public entry point independent of spike code. Create shared internals only when concrete callers and tests justify them.

## 5. Phase 0 — architecture spikes

**Goal:** Establish a runnable root and select the transaction implementation using equivalent correctness and performance evidence. Prototype view syntax and typed action schemas before committing to a public API.

### Tasks

- [x] **0.1 — Scaffold the root project.** Dependencies: none. Add browser-native module configuration, a documented public entry placeholder, a minimal root-run browser page, and test/benchmark scripts. Choose and disclose development tooling. Acceptance: a documented root command starts the page; a clean setup can execute a minimal test without a frontend runtime dependency.
- [x] **0.2 — Specify the prototype contract.** Dependencies: 0.1. Define the same tiny begin/read/write/commit/abort interface for both engines, without making it public. Specify property addition/deletion, array structure, aliases, snapshot reads, unsupported types, no-op actions, and transaction lifetime. Acceptance: shared fixtures and a reference evaluator define observable behavior independently of either prototype.
- [x] **0.3 — Prototype copy-on-write transactions.** Dependencies: 0.2. Implement writable transaction views, structural sharing, immutable publication, rollback, and property-level change metadata. Acceptance: nested edits, aliases, insert/remove/reorder, and throw rollback match the reference fixtures; committed state cannot be changed through a leaked draft.
- [x] **0.4 — Prototype staged-operation transactions.** Dependencies: 0.2. Implement staged writes/deletes and read-your-writes behavior, atomic publication, rollback, and equivalent change metadata. Acceptance: the exact fixtures used for 0.3 pass without relaxing semantics or excluding a workload.
- [x] **0.5 — Compare correctness and identity.** Dependencies: 0.3, 0.4. Add randomized nested/collection transitions, alias mutation cases, repeated writes, failure injection, and exact invalidation checks. Acceptance: both implementations match reference state and affected-property sets; moved items retain stable identities rather than depend on mutable JSON paths. Evidence: [correctness and identity report](docs/reports/task-0.5-correctness.md).
- [x] **0.6 — Measure equivalent workloads.** Dependencies: 0.5. Measure sparse nested updates, repeated writes, dense updates, large array insertions/reorders, alias edits, and rollback. Report allocation proxies or profiler observations, retained memory, GC observations, median/p95 update time, and browser frame scripting tails. Include machine, runtime/browser version, warmup, repetitions, workload source, and raw results. Acceptance: comparisons do equal work, separate instrumentation overhead, and explain unavailable metrics rather than invent them. Evidence: [measurement report and raw datasets](docs/reports/task-0.6-measurements.md).
- [x] **0.7 — Prototype element and tagged-template syntax.** Dependencies: 0.1. Build equivalent form/list/event examples using element functions and optional `html` templates. Evaluate readability, cached parse cost, escaping, dynamic attributes, handler ownership, and disposal. Acceptance: ordinary `onclick` attributes cannot bypass framework event handling; an ADR selects element functions and records whether templates meet the adoption gate. Templates may be omitted if the prototype does not justify shipping them. Evidence: [ADR 0001](docs/adr/0001-view-syntax.md) and [syntax report](docs/reports/task-0.7-view-syntax.md). Elements/tokens selected; eager templates fail exact-binding capture, optional public templates deferred.
- [x] **0.8 — Prototype typed actions and serialization.** Dependencies: 0.2. Test inference of action names and payload types while keeping plain JavaScript usable. Evaluate a supported state/payload type matrix and alias-preserving snapshot encoding; decide whether cycles are supported or rejected. Acceptance: valid and invalid dispatch type fixtures behave as expected, runtime validation remains required, and serialization does not silently change graph meaning. Evidence: [ADR 0002](docs/adr/0002-action-schema-serialization.md) and [type/serialization report](docs/reports/task-0.8-actions-serialization.md). Explicit payload modes, correlated dispatch types and graph snapshots prototyped; cycles rejected. Legacy assignment normalization/DAG validation findings are carried into 0.9/core acceptance.
- [x] **0.9 — Record architecture decisions.** Dependencies: 0.6–0.8. Write ADRs for transaction choice, object identity, supported types, view syntax, action/schema shape, and proposed browser/input support. Document measured tradeoffs and unresolved decisions. Review task 0.8 findings: reject unsupported assignment prototypes before normalization and memoize completed DAG validation nodes before adopting the core type policy. Acceptance: the selected engine satisfies all correctness gates; costs and limitations are supported by results. If neither engine passes, continue the spike instead of declaring a winner. Evidence: [ADR 0003](docs/adr/0003-transaction-engine-identity.md), [ADR 0004](docs/adr/0004-browser-input-support.md) and [architecture review/fresh measurements](docs/reports/task-0.9-architecture-review.md). Shared type-policy gaps fixed; COW selected, measured counterevidence/production adaptation gates documented.

### Exit gate and artifacts

Deliver the root scaffold, isolated prototypes, shared fixture suite, reproducible measurements, syntax/type fixtures, and ADRs. Run spike tests and the root startup smoke test. Approve the engine gate only after correctness, aliases/arrays, rollback, exact invalidation, allocation, GC observations, and median/p95 measurements are reviewed together.

**Gate passed (task 0.9):** corrected prototypes pass 303 total Node tests and fresh equivalent-work Node/Chrome comparisons; 25 negative type fixtures, positive TS/JS, 40 DOM checks and root smoke pass. COW is the implementation basis, not a completed public runtime or universal speed/memory winner. Required production port/queue/no-op/version/state-budget work remains A.1–A.3.

## 6. Phase A — core runtime

**Goal:** Implement the selected engine and prove the complete input → action → commit → dependency → DOM path.

### Tasks

- [x] **A.1 — Establish application ownership and public entry.** Dependencies: 0.9. Define create/mount/dispose lifecycle, app-owned store, action registry, view invocation context, and development error reporting. Acceptance: a public-import example mounts and disposes; applications need no internal imports. Evidence: [ADR 0005](docs/adr/0005-application-lifecycle.md), [implemented API](docs/api/application.md), [A.1 report](docs/reports/task-A.1-application-lifecycle.md) and public root example. Text-only lifecycle/owned initial state and explicit schema registration work; dispatch execution intentionally throws until A.3. Production COW/reactive DOM are not claimed by A.1.
- [x] **A.2 — Implement production transactions.** Dependencies: A.1. Adapt COW per ADR 0003 into runtime code with read-only committed views, deep transactions, stable object identity, original-prototype rejection, descriptor validation and active/completed DAG traversal. Define production growth/depth limits or safe traversal; codec budgets do not bound the backend. Acceptance: prototype correctness/type-policy fixtures pass against the runtime; nested writes, add/delete, aliases, and array changes publish atomically; leaked drafts reject use after commit/abort. Remeasure materialization/indexing changes before cost claims. Evidence: [ADR 0006](docs/adr/0006-production-transactions.md), [A.2 verification/measurements](docs/reports/task-A.2-production-transactions.md), 86 production transaction checks, seven changing-workload equivalence checks, 33 Chrome checks and a fingerprinted Node port comparison. Engine is internal; A.3 public dispatch remains gated.
- [x] **A.3 — Implement named dispatch and ordering.** Dependencies: A.2. Validate names/payloads, reject async/thenable actions, assign committed versions, and queue nested dispatches. Decide FIFO ordering, error propagation, and whether nested dispatches from a failed parent are discarded before implementation. Acceptance: observers see complete versions only; throwing or Promise-returning actions publish none; ordering fixtures include successful and failed parents and children. Evidence: [ADR 0007](docs/adr/0007-named-dispatch-ordering.md), [A.3 verification](docs/reports/task-A.3-named-dispatch.md), 29 new public dispatch tests, positive/negative types and 39 Chrome checks. Each parent stages children until success; failed children discard descendants, continue siblings and report terminal failures after draining.
- [x] **A.4 — Track exact dependencies.** Dependencies: A.2. Track object-property reads, property existence, key iteration, array length/structure, and item-property reads. Replace stale dependency sets when branches change. Acceptance: unrelated properties invalidate different observers, alias writes find the same dependencies, and item edits do not invalidate unrelated items or list structure. Evidence: [reactivity API](docs/api/reactivity.md), [ADR 0008](docs/adr/0008-exact-reactivity.md) and [A.4/A.5 verification](docs/reports/task-A.4-A.5-reactivity.md).
- [x] **A.5 — Implement computed values.** Dependencies: A.4. Add lazy caching, chained dependencies, dynamic dependency replacement, disposal, and cycle detection. Acceptance: unobserved dirty computations remain lazy, observed values recompute only as needed, and cycles fail with a useful error. Evidence: [reactivity API](docs/api/reactivity.md), [ADR 0008](docs/adr/0008-exact-reactivity.md) and [A.4/A.5 verification](docs/reports/task-A.4-A.5-reactivity.md).
- [x] **A.6 — Implement declarative DOM bindings.** Dependencies: A.1, A.4. Add elements, static/reactive text, attributes, classes, styles, nested children, and conditional views. Define null/boolean children and attribute-versus-property handling for forms. Acceptance: a form and conditional section use only public APIs; reactive changes preserve unrelated nodes and reject mutation from render computations.
- [x] **A.7 — Add frame batching and explicit flush.** Dependencies: A.3, A.6. Deduplicate dirty bindings, read latest committed values, avoid unnecessary writes, and cancel disposed work. Acceptance: several commits before one frame cause at most one latest-value write per binding; explicit flush is deterministic in tests and does not create duplicate scheduled writes.
- [x] **A.8 — Implement keyed collections.** Dependencies: A.4, A.6, A.7. Add keyed insertion/removal/reorder, item binding ownership, and missing/duplicate-key diagnostics. Acceptance: retained items preserve DOM identity and focus after reorder; item edits affect only dependent bindings; removed items dispose resources.
- [x] **A.9 — Implement scoped cleanup and minimal click events.** Dependencies: A.1, A.6, A.7. Own handlers, subscriptions, computed values, child scopes, and scheduled callbacks. Add the public click mechanism needed for the vertical slice. Acceptance: repeated mount/unmount restores resource counts; disposed scopes receive neither events nor queued writes.
- [x] **A.10 — Verify the core vertical slice.** Dependencies: A.3–A.9. Build a public-import counter with an unrelated bound node, a nested field, conditional content, and keyed items. Instrument binding evaluations and DOM writes. Acceptance: one click commits one version and updates exactly its dependent text; the unrelated node is unchanged; a failing action changes neither committed state nor UI. Evidence: [core example](examples/core/README.md), [guide](DOCUMENTATION.md#verified-core-example) and [A.10 report](docs/reports/task-A.10-core-slice.md); 278 runtime and 80 Chrome checks pass, with one counter evaluation/text write and zero rollback work.

### Exit gate and artifacts

Deliver tested public core exports and a root-runnable example. Pass rollback, async rejection, nested ordering, deep/exact dependency, computed cycle, collection identity, batching, focus, and cleanup tests. Update documentation with actual implemented APIs and limitations. Event generalization, routing, and priorities remain Phase B work.

## 7. Phase B — assignment-ready frontend framework

**Goal:** Provide complete ordinary frontend facilities and an auditor-ready experience through public imports.

### Tasks

- [x] **B.1 — Complete native event handling.** Dependencies: Phase A. Implement public registration/options, bubbling delegation where appropriate, and capture/direct handling for events such as scroll. Define event propagation, cancellation, target/current-target semantics, and scope cleanup. Acceptance: click, scroll, keyboard, and submit work through public APIs; links/forms retain native behavior unless explicitly handled; disposed views receive no events.
- [x] **B.2 — Normalize keyboard inputs.** Dependencies: B.1. Represent key-down/up, held keys, repeat, modifiers, and focus-loss reset as serializable semantic inputs. Keep native event objects outside action payloads. Acceptance: fixtures cover repeat, shortcuts, key release, and blur without stuck held-key state; keyboard interaction remains accessible.
- [x] **B.3 — Preserve native text editing.** Dependencies: B.1. Handle input, paste, composition updates/end, accepted values, and selection/focus preservation. Specify when semantic changes dispatch, including useful updates during composition rather than always waiting for compositionend. Acceptance: input/textarea fixtures cover IME, paste, ordinary editing, selection, and blur; reactive rendering does not overwrite active composition. Record real-browser/manual checks where synthetic events are insufficient.
- [x] **B.4 — Complete priority scheduling.** Dependencies: A.7. Define immediate, frame, normal, and idle ordering, reentrancy, error handling, and a bounded fairness policy. Acceptance: mixed-lane tests confirm order and normal-work progress under sustained input; idle work cannot control correctness; disposal removes pending work.
- [x] **B.5 — Design routing and navigation contracts.** Dependencies: A.3, B.1. Decide default History/hash mode, path matching, params/query encoding, base paths, direct-load setup, not-found behavior, and navigation errors. Specify action-requested navigation as a framework-owned post-commit operation so failed actions do not change URL. Acceptance: an ADR defines URL/reactive-state synchronization and modified-click/external-link native behavior before implementation.
- [x] **B.6 — Implement routing with persistent app ownership.** Dependencies: B.5, A.9. Mount/dispose route views while retaining the application store; process framework links, action navigation, direct load, and browser back/forward. Synchronize URL and reactive route state without feedback loops. Acceptance: two routes update the same state; navigation changes the expected URL/view/state; direct loads and back/forward work; removed routes release handlers and subscriptions.
- [x] **B.7 — Specify state locations and hydration precedence.** Dependencies: A.2, B.5. Define explicit memory/session/local/URL field configuration, supported serialization, defaults, precedence, invalid-data handling, namespace/schema versions, and synchronization directions. Coordinate route query and URL-backed state ownership. Acceptance: an ADR resolves conflicting persisted/URL/default values and prevents routing/persistence loops.
- [x] **B.8 — Implement state-location adapters.** Dependencies: B.6, B.7, B.4. Hydrate configured fields through a defined initialization/input boundary; queue storage writes after successful commits. Handle quota/access/parse failures without undoing committed memory. Acceptance: reload retains only configured fields; memory-only state resets; failed actions write nothing; storage errors are reported; URL-backed state follows back/forward without loops.
- [x] **B.9 — Publish declarations and diagnostics.** Dependencies: 0.8, B.1–B.8. Provide action/payload inference, read-only state, element/event/router types, and clear errors for unsupported values, unknown actions, mutation violations, computed cycles, and list keys. Acceptance: positive/negative TypeScript fixtures pass while plain JavaScript examples remain usable; runtime validation independently catches invalid external data.
- [x] **B.10 — Write root documentation and public examples.** Dependencies: B.1–B.9. Replace the placeholder README with the exact root command/URL, folder map, feature status, dependency disclosure, and explanations of the execution model. Add copyable examples for a `div`, nested children/text, ID/class/other attributes, click/scroll/key handling, forms, shared route state, and navigation requested by an action. Acceptance: every example runs through public imports without DOM patches or application-managed listeners; API/lifecycle/storage/browser limitations are documented.
- [x] **B.11 — Run the clean-checkout auditor walkthrough.** Dependencies: B.10. Recreate the documented startup using a clean temporary checkout/copy that includes the candidate changes. Build a small routed form/list interface from README instructions, and inspect dependencies/source for independent implementation. Acceptance: setup requires no internal edits or moving files; all general frontend tests and supported-browser checks pass; exact commands/results are recorded.

**B.1–B.3 verification boundary:** Implemented and verified with Node/Chrome fixtures,
trusted keyboard/Unicode editing and Chrome composition-engine automation. B.3
OS IME, real clipboard paste and cross-browser/mobile qualification remain release
gates; the checked task denotes implemented behavior, not broad input qualification.
See [batch evidence](docs/reports/task-B.1-B.3-inputs.md).

### Exit gate and artifacts

Deliver the assignment-ready runtime, public declarations, root README, API documentation, routed examples, browser/input support matrix, and auditor verification record. Pass click/scroll/key, IME/paste, route/back-forward, shared state, scheduler fairness, state-location, accessibility/focus, and disposal checks.

Before calling the general frontend API stable, resolve the applicable decisions in section 11, including the compatibility strategy for future deterministic APIs. Ship declarations with the first stable API release. Phase B completion does not imply that recording/replay is implemented.

## 8. Phase C — deterministic runtime

**Goal:** Reproduce committed state from a supported snapshot, versions, seed, and ordered input log regardless of render schedule.

### Tasks

- [x] **C.1 — Finalize deterministic serialization and versions.** Dependencies: 0.8, Phase B. Specify snapshot/recording/runtime/action-schema versions, canonical encoding/hash rules, object/alias identity, supported numeric/value cases, and import limits. Include logical clock/PRNG continuation state in restorable checkpoints. Acceptance: round trips preserve supported state meaning; incompatible/invalid inputs fail clearly; a versioned format ADR describes migration/rejection behavior.
- [x] **C.2 — Add controlled clock and seeded randomness.** Dependencies: A.3, C.1. Provide runtime services to actions and define seed initialization, logical timestamps, draw ordering, and transaction failure semantics. Acceptance: identical seeds/inputs yield identical draws/times; failed actions leave controlled services in the documented state, with no unrecorded advancement affecting later replay.
- [x] **C.3 — Implement fixed simulation ticks.** Dependencies: B.4, C.2. Add configurable tick duration, ordered tick input queues, pause/resume, elapsed-time accumulator, bounded catch-up, and a hidden-tab policy. Specify input assignment and actions dispatched from tick logic. Acceptance: tick IDs never silently skip; overload can lag with bounded per-frame work; fake 30/60/120 Hz and irregular schedules produce identical corresponding tick states.
- [x] **C.4 — Implement external-input and effect adapters.** Dependencies: C.1–C.3. Normalize viewport/layout/scroll measurements, storage reads, timers, and network/effect results outside actions. Define serializable success/error/cancellation inputs, ordering, origin metadata, and scope disposal. Acceptance: actions receive recorded values rather than querying ambient APIs; replay works with different live dimensions/network; late results cannot update disposed apps/routes contrary to the documented ownership policy.
- [ ] **C.5 — Integrate semantic event inputs.** Dependencies: C.4, B.2, B.3, B.6, B.8. Route keyboard/text/navigation/location inputs through the ordered recordable boundary. Specify which native observations become authoritative input and which remain browser-only presentation. Acceptance: key/repeat/held-key, IME/paste, route, and hydration fixtures produce identical committed values from recorded inputs.
- [ ] **C.6 — Add optional render interpolation.** Dependencies: C.3, A.7. Expose previous/current committed tick values and display-only alpha for opt-in bindings. Define alpha behavior during overload, pause, and resume; avoid extrapolation by accident. Acceptance: position/transform visuals can differ across frame rates while tick hashes match; interpolation cannot mutate state and ordinary text/forms use committed values.
- [ ] **C.7 — Record ordered transitions.** Dependencies: C.1–C.5. Capture a baseline snapshot/reference, seed/PRNG state, versions, action/payload order, measured inputs, tick IDs, and checkpoint metadata. Distinguish queued/dispatched/committed/failed inputs so failed transitions and nested dispatches are not replayed twice. Acceptance: export/import round trips; recorded nested action fixtures reproduce version order; exports happen only through explicit developer action.
- [ ] **C.8 — Bound recording memory and preserve baselines.** Dependencies: C.7. Enforce configurable action/byte limits, baseline advancement, periodic keyframes, and coordinated eviction. Budget snapshots and metadata, reject budgets that cannot hold a usable baseline, and define oversized-entry handling. Add explicit full-session memory/export limits and a visible limit-reached result. Acceptance: long runs stay within the documented accounting policy; every retained suffix is replayable; no silent full-session data loss occurs.
- [ ] **C.9 — Implement replay and divergence reports.** Dependencies: C.6–C.8. Restore baseline/control services, re-execute ordered inputs, suppress live effects/storage writes/navigation side effects, and compare committed checkpoint hashes. Define nested-dispatch replay ownership. Acceptance: first divergence identifies checkpoint/action/tick and expected/actual values or hashes; incompatible imports fail before partial replay; replay does not repeat live external effects.
- [ ] **C.10 — Verify deterministic boundaries and document them.** Dependencies: C.9. Add randomized recording/replay tests and varied frame schedules, retention windows, measured-input, async-result, and interpolation fixtures. Document synchronous coding rules, controlled services, format/versioning, and the limits of detecting ambient global reads. Acceptance: every supported fixture matches hashes at corresponding checkpoints; unsupported inputs and deliberate divergence fail clearly; root startup and earlier acceptance suites still pass.

### Exit gate and artifacts

Deliver the tick runtime, controlled services, input adapters, optional interpolation API, bounded recording, replay, divergence reporting, format documentation, and cross-schedule verification report. Replay restores state at checkpoints from snapshots/seed/versions/ordered inputs without relying on the current browser or network. Browser paint timing is outside the guarantee.

## 9. Phase D — history, inspector, and performance evidence

**Goal:** Make retained transitions inspectable and seekable, define undo behavior, and publish reproducible measurements.

### Tasks

- [ ] **D.1 — Define history and reversible-action policy.** Dependencies: Phase C. Specify seek versus undo, action grouping, irreversible external effects, navigation/persistence during inspection, expired history, and branching after undo. Acceptance: an ADR explains which actions can be undone and what happens to the discarded future; no claim implies reversal of completed network/storage side effects.
- [ ] **D.2 — Implement seek and undo/redo.** Dependencies: D.1. Restore the nearest preceding keyframe and replay to the requested retained transition. Keep live input/effects paused during inspection and restore clock/PRNG/input bookkeeping for continued execution. Acceptance: retained seeks match hashes within the configured replay interval plus restoration cost; undo/redo and branching are predictable; expired states fail clearly; resumed actions remain deterministic.
- [ ] **D.3 — Add development instrumentation.** Dependencies: C.10. Expose tick/version/action/input origins, payloads, state changes, dirty dependencies, binding evaluations, DOM write/listener counts, simulation/render duration, and frame timing. Bound diagnostic storage and make instrumentation optional. Acceptance: metrics describe actual work, do not change action ordering/hashes, and do not retain disposed resources or grow indefinitely.
- [ ] **D.4 — Build the development inspector.** Dependencies: D.2, D.3. Display transition selection, inputs, state changes, dependency-to-binding relationships, scheduling, resource counts, and performance. Show included recording values and explicit export controls. Acceptance: a developer can select a transition and explain its inputs and affected bindings; inspector cleanup works and its controls are keyboard accessible.
- [ ] **D.5 — Establish reproducible benchmark workloads.** Dependencies: D.3. Measure independent bindings, pre-frame bursts, keyed-list edits, moving elements, repeated mount/unmount, transaction churn, and replay throughput. Preserve equivalent-work reference baselines and deterministic workload seeds. Acceptance: scripts record environment, browser/version, machine, warmup, run count, workload source, raw samples, and checkpoint results.
- [ ] **D.6 — Measure and publish the technical report.** Dependencies: D.4, D.5. Report DOM writes, listeners, median/p95 frame scripting and update time, memory/GC observations, replay throughput, and hash correctness. Compare instrumented/uninstrumented runs where relevant. Choose numeric regression budgets only after measured baselines. Acceptance: every performance claim links to reproducible evidence; unavailable metrics, variance, strengths, and limitations are explicit.
- [ ] **D.7 — Complete product acceptance and release review.** Dependencies: D.6. Re-run all feature gates and the clean-checkout walkthrough. Review PRD coverage, API/docs/declarations, migrations, dependency disclosure, browser/input support, and resource cleanup. Acceptance: all required features have passing evidence; release notes list completed phases and remaining limitations without presenting future work as shipped.

### Exit gate and artifacts

Deliver history policy/API, seek/undo/redo, optional inspector, benchmark suite/raw results, technical report, and final acceptance record. A retained transition can be reproduced, inspected, and explained. Product completion requires all PRD requirements, not merely completion of an earlier release milestone.

## 10. Requirement-to-task coverage

The requirements below are mandatory product scope. A feature may span phases; the phase column identifies its acceptance milestone. Maintain links to actual tests and documentation as implementation proceeds.

| PRD ID | Acceptance milestone | Primary tasks | Required evidence |
| --- | --- | --- | --- |
| DOM-1 | A | A.6, A.8, A.10 | Public-API form, condition, and keyed-list example |
| DOM-2 | A | A.4, A.7, A.8, A.10 | Exact writes; unrelated nodes/focus preserved; keyed identity |
| STATE-1 | A/B | A.2, A.4, B.6 | Deep invalidation and state retained across routes |
| STATE-2 | A | 0.5, A.2, A.4, A.8 | Independent item-property versus structural invalidation |
| STATE-3 | A | A.5 | Lazy caching, dynamic dependencies, cycle rejection |
| ACTION-1 | A | 0.2–0.5, A.2, A.3 | Atomic versions, rollback, async rejection, nested order |
| SCHED-1 | A/B | A.7, B.4 | One latest-value write per dirty binding per batch; explicit flush |
| SCHED-2 | B | B.4 | Ordering and normal-work progress under sustained input |
| TIME-1 | C | C.3, C.10 | Matching tick states across frame rates; bounded catch-up |
| TIME-2 | C | C.6, C.10 | Different visuals with identical authoritative tick hashes |
| EVENT-1 | B | A.9, B.1, B.11 | Click/scroll/key behavior, native semantics, disposal |
| EVENT-2 | B/C | B.2, B.3, C.5, C.10 | Native editing checks and semantic IME/paste/key replay |
| INPUT-1 | C | C.4, C.5, C.9 | Layout/network replay with different live external values |
| ROUTE-1 | B | B.5, B.6, B.11 | Action/link navigation, direct loads, back/forward, shared state |
| PERSIST-1 | B | B.7, B.8 | Configured reload behavior, precedence, URL-loop prevention |
| RNG-1 | C | C.2, C.10 | Repeated seed/input draws and logical timestamps match |
| RECORD-1 | C | C.1, C.7, C.8 | Format round trip, limits, usable retained baseline |
| REPLAY-1 | C | C.9, C.10 | Checkpoint hashes match; first divergence reported |
| HISTORY-1 | D | D.1, D.2 | Retained seeks, undo/redo branches, expired-history errors |
| INSPECT-1 | D | D.3, D.4 | Selected transition shows inputs, changes, affected bindings/work |
| LIFE-1 | A–D | A.9, B.6, C.4, D.4 | Repeated scope/app/route cleanup returns resource counts to baseline |
| DOC-1 | B, maintained C/D | B.10, C.10, D.7 | Copyable public examples and clean-checkout walkthrough |
| PACK-1 | 0/B | 0.1, A.1, B.10, B.11 | Exact documented root start and import path |
| TECH-1 | All phases | 0.1, B.11, D.7 | Source/dependency review; no delegated frontend capabilities |

Additional PRD gates: transaction comparison is covered by 0.2–0.6/0.9; tagged-template adoption by 0.7; type inference and declarations by 0.8/B.9; accessibility/native semantics by A.6/B.1–B.3/B.11; performance evidence by 0.6/D.5/D.6.

## 11. Decision register

This register tracks recorded architecture choices and later open decisions, not stable public contracts. Phase 0 choices are in ADRs 0001–0004: elements/binding tokens, explicit action modes/acyclic data, COW/logical identity, and browser/input qualification targets. ADR 0005 records the implemented A.1 lifecycle/registration surface. ADR 0006 records A.2 production ownership, native revocation, successful no-op versions and conservative state/scratch growth limits. ADR 0007 records A.3 payload ownership, FIFO queues, parent-failure discard, sibling continuation and aggregate errors. ADR 0008 records A.4/A.5 exact observers, current-state read facades, lazy computed edges, disposal and post-commit notification failures. ADR 0009 records implemented declarative elements, binding scopes, native form properties and render-frame/flush semantics. ADR 0010 records keyed item cells, focus-preserving ranges and scoped click delegation. Final formats and release compatibility remain later gates below.

| Decision | Evidence needed | Decision gate |
| --- | --- | --- |
| Transaction strategy and stable graph identity | Shared correctness fixtures and measured cost/tails | 0.9, before production engine |
| Production state/scratch growth, revocation and no-op versions | Runtime fixture ports, growth/alias tests and port measurements | A.2, ADR 0006; internal contract implemented |
| Supported state/payload types, aliases, cycles, numeric cases | Validation and graph round-trip fixtures | 0.8/0.9; finalize snapshot rules in C.1 |
| Public element syntax and optional templates | Usability, parsing/cache, escaping, event ownership | 0.7/0.9 |
| Dispatch schema, nested order, failure and no-op behavior | Type fixtures and explicit transition cases | A.3, ADR 0007; implemented experimental contract |
| Supported browsers and input methods | API support review and native input tests | Initial matrix in 0.9; verified before B release |
| Router mode and direct-load requirements | URL, base-path, native link and back/forward cases | B.5, ADR 0013; implemented B.6 |
| Location precedence and URL ownership | Conflicting default/storage/query and loop fixtures | B.7, ADR 0014; implemented B.8 |
| Scheduler fairness and hidden-tab behavior | Sustained input and pause/catch-up tests | B.4 ADR 0012 implemented; ticks/hidden-tab policy C.3 |
| Format versions, canonical encoding, checkpoint metadata | ADR 0016; bounded graph/control round trips, canonical/golden/hash oracles and compatibility fixtures | C.1/C.2 implemented; recording implementation C.7–C.9 |
| Retention budgets, keyframe interval, oversized snapshot behavior | Byte accounting and eviction workloads | Draft before public API freeze; prove in C.8 |
| Undo/redo grouping and effect policy | Seek, branch, external-effect scenarios | D.1, before history API freeze |
| Final name, exports, and stable release surface | ADR 0015 defines experimental frontend/Phase C compatibility; public entry verified B.9–B.11 | Stable name/release freeze remains future work |

Resolve the PRD's “before API freeze” decisions before declaring the corresponding surface stable. A Phase B candidate may expose verified frontend APIs while deterministic formats remain experimental; an experimental format is not a frozen recording contract. If decisions force a contract change, update the PRD where necessary and publish the compatibility impact.

## 12. Verification strategy

### Test layers

| Layer | What it proves | First phase |
| --- | --- | --- |
| Shared engine/reference fixtures | Atomicity, aliases, arrays, property metadata | 0 |
| Runtime unit tests with controllable scheduling | Action order, dependencies, computed values, batching/fairness | A/B |
| Real-browser integration tests | Node identity, focus, native events, routes/history, storage | A/B |
| Native text/IME checks | Composition and editing behavior synthetic events cannot prove | B |
| Type fixtures | Dispatch inference and declared public API | 0/B |
| Seeded randomized transition tests | Collection edge cases and replay agreement/divergence | 0/C |
| Fake-time/render-schedule tests | Tick consistency, catch-up, interpolation isolation | C |
| Long-run retention/resource tests | Baseline budgets, keyframes, disposal, diagnostic bounds | A/C/D |
| Clean-checkout auditor walkthrough | Root setup, documented examples, public-only consumption | B, repeated C/D |
| Reproducible performance workloads | Measured cost, allocations/GC observations, evidence for claims | 0/D |

Test tooling can supply a runner, browser automation, assertions, and serving. It must not supply framework runtime behavior. Use deterministic fixtures to make failed randomized cases reproducible. Where browser APIs do not expose reliable allocation/GC metrics, distinguish retained heap, allocation profiling, and inferred observations explicitly.

### Planned command contract

The table below is the intended command contract. Root startup, smoke, spike tests/measurements, and type checks now exist; later browser/replay/final benchmark commands remain planned. The README publishes actual commands and prerequisites as they are implemented.

| Planned command | Purpose | Introduced |
| --- | --- | --- |
| `npm run dev` | Start the root browser example and report its URL | 0 |
| `npm run test:spikes` | Run identical transaction prototype fixtures | 0 |
| `npm run bench:spikes` | Produce engine comparison measurements | 0 |
| `npm test` | Run focused runtime correctness tests | A |
| `npm run test:browser` | Run public-API browser integration fixtures | A/B |
| `npm run test:types` | Check positive/negative declaration fixtures | 0/B |
| `npm run test:replay` | Run determinism, input, retention, divergence fixtures | C |
| `npm run bench` | Run documented final benchmark workloads | D |
| `npm run smoke` | Verify documented root startup/public imports | 0, expanded B |

Run relevant checks and the root startup smoke test after each milestone. Record exit codes, actual results, environment, and any browser/manual verification; a proposed command or screenshot alone is not proof of the full gate. Broaden regression checks when changes affect shared contracts.

## 13. Review, documentation, and release workflow

For each implementation increment:

1. Select task IDs whose dependencies are satisfied; read relevant PRD acceptance criteria and repository instructions.
2. Define observable behavior and unresolved decisions before editing public APIs or runtime semantics.
3. Implement the smallest reviewable increment with focused tests and a public example where appropriate.
4. Run relevant checks, update actual API documentation, and record evidence and limitations.
5. Review resource ownership, unsupported values, and effects/order where they are involved in the change.
6. Check completed tasks and phase gates only when the corresponding acceptance evidence exists.

Use ADRs for choices, the PRD for product requirements, this plan for task status/dependencies, the README/API docs for implemented usage, and reports for measurements. Keep these roles distinct so a planning sketch cannot be mistaken for a shipped API.

An implementation log entry should contain:

```text
Task ID:
Status / owner:
Change reference:
Observable behavior delivered:
Verification commands and results:
Environment / browser checks:
Documentation or ADR updated:
Remaining limitations / blocking dependency:
```

### Log

```text
Task ID: 0.1
Status / owner: done / agent
Change reference: Root scaffold, package.json, scripts/dev-server.js, scripts/smoke.js, scripts/bench-spikes.js, examples/basic/index.html, examples/basic/main.js, tests/smoke.test.js, src/index.js, src/index.d.ts, README.md
Observable behavior delivered:
  - Root project configured as standard ES module ("type": "module") with zero third-party runtime dependencies.
  - Zero-dependency static development server (scripts/dev-server.js) serving repository root, with GET / redirecting to /examples/basic/ and proper MIME types for browser module loading.
  - Minimal browser verification page (examples/basic/index.html & main.js) importing the public framework entry point natively in the browser without a compiler or bundler.
  - Native unit test runner configuration via Node.js built-in node:test (npm test).
  - Automated smoke test (npm run smoke) asserting exports, server boot, redirect, and HTTP module delivery.
  - Spike benchmark runner harness (scripts/bench-spikes.js / npm run bench:spikes).
  - Documented README.md with execution model rationale, quickstart, directory layout, and planned API contracts.
Verification commands and results:
  - npm test: 3 tests pass in 67ms via native node:test.
  - npm run smoke: Dev server booted on ephemeral port, GET /, GET /examples/basic/, GET /examples/basic/main.js, and GET /src/index.js returned expected HTTP statuses and MIME types; clean exit 0.
  - npm run bench:spikes: Node 26 / Darwin arm64 environment captured and displayed.
Environment / browser checks: Node.js v26.3.0, macOS Darwin 24.6.0 arm64, Apple M4. Native ES module browser compatibility verified via static file MIME configuration.
Documentation or ADR updated: README.md updated with execution model, architecture, quickstart, and illustrative examples; DEVELOPMENT_PLAN.md task 0.1 marked complete.
Remaining limitations / blocking dependency: Task 0.2 (Specify the prototype contract) is the next milestone. State transaction engines are placeholders awaiting 0.2–0.6 spikes.
```

```text
Task ID: 0.2
Status / owner: done / agent
Change reference: spikes/transactions/contract.js, spikes/transactions/reference-evaluator.js, spikes/transactions/fixtures.js, spikes/transactions/contract.test.js
Observable behavior delivered:
  - Specified the internal transaction interface (begin, read, write, commit, abort, run) and error hierarchy (TransactionActiveError, TransactionCompletedError, DraftRevokedError, UnsupportedTypeError, CircularReferenceError).
  - Defined supported type system (plain objects, arrays, serializable primitives) and explicit rejections (functions, symbols, DOM nodes, promises, circular references, non-finite numbers).
  - Implemented Reference Transaction Evaluator (createReferenceEngine) as an independent ground-truth oracle preserving graph aliases and enforcing leaked draft revocation.
  - Built comprehensive shared fixture suite (28 fixtures across 10 categories) covering primitive updates, nested objects, additions/deletions, arrays (push/pop/splice/sort/reverse/item edits), graph aliases (shared references across multiple paths), snapshot isolation, unsupported types, no-op commits, atomic rollback, and draft lifecycle.
Verification commands and results:
  - npm run test:spikes: 29 tests pass in 80ms validating all contract fixtures against the reference evaluator.
  - npm test: 3 smoke tests pass.
  - npm run smoke: dev server and root browser imports pass.
Environment / browser checks: Node.js v26.3.0, Darwin arm64.
Documentation or ADR updated: DEVELOPMENT_PLAN.md task 0.2 marked complete.
Remaining limitations / blocking dependency: Task 0.3 (Prototype copy-on-write transactions) and Task 0.4 (Prototype staged-operation transactions) will now implement concrete engines against this fixture suite.
```

```text
Task ID: 0.3
Status / owner: done / agent
Change reference: spikes/transactions/cow-engine.js, spikes/transactions/cow.test.js
Observable behavior delivered:
  - Built Copy-on-Write (COW) transaction engine (createCowEngine) with lazy shallow-copying on write.
  - Implemented true structural sharing: untouched object branches and untouched array elements retain strict reference equality (===) across versions.
  - Graph aliases and multi-parent nodes maintained: mutations via one alias immediately reflect across all alias paths during transaction, and committed tree preserves reference identity (state.primary === state.secondary).
  - Array mutations (push, pop, shift, unshift, splice, sort, reverse, index assignment) executed natively on COW copies with length tracking and change recording.
  - Property-level change metadata (type, path, key, oldValue, value) and normalized affected path collection.
  - Instant draft revocation on commit or abort via transaction lifetime token; leaked draft access throws DraftRevokedError.
Verification commands and results:
  - npm run test:spikes: 60/60 tests pass in 80ms (29 contract/evaluator tests + 31 COW tests).
  - Passed all 28 shared contract fixtures identically to the reference evaluator.
  - Dedicated structural sharing tests confirm untouched object properties (user.preferences, settings.features) and array items (list[0], list[2]) retain exact reference identity.
  - npm test: 3 smoke tests pass.
  - npm run smoke: root dev server and browser imports pass with exit code 0.
Environment / browser checks: Node.js v26.3.0, Darwin arm64.
Documentation or ADR updated: DEVELOPMENT_PLAN.md task 0.3 marked complete.
Remaining limitations / blocking dependency: Task 0.4 (Prototype staged-operation transactions) is the next milestone to build the competing engine for comparative benchmarking in 0.5–0.6.
```

```text
Task ID: 0.4
Status / owner: done / agent
Change reference: spikes/transactions/staged-engine.js, spikes/transactions/staged.test.js
Observable behavior delivered:
  - Built Staged-Operation transaction engine (createStagedEngine) using a target-keyed overlay and change journal.
  - Implemented read-your-writes overlay without immediate object cloning on write; mutations are staged in StagedRecord entries.
  - Array operations (push, pop, shift, unshift, splice, sort, reverse, index assignment) operate on a staged buffer, tracking length deltas and affected paths.
  - Target-keyed staging preserves graph aliases across multi-parent nodes and array elements during reads, writes, and commit materialization (state.primary === state.secondary).
  - Materialization at commit time constructs new state versions with full structural sharing (untouched subtrees and array elements maintain === reference equality).
  - Zero-cost rollback: abort() simply clears staging maps without leaving heap garbage from preemptive object copies.
  - Instant draft revocation on commit or abort via transaction lifetime token; leaked draft access throws DraftRevokedError.
Verification commands and results:
  - npm run test:spikes: 91/91 tests pass in 84ms (29 contract/evaluator tests + 31 COW tests + 31 Staged tests).
  - Passed all 28 shared contract fixtures identically to the reference evaluator and COW engine without relaxing semantics.
  - Dedicated structural sharing tests confirm untouched object branches and array items preserve strict reference identity.
  - npm test: 3 smoke tests pass.
  - npm run smoke: dev server and root browser imports pass with exit code 0.
Environment / browser checks: Node.js v26.3.0, Darwin arm64.
Documentation or ADR updated: DEVELOPMENT_PLAN.md task 0.4 marked complete.
Remaining limitations / blocking dependency: Task 0.5 (Compare correctness and identity) and Task 0.6 (Measure equivalent workloads) will now run automated randomized fixtures and comparative performance benchmarks between COW and Staged-Ops.
```

```text
Task ID: 0.5
Status / owner: done / Codex
Change reference: spikes/transactions/comparison.test.js, comparison-fixtures.js,
  graph.js, draft-view.js, engine-shell.js, updated engine/contract modules,
  spikes/transactions/README.md, docs/reports/task-0.5-correctness.md
Observable behavior delivered:
  - Reproduced and fixed 10 failures in the initial identity regressions.
  - Preserved unread aliases, held/moved/reinserted items, sparse arrays and keys.
  - Added engine-local stable object IDs and exact net property invalidations.
  - Added independent native state/observer oracle and 12 seeded sequences:
    5,760 programmed attempts plus 2,880 rollback-recovery no-ops.
  - Checked rollback on throw/abort/thenable/unsupported assignment/commit cycle,
    snapshot isolation, revocation, structural sharing, and alias graph topology.
Verification commands and results:
  - npm run test:spikes: 157/157 pass.
  - npm test: 3/3 pass.
  - npm run smoke: pass (localhost listen required sandbox escalation).
Environment / browser checks: Node.js v26.3.0, Darwin arm64; HTTP/module startup
  smoke only, no browser DOM behavior claimed.
Documentation or ADR updated: comparison report, spike README, root milestone
  status, task checklist, and this log. Production API/PRD unchanged by task 0.5.
Remaining limitations / blocking dependency: task 0.6 measurements and task 0.9
  selection remain pending. Commit/delta scans and temporary allocations must be
  benchmarked; previous zero-cost rollback descriptions are unmeasured.
```

```text
Task ID: 0.6
Status / owner: done / Codex
Change reference: benchmarks/transactions/, benchmarks/results/, scripts/bench-spikes.js,
  scripts/bench-spikes-worker.js, scripts/bench-spikes-browser.js, package.json,
  benchmarks/README.md, docs/reports/task-0.6-measurements.md
Observable behavior delivered:
  - Seven identical, bounded workloads at 128/1,024 rows across reference/COW/staged.
  - 126 isolated clean Node timing trials (7,560 samples) and 42 separate memory/GC
    profiles, with raw heap/RSS traces, natural GC entries and forced-GC timings.
  - 126 Chrome rAF trials (3,780 callback samples), frame interval observations,
    browser/machine versions, configuration and source SHA-256 fingerprints.
  - Matching alias/identity-aware hashes, versions and invalidation totals for all
    measured groups; independent native-model workload tests.
  - Published median/p95, memory/churn proxies, GC observations and limitations;
    no production engine selection or universal speedup claim.
Verification commands and results:
  - npm run test:benchmarks: 8/8 pass.
  - npm run test:spikes: 157/157 pass.
  - npm test: 3/3 pass.
  - npm run smoke: pass.
  - npm run bench:spikes and npm run bench:spikes:browser: full runs complete,
    equivalent-work checks pass; quick harness runs also pass.
Environment / browser checks: Apple M4, 10 cores, 16 GiB RAM, Darwin 24.6.0 arm64;
  Node v26.3.0/V8 14.6.202.34-node.20; isolated headless Chrome 154.0.8037.92/
  V8 15.4.80.19. Browser/localhost execution used approved sandbox escalation;
  no signed-in browser/profile used. Temporary browser profile removed by runner.
Documentation or ADR updated: measurement report, benchmark/spike READMEs, root
  README, checklist/status, and log. Public runtime and PRD unchanged by task 0.6.
Remaining limitations / blocking dependency: exact allocation, transient heap
  peaks, browser GC events, total traced frame/paint cost unavailable. Memory is
  one instrumented trial per case and includes harness/JIT noise. Tasks 0.7/0.8
  precede task 0.9 engine/syntax/schema decisions.
```

```text
Task ID: 0.7
Status / owner: done / Codex
Change reference: spikes/view-syntax/, scripts/check-view-syntax.js,
  benchmarks/results/view-syntax-1790896108425-a49740a2.json, package.json,
  docs/adr/0001-view-syntax.md, docs/reports/task-0.7-view-syntax.md
Observable behavior delivered:
  - Equivalent native form/list examples: elements, token templates, eager templates.
  - Exact token-binding tracking, safe dynamic text/attributes, owned events,
    cached static template parsing, conditional/keyed scopes and resource cleanup.
  - 40 browser checks, including trusted Enter/Tab, keyed focus/selection,
    rollback/coalescing, aliases, selective invalidation and rejected inline events.
  - 18 rotated-order measurement trials, 1,440 mount/update/reverse/dispose spans,
    separate cold parse/cache-hit/clone batches and source fingerprints.
  - ADR selects elements + bind.prop; optional templates deferred because eager
    expression provenance does not satisfy exact per-binding dependency tracking.
Verification commands and results:
  - npm run test:spikes: 164/164 pass (157 transaction + 7 syntax).
  - npm run check:view-syntax: 40/40 browser checks and full measurements pass.
  - npm run test:benchmarks: 8/8 pass; npm test: 3/3 pass.
  - npm run smoke: pass; quick browser harness also verified.
Environment / browser checks: Apple M4, Darwin 24.6.0 arm64, Chrome 154.0.8037.92 /
  V8 15.4.80.19, Node v26.3.0. Approved localhost/isolated-profile execution;
  no signed-in browser/profile used; temporary profile cleaned by runner.
Documentation or ADR updated: syntax ADR/report/spike guide, root README,
  checklist/status and this log. Public runtime/PRD unchanged by this task.
Remaining limitations / blocking dependency: one browser; no universal XSS,
  allocation/GC/paint or usability claims. IME/router/nested action scheduling
  remain later work. Task 0.8 precedes transaction/schema decisions in 0.9.
```

```text
Task ID: 0.8
Status / owner: done / Codex
Change reference: spikes/action-schema/, scripts/check-action-types.js,
  package.json/package-lock.json, docs/adr/0002-action-schema-serialization.md,
  docs/reports/task-0.8-actions-serialization.md, README.md
Observable behavior delivered:
  - Explicit no-payload/payload action modes and schema versions, typed draft /
    read-only state/payloads, inferred wrappers and correlated dispatch tuples.
  - Positive TypeScript/checked JavaScript and 25 independently verified negative
    type lines; runtime remains plain JS and independently validates untyped data.
  - Canonical versioned graph snapshots preserve aliases, distinct nodes, holes,
    undefined, -0, null prototypes, custom array keys and ordered own properties.
  - Cycles/unsupported inputs reject; malformed/unsafe/noncanonical/versioned
    imports and byte/node/property/depth/per-array/aggregate-slot limits checked.
  - 40 seeded alias-graph round trips and action adapters for all three engines.
  - Audited legacy Array-subclass normalization and repeated DAG validation;
    neither is approved as production behavior. Engine sources unchanged.
Verification commands and results:
  - npm run test:types: positive TS/JS pass; 25 negative lines reject; no emit.
  - Node combined suite: 286/286 pass (275 spike, 8 workload, 3 scaffold tests).
  - npm run smoke: root startup/public import checks pass.
  - npm ls --omit=dev: empty runtime dependency tree.
Environment / browser checks: Node v26.3.0, npm 11.16.0, TypeScript 5.9.3,
  Darwin 24.6.0 arm64. No new browser behavior/performance claim. TypeScript was
  installed from local cache as development tooling, without install scripts.
Documentation or ADR updated: schema/snapshot ADR, type matrix/evidence report,
  spike guide, root setup/tooling/status and this log. Public entry/PRD unchanged.
Remaining limitations / blocking dependency: production assignment/validation
  fixes, engine selection (0.9), nested/no-op policy (A.3), declarations (B.9),
  final checkpoint/control-service/version/recording contracts (C.1–C.9).
```

```text
Task ID: 0.9
Status / owner: done / Codex
Change reference: shared spike contract/type-policy tests; ADRs 0003/0004;
  docs/reports/task-0.9-architecture-review.md; fresh Node/Chrome/DOM JSON results;
  PRD v2.3, README/guides, decision/status tracking
Observable behavior delivered:
  - Committed task 0.8 separately as 515f406; task 0.9 is a separate change set.
    No push or Phase A implementation is included.
  - Fixed original Array-prototype rejection and completed-DAG memoization before
    selection; all three engines enforce the adopted ordinary data policy.
  - 17 new regression tests; descriptor-based validation avoids ordinary getter
    execution and preserves aliases while still rejecting active cycles.
  - Selected COW/logical object IDs with explicit timing/memory counterevidence;
    adopted existing view/action/type ADRs, proposed browser/native-input matrix.
  - Fresh full Node and Chrome measurements on corrected sources; historical
    artifacts unchanged. Production no-op versions/queues and remaining gates
    are explicit; public runtime remains a scaffold.
Verification commands and results:
  - Combined Node suite: 303/303 pass (292 spike, 8 workload, 3 scaffold).
  - npm run test:types: positive TS/JS pass; 25 negative lines reject, no emit.
  - npm run bench:spikes: 126 timing trials / 7,560 samples + 42 memory/GC profiles.
  - npm run bench:spikes:browser: 126 rAF trials / 3,780 callback samples.
  - Both full comparisons: all equivalent-work checks pass, source hashes match.
  - npm run check:view-syntax -- --quick: 40 DOM checks pass, measurements smoke-only.
  - npm run smoke: pass; npm ls --omit=dev: empty; links/diff checks pass.
Environment / browser checks: Apple M4, 10 cores, 16 GiB, Darwin 24.6.0 arm64;
  Node v26.3.0/V8 14.6.202.34-node.20, Chrome 154.0.8037.93/V8 15.4.80.19;
  TypeScript 5.9.3 development-only. Approved isolated Chrome/local server runs;
  no signed-in browser; profiles/servers cleaned by runners.
Documentation or ADR updated: ADRs/review, historical evidence follow-up notes,
  spike/benchmark guides, PRD/source-of-truth decisions, root milestones/setup.
Remaining limitations / blocking dependency: A.1 is next. No production core,
  queue/scheduler/computed/router, broad browser/real IME support, final formats,
  controlled services, history or replay implemented. Exact allocation/browser
  GC/whole-frame paint metrics unavailable. Existing ADR 0001 edit preserved.
```

```text
Task ID: A.1
Status / owner: done / Codex
Change reference: src/runtime/app.js, initial-state/schema/error/record modules;
  public index/declarations, public-only root example, Node/type/browser fixtures;
  isolated browser runner and tests/results JSON; ADR 0005/API/evidence docs
Observable behavior delivered:
  - Lazy/auto create/mount, private initial store/action registry, immutable
    state/context, owned text DOM/target claim and terminal/idempotent dispose.
    Explicit mount() defaults to #app at mount time; missing targets fail clearly
    and permit retry, invalid explicit targets never silently fall back.
  - Failed-mount unwind/retry, stale scope rejection, LIFO cleanup, aggregated
    errors and guarded synchronous error observation; initial graph guards.
  - Explicit typed schema registration; wrappers/dispatch clearly unavailable
    until A.3. Production imports never depend on spikes or third-party modules.
  - Root example mounts with mount() through public exports; browser verification
    imports it and calls dispose(). No manual DOM writes or target lookup needed.
Verification commands and results:
  - Combined Node tests: 331/331 pass (31 public, 292 spike, 8 workload).
  - npm run test:types: positive TS/JS + 45 negative lines pass, no emit;
    20 new public negatives, five public inference equalities, checked root JS.
  - npm run test:browser: 27 checks pass, including default lookup/retry/override,
    exact target claims, real DOM focus/selection,
    iframe/detached targets, cleanup failures and 100 lifecycle cycles.
  - npm run smoke: imports/lifecycle/root HTTP and runtime modules pass;
    npm ls --omit=dev: empty; source fingerprint/link/diff checks pass.
Environment / browser checks: Node v26.3.0, TypeScript 5.9.3 development-only,
  Darwin 24.6.0 arm64, Apple M4, isolated Chrome 154.0.8037.93/V8 15.4.80.19.
  In-app connection unavailable after discovery/troubleshooting; approved local
  isolated Chrome runner used, no signed-in profile, temporary resources closed.
Documentation or ADR updated: ADR 0005, docs/api/application.md, A.1 report,
  README/current API/startup, PRD lifecycle status and task/decision tracking.
Remaining limitations / blocking dependency: A.2 is next. No production COW
  commits, named execution/queues, reactivity/elements/events/routes/replay.
  Fixed initial guards are not final transaction/history budgets. No broad
  browser/native IME or performance/leak guarantee; API remains experimental.
  Existing ADR 0001 user changes preserved and excluded from the A.1 commit.
  A.1 committed as its own milestone at user request; no push or A.2 work included.
```

Release candidates should progress through the Phase A core gate, Phase B auditor gate, Phase C replay gate, and Phase D product gate. Releases explicitly state completed phases. No package publication, deployment, or separate demonstration-app work is implied by this planning document.

```text
Task ID: A.2
Status / owner: done / Codex
Change reference: src/runtime/state transaction/data/draft/graph modules;
  app-owned production store, fixture/oracle/type-policy/growth tests,
  browser integration and runtime benchmark scripts/datasets
Observable behavior delivered:
  - Deep COW transactions, frozen committed snapshots, stable IDs, alias/array
    semantics, untouched sharing and immutable net change metadata.
  - Atomic success/failure; every successful internal commit advances one version,
    including no-op data. Native draft revocation includes reflected access.
  - Descriptor/type/DAG validation and conservative graph/scratch growth guards;
    sparse slots, detached imports, text/keys and depth grafts cannot bypass them.
  - Public app owns/disposes the store; no direct engine exports or public action
    execution before A.3. No runtime spike/framework dependency.
Verification commands and results:
  - Combined Node tests: 424/424 (31 lifecycle, 86 transactions, 292 spike,
    15 workload); 12 seeds x 160 attempts plus 960 recovery no-op commits.
  - npm run test:types: positive TS/JS and 45 negative lines pass; no emit.
  - npm run test:browser: 33 Chrome checks pass, including six internal-engine
    cases and the public default-mount root example; root smoke passes.
  - npm run bench:runtime: final 84 timing trials/5,040 samples, 28 separate
    memory/GC profiles; every changing-workload equivalence check passes.
    Port has higher medians than spike; memory/GC observations are mixed.
  - npm ls --omit=dev: empty; source fingerprint/docs link/diff checks pass.
Environment / browser checks: Apple M4, 10 cores, 16 GiB, Darwin 24.6 arm64;
  Node 26.3.0/V8 14.6.202.34-node.20, TypeScript 5.9.3 development-only,
  isolated Chrome 154.0.8037.93/V8 15.4.80.19. In-app discovery unavailable;
  approved isolated runner used, browser/server/profile closed.
Documentation or ADR updated: ADR 0006, ADR 0003/0005 follow-up notes, A.2 report,
  public API status, README/benchmark guide, PRD and decision/task tracking.
Remaining limitations / blocking dependency: A.3 next; no public named execution,
  nested queues, subscriptions/computed/bindings/events/router/replay. Guards do
  not measure heap/history or bound arbitrary callback CPU. No universal speed,
  cross-browser/IME or leak guarantee. ADR 0001 user edits preserved; uncommitted,
  no push. Historical datasets remain separate from current source evidence.
```

```text
Task ID: A.3
Status / owner: done / agent
Change reference: src/runtime/actions/dispatch.js, src/runtime/app.js,
  src/runtime/errors.js, public declarations, tests/dispatch.test.js,
  browser/type fixtures and the root public-only initialize action example.
Observable behavior delivered:
  - Named synchronous actions execute through public dispatch/wrappers; owned
    payloads validate before bodies, modes enforce exact arity, async work rejects.
  - One complete version per successful body (including no-ops), atomic rollback
    and revocation on failure. Context getters read latest committed state.
  - FIFO staging until parent commit; failed parents/children drop descendants;
    siblings continue and terminal single/aggregate failures reach the outer call.
  - Bounded action/payload admission with per-batch recovery; reentrant guard,
    render, error-handler dispatch and action-time mount/dispose reject.
  - Shadowed native Promise returns cannot bypass sync guards; repeated Error
    instances report once in each new outer dispatch operation.
Verification commands and results:
  - npm test: 146/146 (31 lifecycle, 86 transactions, 29 new dispatch).
  - npm run test:spikes: 292/292; npm run test:benchmarks: 15/15.
  - npm run test:types: positive TS/checked JS and 46 negative lines pass.
  - npm run test:browser: 39/39 with final source fingerprints.
  - npm run smoke, npm ls --omit=dev, documentation links/fingerprints and
    git diff --check pass; no runtime dependencies or performance claim.
Environment / browser checks: Apple M4, Darwin 24.6.0 arm64, Node 26.3.0,
  TypeScript 5.9.3 dev-only; isolated Chrome 154.0.8037.93. Runner cleans its
  profile/server. No signed-in profile or third-party browser library used.
Documentation or ADR updated: ADR 0007, A.3 report, application API, README,
  PRD v2.4, lifecycle/transaction follow-ups and current task tracking.
Remaining limitations / blocking dependency: A.4 next. Text views still render
  once; no subscriptions, computed values, bindings, events, routes, controlled
  services or replay yet. Batch failure can follow earlier successful commits;
  callback effects/CPU and externally retained values are outside logical guards.
  A.3 committed as its own milestone at user request; no push.
```

### A.4/A.5 implementation batch — complete (3 October 2026)

- A.4 validated before A.5: 19 initial exact-dependency tests, 165 runtime tests,
  root startup smoke and existing types passed before dependent implementation.
- Final: 191 runtime + 292 spike + 15 workload tests pass; 55 negative type lines,
  positive TS/checked JS, 49 Chrome checks and root startup smoke pass.
- Delivered exact property/presence/key/array observers, current-state facades,
  lazy computed caches, chains/diamonds, dynamic replacement, cycle diagnostics
  and explicit/app/view disposal. Notification failures preserve committed
  versions and queued children. Detailed evidence and limits are in the
  [batch report](docs/reports/task-A.4-A.5-reactivity.md).
- Public guide, README, API references, ADR 0008 and PRD status are current.
  A.6 remains unimplemented. The user requested a commit after verification.
  The implementation commit includes final browser evidence; unrelated existing
  AGENTS.md changes and intermediate browser reports remain outside its scope.

## 14. Completion checklist

- [x] Both transaction strategies were measured on equivalent workloads; the selected strategy has an evidence-backed ADR (0003, task 0.9).
- [ ] All 24 PRD functional requirements have implemented public contracts, documentation, and passing acceptance evidence.
- [x] A clean candidate copy runs from the root and an auditor builds the documented form/list/routed interface using only public imports (B.11; revision not committed yet).
- [ ] Click, scroll, key, and semantic text inputs work with native focus/form behavior and verified cleanup.
- [x] Shared application state survives navigation; URL, route state, and configured state locations remain synchronized (B.6/B.8/B.11).
- [ ] Ticks, versions, controlled services, external inputs, bounded recording, and replay meet the deterministic contract.
- [ ] Interpolation changes visuals only; retention always preserves a usable baseline and bounded seeking.
- [ ] History policy, inspector, and benchmark report meet their acceptance gates.
- [x] Implemented frontend capabilities are independent; development dependencies and limitations are disclosed (B.11).
- [ ] Release notes distinguish implemented features from future extensions and make only evidenced performance claims.

**Current batch:** C.3/C.4 complete and verified; see [ticks/input report](docs/reports/task-C.3-C.4-ticks-inputs.md). Batch 4 committed as 35bd747; Batch 3 as c278bd0; Batch 2 as 24a0636. Batch 5 committed as 3a4c6b8; Batch 6 remains uncommitted; no push. Next: C.5/C.6. The frontend auditor still passes, with native OS/mobile/browser qualification open.

### A.6/A.7 implementation batch — complete (3 October 2026)

A.6 validated before A.7: 213 runtime tests, 66 negative type lines, 54 Chrome
checks and root smoke passed. A.7 adds 22 focused scheduler checks and five native
browser checks; final counts are 235 runtime, 292 spike and 15 workload tests,
67 negative type lines and 60 Chrome checks (including both public examples).
See [DOM API](docs/api/dom.md), [ADR 0009](docs/adr/0009-declarative-dom-frames.md)
and [batch evidence](docs/reports/task-A.6-A.7-dom-frames.md). The user requested a local commit after verification;
At that milestone, keyed lists, events, priorities/fairness budgets and deterministic
services remained unimplemented. Keyed lists and minimal clicks now ship in A.8/A.9.


### A.8/A.9 implementation batch — complete (5 October 2026)

A.8 validated before A.9: 256 runtime tests (21 focused keyed checks), 74 negative
type lines, 65 Chrome checks and root smoke passed. A.9 adds 16 focused click/resource
checks and six native browser checks; the public example also verifies native
Enter/Space activation, list identity/focus, actions and disposal. Final results:
272 runtime, 292 spike and 15 workload tests; positive TS/checked JS and 76 negative
type lines; 73 Chrome checks; root smoke and diff checks pass. Tests instrument
handlers/listeners, scopes, bindings, observers/computed/cells, subscriptions,
queued jobs/frames and owned nodes. Counts return to baseline across repeated
conditional/app cycles; stale scopes cannot handle clicks or write queued work.

Public exports/types, DOCUMENTATION.md, README, API references, PRD v2.9, ADR 0010
and the [batch report](docs/reports/task-A.8-A.9-keyed-events.md) describe implemented
behavior. `/examples/keyed/` consumes only public imports. Existing AGENTS.md and
browser reports are preserved outside the task commit. The user requested a local
commit after verification; no push was requested. A.10 is next. General native
event/cancellation APIs, input synchronization/IME, routing, priorities and replay
remain unimplemented. Resource-count checks are not a heap-collection proof;
rendering remains non-atomic and browser qualification is Chrome-only.


### A.10 core acceptance — complete (5 October 2026)

Owner: Codex. Change reference: uncommitted A.10 task diff; baseline
`7d85afd`. `/examples/core/` combines the counter, unrelated bound value, nested
profile field, conditional details and keyed rows using only public imports.
Six integrated Node checks and six native Chrome checks instrument evaluations,
setter calls and structural operations outside application code. Independent
MutationObserver records confirm one click: one version, one counter evaluation,
one text setter and one characterData mutation; unrelated bindings/structure
remain untouched. The failing action attempts changes across every section and
retains snapshot/version/UI/focus with zero reads, setters or mutations. Additional
checks cover item/nested exactness, focus-preserving reorder, add/remove resources,
conditional stale jobs/handlers, burst coalescing and terminal disposal.

Final: 278 runtime, 292 spike and 15 workload tests pass; positive TS/checked JS
(including the new core modules) and 76 independent negative type lines pass;
80 Chrome checks and root startup smoke pass. README, DOCUMENTATION.md,
application/DOM references, PRD v2.10 and metadata describe Phase A as complete;
no runtime contract/public API change was needed. Detailed evidence and limits:
[core acceptance report](docs/reports/task-A.10-core-slice.md). Existing AGENTS.md
changes/reports are preserved; nothing staged or committed. Next is B.1; general
events/cancellation, input synchronization/IME, routing, priorities, deterministic
services and replay remain unimplemented. Chrome qualification and ownership
counters do not establish cross-browser, heap or performance guarantees.

### B.1–B.3 native events and inputs — implemented (5 October 2026)

Native event maps/options and cancellation preserve A.9 click compatibility.
Semantic keyboard snapshots include held keys, repeat, modifiers and focus-loss
resets; semantic text snapshots use actual editing values with composition-aware
binding writes and focused selection preservation. Public declarations and the
new root-served inputs example are updated alongside the guide and API reference.
See [ADR 0011](docs/adr/0011-native-events-inputs.md) and
[verification](docs/reports/task-B.1-B.3-inputs.md).

Node tests, positive/negative type checks, Chrome browser checks and root smoke
checks cover this batch. OS IME, real clipboard paste, mobile and broad browser
qualification remain open. No routing/priorities/persistence/replay or separate
demonstration app is implemented by this batch. Committed at user request; not pushed.

### B.4–B.6 priorities and shared-state routing — complete (5 October 2026)

Owner: Codex. This batch implements immediate/frame/normal/idle scheduling with
bounded cooperative FIFO turns, scoped cancellation and explicit failure behavior.
ADRs 0012/0013 specify scheduling and routing before their implementations. History
(default) and hash mode expose frozen reactive location snapshots, ordered path
matching, params/query, native links, a scoped outlet and persistent app ownership.
Action-requested navigation waits for successful commit; rollback changes no URL.
Native traversal, direct loads and reload work; query changes retain editing focus.
The root routes example consumes only public imports, with explicit server fallback.

Final verification: 329 runtime, 292 spike and 15 workload tests pass; positive
TypeScript/checked JavaScript and 94 negative lines pass; 102 Chrome checks and
root startup smoke pass. Source fingerprints and limitations are in the report. Public guide, README/API references,
PRD v2.12 and metadata now describe this behavior. No performance or heap-collection
claim, persistence, deterministic services, recording/replay or separate demo app
is included. Next batch is B.7/B.8 state-location design/adapters. B.4–B.6 committed at user request; not pushed.

### B.7/B.8 state locations and hydration — complete (5 October 2026)

Owner: Codex. Baseline: Batch 2 commit 24a0636. ADR 0014 precedes the implementation
and defines one source per field, namespace/schema envelopes, guarded fallback,
URL ownership, internal input commits, batching, limits and error cleanup. Runtime
now restores selected local/session/URL fields before the first view, coalesces
normal writes after commits, preserves supported graph distinctions and follows
URL back/forward without feedback. Memory-only values reset on reload. Public
status/flush APIs, declarations, guide, README, references, PRD v2.13 and a
root-served public persistence example are current. Verification: 418 runtime,
292 spike and 15 workload tests; 101 negative type lines and checked JS; 106 Chrome
checks and root smoke pass. See [evidence](docs/reports/task-B.7-B.8-persistence.md).

No live distributed/cross-tab merging, automatic migrations/unload flushing,
recording/replay or separate demo app is included. Phase B remains incomplete.
Next is B.9–B.11 contract/documentation refinement and clean-checkout auditor
verification. Batch 3 was subsequently committed as c278bd0 at user request; no push.


### B.9–B.11 public contracts and auditor walkthrough — complete (6 October 2026)

Owner: Codex. Baseline: Batch 3 commit c278bd0. B.9 aligns async error-hook
checking with the existing runtime and adds public-entry diagnostics/type cases.
B.10 replaces stale README/planned snippets with a full routed native form/keyed
list, exact startup/import paths, lifecycle/persistence behavior, tooling and
browser/compatibility limits. ADR 0015 separates experimental frontend and future
deterministic versions. B.11 creates a clean temporary candidate, reconstructs
README files, runs root startup/tests before installing tooling, verifies locked
TypeScript/source independence and exercises the app in isolated Chrome.

Verification: 425 runtime, 292 spike and 15 workload tests; strict positive TS /
checked JavaScript and 108 independently rejected negative lines; 114 Chrome
checks including eight README-app checks; root smoke and empty runtime dependency
tree. Candidate sources stay unchanged during verification. See the report/raw
artifact for exact commands, hashes, environment and boundaries. The test runner
now discovers files explicitly rather than relying on newer Node's glob support;
Node 26 is verified, not every version in the Node 18+ range.

Batch 4 was subsequently committed as 35bd747 at user request. The frontend candidate auditor gate passes; broad OS
IME/clipboard/mobile/browser qualification and stable release freeze remain open.
Recording/replay/controlled services are unimplemented. Next: C.1/C.2 design and
implementation. No separate demonstration app or publication is included.


### C.1/C.2 checkpoints and controlled services — complete (6 October 2026)

Owner: Codex. Baseline: Batch 4 commit 35bd747. ADR 0016 preceded implementation
and specifies runtime/checkpoint/action versions, graph/hash rules, import budgets,
manual clock/PRNG continuation, failure semantics and the later recording format.
Public app snapshot/new-app restore and standalone hash APIs preserve supported
graph distinctions and state versions. Frozen scoped action services stage seeded
draws, commit with state, roll back on body/commit failure and expire afterward.
Manual logical microseconds advance explicitly outside active work. Parent-service
access during payload admission is blocked. Persistence graph encoding is factored
into a shared production codec without changing its existing wire format.

Verification: 486 runtime tests (44 checkpoint/hash and 17 controlled-service
cases), 292 spike and 15 workload tests; strict positive TS/checked JS and 119
independently rejected negative lines; 118 Chrome checks; clean-candidate auditor,
root smoke and empty runtime dependencies. Known/BigInt PRNG vectors and independent
Node/browser hash oracles pass; uninterrupted/restored manual continuation matches
across failures/FIFO and varied render boundaries. Guide/README/API/PRD v2.15,
ADR and runnable controlled-services example are updated. See the report/artifact
for commands, hashes, environment and limits.

Batch 5 committed as 3a4c6b8 at user request. At that milestone, fixed ticks, external adapters, interpolation,
recording/replay, undo/inspector and full native input/browser qualification remain
open. No new performance/security certification, deployment or separate demo app
is claimed. Next: C.3/C.4.

### C.3/C.4 fixed ticks and external inputs — complete (6 October 2026)

Owner: Codex. Baseline: Batch 5 commit 3a4c6b8. ADR 0017 precedes implementation.
Fixed ticks and bounded queues separate simulation from rendering. Scope-owned
external adapters normalize serializable success/error/cancel results and suppress
late work after disposal. Fixed checkpoints preserve authoritative continuation
and reject pending roots/effects. Public guide/example/types/PRD v2.16 are updated.
Final clean-candidate audit: 525 runtime tests (24 tick / 15 adapter), 292 spike
and 15 benchmark correctness tests; strict positive TS/checked JS and 127 negative
lines; 123 Chrome checks, root smoke and empty runtime dependencies. Every
candidate source fingerprint matches the final workspace. See the report/raw
artifact for exact commands, environment and limits.
No recording/replay, interpolation, semantic-input integration or performance
claim is included. Next: C.5/C.6. Batch 6 remains uncommitted; no push.
