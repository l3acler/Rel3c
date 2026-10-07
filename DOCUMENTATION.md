# mini-framework public documentation

This guide describes the framework's implemented public API and is updated with
every framework addition or change. Current functionality is experimental:
application lifecycle, read-only state and synchronous named actions, exact observers, lazy computed values and declarative frame-batched DOM. Phase A (A.1–A.10) is complete. B.1–B.8 add native events, semantic keyboard/text inputs, cooperative priority lanes and History/hash routing with one shared application store, plus guarded memory/session/local/URL state locations. APIs remain experimental and browser qualification is limited.
B.9–B.11 refine the public declarations and root auditor walkthrough. C.1–C.10 add versioned checkpoints, controlled services, fixed ticks, semantic inputs, optional display interpolation, bounded recording and isolated replay.
D.1/D.2 add retained history, declared reversible undo/redo and explicit live branching.
Import from `src/index.js`; applications do not need runtime internals.

## What works today

| Capability            | Available behavior                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Application lifecycle | Create headlessly, mount declarative views, register cleanup and dispose                       |
| State ownership       | Private deeply frozen snapshots; nested objects, arrays and acyclic aliases                    |
| Named actions         | Validated inputs, writable transaction drafts, atomic commit or rollback                       |
| Nested dispatch       | Bounded FIFO execution with defined parent and child failure behavior                          |
| Reactive observers    | Exact property, presence, key and array subscriptions with dynamic reads                       |
| Computed values       | Lazy caching, chained/dynamic dependencies, disposal and cycle errors                          |
| Declarative DOM       | Elements, text/attribute/class/style bindings, native form properties and scoped conditionals  |
| Keyed collections     | Insert/remove/reorder with retained nodes, scoped item/index reads and replacement retargeting |
| Native events         | Scoped on maps with capture/passive/once and cancellation; compatible zero-argument onClick    |
| Keyboard/text inputs  | Serializable key/held/reset and native text snapshots; composition-safe value bindings         |
| Render frames         | Deduplicated latest-value writes, cancelled disposed work and explicit`app.flush()`          |
| Priority work         | Immediate/frame/normal/idle lanes with cancellation and bounded FIFO turns                      |
| Routing               | History/hash URLs, params/query, native links, scoped outlets and shared state across routes    |
| State locations       | Guarded startup hydration, post-commit session/local writes and URL-backed fields             |
| Error reporting       | Readable framework error codes and a synchronous application error hook                        |
| TypeScript            | Inferred action names/payloads and read-only state declarations                                |
| Bounded recording     | Opt-in executed roots/traces, versioned export/import and usable recent/session baselines     |
| Retained history      | Keyframe seeking, declared reversible root groups, undo/redo and live branching |
| Isolated replay       | Whole-root step/run, checkpoint/trace comparison, first divergence and live-source suppression |
| Checkpoints           | Canonical versioned state/control exports, owned restoration and SHA-256 comparison           |
| Controlled services   | Manual logical microseconds and transaction-scoped seeded simulation draws                    |

Views construct their static tree once per mount; explicit bindings update affected
text, attributes, classes and styles on render frames after committed actions. Conditional factories
run when their selected boolean branch changes. Native events, keyboard and text editing
are implemented alongside routing, priorities, state locations, controlled services, fixed ticks, semantic input adapters, optional display interpolation and bounded recording. Isolated replay is available below. Broad browser/OS IME qualification remains open.

## Start from the project root

Use Node.js 18 or later; verification currently uses Node.js 26. No dependency
installation, compiler or bundler is needed for browser startup.

```sh
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/). The root redirects to the
basic example, which initializes state through a named action and then mounts a
text report. The package has zero third-party runtime dependencies. Development
tools are the built-in Node test runner/server, installed Chrome for browser
checks, and TypeScript 5.9.3 for type checks. Visit
[http://localhost:3000/examples/dom/](http://localhost:3000/examples/dom/) for a
public-import form, bound greeting and conditional section.

For a fuller example, open
[http://localhost:3000/examples/features/](http://localhost:3000/examples/features/).
The Launch Board combines nested state, lazy computed progress, direct/derived
bindings, class/style updates, scoped conditionals, observers, FIFO action bursts,
rollback and optional explicit flush. Change its settings and submit the native
GET form to reload with a new scenario. This example deliberately uses native reload semantics and local text editing;
it also provides console commands for live public state actions. For live text
synchronization, use the inputs example described below. See [example instructions](examples/features/README.md).

For your own page, save this as `guide.html` at the repository root and open
`http://localhost:3000/guide.html` while the server runs:

```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <title>Framework example</title>
  <div id="app" class="counter" aria-live="polite"></div>
  <script type="module">
    import { createApp, createActionSchema } from './src/index.js';

    const schema = createActionSchema()(({ action }) => ({
      increment: action(draft => { draft.count++; }),
    }));
    const app = createApp({
      initialState: { count: 0 },
      schema,
      view: ({ state }) => `Count: ${state.count}`,
    });

    app.actions.increment();
    app.mount(); // Framework invokes the view and displays Count: 1.
  </script>
</html>
```

The `div` is a native HTML mount container. Plain snapshot text is static; use
explicit bindings below for updates.

## Public exports

| Export                                                 | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `createApp(config)`                                  | Create an application with owned state, registered actions and a view |
| `createActionSchema(options)(build)`                 | Define explicit action input modes and an optional schema version     |
| `element(tag, props?, ...children)` and HTML helpers | Create immutable declarative elements                                 |
| `keyed(itemsBinding, key, view)`                     | Retain item scopes and DOM across list updates                        |
| `derive(read)` and `when(condition, yes, no?)`     | Explicit derived bindings and scoped conditional children             |
| `outlet()`                                         | Render the active route in a persistent app shell                      |
| `hashSnapshot(text)`                                | Validate and hash canonical state/control checkpoint text             |
| `readRecording(text, options?)` / `serializeRecording(recording)` | Validate/decode immutable recordings and return canonical wire |
| `createReplay(config)` | Restore a separate app and control verified replay with live sources suppressed |
| `createHistory(config)` | Inspect retained root endpoints, undo/redo declared groups and create a live branch |
| `FrameworkError`                                     | Framework error class with a readable message and`code`             |
| `VERSION`                                            | Package version string                                                |
| `FRAMEWORK_INFO`                                     | Frozen metadata describing implemented and planned capabilities       |

## Application lifecycle and views

`createApp()` works without browser globals. Without a configured target, the
app stays `created` and its view does not run. `app.mount()` finds `#app` when
called; `app.mount(element)` uses a custom DOM Element. Passing `target` to
`createApp` mounts immediately. Invalid explicit targets do not fall back to `#app`.
A missing target/document rejects clearly, and the app may retry later.

Config supports only `initialState`, `schema`, `view`, `target`, `onError`, `router`, `persistence`, `controls`, `snapshot` and `simulation`. Snapshot construction replaces initial state/control initialization; do not combine them.
Defaults are `{}` state, an empty schema and an empty text view; with a router, the default view is an outlet. Unknown options
and accessor configuration properties reject. Inline `actions` and `seed`
configuration are not implemented.

A view receives `{ state, bind, derive, when, actions, dispatch, observe, computed, onDispose }`.
It returns synchronous declarative elements, binding tokens, strings, finite numbers,
child arrays, null, undefined or booleans. Null/undefined/booleans add no child;
HTML-looking strings remain escaped text. Functions, forged descriptors and async
results reject.
`context.state` and `app.state` read the latest complete committed snapshot;
destructuring or saving that snapshot retains that particular version.

Mount preserves host-owned children, native focus and selection. One application
owns a target at a time. Double mount and target migration reject. Failed mounts
release ownership and clean up their attempted view scope.

`app.dispose()` removes owned DOM and runs cleanup. Disposal is terminal and
idempotent. Afterward, state reads, mounting and dispatch reject. It does not
invalidate snapshots already saved by callers.

## Declarative elements and bindings

Save this module in your own root HTML page containing `<div id="app"></div>`:

```js
import { createApp, createActionSchema, div, form, label, input, section, span } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  rename: action(value => typeof value === 'string', (draft, value) => { draft.name = value; }),
  hide: action(draft => { draft.visible = false; }),
}));
const app = createApp({
  initialState: { name: 'Ada', visible: true }, schema,
  view: ({ bind, derive, when }) => div({ id: 'profile', class: 'profile', 'data-kind': 'form' },
    form(label({ htmlFor: 'name' }, 'Name'), input({ id: 'name', name: 'name', value: bind.name })),
    span(derive(state => `Hello, ${state.name}`)),
    when(bind.visible, ({ bind, onDispose }) => {
      onDispose(() => console.log('Section removed'));
      return section({ class: { visible: bind.visible }, style: { color: 'teal' } }, bind.name);
    }),
  ),
});
app.mount();
app.actions.rename('Grace');
app.actions.hide();
app.flush(); // Optional: apply latest pending bindings now instead of waiting for a frame.
```

`element(tag, props?, ...children)` and `div`, `span`, `p`, `button`, `form`,
`label`, `input`, `textarea`, `select`, `option`, `section`, `a`, `ul`, `li`
use the same rules; empty props are optional. Props/child arrays are copied.
`bind.user.name` tracks that property. Context/app `derive(state => expression)`
tracks only what it reads; global `derive(() => app.state.name)` can also read
computed `.value`. Saved snapshot strings remain static. Mutations and dispatch
inside render reads/factories reject; derivations must be pure and synchronous.

Ordinary attributes accept primitive values; null/undefined remove them. Boolean
HTML attributes use presence for true and removal for false, while `aria-*` and
`data-*` serialize false as `"false"`. `class`/`className` accept strings or a
boolean class map. `style` accepts a property map (camelCase or custom properties),
with primitive values or bindings; numbers have no implicit units, and null removes
a style field. Whole class/style maps can be returned by `derive`. Aliases include
`htmlFor`, `readOnly`, `tabIndex`; duplicate attribute/alias names reject.

For `input`/`textarea`/`select`, `value` sets the live property; `checked` on input
and `selected` on option are live booleans. Input/textarea initial `defaultValue`
and initial checked/selected defaults support native form reset. Later updates
change live values without rewriting defaults. Unchanged values avoid writes,
preserving focus/selection. Register `onText` and dispatch its value to an action
for text synchronization; without a handler, edits remain native/local. Bound
text controls defer writes during composition and preserve/clamp focused selection
for later differing values. Native reset does not dispatch an action.

`when(booleanOrBinding, yesFactory, noFactory?)` retains its branch while the
predicate stays equal. Replacements dispose branch-owned observers, computed
values and cleanup hooks. Factories receive the scoped view context; the omitted
false branch is empty. Failed construction cleans its partial scope and preserves
the previous branch. Application disposal removes owned descendants and leaves
host children alone. Raw HTML, event attributes, script/style elements, unsupported
tags and executable URL protocols reject. See [DOM API](docs/api/dom.md) for the
supported tags, errors and limits. Keyed collections and `onClick` are implemented; native event maps and keyboard/text handlers are implemented (B.1–B.3).

## Keyed collections

Use `keyed(itemsBinding, keyOfItem, view)` to insert, remove or reorder rows while
preserving each retained key's DOM and view scope. It is available as a public
export and on applications/view contexts. Keys must be unique strings or finite
numbers; missing/null keys, unsupported keys, duplicate keys, array holes and
non-array sources reject. String `"1"` and number `1` are different keys; numeric
0 and -0 are the same key. Validate keys before mutating an application list.

```js
import { createApp, createActionSchema, ul, li, input } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  reverse: action(draft => { draft.rows.reverse(); }),
  rename: action(draft => { draft.rows[0].name = 'Grace'; }),
}));
const app = createApp({ initialState: { rows: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Lin' }] }, schema,
  view: ({ bind, keyed }) => ul(keyed(bind.rows, row => row.id, context =>
    li(context.index, ': ', input({ value: context.item.name })))),
});
app.mount();
app.actions.reverse();
app.flush(); // Retained inputs keep identity, focus and selection.
app.actions.rename(); // Only the affected item's name binding changes next frame.
```

The item context includes the normal app view context plus `key`, `item` path
bindings, an `index` binding, and read-only current `value`/`position` getters.
The normal `bind` and `state` remain application-root reads. Read `context.value`
and `context.position` at use time; destructured/saved values can become stale.
Item factories run once per key; replacing an object with the same key retargets
its bindings, observers and computed values without reconstructing its DOM.
Static values captured by the factory remain static. Non-key item edits do not
rerun the key selector or unrelated item bindings. Key changes remove/recreate
that scope. Removal disposes its bindings, observers, computed values, cleanup
hooks and pending work. Filtered/reordered arrays may come from explicit `derive`.

