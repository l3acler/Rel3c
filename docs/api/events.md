# Native events and semantic inputs — B.1–B.3

Experimental public props: `onClick`, `on`, `onKey`, `onText`. Import element
builders, lifecycle and action schemas from `src/index.js`. All callbacks run
synchronously without a bound `this`; returning a Promise/thenable rejects
`EVENT_ASYNC`. Async effects dispatch their results separately, with lifetime
checks. State actions receive serializable payloads, never native events or DOM nodes.

## Click compatibility

`onClick: actions.increment` retains the A.9 zero-argument contract, allowing a
no-payload named action wrapper directly. Payload actions use closures.
`null`/`undefined` registers nothing; other values reject `EVENT_HANDLER_INVALID`.
Use `on.click` to receive an event context; specifying both rejects `EVENT_DUPLICATE`.

## Native event map

```js
import { createApp, createActionSchema, div, form, button, span } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  save: action(draft => { draft.saves++; }),
  scroll: action(value => typeof value === 'number' && Number.isFinite(value),
    (draft, value) => { draft.scrollTop = value; }),
}));
const app = createApp({ initialState: { saves: 0, scrollTop: 0 }, schema,
  view: ({ actions, bind }) => div(
    form({ on: { submit: event => { event.preventDefault(); actions.save(); } } },
      button({ type: 'submit' }, 'Save')),
    div({ style: { height: '100px', overflow: 'auto' }, on: {
      scroll: { passive: true, handler: event => actions.scroll(event.currentTarget.scrollTop) },
    } }, div({ style: { height: '400px' } }, 'Scroll this area')),
    span(bind.scrollTop),
  ),
});
app.mount();
```

`on` is a copied, immutable plain/null-prototype map keyed by lowercase native
names (including custom event names). Each entry is a handler, null/undefined, or
`{ handler, capture?: boolean, passive?: boolean, once?: boolean }`. Defaults are
false. Unknown options, accessors or nonboolean options reject `EVENT_OPTIONS_INVALID`;
invalid names reject `EVENT_TYPE_INVALID`. Registration is static for the element's
scope; binding tokens and dynamic handler replacement are unsupported.

The frozen context contains `type`, native `target`, framework `currentTarget`,
`nativeEvent`, a live `defaultPrevented` getter, and `preventDefault()`,
`stopPropagation()`, `stopImmediatePropagation()`. `currentTarget` is the element
owning that handler even when the browser listener is on the app root. The native
event's own currentTarget is the native listener location and becomes null after
native dispatch. Use the context synchronously. Native objects are not serializable.

Known bubbling events share one root delegate per event type: click/dblclick/
auxclick/contextmenu, input/beforeinput/change/submit/reset, keydown/up/keypress,
composition events, clipboard events, focusin/out, mouse/pointer/touch events,
wheel and dragstart/end/over/drop. Nonbubbling events such as scroll, focus/blur,
load and mouseenter/leave, unknown/custom types, and all capture registrations use
direct native listeners. Custom bubbling events therefore follow native propagation
rather than a guessed delegate policy. Capture runs at the owning element's native
capture position. Bubbling delegates run child-to-parent at the app root; native
listeners below that root run before the delegate. External native propagation
cancellation can keep events from reaching a delegate. No Shadow DOM API is shipped.

Defaults remain native unless explicitly canceled. Returning false has no effect.
`stopPropagation` skips later framework ancestors; `stopImmediatePropagation` also
skips remaining handlers on the same element. Both call the native methods.
Cancellation in a passive framework context rejects `EVENT_PASSIVE` and leaves
native defaults unchanged. Delegates use native `passive: false` to allow mixed
registrations; per-entry passive semantics apply through the context method.
`nativeEvent` is an inspection escape hatch, not a sandbox: calling its methods
bypasses the framework's per-entry passive/immediate bookkeeping. Use context methods.
`once` is consumed before invocation, including when the callback throws.

## Keyboard snapshots

