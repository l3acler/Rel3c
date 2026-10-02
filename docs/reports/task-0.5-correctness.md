# Task 0.5 — transaction correctness and identity comparison

**Date:** 2 October 2026. **Status:** correctness gate passed; engine selection remains pending task 0.6 measurements and task 0.9 ADR.

## Reproduce

From the repository root, with the project's supported Node.js installation:

```sh
npm run test:spikes
npm test
npm run smoke
```

For the comparison alone:

```sh
node --test spikes/transactions/comparison.test.js
```

No packages were installed. Tests use Node's built-in test runner and assertions. Verification ran on Node.js v26.3.0, Darwin arm64. The startup smoke checks HTTP/module delivery and public placeholder imports; it does not prove browser DOM behavior or any Phase A runtime feature. Its temporary localhost server needed execution outside the filesystem/network sandbox.

## Findings and corrections

The pre-existing suite passed 91 tests. The first 15 added identity regression tests exposed 10 failures across the three engines:

- Copy-on-write could create multiple draft scopes for an edited object, splitting aliases and held references.
- Both competing prototypes could miss unread parent edges when publishing an aliased child.
- Reordering or removing/reinserting items could copy the reference evaluator's items or expose raw frozen objects from the prototypes.
- Array enumeration/deletion could violate proxy invariants or lose sparse-array holes.

The spike implementations now separate shared transaction lifetime, draft membrane, graph identities, and metadata from their storage strategies:

| Engine | Working storage | Publication |
| --- | --- | --- |
| Reference | Eager, mutable whole-graph clone | Validate/freeze the working graph |
| Copy-on-write | Lazy shallow copy per written node | Materialize reachable graph with untouched references reused |
| Staged operations | Target/key operation overlays, including array indices/length | Materialize overlays with untouched references reused |

Array methods execute native JavaScript algorithms against draft proxies for all engines, so reads/writes/removed values follow the same contract. Draft assignments unwrap owned references rather than cloning moved items. Imported external graphs are copied with aliases preserved, without mutating or freezing caller-owned objects. Current committed references resolve to the corresponding transaction node.

Publication walks all reachable edges, including parents application code never read. Both prototypes retain physical sharing for untouched nodes; modified logical objects retain an engine-local ID across committed versions. The reference makes fresh physical copies but preserves those logical IDs.

Validation also rejects BigInt, symbol keys, accessors, unsupported non-enumerable properties, and unsupported custom array-property values rather than dropping them. Sparse arrays, null prototypes, literal `__proto__` data properties, and key order are preserved. Prototype/descriptor changes through drafts reject explicitly; descriptor reads expose transaction proxies, not raw mutable nodes.

Commit-time cycles, action exceptions, unsupported assignments, Promise/thenable results, and explicit aborts publish no state/version changes and revoke leaked drafts. A following transaction remains usable.

## Exact invalidation protocol

This is an internal spike interface, not a public API selection. Engines retain `begin()`, `draft`, `commit()`, `abort()`, `run()`, `getState()`, and `getVersion()`, and add `getObjectId(object)` for identity checks.

Commit results now include `affectedProperties`, a deduplicated set represented as records:

```js
{ targetId: 4, kind: 'value', key: 'count' }
{ targetId: 4, kind: 'has', key: 'newProperty' }
{ targetId: 4, kind: 'keys', key: null }
{ targetId: 7, kind: 'iterate', key: null }
```

`value` denotes a changed property read; `has` denotes own-property existence changes; `keys` denotes changed enumerable keys/order; `iterate` denotes changed array indices/length. Consumers of native `in` must also account for inherited membership; prototype mutation is outside supported state operations. An item-field edit affects that logical item's field, not the containing array's length/iteration. Reorder affects changed indices and array iteration, not unchanged item fields or length. An own property added with value `undefined` affects existence/keys without affecting a previously undefined value read; inherited properties retain native fallback behavior.

`changes` reports net additions/deletions/sets relative to the preceding committed version, including `targetId`, diagnostic `path`, `key`, `oldValue`, and `value`. Repeated writes collapse; reverted fields disappear even when another field commits. `affectedPaths` remains a diagnostic projection of changed properties, with one representative path per logical node. It is not an invalidation identity or an exhaustive list of alias paths. No ancestor-path invalidations are needed just because immutable publication copied a parent.

Identity changes count even when two objects have equal contents: replacing an object, merging aliases, splitting aliases, or reversing same-shaped distinct items cannot silently become a no-op. Newly introduced nodes have no preceding observers; their parent-edge changes describe their introduction. Detached nodes have no continuing binding identity in the published graph.

The existing spike no-op policy remains: no net observable graph change returns the old snapshot/version and empty metadata. This prototype policy must be explicitly reconciled with named-action publication semantics in the architecture/core action decision before freezing a public API.

## Independent comparison method

The eager reference shares the membrane and metadata protocol to avoid testing different JavaScript contracts. Agreement between engines alone is therefore insufficient evidence. `comparison-fixtures.js` independently clones a native JavaScript state model, executes the generated operations without proxies, and snapshots property values, existence, keys, and array structure. It does not import engine clone/equality/delta helpers.

Each transition checks:

1. Draft reads/aliases against the native model after every operation, with committed snapshots still unchanged.
2. Final values, sparse keys, prototypes, and a bijection of graph aliases, catching both splitting and unintended merging.
3. Stable IDs for surviving/moved objects and exact invalidation sets against independently computed observer changes.
4. Version/no-op behavior, old snapshot isolation, transaction completion, and leaked-draft revocation.
5. Rollback and a clean recovery no-op following every failed/aborted attempt.
6. Agreement of final state topology and versions across the reference, COW, and staged engines.

There are 18 targeted regressions per engine and 12 seeded sequence tests. Seeds are `1`, `2`, `7`, `42`, `1234`, `4096`, `65535`, `305419896`, `2654435769`, `2882400001`, `4294967294`, and `4294967295`. Each seed generates 160 transitions with 1–5 operations: nested field updates, alias edits, repeated/reverted writes, addition/deletion/undefined, insertion, shift/reinsert, reorder/sort, item edits, sparse indices, and array truncation/extension.

The sequence injects throws at a selected operation, explicit abort, thenable return, unsupported assignment, and commit-time cycle failures. Half the attempts commit; half exercise these five failure modes. Across three engines this is **5,760 programmed attempts**, plus **2,880 recovery no-op transactions**. Failures include the engine, seed, step, failure position, and serialized program for reproduction.

## Verification results and limits

- `npm run test:spikes`: **157/157 tests pass** (91 existing, 66 added).
- `npm test`: **3/3 tests pass**.
- `npm run smoke`: **passes**, server closes after checking root redirect, HTML, example module, and public module delivery.

The graph materializer, validation, and delta computation scan the reachable graph; publication allocates temporary objects even when unchanged references are ultimately reused. These are correctness-first spike implementations, not evidence of low allocation or competitive performance. Task 0.6 must measure their allocation, memory, GC observations, median/p95 latency, and browser frame tails on equivalent workloads. Historical descriptions of “zero-cost rollback” are not measured conclusions.

There is no DOM dependency subscriber, keyed renderer, routing, browser-input/replay support, or selected production engine in this task. The checks prove logical transaction identity and invalidation metadata within the supported spike contract. State/snapshot encoding and wider supported-type choices remain subject to task 0.8 and the architecture gate.
