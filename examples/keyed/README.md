# Keyed tasks and click actions

Run `npm run dev` from the root and open
[http://localhost:3000/examples/keyed/](http://localhost:3000/examples/keyed/).

Buttons dispatch framework actions without reloading: increment the counter,
reverse/add/remove rows, complete/reopen a task, show/hide the list or try rollback.
All views/handlers use public imports, with no application DOM patches or listeners.

Type into a task field, then reverse the list. Retained inputs preserve node identity
and local text edits. Focus/selection also survive programmatic reorder while the
input remains focused. Clicking a button naturally focuses that button according
to browser behavior. Removing/hiding a row ends its scope; recreating it initializes
a fresh input from state. Native text edits do not yet synchronize state.

The failing action leaves the counter unchanged; a separate successful notice
action explains the outcome. Public app access for console exploration:

```js
const { app } = await import('/examples/keyed/main.js');
app.actions.reverse();
app.flush();
app.dispose(); // releases handlers, computed/binding scopes and queued frames
```

See [main.js](main.js), [collections API](../../docs/api/collections.md) and
[click API](../../docs/api/events.md). General input events and routing are future
work. The [core example](../core/README.md) now passes the full A.10 acceptance gate.
