/**
 * mini-framework - Deterministic Reactive Frontend Framework
 *
 * Public Entry Point
 *
 * A.1–A.9 implement lifecycle, COW actions, exact reactivity and frame-batched DOM.
 * B.1–B.8 add events, priorities, shared-state routing and state locations.
 * B.9–B.11 verify public contracts and the root auditor walkthrough.
 * A.10 verifies the integrated Phase A core through public imports.
 */

import { createApplication } from "./runtime/app.js";
import { createHistoryController } from "./runtime/history/controller.js";
import { createReplayController } from "./runtime/recording/replay.js";
export { createActionSchema } from "./runtime/actions/schema.js";
export {
  element,
  div,
  span,
  p,
  button,
  form,
  label,
  input,
  textarea,
  select,
  option,
  section,
  a,
  ul,
  li,
  when,
  keyed,
  outlet,
} from "./runtime/dom/nodes.js";
export { derive } from "./runtime/dom/bindings.js";
export { FrameworkError } from "./runtime/errors.js";
export { hashSnapshot } from "./runtime/serialization/checkpoint.js";
export {
  readRecording,
  serializeRecording,
} from "./runtime/recording/format.js";

export const VERSION = "0.1.0";

/**
 * Implemented core and planned later capabilities; public APIs remain experimental.
 */
export const FRAMEWORK_INFO = Object.freeze({
  name: "mini-framework",
  version: VERSION,
  phase: "D.1–D.2 - Retained History, Undo/Redo and Branching",
  capabilities: Object.freeze([
    "Application lifecycle: owned initial state, schema registration, text mount/dispose (implemented A.1)",
    "Copy-on-write transactions, rollback, stable identity and growth guards (implemented A.2)",
    "Named actions, owned validated payloads and bounded FIFO dispatch (implemented A.3)",
    "STATE-3: Lazy computed caching, chained dependencies and cycle detection (implemented A.5)",
    "DOM-1: Elements, native form properties, conditional and keyed scopes (implemented A.6/A.8)",
    "DOM-2: Exact frame-batched DOM bindings and explicit flush (implemented A.6/A.7)",
    "STATE-1: Property-level observers, dynamic dependency tracking and shared state across routes (implemented A.4/B.6)",
    "ACTION-1: Synchronous transactional named actions (implemented A.3; reactive observers implemented A.4)",
    "ROUTE-1: History/hash routing, reactive location, native links and shared state (implemented B.5/B.6)",
    "SCHED-2: Immediate/frame/normal/idle work with bounded cooperative turns (implemented B.4)",
    "PERSIST-1: Explicit memory/session/local/URL fields, guarded hydration and post-commit writes (implemented B.7/B.8)",
    "EVENT-1: Scoped native events, options and compatible zero-argument clicks (implemented B.1)",
    "EVENT-2: Semantic keyboard/text inputs and composition-safe bindings (implemented B.2/B.3; OS/mobile/cross-browser qualification remains open)",
    "Phase A: Public click/action/binding/list/cleanup acceptance verified (A.10)",
    "Public declarations, root documentation and routed form/list walkthrough (B.9–B.11; browser qualification remains limited)",
    "C.1/C.2: Versioned checkpoints, SHA-256 comparison, manual logical clock and transactional seeded randomness",
    "TIME-1: Fixed simulation ticks, ordered inputs, pause/hidden policy and bounded catch-up (implemented C.3)",
    "INPUT-1: Scoped serializable measurements, storage, timer and async effect results (implemented C.4; bounded recording C.7/C.8; isolated replay C.9/C.10)",
    "C.5: Owned semantic key/text/navigation/location/hydration packets and execution observation",
    "C.6: Optional display interpolation from frozen tick states; authoritative checkpoints unchanged",
    "RECORD-1: Ordered root/action/input traces, explicit versioned export/import and bounded baseline/keyframe retention (implemented C.7/C.8)",
    "HISTORY-1: Retained root seeking, declared reversible groups, undo/redo and explicit live branching (implemented D.1/D.2)",
    "REPLAY-1: Isolated root replay, first divergence and live-source suppression (implemented C.9/C.10; ambient globals remain application responsibility)",
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
export function createReplay(config) {
  return createReplayController(config, VERSION);
}

export function createHistory(config) {
  return createHistoryController(config, VERSION);
}
