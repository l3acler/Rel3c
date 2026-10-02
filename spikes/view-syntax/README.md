# View syntax spike — task 0.7

Experimental exports live in `spikes/view-syntax/index.js`, not the package public
entry. This is evidence for a syntax choice, not a production runtime.

Run `npm run dev`, then open `http://localhost:3000/spikes/view-syntax/` for three
equivalent native form/list examples. No build step or installation is required.

```sh
npm run test:spikes
npm run check:view-syntax
npm run check:view-syntax -- --quick
```

The browser driver requires installed Chrome, uses a temporary isolated profile,
and writes unique JSON evidence under `benchmarks/results/`. Override the Chrome
executable with `MINI_FRAMEWORK_CHROME_PATH`. The full command runs correctness
plus measurements; quick shortens measurements, not correctness.

## Primary syntax candidate

```js
import { createSyntaxApp, div, label, input, button, span } from './index.js';

createSyntaxApp({
  target: document.querySelector('#app'),
  initialState: { name: 'Ada', count: 0 },
  actions: {
    increment(draft) { draft.count++; },
    setName(draft, name) { draft.name = name; }
  },
  view: ({ bind, actions }) => div({ id: 'counter', class: 'card' },
    label({ htmlFor: 'name' }, 'Name'),
    input({ id: 'name', value: bind.name,
      onInput: event => actions.setName(event.currentTarget.value) }),
    button({ type: 'button', onClick: actions.increment }, '+'),
    span('Count: ', bind.count)
  )
});
```

`bind.prop` is an explicit reader token. Normal committed `state.prop` remains a
read-only primitive/object, not a boxed primitive. `derive(() => state.count * 2)`
tracks an expression. A no-payload action used directly as a handler discards
its native event before transaction validation; payload actions need an adapter.
Arity is only a spike convenience, not the final action-schema contract.

`when(bind.show, context => ..., context => ...)` owns conditional scopes.
`keyed(bind.rows, row => row.id, ({ bind }) => ...)` owns row scopes, uses stable
object identity to resolve row bindings, and preserves keyed DOM nodes. Handlers
and subscriptions are disposed when their content disappears. State commits are
immediate; dirty binding writes are frame-coalesced. `app.flush()` is a test
helper; application examples rely on framework-owned frames.

## Evaluated, not adopted: templates

```js
view: ({ bind, actions }) => html`
  <button @click=${actions.increment}>+</button>
  <span>${bind.count}</span>
`
```

This token variant tracks exact bindings and caches static parsing by native
`TemplateStringsArray`. Eager `${state.count}` also works in the prototype, but
only through whole-view capture; JavaScript does not supply expression boundaries
to the tag. Both preserve nodes/avoid unchanged writes, but only tokens avoid
unaffected binding evaluation. Optional public templates are therefore deferred.

Dynamic text/attributes never enter `innerHTML`; inline `onclick` is rejected.
Supported tags/attributes/URLs/styles are intentionally restricted. This is not
an arbitrary HTML/CSS sanitizer or universal XSS guarantee.

Default measurements use the eager reference transaction engine so that all
syntax modes share engine costs. Focused adapter tests also run COW and staged.
The spike does not implement routing, deterministic services, schema typing,
nested action queuing, full input/IME support, cross-browser guarantees, or a
production render-error policy. Its no-op version behavior is inherited from
transaction spikes, not a finalized named-action contract.

See [ADR 0001](../../docs/adr/0001-view-syntax.md) and the
[evidence report](../../docs/reports/task-0.7-view-syntax.md).
