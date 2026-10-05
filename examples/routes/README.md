# Public routing and scheduling example

From the root, run npm run dev and open http://localhost:3000/examples/routes/.
No install, bundler or compiler is needed. Normal application behavior uses public
exports from src/index.js.

Increment the counter, open Profile and edit its name. Save commits the name then
navigates home. Back/forward retains counter/name values. Changing the tab query
updates a binding and preserves the form/input scope. Try rollback: a throwing
action changes neither state nor URL. Normal work queues a notice in a timer task.

Direct entry/reload at
http://localhost:3000/examples/routes/people/Ada?tab=details works through the
root server's explicit History fallback. HTML uses an absolute module path.
Reload creates a fresh memory store; this example uses memory-only state. Use /examples/persistence/ for configured restoration.

The optional shell stays mounted around one outlet. Routes dispose subscriptions,
events and context-scheduled tasks on replacement. Modifier clicks and keyboard
Enter retain native anchor semantics. See the
[public guide](../../DOCUMENTATION.md#routing-and-shared-application-state) for
configuration, snapshots, actions, limits and errors.
