import { fail, requireSync } from '../errors.js';

// One native bubbling delegate per mounted application, present only while at
// least one owned handler exists. Application handlers receive no native Event.
export function createClickEvents(target, runEvent) {
  const handlers = new Map();
  let listening = false, disposed = false;
  const listener = event => {
    if (disposed) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (!path.length) for (let node = event.target; node; node = node.parentNode) path.push(node);
    const root = path.indexOf(target);
    if (root < 0) return;
    const route = path.slice(0, root + 1).map(node => handlers.get(node)).filter(Boolean);
    if (!route.length) return;
    runEvent(() => {
      const errors = [];
      for (const entry of route) {
        if (disposed || !entry.active()) continue;
        try {
          const { handler } = entry;
          requireSync(handler(), 'EVENT_ASYNC', 'Click handlers must be synchronous.');
        } catch (error) { errors.push(error); }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, 'Click handlers failed; remaining live handlers were attempted.');
    });
  };
  const stop = () => {
    try { if (listening) target.removeEventListener('click', listener); } finally { listening = false; }
  };
  return Object.freeze({
    register(node, handler, active) {
      if (handler === null || handler === undefined) return () => {};
      if (typeof handler !== 'function') fail('EVENT_HANDLER_INVALID', 'onClick requires a synchronous function, null or undefined.');
      if (disposed) fail('SCOPE_DISPOSED', 'Click delegation is disposed.');
      if (!listening) { target.addEventListener('click', listener); listening = true; }
      const entry = { handler, active };
      handlers.set(node, entry);
      return () => {
        if (handlers.get(node) === entry) handlers.delete(node);
        if (!handlers.size) stop();
        entry.handler = null;
      };
    },
    counts: () => ({ handlers: handlers.size, listeners: Number(listening) }),
    dispose() { disposed = true; try { stop(); } finally { handlers.clear(); } },
  });
}
