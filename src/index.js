/**
 * mini-framework - Deterministic Reactive Frontend Framework
 *
 * Public Entry Point
 *
 * A.1–A.5 implement lifecycle, COW named transactions and exact reactivity.
 * Reactive DOM and routing remain later tasks.
 */

import { createApplication } from "./runtime/app.js";
export { createActionSchema } from "./runtime/actions/schema.js";
export { FrameworkError } from "./runtime/errors.js";

export const VERSION = "0.1.0";

/**
 * Implemented and planned capabilities, without implying full core acceptance.
 */
export const FRAMEWORK_INFO = Object.freeze({
  name: "mini-framework",
  version: VERSION,
  phase: "A.5 - Computed Values",
  capabilities: Object.freeze([
    "Application lifecycle: owned initial state, schema registration, text mount/dispose (implemented A.1)",
    "Copy-on-write transactions, rollback, stable identity and growth guards (implemented A.2)",
    "Named actions, owned validated payloads and bounded FIFO dispatch (implemented A.3)",
    "STATE-3: Lazy computed caching, chained dependencies and cycle detection (implemented A.5)",
    "DOM-1: Declarative DOM abstraction (planned Phase A)",
    "DOM-2: Fine-grained DOM updates (planned Phase A)",
    "STATE-1: Property-level observers and dynamic dependency tracking (implemented A.4; routed sharing follows Phase B)",
    "ACTION-1: Synchronous transactional named actions (implemented A.3; reactive observers implemented A.4)",
    "ROUTE-1: Reactive router (planned Phase B)",
    "EVENT-1: Framework event system (planned Phase B)",
    "TIME-1: Deterministic simulation ticks (planned Phase C)",
    "RECORD-1: Action recording & replay (planned Phase C)",
  ]),
});

/**
 * Experimental public application lifecycle. See docs/api/application.md.
 *
 * @param {object} config Application configuration
 * @returns {object} Application instance
 */
export function createApp(config = {}) {
  return createApplication(config, VERSION);
}
