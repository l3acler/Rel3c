# Declarative DOM

Public imports come from `src/index.js`; see the copyable form/conditional example
in [DOCUMENTATION.md](../../DOCUMENTATION.md#declarative-elements-and-bindings).
The [Launch Board example](../../examples/features/README.md) combines these APIs
with computed values, named actions, native GET controls and rollback.

`element(tag, props?, ...children)` returns an immutable descriptor. Helpers:
`div`, `span`, `p`, `button`, `form`, `label`, `input`, `textarea`, `select`,
`option`, `section`, `a`, `ul`, `li`. Omit props when unnecessary. Children may
be strings, finite numbers, binding tokens, descriptors, recursively nested arrays,
null, undefined or booleans. Null/undefined/booleans add no child, including inside
arrays; bound booleans become empty text. Arrays/props are copied without invoking
getters. View results must be synchronous. Strings are text, never raw HTML.

Supported HTML tags: div, p, span, button, form, label, input, textarea, select,
option, optgroup, fieldset, legend, ul, ol, li, section, main, article, header,
footer, nav, a, h1–h6, strong, em, small, br, hr, img, pre, code, output, details,
summary, table, thead, tbody, tfoot, tr, th, td, caption. Input/br/hr/img cannot
contain children. SVG, custom elements, templates and script/style tags are not
implemented. Descriptor/array nesting is limited to 128 levels. There is no total
DOM-size or per-frame CPU budget yet.

`app.bind` / `context.bind` expose immutable path tokens, for example
`bind.user.name` and `bind.rows[0].title`. Bind paths may resolve to undefined;
nullish intermediate fields produce undefined. Tokens remain stable and belong
to their app. A foreign app's token rejects `BINDING_OWNER`. `app.derive(read)` /
`context.derive(read)` pass read-only tracked state. Global `derive(read)` allows
a zero-argument callback reading app state/computed values. Each use has an exact
subscription; callbacks must be pure and synchronous. Static snapshot values do
not track changes. Arbitrary functions are not child/binding shorthand.

Props accept primitives or binding tokens; null/undefined remove attributes.
Boolean HTML attributes require boolean/null/undefined (true adds presence; false
removes it). ARIA/data attributes serialize booleans as strings. `class` and
`className` accept strings or maps of individual class names to boolean/binding
flags. `style` accepts maps of camelCase CSS names, kebab names or custom properties
to strings, finite numbers or null/undefined; numbers have no implicit units.
Binding values can also return whole class/style maps, whose nested reads track.
Style is one binding per element; it owns cssText. Declaration delimiters and
URL/expression functions in CSS values reject. `htmlFor`, `readOnly`, `tabIndex`
map to their HTML attributes. Duplicate names/aliases reject.

`value` on input/textarea/select updates the live DOM property; checked on input
and selected on option update live booleans. The initial input/textarea defaultValue
and initial defaultChecked/defaultSelected are established once. Later commits
update live properties, leaving reset defaults intact. Select children are built
before its value is set; input type is set first. Nonempty file input values reject.
Register onText to dispatch native text edits as action payloads; on.input/on.change
handle other controls. Bound text values defer writes during composition and
preserve/clamp focused selection for differing updates. Native form reset does
not synchronize state automatically; see [event API](events.md).
Other props are attributes. Inline event attributes, raw HTML and srcdoc reject; URL props
allow relative URLs and http/https/mailto/tel protocols only.

`when(condition, yes, no?)` takes a boolean/binding returning exactly boolean and
synchronous branch factories receiving the view context; omitted no returns null.
Same branch retains node identity. A changed predicate creates a candidate scope,
then replaces the old scope. Failed candidate construction removes partial nodes
and resources and preserves the old branch. Scope-owned observe/computed/onDispose
resources end when the branch is removed; hooks are synchronous and all attempted.
Bindings remove their subscriptions on scope removal or app disposal.

Errors include DOM_TAG_INVALID, DOM_PROPS_INVALID, DOM_CHILD_INVALID,
DOM_ATTRIBUTE_INVALID, DOM_CLASS_INVALID, DOM_STYLE_INVALID, DOM_TEXT_INVALID,
DOM_PROPERTY_INVALID, DOM_CONDITION_INVALID, DOM_LIMIT, BINDING_READONLY,
BINDING_OWNER, VIEW_RESULT_INVALID, REACTIVITY_ASYNC and STATE_READONLY.
Keyed collections are implemented; see [collections API](collections.md). Scoped `onClick` callbacks are implemented; see [click API](events.md). Native event maps and semantic keyboard/text props are implemented in B.1–B.3.

The [A.10 core example](../../examples/core/README.md) combines these contracts.
Its [acceptance evidence](../reports/task-A.10-core-slice.md) counts binding evaluations,
setter calls and native mutations: one independent increment reads/writes one text
binding; rollback reads/writes none. These checks use the current APIs without
application DOM patches and do not establish performance or cross-browser claims.

## Scheduling and flush (A.7)

Initial mounting is synchronous. After mounting, successful commits dirty exact
bindings and schedule one animation frame per app. Frames read latest committed
state, process structural branches before owned descendants and write only changed
values. Several commits before a frame evaluate each dirty leaf once. Text and
ordinary attributes compare actual DOM values; style compares the last successfully
normalized authored value to avoid native CSS serialization causing redundant
writes. Style owns cssText; external edits are outside its contract. Form properties
compare actual live values, avoiding setters that disturb selection when unchanged.

`app.flush(): void` cancels the scheduled callback and drains pending work now;
repeated clean flushes do nothing, including before mount. It is detachable and
rejects during actions/guards, mounting, reactive reads/notifications, rendering
or error reporting (FLUSH_REENTRANT), and after disposal (APP_DISPOSED). Environments
without requestAnimationFrame keep visual work pending until flush. Work is app-local;
flushing one app leaves others pending. Disposal cancels callbacks and bindings.

Errors are reported with `onError(error, { phase: 'render' })`; explicit flush
throws after attempting other dirty bindings. Frame callback failures surface to
the browser after reporting. Failed jobs remain pending without a self-retrying
frame loop; explicit flush or the next successful commit retries. State remains
committed; DOM updates are not atomic across bindings. Branch construction failures
retain the old branch; cleanup failure after replacement reports that change.
See [guide](../../DOCUMENTATION.md#render-frames-and-explicit-flush) for examples.
There are no priorities/fairness budgets or simulation ticks yet.
