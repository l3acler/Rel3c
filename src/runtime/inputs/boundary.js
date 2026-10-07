import { fail, requireSync } from '../errors.js';

export function createInputBoundary(clock, ticks, normalize, guarded, hooks = {}) {
  const listeners = new Set(); let sequence = 0, depth = 0, disposed = false;
  const live = () => { if (disposed) fail('APP_DISPOSED', 'Input boundary is disposed.'); };
  function run(packet, execute, receipt, active, queued) {
    if (!active()) return;
    const event = Object.freeze({ ...receipt, packet });
    const perform = () => {
      const id = hooks.input?.(event, queued);
      const failures = []; depth++;
      try {
        guarded(() => {
          for (const listener of [...listeners]) if (listeners.has(listener)) {
            try { requireSync(listener(event), 'INPUT_ASYNC', 'Input observers must be synchronous.'); }
            catch (error) { failures.push(error); }
          }
        });
        try { execute(); } catch (error) { failures.push(error); }
      } finally { depth--; }
      hooks.end?.(id, failures.length ? failures.length === 1 ? failures[0] : new AggregateError(failures) : undefined, failures.length > 0);
      if (failures.length === 1) throw failures[0];
      if (failures.length) throw new AggregateError(failures, 'Input execution/observation failed; successful work remains committed.');
    };
    return hooks.root ? hooks.root(event, queued, perform) : perform();
  }
  return Object.freeze({
    get executing() { return depth > 0; },
    replay(input, queued) {
      live();
      const { packet, execute } = normalize(input.packet);
      sequence = Math.max(sequence, input.sequence);
      return run(packet, execute, {sequence:input.sequence,tick:input.tick,time:input.time,derived:input.derived}, () => true, queued);
    },
    admit(value, { immediate = false, bootstrap = false, derived = false, active = () => true, tick } = {}) {
      live();
      const { packet, usage, execute } = normalize(value);
      immediate ||= bootstrap && (packet.kind === 'hydration' || packet.kind === 'location' && packet.cause === 'mount');
      if (sequence >= Number.MAX_SAFE_INTEGER) fail('INPUT_LIMIT', 'Input sequence overflow.');
      const id = sequence + 1;
      if (!immediate && clock().mode === 'fixed') {
        let ticket;
        ticket = ticks.enqueue({ usage, run: () => run(packet, execute,
          { sequence: id, tick: ticket.tick, time: ticket.time, derived }, active, true) }, tick);
        sequence = id;
        return Object.freeze({ ...ticket, sequence: id });
      }
      sequence = id;
      const current = clock(), receipt = Object.freeze({ sequence: id, tick: current.tick, time: current.time, derived });
      run(packet, execute, receipt, active, false); return receipt;
    },
    observe(callback) {
      live();
      if (typeof callback !== 'function') fail('INPUT_INVALID', 'observeInputs requires a synchronous callback.');
      if (listeners.size >= 1024) fail('INPUT_LIMIT', 'At most 1024 input observers per app.');
      // Separate subscriptions even when the caller passes the same callback.
      const listener = value => callback(value); listeners.add(listener);
      return () => listeners.delete(listener);
    },
    counts: () => ({ inputObservers: listeners.size }),
    dispose() { disposed = true; listeners.clear(); },
  });
}
