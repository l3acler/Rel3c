# Diagnostics and inspector

From the root run `npm run dev` and open `/examples/inspector/`.
Increment or run the three-action burst, wait for its render, then press Refresh
diagnostics. Select a dispatch to read changed values and dirty resource/binding
IDs. Select its render to read evaluations and actual writes; `causes` lists the
coalesced diagnostic transition sequences. The unrelated binding stays untouched.

The native select, buttons and read-only textareas support keyboard navigation.
Export diagnostic previews or the full recording explicitly. The preview is
limited to 65,536 characters; `inspector.export('recording')` returns the full
wire, and an optional synchronous `onExport(text,kind)` receives it.

The separate panel app owns its DOM and handlers. `inspector.dispose()` releases
only the panel; `diagnostics.dispose()` stops capture; `app.dispose()` stops its
diagnostics and this example also disposes the panel. See the root guide and
[API](../../docs/api/inspector.md) for limits and timing definitions.
