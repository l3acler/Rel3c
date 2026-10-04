# Scoped click events — A.9

Elements accept `onClick: handler`, where handler is a synchronous function called
without arguments or a bound `this`. Public imports come from `src/index.js`.

```js
import { createApp, createActionSchema, div, button, span } from './src/index.js';
const schema = createActionSchema()(({ action }) => ({
  increment: action(draft => { draft.count++; }),
  set: action(value => typeof value === 'number', (draft, value) => { draft.count = value; }),
}));
const app = createApp({ initialState: { count: 0 }, schema,
  view: ({ actions, bind }) => div(
    button({ type: 'button', onClick: actions.increment }, 'Increment'),
    button({ type: 'button', onClick: () => actions.set(10) }, 'Set to ten'),
    span(bind.count),
  ),
});
app.mount();
```

Zero arguments keep direct no-payload action wrappers valid. For payloads, use a
closure that dispatches serializable data; no native Event is passed to an action.
Handlers may invoke several actions or explicit flush. Return values are ignored;
Promise/thenable returns reject EVENT_ASYNC. Illegal asynchronous callbacks cannot
be cancelled after they start. Keep effects separate with explicit lifetime checks.
`null`/`undefined` means no handler. Other values reject EVENT_HANDLER_INVALID.
Derived handler tokens and other event props are unimplemented. The type surface
rejects async handler literals; `any`/widened callback types can hide them, so runtime
validation remains independent.

A mounted app uses one bubbling click delegate on its target, only while it owns
at least one handler. Matching owned handlers run from the target child toward the
app root. Host-owned/outside nodes have no framework handlers. Native propagation,
link navigation, form submission, disabled button behavior and keyboard activation
remain native; the framework does not prevent defaults or stop propagation.
Use `type: 'button'` for non-submit controls inside forms. Native capture/bubbling
listeners outside the framework can stop an event before it reaches the delegate.
These callbacks have no preventDefault/stopPropagation API yet.

Handlers belong to the element's view scope. Removing a keyed row/conditional or
disposing the app unregisters them and releases the delegate when empty. A click
route is captured before invoking handlers, then each entry's scope is checked at
its turn. A callback may explicitly flush removal or dispose the app; later handlers
whose scopes ended are skipped. Removed handlers are inert even if old DOM nodes
are reattached. Same-key replacements retain callbacks: read context.value/key at
use time rather than capturing an obsolete item object.

Uncaught action/handler errors are collected after attempting the remaining live
handlers, then reported once as `onError(error, { phase: 'event' })` and thrown from
the native listener to the browser. Multiple errors aggregate in route order.
Successful earlier actions remain committed; a throwing action still rolls back.
Native `.click()`/dispatchEvent report listener exceptions to the browser rather
than throwing them to the caller. Explicit public flush/disposal operations retain
their own error phases. Nested/programmatic click invocation during an event,
action, mount, reactive read/notification, render or error hook rejects
EVENT_REENTRANT; error hooks cannot dispatch recovery actions.

Disposal attempts all scopes/hooks even if native listener cancellation or cleanup
fails. Such failures aggregate; callbacks are made inert even when native removal
fails. Internal resource counters support correctness tests only, are not public
exports, and do not prove heap collection. Scroll/key/input event APIs, IME editing,
priority scheduling and external-input recording remain Phase B/C work.
