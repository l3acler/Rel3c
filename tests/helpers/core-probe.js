// Test instrumentation only: applications do not install these wrappers.
export function bindingProbe() {
  const counts = Object.create(null);
  const hit = key => { counts[key] = (counts[key] ?? 0) + 1; };
  function context(original, path) {
    const descriptors = Object.getOwnPropertyDescriptors(original);
    descriptors.derive = { enumerable: true, value: read => original.derive(state => {
      hit(`${path}.${read.name}`); return read(state);
    }) };
    descriptors.when = { enumerable: true, value: (condition, yes, no) => original.when(condition,
      child => { hit(`${path}.conditionalFactory`); return yes(context(child, `${path}.details`)); },
      child => no ? no(context(child, `${path}.empty`)) : null) };
    descriptors.keyed = { enumerable: true, value: (source, key, view) => original.keyed(source,
      item => { hit(`${path}.key`); return key(item); },
      child => { hit(`${path}.itemFactory`); return view(context(child, `${path}.row${child.key}`)); }) };
    return Object.freeze(Object.defineProperties({}, descriptors));
  }
  return { wrap: view => original => { hit('root.view'); return view(context(original, 'root')); },
    snapshot: () => ({ ...counts }), delta: before => delta(counts, before) };
}

function delta(counts, before) {
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value - (before[key] ?? 0)])
    .filter(([, value]) => value !== 0));
}

export function byId(root, id) {
  if (root.getAttribute?.('id') === id) return root;
  for (const child of root.childNodes) { const found = byId(child, id); if (found) return found; }
  return null;
}

// Count setters even when they assign equal values; count structural operations
// too. Native MutationObserver checks independently validate browser DOM changes.
export function domProbe(root) {
  const counts = Object.create(null), restorations = [], seen = new WeakSet();
  const hit = key => { counts[key] = (counts[key] ?? 0) + 1; };
  function replace(node, name, descriptor) {
    const own = Object.getOwnPropertyDescriptor(node, name);
    Object.defineProperty(node, name, { configurable: true, ...descriptor });
    restorations.push(() => { if (own) Object.defineProperty(node, name, own); else delete node[name]; });
  }
  function property(node, name, key) {
    let holder = node, descriptor;
    while (holder && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(holder, name); holder = Object.getPrototypeOf(holder); }
    let current = node[name];
    replace(node, name, { get: () => descriptor?.get ? descriptor.get.call(node) : current,
      set(next) { hit(key); if (descriptor?.set) descriptor.set.call(node, next); else current = next; } });
  }
  function watch(node) {
    if (seen.has(node)) return;
    seen.add(node);
    const id = node.getAttribute?.('id') ?? node.parentNode?.getAttribute?.('id') ?? node.nodeName ?? node.tagName ?? 'node';
    if (node.nodeType === 3) property(node, 'data', `text:${id}`);
    if (node.nodeType === 1) {
      if (node.tagName === 'INPUT') property(node, 'value', `value:${id}`);
      for (const name of ['setAttribute', 'removeAttribute', 'insertBefore', 'removeChild']) {
        const original = node[name];
        replace(node, name, { value: function (...args) {
          hit(`${name}:${id}`); return original.apply(this, args);
        } });
      }
    }
    for (const child of node.childNodes) watch(child);
  }
  watch(root);
  return { snapshot: () => ({ ...counts }), delta: before => delta(counts, before),
    restore() { while (restorations.length) restorations.pop()(); } };
}