The complete key set and new item views are prepared before the existing list
changes. Failed preparation preserves the prior list and cleans candidates;
correct the source and flush/commit again. Render errors preserve state and do
not make all DOM operations atomic. Focused retained ranges remain connected
during reorder; removing a focused row uses normal browser focus behavior.
See [keyed list API](docs/api/collections.md) for errors and cleanup details.

## Click actions and cleanup

`onClick` registers a synchronous callback with no arguments and no bound `this`.
A no-payload action wrapper can be used directly; wrap payload actions in a closure:

```js
import { createApp, createActionSchema, div, button, span } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
}));
const app = createApp({ initialState: { count: 0 }, schema,
  view: ({ actions, bind }) => div(
    button({ type: 'button', onClick: actions.increment }, 'Increment'),
    span(bind.count),
  ),
});
app.mount();
```

The framework installs one bubbling click listener per app while it owns handlers.
Registered child handlers run before registered ancestors. Native button keyboard
activation, links, disabled controls and form submission retain their default
behavior; use `type: 'button'` for controls that should not submit a form. There
is no Event argument on the compatible `onClick` prop; use `on.click`
for a context with explicit cancellation methods. Returning a Promise/thenable
rejects `EVENT_ASYNC`; the framework cannot cancel arbitrary user async work.
Null/undefined registers no handler; other values reject `EVENT_HANDLER_INVALID`.

Removing a conditional/keyed scope disposes its handlers, observers, computed
values, bindings and pending work. App disposal ends the whole graph, removes the
delegate, cancels frames, then attempts every child/root/app cleanup even when a
hook fails. A callback may explicitly flush removal or dispose its app; later
handlers in disposed scopes are skipped. Uncaught action/handler failures reach
`onError` once at the event boundary (phase `event`) after remaining live handlers;
listener exceptions surface to the browser. Successful earlier commits survive.
Reentrant programmatic clicks during mounting/actions/reactive/render/event/error
callbacks reject `EVENT_REENTRANT`. See [click API](docs/api/events.md) for limits.

