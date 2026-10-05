# Phase A core example

Run `npm run dev` from the root and open
[http://localhost:3000/examples/core/](http://localhost:3000/examples/core/).

The page combines a counter, an independent bound value, a nested name,
conditional details and keyed editable rows. Buttons dispatch named actions:
increment, change the nested name, show/hide details, reverse/add rows, rename
or remove an item. The independent value stays unchanged.

Try rollback attempts changes to the counter, nested/independent/detail fields,
visibility, item order/name and membership, then throws. The committed snapshot,
version and displayed UI stay unchanged. The intentional listener error appears
in the browser console; no separate notice action changes the page afterward.

Native text edits remain local. Reverse preserves retained inputs and their local
edits; a state change to that item's name updates its bound input value. Removing
an item ends its scope. Recreated inputs initialize from committed state.
Focus/selection survive programmatic reorder while the input is focused; clicking
a button with the mouse may naturally move focus to the button.

```js
const { app } = await import('/examples/core/main.js');
app.actions.reverse();
app.flush();
app.dispose();
```

[app.js](app.js) exports `coreConfig()` with fresh state and the registered view
for each application, and [main.js](main.js) creates/mounts it using the public
entry point. The page has no application-managed listeners or DOM patches.
All binding reads and actions are synchronous; arguments, cleanup and errors
follow the existing [application](../../docs/api/application.md),
[DOM](../../docs/api/dom.md), [collection](../../docs/api/collections.md)
and [click](../../docs/api/events.md) APIs.

The acceptance tests instrument reads, setters and native mutation records outside
the application. One increment produces one committed version, one binding
evaluation and one text mutation; rollback produces none. See the
[A.10 report](../../docs/reports/task-A.10-core-slice.md) for evidence and limits.
General events, input synchronization/IME, routing and replay remain future work.
