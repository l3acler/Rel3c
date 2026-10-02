// Internal copy-on-write spike; not a public runtime export.
import { createEngineShell, ownedNodes, materialize } from './engine-shell.js';
import { emptyLike, keysOf, put } from './graph.js';

export function createCowEngine(initialState = {}) {
  return createEngineShell(initialState, (root, identities) => {
    const owned = ownedNodes(root, identities);
    const copies = new Map();
    const source = node => copies.get(node) ?? node;
    function writable(node) {
      if (!copies.has(node)) {
        const copy = emptyLike(node);
        for (const key of keysOf(node)) put(copy, key, node[key]);
        copies.set(node, copy);
      }
      return copies.get(node);
    }
    const storage = {
      root,
      owns: node => owned.has(node),
      register: node => owned.add(node),
      read: (node, key) => source(node)[key],
      has: (node, key) => key in source(node),
      keys: node => keysOf(source(node)),
      write(node, key, value) { put(writable(node), key, value); },
      remove(node, key) { return Reflect.deleteProperty(writable(node), key); },
      finish: () => materialize(root, storage, identities),
    };
    return storage;
  });
}
