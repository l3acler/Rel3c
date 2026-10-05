# B.1–B.3: Native events, keyboard and text editing

Implemented and verified 5 October 2026 (Asia/Bahrain), with the qualification
limits below. Experimental APIs; Phase B remains incomplete. Committed at user request;
not pushed. Baseline HEAD: `60949a5da5caac25c2327ab3cfdfeb575eba5bc8`.

## Result

B.1 adds a public on map for native event names, synchronous callbacks and
capture/passive/once options, explicit cancellation/propagation, delegated target
semantics and direct nonbubbling/capture registration. Existing onClick callbacks
retain their zero-argument contract and direct no-payload action compatibility.
Native defaults remain unless explicitly canceled. Scope removal ends every
registration; once is consumed before callback execution, even on failure.

B.2 adds frozen serializable onKey snapshots for keydown/up, repeat, modifiers,
composition state and ordered held-key records. Per-element scopes independently
track keys by code/location, reset on focus exit/window blur/hidden document, and
clear silently on disposal. Native events remain outside action payloads; a
256-key bound prevents unbounded held-state growth.

B.3 adds onText snapshots of actual input/textarea text and selection, including
useful in-progress composition values, accepted/canceled values and paste's
subsequent input event. Duplicate value/composing pairs are suppressed. Bound
text controls protect active composition even without onText: deferred writes
resume with a fresh latest-state read, never a stale saved write. Equal values
avoid setters; differing writes preserve/clamp focused selection/direction.
Programmatic initial/bound values establish the adapter baseline without spurious
callbacks. Native form reset remains native unless an explicit on.reset policy
also dispatches state updates.

The new `/examples/inputs/` form uses only public imports, with name/notes editing,
keyboard status, Ctrl+Enter, submit/save and native scroll measurement dispatched
as a numeric payload. No framework/state dependency or application-managed DOM
listener/patch was added. Declarations, positive/negative fixtures, README,
DOCUMENTATION.md, API references, PRD v2.11 and the development plan are updated.
[ADR 0011](../adr/0011-native-events-inputs.md) records the contracts and tradeoffs.

## Verification

| Command | Result |
| --- | --- |
| `npm test` | 299 passed, zero failures; 21 focused new input/event checks plus all 278 prior checks |
| `node --test tests/events-input.test.js` | 21 focused checks passed |
| `npm run test:types` | Positive TS and checked JS pass, including the inputs example; 83 independent negative lines rejected |
| `npm run test:browser` | 92 passed; includes eight new native DOM/event fixtures and four public-example automation checks |
| `npm run smoke` | Root redirect, public imports/runtime modules, existing examples and new inputs HTML/JS serving pass |
| `git diff --check` | Passed |

The [final browser report](../../tests/results/app-lifecycle-1791186314322-4cf5c3f7.json)
fingerprints 47 runtime/declaration/example/test/driver files and records exact
browser/machine metadata plus nativeInputLog. Environment: Node v26.3.0,
TypeScript 5.9.3, isolated headless Chrome 154.0.8037.93, Darwin 24.6.0 arm64,
Apple M4 (10 CPUs). No native animation-frame substitute or skipped check.

Trusted keyboard automation types/repeats/releases A, then replaces the selection
with Arabic/emoji text. State and native selection remain correct after rendering.
Chrome's composition engine replaces selected text with に, preserves it through
an external committed value/render flush, then accepts 日本. Compositionstart
and composing input are trusted; CDP's final compositionend is untrusted and is
recorded as such. This proves the browser-engine path, not an OS IME session.
Ctrl+Enter saves once; native form submit saves again without reloading. PageDown
scrolls the focused region and updates the numeric action payload. All ownership
counters reach zero after disposal; this is not a heap-collection proof.

The enhanced Node DOM double models capture/bubble/default cancellation and focus
transitions. Native browser fixtures independently check event order, defaults,
scoped scroll/submit, keyboard reset, Unicode/paste-value snapshots, composition
writes across native frames, selection and stale-node cleanup. Existing native
link/form defaults and the entire core acceptance continue to pass.

The baseline passed 278 Node checks, type checks and 80 browser checks. The
sandbox initially blocked localhost listening for smoke; rerunning the existing
server/browser checks with sandbox escalation passed. An intermediate browser run
passed all checks but hit ENOTEMPTY during temporary-profile deletion. The isolated
Chrome driver now retries removal of only its own mkdtemp profile for that native
process-exit race; final browser runs exit successfully. A composition assertion
initially expected a trusted CDP compositionend; diagnostics showed untrusted end,
so the check and evidence now describe the actual protocol-generated sequence.
Concurrent formatting edits to the existing core example were preserved; the
final tests and source fingerprints include the current workspace versions.

## Qualification limits and remaining checks

| Input/browser path | Evidence | Status |
| --- | --- | --- |
| Chrome native DOM/events, focus/selection, trusted key/Unicode editing and keyboard scroll | Final browser report | Verified on the stated environment |
| Chrome composition engine | CDP imeSetComposition/insertText with recorded event trust | Verified browser automation; not OS input-method qualification |
| Paste after native value change and inputType insertFromPaste | Synthetic ClipboardEvent/InputEvent fixtures on native controls | Adapter logic verified; real system clipboard paste unrun |
| Chinese Pinyin, Japanese and Korean OS IMEs | No manual OS/input-method session | Unqualified |
| Desktop Firefox/Safari, Android Chrome, iOS Safari and mobile keyboards | No new platform checks | Unqualified |

For OS/native clipboard qualification, run the public example headfully and record
browser/OS/input method and these steps/results: compose and accept Chinese,
Japanese and Korean values; change candidates; cancel composition; blur/focus;
apply an external value during active composition; paste Arabic/emoji/newlines;
replace selected text; delete and undo/redo. Compare app state and live field value,
ensure no composition overwrite, and record focus/selection. Mobile qualification
also requires autocorrection and soft-keyboard checks. No unrun cell is claimed
supported by synthetic events or Chrome's protocol. These remain B.3/B.11 release
qualification gates while this batch's implemented behavior is checked complete.

Priority scheduling (B.4) is next, followed by routing, state locations and the
clean-checkout auditor walkthrough. Recording/replay, controlled clock/random,
external-input recording and the separate demonstration app remain outside this
batch. Recordable semantic shapes do not imply an implemented recorder.
