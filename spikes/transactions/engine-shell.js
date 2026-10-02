import { TransactionActiveError, TransactionCompletedError, UnsupportedTypeError, CircularReferenceError,
  validateStateValue, deepFreeze } from './contract.js';
import { cloneGraph, createIdentities, indexGraph, graphDelta } from './graph.js';
import { createDraftView } from './draft-view.js';

// Lifecycle, ownership and delta protocol are shared; storage/materialization are not.
export function createEngineShell(initialState, makeStorage) {
  validateStateValue(initialState);
  const identities = createIdentities();
  let state = deepFreeze(cloneGraph(initialState, identities));
  let version = 1;
  let active = null;
  return {
    getState: () => state,
    getVersion: () => version,
    getObjectId: value => identities.get(value),
    hasActiveTransaction: () => active !== null,
    begin() {
      if (active) throw new TransactionActiveError();
      const storage = makeStorage(state, identities);
      const view = createDraftView(storage.root, storage, identities);
      let completed = false;
      let committed = false;
      let aborted = false;
      const finish = () => {
        if (completed) throw new TransactionCompletedError();
        completed = true;
        view.revoke();
        active = null;
      };
      const tx = {
        draft: view.draft,
        get isActive() { return !completed; },
        get isCommitted() { return committed; },
        get isAborted() { return aborted; },
        commit() {
          if (completed) throw new TransactionCompletedError();
          try {
            const candidate = storage.finish();
            validateStateValue(candidate);
            const metadata = graphDelta(state, candidate, identities);
            const isNoop = metadata.affectedProperties.length === 0;
            if (!isNoop) {
              state = deepFreeze(candidate);
              version++;
            }
            committed = true;
            finish();
            return { version, state, ...metadata, isNoop };
          } catch (error) {
            aborted = true;
            if (!completed) finish();
            throw error;
          }
        },
        abort() { finish(); aborted = true; },
      };
      active = tx;
      return tx;
    },
    run(action) {
      const tx = this.begin();
      try {
        const result = action(tx.draft);
        if (result && typeof result.then === 'function') {
          throw new UnsupportedTypeError('Actions must be synchronous. Promise-returning actions are rejected.');
        }
        return tx.commit();
      } catch (error) {
        if (tx.isActive) tx.abort();
        throw error;
      }
    },
  };
}

// Walk every reachable edge, including unread parents and moved items. This
// correctness-first O(graph size) commit scan must be measured in task 0.6.
export function materialize(root, storage, identities) {
  const memo = new Map();
  const visiting = new Set();
  function visit(node) {
    if (node === null || typeof node !== 'object') return node;
    if (memo.has(node)) return memo.get(node);
    if (visiting.has(node)) throw new CircularReferenceError();
    visiting.add(node);
    const result = Array.isArray(node) ? [] : Object.create(Object.getPrototypeOf(node));
    identities.copy(node, result);
    const keys = storage.keys(node);
    const baseKeys = Reflect.ownKeys(node);
    let changed = keys.length !== baseKeys.length;
    for (const key of keys) {
      const value = visit(storage.read(node, key));
      if (!Object.hasOwn(node, key) || !Object.is(node[key], value)) changed = true;
      if (Array.isArray(result) && key === 'length') result.length = value;
      else Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
    }
    if (keys.some((key, i) => key !== baseKeys[i])) changed = true;
    visiting.delete(node);
    memo.set(node, changed ? result : node);
    return memo.get(node);
  }
  return visit(root);
}

export function ownedNodes(root, identities) {
  return new Set([...indexGraph(root, identities).values()].map(entry => entry.value));
}
