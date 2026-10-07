# State locations and hydration (B.7/B.8)

Experimental public API. Full runnable imports/configuration:
[public guide](../../DOCUMENTATION.md#state-locations-and-hydration).
Root example: [instructions](../../examples/persistence/README.md).

| API | Contract |
| --- | --- |
| createApp({ persistence }) | Owned namespace, optional version and field configuration |
| field.location | memory, session, local or url; unconfigured fields stay in memory |
| field.validate(value) | Required for nonmemory fields, owned frozen candidate, synchronous exactly-true result |
| field.key | Optional URL-only query key, otherwise the state field name |
| app.flushPersistence() | Cancel the normal driver and synchronously drain pending reports/writes |
| app.persistence | Frozen nonreactive active/pending/errors snapshot; latest 16 diagnostic summaries |

Persistence requires an object root and existing top-level fields, at most 64.
Nested objects/arrays are persisted through their top-level owner. Namespace is
1–64 identifier characters with a letter first; version is nonempty, at most 128
characters, and defaults to action-schema version. Memory entries accept neither
key nor validator. URL keys are unique 1–64 character strings without controls
and require a router. Config accessors, unknown options and invalid defaults reject.

One field has one authoritative source. At mount, accepted external data overrides
memory before views. Missing/invalid session/local fields retain current memory;
missing/invalid URL fields use captured initial defaults. Other sources are ignored.
There are no ambient reads at creation, cross-location precedence chains or
implicit migrations. Wrong namespace/schema, malformed/unsupported/oversized wire
or failed guards fall back and queue error reports without repair writes.
If combined hydration exceeds whole-state/scratch budgets, its entire transaction
rolls back to previous memory and reports PERSIST_INPUT_FAILED.

One changed input projection commits one internal state version; unchanged canonical
input commits none. Hydration is separate from named application action commits.
Object fields in a changed area are assigned together to preserve its aliases;
their identities can change. Unconfigured memory bindings stay exact. Route/state
input and action state-to-URL notification batching exposes synchronized values.
Mount/view failure does not undo an already committed input; it releases tasks/
claims for retry.

Session/local buckets use mini-framework:<namespace>:<area>, with namespace/version
metadata and only selected fields. The private production codec uses
mini-framework-persistence-graph v1, preserving supported primitives, negative
zero, undefined, holes/custom array properties, null prototypes and acyclic aliases.
Aliases survive within one area, independently across locations. It is not the
versioned replay checkpoint format. Each bucket/value supports at most 262,144 UTF-8
bytes, 10,000 nodes, 100,000 entries/aggregate array slots and 128 levels. Envelope/
projection overhead counts. Decoder validates shape, references, cycles and bounds
before graph allocation and rejects noncanonical wire.

URL fields own query keys mf:<namespace>:<key> with one field envelope each.
History uses native query; hash mode uses its inner query. Other query entries and
fragments remain preserved. Duplicate owned entries are invalid. Complete URLs
retain the router's 8,192-character bound. Default values omit their owned keys.
Applications may retain the current encoded query through public route.search.

After each successful mounted action, URL state replaces history without creating
an entry, and storage work queues in normal priority. Failed actions queue/write
nothing. Storage tasks coalesce to latest state and avoid repeat setters after a
successful identical write. They sample no layout or storage inside action bodies.
Both storage areas are attempted despite another area's error; effects already
completed are not undone. Values made invalid by an action remain committed in
memory while persistence rejects their write.

Navigation query is authoritative: absent URL fields reset to defaults, including
action-requested navigation after commit. That input can publish an extra state
version before child actions. State-to-URL replace never feeds back into hydration.
Back/forward reads URL fields without writing history. Session/local are sampled
at mount, not each route. There is no storage-event/cross-tab merging or locking.

flushPersistence takes no arguments, returns undefined, works detached and is a
no-op when no work is pending/before mount. It never flushes DOM; visual flush never
drains storage. Actions, input/guards, mounting, reactive reads/notifications,
rendering and error hooks reject PERSIST_REENTRANT; disposal rejects APP_DISPOSED.
Guards must stay pure; detectable action/navigation/scheduling/lifecycle/reactive
registration reentry rejects. Arbitrary callback effects are outside the guarantee.

Recoverable hydration errors queue normal reporting after fallback/mount.
Write/report failures use PERSIST_FAILED with underlying cause(s); onError phase
persistence observes and the explicit flush/browser task throws after healthy work.
Mixed scheduler errors may use schedule. Status errors retain only the latest 16
frozen code/source/field/message summaries. Pending error batches also cap at 16,
with an omitted-count message. Errors include PERSIST_CONFIG_INVALID,
PERSIST_FORMAT_INVALID, PERSIST_VERSION_INVALID, PERSIST_VALUE_INVALID,
PERSIST_VALIDATE_ASYNC, PERSIST_READ_FAILED, PERSIST_URL_INVALID,
PERSIST_INPUT_FAILED, PERSIST_WRITE_FAILED, PERSIST_SCHEDULE_FAILED,
PERSIST_FAILED and PERSIST_REENTRANT.

Dispose cancels pending writes/reports and releases defaults, guards and browser
references. Stored data remains. Flush before explicit disposal when the pending
write is needed. Nested paths, multi-source fields, migration APIs, unload flush,
distributed/live cross-tab merging are unimplemented. [Isolated replay](replay.md) applies recorded persistence inputs.
Browser checks cover Chrome; resource counters do not prove heap collection.
Decision: [ADR 0014](../adr/0014-state-locations-hydration.md).

C.5 represents accepted initial and location-derived field projections as owned
hydration packets. Bootstrap still combines selected fields before the first view;
URL changes derive values from normalized route input. Supplied hydration validates
namespace/version/field location/guards without reading live Storage. Existing
fallback/write behavior is retained. See [semantic packets](semantic-interpolation.md).
That packet boundary alone does not suppress storage writes; [createReplay](replay.md) does.

D.1/D.2 [history](history.md) uses the same replay suppression during inspection.
Its stable app restores whole state/control/route graphs, invalidating consumers;
normal actions retain their existing property-level behavior. Explicit branch
mount skips ambient startup hydration and restores the selected local URL before
normal live behavior. See history for barriers, ownership, errors and cleanup.