Open [http://localhost:3000/examples/keyed/](http://localhost:3000/examples/keyed/)
for a public-import list with clickable increment, add/remove/reorder, completion,
visibility and rollback controls. Its text edits deliberately remain native/local;
add `onText` to opt into action-based text synchronization. The [example guide](examples/keyed/README.md) describes focus and
scope behavior. Routing and priorities are described below; isolated replay is available below.

## Native events, keyboard and text editing

Open [http://localhost:3000/examples/inputs/](http://localhost:3000/examples/inputs/)
for a public-import form, semantic key status, live text/textarea editing and a
scroll region. Native HTML handles editing, focus, form controls and keyboard
activation; the framework owns registration and cleanup.

```js
import { createApp, createActionSchema, form, label, input, button, span } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  name: action(value => typeof value === 'string', (draft, value) => { draft.name = value; }),
  save: action(draft => { draft.saved = draft.name; }),
}));
const app = createApp({ initialState: { name: '', saved: '' }, schema,
  view: ({ bind, actions }) => form({ on: {
    submit: event => { event.preventDefault(); actions.save(); },
  } },
    label({ for: 'name' }, 'Name'),
    input({ id: 'name', name: 'name', value: bind.name,
      onText: value => {
        // Dispatch actual control text, including in-progress composition.
        if (value.value !== app.state.name) actions.name(value.value);
      },
      onKey: (value, event) => {
        if (value.type === 'keydown' && value.ctrlKey && value.key === 'Enter' &&
            !value.repeat && !value.isComposing) {
          event.preventDefault(); actions.save();
        }
      },
    }),
    button({ type: 'submit' }, 'Save'), span(bind.saved),
  ),
});
app.mount();
```

`on` maps lowercase native event names to a synchronous callback or
`{ handler, capture?, passive?, once? }`; each option defaults to false.
`null`/`undefined` registers nothing. The immutable registration is copied when
an element descriptor is created. Known bubbling events share delegates; scroll,
nonbubbling/custom events and capture handlers use direct native listeners.
`on.click` and `onClick` on the same element reject `EVENT_DUPLICATE`.

Event contexts expose `type`, native `target`, the handler's owning `currentTarget`,
`nativeEvent`, live `defaultPrevented`, and cancellation/propagation methods.
Use `event.preventDefault()` only when explicitly handling the native default.
Returning false does nothing. Passive context cancellation rejects `EVENT_PASSIVE`;
use the context methods rather than bypassing them through the live native event.
A once handler is consumed before it runs, including if it throws. Keep native
objects outside action payloads; sample scroll/layout in a handler and dispatch
supported primitive/object data to an action.

```js
// Inside a view using an action schema with a numeric scroll action:
div({ style: { height: '100px', overflow: 'auto' }, on: {
  scroll: { passive: true, handler: event => actions.scroll(event.currentTarget.scrollTop) },
} }, div({ style: { height: '400px' } }, 'Scroll me'));
```

`onKey(value, event)` supplies frozen serializable data: keydown/keyup/reset type,
key, code, location, repeat, isComposing, modifier booleans, ordered held-key
records, and reset reason. Repeats keep one held entry; release uses code/location.
Focus leaving the element's subtree, window blur or a hidden document clears a
nonempty held set and emits one reset; focus inside the subtree retains it.
Disposal clears held state silently. At most 256 held keys are retained per scope.
No global keyboard capture or default cancellation is implied.

`onText(value, event)` supports textarea and text/search/url/tel/email/password/
number inputs. Data contains type text, phase input/composition/commit, actual
value, isComposing, inputType, data and nullable selection offsets/direction.
Useful composition values dispatch while editing; text is never reconstructed
from key events. Paste is observed through the ensuing input event after native
editing, not the clipboard event before it. Identical value/composing pairs are
deduplicated, including final input after compositionend. A final accepted
snapshot with composing false is a separate semantic transition; the example
skips an identical-text action because it stores only the text.

Bound values on text controls defer writes throughout active composition, even
without onText. Compositionend or element blur requeues a deferred binding to
read the latest committed state on the next frame/explicit flush. Equal live
values avoid setters; differing values preserve/clamp active selection and its
direction. A rejected value does not force rendering when state was unchanged;
applications must commit/invalidate an explicit correction if required. Checkbox,
select and file controls use `on.input`/`on.change` with explicitly normalized
payloads. Native form reset changes controls/defaults without changing state;
use `on.reset` with an application-specific policy. Contenteditable is unsupported.

Handlers, direct/global listeners, editing locks and deferred work follow element
scope disposal. Errors keep the existing transactional action and event reporting
rules. Invalid registrations/options/types and unsupported controls have explicit
errors; async handlers reject EVENT_ASYNC. See [event API](docs/api/events.md)
for exact data shapes, propagation timing, reset fields, errors and limits.

Chrome fixtures plus trusted keyboard/Unicode editing and its composition engine
are checked. CDP's final compositionend is untrusted; this is browser automation,
not an OS IME session. Real clipboard paste, Chinese/Japanese/Korean OS input
methods, Firefox/Safari and mobile qualification remain open. Recordable input
snapshots feed the opt-in bounded recorder below; full isolated replay is available below. See the
[batch evidence](docs/reports/task-B.1-B.3-inputs.md).

## Verified core example

Open [http://localhost:3000/examples/core/](http://localhost:3000/examples/core/)
after `npm run dev`. The [example guide](examples/core/README.md) explains its
counter, independent bound value, nested name, conditional details and keyed rows.
All controls use public `onClick` actions; application code installs no listeners
and makes no DOM patches. This smaller pattern also runs from a root HTML module
with a native `<div id="app"></div>` mount container:

```js
import { createApp, createActionSchema, div, button, span, ul, li } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  rename: action(draft => { draft.profile.name = 'Grace'; }),
  toggle: action(draft => { draft.visible = !draft.visible; }),
  reverse: action(draft => { draft.rows.reverse(); }),
  fail: action(draft => { draft.count++; throw Error('Rolled back'); }),
}));
const app = createApp({
  initialState: { count: 0, independent: 'Unchanged', profile: { name: 'Ada' },
    visible: true, rows: [{ id: 1, name: 'First' }, { id: 2, name: 'Second' }] },
  schema,
  view: ({ actions, bind, when, keyed }) => div(
    button({ type: 'button', onClick: actions.increment }, 'Increment'),
    button({ type: 'button', onClick: actions.rename }, 'Rename'),
    button({ type: 'button', onClick: actions.toggle }, 'Details'),
    button({ type: 'button', onClick: actions.reverse }, 'Reverse'),
    button({ type: 'button', onClick: actions.fail }, 'Try rollback'),
    span({ id: 'count' }, bind.count),
    span({ id: 'independent' }, bind.independent),
    span(bind.profile.name),
    when(bind.visible, () => div('Conditional details')),
    ul(keyed(bind.rows, row => row.id, row => li(row.item.name))),
  ),
});
app.mount();
```

A click commits its action synchronously; the dependent text updates on the next
render frame. The root factory, unrelated bindings, conditions and list structure
do not rerun for an independent counter change. Several clicks can publish several
versions while coalescing to one latest-value text write. Use `app.flush()` for an
explicit visual boundary. A throwing action publishes no version and invalidates
no bindings; its native listener error is reported to the browser as described in
[click errors](docs/api/events.md). Rollback does not undo external side effects.

A.10 tests the full runnable example with read/setter counters outside application
code and independent native MutationObserver records. One increment produces
one binding evaluation, one text setter and one characterData mutation; all other
bindings remain untouched. The example's failing action attempts changes across
every section and preserves the original snapshot, version, nodes, focus and
selection with zero evaluations/writes/mutations. Reorder/removal, queued conditional
cleanup and disposal also pass. These are correctness observations, not a performance
or heap-collection claim. See [core acceptance evidence](docs/reports/task-A.10-core-slice.md).

The API stays experimental. B.1–B.3 now add native events and keyboard/text
synchronization. B.4–B.6 add priority work and shared-state routing. B.7/B.8 add guarded state locations. B.9–B.11 complete the public contracts and auditor walkthrough. C.1–C.10 add checkpoints, controlled services, fixed ticks, semantic inputs, interpolation, bounded recording and isolated replay.

## Render frames and explicit flush

Actions commit state synchronously. Dirty visual bindings are deduplicated into
one pending `requestAnimationFrame` per app, read the latest committed values,
and avoid writes when text/attributes/styles or live form properties are equal.
The root view is not rerun. Several commits before a frame cause at most one
latest-value write for each dirty leaf binding. Structural branches run before
their descendants, so removed scopes receive no queued reads/writes. Newly
constructed branch bindings initialize from the current committed state.

```js
app.actions.rename('Grace');
app.actions.rename('Lin');
console.log(app.state.name); // Lin immediately; DOM may still display Ada.
app.flush(); // Bound text/input now display Lin; the pending frame is cancelled.
app.flush(); // Clean queue: no duplicate writes.
```

`app.flush()` takes no arguments, returns undefined and can be detached. It
synchronously drains pending bindings and queued frame callbacks, and cancels its scheduled callback; it is
a no-op before mounting. If the target document has no animation-frame API, work
stays queued until explicit flush. Disposal cancels all work. Flush during an
action/guard, mounting, reactive read/notification, render factory or error hook
rejects `FLUSH_REENTRANT`; flush after disposal rejects `APP_DISPOSED`.

All bindings in a batch are attempted, including after another fails. Failures
leave committed state intact, retain failed work for retry, and reach
`onError(error, { phase: 'render' })`. Explicit flush then throws; a scheduled
frame throws to the browser after reporting. A failing frame does not reschedule
itself indefinitely. Correct the cause and flush again, or commit another action
(including a no-op) to schedule a retry. A failed candidate branch preserves the
old branch; a cleanup failure after replacement reports the completed change.
Rendering is not an atomic DOM transaction: successful writes survive another
binding's failure. Derived callbacks must stay pure and synchronous.

This is visual batching only. Priority work is described below; fixed
simulation ticks and optional display interpolation are documented below. Hidden-tab rendering follows native animation-frame behavior; use
explicit flush for deterministic checks. No speed or heap claims are made.

## Priority work and cancellation

`app.schedule(lane, callback)` runs a synchronous callback in a selected lane and
returns an idempotent cancel function. Use normal work for effects that dispatch
results as actions. Frame work is presentation work and cannot dispatch or navigate.

| Lane | Execution and ordering |
| --- | --- |
| `immediate` | Runs synchronously now; named actions already commit synchronously without scheduling |
| `frame` | Runs after dirty bindings in the next render frame or `app.flush()`; work added by a frame callback waits for another frame |
| `normal` | Independent timer task, FIFO, at most 32 callbacks per turn; input/frames do not replace its pending task |
| `idle` | Native idle callback with 1,000 ms timeout, or a 32 ms timer fallback; at most eight callbacks per turn, after pending normal work and within the idle deadline |

```js
const cancel = app.schedule('normal', () => app.actions.increment());
cancel(); // Cancel queued work; harmless after it has run.
app.schedule('immediate', () => app.actions.increment());
app.schedule('frame', () => console.log('Visual bindings have been applied.'));
```

The view-context `schedule` also cancels pending work when its view/route/list scope
unmounts. Completed tasks are removed from that scope's pending set. Application
work lasts until it runs, is canceled or the app is disposed. Frame work waits for
mounting if queued beforehand; normal/idle work can run headlessly. `app.flush()`
never drains normal or idle tasks. Native browser task/paint timing determines the
relative order of a normal task and a future frame; there is no total ordering of
all lanes. Idle work must not control correctness, and budgets bound callback counts,
not arbitrary callback duration or browser scheduling while JavaScript is blocked.

At most 1,024 deferred callbacks may be queued per app. Invalid lanes/functions
reject `SCHEDULE_LANE_INVALID`/`SCHEDULE_CALLBACK_INVALID`; overflow rejects
`SCHEDULE_LIMIT`. Actions, reactive reads/notifications and error hooks cannot schedule;
immediate work also rejects during view construction/rendering and recursive
immediate scheduling (`SCHEDULE_REENTRANT`). Promise/thenable results reject
`SCHEDULE_ASYNC`. A failed task is consumed, other eligible work is attempted and
future turns still run. Immediate/normal/idle failures report phase `schedule`;
frame callback failures report `render`. Deferred failures also reach the browser's
uncaught-error path. Cancellation and disposal guard stale native callbacks.
See [scheduling reference](docs/api/scheduling.md).

## Routing and shared application state

A router keeps native URLs and a reactive location snapshot synchronized while
all routes use the existing application store and action schema. No app is recreated
on navigation. Save the following as a root browser module, load it in a page with
`<main id="app"></main>`, and open that page with `#/` for this hash-mode example:

```js
import { createApp, createActionSchema, div, button, span, outlet } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  openProfile: action(draft => {
    draft.count++;
    app.navigate('/people/Ada?tab=profile'); // Applied after this action commits.
  }),
}));
const app = createApp({
  initialState: { count: 0 }, schema,
  router: {
    mode: 'hash',
    routes: [
      { path: '/', view: ({ bind, actions, link }) => div(
        span(bind.count), button({ type: 'button', onClick: actions.increment }, 'Increment'),
        button({ type: 'button', onClick: actions.openProfile }, 'Open profile'), link('/people/Ada', 'Profile')) },
      { path: '/people/:id', view(context) { return div(
        context.derive(() => context.route.params.id), ' shared count: ', context.bind.count,
        context.link('/', 'Home')); } },
    ],
    notFound: ({ link }) => div('Not found. ', link('/', 'Home')),
  },
  view: ({ link }) => div(link('/', 'Home'), outlet()), // Persistent shell; optional.
});
app.mount();
```

The runnable History-mode example is
[http://localhost:3000/examples/routes/](http://localhost:3000/examples/routes/).
It includes two routes, a shared counter, semantic text editing, form submission
that navigates after commit, rollback and normal scheduled work. Its server fallback
also supports direct entry and reload at `/examples/routes/people/Ada?tab=details`.
This routes example uses memory-only state, so reload creates a new store from defaults. Configure state locations below to restore selected fields.

Configure `router: { mode?, base?, routes, notFound? }`. Default mode is `history`
and base is `/`. History hosts must serve the same HTML/module page at deep URLs;
use absolute script paths so modules survive direct loads. The root server supplies
this fallback only for missing extensionless URLs under `/examples/routes/`, and
keeps missing assets at 404. Hash mode keeps the mounted document path/query and
places application path/query/fragment after `#`; `base` affects History mode only.

Routes are an ordered array of at most 256 `{ path, view }` declarations; first
match wins. Use absolute application paths with literal segments and `:name`
parameters. Trailing slashes match equivalently; parameter names must be unique
identifiers. Parameters decode once, including encoded slash as opaque text.
Wildcards, optional segments, regex patterns, dot segments, duplicates, holes,
accessors, extra properties and async views are unsupported. `notFound` defaults
to `Not found`. Configuration/pattern errors reject `ROUTER_CONFIG_INVALID`.
One mounted router owns each Window (`ROUTER_OWNED`); ordinary nonrouter apps
can still share that Window. Mount failure/disposal releases listeners and claims.

`app.route` and `context.route` are deeply frozen snapshots: `path` is the encoded
application pathname; `params` contains decoded strings; `query` maps keys to
frozen arrays preserving duplicate values; `search` and `hash` are serialized query
and fragment; `url` is native pathname/search/hash; `matched` and `outsideBase`
expose matching. Route is null before mount or without a router. Route-view context
has a route at construction. Read route inside `derive`, `observe` or `computed`
to react; capturing a snapshot in static text does not update it. Route dependencies
track the entire location snapshot, independently of exact user-state properties.
Location alone does not increment `stateVersion` or mutate user state. Configured URL-backed fields hydrate through a separate state input when their values change.

`app.navigate(to, { replace?: boolean })` accepts absolute application paths,
relative/query/fragment references, or full same-origin URLs within the router's
URL space. History application paths prepend `base`; relative references resolve
against the route current at admission. In hash mode full URLs must retain the
mounted document path/query. Replace uses `replaceState`, otherwise `pushState`;
identical URLs write nothing. Writes preserve native `history.state`. Native
back/forward and hash changes publish once without feedback writes. Native
History traversal outside the base produces a not-found snapshot. Malformed native
URLs report an error and retain the previous snapshot until a valid location arrives;
the browser has already changed its URL in that case. URL strings are
bounded to 8,192 characters; credentials, external origins, unsupported protocols,
whitespace/backslashes and malformed path encoding reject `ROUTE_URL_INVALID`.
Bad options reject `ROUTE_OPTIONS_INVALID`. Navigation requires a mounted router;
missing configuration rejects `ROUTER_MISSING`. Reactive reads/notifications,
payload guards, rendering and error hooks reject `NAVIGATION_REENTRANT`.

Inside an action, valid navigation requests wait for its successful commit.
State notifications run first, then that action's requests FIFO, then queued child
actions. Each request resolves against the location at admission, not previous
queued requests. Throwing/async/invalid actions discard their requests and children
without URL writes. At most 1,024 requests per action are admitted
(`ROUTE_QUEUE_LIMIT`). Notification or native History failure after commit cannot
roll back committed state; healthy requests and children continue. Native write
failure rejects `ROUTE_HISTORY_FAILED` and leaves the old route snapshot.
Direct/native navigation failures report phase `navigation`; failures during an
action report through its outer dispatch, or `event` when invoked by a handler.

`outlet()` mounts one active route scope. Path/record changes prepare a candidate,
then dispose the old scope's bindings, subscriptions, handlers and scheduled work;
query/hash-only changes retain nodes, edits, focus and selection. Several navigations
before a frame coalesce to the latest view. A failing candidate leaves the previous
DOM for retry with `app.flush()` while URL/route stay committed. Cleanup errors
report the completed replacement. One active outlet is supported
(`ROUTE_OUTLET_DUPLICATE`); an outlet without configuration rejects `ROUTER_MISSING`.
Nested/multiple outlets, loaders, async navigation guards, automatic focus/scroll
policies remain unimplemented. Isolated replay restores virtual navigation below. Semantic navigation/location recording is opt-in below. State-location configuration is described below.

`context.link(to, props?, ...children)` or `app.link` creates a native anchor with
owned href/click handling. Use it during mounted view construction; an unmounted
router rejects `ROUTER_NOT_MOUNTED`. Unmodified primary activation navigates and
cancels default; modified/middle clicks, already prevented events, download,
non-self target, `rel="external"`, external/out-of-base URLs and History fragment-only
references preserve browser behavior. Keyboard Enter uses native anchor activation.
Other attributes/events are supported; href/onClick/on.click overrides reject
`ROUTE_LINK_INVALID`. Ordinary `a` descriptors remain native links. No app-owned
listeners or DOM patching are needed. See [routing reference](docs/api/routing.md)
and decisions [0012](docs/adr/0012-priority-scheduling.md)/[0013](docs/adr/0013-routing-navigation.md).

## State locations and hydration

Configure selected top-level fields with `persistence: { namespace, version?, fields }`.
Every unconfigured field stays in memory. One field has one location; persist a
nested object/array by configuring its top-level owner. Validators accept owned,
deeply frozen values and must synchronously return exactly true.

```js
import { createApp, createActionSchema, div, button, input } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; draft.temp++; }),
  search: action(value => typeof value === 'string', (draft, value) => { draft.search = value; }),
}));
const app = createApp({
  initialState: { count: 0, draft: '', search: '', temp: 0 }, schema,
  persistence: { namespace: 'my-app', version: '1', fields: {
    count: { location: 'local', validate: value => typeof value === 'number' && Number.isFinite(value) },
    draft: { location: 'session', validate: value => typeof value === 'string' },
    search: { location: 'url', key: 'q', validate: value => typeof value === 'string' },
    temp: { location: 'memory' },
  } },
  router: { mode: 'hash', routes: [{ path: '/', view: ({ bind, actions }) => div(
    bind.count, ' memory: ', bind.temp,
    button({ type: 'button', onClick: actions.increment }, 'Increment'),
    input({ value: bind.search, onText: value => actions.search(value.value) })) }] },
  onError: (error, { phase }) => console.error(phase, error),
});
app.mount(); // Restore selected external values before the first view.
app.actions.increment(); // Commit now; coalesce storage writes into a normal task.
app.flushPersistence(); // Write/report pending persistence work synchronously.
```

Open [http://localhost:3000/examples/persistence/](http://localhost:3000/examples/persistence/)
for local count, session note, URL filter, memory count, rollback and navigation.
Reload retains configured fields and resets the memory count. Use local fields for
preferences/data shared by the browser's storage area, session for a tab's draft,
and URL for shareable history-entry state. The framework does not synchronize
live local/session state between apps/tabs or listen to storage events.

Namespaces must start with a letter and contain 1–64 letters, digits, dots,
underscores or hyphens. Version is a nonempty string of at most 128 characters,
defaulting to the action-schema version. `fields` is a plain/null-prototype record
of at most 64 existing root fields. Persistence requires a plain/null-prototype
object state root, although ordinary framework apps still support array roots.
Locations are `memory`, `session`, `local`, `url`. Nonmemory fields require
`validate(value): boolean`; optional `key` is URL-only (1–64 characters without
controls). URL keys must be unique and URL fields require a router. Unknown options,
missing fields, accessors, duplicate keys, unsupported locations and invalid default
values reject at creation. Memory entries have no validator/key. Types reject
unknown fields, async guards and inappropriate options; runtime guards still
establish value/schema compatibility.

There are no storage reads at creation. Mount samples browser values outside
application actions, validates them and applies accepted changes in one internal
input transaction before constructing the view. For session/local fields, a valid
stored field overrides current memory; missing/invalid values retain current
memory, including actions run before mounting. For URL fields, a valid value wins;
missing/invalid values use captured initial defaults. Each field has one external
source, so a local field ignores URL/session values and a URL field ignores local
storage. There is no automatic migration or cross-location fallback. Wrong
namespace/version, malformed/oversized wire and false/throwing/async guards fall
back and queue error reporting. If accepted projections collectively exceed the
state graph/scratch limits, the entire input rolls back and retains previous memory.
Mount does not repair or write external data merely because it was invalid.

Hydration commits one state version when its projection differs canonically and
none when unchanged. These are framework input commits, separate from named
application actions; no hydration action appears in `actionNames`. A failed view
mount does not undo already committed hydration, but cancels its pending tasks and
permits retry. Native location and URL field publication are batched so observers
see synchronized route/state. State-to-URL action publication is also batched.
Object fields in a changed location projection are assigned together to preserve
aliases, so hydration can replace their identities; memory-only properties retain
ordinary exact dependency tracking.

Session/local each own one key, `mini-framework:<namespace>:<area>`, storing only
that area's selected fields with namespace/version metadata. The production graph
format `mini-framework-persistence-graph` version 1 preserves supported finite
values, undefined, negative zero, array holes/custom properties, null prototypes
and acyclic aliases. Aliases within one area survive hydration; different locations
are separate graphs and do not preserve cross-location aliases. This is not the
future checkpoint/replay format. Each encoded bucket or URL value is limited to
262,144 UTF-8 bytes, 10,000 nodes, 100,000 entries/array slots and 128 levels;
projection/envelope overhead counts. Unsupported/cyclic values reject. Version
mismatch retains defaults/current memory until a later successful action writes
the new version. Other namespaces remain untouched.

URL fields own namespaced query keys `mf:<namespace>:<key>`, carrying one encoded
field envelope. History mode uses native query; hash mode uses the route query
inside `#`. Ordinary route/query entries and fragments are preserved. Duplicate
owned query entries are invalid. The resolved URL remains subject to the router's
8,192-character limit. The framework builds these values from state; applications
can use the public route's `search` to retain its current query when navigating.

A successful mounted action writes URL fields with `replaceState`, adding no
history entry, and queues one normal storage task. Several commits coalesce into
a latest-state write; unchanged serialized storage avoids repeat setters. Default
URL values remove their owned keys. State-to-URL writes do not feed back into
hydration. A throwing action writes/schedules nothing. Session/local are read at
mount only; changing routes does not reread them.

A navigation's query becomes authoritative for URL fields: entering a route without
an owned key resets that field to its initial default. Action-requested navigation
still runs after its successful commit and before queued children; resulting URL
hydration can add a separate state version. Back/forward restores URL state without
rewriting history. Quota/access/encoding/history failures preserve committed memory,
attempt other eligible areas and report errors; earlier successful effects remain.
Fields mutated by actions are validated for persistence afterward, so an invalid
committed field can remain in memory while its write fails.

`app.flushPersistence()` takes no arguments, returns undefined, cancels its normal
task and synchronously drains pending writes/reports. It is a no-op without pending
work and before mount; `app.flush()` remains a separate visual/frame boundary.
Flush rejects during actions, input/guard processing, mounting, rendering, reactive
reads/notifications and error hooks (`PERSIST_REENTRANT`), and after disposal.
Guards must be pure; detected action/navigation/scheduling/lifecycle/reactive work
from guards rejects. `app.persistence` is a frozen, nonreactive snapshot with
`active`, `pending` and `errors` (latest 16 frozen code/source/field/message summaries).
Pending reports also retain at most 16 errors, reporting how many older errors were
omitted. Status reads do not create reactive subscriptions.

Recoverable hydration problems allow mounting with fallback values and queue a
normal error report. `onError(error, { phase: 'persistence' })` observes the report
or write failure after healthy work; explicit flush throws and automatic tasks
throw to the browser. A hook does not swallow failures. `PERSIST_FAILED` aggregates
underlying format/version/read/value/URL/input/write errors, whose summaries remain
available through `app.persistence.errors`. Without a hook, task errors still surface.
Mixed scheduler failures may aggregate under phase `schedule`. Disposal cancels
pending tasks/reports, releases browser/config references and leaves stored data
intact. It does not flush automatically: call `flushPersistence()` before explicit
disposal when its pending write must complete.

Nested field paths, multi-location precedence chains, migration APIs, automatic
unload flushing and live cross-tab merging remain unimplemented. Recorded persistence inputs run in isolated replay below. Accepted hydration packets can be recorded by the opt-in recorder below. See [persistence reference](docs/api/persistence.md) and
[ADR 0014](docs/adr/0014-state-locations-hydration.md).

## Checkpoints and controlled services

C.1/C.2 make time and simulation draws explicit and restore their continuation
with committed state. C.3/C.4 extend this foundation with fixed ticks and external-input adapters below. C.7/C.8 add bounded recording below; isolated replay is available below.

```js
import { createApp, createActionSchema, hashSnapshot } from './src/index.js';
const schema = createActionSchema({ version: 'samples/1' })(({ action }) => ({
  sample: action((draft, services) => {
    draft.value = services.random();
    draft.time = services.now();
  }),
  scale: action(value => typeof value === 'number' && Number.isFinite(value),
    (draft, value, services) => { draft.value = value * services.random(); }),
  fail: action((draft, services) => {
    draft.value = services.random(); throw Error('Discard this draw');
  }),
}));
const app = createApp({ schema, initialState: { value: 0, time: 0 },
  controls: { seed: 123, time: 0 } });
app.setLogicalTime(1000); // Integer logical microseconds: 1 ms.
app.actions.sample();
const checkpoint = app.snapshot();
try { app.actions.fail(); } catch { /* State and PRNG position remain unchanged. */ }
console.log(app.snapshot() === checkpoint); // true
const fork = createApp({ schema, snapshot: checkpoint });
app.actions.scale(2); fork.actions.scale(2);
console.log(hashSnapshot(app.snapshot()) === hashSnapshot(fork.snapshot())); // true
app.dispose(); fork.dispose();
```

`controls` accepts `seed` (uint32, default 1) and `time` (nonnegative safe integer
logical microseconds, default 0); negative zero, fractions, null, unknown options
and ordinary getters reject. The seeded simulation stream has an explicit
algorithm/version; seed zero uses a defined nonzero word. It is not security
randomness. `now()` reads logical time, never wall time, and stays constant
throughout a dispatch batch. `random()` draws in `[0,1)` in call/FIFO order.

Callbacks receive `(draft, services)` or `(draft, ownedPayload, services)`;
existing callbacks may ignore the added argument, while rest/`arguments` code
sees it. Dispatch payload arity is unchanged. Services are frozen and scoped to
the currently executing action body; payload admission cannot use them, and
captured references expire before commit notifications/children/deferred work.
An action stages draws: success publishes state and service advancement together,
while throws, invalid final graphs, Promise returns or version overflow discard
both. Failures after commit keep successful state and service advancement.

In manual mode, `app.setLogicalTime(time)` advances monotonically at an explicit boundary
outside actions, guards, mounting, rendering, reactive/error work. Equal time is
a no-op; invalid/backward time leaves the clock unchanged. It changes no state
version, binding or numbered tick. `app.controls` is frozen committed metadata
and nonreactive, so copy time/draws into action state for display. The runnable
[controlled example](examples/determinism/README.md) uses public views/buttons
and verifies a restored continuation without replacing mounted state.

`app.snapshot()` exports committed state/version and controls as canonical JSON
outside active work, without publishing state, touching storage or changing URLs. Pending queued inputs/effects reject with `SNAPSHOT_PENDING`; drain or cancel them first.
`hashSnapshot(text)` validates and returns lowercase SHA-256 of its canonical
UTF-8 text. Versions, key/alias topology and clock/PRNG continuation are included;
DOM/browser queues/effects are not. Hashes compare checkpoints; they do not
authenticate their source. Both functions are synchronous and accept no options.

Restore with `createApp({snapshot, schema, ...})` into a new owned app. Do not also
provide `initialState` or `controls`. Runtime/action-schema versions must match;
restore resumes `stateVersion` exactly and preserves supported graph distinctions.
Provide the compatible action code/domain schema; a matching label cannot prove
code equivalence. Views/targets run only after validation. Ordinary mount can
still hydrate configured persistence fields and publish additional versions;
restoration is not replay or suppression of live browser effects.

Checkpoint wire limit is 8,388,608 UTF-8 bytes; existing state graph limits still
apply. Schema labels are at most 128 UTF-16 units for checkpoint use. Invalid,
incompatible, oversize, noncanonical or conflicting inputs reject with
`SNAPSHOT_INVALID`, `SNAPSHOT_INCOMPATIBLE`, `SNAPSHOT_LIMIT` or `SNAPSHOT_CONFLICT`.
Service/time errors use `CONTROL_INVALID`, `CONTROL_LIMIT`, `CONTROL_REENTRANT`
or `CONTROL_EXPIRED`; fixed-mode manual changes use `CONTROL_MODE`. Exporting during active work uses `SNAPSHOT_REENTRANT`.
App operations report `create`, `control`, `snapshot` or the action/event phase,
then rethrow. Standalone hashing has no app hook. Disposal releases app controls;
caller-retained checkpoint strings remain caller-owned.

See [the full API](docs/api/determinism.md) and
[ADR 0016](docs/adr/0016-deterministic-checkpoints-services.md) for exact encoding,
seed initialization and checkpoint budgets. The recording format is documented below. There is
no automatic migration or public persistence-codec decoder.

## Fixed ticks and external inputs

C.3/C.4 let a simulation advance independently of rendering and receive owned
external values. Apps with `simulation` start paused. This public-import example
runs without a document; mounting later adds an owned browser frame driver.

```js
import { createApp, createActionSchema } from './src/index.js';
const schema = createActionSchema({version:'motion/1'})(({action}) => ({
  tick: action((draft, services) => {
    draft.position += draft.speed;
    draft.time = services.now();
  }),
  speed: action(value => typeof value === 'number' && Number.isFinite(value),
    (draft, value) => { draft.speed = value; }),
  external: action(value => value?.version === 1 &&
    ['success', 'error', 'cancelled'].includes(value.status), (draft, input) => {
    draft.result = input; // Supported data, never a native Event/Response/Error.
  }),
}));
const simulation = {tickDuration:10000, action:'tick', maxCatchUp:4};
const app = createApp({schema, simulation,
  initialState:{position:0,speed:1,time:0,result:null}});
app.enqueueAt(2, 'speed', 3);
app.inputs.sample('viewport', 'external', () => ({width:800,height:600}));
app.resumeTicks();
app.advanceTicks(30000); // Three ticks; speed input runs before tick 2.
console.log(app.state.position, app.controls.clock.tick); // 7, 3
app.pauseTicks();
const fork = createApp({schema, simulation, snapshot:app.snapshot()});
console.log(fork.snapshot() === app.snapshot()); // true; fork starts paused.
app.dispose(); fork.dispose();
```

`simulation.tickDuration` is a positive safe integer in logical microseconds;
`action` optionally names a registered no-payload action. `maxCatchUp` defaults to
8 and must be an integer from 1 to 1024. Each tick first advances `controls.clock`
time/ID, consumes its queued roots in admission order, then dispatches tick logic.
Each successful action publishes one state version; a tick itself does not.
No-payload tick logic reads current state and controlled services; it can dispatch
ordinary nested actions through existing FIFO rules. Direct `dispatch` and
`actions` remain synchronous at current logical time, including while paused.
Use `enqueue(name,...payload)` for the next tick or
`enqueueAt(futureTick,name,...payload)` for a specified future tick. Payload arity
matches dispatch. Admission owns/freezes supported data; application payload
validators run when that input executes. Tickets expose frozen `sequence`, `tick`,
`time` and `cancel()`. Cancel removes a pending root and releases its queue budget.

`resumeTicks()` enables simulation; `pauseTicks()` stops elapsed sampling while
retaining backlog and queued inputs. `advanceTicks(elapsedMicroseconds)` accepts
nonnegative safe integers and returns the number of consumed ticks, bounded by
`maxCatchUp`. A paused call returns zero and ignores elapsed time. Excess elapsed
work stays in `app.ticks.accumulator`; `advanceTicks(0)` can drain it. No numbered
tick is dropped to catch up. Mounted resumed apps also use their target window's
animation frames; do not supply a second elapsed driver for the same interval.
The first frame establishes an epoch. Hiding the document stops this driver;
visibility/resume resets its epoch, excluding hidden/paused wall time while
retaining earlier backlog. Explicit advances remain available when hidden.
Rendering still coalesces latest bindings independently; `flush()` does not tick.

`app.ticks` is frozen, nonreactive metadata: `enabled`, `paused`, `accumulator`,
`hidden`, `queuedInputs`, `maxCatchUp`. Copy clock values into action state for display.
A fixed clock rejects `setLogicalTime` with `CONTROL_MODE`. Empty-queue fixed
checkpoints preserve tick/time/duration and seeded stream. Restoring requires a
matching `simulation.tickDuration`; configure compatible tick logic/schema.
Pause state, catch-up budget, frame epoch and elapsed accumulator are live
configuration and reset to paused/zero on restoration. Manual checkpoints require
manual configuration. Pending roots/effects reject snapshot export rather than
silently losing their continuation. C.1 manual checkpoint encoding is unchanged.

A failed input rolls back its action and staged draws, discards its nested
children, and lets healthy sibling roots and tick logic run. The tick remains
consumed; successful commits remain. The driver pauses, reports/rethrows the
failure (or aggregate), and leaves later tick backlog/inputs intact. Resume is
explicit. Tick/time overflow leaves that numbered tick and its roots pending.
Tick APIs, admission/cancellation and snapshots reject during actions, payload
admission, reads/notifications, rendering or error hooks. Native event callbacks
may call them at a boundary after dispatch. Errors include `TICK_INVALID`,
`TICK_MISSING`, `INPUT_LIMIT`, `PAYLOAD_LIMIT`, `INPUT_REENTRANT`,
`CONTROL_REENTRANT` and existing action/payload errors. A queue holds at most 1024
root inputs with aggregate payload limits: 10,000 nodes, 100,000 entries/array
slots and 1,000,000 UTF-16 text units; depth remains 128. Per-action nested batch
limits still apply. Catch-up bounds ticks, not arbitrary callback execution time.

`app.inputs` owns effects for the app; `context.inputs` owns them for a root,
conditional, keyed item or route view. Use the latter for requests that should
stop when that view disappears. All adapters target an action accepting this
supported version-1 payload:

```js
{ version:1, origin:'viewport', status:'success', value:{width:800}, error:null }
// Errors: value:null, error:{name:'Error', message:'...'}, status:'error'.
// Explicit cancellation: value:null, error:null, status:'cancelled'.
```

| Adapter | Arguments and result |
| --- | --- |
| `send` | `(origin, action, supportedValue)` delivers an owned success value |
| `sample` | `(origin, action, synchronousReader)` samples outside actions; thrown reads become error inputs |
| `measure` | `(origin, action, 'viewport')` gives width/height/device-pixel scale; `'layout', element` gives x/y/width/height/top/right/bottom/left; `'scroll', element?` gives x/y from element or window |
| `storage` | `(origin, action, storage, key)` gives `{key,value}` from `getItem`; missing values are null; denied reads become errors |
| `timer` | `(origin, action, delayMilliseconds, supportedValue = null)` returns an owned effect task; delay is finite, 0–2147483647 |
| `effect` | `(origin, action, run)` starts in a microtask, supplies an AbortSignal, awaits supported values and normalizes rejection |

Origin is a nonempty string of at most 128 UTF-16 units. Readers cannot enter
another action/input or dispose the app while sampling. Native measurement fields
must be finite; source failures become error inputs. Returning a Promise from
`sample` rejects with `INPUT_ASYNC`; use `effect`. Unsupported returned data rejects
with payload errors. Error inputs keep only a bounded name/message (128/2048 units),
not a native Error or stack. Async callback effects cannot be rolled back.

Network normalization belongs in the effect callback, outside the transaction:

```js
const task = app.inputs.effect('profile-request', 'external', async signal => {
  const response = await fetch('/profile.json', {signal});
  return {status:response.status, body:await response.text()};
});
await task.done; // Receipt after immediate dispatch or fixed-tick admission.
```

`effect`/`timer` return `{cancel,done}`. At most 1024 effects may be pending per
app. Explicit `cancel()` aborts and delivers one cancellation input while the
scope is live. Disposal aborts, suppresses delivery, cancels already queued scoped
inputs, and resolves `done` to null. Late success/rejection is consumed. Completed
live tasks resolve `done` to a receipt containing sequence/tick/time/input/cancel;
in fixed mode it confirms admission, not eventual action success. Delivery
failures reject `done`; queued guard/body failures arise later from the tick.
Receipts for immediate dispatch cannot undo a committed action. Sequences are
app-session admission metadata, not restored recording positions; they are
outside the action payload. Scoped tasks can register during view construction;
read/send delivery waits until outside construction. Reusing disposed scoped
adapters fails with `SCOPE_DISPOSED`. App disposal also stops its tick driver and
visibility listener. Abort cannot undo a completed remote effect or force an
uncooperative promise to terminate.

The [ticks example](examples/ticks/README.md) demonstrates run/pause, manual
advance, viewport sampling, timers and a local network request using public
imports. [ADR 0017](docs/adr/0017-fixed-ticks-external-inputs.md),
[API reference](docs/api/ticks-inputs.md) and
[verification report](docs/reports/task-C.3-C.4-ticks-inputs.md) specify the limits.
These adapters make normalized values suitable for opt-in recording. C.5/C.6 add semantic event/router/persistence integration and display interpolation below. Bounded recording is opt-in below; isolated replay is available below; saved input injection alone does not suppress live sources.

## Semantic input packets

C.5 connects existing native semantic key/text snapshots, route observations,
navigation requests and accepted hydration values to one owned packet boundary.
The packet boundary itself retains no input log; C.7/C.8 recording is opt-in below. `observeInputs(callback)` reports execution
attempts; `receiveInput(packet, {tick?})` validates and admits a supplied packet.
These APIs support controlled input tests and the recorder below. Isolated replay suppresses runtime live sources as described below; retained seeking is described below.

Use view-owned helpers to admit semantic browser values through payload actions:

```js
import {createApp,createActionSchema,input,div,p} from './src/index.js';
const schema=createActionSchema({version:'editor/1'})(({action}) => ({
  accept:action(packet => packet?.version === 1 && packet.status === 'success',
    (draft, packet) => {
      if (packet.value.type === 'text') draft.text=packet.value.value;
      else draft.held=packet.value.held;
    }),
}));
const app=createApp({schema,initialState:{text:'',held:[]},
  simulation:{tickDuration:10000},
  view:({bind,inputs}) => div(
    input({value:bind.text,onText:inputs.text('editor','accept'),
      onKey:inputs.keyboard('keyboard','accept')}),p(bind.text),
  )});
app.mount(); app.resumeTicks();
```

Keyboard values include key/code/location, repeat, modifiers, held keys and focus/
window-blur/hidden resets. Text values include actual edited value, phase,
composition status, inputType/data and selection. Paste/composition use actual
semantic values rather than reconstruction from key codes. Native editing and
active composition remain live; fixed accepted values wait for the next tick.
This may leave native editing ahead of committed state. Existing selection and
composition-aware binding rules still apply. Native Event/targets, focus and
cancellation are presentation and never enter action payloads. To cancel a key,
wrap the helper and call `event.preventDefault()` synchronously before forwarding.
Existing custom onKey/onText callbacks and direct dispatch keep immediate behavior.

`inputs.keyboard(origin,action)` and `inputs.text(origin,action)` return synchronous
onKey/onText callbacks. Their action receives the same C.4 external envelope with
an owned semantic snapshot as `value`. Creation validates origin/action/scope;
closed scopes reject and remove pending scoped packets. The framework automatically
routes live navigation/location/hydration through the boundary without app code
reading storage or location inside an action.

Packets are plain supported values with an independent `version:1`:

| kind | Required data beyond version/kind |
| --- | --- |
| action | name, args (dense zero/one-element data array); registered payload guard runs at execution |
| navigation | mode, base, canonical local url, replace; request writes History when applied |
| location | mode, base, canonical local url, cause (mount/native/navigation/state), hydrate boolean; application derives route match/params/query from compatible router config |
| hydration | namespace, schemaVersion, groups with session/local/url locations and accepted field values; guards/configuration validate before admission |

Only session/local/url groups are valid hydration locations; memory fields cannot
be injected by hydration. Groups are unique (at most three) and may contain only
fields configured at that location. No runtime guard functions/Storage objects are
serialized. Values are owned/frozen and preserve supported aliases. Packet
version/policy mismatch rejects `INPUT_INCOMPATIBLE`; malformed fields/getters,
extra keys, invalid tuple or unknown kind use `INPUT_INVALID` or existing
route/persistence/action/payload errors. No field getter is needed to validate an
ordinary packet. Application Proxy traps/global reads cannot be sandboxed.

Observers receive frozen `{sequence,tick,time,derived,packet}` before each live
execution attempt. A sequence counts admission in this app session; future tick
assignment can make execution receipts arrive in a different sequence order.
Use callback order/tick, rather than sorting by admission sequence. Observers see
failed action attempts, and derived location/hydration work is labeled. Nested
named action dispatch is still owned by the dispatcher and is not a second packet.
Ordinary direct dispatch is not observed here; the opt-in recorder separately
captures it and dispatch outcomes. Observers must be synchronous and cannot dispatch,
receive inputs, mutate controls or mount/dispose while observing. Failure does
not prevent healthy input execution; errors are reported afterward or aggregated
with body errors. No post-execution success/outcome field is claimed here.

`observeInputs` returns a stop function. At most 1024 subscriptions are live;
passing the same callback twice creates independent subscriptions. View-context
subscriptions are disposed with their scope. Stop is idempotent. Any arrays or
packets captured by callbacks are caller-owned; bound that retention yourself.
Manual observation does not touch state/DOM; the opt-in recorder separately owns bounded history.

For controlled tests, save a root packet and apply it to a compatible fresh app:

```js
import {createApp,createActionSchema} from './src/index.js';
const schema=createActionSchema()(({action}) => ({
  add:action(value => typeof value === 'number',(draft,value) => {draft.n+=value;}),
}));
const one=createApp({schema,initialState:{n:0}});
let saved;
const stop=one.observeInputs(event => { if(!event.derived) saved=event.packet; });
one.receiveInput({version:1,kind:'action',name:'add',args:[3]});
const two=createApp({schema,initialState:{n:0}}); two.receiveInput(saved);
console.log(one.snapshot() === two.snapshot()); // true
stop(); one.dispose(); two.dispose();
```

Manual roots execute immediately. Fixed action/native-location/imperative-
navigation roots queue for the next tick, or an explicit future `tick` with
`receiveInput`. The latter returns a frozen cancelable ticket. Live boot location/
hydration and derived work execute synchronously, preserving initial view and
post-commit URL projection. On a fresh unmounted app, supplied mount location and
hydration packets also default to immediate bootstrap; an explicit tick overrides
that behavior. Fresh mount location does not prematurely apply URL hydration;
the captured bootstrap hydration projection supplies initial fields together.
Later location packets derive URL-owned fields without reading current storage.

In fixed mode, `navigate` writes History at its assigned tick; native browser
history changes are already visible before their queued route state is applied.
Multiple requests resolve relative URLs against current committed route at
admission. Action-requested navigation remains post-commit derived work; a failed
parent discards it. State-to-URL writes remain derived, with hydration disabled.
Supplying a location packet updates the route cell using its saved URL and leaves
live browser History untouched; it can work headlessly. Supplying a navigation
packet requires a mounted compatible router and performs History normally.
Hydration application uses configured guards, not live reads. The isolated replay controller below suppresses live navigation/storage/effects. Matching packets
alone do not prove action-code/domain compatibility or reproduce unrelated
browser presentation. Snapshots still exclude route cells and any pending inputs.

## Display interpolation

C.6 provides `app.interpolate(read)` / `context.interpolate(read)` as opt-in
presentation bindings for fixed simulation. The callback receives frozen
`{previous,current,alpha,tick,time}`: two committed tick roots, bounded alpha,
current tick ID and logical microseconds. Use it for positions/transforms. Ordinary
bind/derive text and form values keep current committed semantics.

```js
import {createApp,createActionSchema,div,p} from './src/index.js';
const schema=createActionSchema()(({action}) => ({tick:action(draft => {draft.x+=10;})}));
const app=createApp({schema,initialState:{x:0},simulation:{tickDuration:10000,action:'tick'},
  view:({bind,interpolate}) => div(
    p('Committed: ',bind.x),
    div({style:{transform:interpolate(({previous,current,alpha}) =>
      `translateX(${previous.x+(current.x-previous.x)*alpha}px)`)}},'Moving dot'),
  )});
app.mount(); app.resumeTicks();
```

Alpha is accumulator/duration while running below one tick of backlog. Pause,
hiding or backlog at/above a tick clamps alpha to 1, displaying current state;
there is no extrapolation. Resume/visibility uses the retained fraction. Previous
and current are identical initially/after restore. Successful ticks shift the
pair; a failed tick uses its healthy committed prefix and pauses at alpha 1.
Direct commits outside ticks reset both roots to latest state, avoiding stale
smoothing of immediate UI changes. Historical aliases/array order remain frozen.

Alpha updates dirty only interpolation consumers. The existing render queue
coalesces those bindings; there is no extra frame driver. Explicit elapsed
advances also update alpha. Interpolation callbacks cannot mutate roots, dispatch,
advance clocks or create effects, and Promise returns reject. They can produce
text, attribute or style values. Structural `when` conditions and keyed sources
reject interpolation tokens with `INTERPOLATION_STRUCTURAL`, so paint timing
cannot control effect-owning view lifetime. Use state bindings for structure.

Manual clocks reject creation with `INTERPOLATION_MODE`; active action/read/input
observation creation rejects `INTERPOLATION_REENTRANT`. Async callbacks use
`REACTIVITY_ASYNC`; existing readonly/reentrant errors apply to attempted mutation.
View-scoped tokens expire with that scope. App disposal releases the lazy reactive
cell and both retained roots. The runtime keeps only two COW roots, with existing
state graph budgets for each; caller captures remain caller-owned. Interpolation
changes no state versions, clock/random stream or checkpoint hashes. Snapshot
restoration starts from one authoritative root, not a retained display pair.

See the [API reference](docs/api/semantic-interpolation.md),
[runnable example](examples/interpolation/README.md) and
[C.5/C.6 verification](docs/reports/task-C.5-C.6-semantic-interpolation.md).

## Bounded recording

C.7/C.8 add opt-in recording of executed transitions. The runtime keeps a usable
baseline, ordered execution roots, action/input traces, checkpoint hashes and an
end snapshot. Export is an explicit developer operation; nothing is automatically
uploaded, downloaded or persisted. Isolated replay and divergence reports are described below; retained seeking is described below.

```js
import {createApp,createActionSchema,readRecording,serializeRecording}
  from './src/index.js';

const schema=createActionSchema({version:'samples/1'})(({action})=>({
  sample:action((draft,services)=>{
    draft.samples.push({time:services.now(),value:services.random()});
  }),
}));
const app=createApp({schema,initialState:{samples:[]},controls:{seed:7}});
app.startRecording({mode:'recent',maxActions:100,maxBytes:1000000,keyframeInterval:10});
app.setLogicalTime(1000);
app.actions.sample();
app.actions.sample();
app.stopRecording();
const text=app.exportRecording();
const recording=readRecording(text,{schemaVersion:schema.version});
console.log(recording.records.map(record=>({
  root:record.root.kind,commits:record.commits,hash:record.after.hash,
})));
console.log(serializeRecording(recording)===text); // true, canonical round trip
app.clearRecording(); // release the app's retained history
app.dispose();
```

`startRecording(options={})` returns a frozen status. It rejects an already active
recording, pending tick inputs/effects or a budget unable to hold the baseline.
Mount before starting, or keep the recording app headless: mounting during active
capture rejects `RECORDING_ACTIVE`, including automatic router/storage hydration.
Baseline state therefore already includes accepted startup hydration. Starting
again after stopping or reaching a limit explicitly replaces the previous history;
a failed start preserves it. `stopRecording()` is idempotent and preserves exports.
`clearRecording()` stops capture and releases it. `app.recording` is a frozen,
nonreactive status snapshot; use it at an idle boundary for developer UI.

These methods and `exportRecording()` require an idle boundary: they reject in
an action, input observer, reactive read/notification, render, mounting, tick or
error hook. Event/deferred callbacks can call them outside that work. Operation
errors use phase `recording`. Disposal releases logs and scratch; exported strings
and imported immutable objects remain caller-owned. Recordings include the actual
captured application payloads/state, so choose export deliberately.

| Option | Default | Meaning |
| --- | --- | --- |
| mode | recent | recent evicts complete checkpoint segments; session preserves its complete captured prefix and stops at limits |
| maxActions | 1024 | Retained action slots, 1–100000; each admitted action including discarded children costs one, and an otherwise empty root costs one |
| maxBytes | 33554432 | Retained canonical wire accounting, 1–67108864 UTF-8 bytes |
| keyframeInterval | 64 | Charged action slots between root-boundary checkpoints, 1–100000 |

The byte budget includes both baseline/end snapshots, roots, trace payloads,
metadata and periodic snapshots. `recording.bytes` accounts the canonical wire
with normalized active/null status plus a 256-byte reserve for terminal status;
the actual export fits within this amount. This measures retained wire data,
not JavaScript heap bytes. Authoritative state, one bounded in-progress root,
serialization temporaries and caller copies are separate. Scratch encoding is
capped by the same byte/action policy; a single transient encode can still allocate
before being rejected. No performance or heap-collection claim is made.

Recent history eviction moves the baseline to a retained keyframe and removes all
preceding records/checkpoints together. If there is no intermediate keyframe,
the end snapshot becomes the baseline and the suffix is empty. An oversized
atomic root similarly advances to its endpoint and drops the older prefix;
`evictedRecords`/`evictedActions` expose that expiry. Subsequent roots can record
normally. If even the new baseline/end cannot fit, capture stops with
`status:'limit-reached'` and `reason:'baseline-limit'`, preserving the last usable
prefix. Session mode never evicts: exceeding action/byte bounds stops with
`action-limit`/`byte-limit`. An unexpected capture/encoding failure stops with
`capture-failed`. Capture limits do not abort application actions or tick logic.
The preserved end may therefore precede live state; restart explicitly to record
from the new live baseline. Stopping does not clear a limit-reached result.

A record represents one complete execution root:

- `dispatch`: one outer named dispatch batch, including nested FIFO children.
- `input`: one manual/immediate semantic packet execution, including derived work.
- `tick`: one consumed numbered tick, its ordered inputs and configured tick action.
- `time`: one valid manual logical-time input, including a same-time no-op.

A failed root can contain successful commits. Action events distinguish `queued`,
`dispatched`, `committed`, `failed` and `discarded`; discarded children never ran.
Nested action events are diagnostics attached to their root, not extra commands
for the replay controller. Direct invalid admission (unknown action, arity or
payload guard) causes no executed root. A packet already admitted whose payload
fails at execution has a failed input root with no admitted action. Error summaries
are bounded inert strings; application Error objects/accessors/stacks are not retained.

Consumed inputs retain admission sequence, assigned tick/time, derived status and
`queued` delivery metadata. Actual trace/record order is execution order, so an
explicit future assignment can execute after a later admission. Unconsumed/canceled
queue tickets cause no transition and are not recorded. Pending work after start
is excluded from exports: an export describes the complete executed prefix only,
not the current future queue. Async results are recorded when normalized delivery
executes; starting an effect itself is not a replay command. Pauses, visibility,
render frames, elapsed fractions and interpolation values do not create records.

`baseline`/`end` contain sequence, canonical state/control snapshot and separate
local route metadata (`mode`, `base`, `url`, or null). Snapshots retain state/schema/
runtime versions, logical time/tick/duration, seed and PRNG continuation. Each root
has committed version delta, control metadata, SHA-256 endpoint hash and optional
checkpoint. Supplemental route data does not change `hashSnapshot`'s state/control
hash; ordinary `createApp({snapshot})` still does not restore route cells.

Keyframes occur at complete root boundaries after the configured slot interval.
An indivisible nested batch/tick can cross the interval; a retained seek replays
at most that interval plus one atomic root, rather than resume half a dispatch
without its pending children/navigation. The history controller below implements retained root seeking.

`readRecording(text,{schemaVersion?})` imports canonical version-1 JSON without
calling action bodies/guards, starting effects or changing an app/History/storage.
It checks hard/declaration budgets, exact versioned fields, graph data, sequences,
clock/version progression, trace ownership/FIFO/outcomes, checkpoint hashes and
final continuation. It returns deeply frozen decoded roots/events; tagged graph
encoding preserves aliases, holes, custom array properties, undefined, negative
zero, null prototypes and property order. The wire stores root/events as separate
canonical graph strings. `serializeRecording(value)` accepts only the immutable
value returned by `readRecording` and returns its identical canonical wire;
constructing or spreading a recording object does not produce a trusted import.

These checks establish structural compatibility, not application behavior or
integrity/authenticity. Application schema versions must identify compatible
bodies/guards; isolated replay verifies intermediate hashes against actual work.
No migration is automatic. Malformed/noncanonical data rejects `RECORDING_INVALID`,
incompatible versions/schema reject `RECORDING_INCOMPATIBLE`, and import/baseline
budgets reject `RECORDING_LIMIT`. App boundaries additionally use
`RECORDING_ACTIVE`, `RECORDING_PENDING`, `RECORDING_MISSING`,
`RECORDING_REENTRANT` and existing disposal errors.

Run `/examples/recording/` after `npm run dev` for a developer-controlled export
example. See [recording API](docs/api/recording.md),
[ADR 0019](docs/adr/0019-ordered-recording-retention.md) and
[verification](docs/reports/task-C.7-C.8-recording-retention.md).

## Isolated replay

`createReplay` restores a separate app from a validated recording baseline and
re-executes complete roots. It compares every root's state/control SHA-256, version,
clock, PRNG continuation, action/input ordering and local route. The controller
stops before the next root at the first divergence. Original application state is
not a controller target.

```js
import {createApp,createActionSchema,createReplay,div} from './src/index.js';

const schema=createActionSchema({version:'replay-samples/1'})(({action})=>({
  sample:action((draft,services)=>{
    draft.values.push({time:services.now(),value:services.random()});
  }),
}));
const source=createApp({schema,initialState:{values:[]},controls:{seed:7}});
source.startRecording();
source.setLogicalTime(1000);
source.actions.sample();
source.actions.sample();
source.stopRecording();
const text=source.exportRecording();
const replay=createReplay({recording:text,schema,
  view:({derive})=>div(derive(state=>state.values.length))});
// Optional: replay.app.mount(document.getElementById('replay-target'));
console.log(replay.step()); // consume one whole root
const result=replay.run(); // synchronous: consume remaining roots
console.log(result.status, result.divergence); // 'complete', null
console.log(replay.app.snapshot()===source.snapshot()); // true
replay.dispose();
source.dispose();
```

`recording` accepts a canonical string or frozen `readRecording` result. Register
compatible action bodies/guards under its schema version. The entire import,
registered names/arities, route mode/base, hydration configuration and tick role
are checked before any transition or view invocation. Hydration preflight may call
pure configured guards. Payload guards run at execution, so recorded failed inputs
are supported. Invalid configuration rejects `REPLAY_INCOMPATIBLE` with its cause;
recording format/version/budget errors keep their recording error codes.

Optional `router`, `persistence`, `simulation` and `view` have the ordinary public
configuration shapes. A fixed baseline restores duration/tick/time/random; omitted
simulation infers duration and the configured action from retained tick roots.
Explicit duration/role must match. Router baseline metadata initializes virtual
location without hydration. A recording with route/hydration packets needs matching
configuration. There is no `target` option or automatic mount; use `replay.app.mount`
after successful preflight. There is no live `onError` hook. Typed schemas preserve
state/action inference; `replay.app.replaying` is true (ordinary apps return false).

`step(count=1)` accepts an integer from 1 to 1024, counting complete roots, including
failed ticks/batches. `run()` processes the remaining prefix synchronously; use
bounded steps for interactive control. Frozen, nonreactive `status` includes status
(`ready`, `running`, `complete`, `diverged`, `disposed`), position, total, sequence
and divergence. Empty recordings are already complete. Retained recent histories
start at their advanced baseline. A limited/stopped log reproduces its captured
end, which may be older than the source app's current state.

Nested actions execute once through the normal FIFO dispatcher; their recorded
traces are comparison evidence. Tick roots inject only their consumed inputs and
run configured tick logic. Accepted derived hydration and state-to-URL locations
execute at recorded publication points. Body-requested navigation produces compared
packets and changes virtual routes only when its recorded location was published.
Recorded native History failure therefore does not create a virtual route update.
Local URL metadata omits browser origin; admitted absolute body navigation uses a
matching recorded local destination. A source router and a replay view can coexist
in one Window because replay does not acquire native URL ownership.

Live app event callbacks, tick/location drivers, mount-time storage/URL hydration,
History/storage writes, adapter readers/effects/timers and scheduled application
callbacks are suppressed. Sync adapters return an inert canceled receipt with
sequence 0; effects/timers resolve `done` to null. Registration validation, scope
cleanup and reentrancy rules still apply. Recorded measurement/network/timer/key/
text results arrive through saved packets, without resampling the browser/network.
Outside executing replay action bodies, dispatch/navigation/input/control and
recording mutations reject `REPLAY_READONLY`. Mount/flush/views/observers remain
available for inspection. Calling step/run/dispose during a root or active
mount/read/notification/render boundary rejects `REPLAY_REENTRANT`.

On divergence, the current atomic root finishes so its successful commits remain
inspectable. No later root executes. The report contains sequence, tick/time, last
dispatched action name (or null), optional eventIndex, reason (`trace`, `state`,
`route`, `root`), bounded expected/actual summaries and expectedHash/actualHash for
the completed root. Action rollback/failure/discard/version order must match.
Input admission sequence/queued flags and notification/native presentation error
messages are not authoritative state; those errors need not recur. Repeated step/
run returns the divergence unchanged. Restart with a new replay controller; the history API below adds seek/undo/redo. The inspector remains unimplemented.

`dispose()` is idempotent and releases imported history, comparison scratch and
owned app/view resources. Direct `replay.app.dispose()` also closes the controller.
Later stepping throws `REPLAY_DISPOSED`; invalid options/count use `REPLAY_INVALID`.
Caller-held exports/imports/status snapshots remain caller-owned. Resource counters
verify owned cleanup, not heap collection.

Actions, guards, views, cleanup and Promise consumers remain ordinary JavaScript.
They must use controlled services and recorded inputs; ambient globals and mutable
closures are not sandboxed. If an action closes over an app for nested dispatch or
navigation, create its schema in a factory and bind that closure to `replay.app`
before stepping. Reusing a closure pointing at a live source can mutate that source
and falls outside isolation. Native HTML defaults and paint timing are also outside
state replay guarantees. Matching hashes verify the recorded fixture, not code
identity, authenticity, every ambient read, performance or universal browser support.

The [recording example](examples/recording/README.md) lets you export and replay the
captured prefix in a second view. See [replay API](docs/api/replay.md),
[ADR 0020](docs/adr/0020-isolated-replay-divergence.md) and
[C.9/C.10 qualification](docs/reports/task-C.9-C.10-replay-determinism.md).

## Retained history and branching

`createHistory` lets you inspect a bounded recording, seek complete root endpoints,
undo/redo declared reversible groups, and continue from a selected point as a new
live branch. It starts at the recording's retained baseline; the source app and
original immutable recording are unchanged. Inspection suppresses live sources
using the replay rules above.

```js
import {createApp,createActionSchema,createHistory,div} from './src/index.js';

const schema=createActionSchema({version:'history-counter/1'})(({action})=>({
  increment:action((draft,services)=>{
    draft.count++;draft.draw=services.random();draft.time=services.now();
  }),
}));
const source=createApp({schema,initialState:{count:0,draw:0,time:0},controls:{seed:7}});
source.startRecording({keyframeInterval:2,maxActions:32,maxBytes:64000});
source.actions.increment();source.actions.increment();source.actions.increment();
const text=source.exportRecording();source.dispose();
const history=createHistory({recording:text,schema,reversible:['increment'],
  view:({bind})=>div('Selected count: ',bind.count)});
// Optional: history.app.mount(document.getElementById('history-target'));
history.seek(history.status.endSequence); // count 3
history.undo(); // count 2; full root group, restored random/version continuation
history.redo(); // count 3
history.undo();
const branch=history.branch(); // new headless live app; original future discarded here
branch.actions.increment(); // count 3 using restored controlled services
console.log(branch.state.count,history.status.discardedRecords); // 3, 1
history.dispose(); // also owns/disposes the new branch
```

Configuration accepts `recording`, optional `schema`, `router`, `persistence`,
`simulation`, `view`, and `reversible`. Recording/configuration/name/arity/keyframe
route preflight happens before a transition or view. Register compatible bodies/
guards, matching route/persistence fields and fixed duration/role as with replay.
There is no target or live error-hook option; explicitly mount inspection through
`history.app.mount(target)` after constructing the controller. Bind app closures
through `history.app` so nested dispatch/navigation follow the current app after
branching. Schemas/configuration remain experimental and versioned.

`seek(sequence)` selects a complete root endpoint from baselineSequence through
endSequence, including the baseline itself. Sequences count recorded roots, not
state versions or ticks. It restores the nearest preceding stored keyframe and
replays the suffix, comparing each replayed root. Checkpoints are validated stored
state; seek does not execute/verify earlier bodies before that keyframe. Use full
`createReplay` to verify every root. Expired history throws `HISTORY_EXPIRED`,
beyond-end selection `HISTORY_RANGE`, and malformed/noninteger/negative-zero
selection `HISTORY_INVALID`. Empty retained histories contain only a baseline.
Invalid targets/policy leave the selected state unchanged.

Inspection keeps the same app, observers/computed values, bindings and mounted
keyed DOM across seeking. Whole-graph restoration replaces state/version/control/
virtual route, resets display interpolation and empty tick/input bookkeeping, and
invalidates all reactive consumers. Normal actions retain exact property invalidation.
Render coalesces the selected values; `history.app.flush()` applies them immediately.
Keys and normal form rendering preserve retained nodes, focus/selection and native
editing rules. Saved frozen snapshots remain valid; tracked facades from a replaced
graph detach and must be read again from current state.

`reversible` is a dense unique list of registered action names (maximum 1024,
default empty). It declares reversible in-memory behavior; the runtime cannot prove
purity or reverse external effects. Every admitted action name in a root—including
nested failed/discarded work—must be declared. Navigation/location/hydration
packets always form undo/redo barriers. Pure clock or empty tick roots are eligible.
A named external-result action can be declared, but undo restores its state only:
completed requests, browser navigation or storage effects remain completed.

`undo(count=1)` and `redo(count=1)` accept 1–1024 complete roots. A nested dispatch
batch or tick is one group; there is no midpoint/per-child seek. The entire range
and policy are checked before moving, so a multi-root move never partly crosses a
barrier. `HISTORY_IRREVERSIBLE` identifies an undeclared action or route/hydration
barrier. Arbitrary seek can still inspect across those barriers. Redo remains
available until explicit branching; reaching the retained baseline/end reports an
expired/range error. Undo operates on this inspection app, not a running source.

`branch()` snapshots the selected state/version, clock/duration/seed/draw continuation
and local virtual route into a new live app, disposes inspection and releases the
recording/indexes. `history.app` then points to that new app; saved old app references
are disposed. This branch discards its redo future and reports discardedRecords.
The original caller-held recording remains immutable and can be inspected again
with a new controller. Later history commands throw `HISTORY_BRANCHED`.

The branch is headless with ticks paused and empty queues/effects. Explicitly call
`branch.mount(target)` to start its live view. For routed branches, first mount
replaces the browser's current History entry with the selected local URL, skips
ambient startup URL/storage hydration, and acquires normal native router ownership.
Subsequent commits use normal URL/storage writes and native input/effect adapters.
Branching itself performs no external write. Native mount/History errors retain
ordinary lifecycle behavior. A branch and a live source router cannot both own the
same Window; finish/dispose the source before mounting that routed branch.

Pending source inputs/effects and frame accumulators are not recorded continuation.
A branch begins a new input-admission session; old tickets do not transfer. Fresh
inputs continue from restored authoritative clock/PRNG/version, while session
receipt labels stay outside state hashes. Start a new recording explicitly after
mounting/draining inputs if required; its root sequence begins at 0. There is no
automatic ongoing-history attachment, export or effect compensation.

Frozen nonreactive `history.status` includes status (`inspecting`, `diverged`,
`branched`, `disposed`), baselineSequence, endSequence, sequence, position, records,
canUndo/canRedo, checkpointSequence, replayedRoots/replayedSlots, discardedRecords
and divergence. Seek statistics describe the last effective seek; selecting the
same current position is a no-op unless recovering divergence. Slots charge each
admitted action or one for an empty root. A precomputed index chooses the preceding
keyframe; suffix replay stays within the configured interval plus one atomic root,
with snapshot restoration cost separate. Storage is one bounded recording plus
O(retained roots) indexes and normal replay scratch; no second snapshot history.
These are correctness/ownership bounds, not timing or heap-collection claims.

First divergence preserves the actual consumed root/cursor for inspection and
stops before further work. Undo/redo/branch reject `HISTORY_DIVERGED` until a valid
seek clears it; canUndo/canRedo are false while diverged. Notification failure after
restoration throws `HISTORY_RESTORE_FAILED` while retaining the restored checkpoint
state/cursor. Branch cleanup failure throws while leaving the new app reachable
through `history.app`. There is no rollback of completed publication or cleanup.

`history.dispose()` is idempotent and disposes inspection or its resulting branch,
releasing imported history/indexes and owned scopes. Direct app disposal makes the
controller terminal too; subsequent operations throw `HISTORY_DISPOSED`. History
commands during actions, mounting, reactive callbacks or another operation reject
`HISTORY_REENTRANT` (ordinary active app boundaries may use `REPLAY_REENTRANT`).
Caller-held records/snapshots/status reports remain caller-owned. Actions/guards/
views/cleanup remain ordinary JavaScript; ambient globals and closure side effects
are not sandboxed. Inspector and performance qualification remain future work.

Run `/examples/history/` after `npm run dev` for public seek/undo/redo/branch controls.
See [API](docs/api/history.md), [ADR 0021](docs/adr/0021-retained-history-and-branching.md)
and [verification](docs/reports/task-D.1-D.2-history-branching.md).

## State and named actions

Application code cannot directly change committed state. Register actions and
edit their writable drafts so observers of committed state never see partial work:

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema({ version: 'counter/1' })(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  setCount: action(
    value => typeof value === 'number' && Number.isFinite(value),
    (draft, count) => { draft.count = count; },
  ),
  fail: action(draft => { draft.count = 99; throw new Error('Stop'); }),
}));
const app = createApp({ initialState: { count: 0 }, schema });

const original = app.state;
app.actions.increment(); // Equivalent to app.dispatch('increment').
app.dispatch('setCount', 10);
console.log(app.state.count, app.stateVersion); // 10, 3
console.log(original.count); // 0: saved snapshots remain unchanged.

try { app.actions.fail(); } catch (error) { console.log(error.message); }
console.log(app.state.count, app.stateVersion); // Still 10, 3.
app.dispose();
```

Use `action(run)` for zero payload arguments, and `action(validate, run)` for
exactly one payload. Explicit undefined counts as a payload. Unknown names and
wrong argument counts reject before guards or bodies. Modes are explicit rather
than inferred from function arity, so default/rest parameters remain predictable.

Payloads are copied and deeply frozen before a pure synchronous guard, which
must return exactly true. Caller data remains mutable. Bodies receive `(draft, services)`
or `(draft, ownedPayload, services)` and are invoked without binding `this`. Existing
callbacks can ignore the additional services argument; dispatch payload arity is unchanged.

The body reads its own writes through the draft; `app.state` still exposes the
previous committed version until success. A successful action publishes one
version, including no-ops; `stateVersion` starts at 1 or resumes the restored checkpoint version. A throw, invalid final
graph or Promise/thenable return publishes none. Every completed draft is revoked,
preventing later reads/writes. Return values are ignored; dispatch and wrappers
return undefined. These functions can be detached and called without binding.

State roots must be objects or arrays. State and payload values support null,
undefined, booleans, strings, finite numbers including negative zero, ordinary
same-realm objects/arrays and null-prototype objects. Acyclic aliases, distinct
identities, array holes and custom enumerable string properties are preserved.
Cycles, accessors, symbols, unsupported prototypes/native values and nonenumerable
data other than array length reject. Do not pass native browser Events as payloads.

Keep async effects outside actions and dispatch their results as supported data.
Action code must not read ambient layout/storage/time/random values for
reproducibility. Use action-scoped `services.now()`/`services.random()` for controlled
values and external-input adapters; opt-in recording captures executed normalized results. Rollback cannot undo arbitrary external side effects or cancel async
callbacks; revocation prevents deferred draft mutation.

## Exact reactive observers

Use `app.observe(read, onInvalidate?)` for a precise subscription. The framework
calls `read(trackedState)` once at registration to establish dependencies. After
a commit changes one of those dependencies, it marks the observer dirty and calls
`onInvalidate()` synchronously. It does not automatically rerun `read`. Calling
`observer.read()` evaluates the latest committed state, replaces the entire read
set and clears `observer.dirty`. Repeated commits notify once until that refresh.
This lets later DOM scheduling choose when to consume a dirty read.

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.user.score++; }),
  rename: action(draft => { draft.user.name = 'Grace'; }),
}));
const app = createApp({
  initialState: { user: { name: 'Ada', score: 0 } }, schema,
});
const score = app.observe(state => state.user.score, () => {
  console.log('Score subscription is dirty');
});
app.actions.rename(); // No score invalidation.
app.actions.increment(); // Invalidates score; state is already fully committed.
console.log(score.dirty, score.read()); // true, 1
score.dispose(); // Idempotent; read/dirty afterward reject SCOPE_DISPOSED.
app.dispose();
```

Direct reads track property values; `in`/`Object.hasOwn` track presence;
`Object.keys`/`Reflect.ownKeys` track key membership/order. Array length, indices
and iteration are separate from item fields. Editing `rows[0].name` does not
invalidate `rows.length`, an array spread, or `rows[1].name`. Aliases share logical
node identities, which survive array moves and copy-on-write publication.
Branches replace stale dependencies each time a read runs. No-op commits and
rolled-back actions produce no invalidation.

The callback's state argument is a read-only current-state facade. `app.state`
and a view context's `state` also track while a reactive read is running; outside
reads they retain their existing deep-frozen snapshot semantics. Saving an
ordinary snapshot before registration does not create reactive dependencies.
Facades preserve aliases and array behavior, follow reachable nodes across
commits and reject mutations with `STATE_READONLY`. A captured facade whose node
is removed rejects with `STATE_DETACHED`; read the current item from the root.
Facades are not frozen snapshots and cannot be frozen. When dispatching captured
state data, admission copies the currently reachable values; save an ordinary
snapshot instead if you need historical values. Read fields directly to track
values: descriptor reflection tracks presence, not the descriptor's `.value`.
Reading only an object-valued property tracks its logical identity, not every
field beneath it.

Observers created through a view's `observe` belong to that mount attempt and
are disposed automatically on failure/disposal. `app.observe` resources live
until explicit disposal or application disposal. Invalid registration/read
arguments reject with `REACTIVITY_INVALID`; reads and callbacks must be synchronous
(`REACTIVITY_ASYNC`). Recursive observer reads reject `REACTIVITY_CYCLE`.
Registration during reads/notifications rejects `REACTIVITY_REENTRANT`.

All affected observers become dirty before any notification runs. Notifications
may refresh or dispose observers, but reads/notifications cannot dispatch actions
or mount/dispose the application. Callback errors reach the outer dispatch after
other notifications and queued actions finish; the successful commit and its
children remain committed/admitted. The error hook receives phase `dispatch`.
A failed explicit read remains dirty and keeps only dependencies reached before
its error, so an explicit retry can recover. Creation/read errors are thrown to
the caller directly.

## Lazy computed values

Use `app.computed(read)` to cache a pure synchronous derivation. The returned
`Computed<T>` has read-only `value`, read-only `dirty`, and idempotent `dispose()`.
Registration does not run the callback. First access to `.value` runs
`read(trackedState)` and records dependencies; further accesses reuse the cache
until a dependency changes. Reading `.dirty` never evaluates the value.
Unobserved dirty values stay lazy through any number of commits.

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
}));
const app = createApp({ initialState: { count: 1, useDouble: true }, schema });
const doubled = app.computed(state => state.count * 2);
const label = app.computed(state =>
  state.useDouble ? `Count: ${doubled.value}` : `Count: ${state.count}`,
);
const subscriber = app.observe(() => label.value);
console.log(label.value); // Count: 2, already cached by observer registration.
app.actions.increment(); // Marks doubled, label and subscriber dirty; no recalculation.
console.log(subscriber.dirty); // true
console.log(subscriber.read()); // Count: 4; dirty caches recalculate once.
subscriber.dispose();
label.dispose();
doubled.dispose();
app.dispose();
```

Computed reads can consume other computed values in the same application.
Changes propagate through chains and diamonds before notifications run; each
computation evaluates once when consumed. Callbacks receive no bound `this` or internal resource. Changing a branch replaces its state
and computed dependencies, so an unused branch stops invalidating it after the
next evaluation. Invalidation is based on dependencies, without eager equality
checks: an input change dirties consumers even if recalculation later produces
the same value. Ordinary derived objects are cached by reference; treat results
as immutable. A returned tracked state object remains a current-state facade,
so downstream field reads still track current nested state after COW commits.

Direct/indirect cycles throw `COMPUTED_CYCLE` with the computed read chain.
A throw or Promise/thenable result (`REACTIVITY_ASYNC`) leaves the value dirty;
the next `.value` access retries. Failed reads replace dependencies with those
reached before the error. Reads must be pure: state mutation, action dispatch,
reactive registration, and disposal during evaluation reject. Async callbacks
or arbitrary ambient effects in application code cannot be cancelled by this
rule; keep them outside derivations.

`context.computed` owns values for the mount attempt; `app.computed` owns them
for the application. Disposing an individual computed clears its cache and
subscriptions and invalidates surviving dependents. Reading a disposed value
rejects `SCOPE_DISPOSED`; update/dispose consumers too, or let their read handle
that error. Disposal notification errors are thrown to the disposing caller
without reversing disposal. Application disposal stops the entire graph before
running view/user cleanup and emits no reactive notifications. All dependencies
are local to one application; cross-application reads are not tracked.

## Nested dispatch and failure ordering

```js
import { createApp, createActionSchema } from './src/index.js';

