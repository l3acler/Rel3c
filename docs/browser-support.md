# Browser and input qualification

The experimental B.9–B.11 candidate is verified in desktop Google Chrome on macOS,
using a fresh temporary profile. The Batch 4 artifact records exact browser,
Node and machine versions. One tested version does not establish a minimum
Chrome version or support parity elsewhere.

| Area | Evidence | Boundary |
| --- | --- | --- |
| DOM, forms, keyed identity, focus/selection, cleanup | Real Chrome fixtures and README app | Native HTML subset in DOM reference |
| Actions, reactivity, priorities | Node and Chrome integration | Cooperative work; no CPU preemption or heap-collection guarantee |
| History/hash, direct loads, reload, back/forward | Real Chrome and scoped History fallback | One router per Window; hosts configure production fallback |
| Local/session/URL hydration, failures and reload | Browser storage and injected failure fixtures | No cross-tab merging, migration or unload flush |
| Enter/Space, shortcuts, held/repeat/release, keyboard scroll | Trusted Chrome automation and unit fixtures | Desktop automation only |
| Unicode edits, selection and composition protection | Trusted edits and Chrome composition engine; harness dispatches final compositionend | Does not qualify an OS IME |
| Paste/input behavior | Synthetic paste/composition fixtures | System clipboard/native OS paste unverified |
| Firefox, Safari, Edge, mobile, assistive technology | No completed qualification | Unverified |

Browsers need ES modules, Proxy, WeakMap/WeakSet, native DOM/events, URL,
URLSearchParams, History, storage and animation frames. No polyfills are supplied.
Storage access failures use the documented persistence fallback/error behavior.

Before a stable frontend release, qualify real clipboard paste, OS IME candidate
updates/commit/cancel, focus during composition, selection, mobile keyboards and
target browsers. Record OS/browser/input-method versions, steps and results.
The automated fixtures are regressions, not substitutes for those checks.
[ADR 0004](adr/0004-browser-input-support.md) targets remain proposals.

Use `npm run test:browser` or `npm run audit:frontend`. Override installed Chrome
with `MINI_FRAMEWORK_CHROME_PATH`. Root startup/Node checks need Node 18+; current
evidence uses Node 26. TypeScript 5.9.3 is development-only. Browser JavaScript
requires no compilation.
