import { createReferenceEngine } from '../transactions/reference-evaluator.js';
import { deepFreeze } from '../transactions/contract.js';
import { encodeSnapshot, decodeSnapshot } from './snapshot.js';

export { encodeSnapshot, decodeSnapshot, DEFAULT_LIMITS, SnapshotError,
  SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from './snapshot.js';

const specs = new WeakMap();
const schemas = new WeakMap();
export class ActionSchemaError extends TypeError {}
const fail = message => { throw new ActionSchemaError(message); };
// Invalid native Promise returns still need a rejection observer: their async
// bodies may resume after the draft is revoked. Never execute foreign thenables.
const observeInvalidPromise = value => {
  if (value instanceof Promise) Promise.prototype.then.call(value, undefined, () => {});
};

export function createActionSchema({ version = 'spike/1' } = {}) {
  if (typeof version !== 'string' || !version.length) fail('Action schema version must be a nonempty string');
  return build => {
    if (typeof build !== 'function') fail('Action schema requires a definition callback');
    function action(...args) {
      const [validate, run] = args.length === 1 ? [null, args[0]] : args;
      if (![1, 2].includes(args.length) || typeof run !== 'function' || args.length === 2 && typeof validate !== 'function') {
        fail('Use action(run) or action(validatePayload, run)');
      }
      const spec = Object.freeze({ input: validate === null ? 'none' : 'payload' });
      specs.set(spec, { validate, run });
      return spec;
    }
    const definitions = build(Object.freeze({ action }));
    if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)
      || ![null, Object.prototype].includes(Object.getPrototypeOf(definitions))) fail('Definitions must be a plain named action object');
    const registry = new Map();
    for (const name of Reflect.ownKeys(definitions)) {
      const descriptor = Object.getOwnPropertyDescriptor(definitions, name);
      if (typeof name !== 'string' || !name.length || !('value' in descriptor) || !descriptor.enumerable || !specs.has(descriptor.value)) {
        fail('Actions require nonempty string names and builder-created data definitions');
      }
      registry.set(name, specs.get(descriptor.value));
    }
    const schema = Object.freeze({ version, names: Object.freeze([...registry.keys()]) });
    schemas.set(schema, registry);
    return schema;
  };
}

// Named dispatch/type/serialization harness, not the Phase A action runtime.
export function createActionSpike({ initialState, schema, engineFactory = createReferenceEngine, limits = {} }) {
  const registry = schemas.get(schema);
  if (!registry) fail('Expected a builder-created action schema');
  const ownedState = decodeSnapshot(encodeSnapshot(initialState, limits), limits);
  if (ownedState === null || typeof ownedState !== 'object') fail('Application state must be an object or array');
  const engine = engineFactory(ownedState);
  let running = false;
  function dispatch(name, ...args) {
    if (running) fail('Nested dispatch is not implemented in this task 0.8 harness; Phase A.3 defines queuing');
    if (typeof name !== 'string') fail('Action name must be a string');
    if (!registry.has(name)) fail('Unknown action: ' + name);
    const { validate, run } = registry.get(name);
    if (args.length !== (validate === null ? 0 : 1)) fail('Wrong payload arity for action: ' + name);
    running = true;
    try {
      let payload;
      if (validate !== null) {
        // Own/freeze payloads without freezing callers or losing aliases.
        payload = deepFreeze(decodeSnapshot(encodeSnapshot(args[0], limits), limits));
        const valid = validate(payload);
        observeInvalidPromise(valid);
        if (valid !== true) fail('Invalid payload for action: ' + name);
      }
      return engine.run(draft => {
        const result = validate === null ? run(draft) : run(draft, payload);
        observeInvalidPromise(result);
        return result;
      });
    } finally { running = false; }
  }
  const actions = Object.create(null);
  for (const name of registry.keys()) actions[name] = (...args) => dispatch(name, ...args);
  return Object.freeze({ actions: Object.freeze(actions), dispatch,
    get state() { return engine.getState(); },
    get version() { return engine.getVersion(); },
    schemaVersion: schema.version,
    snapshot: () => encodeSnapshot(engine.getState(), limits),
  });
}
