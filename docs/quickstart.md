# Quick start: build TodoMVC with Rel3c

Start with a working app and then customize it. You will use the framework's public
exports for state, DOM, events and routing; the application does not install React
or another frontend framework.

## 1. Clone and start

You need Git, Node.js 18 or later and a modern browser. Verification currently
uses Node.js 26 and desktop Chrome.

```sh
git clone https://github.com/l3acler/Rel3c.git
cd Rel3c
npm run dev
```

Open **[http://localhost:3000/](http://localhost:3000/)**. The server redirects to
`/examples/todomvc/`. No dependency installation or build step is needed to run
the application. Stop the server with Ctrl+C.

If port 3000 is busy:

```sh
npm run dev -- --port 3001
```

Then open `http://localhost:3001/examples/todomvc/`. Serve the app over HTTP;
opening `index.html` directly with `file://` does not provide browser module loading.

You can also **[try TodoMVC on this documentation site](../examples/todomvc/)**.
The deployed app imports the same local framework modules and styles as the checkout.

## 2. Try the complete app

1. Type a task and press Enter. Whitespace-only titles are ignored.
2. Check a task to complete it. Use the top checkbox to complete or reopen all tasks.
3. Double-click a title to edit. Enter or blur saves; Escape cancels. An empty saved
   title deletes its task.
4. Hover a row to reveal its delete button, or use Clear completed.
5. Switch between All, Active and Completed. The URL becomes `#/`, `#/active` or
   `#/completed`; browser Back and Forward update the filter.
6. Reload. Tasks and their next ID restore from local storage; an unfinished edit
   is discarded. The current filter remains in the URL.

## 3. Find the application code

| File | Purpose |
| --- | --- |
| [index.html](../examples/todomvc/index.html) | Native mount container, styles and module startup |
| [main.js](../examples/todomvc/main.js) | Create and mount the app |
| [app.js](../examples/todomvc/app.js) | State actions, DOM, events, keyed rows, routing and persistence |
| [css/NOTICE.md](../examples/todomvc/css/NOTICE.md) | Upstream styling sources and license terms |

The HTML contains `<section class="todoapp" id="root"></section>` and loads
`main.js` as a module. Startup uses a factory from the application:

```js
import { createTodoMVC } from './app.js';

export const app = createTodoMVC();
app.mount(document.getElementById('root'));
```

`app.js` imports only `../../src/index.js` for framework behavior. The package name
is currently `mini-framework`; this guide uses source imports rather than assuming
that either `rel3c` or `mini-framework` is published on npm.

## 4. Understand one update

Actions are registered with `createActionSchema`. Here is the toggle action from
the app, shown with its required imports and schema construction:

```js
import { createActionSchema } from '../../src/index.js';

const schema = createActionSchema()(({ action }) => ({
  toggle: action(
    value => Number.isSafeInteger(value) && value > 0,
    (draft, id) => {
      const todo = draft.board.todos.find(todo => todo.id === id);
      if (todo) todo.completed = !todo.completed;
    },
  ),
}));
```

The row's checkbox dispatches `actions.toggle(row.key)` from a registered
`onClick` handler. The action receives a writable transaction draft. A successful
action publishes one state version; a throwing action rolls back. Application
code reads committed state through `app.state` and changes it through actions.

The checkbox's `checked` property and its row's `completed` class bind to
`row.item.completed`. The framework schedules affected DOM writes on a render
frame. `keyed()` retains rows by their task IDs, and `derive()` supplies the
filtered list and active-task count. Plain text copied from a state snapshot would
remain static; explicit bindings make it update.

Text inputs use `onText` to dispatch serializable text values. `onKey` handles
Enter/Escape while protecting active composition. The double-click handler flushes
the new editor, then calls native focus/selection methods outside the action.
The framework still constructs all application DOM and owns all event listeners.

## 5. Customize your first app

From another terminal at the repository root:

```sh
cp -R examples/todomvc examples/my-todos
```

Open `http://localhost:3000/examples/my-todos/`. Edit the copied files:

- Change the HTML title or the `h1` descriptor in `app.js`.
- Change the `new-todo` placeholder or add declarative elements using public helpers.
- Give this copy a different persistence namespace, such as `todos-personal`, so
  it has its own saved list on the same origin.
- Keep IDs stable and keep the persisted board and `nextId` together.

CSS changes belong in `css/app.css`. Keep the bundled upstream notices with any
redistributed styles. The framework's APIs are experimental; pin the repository
revision if you depend on their current behavior.

## Saved state and cleanup

The framework persists only `board`, under the browser key
`mini-framework:todos-rel3c:local`, using its versioned graph envelope. Transient
new text and editing state stay in memory. The validator rejects malformed tasks,
duplicate IDs and IDs that could be reused. Invalid saved data falls back to an
empty list. Private/incognito windows and storage restrictions can affect saving.
The TodoMVC reference uses a plain JSON bucket; this app uses Rel3c's persistence
API and does not import the reference's storage format.

To reset the example, remove that key in browser developer tools and reload.
Explicit teardown is `app.flushPersistence()` followed by `app.dispose()`.
Dispose releases framework-owned DOM, subscriptions and handlers; it leaves saved
storage intact. Browser qualification and storage errors are covered in the
[public guide](../DOCUMENTATION.md#todomvc-integration-example).

## Where to go next

Read the [public guide](../DOCUMENTATION.md), the
[TodoMVC implementation notes](../examples/todomvc/README.md), and the
[routing](api/routing.md), [events](api/events.md) and
[persistence](api/persistence.md) references.
