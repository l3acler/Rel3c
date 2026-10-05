# C.1/C.2 — Versioned checkpoints and controlled services

Date: 6 October 2026. Owner: Codex. Baseline: Batch 4 commit `35bd747`, committed
at user request. Batch 5 remains uncommitted; no push or publication.

## Result and compatibility

`app.snapshot()` exports canonical bounded state/control checkpoints;
`createApp({snapshot,schema,...})` restores a new owned app with exact state
version and PRNG/clock continuation. `hashSnapshot(text)` validates and returns
SHA-256. Action callbacks now receive frozen `now()`/`random()` services as an
additional argument. Existing callbacks can ignore it; dispatch payload arity
stays unchanged, while callbacks inspecting `arguments`/rest arrays see it.
`controls` initializes uint32 seed/manual microsecond time, and
`app.setLogicalTime(time)` advances a monotone clock outside active runtime work.
Control snapshots are nonreactive and retain committed values.

Failed bodies, invalid commit graphs, Promise/thenable returns, state-version
overflow and draw-count overflow discard staged draws. Successful state/control
advancement precedes notifications/navigation; their failures keep committed
draws and healthy FIFO siblings continue. Services expire at body return and
captured parent access during child payload admission is blocked. Ambient
global reads remain a coding contract, not a JavaScript sandbox.

[ADR 0016](../adr/0016-deterministic-checkpoints-services.md) preceded code and
specifies independent checkpoint/runtime/action versions, canonical graph/hash
rules, seed-zero initialization, state/control failure semantics, import budgets
and recording-format boundaries. The production graph codec is shared with
persistence, whose existing format/version and behavior remain compatible.
There are no new runtime or development dependencies. The exact schema/runtime
version must match on restore; no implicit migration is provided.

The [public guide](../../DOCUMENTATION.md#checkpoints-and-controlled-services),
[API](../api/determinism.md), README, declarations, PRD v2.15, plan and
[runnable example](../../examples/determinism/README.md) describe the API, arguments,
errors, expiry, cleanup and import/export limits. The example compares a fresh
headless restored continuation using only public imports and disposes its fork.

## Verification

Final clean-root command: `npm run audit:frontend -- --offline`. It recreates
the README frontend app, runs tests/startup before installation, installs only
cached locked TypeScript with scripts disabled, checks declarations/source
independence and runs isolated Chrome. Candidate source hashes remain unchanged.

| Check | Result |
| --- | --- |
| `npm test` | 486 runtime tests pass; 44 checkpoint/hash and 17 service cases added |
| `npm run test:spikes` | 292 pass |
| `npm run test:benchmarks` | 15 equivalent-workload correctness checks pass |
| `npm run smoke` | Root startup, modules, public examples and scoped History fallback pass |
| `npm run test:types` | Strict positive TS/checked JavaScript plus 119 independently rejected negative lines |
| `npm ls --omit=dev` | Empty runtime dependencies |
| `npm run test:browser` | 118 Chrome checks, including three fixtures and one new public example check |
| `git diff --check`, public Markdown links | Pass before completion |

Known xorshift uint32 vectors plus independent BigInt math cover six seeds,
including zero and uint32 extremes. Programmed independent apps and a restored
app match through manual-time inputs, failures and repeated draws. Tests cover
FIFO children, failed parents/children, payload-guard boundaries, commit failures,
post-commit errors and expired references. Manual clock changes publish no state
version or visual invalidation; service-only successful actions publish versions
without dirtying unrelated bindings.

Checkpoint tests independently inspect aliases/distinct nodes, holes, custom keys,
null/plain prototypes, negative zero, undefined, property order and array roots.
A literal golden checkpoint fixes canonical encoding; malformed metadata/graphs,
duplicate/noncanonical text, incompatible versions and budget overflow reject.
A legal graph exceeding the wire budget fails export without changing state.
Hash padding/Unicode/standard vectors match Node crypto; real browser checkpoints
match native Web Crypto. Browser manual input sequences with different render
boundaries and restored continuation match; this is not a fixed-tick/replay test.

The [final auditor JSON](../../tests/results/auditor-1791222624329-5206c706.json) embeds browser
results, exact commands, bounded output, candidate hashes and machine versions.
Environment: Node 26.3.0, TypeScript 5.9.3, Darwin 24.6 arm64 / Apple M4,
Chrome 154.0.8037.93. Root commands target Node 18+, with Node 26 verified here.

## Limits and next work

Checkpoints include supported state and version/control metadata, not queues,
DOM, URL/history, storage or handlers. Ordinary mounting with persistence can
hydrate restored fields; checkpoint restoration is not replay/live-effect
suppression. Schema version labels cannot prove the supplied action code/domain
schema is identical. Random words at nonzero draw counts are authoritative
continuations; import does not replay their history. SHA-256 comparisons are
not signatures or provenance authentication. The PRNG is for simulation, not
security randomness. No universal performance, memory/GC or security certification
claim is made.

Fixed ticks and external input/effect adapters are next (C.3/C.4). Input logs,
interpolation, recording/retention/replay, undo and inspector remain unimplemented.
Native OS IME/clipboard/mobile/other-browser qualification stays open. No
separate assignment demonstration app, deployment or stable API freeze is included.
