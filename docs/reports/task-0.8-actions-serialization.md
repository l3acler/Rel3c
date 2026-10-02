# Task 0.8 — Typed actions and snapshot evidence

Completed: 2026-10-02 (Bahrain). See [ADR 0002](../adr/0002-action-schema-serialization.md)
and the [runnable spike guide](../../spikes/action-schema/README.md).

## Scope

`spikes/action-schema/` adds a pure JavaScript named-action harness, adjacent
declarations, graph codec, independent graph oracle, runtime/type fixtures and
checked JavaScript example. The public entry and transaction/view-syntax engines
are unchanged. This is not a production action scheduler, recording system or
completed replay implementation.

TypeScript 5.9.3 is the sole new development dependency, pinned in package/lockfile.
It supplies only type checks. Runtime exports, startup, Node correctness tests
and codec behavior remain independent JavaScript with no third-party runtime
dependencies. Type checking emits no code. Installation used the local npm cache;
no frontend/state framework or compiler-generated runtime was added.

## Verification

```sh
npm ci
npm run test:types
npm run test:spikes
npm run test:benchmarks
npm test
npm run smoke
```

Environment: Node v26.3.0, npm 11.16.0, TypeScript 5.9.3, Darwin 24.6.0 arm64.
Node/type/HTTP startup checks are the evidence for this task; no new browser
behavior, native input support or performance measurement is claimed.

- 111 new action/serialization tests pass: 38 action tests across the reference,
  COW and staged adapters plus 73 codec/matrix/oracle tests.
- 275 total spike tests pass (157 transaction + seven syntax + 111 new tests).
- Eight benchmark workload tests and three scaffold tests pass: 286 Node tests
  overall. Root startup smoke passes.
- Positive TypeScript and checked-JavaScript fixtures pass with strict checking,
  exact optional properties and unchecked-index checks. Six type equalities
  verify state, name, payload, argument-tuple and writable-draft inference.
- 25 negative lines produce the expected diagnostics. A second compiler pass
  disables every directive and requires a real error on each corresponding line.
- Checked JavaScript also executes directly in Node without compilation.

## Supported codec/state-input/payload matrix

| Value/shape | Policy | Evidence |
| --- | --- | --- |
| Null, undefined, booleans, strings | Accept | Empty/unicode/control/quote/lone-surrogate round trips |
| Finite numbers, including -0/subnormal/MAX_VALUE | Accept | `Object.is` comparisons; -0 has its own token |
| NaN and infinities | Reject | Direct/nested/imported bad-number tests |
| BigInt, functions, symbols/keys | Reject | Direct/nested and action-boundary tests |
| Ordinary/null-prototype objects | Accept | Prototype, key order and literal `__proto__` preservation |
| Ordinary arrays | Accept | Explicit length, holes vs undefined, aliases and custom enumerable keys |
| Shared acyclic references | Accept | Shared identity retained; distinct equal-shaped nodes not merged |
| Cycles | Reject | Object/array cycles and cyclic wire references |
| Getter/setter/toJSON functions | Reject, do not execute | Invocation counters stay zero for ordinary object fixtures |
| Nonenumerable data properties | Reject except array length | Direct/nested matrix tests |
| Frozen/sealed supported data | Accept values | Decode yields new mutable data; descriptor flags not persisted |
| Date/Map/Set/RegExp/buffers/typed arrays | Reject | Direct/nested matrix tests |
| Class instances, Array subclasses, custom prototypes | Reject at codec boundaries | Boundary tests; legacy assignment mismatch recorded below |
| Promise/thenables/DOM-shaped values | Reject | Direct/nested/dispatch and wire tests |

Action state roots must be objects/arrays. Primitive snapshots/payloads are allowed
when the payload guard admits them. A plain object with an own defined `nodeType`
field is conservatively rejected, matching the old transaction boundary; this is
a documented restriction, not an arbitrary-object/native-DOM detection guarantee.
The matrix does not imply TypeScript can prove all runtime rows.

### Graph correctness

The oracle compares values with `Object.is`, prototypes and ordered own keys,
and memoizes both source→destination and destination→source mappings. It therefore
catches lost aliases, merged distinct nodes, changed holes/length, prototype
normalization and negative-zero loss independently of codec agreement.

40 deterministic seeds each build 32 data nodes plus a root array (two base nodes
and 30 new objects/sparse arrays), with backward shared edges, custom properties and
undefined/negative-zero leaves. Each graph round trip passes the oracle and
re-encodes byte-identically. A 30-level shared DAG emits 31 node records rather
than expanding into a duplicated tree. No wall-clock performance claim is inferred.

Imports reject unsupported format/version, missing/extra fields, bad tags/types,
references, prototypes, arrays/lengths, duplicate entries, cyclic/unreachable nodes,
integer-key order normalization, duplicate envelope fields, malformed JSON,
pretty printing and nonfinite/negative-zero number-token variants. UTF-8 byte,
node/entry/depth/per-array/aggregate-slot limits are exercised at both boundaries,
including deeper alias revisits. No partial graph is published on failure.

### Action correctness and static/runtime boundary

Explicit input modes handle default/rest callbacks and required-but-undefined
payloads without arity guessing. Unknown names, inherited prototype names,
wrong arguments, invalid shapes, native/unserializable/accessor/cyclic payloads
and throwing/async guards fail before action execution. Payloads preserve aliases,
are deeply frozen copies, and do not freeze the caller.

Throwing, Promise/thenable-returning and unsupported-state actions roll back;
held drafts revoke. An async callback whose return can be erased to TypeScript
`void` still fails runtime validation; resumed post-await writes hit revoked drafts.
The harness observes illegal same-realm native Promise rejections so they do not create an
extra unhandled rejection. It does not run arbitrary thenables, cancel async code,
or undo external effects. Schema/action wrappers are frozen; prototype-colliding
names are safe own entries, not prototype lookups.

Data restore followed by identical actions matches snapshot bytes, including
alias/reorder cases across each engine. Runtime versions deliberately reset;
this is state-data restoration, not a replay checkpoint guarantee.

## Findings carried into task 0.9/core acceptance

1. Existing engines normalize an Array subclass assigned during an action to an
   ordinary array. The codec rejects subclasses in initial state and payloads.
   Reject unsupported prototypes before transaction import in production.
2. Existing transaction validation revisits completed alias nodes per path.
   An eight-level DAG fixture reads the same leaf 256 times; its encoded graph
   has nine nodes. Memoize completed nodes separately from active cycle detection.
3. TypeScript cannot recover a Promise return erased to `void` or guarantee native
   prototypes/finiteness/serialization. Keep runtime guards/validation independent.
4. Snapshot IDs are graph-local, not stable transaction IDs; checkpoint restore
   requires an explicit runtime identity/service/version policy in C.1.

These are explicit audit tests/findings, not approved production behavior.
Historical task 0.6 measurement sources were not edited. No production engine is
selected here. Codec limits do not bound arbitrary validator/action code or the
old backend's entire validation work; no exact heap/GC/throughput claim is made.

## Remaining work

Task 0.9 reviews engine, identity, types/schema, browser/input support and all
measured tradeoffs. A.2/A.3 implement the production type membrane and nested
queue/failure/no-op policy; B.9 publishes declarations. C.1 finalizes snapshot,
recording/action/runtime versions, hashing/import policy, clock/PRNG continuation
and compatible checkpoint identity; C.7–C.9 implement bounded recording/replay.
The experimental graph format is not a user-recording export format or a stable API.
Its version and data validation do not validate application-specific state fields;
use an explicit application guard for untrusted restored state before initialization.
