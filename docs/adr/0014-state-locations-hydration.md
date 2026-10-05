# ADR 0014: State locations, validation and hydration precedence

Status: implemented in B.7/B.8. Date: 5 October 2026.

## Configuration and ownership

createApp accepts persistence: { namespace, version?, fields }. Namespace is a
1–64 character identifier (letter first, letters/digits/dot/underscore/hyphen).
Version defaults to the action-schema version; it is a nonempty string of at most
128 characters. fields is a plain record with at most 64 existing top-level state
field names. Persistence requires an ordinary/null-prototype object state root.
Each field has one location: memory, session, local or url. Memory is the default
for every unconfigured field. Nested data is persisted by configuring its top-level
owner; overlapping paths and multi-location fields are deliberately unsupported.

Nonmemory entries require a synchronous validate(value) returning exactly true;
values passed to guards are owned and deeply frozen. Optional key is supported
only for URL entries and defaults to the field name. Duplicate URL keys reject.
Guards validate initial defaults at creation and external candidates before input
transactions; they must be pure and cannot reenter the owning runtime.

One bucket per session/local area uses key mini-framework:<namespace>:<area>.
The envelope carries namespace and schema version, plus only that area's selected
fields. Format mini-framework-persistence-graph v1 preserves supported primitives,
undefined, negative zero, holes, array custom properties, null prototypes and
acyclic aliases. Aliases within an area survive; aliases across locations are
independent after hydration. Runtime imports do not depend on spike code. Each
encoded bucket/value is limited to 262,144 UTF-8 bytes and existing graph budgets.
This is a persistence format, not the future replay checkpoint format.

URL fields require the app router. They own namespaced query keys
mf:<namespace>:<key>, with one graph envelope per field. History mode uses native
query; hash mode uses the route query inside #. Route query entries with other
names remain application/router-owned. The complete resolved URL keeps the
router's 8,192-character limit. Multiple occurrences of an owned key are invalid.

## Hydration and publication

No external reads at creation. At mount, claim the router, sample storage and URL,
validate/own candidates, then commit accepted values through one internal input
transaction before constructing the first view. Valid configured external values
override in-memory values. Missing/invalid session/local fields retain current
memory (including pre-mount action commits); missing/invalid URL fields use their
captured initial defaults. No field falls back to another location: one authoritative
source prevents ambiguous local/session/URL conflicts. Wrong namespace/version,
malformed/unsupported/oversized data and false/throwing/async guards fall back and
report errors. If the combined projection exceeds the state contract, its input
rolls back to previous memory and reports PERSIST_INPUT_FAILED. There is no implicit migration or automatic repair write on mount.

Each successful user action still commits once. An adapter input commits once only
when its accepted projection differs canonically; it has no application action
name and cannot create nested application dispatch. Input versions are distinct
from named action commits and available for Phase C normalization later. Location
and input publication are batched so observer notifications see the synchronized
route and state, without rerunning unaffected memory bindings. Accepted object
projections may replace selected object identities; all fields in a changed area
are assigned together to preserve that projection's aliases.

Every successful mounted action schedules one coalesced normal storage task and
replaces owned URL query keys from committed state. Rollback schedules nothing.
Writes read latest committed state outside transactions, validate/encode selected
values, attempt both areas, then report failures without undoing memory. Successful
areas are not rolled back by another area's quota/access failure.

Action-requested navigation follows existing B.6 ordering. A navigation request
may supply URL state; its query becomes authoritative after commit. Missing URL
fields on any route input reset to defaults. The resulting internal input may
publish an additional state version. A state-to-URL replace does not feed back into
hydration. Native back/forward publishes URL fields without writing history.
Session/local data is sampled at mount only: no storage-event/cross-tab merging.

## Errors, flush and lifetime

app.flushPersistence() synchronously drains pending reports/writes and cancels their
normal task. It is distinct from visual app.flush(), accepts no arguments, is a
no-op without pending work and rejects during action/input/render/reactive/error
work or after disposal. Normal writes are not required to wait for idle callbacks.

app.persistence is a nonreactive frozen status snapshot: active, pending, errors
(latest sixteen bounded { code, source, field, message } records). Hydration errors
are recoverable: mount uses fallback and queues a normal error report. Reporting/
write errors use onError phase persistence and rethrow from flush/the browser task
after healthy work; onError does not swallow them. Pending report batches are
bounded to sixteen errors, with an aggregate dropped-count message.

Disposal cancels pending writes/reports and releases browser references, defaults
and validators. It does not flush or delete stored data. Flush explicitly before
disposal when the latest queued storage write is required. Failed mount attempts
cancel their tasks/listeners and permit retry; an already committed hydration input
is not undone by a failing view. URL history writes can fail after state commits;
report the failure and retain committed memory rather than claiming atomic rollback
of browser/storage effects.

Persistence/config/format/read/validation/write/reentry errors have PERSIST_ codes.
No new app-managed browser listener or external state library is required. Broad
browser qualification, migration APIs, nested field paths, distributed ownership,
recording/replay and automatic unload flushing remain future work.

Sources: [HTML Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html)
and [HTML History](https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-history-interface).

Action state-to-URL publication is also batched; observers see the final state and
query once. This does not combine a later admitted navigation into the action
commit: navigation is a separate post-commit operation/input.
