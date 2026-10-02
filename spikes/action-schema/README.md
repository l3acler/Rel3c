# Typed actions and serialization spike — task 0.8

Experimental exports: `spikes/action-schema/index.js` with adjacent declarations.
None is exported from the package public entry. Plain JavaScript runs without a
compiler, dependency, or build step. Only type tests use TypeScript.

```sh
npm run test:spikes
npm ci
npm run test:types
```

TypeScript 5.9.3 is pinned as development tooling; `npm ci` installs no frontend
runtime. Node correctness/startup tests do not require it.

## Plain JavaScript example

The import below assumes code run from the repository root.

```js
import { createActionSchema, createActionSpike, decodeSnapshot } from './spikes/action-schema/index.js';

const isName = value => value !== null && typeof value === 'object'
  && typeof value.name === 'string';

const schema = createActionSchema({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action(isName, (draft, payload) => { draft.name = payload.name; })
}));
const app = createActionSpike({ schema, initialState: { count: 0, name: 'Ada' } });
app.actions.increment();
app.dispatch('rename', { name: 'Grace' });
const snapshot = app.snapshot();
const restored = createActionSpike({ schema, initialState: decodeSnapshot(snapshot) });
```

Action input mode is explicit, never inferred from `function.length`:
`action(run)` has no payload; `action(validatePayload, run)` requires exactly one
payload, including when `undefined` is an allowed value. Validation must return
literal `true` synchronously. Payloads are graph-copied and deeply frozen before
validation/execution; callers are not frozen. Shared references within a payload
remain shared. Failed validation/action execution publishes no new state/version.
Callbacks are developer code and must follow deterministic/pure-validator rules;
this spike does not enforce ambient time/random/DOM restrictions.

## Type inference

```ts
interface State { count: number; name: string }
interface NamePayload { name: string }
const isName = (value: unknown): value is NamePayload =>
  value !== null && typeof value === 'object'
  && 'name' in value && typeof value.name === 'string';

const schema = createActionSchema<State>({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action(isName, (draft, payload) => { draft.name = payload.name; })
}));
const app = createActionSpike({ schema, initialState: { count: 0, name: 'Ada' } });
app.actions.rename({ name: 'Grace' }); // inferred required payload
app.dispatch('increment');            // inferred name and no-payload arity
```

`Draft<State>` is writable; committed state and payloads are deeply read-only.
The dispatch signature uses a union of correlated tuples, not independently
widenable name/payload generics. `InputOf<typeof schema>` is a discriminated
action-input type, not a recording wire format. JavaScript may opt into JSDoc;
the checked [JavaScript fixture](types/javascript.js) also runs natively in tests.

Visible Promise-returning actions are rejected by declarations. TypeScript can
erase returns to `void`, and `any`/structural types cannot prove serializability.
Runtime Promise checks, payload guards and graph validation remain mandatory.
`decodeSnapshot()` returns `unknown`, not a caller-asserted generic type.
The codec validates data representation, not your application's state-field
schema. Validate externally imported state against that schema before initializing
an app; a TypeScript generic or snapshot format version cannot do this for you.

## Snapshot format and policy

The experimental version-1 JSON envelope contains a root value token and graph
node table. Reference IDs preserve aliases; ordered property entries preserve
own-key order. Tags preserve `undefined` and negative zero. Arrays carry explicit
length and only present properties, retaining holes and custom enumerable keys.
Objects distinguish ordinary and null prototypes. `__proto__` is defined as a
data property, never assigned through its prototype setter.

Cycles, class instances, Array subclasses/custom prototypes, getters/setters,
nonenumerable properties other than array length, symbol keys/values, functions,
Promise/thenables, nonfinite numbers, BigInt, native containers/buffers and
DOM-shaped values are rejected at codec boundaries. Descriptor flags are not
snapshot data: decoded objects are fresh, mutable data graphs; the transaction
engine establishes committed read-only ownership.

Only canonical JSON emitted by the encoder is accepted. Pretty printing,
duplicate fields, unsupported versions, unreachable nodes, bad references,
duplicate property entries and representations that would normalize graph meaning
are rejected. Canonical order preserves observable property order rather than
sorting all keys lexically. Treat snapshot bytes as sensitive application data.

Default limits: 1,000,000 UTF-8 bytes, 10,000 nodes, 100,000 property entries,
128 object levels, 100,000 slots per array and 100,000 aggregate array slots.
`SnapshotLimits` overrides are supported; depth cannot exceed 256 in this recursive
spike. Import validates wire shape/references/cycles/limits before graph allocation,
then re-encodes to enforce canonical form. These are codec limits, not a state-size
budget, heap-accounting guarantee, sandbox for hostile live Proxies, or history policy.

## Remaining architecture work

The reference/COW/staged transaction engines are unchanged. An audit fixture
records that they normalize Array subclasses during action assignment, whereas
the codec rejects such input graphs. Their shared validator also revisits DAG
nodes per path. Reject unsupported prototypes before importing assignments and
memoize completed validation nodes before adopting the production type policy.
See [ADR 0002](../../docs/adr/0002-action-schema-serialization.md).

This harness rejects nested dispatch rather than implementing the Phase A.3
queue, inherits the old no-op version policy, and has no controlled clock/random
services. Data snapshot restore creates a new engine/version space; it does not
restore tick/PRNG/clock state, logical runtime object IDs or recordings. Those
contracts remain tasks 0.9, A.3 and C.1–C.9. The format is not stable/public.
