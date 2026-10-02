import { validateStateValue } from '../transactions/contract.js';

const dependencyKey = value => JSON.stringify(value);

export function createReactivity(engine, document) {
  const metrics = { evaluations: 0, viewEvaluations: 0, valueWrites: 0, structuralWrites: 0,
    templateParses: 0, templateClones: 0, elementCreates: 0, textCreates: 0,
    effects: 0, handlers: 0, listeners: 0 };
  let observer = null;
  let rendering = 0;
  let frame = null;
  let disposed = false;
  const effects = new Set();
  const subscriptions = new Map();
  const dirty = new Set();
  const proxies = new Map();
  const proxyIds = new WeakMap();
  let nodes;

  function index() {
    nodes = new Map();
    function visit(value) {
      if (value === null || typeof value !== 'object') return;
      const id = engine.getObjectId(value);
      if (nodes.has(id)) return;
      nodes.set(id, value);
      for (const key of Object.keys(value)) visit(value[key]);
    }
    visit(engine.getState());
    for (const id of proxies.keys()) if (!nodes.has(id)) proxies.delete(id);
  }
  index();
  const track = (targetId, kind, key = null) => observer?.dependencies.add(dependencyKey({ targetId, kind, key }));
  const identity = value => proxyIds.get(value) ?? engine.getObjectId(value);
  const raw = value => proxyIds.has(value) ? nodes.get(proxyIds.get(value)) : value;

  function readonly(original) {
    if (original === null || typeof original !== 'object') return original;
    const id = engine.getObjectId(original);
    if (proxies.has(id)) return proxies.get(id);
    const target = Array.isArray(original) ? [] : Object.create(Object.getPrototypeOf(original));
    const source = () => nodes.get(id) ?? original;
    const reject = () => { throw new TypeError('Committed state is read-only'); };
    const proxy = new Proxy(target, {
      get(_target, key, receiver) {
        if (typeof key === 'string') track(id, 'value', key);
        if (key === Symbol.iterator && Array.isArray(original)) track(id, 'iterate');
        return readonly(Reflect.get(source(), key, receiver));
      },
      has(_target, key) { track(id, 'has', String(key)); return key in source(); },
      ownKeys() { track(id, 'keys'); return Reflect.ownKeys(source()); },
      getOwnPropertyDescriptor(_target, key) {
        if (!Object.hasOwn(source(), key)) return undefined;
        return { value: readonly(source()[key]), writable: true,
          configurable: !(Array.isArray(original) && key === 'length'),
          enumerable: !(Array.isArray(original) && key === 'length') };
      },
      getPrototypeOf: () => Object.getPrototypeOf(original),
      set: reject, deleteProperty: reject, defineProperty: reject,
      setPrototypeOf: reject, preventExtensions: reject,
    });
    proxies.set(id, proxy);
    proxyIds.set(proxy, id);
    return proxy;
  }

  function scope(parent = null) {
    const value = { disposed: false, children: new Set(), effects: new Set(), cleanups: [],
      refresh() { for (const effect of value.effects) dirty.add(effect); for (const child of value.children) child.refresh(); },
      dispose() {
        if (value.disposed) return;
        value.disposed = true;
        for (const child of [...value.children]) child.dispose();
        for (const effect of [...value.effects]) effect.dispose();
        for (const cleanup of value.cleanups.splice(0).reverse()) cleanup();
        parent?.children.delete(value);
      } };
    parent?.children.add(value);
    return value;
  }

  function effect(owner, reader, priority = 2) {
    const clear = () => {
      for (const key of value.dependencies) {
        const observers = subscriptions.get(key);
        observers?.delete(value);
        if (!observers?.size) subscriptions.delete(key);
      }
      value.dependencies.clear();
    };
    const value = { dependencies: new Set(), priority, disposed: false,
      run() {
        if (value.disposed || owner.disposed) return;
        dirty.delete(value);
        clear();
        const previous = observer;
        observer = value;
        rendering++;
        metrics.evaluations++;
        try { reader(); } finally {
          rendering--;
          observer = previous;
          for (const key of value.dependencies) {
            if (!subscriptions.has(key)) subscriptions.set(key, new Set());
            subscriptions.get(key).add(value);
          }
        }
      },
      dispose() {
        if (value.disposed) return;
        value.disposed = true;
        clear(); dirty.delete(value); effects.delete(value); owner.effects.delete(value); metrics.effects--;
      },
    };
    owner.effects.add(value); effects.add(value); metrics.effects++;
    value.run();
    return value;
  }

  function flush() {
    if (frame !== null) document.defaultView.cancelAnimationFrame(frame);
    frame = null;
    let rounds = 0;
    while (dirty.size) {
      if (++rounds > 100) throw new Error('Render dependency cycle');
      const next = [...dirty].sort((a, b) => a.priority - b.priority);
      for (const value of next) if (dirty.has(value)) value.run();
    }
  }

  return { engine, metrics, scope, effect, readonly, raw, identity, track, flush,
    root: () => readonly(engine.getState()),
    node: id => readonly(nodes.get(id)),
    get subscriptionCount() { return [...subscriptions.values()].reduce((sum, values) => sum + values.size, 0); },
    transact(action, payload) {
      if (disposed) throw new Error('App is disposed');
      if (rendering) throw new Error('Actions cannot dispatch during render');
      validateStateValue(payload);
      const result = engine.run(draft => action(draft, payload));
      index();
      for (const dependency of result.affectedProperties) {
        for (const value of subscriptions.get(dependencyKey(dependency)) ?? []) dirty.add(value);
      }
      if (dirty.size && frame === null) frame = document.defaultView.requestAnimationFrame(flush);
      return result;
    },
    dispose() {
      disposed = true;
      if (frame !== null) document.defaultView.cancelAnimationFrame(frame);
      frame = null; dirty.clear(); proxies.clear();
    },
  };
}
