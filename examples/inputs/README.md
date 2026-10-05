# Native inputs example

Run `npm run dev` from the repository root and open
[http://localhost:3000/examples/inputs/](http://localhost:3000/examples/inputs/).
All application behavior uses public framework imports; no application-managed
listeners or DOM writes are required.

Type, paste or compose in Name/Notes. Name stores the semantic text value and
composition status. Keyboard status shows key transitions, repeat and held keys;
leaving the name field clears held keys. Ctrl+Enter saves while outside composition;
the native submit button saves through on.submit with explicit preventDefault.
The scroll region supports native keyboard/wheel/touch scrolling and samples its
scrollTop in an event handler before dispatching the number to an action.

The framework defers bound value writes during composition. Equal accepted values
avoid setters; differing external updates preserve/clamp selection. Semantic text
callbacks do not reconstruct entered text from keys or paste clipboard contents.
The example's name payload validator checks the fields its action consumes; the
runtime independently validates the full serializable payload.

Chrome's automated checks include trusted key editing, Arabic/emoji replacement,
composition-engine acceptance, Ctrl+Enter, submit, scrolling and disposal. OS-level
IME and real clipboard/mobile checks remain unqualified; see
[the batch report](../../docs/reports/task-B.1-B.3-inputs.md). See
[public event contracts](../../docs/api/events.md) for options, errors and limits.
