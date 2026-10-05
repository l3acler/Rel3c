# ADR 0015 — Public frontend compatibility

Status: adopted for the experimental B.9–B.11 frontend candidate.

## Decision

`src/index.js` and `src/index.d.ts` are the public import boundary. Application
imports from runtime internals, tests, scripts and spikes are unsupported.
`0.1.0` remains experimental, without an API freeze or stable release claim.
Pin a Git revision when consuming this candidate. Each contract change updates
the public guide and API reference and states its compatibility impact.

The frontend remains usable without deterministic services. Phase C must preserve
app ownership, atomic synchronous actions, exact bindings, native forms/events
and routed shared state. Controlled clock/random, ticks and recordable adapters
need explicit contracts and tests. Today's browser samples, wall time and random
calls are not deterministic. No seed/tick/replay option is accepted today. Any
required action-signature or ordering change must be documented before
implementation and tested against frontend fixtures.

| Version | Meaning |
| --- | --- |
| Package `VERSION` | Implementation/declarations; not a data migration instruction |
| Action schema `version` | Application-defined action/payload meaning |
| Persistence `version` | Stored field schema; defaults to action schema version |
| Private persistence graph format/version | Internal encoding; not a public snapshot/recording API |
| Future recording/runtime/checkpoint versions | Unimplemented; specified and tested in C.1 |

Bump schema versions when their meaning changes. Mismatched persisted envelopes
follow documented fallback/reporting. A later successful action may write the
new version; no migration is promised. Use a new namespace to preserve an old
bucket. Do not consume the private codec as an export/import or replay API.

Final recording/retention formats, undo policy, public templates, distributed
synchronization and the final name remain outside the verified frontend surface.
Broad browser/OS qualification is open; see [browser support](../browser-support.md).
Frontend acceptance does not complete the deterministic product.

## B.9 compatibility change and evidence

Declarations now reject statically visible async `onError` hooks; the runtime
already rejected them with `ERROR_HANDLER_ASYNC`. Synchronous hooks may return
ignored values. A callback widened to `unknown` can conceal its return type;
runtime validation remains authoritative. There is no runtime execution change.

See [the guide](../../DOCUMENTATION.md#compatibility-and-browser-qualification),
[the root walkthrough](../../README.md#build-the-walkthrough-using-public-imports)
and [Batch 4 evidence](../reports/task-B.9-B.11-auditor.md).