`onKey(input, context)` receives frozen serializable snapshots for `keydown`,
`keyup` and `reset`. Fields: `type`, `key`, `code`, `location`, `repeat`,
`isComposing`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`, `held`, and `reason`.
`held` is an ordered frozen array of `{ key, code, location }` records after the
current transition. Identity uses code/location, falling back to key/location when
code is empty. Repeats do not add another held key; release removes it even when
modifiers changed the logical key. These are observed keys, not OS-global key state.
A scope allows at most 256 held keys; overflow clears the set and rejects
`EVENT_INPUT_LIMIT`. Keyboard events preserve normal native activation/editing.

Reset is emitted only for a nonempty held set when focus leaves the element's
subtree, the window blurs, or the document becomes hidden. Reasons are `focus`,
`window-blur`, `hidden`; ordinary events have null reason. Reset key/code are empty,
location is zero, and repeat/composing/modifiers are false. The context's owning
currentTarget remains the registered element. Moving focus within the subtree
keeps held keys. Each onKey scope has independent state/listeners; disposal clears
keys without a reset callback. Use `on.keydown`/`on.keyup` for raw native handling.

```js
// Inside a registered view: actions.save is a no-payload named action.
input({ onKey: (value, event) => {
  if (value.type === 'keydown' && value.ctrlKey && value.key === 's' &&
      !value.repeat && !value.isComposing) {
    event.preventDefault(); actions.save();
  }
} });
```

## Text snapshots and rendering

`onText(input, context)` supports textarea and input types text/search/url/tel/
email/password/number. Other controls reject `TEXT_CONTROL_INVALID`; use native
`on.input`/`on.change` for checkbox/select/file controls and explicitly normalize
supported payloads. Number/email controls may have null selection fields. Values
come from the live control, not from keys or raw clipboard text. Register onText
before mounting; native edits do not automatically mutate state.

Frozen snapshot fields: `type: 'text'`, `phase: 'input' | 'composition' | 'commit'`,
`value`, `isComposing`, `inputType` (empty when unavailable), `data` (string/null),
`selectionStart`, `selectionEnd`, `selectionDirection` (null when unavailable).
Offsets follow native UTF-16 selection units. Selection-only changes are browser
presentation and do not trigger semantic callbacks. No contenteditable abstraction.

Input emits the observed value. Paste uses the subsequent native input event
(e.g. inputType insertFromPaste), after the browser applies/cancels paste and its
sanitization; the paste event alone emits no text. Compositionstart locks rendering;
compositionupdate/input emit distinct observed values while composing. The browser
may update the value after compositionupdate, so its subsequent input captures it.
Compositionend or blur ends the lock and emits the accepted/canceled value. Duplicate
values with identical isComposing are suppressed, including a trailing final input.
A final commit with the same text but isComposing false is a distinct semantic
transition; an action storing only text can skip dispatch when that value is equal.
No timeout guesses completion, and isComposing true input also establishes the lock.

Bound text controls are protected even without onText: a value binding invalidated
during composition skips its native write. End/blur requeues that binding, rereading
the latest committed state on a render frame (or explicit flush) rather than applying
an obsolete saved value. The browser's active value can temporarily differ from
state. If an action rejects/transforms a value, another state change or invalidation
is needed to render a correction; unchanged state does not forcibly rewrite edits.
Equal values avoid setters. Differing values preserve focused selection endpoints,
clamped to the new length, and direction where the control supports selection.
Defaults remain the initial defaults; native form reset does not synchronize state.
Use on.reset with an explicit state policy if needed. Runtime-owned editing listeners
are removed with their element scopes; pending deferred writes never outlive them.

## Lifetimes, errors and compatibility

Removing a keyed/conditional scope or disposing an app unregisters delegates,
direct/global listeners, keyboard state and editing sessions. Matching delegate
handlers are snapshotted, then scope liveness is checked before each callback.
Removed nodes stay inert if reattached. Same-key callbacks must read the current
item context rather than retain an old item object. Handlers may explicitly flush
or dispose; later handlers in ended scopes are skipped.

Uncaught failures aggregate after remaining live handlers in that native listener's
route, reach `onError(error, { phase: 'event' })` once, and escape to the browser.
Capture/direct listeners have separate native error boundaries. Successful prior
actions remain committed; throwing actions roll back. Nested programmatic events
and events during mount/action/render/reactive/error work reject `EVENT_REENTRANT`.
Disposal attempts every cleanup even if native removal fails; stale listeners
become inert before removal. Scalar test counters do not prove garbage collection.

See [the public guide](../../DOCUMENTATION.md#native-events-keyboard-and-text-editing),
[inputs example](../../examples/inputs/README.md), and [batch evidence](../reports/task-B.1-B.3-inputs.md).
Chrome fixtures and trusted keyboard/composition-engine automation do not qualify
OS IMEs, real clipboard paste, Firefox/Safari, mobile keyboards or broad browser
support. Recording/replay remains Phase C; these data shapes are recordable inputs,
not an implemented recorder.
