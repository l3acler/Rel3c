# mini-framework

A standalone JavaScript frontend framework built from scratch on a **deterministic reactive runtime** for interactive browser applications.

## Table of Contents

- [Overview & Purpose](#overview--purpose)
- [Execution Model: Why APIs Work This Way](#execution-model-why-apis-work-this-way)
- [Current Milestone Status](#current-milestone-status)
- [Zero-Dependency & Tooling Disclosure](#zero-dependency--tooling-disclosure)
- [Quick Start](#quick-start)
- [Repository Structure](#repository-structure)
- [Planned API Contracts & Examples](#planned-api-contracts--examples)
- [Verification & Quality Gates](#verification--quality-gates)

---

## Overview & Purpose

`mini-framework` is a product-grade, zero-dependency frontend framework designed for applications where state transitions must be reproducible, fine-grained, and strictly auditable.

Instead of relying on a virtual DOM (vDOM) diffing tree or generic state containers, `mini-framework` provides:
1. **Fine-Grained Reactive Bindings (`DOM-1`, `DOM-2`)**: State properties track which exact DOM nodes or computed values depend on them. Updating one property touches only its bound DOM node, leaving unaffected nodes and browser focus untouched.
2. **Transactional State Actions (`ACTION-1`, `STATE-1`)**: Synchronous actions execute against a draft transaction view. Successful actions publish one immutable version atomically; throwing actions roll back completely without partial leakage.
3. **Frame-Coalesced Rendering (`SCHED-1`)**: State mutations coalesce so that multiple commits before a render frame result in at most one latest-value DOM update per dirty binding.
4. **Deterministic Simulation & Replay (`TIME-1`, `RECORD-1`, `REPLAY-1`)**: Simulation ticks operate on a logical clock and seeded PRNG, separating simulation rate from display refresh rate.

---

## Execution Model: Why APIs Work This Way

1. **Why Named Synchronous Actions?**
   Application state is read-only to external code. All mutations occur inside named, synchronous action functions. Async operations (such as `fetch`) are executed outside transactions; their resolved responses are admitted as discrete, recordable action payloads. This prevents race conditions and makes execution logs fully replayable.

2. **Why Fine-Grained Reactive Tracking Instead of a Virtual DOM?**
   Virtual DOM diffing requires re-executing render trees and diffing VNode objects on every state change. Fine-grained dependency tracking records dependencies at the property level. When property `state.user.name` updates, only the text node bound to `user.name` updates.

3. **Why Frame Batching and Separate Simulation Ticks?**
   Decoupling simulation updates from browser `requestAnimationFrame` allows applications to run at a consistent logical rate (e.g., 60 Hz simulation ticks) regardless of whether the user's monitor runs at 30 Hz, 60 Hz, 120 Hz, or 240 Hz. Optional render interpolation (`TIME-2`) visually smooths transforms without altering authoritative state hashes.

4. **Why Framework-Owned Event Delegation?**
   Native browser events are captured by framework-managed root delegates. Application components register declarative handlers via framework attributes rather than calling imperative `addEventListener()` on elements. This guarantees automatic resource cleanup (`LIFE-1`) when components unmount, eliminating memory leaks.

---

## Current Milestone Status

- **Phase 0 — Architecture Spikes (In Progress)**:
  - [x] **0.1 Root Scaffold**: Browser-native ES module setup, public entry placeholder, zero-dependency dev server, minimal browser example, and smoke test runner.
  - [ ] **0.2 Prototype Contract**: Tiny begin/read/write/commit/abort transaction interface and shared test fixtures.
  - [ ] **0.3 Copy-on-Write Prototype**: Structural sharing and property-level change tracking.
  - [ ] **0.4 Staged-Operation Prototype**: Change-log staging and read-your-writes semantics.
  - [ ] **0.5 Correctness & Identity Comparison**: Alias preservation and collection reordering.
  - [ ] **0.6 Workload Measurements**: Memory, GC observations, and median/p95 latency benchmarks.
  - [ ] **0.7 View Syntax Evaluation**: Element functions vs optional tagged templates.
  - [ ] **0.8 Action Schema & Serialization**: Typing, validation, and snapshot encoding.
  - [ ] **0.9 Architecture Decision Record (ADR)**: Evidence-backed engine and syntax selection.

> [!NOTE]
> Per the project instructions, planned features for Phases A–D (core runtime, router, deterministic ticks, replay, inspector) are currently under development or scheduled. They are not claimed as shipped until their respective acceptance gates pass.

---

## Zero-Dependency & Tooling Disclosure

In compliance with `TECH-1` and `PACK-1`:
- **No Third-Party Frontend Frameworks**: All state management, DOM abstraction, reactive dependency tracking, router, and event handling are built entirely from scratch in vanilla JavaScript. React, Vue, Angular, Solid, Lit, MobX, Redux, Immer, or similar packages are strictly prohibited.
- **Zero Third-Party Runtime Dependencies**: The framework package ships standard browser-native ES Modules (`"type": "module"`) requiring no external runtime dependencies.
- **Development Tooling**:
  - `node:test` and `node:assert`: Built-in Node.js test runner for unit tests and smoke verification.
  - `node:http` and `node:fs`: Built-in Node.js modules for the local development server (`scripts/dev-server.js`).

---

## Quick Start

### Prerequisites
- Node.js >= 18.0.0 (tested on Node.js v26)
- No `npm install` required for development or running tests!

### 1. Run the Development Server
Starts the local dev server and serves the root browser verification page:
```bash
npm run dev
```
Open [http://localhost:3000/](http://localhost:3000/) in your browser (redirects automatically to the basic example at `/examples/basic/`).

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

### 4. Run Spike Benchmarks
Runs the architecture spike benchmark harness:
```bash
npm run bench:spikes
```

---

## Repository Structure

```text
mini-framework/
├── AGENTS.md                  # Project rules, constraints, and work order
├── Framework_PRD.md           # Product Requirements Document (PRD v2.2)
├── DEVELOPMENT_PLAN.md        # Implementation backlog and task tracking
├── README.md                  # Framework documentation & quickstart
├── package.json               # Package definition (ES modules, zero dependencies)
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

The following examples demonstrate the intended public API contracts to be delivered in Phase A and Phase B.

### 1. Creating Elements, Nesting, IDs, Classes, and Attributes
Elements are declared via clean element factory functions without requiring a compiler or JSX:

```js
import { div, h1, p, span, button } from 'mini-framework';

const view = div({ id: 'main-container', class: 'card-view' },
  h1({ class: 'title' }, 'Application Dashboard'),
  p({ 'data-section': 'intro' },
    'Nested text and ',
    span({ class: 'highlight' }, 'inline elements.')
  )
);
```

### 2. Attaching Event Handlers and Dispatching Actions
Event handlers are passed via declarative attributes. The framework handles delegation, bubbling, and unmount cleanup:

```js
import { createApp, div, button, text } from 'mini-framework';

const app = createApp({
  target: document.querySelector('#app'),
  initialState: { count: 0 },
  actions: {
    increment(draft) {
      draft.count += 1;
    },
    decrement(draft) {
      draft.count -= 1;
    }
  },
  view: ({ state, dispatch }) =>
    div({ class: 'counter' },
      button({ on: { click: () => dispatch('decrement') } }, '-'),
      text(() => `Current Count: ${state.count}`),
      button({ on: { click: () => dispatch('increment') } }, '+')
    )
});
```

### 3. Application-Wide Shared State Across Routes
Routed views share a single top-level application store. State survives navigation without resetting:

```js
import { createApp, createRouter, div, a, text } from 'mini-framework';

const router = createRouter([
  {
    path: '/',
    view: ({ state, dispatch }) =>
      div({},
        text(() => `Welcome! User: ${state.user.name}`),
        a({ href: '/settings' }, 'Go to Settings')
      )
  },
  {
    path: '/settings',
    view: ({ state, dispatch }) =>
      div({},
        text(() => `Editing settings for: ${state.user.name}`),
        a({ href: '/' }, 'Back Home')
      )
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
| **Spike Benchmarks** | `npm run bench:spikes` | Measured latency, memory allocation, and GC pause times recorded |
