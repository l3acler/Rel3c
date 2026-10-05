# Public frontend walkthrough

Run `npm run dev` from the root and open `http://localhost:3000/examples/auditor/`.
The root [README](../../README.md) supplies the exact HTML/JavaScript. The auditor
recreates this app from those code blocks rather than copying the served example.

Enter a title, submit with Enter, toggle completion and reverse the list. Escape
clears an edit; the focusable region records native scroll values outside actions.
Links/save change the hash route and retain shared state. Back/forward follows
browser history.

The guarded board and its next ID persist locally; the draft persists in the
session. Scroll/key values are memory-only. Writes coalesce; call
`app.flushPersistence()` before a programmatic reload when a pending write must
finish. Disposal cancels work and removes owned content/handlers. To reset,
remove `mini-framework:walkthrough:local` and `mini-framework:walkthrough:session`
in browser developer tools and reload.

The example uses public imports and declarative handlers. Browser inspection
lives in tests. This is an API acceptance interface; the assignment's separate
demonstration app remains a later task. Qualification/compatibility are in the guide.
