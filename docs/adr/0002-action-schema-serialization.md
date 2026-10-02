# ADR 0002 — Explicit action inputs and alias-preserving data snapshots

Status: accepted Phase 0 prototype recommendation, not a public/stable API.

Date: 2026-10-02 (Bahrain). Task: 0.8. Sources: Framework_PRD.md §3, §5, §7;
ACTION-1, STATE-1/STATE-2, RECORD-1/REPLAY-1; development plan tasks 0.8/0.9/C.1.

## Decisions

1. Prototype named schema definitions with explicit no-payload/payload modes,
   using `action(run)` or `action(validatePayload, run)`. Keep plain JavaScript
   usable and infer state/action-name/payload types from the same registration in
   adjacent declarations. Do not infer payload mode from callback arity.
2. Bind schema state once with a curried, contextually typed builder. Infer payload
   types from type-predicate validators; infer names from the returned definition
   object. Use correlated dispatch tuples and a discriminated action-input type.
3. Keep runtime validation independent of declarations. Own/freeze supported
   payload graphs before pure synchronous guards/actions; require guard result
   `true`. Reject unknown names/arity/invalid graphs and Promise-returning actions.
4. Recommend an acyclic data-graph policy: primitives including `undefined`,
   finite numbers including negative zero, ordinary/null-prototype objects, and
   ordinary arrays with holes/custom enumerable properties. Preserve sharing and
   distinct node identity; reject cycles and unsupported native/prototype types.
5. Prototype a versioned canonical JSON node table with explicit value tags and
   ordered property entries, rather than direct application-state JSON or paths.
   Enforce import/export limits and reject incompatible/noncanonical data.

The supported type policy is a recommendation for the production engine, not a
claim that every existing transaction assignment already enforces it. Audit
findings below must be resolved before core type acceptance. Engine selection
remains task 0.9; public action integration remains A.3/B.9. Final checkpoint,
recording, schema compatibility and canonical hashing contracts remain C.1.

## Rationale and verified evidence

`function.length` changes under defaults/rest parameters and does not express
whether `undefined` is a valid required payload. Explicit modes avoid that
ambiguity. The builder supplies writable draft types and deeply read-only payload
types without requiring TypeScript at runtime. Frozen committed state and payload
copies protect ownership without freezing or changing caller graphs.

The type runner checks positive TypeScript, checked JavaScript and 25 negative
lines. It then removes all `@ts-expect-error` directives and requires actual
diagnostics at every negative line. Cases include inferred names/payload shapes,
missing/extra arguments, unrelated union names/payloads, read-only state and
payload mutation, and statically visible Promise returns.

TypeScript's `void` callback assignability can hide Promise returns; structural
types cannot prove prototypes, finiteness, getters or imported data. Runtime tests
therefore reject even erased Promise returns and ensure revoked drafts prevent
post-await mutation. Illegal same-realm native Promise returns are observed for rejection
cleanup; unknown thenables are rejected without being executed. This does not
roll back arbitrary external side effects or stop async application code itself.

Direct JSON loses aliases, undefined properties, holes and negative zero. The
node table restores shared references without merging distinct equal-shaped nodes.
Explicit array length/entries and object prototype tags preserve their data meaning.
Property order is retained because `Object.keys` order is observable. Reference
IDs are local to a snapshot, not transaction runtime logical IDs.

The decoder first checks wire records/references/reachability/cycles/limits,
allocates fresh ordinary/null objects and arrays, defines properties safely, and
requires exact canonical re-encoding. No user getter, setter or `toJSON` executes
for ordinary accepted/rejected objects in the tested boundary. Hostile live
Proxy traps and modified host intrinsics are not sandboxed.

111 new Node tests cover this harness/codec, including all three transaction
adapters, type/value matrices, 40 seeded alias graphs and malformed/resource-limit
imports. See the [evidence report](../reports/task-0.8-actions-serialization.md).
No allocation, throughput, browser timing or engine speedup claim is made here.

## Audit findings and required follow-up

- **Array prototype normalization:** current transaction assignment imports turn
  Array subclasses into ordinary arrays. The new codec instead rejects them at
  initial-state/payload boundaries. A dedicated audit test records this mismatch.
  The production membrane must reject unsupported assignment prototypes before
  normalization; do not silently declare subclasses supported.
- **Repeated DAG validation:** the transaction validator has path-based cycle
  detection without completed-node memoization. An eight-level shared DAG reads
  its leaf value 256 times, whereas the graph encoder records nine nodes. Add
  separate active/completed sets to production validation without confusing
  aliases with cycles. Codec count/depth limits alone do not bound all work in
  the existing transaction backend or arbitrary validator/action callbacks.

Existing engine sources and task 0.6 benchmark fingerprints are preserved. These
findings belong in the task 0.9 decision/core adaptation checklist rather than
being hidden by changing old evidence or claiming production readiness.

## Alternatives and consequences

- Direct JSON: simpler but silently changes graph meaning; rejected.
- Tree/path serialization: duplicates aliases and ties identity to mutable paths;
  rejected as the graph snapshot representation.
- Cyclic graphs/native containers: would need extra draft/reactivity/encoding
  contracts; rejected for this prototype, not accidentally dropped or coerced.
- Type-only validation: cannot validate imported/untyped values; rejected.
- Implicit callback arity: ergonomic but ambiguous; replaced by explicit modes.

State root in the action harness must be an object/array; the general codec also
supports primitive roots. Frozen/sealed descriptor flags are not persisted.
Codec validation proves the data representation, not application-specific state
fields; untrusted imported state requires an application schema guard as well.
Canonical-only imports reject pretty-printed or semantically reordered wire
representations instead of normalizing them. Limits include aggregate sparse
array slots, so holes cannot bypass the default allocation guard. They are not
production history memory accounting or a state-growth policy.

Schema version strings and snapshot format version 1 are experimental. Restoring
the data starts a new engine at its initial version; no baseline history,
clock/PRNG continuation, tick assignment, app schema migration, recorded effects,
or replay protocol is implemented. Nested dispatch/no-op policies remain A.3;
the harness explicitly rejects nesting and retains legacy no-op versions.
Event integration also remains later work: use the registered input mode to adapt
no-payload actions and extract semantic payloads; do not pass native Event objects
into serializable dispatch. This harness is not wired into the view-syntax spike.