const schema = createActionSchema()(({ action }) => ({
  parent: action(draft => {
    draft.order.push('parent');
    app.actions.first();
    app.actions.second();
  }),
  first: action(draft => { draft.order.push('first'); app.actions.last(); }),
  second: action(draft => { draft.order.push('second'); }),
  last: action(draft => { draft.order.push('last'); }),
}));
const app = createApp({ initialState: { order: [] }, schema });
app.actions.parent();
console.log(app.state.order); // ['parent', 'first', 'second', 'last']
console.log(app.stateVersion); // 5
app.dispose();
```

Nested calls validate and capture payloads immediately, then return before their
bodies execute. Their parent can catch admission errors and continue. Requests
enter the FIFO tail after their parent commits, so grandchildren wait behind
existing siblings. An outer dispatch drains the entire batch synchronously.

If a parent fails, its queued children are discarded. If a child fails, its own
children are discarded, while queued siblings continue. Earlier successful
commits remain. After draining, the outer call throws the single failure or an
ordered AggregateError for multiple failures. An outer call can therefore throw
after some actions succeeded. Catching a nested call only catches admission
errors; its later body errors reach the outer caller.

Dispatch during views, guards, reactive reads/notifications or error reporting rejects. Mounting or disposing
during a dispatch batch rejects too. These rules protect the transaction and
application lifecycle from reentrant changes.

## Cleanup and error reporting

`app.onDispose(fn)` registers application-lifetime cleanup. A view's
`onDispose(fn)` registers cleanup for that mount attempt. Conditional child scopes dispose before root view hooks; each scope runs hooks
in reverse registration order, then application hooks do the same. A failed mount drains
only its attempted view scope. All hooks are attempted even if one fails;
disposal still completes and then throws an AggregateError. Hooks must be
synchronous, and disposed view scopes reject new registrations.

An optional synchronous `onError(error, { phase })` observes creation, checkpoint export, clock/tick operations, external input delivery, mounting,
dispatch, native event, rendering, scheduled work, navigation, persistence and disposal failures without swallowing them. For a dispatch batch it
runs once after draining, when committed state is complete. If the hook also
throws, its failure aggregates with the original. It cannot dispatch recovery
work; the caller can catch the outer error and dispatch afterward. Unknown
thenables reject without execution, and illegal native Promise rejections are
observed without cancelling their callbacks.

Common error codes include `ACTION_UNKNOWN`, `ACTION_ARITY`, `ACTION_ASYNC`,
`ACTION_REENTRANT`, `ACTION_QUEUE_LIMIT`, `PAYLOAD_INVALID`, `PAYLOAD_CYCLE`,
`PAYLOAD_LIMIT`, `PAYLOAD_ASYNC`, `STATE_INVALID`, `STATE_CYCLE`, `STATE_LIMIT`,
`TARGET_INVALID`, `APP_DISPOSED`, `LIFECYCLE_REENTRANT`, `STATE_READONLY`,
`STATE_DETACHED`, `SCOPE_DISPOSED`, `REACTIVITY_INVALID`, `REACTIVITY_ASYNC`,
`REACTIVITY_REENTRANT`, `REACTIVITY_CYCLE`, `COMPUTED_CYCLE`, `FLUSH_REENTRANT`, `EVENT_REENTRANT`, `EVENT_HANDLER_INVALID` and `EVENT_ASYNC`.
DOM errors and supported tags are listed in [DOM API](docs/api/dom.md);
key/source errors are listed in [collections API](docs/api/collections.md).

## Resource limits

Each state/payload graph supports at most 128 object levels, 10,000 nodes,
100,000 enumerable entries, 100,000 aggregate array slots (holes included) and
1,000,000 UTF-16 string/key units. Transactions also charge imported/growing
data conservatively; deleting or detaching it does not refund that transaction's
charge. The proposed committed graph must fit independently.

A dispatch batch admits at most 1,024 actions including its root. It also applies
the node/entry/slot/text limits to aggregate admitted payloads. Consumed/discarded
requests do not refund batch charges; failed admission does not charge. New outer
calls start fresh. A limit rejection is an admission error that a parent may catch;
otherwise it aborts that parent. Limits bound framework work/retention, not exact
heap bytes, externally retained snapshots or user callback CPU.

## TypeScript and verification

The package includes declarations. Bind schema state once with
`createActionSchema<State>()(...)` and use a type-predicate payload guard to infer
its payload type. Names and dispatch arguments remain correlated, state/payloads
are deeply read-only, and dispatch returns void. Types cannot establish runtime
prototypes, finiteness or input ownership; runtime validation remains necessary.

Declarations use TypeScript's `NoInfer` helper (5.4+) and are verified with 5.9.3
in strict mode. Plain JavaScript runs without a checker, bundler or compiler.
Statically visible async `onError` hooks now fail checking, matching the existing
runtime `ERROR_HANDLER_ASYNC` contract. Synchronous return values are ignored;
broadly typed callbacks can conceal Promise returns, so runtime checks still apply.

Outside tracked reads, `app.state` is a frozen snapshot: writes throw native
`TypeError` in strict/module code and never mutate it. Inside observer, computed
or binding reads, the tracking facade reports `STATE_READONLY`. An old saved
snapshot remains historical. These diagnostics enforce the same read-only rule.

The [root walkthrough](README.md#build-the-walkthrough-using-public-imports) has
complete HTML/JavaScript for a routed native form/keyed task list: labels,
ID/class/attributes, click/scroll/key/text handlers, post-commit navigation,
shared state and persistence. Open `http://localhost:3000/examples/auditor/`
after `npm run dev`. Rows and their next ID persist together in `board`, avoiding
key reuse after reload. Remove its local/session buckets in developer tools to reset.

