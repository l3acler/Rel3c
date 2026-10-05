# ADR 0016 — Deterministic checkpoints and transactional services

Status: implemented and verified C.1/C.2; see [acceptance evidence](../reports/task-C.1-C.2-checkpoints-controls.md).

## Decision and compatibility

Keep the frontend/action dispatch contract. A no-payload action is called as
`run(draft, services)`; a payload action as `run(draft, payload, services)`.
Existing handlers can ignore the added argument. `services` is a frozen,
action-scoped object with `now()` and `random()`. Capture neither services nor
drafts for later use. Calls after the action body finishes fail clearly. Captured parent-service access
during child payload admission is rejected without consuming a draw.

`createApp({ controls: { seed, time } })` initializes controlled services; defaults
are seed 1/time 0. Seed is an unsigned 32-bit integer; time is a nonnegative safe
integer measured in logical microseconds, not wall-clock/epoch time. Negative zero
is rejected for metadata. `app.setLogicalTime(time)` advances a manual clock
monotonically at an explicit boundary outside active runtime work. It changes no
state version or DOM binding; actions copy time into state when it is displayed.
All actions in a batch read the same clock. C.3 will own numbered fixed ticks.

The PRNG identifier is `xorshift32-13-17-5/1`. Initialize its nonzero uint32 word
from the seed, mapping seed 0 to `0x6d2b79f5`. Each draw applies xor with left
shift 13, unsigned right shift 17 and left shift 5, truncating to uint32; output
is the word divided by 2^32. This is a reproducible simulation generator, not
a security generator. [Marsaglia's original paper](https://www.jstatsoft.org/article/view/v008i14)
describes xorshift. The exact recurrence, seed-zero mapping and version here are
our format contract; fixtures independently verify integer vectors.

Each action stages draws and their count locally. Publish the staged service
state only after the state transaction commits and before notifications or
navigation. Any action/commit failure discards staged draws. Nested requests
consume draws only when executed in the existing FIFO order; parent failure
discards children. A notification/navigation failure after commit retains both
state and service advancement. Draw counts and state versions are safe integers;
overflow rejects before publication. Leaked services cannot consume another
action's stream. Ambient global reads are still possible in arbitrary JavaScript
and remain forbidden by the action coding contract, not globally sandboxed.

## Checkpoint format v1

`app.snapshot()` exports canonical JSON. `createApp({ snapshot, schema, ... })`
constructs a new owned application from it; do not combine `snapshot` with
`initialState` or `controls`. Restore verifies action-schema and exact runtime
versions before mounting/calling views. It restores state/version and control
continuation, not browser history, storage, DOM, handlers or queues. A later
ordinary mount can hydrate configured persistence fields; this is not replay.

Envelope fields, in canonical order:

| Field | Contract |
| --- | --- |
| `format`, `version` | `mini-framework-checkpoint`, 1 |
| `runtimeVersion` | `mini-framework-runtime/1`, distinct from package version |
| `schemaVersion` | Nonempty application action-schema version, at most 128 UTF-16 units |
| `stateVersion` | Positive safe integer, restored exactly |
| `controls` | Clock and PRNG continuation below |
| `state` | Canonical `mini-framework-state-graph` v1 object |

`controls.clock` has ordered fields `mode: 'manual'`, `time`, `tick: 0`,
`tickDuration: null`. These tick fields explicitly reserve the clock contract;
fixed-mode acceptance belongs to C.3, and is rejected today. `controls.random`
has ordered `algorithm`, `seed`, `state` (nonzero uint32), `draws` (nonnegative
safe integer). Zero-draw words must match the seed initialization. For a nonzero
draw count, the continuation word is authoritative; importing it does not
re-execute historical draws or prove their provenance.

The graph encodes typed primitive tokens and a deterministic first-visit node
table. Preserve enumerable key order, sparse holes/custom array keys, undefined,
negative zero, plain/null prototypes, distinct nodes and acyclic aliases. Root
must be an object/array. Reject cycles, native/DOM values, symbols, functions,
accessors, nonenumerable data except array length, and nonfinite numbers.
Graph IDs are wire-local; internal dependency IDs are freshly assigned on restore.

Checkpoint text is bounded to 8,388,608 UTF-8 bytes. State retains existing limits:
128 object levels, 10,000 nodes, 100,000 entries/aggregate array slots, and
1,000,000 UTF-16 key/string units. Wire shape, references, cycles, reachability,
depth/slot/entry/node budgets are checked before allocating reconstructed nodes;
ordinary state validation applies before app creation. Canonical equality rejects
duplicate/reordered fields, whitespace/alternate encodings and unused nodes.
A legal state can still exceed the separate wire budget on export. No public
limit overrides, permissive decoding or automatic migrations are introduced.

`hashSnapshot(text)` synchronously validates a checkpoint then computes lowercase
SHA-256 of the exact canonical UTF-8 text, implemented here against
[FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final). The hash includes
state topology, versions and control position, never browser/DOM data. Independent
Node crypto/browser digest oracles verify it. A hash is a comparison/integrity
tool, not authentication of an untrusted checkpoint. Source authenticity and
application domain invariants remain caller responsibilities.

## Recording format reserved for C.7–C.9 (unimplemented)

Recording format `mini-framework-recording` v1 will carry `runtimeVersion`,
`schemaVersion`, a usable baseline checkpoint, ordered input entries and optional
checkpoint entries. Each input has a strictly increasing safe `sequence`, a
nonnegative `tick`, an explicit logical `time`, and a discriminated `kind`:
root named action/payload, clock input, or normalized external input/origin.
Checkpoint entries bind the corresponding sequence/tick/version to a canonical
checkpoint and its SHA-256. Recording byte/action/keyframe accounting, import
validation and live-effect suppression are implemented in C.7–C.9, not here.
Nested actions are derived by executing their root and must not be dispatched
again as independent log entries. Failed root attempts still need their input
and outcome recorded; a partially successful FIFO batch preserves its successful
commits. C.4/C.5 own the external-input schema; future evolution incompatible
with v1 must bump the format/runtime version rather than silently reinterpret it.

## Gates

Round-trip independent topology/value checks; strict malformed/version/budget
imports; identical seeded draws/times; rollback including commit validation;
FIFO child ordering; post-commit failures; expired services; uninterrupted vs
restored continuation; Node and browser hash oracles; frontend regression and
root startup. C.3–C.10 ticks, adapters, interpolation, recording and replay remain
unimplemented and no replay/performance/security certification is claimed.

## C.3/C.4 follow-up

[ADR 0017](0017-fixed-ticks-external-inputs.md) implements the reserved fixed clock
mode in checkpoint/runtime v1. Earlier manual checkpoints retain their encoding.
Fixed imports require matching simulation duration; pending inputs/effects reject
snapshot export. External adapters now normalize owned values, with recording,
replay and interpolation still unimplemented. The C.1/C.2 verification above
remains historical evidence for that milestone.
