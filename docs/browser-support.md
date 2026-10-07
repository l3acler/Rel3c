# Browser and input qualification

The experimental B.9–B.11 candidate is verified in desktop Google Chrome on macOS,
using a fresh temporary profile. The Batch 4 artifact records exact browser,
Node and machine versions. One tested version does not establish a minimum
Chrome version or support parity elsewhere.

| Area | Evidence | Boundary |
| --- | --- | --- |
| DOM, forms, keyed identity, focus/selection, cleanup | Real Chrome fixtures and README app | Native HTML subset in DOM reference |
| Actions, reactivity, priorities | Node and Chrome integration | Cooperative work; no CPU preemption or heap-collection guarantee |
| C.1/C.2 clock/draw rollback, checkpoints and restored continuation | Node/native browser hash oracles and varied manual render boundaries | Fixed ticks/adapters implemented in C.3/C.4; bounded recording implemented in C.7/C.8; isolated replay is implemented in C.9/C.10 |
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

C.3/C.4 add fake 30/60/120 Hz/irregular tick comparisons, hidden/paused epoch tests,
and native Chrome frame, measurement/storage/network/timer and scoped cancellation
checks. Hidden-tab policy is unit-tested with controlled document visibility;
native background-tab behavior across browsers remains unqualified. See
[verification](reports/task-C.3-C.4-ticks-inputs.md). Resource counters demonstrate
owned cleanup, not heap collection. Saved input injection is not public replay.

C.5/C.6 add normalized key/text packet forwarding (including synthetic paste/
composition), native navigation packet checks, readonly interpolation and display
fraction comparisons with unchanged hashes/forms. The public example accepts
trusted Chrome Unicode editing. Source packet tests cover headless History/hash
locations, initial/URL hydration, tick assignment and derived work. OS IME,
clipboard/mobile/other-browser gates remain open. See
[verification](reports/task-C.5-C.6-semantic-interpolation.md).

C.7/C.8 additionally verify native semantic text recording, nested tick failure
traces, whole-keyframe recent eviction, visible session limits, route continuations
and explicit export/import in `/examples/recording/`. These checks validate
executed-prefix recording. C.9/C.10 replay checks are described below; OS IME/system
clipboard/mobile/other-browser qualification and heap/latency claims remain open.

C.9/C.10 add isolated replay in a second mounted app: synthetic native key/text/
paste/composition packets, virtual routing alongside a live router, recorded
measurement/async results without resampling or effects, fixed tick hashes under
varied render schedules, display-only interpolation, first divergence and cleanup.
Node qualification additionally covers rollback/discard/FIFO, failed inputs/ticks,
URL/default hydration, History failures, aliases/holes, randomized array edits,
retained recent/session baselines, compatibility preflight and readonly boundaries.
[The report](reports/task-C.9-C.10-replay-determinism.md) records exact totals and
versions. These replay fixtures do not qualify OS IME/system clipboard/mobile,
other browsers, ambient-global sandboxing, heap collection or performance.

D.1/D.2 additionally qualify repeated retained seeks with stable app/keyed DOM and
native focus/selection, undo/redo barrier validation, virtual URL inspection without
History changes, explicit branch URL restoration and seeded fixed-clock continuation.
The public history example seeks, undoes/redoes and continues a new branch.
[The report](reports/task-D.1-D.2-history-branching.md) lists exact source/command
evidence. Native browser, IME/system clipboard/mobile and heap/performance boundaries
above remain unchanged. D.3/D.4 diagnostics/inspector are implemented; D.5/D.6 performance qualification remains planned.


D.3/D.4 add native Chrome fixtures for automatic visual-frame timing, exact
coalesced binding/write attribution, focused keyed reorders/form-property writes,
inspector native select/refresh/export and explicit history buttons. The public
example also receives trusted CDP Enter activation. Runtime fixtures verify
bounded capture/truncation/eviction, FIFO/rollback, identical recording bytes and
checkpoint hashes, disposal and independent panel ownership. See
[report](reports/task-D.3-D.4-diagnostics-inspector.md) for environment, source
fingerprints and commands. Timings are observations, not benchmark or overhead
claims; owned-resource counts remain distinct from heap/GC proof.