```sh
npm test
npm run smoke
npm run test:browser
npm ci --ignore-scripts
npm run test:types
npm run audit:frontend
```

Browser checks require installed Chrome. Type checks require the development-only
TypeScript installation; startup and Node tests do not. `audit:frontend` makes
a fresh temporary candidate copy without `.git`, dependencies or old results,
recreates the two app files from README, and runs Node/spike/workload/root smoke
checks before installing locked tooling with scripts disabled. It checks types,
dependency/source independence and Chrome integration. Candidate hashes must
remain unchanged. It removes only its own temporary folder and records JSON
under `tests/results/`; failures exit nonzero. Use `-- --offline` with a populated
npm cache. This verifies candidate files, not a nonexistent committed revision.
No runtime edits or Git changes are needed. For the full reference,
see [application API](docs/api/application.md). For current validation results,
see [C.7/C.8 recording evidence](docs/reports/task-C.7-C.8-recording-retention.md),
[C.1/C.2 checkpoint/service evidence](docs/reports/task-C.1-C.2-checkpoints-controls.md),
[B.9–B.11 auditor evidence](docs/reports/task-B.9-B.11-auditor.md),
[B.7/B.8 state-location evidence](docs/reports/task-B.7-B.8-persistence.md),
[B.4–B.6 routing/scheduling evidence](docs/reports/task-B.4-B.6-routing-scheduling.md),
[B.1–B.3 input evidence](docs/reports/task-B.1-B.3-inputs.md) and
[A.10 core evidence](docs/reports/task-A.10-core-slice.md). The
[README](README.md) provides repository structure, feature status and the remaining
verification commands; the [PRD](Framework_PRD.md) defines future acceptance gates.

## Compatibility and browser qualification

The public import boundary is `src/index.js` and its declarations; runtime,
spikes and test tooling are internal. `0.1.0` is experimental. Pin a candidate
revision; contract changes update this guide and relevant API references and
state compatibility impact. No stable API freeze or complete product is claimed.

Package, action-schema and persistence versions are separate. Bump the schema
when action/payload meaning changes and persistence version when stored shape
changes. Mismatched storage follows guarded fallback; no automatic migration
exists. Use a new namespace to retain old buckets. The private persistence graph codec is
not a public recording/snapshot contract. C.1/C.2 implement a separate versioned
public state/control checkpoint; C.7/C.8 implement a separate versioned bounded recording format.
See [ADR 0015](docs/adr/0015-public-frontend-compatibility.md) and
[ADR 0016](docs/adr/0016-deterministic-checkpoints-services.md).

The candidate passes desktop Chrome automation and the clean-root walkthrough.
The [support matrix](docs/browser-support.md) separates trusted edits and Chrome
composition checks from synthetic paste and unqualified OS input. System clipboard,
OS IMEs, mobile, other browsers and assistive technology remain unverified release
gates. Cleanup counters show owned resources released, not heap-collection proof.
