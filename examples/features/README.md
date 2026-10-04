# Launch Board

A runnable example using the current A.1–A.7 public framework APIs.

From the repository root, run `npm run dev` and open
[http://localhost:3000/examples/features/](http://localhost:3000/examples/features/).
No install, bundler, external fonts or runtime dependencies are needed.

Edit the project, progress, accent and details settings, then choose a scenario:

- **Use these values:** apply validated configuration through a named action.
- **Advance three steps:** a parent action queues three FIFO child actions; their
  DOM changes coalesce on the next render frame.
- **Try a failing action:** a draft edit throws and rolls back; a separate action
  reports that progress was preserved.

The page constructs nested elements, attributes, classes and styles through public
imports. Computed progress/remaining values are lazy and reused by bindings. The
conditional details and completion sections own their cleanup. An observer logs
committed progress to the browser console; disposing the app releases the scope.

Controls are a native GET form: **Apply scenario reloads the page**. Browser input
values remain local until submission. Query values are normalized outside actions,
then copied/validated as action payloads. This is example startup configuration;
framework events, routing, persistence and recordable input adapters are not
implemented. Project configuration is visible in the URL. Reset clears the query.

For live updates without reloading, open the browser developer console:

```js
const { app, runRollback } = await import('/examples/features/main.js');
app.actions.advance();
app.actions.burst();
app.actions.toggleDetails();
app.flush(); // optional; otherwise DOM updates on the next render frame
runRollback();
// app.dispose(); // remove owned DOM and cancel scheduled work
```

See [main.js](main.js) for the view/actions and [styles.css](styles.css) for the
responsive layout. Neither file uses application DOM patches or event listeners.
