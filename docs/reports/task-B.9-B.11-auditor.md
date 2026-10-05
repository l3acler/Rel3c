# B.9–B.11: Public frontend contracts and clean-candidate auditor

Date: 6 October 2026. Owner: Codex. Baseline: `c278bd0` (Batch 3 committed at
user request). Batch 4 remains uncommitted; no push or publication.

## Outcome

The documented root frontend candidate passes a clean setup and the full
public-import routed form/list walkthrough. The README supplies complete HTML
and JavaScript rather than planned APIs. The public guide/API references,
browser matrix, PRD v2.14 and plan describe current behavior and limitations.
The framework remains experimental; broad OS/browser input qualification is open.

B.9 adds seven package-entry diagnostic tests for exports, invalid/unknown inputs,
read-only state, computed cycles, missing/duplicate keys, render-time dispatch
and sync/async error reporting. TypeScript now rejects statically visible async
`onError` hooks, matching an existing runtime restriction. Seven additional
negative cases and positive inference cases preserve action/state/event/route
types. There is no runtime transaction/order change. [ADR 0015](../adr/0015-public-frontend-compatibility.md)
defines compatibility/version boundaries for later deterministic services.

B.10's [README](../../README.md) describes root commands/URLs, imports, folder
map, dependency disclosure and reasons for each API. The app creates nested
elements and ID/class/attributes, native labels/forms, click/scroll/key/text
handling, keyed rows, shared routed state and action-requested navigation.
Local persistence retains rows and the next ID together; session retains draft
text. Memory scroll/key state resets on reload. Hash mode needs no host fallback;
the separate History example continues to cover deep loads and reload.

## Clean-candidate verification

Command: `npm run audit:frontend -- --offline`. The offline option uses the
already populated npm cache. Default invocation permits fetching the locked
development dependency; install scripts are disabled in both cases.

The runner creates its own temporary folder, excludes `.git`, `node_modules`
and old results, and excludes the existing auditor example. It reconstructs
exactly the two app files from README blocks and checks equality with the served
example. It runs tests/startup before installing anything, installs the lockfile,
checks types and runtime dependencies, parses runtime imports with the installed
development checker, and then runs isolated Chrome. Candidate hashes must stay
unchanged. Only its own temporary folder/profile is removed. Failed commands
exit nonzero and produce failure evidence. Reports retain bounded command output.

| Command in the clean root | Result |
| --- | --- |
| `npm test` | 425 pass, including seven new public contract checks |
| `npm run test:spikes` | 292 pass |
| `npm run test:benchmarks` | 15 equivalent-workload correctness tests pass; no new timing claim |
| `npm run smoke` | Public imports, server startup, MIME types, examples, scoped History fallback and 404 checks pass |
| `npm ci --ignore-scripts --offline` | Locked TypeScript 5.9.3 installs; no application build |
| `npm run test:types` | Strict positive TS/checked JavaScript pass; 108 independently rejected negative lines |
| `npm ls --omit=dev` | Empty runtime dependency tree |
| `npm run test:browser` | 114 Chrome checks pass |

Eight added Chrome checks verify the README app's nested attributes/list,
native empty-required validation, trusted Escape/editing, Unicode Enter submit
and post-commit navigation, click toggling/reorder identity/focus, native scroll,
query/back-forward state and focus, and real storage reload/memory reset/disposal.
The source/import audit confirms runtime JavaScript imports remain inside `src`
and the application consumes the public entry without ordinary DOM patches or
application-managed browser listeners. The sole dependency is a dev-only checker.

The explicit `scripts/test-node.js` file discovery replaces quoted glob commands
that depend on newer Node versions, preserving the intended Node 18+ command
contract. Only Node 26 is verified in this environment.

## Evidence and limits

Raw clean-candidate report: [auditor JSON](../../tests/results/auditor-1791220483250-3e91b375.json).
It embeds Chrome results, exact commands, environment, candidate source hashes
and bounded output. Environment: Node 26.3.0, TypeScript 5.9.3, Darwin 24.6 arm64
on Apple M4; Chrome 154.0.8037.93. `git diff --check` and relative document links
are checked separately before completion.

This is a temporary copy of candidate files, not a claimed committed Git
checkout. The next revision includes the candidate and its evidence. No runtime
edits, build or file relocation is required to follow startup. A populated cache
was used for clean dependency installation, and only the offline installation
path was exercised here.

Desktop Chrome automation is qualified. OS IMEs, system clipboard paste, mobile,
other browsers and assistive technology remain unverified; see the
[matrix](../browser-support.md). Existing composition-engine/synthetic fixtures
do not substitute for native input qualification. Resource counters verify owned
cleanup, not heap collection. No recording/replay, controlled time/random,
undo/inspector, speedup, final API freeze, deployment or separate demonstration
application is claimed. Next implementation batch is C.1/C.2.
