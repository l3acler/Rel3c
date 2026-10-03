/**
 * mini-framework - Deterministic Reactive Frontend Framework
 *
 * Public Entry Point
 *
 * A.1 implements application lifecycle; A.2 adds the internal COW transaction store.
 * Named action execution, reactive DOM and routing remain later tasks.
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
  phase: "A.2 - Production Transactions",
  capabilities: Object.freeze([
    "Application lifecycle: owned initial state, schema registration, text mount/dispose (implemented A.1)",
    "Internal copy-on-write transactions, rollback, stable identity and growth guards (implemented A.2; public dispatch follows A.3)",
    "DOM-1: Declarative DOM abstraction (planned Phase A)",
    "DOM-2: Fine-grained DOM updates (planned Phase A)",
    "STATE-1: Deep reactive store (planned Phase A)",
    "ACTION-1: Transactional named actions (prototype in Phase 0, production Phase A)",
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
