# ADR 0015 — Public frontend compatibility

Status: adopted for B.9–B.11; current C/D compatibility clarified at the D.7 review.

## Decision

`src/index.js` and `src/index.d.ts` are the public import boundary. Application
imports from runtime internals, tests, scripts and spikes are unsupported.
`0.1.0` remains experimental, without an API freeze or stable release claim.
Pin a Git revision when consuming this candidate. Each contract change updates
the public guide and API reference and states its compatibility impact.

At the B.9–B.11 gate, the frontend remains usable without deterministic services. Phase C must preserve
app ownership, atomic synchronous actions, exact bindings, native forms/events
and routed shared state. Controlled clock/random, ticks and recordable adapters
need explicit contracts and tests. Browser samples, wall time and ambient random
calls are not deterministic. Root-level seed/tick/replay placeholders are not accepted. Any
required action-signature or ordering change must be documented before
implementation and tested against frontend fixtures.

| Version | Meaning |
| --- | --- |
| Package `VERSION` | Implementation/declarations; not a data migration instruction |
| Action schema `version` | Application-defined action/payload meaning |
| Persistence `version` | Stored field schema; defaults to action schema version |
| Private persistence graph format/version | Internal encoding; not a public snapshot/recording API |
| Checkpoint format version 1 | Public state/control encoding, independent of persistence |
| Recording format version 1 | Public executed-prefix log/metadata/retention encoding |
| Runtime compatibility `mini-framework-runtime/1` | Authoritative checkpoint/recording execution contract |

Bump schema versions when their meaning changes. Mismatched persisted envelopes
follow documented fallback/reporting. A later successful action may write the
new version; no migration is promised. Use a new namespace to preserve an old
bucket. Do not consume the private codec as an export/import or replay API.

Recording/retention, isolated replay and explicit retained-history undo policy are
implemented and fixture-qualified in C/D. Public templates, distributed
synchronization and the final name remain outside the verified frontend surface.
Broad browser/OS qualification is open; see [browser support](../browser-support.md).
Frontend acceptance alone does not complete the deterministic product; the
[D.7 review](../reports/task-D.7-acceptance-release.md) maps the complete implemented
feature scope and distinguishes it from broad stable release qualification.

## B.9 compatibility change and evidence

Declarations now reject statically visible async `onError` hooks; the runtime
already rejected them with `ERROR_HANDLER_ASYNC`. Synchronous hooks may return
ignored values. A callback widened to `unknown` can conceal its return type;
runtime validation remains authoritative. There is no runtime execution change.

See [the guide](../../DOCUMENTATION.md#compatibility-and-browser-qualification),
[the root walkthrough](../../README.md#build-the-walkthrough-using-public-imports)
and [Batch 4 evidence](../reports/task-B.9-B.11-auditor.md).

## C.1/C.2 follow-up

[ADR 0016](0016-deterministic-checkpoints-services.md) now defines the independent
runtime/checkpoint versions and controlled manual clock/seeded draw contract.
`controls` initialization and new-app checkpoint restoration are implemented;
existing callbacks may ignore the extra action services argument. Private
persistence envelopes stay compatible. Fixed ticks, recording/retention and
isolated replay are now implemented; checkpoint restoration alone is not replay.

## D.7 acceptance compatibility review

The review changes no runtime semantics, public declarations or encoded formats.
Existing synchronous callbacks may ignore action services. Format/runtime/schema
mismatches reject on checkpoint/recording import; no automatic migration converter
is provided. Preserve old exports/storage namespaces when application-specific
conversion is needed. The package version remains experimental `0.1.0`; an npm
publication or API freeze is not implied. See the [release notes](../../RELEASE_NOTES.md)
and [public guide](../../DOCUMENTATION.md#compatibility-and-browser-qualification).
