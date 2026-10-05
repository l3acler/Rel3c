import { fail, requireSync } from './errors.js';

const LIMIT = 1024, NORMAL_BUDGET = 32, IDLE_BUDGET = 8;
export function createScheduler(run, report) {
  const lanes = { frame: new Set(), normal: new Set(), idle: new Set() };
  let host = globalThis, requestFrame = null, disposed = false, immediate = false;
  let normalHandle = null, idleHandle = null;
  const size = () => Object.values(lanes).reduce((total, lane) => total + lane.size, 0);
  const cancelNative = lane => {
    const handle = lane === 'normal' ? normalHandle : idleHandle;
    if (lane === 'normal') normalHandle = null; else idleHandle = null;
    if (!handle) return;
    if (handle.idle) handle.host.cancelIdleCallback?.(handle.id);
    else handle.host.clearTimeout(handle.id);
  };
  function drain(lane, budget, deadline) {
    const errors = [];
    let count = 0;
    while (!disposed && lanes[lane].size && count++ < budget) {
      if (lane === 'idle' && (lanes.normal.size ||
          (deadline && !deadline.didTimeout && deadline.timeRemaining() <= 0))) break;
      const task = lanes[lane].values().next().value;
      lanes[lane].delete(task);
      if (!task.active()) continue;
      const { callback } = task;
      try { run(() => requireSync(callback(), 'SCHEDULE_ASYNC', 'Scheduled work must be synchronous.')); }
      catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'Scheduled callbacks failed; remaining eligible work was attempted.');
  }
  function request(lane) {
    if (disposed || !lanes[lane].size || (lane === 'normal' ? normalHandle : idleHandle)) return;
    const timerHost = typeof host.setTimeout === 'function' ? host : globalThis;
    const ticket = { host: timerHost, id: null, idle: lane === 'idle' && typeof host.requestIdleCallback === 'function' };
    if (ticket.idle) ticket.host = host;
    const callback = deadline => {
      if (disposed || (lane === 'normal' ? normalHandle : idleHandle) !== ticket) return;
      if (lane === 'normal') normalHandle = null; else idleHandle = null;
      let failure;
      try { drain(lane, lane === 'normal' ? NORMAL_BUDGET : IDLE_BUDGET, deadline); }
      catch (error) { failure = error; }
      finally { request('normal'); request('idle'); }
      if (failure) report(failure);
    };
    if (lane === 'normal') normalHandle = ticket; else idleHandle = ticket;
    try {
      ticket.id = ticket.idle ? ticket.host.requestIdleCallback(callback, { timeout: 1000 }) :
        ticket.host.setTimeout(() => callback(), lane === 'idle' ? 32 : 0);
    } catch (error) {
      if (lane === 'normal') normalHandle = null; else idleHandle = null;
      throw error;
    }
  }
  return Object.freeze({
    schedule(lane, callback, active = () => true) {
      if (disposed) fail('APP_DISPOSED', 'Scheduling is disposed.');
      if (!['immediate', 'frame', 'normal', 'idle'].includes(lane)) fail('SCHEDULE_LANE_INVALID', 'Unknown scheduling lane.');
      if (typeof callback !== 'function') fail('SCHEDULE_CALLBACK_INVALID', 'schedule requires a synchronous function.');
      if (lane === 'immediate') {
        if (immediate) fail('SCHEDULE_REENTRANT', 'Immediate work cannot recursively schedule immediate work.');
        immediate = true;
        try { if (active()) run(() => requireSync(callback(), 'SCHEDULE_ASYNC', 'Scheduled work must be synchronous.')); }
        finally { immediate = false; }
        return () => {};
      }
      if (size() >= LIMIT) fail('SCHEDULE_LIMIT', 'An application supports at most 1,024 queued callbacks.');
      const task = { callback, active }; lanes[lane].add(task);
      try { if (lane === 'frame') requestFrame?.(); else request(lane); }
      catch (error) { lanes[lane].delete(task); throw error; }
      return () => {
        if (!lanes[lane].delete(task)) return;
        if (disposed) return;
        if (lane === 'frame') requestFrame?.();
        else if (!lanes[lane].size) cancelNative(lane);
      };
    },
    connect(view, frameDriver) {
      host = view ?? globalThis; requestFrame = frameDriver;
      if (lanes.frame.size) requestFrame?.();
    },
    hasFrames: () => lanes.frame.size > 0,
    flushFrames() {
      // Snapshot means reentrant frame scheduling waits for a later frame.
      const batch = [...lanes.frame], errors = [];
      for (const task of batch) {
        if (!lanes.frame.delete(task) || disposed || !task.active()) continue;
        const { callback } = task;
        try { run(() => requireSync(callback(), 'SCHEDULE_ASYNC', 'Scheduled work must be synchronous.')); }
        catch (error) { errors.push(error); }
      }
      if (lanes.frame.size) requestFrame?.();
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, 'Frame callbacks failed.');
    },
    counts: () => ({ scheduledWork: size(), normalTasks: lanes.normal.size, idleTasks: lanes.idle.size, frameTasks: lanes.frame.size }),
    dispose() {
      disposed = true; for (const lane of Object.values(lanes)) lane.clear(); requestFrame = null;
      const errors = [];
      for (const lane of ['normal', 'idle']) try { cancelNative(lane); } catch (error) { errors.push(error); }
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, 'Scheduler cleanup failed.');
    },
  });
}
