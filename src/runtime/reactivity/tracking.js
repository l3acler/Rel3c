import { fail, requireSync } from "../errors.js";
import { indexGraph } from "../state/graph.js";

// Logical node IDs survive COW copies and array moves. Read facades resolve the
// latest reachable node; frozen snapshots remain the ordinary app.state API.
export function createTracking(store) {
  let nodes = indexGraph(store.getState(), { get: store.getObjectId });
  const facades = new Map(), subscriptions = new Map(), resources = new Set();
  const evaluationStack = [], pendingCallbacks = new Set();
  let active = null, notifying = false, disposed = false, closing = false, nextLabel = 1, suppressTracking = 0;
  const token = (id, kind, key = null) => JSON.stringify([id, kind, key]);
  function live() {
    if (disposed) fail("SCOPE_DISPOSED", "Reactive application scope is disposed.");
  }
  function track(id, kind, key) {
    if (active && !suppressTracking) active.next.add(token(id, kind, key));
  }
  function readonly() {
    fail("STATE_READONLY", "Tracked committed state is read-only; use a named action draft.");
  }
  function wrap(value) {
    if (value === null || typeof value !== "object") return value;
    const id = store.getObjectId(value);
    if (facades.has(id)) return facades.get(id);
    // Shadow targets avoid frozen-data Proxy invariants when wrapping children.
    const shadow = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    const current = () => {
      live();
      const node = nodes.get(id)?.value;
      if (!node) fail("STATE_DETACHED", "Tracked state node is no longer reachable. Read it again from the state root.");
      return node;
    };
    const proxy = new Proxy(shadow, {
      get(_target, key, receiver) {
        const node = current();
        if (typeof key === "string") track(id, "value", key);
        if (Array.isArray(node) && !Object.hasOwn(node, key) && [Symbol.iterator, "keys", "values", "entries"].includes(key))
          track(id, "iterate");
        const result = Reflect.get(node, key, receiver);
        return Object.hasOwn(node, key) ? wrap(result) : result;
      },
      has(_target, key) {
        const node = current();
        const prototype = Object.getPrototypeOf(node);
        if (typeof key === "string" && !(prototype && Reflect.has(prototype, key))) track(id, "has", key);
        return Reflect.has(node, key);
      },
      ownKeys() {
        track(id, "keys");
        return Reflect.ownKeys(current());
      },
      getOwnPropertyDescriptor(_target, key) {
        const node = current();
        if (typeof key === "string") track(id, "has", key);
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        if (!descriptor) return undefined;
        if (key === "length" && Array.isArray(node))
          return { value: node.length, writable: true, enumerable: false, configurable: false };
        return { value: wrap(descriptor.value), writable: false, enumerable: descriptor.enumerable, configurable: true };
      },
      set: readonly,
      deleteProperty: readonly,
      defineProperty: readonly,
      setPrototypeOf: readonly,
      preventExtensions: readonly,
    });
    facades.set(id, proxy);
    return proxy;
  }
  function state() {
    live();
    return active ? wrap(store.getState()) : store.getState();
  }
  function unlink(resource) {
    for (const key of resource.deps) {
      const set = subscriptions.get(key);
      set.delete(resource);
      if (!set.size) subscriptions.delete(key);
    }
    resource.deps.clear();
    for (const source of resource.sources) source.dependents.delete(resource);
    resource.sources.clear();
  }
  function replace(resource) {
    unlink(resource);
    resource.deps = resource.next;
    resource.next = null;
    resource.sources = resource.nextSources;
    resource.nextSources = null;
    for (const source of resource.sources) source.dependents.add(resource);
    for (const key of resource.deps) {
      if (!subscriptions.has(key)) subscriptions.set(key, new Set());
      subscriptions.get(key).add(resource);
    }
  }
  function evaluate(resource) {
    live();
    if (resource.disposed) fail("SCOPE_DISPOSED", "Reactive resource is disposed.");
    if (resource.evaluating) cycle(resource);
    const previous = active;
    resource.evaluating = true;
    resource.next = new Set();
    resource.nextSources = new Set();
    active = resource;
    evaluationStack.push(resource);
    try {
      const { read } = resource;
      const result = read(wrap(store.getState()));
      // The framework's thenable check is not an application dependency read.
      suppressTracking++;
      try { requireSync(result, "REACTIVITY_ASYNC", "Reactive reads must be synchronous."); }
      finally { suppressTracking--; }
      resource.dirty = false;
      return result;
    } catch (error) {
      resource.dirty = true;
      throw error;
    } finally {
      active = previous;
      evaluationStack.pop();
      resource.evaluating = false;
      // Failed reads retain the dependencies reached before the error, allowing
      // an explicit retry; old branch dependencies never accumulate.
      replace(resource);
    }
  }
  function disposeResource(resource) {
    if (resource.disposed) return;
    if (active) fail("REACTIVITY_REENTRANT", "Cannot dispose reactive resources during a read.");
    const dependents = [...resource.dependents];
    unlink(resource);
    resources.delete(resource);
    resource.disposed = true;
    resource.read = null;
    resource.notify = null;
    resource.cached = undefined;
    resource.dependents.clear();
    if (!closing) invalidate(dependents);
  }
  function cycle(resource) {
    const path = [...evaluationStack, resource].map(entry => entry.label).join(" -> ");
    fail(resource.kind === "computed" ? "COMPUTED_CYCLE" : "REACTIVITY_CYCLE", `Reactive read cycle: ${path}.`);
  }
  function createResource(kind, read, notify) {
    live();
    if (active || notifying) fail("REACTIVITY_REENTRANT", "Cannot register reactive resources during reads or notifications.");
    if (typeof read !== "function" || (kind === "observer" && typeof notify !== "function"))
      fail("REACTIVITY_INVALID", `${kind} requires a read function and optional invalidation function.`);
    const resource = { kind, label: `${kind}#${nextLabel++}`, read, notify, deps: new Set(),
      sources: new Set(), dependents: new Set(), dirty: true, disposed: false, evaluating: false, cached: undefined };
    resources.add(resource);
    return resource;
  }
  function observe(read, notify = () => {}) {
    const resource = createResource("observer", read, notify);
    const handle = Object.freeze({
      read: () => {
        if (resource.evaluating) cycle(resource);
        if (active && !suppressTracking) active.nextSources.add(resource);
        return evaluate(resource);
      },
      get dirty() { live(); if (resource.disposed) fail("SCOPE_DISPOSED", "Observer is disposed."); return resource.dirty; },
      dispose: () => disposeResource(resource),
    });
    try { evaluate(resource); } catch (error) { disposeResource(resource); throw error; }
    return handle;
  }
  function computed(read) {
    const resource = createResource("computed", read, null);
    return Object.freeze({
      get value() {
        live();
        if (resource.disposed) fail("SCOPE_DISPOSED", "Computed value is disposed.");
        if (resource.evaluating) cycle(resource);
        if (active && !suppressTracking) active.nextSources.add(resource);
        if (resource.dirty) resource.cached = evaluate(resource);
        return resource.cached;
      },
      get dirty() { live(); if (resource.disposed) fail("SCOPE_DISPOSED", "Computed value is disposed."); return resource.dirty; },
      dispose: () => disposeResource(resource),
    });
  }
  function publish(result) {
    live();
    const previous = nodes;
    nodes = indexGraph(result.state, { get: store.getObjectId });
    const affected = new Set();
    for (const change of result.affectedProperties) {
      for (const resource of subscriptions.get(token(change.targetId, change.kind, change.key)) ?? [])
        affected.add(resource);
    }
    const detached = new Set();
    for (const id of previous.keys()) {
      if (nodes.has(id)) continue;
      facades.delete(id);
      detached.add(id);
    }
    // Captured item facades also become dirty when their node is detached.
    if (detached.size) for (const [key, set] of subscriptions)
      if (detached.has(JSON.parse(key)[0])) for (const resource of set) affected.add(resource);
    invalidate(affected);
  }
  function invalidate(affected) {
    const queue = [...affected], visited = new Set();
    // Finish invalidation before any callback can read another observer.
    for (let i = 0; i < queue.length; i++) {
      const resource = queue[i];
      if (visited.has(resource) || resource.disposed) continue;
      visited.add(resource);
      queue.push(...resource.dependents);
      if (!resource.dirty) {
        resource.dirty = true;
        if (resource.notify) pendingCallbacks.add(resource);
      }
    }
    if (notifying) return;
    const errors = [];
    notifying = true;
    try {
      for (const resource of pendingCallbacks) {
        pendingCallbacks.delete(resource);
        if (resource.disposed) continue;
        try {
          const { notify } = resource;
          requireSync(notify(), "REACTIVITY_ASYNC", "Invalidation callbacks must be synchronous.");
        }
        catch (error) { errors.push(error); }
      }
    } finally { notifying = false; pendingCallbacks.clear(); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "Reactive notifications failed after state committed.");
  }
  return Object.freeze({
    state, observe, computed, publish,
    isBusy: () => active !== null || notifying,
    dispose() {
      if (disposed) return;
      closing = true;
      for (const resource of resources) disposeResource(resource);
      subscriptions.clear(); facades.clear(); nodes.clear(); pendingCallbacks.clear(); disposed = true;
    },
  });
}
