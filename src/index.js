/**
 * mini-framework - Deterministic Reactive Frontend Framework
 *
 * Public Entry Point
 *
 * Note: Under Phase 0 (Architecture Spikes), this is a documented placeholder.
 * Production implementations of state transactions, fine-grained reactivity,
 * declarative DOM abstractions, and routing will be integrated in Phase A & B
 * following prototype benchmarking and ADR decisions.
 */

export const VERSION = '0.1.0';

/**
 * Framework initialization status and capabilities placeholder.
 */
export const FRAMEWORK_INFO = Object.freeze({
  name: 'mini-framework',
  version: VERSION,
  phase: '0.1 - Architecture Spike Scaffold',
  capabilities: Object.freeze([
    'DOM-1: Declarative DOM abstraction (planned Phase A)',
    'DOM-2: Fine-grained DOM updates (planned Phase A)',
    'STATE-1: Deep reactive store (planned Phase A)',
    'ACTION-1: Transactional named actions (prototype in Phase 0, production Phase A)',
    'ROUTE-1: Reactive router (planned Phase B)',
    'EVENT-1: Framework event system (planned Phase B)',
    'TIME-1: Deterministic simulation ticks (planned Phase C)',
    'RECORD-1: Action recording & replay (planned Phase C)'
  ])
});

/**
 * Placeholder for the public application factory.
 * Full implementation will land in Phase A following the Phase 0 architecture spikes.
 *
 * @param {object} config Application configuration
 * @returns {object} Application instance
 */
export function createApp(config = {}) {
  return {
    version: VERSION,
    mounted: false,
    mount(target) {
      if (!target) {
        throw new Error('createApp.mount requires a valid target DOM element.');
      }
      this.mounted = true;
      return this;
    },
    dispose() {
      this.mounted = false;
    }
  };
}
