// Internal staged-operation spike. Writes remain target/key overlays until commit.
import { createEngineShell, ownedNodes, materialize } from './engine-shell.js';
import { keysOf, arrayIndex } from './graph.js';

export function createStagedEngine(initialState = {}) {
  return createEngineShell(initialState, (root, identities) => {
    const owned = ownedNodes(root, identities);
    const records = new Map();
    function record(node) {
      if (!records.has(node)) records.set(node, { operations: new Map(), keys: keysOf(node) });
      return records.get(node);
    }
    function read(node, key) {
      const op = records.get(node)?.operations.get(key);
      return op ? (op.deleted ? Object.getPrototypeOf(node)?.[key] : op.value) : node[key];
    }
    function stage(node, key, value) {
      const rec = record(node);
      if (!rec.keys.includes(key)) rec.keys.push(key);
      rec.operations.set(key, { value });
    }
    function remove(node, key) {
      if (Array.isArray(node) && key === 'length') return false;
      const rec = record(node);
      rec.keys = rec.keys.filter(candidate => candidate !== key);
      rec.operations.set(key, { deleted: true });
      return true;
    }
    const storage = {
      root,
      owns: node => owned.has(node),
      register: node => owned.add(node),
      read,
      has(node, key) {
        const op = records.get(node)?.operations.get(key);
        return op ? (!op.deleted || (Object.getPrototypeOf(node) !== null
          && key in Object.getPrototypeOf(node))) : key in node;
      },
      keys(node) {
        const keys = [...(records.get(node)?.keys ?? keysOf(node))];
        return [...keys.filter(arrayIndex).sort((a, b) => Number(a) - Number(b)),
          ...keys.filter(key => !arrayIndex(key))];
      },
      write(node, key, value) {
        if (Array.isArray(node)) {
          if (key === 'length') {
            const probe = [];
            probe.length = value;
            const length = probe.length;
            for (const candidate of storage.keys(node)) {
              if (arrayIndex(candidate) && Number(candidate) >= length) remove(node, candidate);
            }
            stage(node, key, length);
            return;
          }
          if (arrayIndex(key) && Number(key) >= read(node, 'length')) stage(node, 'length', Number(key) + 1);
        }
        stage(node, key, value);
      },
      remove,
      finish: () => materialize(root, storage, identities),
    };
    return storage;
  });
}
