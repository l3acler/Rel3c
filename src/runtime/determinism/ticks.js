import { fail, FrameworkError } from '../errors.js';
import { readRecord } from '../records.js';
import { addUsage, zeroUsage } from '../state/data.js';
import { logicalTime } from './controls.js';

export function ownSimulation(options, registry, clock) {
  if (options === undefined) {
    if (clock.mode === 'fixed') fail('SNAPSHOT_CONFLICT', 'Fixed checkpoints require matching simulation configuration.');
    return null;
  }
  const { tickDuration, action, maxCatchUp = 8 } = readRecord(options, 'TICK_INVALID', 'simulation', ['tickDuration', 'action', 'maxCatchUp']);
  if (!logicalTime(tickDuration) || tickDuration === 0 || !Number.isInteger(maxCatchUp) || maxCatchUp < 1 || maxCatchUp > 1024)
    fail('TICK_INVALID', 'Ticks require positive safe integer microseconds and a catch-up budget of 1–1024.');
  if (action !== undefined && (typeof action !== 'string' || registry.get(action)?.input !== 'none'))
    fail('TICK_INVALID', 'The tick action must be a registered no-payload action.');
  if (clock.mode === 'fixed' && clock.tickDuration !== tickDuration)
    fail('SNAPSHOT_CONFLICT', 'Simulation duration does not match the fixed checkpoint.');
  return Object.freeze({ tickDuration, action, maxCatchUp });
}

