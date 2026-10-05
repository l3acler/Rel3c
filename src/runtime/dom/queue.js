// Per-application visual work. Failures remain pending for an explicit retry or
// a later commit, without scheduling an endless failing frame loop.
export function createRenderQueue(window, render, report, scheduler) {
  const pending = new Set();
  let frame = null, generation = 0, disposed = false;
  const cancel = () => {
    generation++;
    const handle = frame;
    frame = null;
    if (handle !== null) window?.cancelAnimationFrame?.(handle);
  };
  const flush = () => {
    cancel();
    if (disposed) return;
    const errors = [];
    const processed = new Set();
    // Cleanup can invalidate a surviving consumer of a removed computed value.
    // Consume newly dirty work too, without evaluating any binding twice.
    for (;;) {
      const batch = [...pending].filter(job => !processed.has(job))
        .sort((a, b) => a.depth - b.depth || Number(b.structural) - Number(a.structural));
      if (!batch.length) break;
      for (const job of batch) {
        processed.add(job);
        pending.delete(job);
        if (!job.active()) continue;
        try { job.run(); } catch (error) { if (job.active()) pending.add(job); errors.push(error); }
      }
    }
    try { scheduler?.flushFrames(); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'DOM bindings failed; other bindings completed.');
  };
  return Object.freeze({
    add(job) { if (!disposed) pending.add(job); },
    delete(job) { pending.delete(job); },
    schedule() {
      if (disposed) return;
      if (!pending.size && !scheduler?.hasFrames()) { if (frame !== null) cancel(); return; }
      if (frame !== null || typeof window?.requestAnimationFrame !== 'function') return;
      const expected = ++generation;
      frame = window.requestAnimationFrame(() => {
        if (disposed || expected !== generation) return;
        frame = null;
        try { render(flush); } catch (error) { report(error); }
      });
    },
    flush,
    counts: () => ({ queuedBindings: pending.size, frames: Number(frame !== null) }),
    dispose() { disposed = true; pending.clear(); cancel(); },
  });
}
