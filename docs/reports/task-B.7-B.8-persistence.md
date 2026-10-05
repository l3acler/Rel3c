# B.7/B.8: State locations and guarded hydration

Date: 5 October 2026. Owner: Codex. Baseline: Batch 2 commit 24a0636.
Batch 2 was committed at user request; Batch 3 remains uncommitted, with no push.

## Delivered behavior

[ADR 0014](../adr/0014-state-locations-hydration.md) defines the configuration,
source precedence, encoding, namespace/version compatibility, URL ownership,
input publication, errors and cleanup before implementation. Each configured
top-level field has one memory/session/local/URL source; unconfigured state stays
in memory. Nonmemory candidates use owned frozen values and pure synchronous
guards. Missing/invalid sources use documented current-memory or initial-default
fallback rather than mixing locations.

The app reads external values at mount before constructing views and commits
changed accepted projections through an internal input transaction. Canonically
unchanged input retains state/version. The private production graph codec preserves
undefined, negative zero, holes, custom array properties, null prototypes and
acyclic aliases within an area. It is independently validated and does not import
spike modules or supply a recording/replay checkpoint API.

Successful actions coalesce normal storage tasks and replace URL-owned query
entries without adding history entries. Throwing actions write nothing. URL/native
back-forward input hydrates configured values without feedback writes; missing
owned keys reset URL fields to captured defaults. Notifications batch route/state
publication, including action state-to-URL updates. Changed object projections may
replace configured identities to retain their alias topology; unrelated memory
bindings keep exact dependencies.

Storage read/parse/version/guard failures fall back and queue reporting. Quota/
access/encoding/history failures retain committed memory and attempt healthy
areas. Inputs exceeding aggregate state limits roll back as a whole. Error history
and pending reports are bounded to 16 entries. Explicit flushPersistence drains
pending reports/writes independently of visual flush; app.persistence exposes
frozen nonreactive status summaries. Disposal cancels tasks and releases browser,
guard and default references without deleting storage or implicitly flushing.

The [public example](../../examples/persistence/README.md) demonstrates local count,
session note, URL filter and memory count, native text, rollback, reload and history.
It uses public imports only. Guide/README/API references, declarations, PRD v2.13,
metadata and task tracking describe the implemented behavior and compatibility.

## Verification

| Command | Result |
| --- | --- |
| npm test | 418/418 runtime checks: 329 baseline, 16 persistence checks and 73 production codec port/oracle checks |
| npm run test:types | Positive TypeScript/checked JS including the public persistence example; 101 independent negative lines rejected |
| npm run test:browser | 106 native Chrome checks: three new persistence fixtures and the reload/history public example |
| npm run smoke | Root imports/server/modules, public persistence HTML/JS and existing direct-route/404 checks pass |
| npm run test:spikes | 292/292 pass |
| npm run test:benchmarks | 15/15 equivalent-work/oracle checks pass; no new performance measurement or claim |
| npm ls --omit=dev | Empty; no third-party runtime dependencies |
| git diff --check | Pass |

Final browser evidence:
[results and exact source fingerprints](../../tests/results/app-lifecycle-1791214161977-17d23ffd.json).
Environment: Node 26.3.0, TypeScript 5.9.3 (development only), Apple M4,
Darwin 24.6.0 arm64, Chrome 154.0.8037.93. The runner uses an isolated temporary
profile/server and closes/removes its resources, with no signed-in profile or
third-party browser automation/frontend runtime.

Focused fixtures exercise precedence before the first view, selective reload,
write coalescing/deduplication, rollback, native History/hash synchronization,
observer consistency, version mismatches, access/quota/URL-length failures,
frozen guards, runtime reentry, schema/config ownership, aggregate input rollback,
bounded reports and mount retry/disposal. Codec cases use independent graph
topology/property/prototype checks and malformed-wire/resource fixtures; seeded
graphs preserve alias distinctions rather than comparing plain JSON alone.
Real Chrome checks independently restore local/session/URL values on reload,
reset memory fields, accept native Unicode text, traverse history and release
owned resources. Access/quota failure injection is covered by unit host fixtures;
no claim is made about exhausting actual browser storage quotas.

## Limits and next work

One top-level location per field; no nested path overlap, multi-source chains,
automatic migration, storage-event/cross-tab merging or unload flushing.
Namespaces/schema versions are explicit, and aliases across locations are separate
graphs. Full URL size and storage graph/byte limits apply, including envelope
overhead. Disposal cancels pending work; explicit flush is available when it must
complete. Hydration may add an input state version separately from named actions.
External effects already completed are not reversed by later failures.

API remains experimental. Browser qualification is Chrome-only; broad native
IME/clipboard/mobile support remains open. Ownership counters are not heap-leak
proof, and arbitrary callback CPU/effects are outside framework budgets. Ticks,
controlled services, recording/replay and the separate demonstration app remain
future work. Phase B's complete auditor gate has not been marked passed.

Next batch: B.9–B.11 declaration/documentation refinement and a clean-checkout
public-import auditor walkthrough.
