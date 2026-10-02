// Prototype-owned listeners. Bubbling delegates share one root listener/type.
export function createEvents(root, metrics) {
  const handlers = new WeakMap();
  const delegates = new Map();

  function invoke(handler, node, event) {
    const wrapped = new Proxy(event, {
      get(target, key) {
        if (key === 'currentTarget') return node;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    handler(wrapped);
  }

  function register(node, type, callback, scope) {
    if (!/^[a-z]+$/.test(type) || typeof callback !== 'function') throw new TypeError('Events require a named native event and function handler');
    if (handlers.get(node)?.has(type)) throw new Error('Duplicate event directive');
    let handler = callback;
    metrics.handlers++;
    let release;
    if (['scroll', 'focus', 'blur'].includes(type)) {
      const listener = event => invoke(handler, node, event);
      node.addEventListener(type, listener);
      metrics.listeners++;
      release = () => { node.removeEventListener(type, listener); metrics.listeners--; };
    } else {
      let record = delegates.get(type);
      if (!record) {
        const listener = event => {
          for (const current of event.composedPath()) {
            const registered = handlers.get(current)?.get(type);
            if (registered) invoke(registered.read(), current, event);
            if (event.cancelBubble || current === root) break;
          }
        };
        record = { listener, count: 0 };
        delegates.set(type, record);
        root.addEventListener(type, listener);
        metrics.listeners++;
      }
      record.count++;
      if (!handlers.has(node)) handlers.set(node, new Map());
      handlers.get(node).set(type, { read: () => handler });
      release = () => {
        handlers.get(node)?.delete(type);
        record.count--;
        if (!record.count) {
          root.removeEventListener(type, record.listener);
          delegates.delete(type);
          metrics.listeners--;
        }
      };
    }
    let disposed = false;
    scope.cleanups.push(() => {
      if (disposed) return;
      disposed = true;
      release(); metrics.handlers--;
    });
    return { update(next) {
      if (typeof next !== 'function') throw new TypeError('Event values must be functions');
      handler = next;
    } };
  }
  return { register };
}
