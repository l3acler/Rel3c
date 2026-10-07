# Keyed collections — A.8

Public import: `keyed` from `src/index.js`, or use context/app `keyed` for inferred
application state/action types. See [guide](../../DOCUMENTATION.md#keyed-collections)
for a copyable public-import example.

`keyed(itemsBinding, keyOfItem, itemView)` returns a declarative node. Source must
resolve synchronously to an array; it may be a path token or derived array.
`keyOfItem(item)` reads the tracked read-only item and returns a unique string or
finite number. Keys use Map equality: string/number keys are distinct; -0 and 0
collide. Empty strings are allowed. Holes are rejected, not silently skipped.
Key callbacks must be synchronous/pure; they may read app state, whose fields
become structural dependencies. Key fields and array membership/order are tracked
separately from non-key item fields.

`itemView(context)` synchronously returns normal declarative children. It runs
once when a key enters the list. Context extends the usual view context with:

| Property | Behavior |
| --- | --- |
| `key` | Immutable key for this scope |
| `item` | Immutable path tokens rooted at the current item, such as item.name |
| `index` | Reactive current zero-based position token |
| `value` | Getter for the current read-only item; read it inside derive/computed/observe to track fields |
| `position` | Getter for current zero-based position; reactive when read in a derivation |
| `bind` / `state` | Application root, as in normal views |

Replacing an object under the same key retargets its scope. Derived fields update,
while static factory captures remain static. Read context.value at use time rather
than saving/destructuring item fields. State object facades remain read-only and
follow logical identity; saving one can become detached after replacement. Derived
arrays can contain primitives or derived objects; those follow the source read's
dependencies, rather than gaining independent reactive identity automatically.

Reorders preserve nodes and focused retained ranges without detaching/refocusing
the focused row. Removal cleans all descendants, scoped observers/computed values,
hooks and pending bindings. Nested conditions/lists share the same scope ownership.
Full key validation and new view preparation happen before the old list changes.
A failed candidate is disposed and can retry; native DOM failures may leave partial
successful moves/writes, consistent with the existing non-atomic render contract.

Errors: LIST_INVALID (bad arguments), LIST_SOURCE_INVALID (non-array),
LIST_ITEM_MISSING (array hole), LIST_KEY_MISSING (null/undefined), LIST_KEY_INVALID
(unsupported key), LIST_KEY_DUPLICATE, LIST_RANGE_INVALID (externally altered owned
DOM), plus VIEW_RESULT_INVALID / REACTIVITY_ASYNC / STATE_READONLY for invalid or
impure callbacks. A render failure keeps committed state and is retried with flush
or a later successful action. App-owned foreign binding tokens reject BINDING_OWNER.
The existing 128-level declarative nesting bound applies; no list-size/per-frame
CPU budget is claimed. The [D.5/D.6 report](../reports/task-D.5-D.6-performance.md)
measures specified keyed-list fixtures, range moves and separate heap observations;
it supplies no general list-size or frame-latency guarantee.