export function createTicks(config, controls, dispatch, operation, report, hooks = {}) {
  const queue = new Map();
  let usage = zeroUsage(), sequence = 0, accumulator = 0, paused = true, busy = false, disposed = false;
  let host = null, document = null, frame = null, epoch = null;
  if (config) controls.fixed(config.tickDuration);
  const enabled = () => { if (!config) fail('TICK_MISSING', 'Configure simulation before using tick APIs.'); };
  function remove(id) {
    const entry = queue.get(id);
    if (!entry) return;
    queue.delete(id);
    for (const key of Object.keys(usage)) usage[key] -= entry.input.usage[key];
  }
  function cancelFrame() {
    const ticket = frame; frame = null; epoch = null;
    if (ticket !== null) host.cancelAnimationFrame(ticket.id);
  }
  function request() {
    if (!host || paused || disposed || document.visibilityState === 'hidden' || frame !== null) return;
    const ticket = { id: null }; frame = ticket;
    try { ticket.id = host.requestAnimationFrame(timestamp => {
      if (disposed || frame !== ticket) return;
      frame = null;
      try {
        operation(() => {
          const absolute = Math.round(timestamp * 1000);
          if (!logicalTime(absolute) || epoch !== null && absolute < epoch) fail('TICK_INVALID', 'Frame timestamps must be monotone finite values.');
          const elapsed = epoch === null ? 0 : absolute - epoch; epoch = absolute;
          advance(elapsed);
        });
      } catch (error) { paused = true; epoch = null; report(error); }
      finally { request(); }
    }); } catch (error) { if (frame === ticket) frame = null; throw error; }
  }
  function visibility() { cancelFrame(); try { hooks.frame?.(); } finally { request(); } }
  function advance(elapsed) {
    enabled();
    if (!logicalTime(elapsed) || !logicalTime(accumulator + elapsed)) fail('TICK_INVALID', 'Elapsed microseconds exceed the safe integer range.');
    if (paused) return 0;
    accumulator += elapsed;
    const errors = []; let count = 0;
    busy = true;
    try {
      while (accumulator >= config.tickDuration && count < config.maxCatchUp) {
        // Overflow must leave the pending numbered tick and its inputs untouched.
        const before = controls.snapshot.clock;
        if (!logicalTime(before.tick + 1) || !logicalTime(before.time + before.tickDuration))
          fail('CONTROL_LIMIT', 'Tick/time exceeds the safe integer range.');
        const performTick = () => {
          controls.nextTick(); accumulator -= config.tickDuration; count++;
          const tick = controls.snapshot.clock.tick;
          for (const [id, entry] of [...queue]) {
            if (entry.tick !== tick) continue;
            remove(id);
            if (!entry.active()) continue;
            try {
              if (entry.input.run) entry.input.run();
              else dispatch(entry.input.name, ...entry.input.args);
            } catch (error) { errors.push(error); }
          }
          if (config.action !== undefined) try { dispatch(config.action); } catch (error) { errors.push(error); }
          try { hooks.tick?.(); } catch (error) { errors.push(error); }
          if (errors.length) throw errors.length === 1 ? errors[0] : new AggregateError(errors, 'Tick root failed.');
        };
        try { if (hooks.runTick) hooks.runTick(controls.snapshot.clock.tick + 1, config.action ?? null, performTick); else performTick(); }
        catch (error) { if (!errors.includes(error) && !errors.length) errors.push(error); }
        if (errors.length) break;
      }
    } catch (error) { errors.push(error); }
    finally { busy = false; }
    if (errors.length) {
      paused = true; cancelFrame();
      try { hooks.frame?.(); } catch (error) { errors.push(error); }
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, 'Tick inputs failed; successful commits and the numbered tick remain consumed.');
    }
    hooks.frame?.();
    return count;
  }
  return Object.freeze({
    get busy() { return busy; },
    get pending() { return queue.size; },
    get status() { return Object.freeze({ enabled: !!config, paused, hidden: document?.visibilityState === 'hidden', accumulator, queuedInputs: queue.size,
      maxCatchUp: config?.maxCatchUp ?? null }); },
    enqueue(input, tick, active = () => true) {
      enabled();
      const clock = controls.snapshot.clock;
      tick ??= clock.tick + 1;
      const time = clock.time + (tick - clock.tick) * clock.tickDuration;
      if (!logicalTime(tick) || tick <= clock.tick || !logicalTime(time)) fail('TICK_INVALID', 'Inputs require a future safe tick and representable logical time.');
      if (queue.size >= 1024 || sequence >= Number.MAX_SAFE_INTEGER) fail('INPUT_LIMIT', 'Input queue or sequence limit exceeded.');
      let next;
      try { next = addUsage(usage, input.usage); }
      catch (cause) { throw new FrameworkError('PAYLOAD_LIMIT', 'Queued inputs exceed aggregate payload budgets.', { cause }); }
      const id = sequence + 1;
      queue.set(id, { input, tick, active }); usage = next; sequence = id;
      return Object.freeze({ sequence: id, tick, time, cancel: () => remove(id) });
    },
    advance,
    replayTick(runInputs) {
      enabled(); busy = true;
      const errors = [];
      try {
        controls.nextTick();
        try { runInputs(); } catch (error) { errors.push(error); }
        if (config.action !== undefined) try { dispatch(config.action); } catch (error) { errors.push(error); }
        try { hooks.tick?.(); } catch (error) { errors.push(error); }
      } finally { busy = false; }
      try { hooks.frame?.(); } catch (error) { errors.push(error); }
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, 'Replay tick contains failed work.');
    },
    pause() { enabled(); paused = true; cancelFrame(); hooks.frame?.(); },
    resume() { enabled(); paused = false; hooks.frame?.(); request(); },
    connect(view, ownerDocument) {
      if (!config) return;
      host = view; document = ownerDocument;
      document.addEventListener('visibilitychange', visibility);
      request();
    },
    disconnect() {
      const errors = [];
      try { cancelFrame(); } catch (error) { errors.push(error); }
      try { document?.removeEventListener('visibilitychange', visibility); } catch (error) { errors.push(error); }
      document = host = null;
      if (errors.length) throw new AggregateError(errors, 'Tick driver cleanup failed.');
    },
    dispose() {
      disposed = true; paused = true;
      try { this.disconnect(); } finally { queue.clear(); usage = zeroUsage(); }
    },
    counts: () => ({ tickInputs: queue.size, tickFrames: frame === null ? 0 : 1, tickListeners: document ? 1 : 0 }),
  });
}
