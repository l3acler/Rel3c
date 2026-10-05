# Agent instructions: mini-framework

## Project purpose

Build the JavaScript frontend framework described in [Framework_PRD.md](Framework_PRD.md). The framework is the product. It must provide a usable DOM abstraction, routing, state management, and event handling, with a runnable root folder and documentation for a new user. The assignment's separate demonstration app is a later integration task; do not let its implementation drive the framework architecture.

Read the PRD before changing public APIs or runtime semantics. User instructions take precedence over this file. If the PRD and assignment conflict, preserve the assignment's mandatory requirements and report the conflict.

## Non-negotiable constraints

- Implement the framework's DOM, state, routing, and event capabilities yourself in JavaScript. Do not use React, Vue, Angular, Solid, Lit, MobX, Redux, Immer, or another frontend/state framework to supply these capabilities. Test runners and a simple development server are allowed; disclose them.
- The framework owns the application lifecycle and calls registered views, actions, and event handlers. Application examples consume public exports and do not patch DOM nodes or call `addEventListener()` for normal application behavior. Internal browser listeners are allowed.
- Keep the package runnable from its root. Maintain a documented public entry point and a one-command or clearly specified browser-module startup path.
- Preserve native HTML behavior, keyboard access, focus, form semantics, and browser history.
- Do not describe planned features as implemented or claim a speedup or novelty without evidence.

## Work order

1. **Phase 0 — architecture spike (current milestone).** Scaffold the root project. Prototype a copy-on-write transaction view and a staged-operation transaction view behind the same tiny API. Exercise nested objects, array insertion/reorder, aliases, rollback on throw, and property-level invalidation. Compare correctness, allocation, garbage collection, and median/p95 update time on identical workloads. Write an architecture decision record; keep spike code separate from public runtime code.
2. **Phase A — core.** Implement the selected transaction engine, dependency tracking, computed values, declarative DOM, keyed lists, and lifecycle cleanup. Prove a click can dispatch an action, commit state, and update one bound text node without touching an unrelated node.
3. **Phase B — assignment-ready framework.** Add click/scroll/keyboard and text-input handling, routing with URL/state synchronization, app-wide state across routes, root-run setup, Markdown documentation, and public API examples. Make the auditor walkthrough pass from a clean checkout.
4. **Phase C — deterministic runtime.** Add fixed ticks, logical time, seeded randomness, external-input adapters, optional render interpolation, bounded recording, and replay.
5. **Phase D — tooling.** Add time travel/undo policy, inspector, and reproducible benchmarks.

Complete the task the user actually requests; this order is a default dependency map, not permission to ignore a direct request. Keep each change reviewable and report what works, what remains, and the commands/results used to verify it.

## Runtime contracts

- Committed state is read-only to application code. Named actions are synchronous transactions. A successful action publishes one state version; a throwing action publishes none. Reject Promise-returning actions and queue nested dispatches in a defined order.
- Actions use their transaction view, serializable payload, and controlled clock/random services. Browser layout, scroll/viewport data, storage reads, network results, and other ambient values enter via recordable external inputs. Async effects dispatch their results as actions.
- Track dependencies at property and binding level. Coalesce dirty visual bindings and commit latest DOM values on render frames; dispose subscriptions and handlers on unmount.
- Keep simulation ticks and render frames separate. Optional interpolation affects display values only. Replay must reproduce committed state at checkpoints from the same snapshot, seed, versions, and ordered inputs.
- Bound history memory. A retained action sequence must have a usable baseline snapshot; periodic checkpoints support seeking. Treat recording formats and action schemas as versioned.
- Do not choose a transaction strategy by assertion. The PRD requires a measured comparison. Tagged-template syntax is also a prototype decision, not an assumed public API.

## Verification and documentation

- Maintain root [DOCUMENTATION.md](DOCUMENTATION.md) as the public framework guide. Every framework addition or change must update this guide in the same change before the work is considered complete. Update the relevant sections with what users can do, why the API behaves that way, copyable examples using public imports, and applicable arguments, errors, cleanup, limits or compatibility changes. Internal changes should document the affected behavior or guarantee when relevant. Keep existing explanations current rather than only appending a development log. Mark future features explicitly as unimplemented; never present planned APIs as runnable examples. Keep `README.md` and detailed API references consistent with the guide. ADRs, task reports and this instruction file do not substitute for public documentation.
- Add focused tests for the behavior being implemented. Core tests should cover rollback, nested ordering, arrays/reorders, aliases, exact invalidation, keyed node identity, route/back-forward behavior, shared state, click/scroll/key handling, disposal, and replay when those features exist.
- Run the relevant tests and root startup smoke test after each milestone. Record benchmark environment and workload; compare equivalent behavior and report median/p95 and memory observations before making performance claims.
- The root `README.md` must explain why the framework APIs work as they do and provide copyable examples of creating a `div`, nesting elements, adding ID/class/other attributes, registering an event, updating shared state, and navigating between routes. An auditor should be able to use public imports without reading runtime internals.
- Keep `Framework_PRD.md` as the source of truth for feature acceptance criteria. When a design choice changes, update the relevant documentation and explain the reason in the change summary.
