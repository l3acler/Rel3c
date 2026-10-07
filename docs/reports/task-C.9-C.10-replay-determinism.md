# C.9/C.10 — Isolated replay and deterministic qualification

Baseline: Batch 7/8 commit `eaa118b`, committed at user request before starting
this batch. ADR 0020 preceded implementation. Batch 9 remains uncommitted; no push.

Public createReplay restores a separate app after full import/configuration/name/
arity preflight. Its step/run controller executes complete roots and compares
nested FIFO action/input trace ownership, state/control hashes, versions, logical
clock/PRNG and local route endpoints. The first divergence retains bounded details
and completed root hashes, stops before later roots and leaves successful commits
inspectable. Invalid configuration executes no root. Disposal releases imported
history/comparison scratch and app scopes; direct app disposal also closes replay.

Live native app handlers, tick/location drivers, mount-time URL/storage hydration,
History/storage writes, adapter readers/effects/timers and scheduled application
callbacks are suppressed. Saved consumed packets reproduce measured/async/key/text
results. Nested actions execute once, not once per recorded child; derived hydration
and state-to-URL locations execute at recorded publication points. Virtual routing
coexists with a live router and respects recorded History failure. Wire local URLs
omit browser origins; admitted absolute body destinations resolve through recorded
local destinations. Ordinary snapshot restoration remains distinct from replay.

Guide/README/API/declarations/recording example/PRD v2.19 are updated together.
The example now exports and replays limited/recent histories in a second view.

Focused Node qualification: 32 cases covering nested FIFO/no-op/manual time,
rollback/discard/partial success, failure divergence, graph aliases/holes/negative
zero/null prototypes, all-prefix preflight, incompatible versions/arity/tick role,
failed inputs/ticks, admission gaps/future queues, observer failures, virtual routes,
URL defaults/state projection, History failures, supplied hydration, adapter/
scheduling suppression, readonly/lifecycle/reentrancy/descriptor-only options,
recent/session baselines and four deterministic randomized array seeds.
Randomized fixtures run 90 source transitions per seed with recent retention and
independent node:crypto SHA-256 checks at every retained root. Fixed source schedules
[10,10,10,10], [5,15,3,17], [40] produce identical logs, then replay every endpoint.
Deliberate changed bodies/failure messages/nested ordering stop at the first
mismatch; no following root executes. These are correctness fixtures, not benchmarks.

Five additional native Chrome fixtures cover semantic key/text/paste/composition
packet replay with unchanged source focus and inert replay handlers; a virtual
router alongside its live source without History changes; recorded measurement/
async results with changed suppressed callbacks; fixed ticks with display-only
interpolation across three render schedules; and deliberate first divergence.
The public recording example also replays the captured limited session end.

Final verification: `npm run audit:frontend -- --offline` passes. The
[raw artifact](../../tests/results/auditor-1791324154624-72e7dd32.json) contains all
eight command outputs/exit codes, native browser results and 159 matching source
fingerprints. The candidate is a fresh temporary copy without .git/node_modules/
old results; the auditor example is reconstructed from the README. It is not a
committed clean Git checkout. Final results:

| Check | Result |
| --- | --- |
| npm test | 613 passed, including 32 new replay/qualification cases |
| npm run test:spikes | 292 passed |
| npm run test:benchmarks | 15 correctness tests passed; no timing claim |
| npm run smoke | Root server/public modules/examples passed before dependency installation |
| npm ci --ignore-scripts --offline | TypeScript 5.9.3 installed from lockfile/cache |
| npm run test:types | Strict positive TS/checked JS pass; 153 independent negative lines rejected |
| npm ls --omit=dev | Empty; zero third-party runtime dependencies |
| npm run test:browser | 138 Chrome checks passed, including README auditor walkthrough and replay example |

Environment: Apple M4, macOS/Darwin 24.6.0 arm64, Node v26.3.0,
Chrome 154.0.8037.98 with fresh temporary profile, TypeScript 5.9.3.
Local browser/server checks required authorized execution outside the filesystem
sandbox. No approval rejection, remote write, deployment or Git push occurred.
`git diff --check`, public-guide/README replay snippet execution and local Markdown
link verification pass. Reports/ADRs/plan are evidence and excluded from the source
manifest; executable sources, declarations, examples and public docs match it.

Limits: deterministic fixture acceptance completes Phase C's tested runtime scope,
not full product release. Actions/guards/views/cleanup/Promise consumers remain
ordinary JavaScript; direct ambient globals and mutable source-app closures are
not sandboxed. Registered versions cannot prove identical code or authenticity.
Root replay tolerates input admission metadata and notification/native presentation
failures; action rollback/failure/discard and state/version order must match.
Atomic divergent roots finish before stopping; replay never reverses external
side effects. Live accumulator/pending work/paint timing are not reproduced.
OS IME/system clipboard/mobile/cross-browser and native background behavior remain
unqualified. Resource counters demonstrate ownership cleanup, not heap collection.
No performance claim, public seek/undo/inspector, deployment or separate assignment
app is included. Next: D.1/D.2 history/reversible-action policy and seek/undo.
