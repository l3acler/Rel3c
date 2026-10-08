# TodoMVC with Rel3c

A TodoMVC integration app using only the framework's public exports. Run
`npm run dev` at the repository root and open `http://localhost:3000/` or
`http://localhost:3000/examples/todomvc/`. No install, compiler or bundler is needed.
Start with the [quick-start guide](../../docs/quickstart.md).

## Reference and behavior

The reference is the [official React TodoMVC example](https://todomvc.com/examples/react/dist/),
its [components](https://github.com/tastejs/todomvc/tree/master/examples/react/src/todo),
and the [TodoMVC specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md).
The app preserves the reference's `.todoapp#root`, header, main, footer, row and
filter classes, `#toggle-all`, labels, input attributes and `data-testid` hooks.
It adds `#main`/`#footer` IDs and the specification's `<strong>` active count.
Framework marker comments support declarative scopes and keyed rows.

All/Active/Completed are native hash anchors observed by the framework router.
Routes filter the model without creating separate stores. Completing an Active
item removes it from that filter. Bulk completion applies to the complete store,
including tasks outside the current filter. The counter always counts active
tasks across all routes. Clear completed is hidden when unnecessary; main/footer
are hidden when there are no tasks.

New tasks trim on Enter. Double-click edits with native focus; Enter/blur commits
once, Escape discards, and blank edits delete. Text is rendered as escaped text.
The framework's keyboard/text adapters protect composition and selection. Tasks
are persisted through a guarded `board` field; unfinished drafts/edit sessions
are memory-only. The current filter survives reload in the hash URL.

## Implementation and limits

`app.js` registers synchronous named transactions with serializable payloads.
Views use `element()`/HTML helpers, bindings, `derive()`, `when()` and `keyed()`.
Application code has no manual DOM construction or browser listeners. The only
imperative DOM presentation is focus/selection in the registered double-click
handler after `app.flush()`; neither native nodes nor events enter a transaction.
No runtime changes were needed for this integration.

Storage uses `mini-framework:todos-rel3c:local`, not the reference's plain JSON
format. Malformed/version-mismatched data falls back through the framework's
persistence policy. Storage error diagnostics remain available through
`app.persistence`; restricted/quota-failed storage cannot guarantee reload recovery.
Transient typing does not enter the persisted field. ID allocation is monotonic;
the safe-integer limit throws atomically rather than reusing IDs.

The framework remains experimental `0.1.0`. Chrome automation covers app behavior;
OS IMEs, system clipboard, mobile, other browsers and assistive technology are
not yet qualified. This app does not establish cross-browser conformance to all
TodoMVC submission requirements. Reference attribution/footer wording is adapted
for Rel3c. Upstream styles are vendored to avoid a runtime CDN dependency; see
[CSS notices](css/NOTICE.md). No third-party framework supplies state, DOM, events
or routing. The TodoMVC specification recommends npm style packages for upstream
submissions; this root-run example keeps the required CSS local instead.

## Verify

```sh
node --test tests/todomvc.test.js
npm run smoke
npm run test:browser
```

Run from the repository root. Browser checks require installed desktop Chrome.
Node checks cover guarded state actions, editing sessions, immutable reads and
ID validation. Chrome checks cover actual input, pointer double-click, focus,
filters/history, reload persistence, deletion and disposal.
