# mini-framework

A standalone JavaScript frontend framework built from scratch on a **deterministic reactive runtime** for interactive browser applications.

Read [DOCUMENTATION.md](DOCUMENTATION.md) for the public framework guide, runnable
examples, lifecycle, actions, exact observers, computed values, errors and limits. It is maintained alongside every
framework addition or change.

## Table of Contents

- [Overview & Purpose](#overview--purpose)
- [Execution Model: Why APIs Work This Way](#execution-model-why-apis-work-this-way)
- [Current Milestone Status](#current-milestone-status)
- [Zero-Dependency & Tooling Disclosure](#zero-dependency--tooling-disclosure)
- [Quick Start](#quick-start)
- [Current Public Application API](#current-public-application-api)
- [Repository Structure](#repository-structure)
- [Planned API Contracts & Examples](#planned-api-contracts--examples)
- [Verification & Quality Gates](#verification--quality-gates)

---

## Overview & Purpose

`mini-framework` is a project building a frontend framework with zero third-party runtime dependencies for applications where state transitions must be reproducible, fine-grained, and auditable. Architecture spikes and Phase A (A.1–A.10) are complete: lifecycle, transactions, named dispatch, exact dependencies, computed values, declarative DOM, keyed lists and scoped clicks. General events and routing remain Phase B tasks; deterministic services and replay remain Phase C tasks.

The runtime implements named transactions and frame-batched reactive rendering.
Deterministic simulation services remain planned:

1. **Fine-Grained Reactive Bindings (`DOM-1`, `DOM-2`, implemented A.6)**: State properties track which exact DOM nodes or computed values depend on them. Updating one property touches only its bound DOM node, leaving unaffected nodes and browser focus untouched.
2. **Transactional State Actions (`ACTION-1`, `STATE-1`, implemented A.3)**: Synchronous actions execute against a draft transaction view. Successful actions publish one immutable version atomically; throwing actions roll back completely without partial leakage. Exact subscriptions and lazy computed values are implemented in A.4/A.5.
3. **Frame-Coalesced Rendering (`SCHED-1`, implemented A.7)**: State mutations coalesce so that multiple commits before a render frame result in at most one latest-value DOM update per dirty binding.
4. **Deterministic Simulation & Replay (`TIME-1`, `RECORD-1`, `REPLAY-1`, planned Phase C)**: Simulation ticks operate on a logical clock and seeded PRNG, separating simulation rate from display refresh rate.

---

## Execution Model: Why APIs Work This Way

1. **Why Named Synchronous Actions?**
   Application state is read-only to external code. All mutations occur inside named, synchronous action functions. Async operations (such as `fetch`) execute outside transactions; their resolved responses enter as supported action payloads. This provides a complete-state transition boundary for later recording and replay.

2. **Why Fine-Grained Reactive Tracking Instead of a Virtual DOM?**
   Virtual DOM diffing requires re-executing render trees and diffing VNode objects on every state change. Fine-grained dependency tracking records dependencies at the property level. When property `state.user.name` updates, only the text node bound to `user.name` updates.

3. **Why Frame Batching and Separate Simulation Ticks?**
   Decoupling simulation updates from browser `requestAnimationFrame` allows applications to run at a consistent logical rate (e.g., 60 Hz simulation ticks) regardless of whether the user's monitor runs at 30 Hz, 60 Hz, 120 Hz, or 240 Hz. Optional render interpolation (`TIME-2`) visually smooths transforms without altering authoritative state hashes.

4. **Why Framework-Owned Event Delegation?**
   Native browser events are captured by framework-managed root delegates. Application components register declarative handlers via framework attributes rather than calling imperative `addEventListener()` on elements. This guarantees automatic resource cleanup (`LIFE-1`) when components unmount. Repeated-cycle resource checks cover owned cleanup; they do not prove heap collection.

---

## Current Milestone Status

- **Phase 0 — Architecture Spikes (Complete)**:
  - [x] **0.1 Root Scaffold**: Browser-native ES module setup, public entry placeholder, zero-dependency dev server, minimal browser example, and smoke test runner.
  - [x] **0.2 Prototype Contract**: Tiny begin/read/write/commit/abort transaction interface and shared test fixtures.
  - [x] **0.3 Copy-on-Write Prototype**: Structural sharing and property-level change tracking.
  - [x] **0.4 Staged-Operation Prototype**: Change-log staging and read-your-writes semantics.
  - [x] **0.5 Correctness & Identity Comparison**: Stable graph identities, exact invalidation metadata, and independent seeded correctness checks. See the [comparison report](docs/reports/task-0.5-correctness.md).
  - [x] **0.6 Workload Measurements**: Equivalent Node/browser timing, memory/GC observations, and median/p95 results. See the [measurement report](docs/reports/task-0.6-measurements.md).
  - [x] **0.7 View Syntax Evaluation**: Element functions with binding tokens selected; optional templates deferred. See the [syntax ADR](docs/adr/0001-view-syntax.md) and [browser evidence](docs/reports/task-0.7-view-syntax.md).
  - [x] **0.8 Action Schema & Serialization**: Typed named actions, independent runtime payload validation, and alias-preserving canonical snapshots; cycles rejected. See the [schema ADR](docs/adr/0002-action-schema-serialization.md) and [evidence report](docs/reports/task-0.8-actions-serialization.md).
  - [x] **0.9 Architecture Review & Selection**: COW selected after validation fixes and fresh equivalent-work benchmarks. Stable graph IDs, data/action/view decisions and proposed browser/input targets are documented. See [engine ADR](docs/adr/0003-transaction-engine-identity.md), [browser/input ADR](docs/adr/0004-browser-input-support.md), and [review/evidence](docs/reports/task-0.9-architecture-review.md).

- **Phase A — Core Runtime (Complete; experimental API)**:
  - [x] **A.1 Public Application Lifecycle**: Owned initial state/action registration, framework-called text views, mount/dispose, cleanup/error reporting and public-only root example. See [current API](docs/api/application.md), [ADR 0005](docs/adr/0005-application-lifecycle.md) and [verification](docs/reports/task-A.1-application-lifecycle.md).
  - [x] **A.2 Production Transactions**: App-owned COW store, frozen snapshots, stable IDs, aliases/arrays, atomic publication/rollback, native draft revocation and growth guards. See [ADR 0006](docs/adr/0006-production-transactions.md) and [verification/measurements](docs/reports/task-A.2-production-transactions.md).
  - [x] **A.3 Named Dispatch and Ordering**: Owned validated payloads, synchronous transactional actions, bounded FIFO queues and failure propagation. See [ADR 0007](docs/adr/0007-named-dispatch-ordering.md) and [verification](docs/reports/task-A.3-named-dispatch.md).
  - [x] **A.4 Exact Dependencies**: Property/presence/key/array subscriptions, aliases, dynamic branches and scope disposal.
  - [x] **A.5 Computed Values**: Lazy caches, chained/dynamic dependencies and useful cycle errors. See [reactivity API](docs/api/reactivity.md) and [batch verification](docs/reports/task-A.4-A.5-reactivity.md).

  - [x] **A.6 Declarative DOM**: Elements, exact text/attribute/class/style bindings, native form properties and conditional scopes. See [DOM API](docs/api/dom.md) and the [copyable form example](DOCUMENTATION.md#declarative-elements-and-bindings).

  - [x] **A.7 Render Frames**: Latest-value deduplication, equal-value write suppression, cancellation and explicit flush. See [batch verification](docs/reports/task-A.6-A.7-dom-frames.md).

  - [x] **A.8 Keyed Collections**: Insert/remove/reorder with retained nodes, focus and exact item bindings. See [collections API](docs/api/collections.md).

  - [x] **A.9 Scoped Clicks and Cleanup**: One bubbling delegate, zero-argument action callbacks and full scope disposal. See [click API](docs/api/events.md).

  - [x] **A.10 Core Acceptance**: One click commits once, evaluates one binding and changes one text node; rollback leaves state/UI unchanged. The integrated example also verifies nested fields, conditionals, keyed identity and cleanup. See [core guide](DOCUMENTATION.md#verified-core-example) and [verification](docs/reports/task-A.10-core-slice.md).

Registered actions now execute through public wrappers or dispatch. Each action commits once or rolls back; nested requests wait for a successful parent and run in FIFO order. Exact observers and lazy computed values work through public APIs. Declarative elements and bindings are shipped; general events, routing, controlled services, recording and replay remain future work.

> [!NOTE]
> Phase A's core gate passes. General frontend, deterministic runtime and tooling features in Phases B–D remain planned and are not claimed as shipped.

---

## Zero-Dependency & Tooling Disclosure

In compliance with `TECH-1` and `PACK-1`:
- **No Third-Party Frontend Frameworks**: All state management, DOM abstraction, reactive dependency tracking, router, and event handling are built entirely from scratch in vanilla JavaScript. React, Vue, Angular, Solid, Lit, MobX, Redux, Immer, or similar packages are strictly prohibited.
- **Zero Third-Party Runtime Dependencies**: The framework package ships standard browser-native ES Modules (`"type": "module"`) requiring no external runtime dependencies.
- **Development Tooling**:
  - `node:test` and `node:assert`: Built-in Node.js test runner for unit tests and smoke verification.
  - `node:http` and `node:fs`: Built-in Node.js modules for the local development server (`scripts/dev-server.js`).
  - Installed headless Google Chrome: isolated temporary-profile browser checks/measurements; no signed-in browser or frontend library is used.
  - TypeScript **5.9.3**: pinned development-only type checker for positive/negative fixtures. It emits no application code and supplies no framework behavior. Install it with `npm ci`; the lockfile records the exact dependency.

---

## Quick Start

### Prerequisites
- Node.js >= 18.0.0 (tested on Node.js v26)
- No installation required for root startup, Node correctness tests, or smoke checks. Type fixtures require `npm ci` to install the development-only checker.

### 1. Run the Development Server
Starts the local dev server and serves the root browser verification page:
```bash
npm run dev
```
Open [http://localhost:3000/](http://localhost:3000/) in your browser (redirects automatically to the basic example at `/examples/basic/`).

Try the current feature showcase at
[http://localhost:3000/examples/features/](http://localhost:3000/examples/features/):
a responsive Launch Board with computed progress, conditional content, native
form settings, burst updates and rollback. Its [instructions](examples/features/README.md)
explain native form reloads and console commands for live updates.

For clickable controls without a reload, open
[http://localhost:3000/examples/keyed/](http://localhost:3000/examples/keyed/).
The [keyed tasks example](examples/keyed/README.md) demonstrates public `onClick`,
item bindings, retained rows, scope cleanup and rollback. Native text edits remain
local until input synchronization is implemented.

The [core example](http://localhost:3000/examples/core/) combines the counter,
nested state, independent bindings, conditional details and keyed rows in one
public-import application. Its [guide](examples/core/README.md) explains the controls
and intentional rollback error. Tests measure one binding evaluation and one text
mutation for one increment; unrelated bindings do no work.

### 2. Run the Smoke Test
Verifies public imports, module integrity, and dev server response headers:
```bash
npm run smoke
```

### 3. Run Correctness Tests
Runs the built-in test suite:
```bash
npm test
```

Public lifecycle checks run in real isolated Chrome (installed Chrome required;
override its location with `MINI_FRAMEWORK_CHROME_PATH`):

```bash
npm run test:browser
```

Current verification: 278 runtime tests, 292 spike tests and 15 workload tests,
76 negative type lines, and 80 browser
lifecycle/transaction/dispatch/reactivity/DOM/list/click checks.
Type checks include the plain-JS root and core examples and require `npm ci`. Startup and
Node tests still need no dependency installation. Native input/IME and broad
cross-browser qualification remain later work.

### 4. Run Spike Benchmarks
Runs the architecture spike benchmark harness:
```bash
npm run bench:spikes
```

This runs seven equivalent workloads across eager reference, copy-on-write, and staged engines at 128/1,024 rows, with separate timing and memory/GC processes. Raw results are written to unique JSON files under `benchmarks/results/`. Browser frame-callback measurements use an installed Chrome and an isolated temporary profile:

```bash
npm run bench:spikes:browser
```

Use `-- --quick` on either benchmark command for a harness smoke check. See [benchmark prerequisites and methodology](benchmarks/README.md) and the [corrected selection evidence](docs/reports/task-0.9-architecture-review.md). COW is selected for A.2; these remain transaction spikes, not production renderer benchmarks. Run workload and transaction correctness separately:

```bash
npm run test:spikes
npm run test:benchmarks
```

Measure the bounded production port against the selected COW spike separately:

```bash
npm run bench:runtime
```

Use `-- --quick` only for a harness smoke check. The full run has 84 timing trials
and 28 separate memory/GC profiles. Collect without concurrent tests/benchmarks.
Changing-workload state/identity hashes, versions and net invalidation totals must
match; successful no-op versions and resource-limit behavior intentionally differ
from the old spike outside these cases. The current production port is slower,
not a speedup. See [A.2 measurements](docs/reports/task-A.2-production-transactions.md).

Task 0.5 verifies 157 transaction tests, including 12 seeded sequences and 5,760 programmed transaction attempts across reference, copy-on-write, and staged-operation engines. Task 0.9 selects COW as the Phase A basis and adds 17 type-policy tests; the engines remain isolated in `spikes/`, not shipped public runtime code.

Task 0.7 adds seven Node syntax tests and 40 browser checks, with three-round mount/update/reorder/dispose measurements. Run:

```bash
npm run check:view-syntax
```

Requires installed Chrome (override with `MINI_FRAMEWORK_CHROME_PATH`). `-- --quick` shortens measurements. For the runnable syntax examples, open `http://localhost:3000/spikes/view-syntax/` after `npm run dev`. These use spike exports, not the A.1 public lifecycle API. See the [spike guide](spikes/view-syntax/README.md).

Task 0.8 adds 111 action/serialization tests, plus strict positive TypeScript and checked-JavaScript fixtures with 25 independently checked negative lines:

```bash
npm ci
npm run test:types
npm run test:spikes
```

The action harness and codec run as plain JavaScript without compilation. Snapshots preserve aliases, holes, undefined, negative zero and property order; cycles and unsupported input types are rejected. These are experimental data snapshots, not replay checkpoints or public exports. Task 0.9 fixes the shared assignment/DAG validation gaps and remeasures both strategies. Phase 0's 292 spike tests, eight workload tests, 25 negative type lines and 40 syntax/DOM checks remain available; A.1 adds public lifecycle checks separately. See the [action/serialization spike guide](spikes/action-schema/README.md).

---

## Current Public Application API

With a `<div id="app"></div>` in the page, a browser module at the repository
root can run this today:

```js
import { createApp } from './src/index.js';

const app = createApp({
  initialState: { message: 'Hello from an owned application' },
  view: ({ state, onDispose }) => {
    onDispose(() => console.log('View disposed'));
    return state.message;
  },
});

app.mount(); // Finds #app; framework calls the view and appends its owned text.
// app.state is a deep-frozen copy; caller state is not frozen or mutated.
app.dispose(); // Runs cleanup and removes only app-owned content.
```

Use `app.mount()` with the conventional `#app` container, `app.mount(element)`
for a custom container, or pass `target` to createApp for automatic mounting.
Targetless creation stays headless/lazy. Missing `#app` throws clearly at mount
time and allows retry; explicit invalid targets never fall back to `#app`.
Disposal is terminal/idempotent; failed mounts clean up and may be retried.
Views accept text, finite numbers, null/undefined/booleans, arrays, binding tokens
and framework elements. See the [DOM reference](docs/api/dom.md).

A public form and conditional example is served at `/examples/dom/`. With
`<div id="app"></div>` in a root page:

```js
import { createApp, createActionSchema, div, form, label, input, span } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  rename: action(value => typeof value === 'string', (draft, value) => { draft.name = value; }),
}));
const app = createApp({ initialState: { name: 'Ada', visible: true }, schema,
  view: ({ bind, when }) => div({ id: 'profile', class: 'profile', 'data-kind': 'form' },
    form(label({ htmlFor: 'name' }, 'Name'), input({ id: 'name', value: bind.name })),
    when(bind.visible, () => span(bind.name)),
  ),
});
app.mount();
app.actions.rename('Grace'); // State commits now; DOM updates next frame.
app.flush(); // Optional synchronous visual boundary; avoids a duplicate frame write.
```

Bindings track each property read, so unrelated nodes retain identity and focus.
Native form editing remains local until event/state synchronization is implemented.
`onClick` now registers scoped click callbacks; scroll/key registration, shared route state and navigation remain future
APIs; the planned examples below are explicitly unimplemented.

Register an implemented click action using public imports:

```js
import { createApp, createActionSchema, div, button, span } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({ increment: action(draft => { draft.count++; }) }));
const counter = createApp({ initialState: { count: 0 }, schema,
  view: ({ bind, actions }) => div({ id: 'counter', class: 'counter', 'aria-live': 'polite' },
    span('Count: ', bind.count), button({ type: 'button', onClick: actions.increment }, 'Increment')),
});
counter.mount();
```

Click callbacks receive no arguments, so direct no-payload actions remain valid;
use closures for payloads. Nodes/scopes own handlers and scheduled visual work.
See [click API](docs/api/events.md) and [collections API](docs/api/collections.md).

`createActionSchema()` registers explicit no-payload/payload modes with inferred
types. Run named actions through public wrappers or dispatch:

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  setCount: action(Number.isFinite, (draft, count) => { draft.count = count; }),
}));
const app = createApp({ initialState: { count: 0 }, schema });
app.actions.increment(); // same as app.dispatch('increment')
app.dispatch('setCount', 10);
console.log(app.state.count, app.stateVersion); // 10, 3
app.dispose();
```

Payloads are copied/frozen before a pure synchronous guard that must return `true`.
Throwing or Promise/thenable-returning actions publish no state; successful no-ops
still advance the version. Both dispatch forms return `undefined`. Nested calls
validate now and execute after their parent commits, in FIFO order. Failed parents
discard their children. Failed children leave earlier commits intact; queued
siblings continue, and the outer call throws failures after draining. Batches have
action-count and aggregate payload limits. See [the implemented API](docs/api/application.md)
for ordering examples, exact bounds, error observation and cleanup details.

Root views construct once; explicit `bind`/`derive` tokens update affected DOM
on render frames. `app.flush()` applies latest pending bindings immediately. Exact
observers and lazy computed values also consume committed state through public APIs:

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
}));
const app = createApp({ initialState: { count: 1 }, schema });
const doubled = app.computed(state => state.count * 2);
const observer = app.observe(() => doubled.value);
app.actions.increment(); // Invalidates; doubled has not rerun.
console.log(observer.dirty, observer.read()); // true, 4
observer.dispose();
doubled.dispose();
app.dispose();
```

Observers establish dependencies with one initial read and refresh explicitly
with `read()`. Computed values first evaluate on `.value` access and stay cached
until dirty. Reads track exact fields, presence, keys and array structure;
branches replace old dependencies. View-context `observe`/`computed` resources
are disposed with their mount attempt; app resources last until disposal.
See [the public guide](DOCUMENTATION.md#exact-reactive-observers) for current-state
facades, error ordering and limits, and [the API reference](docs/api/reactivity.md)
for both signatures.  Dispatch inside a mounting view or payload guard rejects. The
raw `actions`/`seed` config sketches are not implemented. The root example commits
its initialize action before mounting one report using public imports only.
Browser verification also disposes that app to check owned DOM removal.

---

## Repository Structure

```text
mini-framework/
├── AGENTS.md                  # Project rules, constraints, and work order
├── Framework_PRD.md           # Product Requirements Document (PRD v2.5)
├── DEVELOPMENT_PLAN.md        # Implementation backlog and task tracking
├── README.md                  # Framework documentation & quickstart
├── package.json               # ES modules, zero runtime dependencies; dev type checker
├── package-lock.json          # Pinned development-tool installation
├── src/
│   ├── index.js               # Documented public entry point
│   ├── index.d.ts             # Public TypeScript declarations
│   └── runtime/               # Framework runtime subsystems (Phases A–D)
├── spikes/                    # Isolated prototype spikes (Phase 0)
│   ├── transactions/          # Copy-on-write vs staged-operations prototypes
│   ├── view-syntax/           # Element functions vs tagged templates
│   └── action-schema/         # Action definitions & serialization
├── examples/
│   └── basic/                 # Root-run browser example importing /src/index.js
│       ├── index.html
│       └── main.js
├── tests/                     # Unit, integration, and smoke test suites
│   └── smoke.test.js
├── scripts/                   # Zero-dependency development and test scripts
│   ├── dev-server.js          # Built-in HTTP development server
│   ├── smoke.js               # Smoke test script
│   └── bench-spikes.js        # Benchmark harness runner
├── benchmarks/                # Performance benchmarks & raw results
└── docs/                      # ADRs, API references, and technical reports
    ├── adr/
    ├── api/
    └── reports/
```

---

## Planned API Contracts & Examples

The following are future design sketches, not current runnable public examples.
Use the lifecycle example above for implemented A.1 usage. Task 0.7 selected
element functions with explicit binding tokens for Phase A; these exports and
inline-action config are not yet implemented. Optional templates remain deferred:
eager state expressions capture whole views rather than exact individual binding
dependencies. Runnable syntax examples use the separate spike entry. Routing
remains Phase B work; inline-action/seed options below are planned sketches only.

### 1. Tagged Template Syntax (Evaluated Prototype, Deferred)
The eager prototype runs natively without arrow wrappers, but its conservative whole-view tracking does not meet the exact-binding adoption gate. This preserves the evaluated PRD candidate for reference, not as a promised public API:

```js
import { createApp, html } from 'mini-framework';

const app = createApp({
  target: document.querySelector('#app'),
  initialState: { count: 0 },
  actions: {
    increment(draft) { draft.count += 1; },
    decrement(draft) { draft.count -= 1; }
  },
  view: ({ state, actions }) => html`
    <div class="counter-card">
      <button @click=${actions.decrement}>-</button>
      <span>Current Count: ${state.count}</span>
      <button @click=${actions.increment}>+</button>
    </div>
  `
});
```

### 2. Ergonomic Element Functions (Selected Core Direction)
Element functions eliminate boilerplate empty `{}` objects and support direct binding tokens with exact property/binding tracking:

```js
import { createApp, div, button, span } from 'mini-framework';

const app = createApp({
  target: document.querySelector('#app'),
  initialState: { count: 0 },
  actions: {
    increment(draft) { draft.count += 1; },
    decrement(draft) { draft.count -= 1; }
  },
  view: ({ state, bind, actions }) =>
    div({ class: 'counter-card' },
      button({ onClick: actions.decrement }, '-'),
      span('Current Count: ', bind.count),
      button({ onClick: actions.increment }, '+')
    )
});
```

### 3. Application-Wide Shared State Across Routes
Planned routed views share a single top-level application store, retaining state across navigation. This template-based example is a historical design sketch; the router and template API are not implemented public exports:

```js
import { createApp, createRouter, html } from 'mini-framework';

const router = createRouter([
  {
    path: '/',
    view: ({ state, actions }) => html`
      <div class="page">
        <h2>Welcome, ${state.user.name}!</h2>
        <a href="/settings">Go to Settings</a>
      </div>
    `
  },
  {
    path: '/settings',
    view: ({ state, actions }) => html`
      <div class="page">
        <h2>Editing Settings for: ${state.user.name}</h2>
        <a href="/">Back Home</a>
      </div>
    `
  }
]);

const app = createApp({
  target: document.querySelector('#app'),
  initialState: {
    user: { name: 'Alice' }
  },
  router
});
```

---

## Verification & Quality Gates

Every milestone is verified through executable tests, reproducible benchmarks, and clean-checkout walkthroughs:

| Gate | Check Command | What it Proves |
| --- | --- | --- |
| **Scaffold & Import** | `npm run smoke` | Server boots, root routes, and public imports work in clean checkout |
| **Unit Correctness** | `npm test` | Public APIs, immutability, zero-dependency requirements pass |
| **Spike Comparison** | `npm run test:spikes` | COW and Staged-Ops prototypes pass identical verification fixtures |
| **Spike Measurements** | `npm run bench:spikes` | Equivalent transaction latency, sampled heap/retention, and GC observations |
| **Browser Spike Measurements** | `npm run bench:spikes:browser` | Real rAF callback median/p95 and interval observations in isolated Chrome |
| **Benchmark Correctness** | `npm run test:benchmarks` | Equivalent workload state, identity, exact invalidations, and summary calculations |
