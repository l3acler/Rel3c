# Experimental 0.1.0 acceptance candidate

7 October 2026. This is a local acceptance record for the framework, with no API
freeze or stable browser release claim. Pin the reviewed Git revision when using
it. The package version remains `0.1.0`; this review changes development audit
tooling and documentation, with no runtime API or serialized-format change.

## Completed implementation

| Phase | Available behavior |
| --- | --- |
| 0 | Measured copy-on-write/staged transactions, syntax/schema prototypes and architecture decisions |
| A | Atomic synchronous actions, exact dependencies, lazy computed values, declarative DOM, keyed identity and lifecycle cleanup |
| B | Native click/scroll/key/text/composition handlers, cooperative priorities, shared-state History/hash routing, guarded state locations, declarations and the root walkthrough |
| C | Versioned checkpoints, controlled clock/random, fixed ticks, external/semantic inputs, display interpolation, bounded recording, isolated replay and divergence reporting |
| D | Retained seek/undo/redo and branching, bounded diagnostics, keyboard-accessible inspector, reproducible benchmarks and measured performance report |

Use [DOCUMENTATION.md](DOCUMENTATION.md) for public imports, arguments, errors,
ownership and limits. The [README](README.md) reconstructs a routed form/list app
from copyable files; startup is `npm run dev`, with no install or build required.
The separate assignment demonstration app remains a later integration task.

## Compatibility and data

Application imports use `src/index.js` or the package export `mini-framework`.
Runtime internals, codecs, test probes and benchmark references are unsupported
application entry points. Existing synchronous action callbacks can ignore the
controlled-services argument. Root `actions`, `seed`, `tick` and template examples
in historical design sketches are not current configuration APIs; use registered
schemas, `controls` and `simulation` as documented.

Package, runtime, checkpoint, recording, application-schema and persistence
versions serve different purposes. Checkpoints and recordings use format version
1 with compatibility runtime `mini-framework-runtime/1`. Imported incompatible
formats/schemas reject before execution; no automatic converter is supplied.
Changing action/payload meanings requires a new application schema version.
Changing stored shape requires a persistence version/namespace decision; mismatches
use the documented fallback/reporting policy. Keep old buckets/exports when an
application needs to migrate them. This batch requires no data migration.

## Qualification and remaining limits

All PRD feature families have documented contracts and automated acceptance
fixtures; the [D.7 review](docs/reports/task-D.7-acceptance-release.md) maps each
requirement to tests and records the final checkout audit. The audit can now create
a temporary local candidate commit, clone an actual clean Git checkout, reconstruct
the README app and run feature/startup/type/browser gates:

```sh
npm run audit:frontend -- --checkout
# Use a populated npm cache without fetching packages:
npm run audit:frontend -- --checkout --offline
```

Git is required for checkout auditing and the checkout regression test; it supplies
no runtime framework behavior. No remote is contacted for the local snapshot or
clone. Only locked development TypeScript installation may need the npm cache or
registry. Generated local commits are confined to temporary directories; the
source repository is unchanged. Audit results go to `tests/results/`.

Desktop Chrome automation is the qualified browser/input environment. OS IMEs,
system clipboard/native paste, mobile keyboards, other browsers and assistive
technology remain unverified. Supported native HTML is a documented subset;
public templates, SVG/custom elements, SSR and distributed synchronization remain
unimplemented. See [browser support](docs/browser-support.md).

Replay requires deterministic synchronous application bodies and recorded ambient
inputs; global APIs/mutable closures are not sandboxed. Undo cannot reverse
completed external effects. Recording/diagnostic byte bounds count the documented
wire representation, not all transient heap or caller-held exports. Owned cleanup
does not prove heap collection. The [performance report](docs/reports/task-D.5-D.6-performance.md)
states transaction/range/capture costs, fixture-specific replay results and
unavailable metrics; it makes no universal speedup or paint/input-latency promise.

Runtime dependencies: none. Node standard-library modules provide tests/serving/
automation; installed Chrome and Git support development checks. TypeScript
5.9.3 is the sole pinned development dependency. No bundler or framework dependency
supplies DOM, state, routing or events. This review does not publish an npm package,
create a remote release, or close the broad native/browser qualification gates.
