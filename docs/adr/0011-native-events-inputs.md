# ADR 0011: Native events and semantic keyboard/text inputs

Status: implemented for B.1–B.3; experimental API. Date: 5 October 2026.
OS IME, system clipboard, mobile and broad browser qualification remain open.

## Decisions

Keep A.9 onClick zero-argument callbacks compatible. Add an explicit immutable
on map with lowercase native event names and handler/capture/passive/once options.
Do not guess a camel-case prop for every event or pass native events directly to
named action wrappers. Normalize/copy registrations without ordinary accessor
execution. Event context currentTarget refers to the owned element; nativeEvent
is available for observation outside actions. Context methods preserve native
cancellation/propagation. Mixed delegates listen with passive false and enforce
per-entry passive context cancellation. Native-event methods bypass this bookkeeping;
this is documented rather than claimed as a sandbox.

Delegate known bubbling events, with one listener per type/app target. Capture,
nonbubbling and unknown/custom events listen directly on owned elements. This
preserves native capture timing and scroll semantics. Delegation runs at the root,
so it cannot simulate a handler before external native listeners below that root.
A delegate captures a route, then checks each entry's liveness. Stop propagation
ends the ancestor route; immediate stop also ends remaining same-element entries.
Once is consumed before callback invocation. Preserve synchronous callback errors,
reentrancy and rollback guarantees; capture/direct listeners have individual native
error boundaries, whereas one delegated route aggregates its handler failures.

onKey owns an independent bounded held-key set per element subtree. Identity uses
physical code/location (logical key/location fallback). Keydown/repeat/keyup payloads
include immutable ordered held records and modifiers/composition state. Reset on
focus exiting the subtree, window blur or hidden document, only when nonempty.
Moving focus inside the subtree preserves held state. Disposal clears silently.
Native key events remain outside serializable snapshots and application transactions.

onText samples native input/textarea values and nullable selections. Never derive
text from keys or paste clipboard text before native editing. Compositionupdate
and input publish useful observed values; compositionend/element blur publishes
accepted/canceled values. Dedupe value/isComposing pairs, including final input after
end. A transition from composing to accepted is distinct even when text is equal.
Applications storing only text can suppress equal-value action dispatches.

Protect bound text controls even without an onText callback. Rendering during
composition evaluates dependencies but defers native value writes. End/blur resumes
the binding by scheduling a fresh read of latest committed state, not a stale saved
write. Equal values suppress setters; differing writes preserve/clamp focused native
selection/direction when available. Keep initial form defaults and reset behavior;
reset synchronization remains an explicit application policy using on.reset.

Register all adapters/listeners with existing lifecycle ownership. Cleanup attempts
all native removals and ends input state/deferred work even on removal failure. No
recorder, tick ordering, route implementation or scheduling priority is implied.
Native snapshots establish the boundary Phase C can later record.

## Alternatives and evidence

Passing an Event to the old onClick prop would break direct no-payload action
wrappers. Universal delegation would mis-handle nonbubbling events and capture
order. Writing bound values during composition would overwrite native IME sessions;
waiting for compositionend for every semantic update would unnecessarily suppress
useful in-progress state. The chosen contracts retain compatibility and native editing.

Tests use both an enhanced DOM double and Chrome native DOM/events. Trusted key
input, Unicode replacement, native scrolling and Chrome's composition engine are
exercised through the existing isolated browser driver. Its final compositionend
is untrusted, and no OS IME/system clipboard qualification is inferred. See
[batch evidence](../reports/task-B.1-B.3-inputs.md), [event API](../api/events.md), and
[public guide](../../DOCUMENTATION.md#native-events-keyboard-and-text-editing).

Standards reviewed for native behavior: [DOM event dispatch/cancellation](https://dom.spec.whatwg.org/#interface-event),
[UI Events composition sequencing](https://w3c.github.io/uievents/#events-compositionevents),
and [HTML text selection](https://html.spec.whatwg.org/multipage/input.html#dom-textarea/input-setselectionrange).
These sources describe browser contracts; they do not qualify this implementation
on browsers or OS input methods that have not been tested.
