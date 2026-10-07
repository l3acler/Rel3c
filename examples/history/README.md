# Retained history and branching

Run `npm run dev` at the package root and open `/examples/history/`.
The source records 12 controlled samples and their logical-time roots, then disposes.
The history app starts at its baseline. **Seek captured end**, **Undo root**,
**Redo root**, and **Seek retained baseline** inspect complete roots with live
sources suppressed. Root counts include clock updates; each undo is one root.

The sample action is explicitly declared reversible in memory. Routing/hydration
roots would be barriers to undo/redo, although arbitrary seek could inspect them.
**Continue as new branch** restores a headless live app from the selected state,
disposes inspection, discards this branch's redo future, and explicitly mounts it.
**Sample on branch** continues the restored PRNG and logical clock. The original
recording is unchanged. No completed network/storage/History effect is reversed.

All behavior uses public imports and declarative event handlers. The controls use
a separate app, keeping developer history commands outside selected transactions.
See [the guide](../../DOCUMENTATION.md#retained-history-and-branching) and
[API](../../docs/api/history.md) for policy, formats, errors and cleanup.
