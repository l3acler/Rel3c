// Identical, bounded transaction workloads for Node and browser measurements.
export const WORKLOAD_VERSION = 1;
export const WORKLOAD_NAMES = ['sparse-nested', 'repeated-writes', 'dense-updates',
  'array-insert', 'array-reorder', 'alias-edits', 'rollback'];
export const ROLLBACK = new Error('benchmark rollback');

export function makeInitialState(size) {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('size must be an integer >= 2');
  const rows = Array.from({ length: size }, (_, id) => ({ id: `row-${id}`, count: 0, flag: false }));
  const shared = rows[0];
  return { nested: { counter: { value: 0 }, preferences: { theme: 'dark' } },
    rows, primary: shared, secondary: shared, group: { shared } };
}

export function makeAction(name, size, step) {
  const index = (Math.imul(step + 1, 2654435761) >>> 0) % size;
  switch (name) {
    case 'sparse-nested': return draft => { draft.nested.counter.value += 1; };
    case 'repeated-writes': return draft => {
      for (let i = 0; i < 24; i++) draft.nested.counter.value += 1;
    };
    case 'dense-updates': return draft => {
      for (let i = 0; i < draft.rows.length; i++) draft.rows[i].count += 1;
    };
    case 'array-insert': return draft => {
      // Insert and remove together to hold collection size/memory constant.
      draft.rows.splice(index, 1, { id: `insert-${step}`, count: step + 1, flag: false });
    };
    case 'array-reorder': return draft => { draft.rows.reverse(); };
    case 'alias-edits': return draft => {
      draft.primary.count += 1;
      draft.secondary.count += 1;
      draft.group.shared.count += 1;
    };
    case 'rollback': return draft => {
      draft.nested.counter.value += 1;
      draft.rows[index].count += 1;
      draft.rows.reverse();
      throw ROLLBACK;
    };
    default: throw new RangeError(`Unknown workload: ${name}`);
  }
}

export function perform(engine, action, name) {
  try {
    const result = engine.run(action);
    if (name === 'rollback') throw new Error('Rollback workload unexpectedly committed.');
    return result.affectedProperties.length;
  } catch (error) {
    if (name !== 'rollback' || error !== ROLLBACK) throw error;
    return 0;
  }
}

export function expectedVersion(name, updates) { return name === 'rollback' ? 1 : 1 + updates; }

// Include logical IDs, aliases, property order, holes and primitive distinctions.
// This checksum is evidence of equivalent work, not a production replay format.
export function canonicalState(engine) {
  const nodes = new Map();
  function encode(value) {
    if (value === undefined) return ['undefined'];
    if (typeof value === 'number' && Object.is(value, -0)) return ['number', '-0'];
    if (value === null || typeof value !== 'object') return ['primitive', value];
    const id = engine.getObjectId(value);
    if (!nodes.has(id)) {
      nodes.set(id, null);
      const properties = Reflect.ownKeys(value).map(key => [key, encode(value[key])]);
      nodes.set(id, { id, array: Array.isArray(value), nullPrototype: Object.getPrototypeOf(value) === null, properties });
    }
    return ['reference', id];
  }
  const root = encode(engine.getState());
  return JSON.stringify({ root, nodes: [...nodes.values()].sort((a, b) => a.id - b.id) });
}

export function summarize(samples) {
  if (!samples.length) return { count: 0, median: null, p95: null, min: null, max: null };
  const ordered = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return { count: ordered.length,
    median: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    p95: ordered[Math.ceil(ordered.length * 0.95) - 1], min: ordered[0], max: ordered.at(-1) };
}

export function caseOrder(round, names = ['reference', 'cow', 'staged']) {
  // Rotate engine order to avoid always giving one engine the warmest machine.
  return [...names.slice(round % names.length), ...names.slice(0, round % names.length)];
}
