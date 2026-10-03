import { fail, requireSync } from "../errors.js";
import { ownInitialState } from "./initial-state.js";
import { inspectGraph, copyGraph, freezeGraph, checkScalar, isObject, emptyLike, put,
  addUsage, arrayIndex } from "./data.js";
import { createIdentities, graphDelta, materialize } from "./graph.js";
import { createDraftView } from "./draft.js";

function createStorage(root, identities) {
  const initial = inspectGraph(root);
  const owned = new Set(initial.records.keys()), copies = new Map(), imports = new Map();
  let usage = initial.usage;
  const source = node => copies.get(node) ?? node;
  function writable(node) {
    if (!copies.has(node)) {
      const copy = emptyLike(node);
      for (const key of Reflect.ownKeys(node)) put(copy, key, node[key]);
      copies.set(node, copy);
    }
    return copies.get(node);
  }
  return {
    source,
    owns: node => owned.has(node),
    read: (node, key) => source(node)[key],
    adopt(value, resolve) {
      if (!isObject(value)) { checkScalar(value); return value; }
      const known = input => resolve(input) ?? imports.get(input);
      if (known(value) !== undefined) return known(value);
      const checked = inspectGraph(value, { resolve: known });
      const nextUsage = addUsage(usage, checked.usage);
      const imported = copyGraph(value, checked.records, known);
      for (const [original, copy] of imported.copies) {
        identities.assign(copy); owned.add(copy); imports.set(original, copy);
      }
      usage = nextUsage;
      return imported.root;
    },
    write(node, key, value) {
      const current = source(node);
      if (Object.hasOwn(current, key) && Object.is(current[key], value)) return;
      const extra = { entries: Object.hasOwn(current, key) ? 0 : 1,
        textUnits: (Object.hasOwn(current, key) ? 0 : key.length) + (typeof value === "string" ? value.length : 0) };
      if (Array.isArray(node)) {
        if (key === "length") {
          const probe = []; probe.length = value;
          extra.arraySlots = Math.max(0, probe.length - current.length);
        } else if (arrayIndex(key)) extra.arraySlots = Math.max(0, Number(key) + 1 - current.length);
      }
      const nextUsage = addUsage(usage, extra);
      put(writable(node), key, value);
      usage = nextUsage;
    },
    remove(node, key) { return Reflect.deleteProperty(writable(node), key); },
    finish() {
      const checked = inspectGraph(root, { source });
      return materialize(root, checked.records, identities);
    },
    clear() { owned.clear(); copies.clear(); imports.clear(); },
  };
}

// Internal production engine. Application actions get access only through A.3.
export function createTransactionStore(initialState = {}) {
  let state = ownInitialState(initialState);
  initialState = null;
  const identities = createIdentities();
  for (const node of inspectGraph(state).records.keys()) identities.assign(node);
  let version = 1, active = null, disposed = false;
  function live() { if (disposed) fail("STORE_DISPOSED", "Transaction store is disposed."); }
  const store = Object.freeze({
    getState() { live(); return state; },
    getVersion() { live(); return version; },
    getObjectId(value) { live(); return identities.get(value); },
    hasActiveTransaction() { live(); return active !== null; },
    begin() {
      live();
      if (active) fail("TRANSACTION_ACTIVE", "A transaction is already active on this store.");
      let storage = createStorage(state, identities);
      let view = createDraftView(state, storage);
      let completed = false, committed = false, aborted = false;
      function check() { if (completed) fail("TRANSACTION_COMPLETED", "Transaction has already completed."); }
      function finish() {
        completed = true; view.revoke(); storage.clear(); storage = null; view = null; active = null;
      }
      const tx = Object.freeze({
        draft: view.draft,
        get isActive() { return !completed; },
        get isCommitted() { return committed; },
        get isAborted() { return aborted; },
        commit() {
          check();
          try {
            const candidate = storage.finish();
            const metadata = graphDelta(state, candidate, identities);
            if (version >= Number.MAX_SAFE_INTEGER) fail("VERSION_LIMIT", "State version exceeds the safe integer range.");
            const next = freezeGraph(candidate);
            const result = Object.freeze({ version: version + 1, state: next, ...metadata,
              isNoop: metadata.affectedProperties.length === 0 });
            state = next; version++; committed = true; finish();
            return result;
          } catch (error) { aborted = true; if (!completed) finish(); throw error; }
        },
        abort() { check(); aborted = true; finish(); },
      });
      active = tx;
      return tx;
    },
    run(action) {
      live();
      if (typeof action !== "function") fail("TRANSACTION_INVALID", "Transaction body must be a synchronous function.");
      const tx = store.begin();
      try {
        requireSync(action(tx.draft), "TRANSACTION_ASYNC", "Transaction bodies must be synchronous; Promise/thenable returns reject.");
        return tx.commit();
      } catch (error) { if (tx.isActive) tx.abort(); throw error; }
    },
    dispose() {
      if (disposed) return;
      if (active) active.abort();
      state = null; disposed = true;
    },
  });
  return store;
}
