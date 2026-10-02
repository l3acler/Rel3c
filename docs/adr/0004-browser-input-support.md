# ADR 0004 — Browser and native-input verification policy

Status: accepted Phase 0 target/verification policy; broad browser support is
not yet verified or shipped.

Date: 2026-10-02 (Bahrain). Task: 0.9. Sources: Framework_PRD.md §5/§7/§8;
EVENT-1/EVENT-2, ROUTE-1, LIFE-1; development tasks B.1–B.3/B.11/C.5/C.10.

## Decision

Target browser-native modules on modern Chromium, Firefox and Safari, without
a compiler or third-party frontend runtime. For the Phase B release, test the
latest two stable desktop major releases available at release qualification
(Chrome/Edge, Firefox, Safari), plus current Android Chrome and iOS Safari on
real mobile devices. Publish the exact browser/OS versions actually qualified;
this rolling target is not a claim that every present or future version works.
If a target cannot be qualified, explicitly narrow the release support matrix.

Do not provide a legacy/Proxy-less fallback. Required primitives include native
ES modules, Proxy/Reflect, Map/Set/WeakMap, Object.hasOwn, standard DOM events,
requestAnimationFrame and TextEncoder for the codec. Router and persistence
add History/URL and Web Storage requirements in Phase B. Startup diagnostics
must identify missing capabilities, not silently switch execution contracts.
Checking an API's presence does not prove correct native editing behavior.

State imports accept only same-realm ordinary arrays/plain objects or
null-prototype objects. Objects from another window/iframe are not implicitly
normalized. Cross-realm integrations must pass serialized, validated data into
the application realm; they do not dispatch a native Event, DOM node or foreign
object into actions. This restriction is tested by the Phase 0 type-policy suite.

## Current evidence versus proposed coverage

| Browser/platform | Phase 0 evidence | Release qualification still required |
| --- | --- | --- |
| Isolated headless Chrome 154.0.8037.92 (0.6/0.7) and 154.0.8037.93 (0.9), macOS arm64 | Transaction rAF trials; 40 syntax/DOM checks including trusted Enter and Tab | Public runtime, headful/native input, routing, storage, full cleanup |
| Desktop Chrome/Edge, macOS/Windows/Linux | Target only; no full platform qualification | Exact version/OS matrix and public acceptance suite |
| Desktop Firefox and Safari | Target only; not tested | Public suite plus native composition/editing cases |
| Android Chrome and iOS Safari | Target only; not tested | Real-device text input, touch activation, focus/selection, scrolling/history |
| Legacy engines/embedded WebViews | Not supported by this initial target | Separate explicit compatibility decision and evidence |

Chrome's headless results do not qualify Safari, Firefox, mobile browsers, real
display latency, clipboard operations or operating-system IMEs. Node type tests
do not qualify any browser. Phase 0 has no completed public frontend release.

## Input contract and qualification checklist

Framework-owned listeners preserve default HTML behavior unless a handler
explicitly cancels it. Native bubbling events may delegate; scroll and other
nonbubbling/capture-sensitive events require an appropriate owned listener.
Controls keep labels, native form submission, keyboard activation, focus and
selection. No blanket preventDefault policy or text reconstruction from keydown.

Phase B/C adapters must cover:

- Click/submit, scrolling, key down/up, repeat, modifiers and held-key reset on
  blur/disposal. Native Event objects remain outside serializable actions.
- Input/textarea values, paste, deletion, selection replacement, undo/redo,
  dead keys, emoji, Latin and Arabic/right-to-left text.
- Real Chinese Pinyin, Japanese and Korean IME sessions on documented OS/input
  methods, including updates, acceptance, cancellation and focus loss.
- Current mobile soft keyboards, autocorrection and composition interaction.
- Owned input listeners/scheduled work removed on view/route/app disposal.
- Semantic input logs replaying to matching committed values in Phase C.

Use compositionstart/update/end plus input signals to maintain an editing
session. Do not assume InputEvent.isComposing alone defines every supported
browser's sequence. Admit useful in-progress semantic values under the eventual
B.3 policy; do not force all actions to wait for compositionend or overwrite an
active native composition from a render batch. Reconcile final accepted values
without duplicate application actions. Event sequencing and controlled-input
write/selection policy must be specified and tested in B.3, not inferred from
synthetic composition events.

Automated dispatchEvent fixtures prove handler logic, not an OS IME or native
paste/default editing. Supplement browser automation with recorded headful/manual
checks naming browser, OS, input method, steps and observed values/selection.
Publish limitations instead of marking unrun cells supported.

## API review and sources

API review is a feasibility check, not product acceptance. MDN documents broad
availability of [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
and [Object.hasOwn](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn).
[InputEvent.isComposing](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/isComposing)
indicates the composition interval; [compositionend](https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionend_event)
can mean completion or cancellation. These support the decision to test session
behavior rather than infer committed text from individual key events. Sources
reviewed on 2026-10-02; browser-version minimums remain release qualification work.

Alternatives: Chromium-only would reduce verification cost but leaves the desired
general frontend audience unserved; cross-browser support without testing would
overstate evidence; legacy fallbacks would multiply transaction/input contracts.
The chosen policy keeps broad targets and explicit, evidence-based release claims.
