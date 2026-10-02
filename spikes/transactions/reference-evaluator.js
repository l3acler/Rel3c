// Eager whole-graph reference storage: no COW copies or staged overlays.
// Comparison tests also use a plain native-JavaScript model and independent
// observer oracle, so shared membrane/metadata bugs cannot pass by agreement.
import { createEngineShell, ownedNodes } from './engine-shell.js';
import { cloneGraph, keysOf, put } from './graph.js';

export const cloneGraphWithAliases = root => cloneGraph(root);

export function isDeepEqual(a, b, forward = new Map(), reverse = new Map()) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (forward.has(a)) return forward.get(a) === b;
  if (reverse.has(b)) return false;
  forward.set(a, b);
  reverse.set(b, a);
  const aKeys = keysOf(a);
  const bKeys = keysOf(b);
  return aKeys.length === bKeys.length && aKeys.every((key, i) => key === bKeys[i]
    && isDeepEqual(a[key], b[key], forward, reverse));
}

export function createReferenceEngine(initialState = {}) {
  return createEngineShell(initialState, (base, identities) => {
    const sourceCopies = new Map();
    const root = cloneGraph(base, identities, sourceCopies);
    const owned = ownedNodes(root, identities);
    return {
      root,
      owns: node => owned.has(node),
      resolve: node => sourceCopies.get(node),
      register: node => owned.add(node),
      read: (node, key) => node[key],
      has: (node, key) => key in node,
      keys: keysOf,
      write: put,
      remove: (node, key) => Reflect.deleteProperty(node, key),
      finish: () => root,
    };
  });
}
