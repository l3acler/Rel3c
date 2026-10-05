# B.4–B.6: Priorities and shared-state routing

Date: 5 October 2026. Owner: Codex. Baseline: 117b4f2. Batch committed as its own milestone at user request; no push requested.

## Delivered behavior

B.4 adds synchronous immediate work, visual-first frame callbacks, bounded FIFO
normal tasks and opportunistic idle tasks. Normal work has an independent driver
that input/rendering does not replace. Tasks are synchronous, bounded and
cancelable; view-owned tasks cancel on unmount and completed tasks leave their
scope's pending set. Failed callbacks are consumed without blocking healthy work.
Decision: [ADR 0012](../adr/0012-priority-scheduling.md).

B.5 defines the routing contract before B.6 implementation. History is the default,
with hash mode available for static hosts. Ordered path declarations support
params/query, base paths, not-found views and frozen reactive location snapshots.
All routes use the existing store/schema/actions. One outlet may sit inside a
persistent shell. Path changes replace its scope; query/hash changes retain edits,
focus and selection. Links preserve native modifier/default/download/target and
external behavior, including keyboard activation.

Action navigation validates on admission, waits for successful commit and runs
FIFO before nested actions. Rollback discards both requests and children. Errors
after commit retain successful state and drain healthy work. Native back/forward
and hash changes update location without feedback history writes. Failed route
candidates dispose their resources while old DOM remains available for retry.
Router claims and listeners release on failure/disposal; stale failed-mount
listeners stay inert after retry in another Window.
Decision: [ADR 0013](../adr/0013-routing-navigation.md).

The [routes example](../../examples/routes/README.md) uses only public imports:
shared counter/profile, semantic editing, form submission with post-commit
navigation, rollback and normal scheduled work. The root server explicitly serves
its module HTML for missing extensionless deep routes; missing assets and paths
outside that normalized boundary retain 404 behavior. Absolute script paths allow
direct route entry and reload.

Public declarations/metadata, [DOCUMENTATION.md](../../DOCUMENTATION.md), README,
application/DOM/reactivity references, dedicated routing/scheduling references,
PRD v2.12 and development tracking describe implemented behavior. The earlier
README createRouter/template sketch is replaced by the runnable owned-router API.

## Verification

| Command | Result |
| --- | --- |
| npm test | 329/329 runtime checks: 299 baseline plus 12 scheduler and 18 routing checks |
| npm run test:types | Positive TypeScript/checked JavaScript, including routes example; 94 independent negative lines rejected |
| npm run test:browser | 102 native Chrome checks, including eight priority/routing fixtures and two public routes/deep-reload checks |
| npm run smoke | Public imports, root HTTP startup, new runtime modules/example, direct route HTML, missing asset/scoped/encoded-traversal 404 checks pass |
| npm run test:spikes | 292/292 pass |
| npm run test:benchmarks | 15/15 equivalent-work/oracle checks pass; no new timing benchmark or speed claim |
| npm ls --omit=dev | Empty; no third-party runtime dependencies |
| git diff --check | Pass |

Final native evidence:
[source fingerprints and results](../../tests/results/app-lifecycle-1791197602705-3816842d.json).
The runner creates an isolated temporary Chrome profile and ephemeral root server,
then closes both. It does not use a signed-in browser profile or frontend library.
Environment: Apple M4, Darwin 24.6.0 arm64, Node 26.3.0, development-only
TypeScript 5.9.3 and Chrome 154.0.8037.93. Raw evidence records browser version,
flags, machine details, exact file hashes and individual check names.

Unit fixtures cover turn budgets and starvation prevention without frames, idle
deadline/fallback, reentrant work, errors/cancellation/async callbacks, scoped
cleanup, immutable URL admission, FIFO/action rollback, native history failures,
matching/base/hash rules, retained nodes and route retries. Counters return to zero
on disposal even when native cancellation fails. Native browser checks independently
exercise History traversal, hash-event deduplication, input focus/selection, timer/
idle/frame scheduling, disposal, native anchor Enter activation, form submission,
direct entry and reload. Reload intentionally resets memory-only application state.

## Limits and next work

No strict total ordering of browser timer tasks and future paint frames is claimed.
Budgets bound framework callback counts, not arbitrary callback duration, browser
throttling or heap bytes. Resource counters are ownership checks, not a heap leak
proof. Rendering is not an atomic DOM transaction: route URL/snapshot stay committed
when candidate rendering fails, with old DOM retained for explicit retry.

One active outlet/router per Window is supported. Nested outlets, async guards,
loaders, focus/scroll overrides and storage/URL-backed user-state adapters remain
unimplemented. Malformed native URLs report errors without undoing browser history.
Broad browser/mobile/OS IME/clipboard qualification remains open; Chrome automation
does not establish those guarantees. Logical ticks, controlled services, recording/
replay and a separate demonstration application are not part of this batch.

Next batch: B.7/B.8 state-location contracts, hydration precedence and adapters.
Phase B's complete auditor gate remains pending.
