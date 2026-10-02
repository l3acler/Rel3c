# ADR 0001 — Element functions first; optional templates deferred

Status: accepted Phase 0 syntax decision; not a shipped public API.

Date: 2026-10-02 (Bahrain). Task: 0.7. Source: Framework_PRD.md §7,
DOM-1/DOM-2, LIFE-1, and DEVELOPMENT_PLAN.md task 0.7.

## Decision

Use element functions with explicit `bind.prop` tokens as the primary Phase A
view syntax. Allow flat event props (`onClick`) and omitted empty props objects.
Use an explicit derived binding for expressions rather than boxing ordinary
state primitives or inferring dependencies from equal primitive values.

Keep both tagged-template variants in `spikes/view-syntax/`. Do not expose `html`
from the public runtime yet. The explicit-token variant works, but it is not the
same contract as arbitrary eager `${state.prop}` expressions with exact per-slot
dependencies. Revisit optional templates in a separate, explicit contract
decision; do not disguise whole-view reevaluation as fine-grained binding capture.

This completes the prototype/adoption decision, not all public API design. The
transaction choice, dispatch types, no-op policy, and schema/serialization ADRs
remain tasks 0.8/0.9. `src/index.js` remains the scaffold placeholder.

## Context and evidence

The PRD asks for native templates, no mandatory arrow wrappers, cached parsing,
safe dynamic values, and owned event directives. It also requires exact property
and binding dependencies. The plan makes templates optional and explicitly
requires element functions to be selected, with template inclusion gated.

Three equivalent form/list examples were implemented without dependencies or a
build step: element functions, token-interpolated templates, and eager templates.
All preserve keyed nodes, native labels/forms/controls, framework event ownership,
safe text/attribute writes, and cleanup in the tested browser.

JavaScript evaluates interpolations before invoking the tag. A primitive value
does not retain the property or expression that produced it. Even the same flat
read sequence can arise from different slot dependencies:

```js
// a === b === 0; both produce values [0, 0] and reads [a, b, a].
tag`${state.a + state.b}${state.a}`; // b affects slot 0
tag`${state.a}${state.b + state.a}`; // b affects slot 1
```

The tag cannot recover those expression boundaries from the values and read
sequence alone. The eager prototype therefore captures the entire view and
reevaluates it conservatively. It remains correct and preserves DOM identity,
but evaluates unaffected slots. Parsing still occurs only once per template site
per app; unchanged values are not written again.

For the measured count update, element and token-template variants each evaluate
two bindings (one text, one attribute), without reevaluating a view. Eager
templates evaluate six effects including the view. All perform the same two
value writes and zero structural writes. A focused element test proves a single
text-only change evaluates/writes exactly one binding without reading the
unrelated binding again.

Timing is supporting evidence, not the deciding gate: at 256 rows, update
median/p95 was 0.400/0.500 ms for elements, 0.400/0.700 ms for token templates,
and 0.600/0.700 ms for eager templates on the recorded machine. These include the reference
transaction engine and graph indexing; they are not general renderer speedups.
See the [complete report](../reports/task-0.7-view-syntax.md) for raw evidence,
browser checks, measurements, and limitations.

## Adoption gates

| Gate | Elements + tokens | Templates + tokens | Eager templates |
| --- | --- | --- | --- |
| Native JavaScript, no compilation | Pass | Pass | Pass |
| No mandatory arrow wrapper for a property | `bind.prop` | `${bind.prop}` | `${state.prop}` |
| Exact per-binding dependency tracking | Pass | Pass | Fail: whole-view capture |
| No dynamic HTML injection; inline events rejected | Pass in supported subset | Pass in supported subset | Pass in supported subset |
| Owned handlers and unmount cleanup | Pass | Pass | Pass |
| Cached parse and native clone | Not applicable | Pass | Pass |

`WeakMap` lookup is the constant-time cache operation, not parsing, cloning,
inserting nodes, or resolving slot paths. Static HTML is developer-authored;
dynamic text never enters `innerHTML`. A constrained tag/attribute/URL subset is
tested, not universal XSS immunity or a sanitizer for arbitrary HTML/CSS.

## Alternatives and consequences

- Eager whole-view capture: convenient HTML syntax and correct output, but fails
  the exact-binding gate; rejected as the core tracking mechanism.
- Token-only templates: technically viable and no arrows for property reads;
  retained as an optional future extension, not falsely declared equivalent to
  the PRD's eager-expression candidate.
- Compiler rewriting: can supply expression boundaries, but violates the
  zero-compilation constraint for this prototype.
- Boxed state primitives: changes ordinary JavaScript state semantics, equality,
  control flow and payload handling; not adopted.
- Reader wrappers: explicit expression provenance; acceptable for derived
  bindings, not mandatory for ordinary `bind.prop` property bindings.

Element functions compose naturally with conditional/keyed descriptors and avoid
an HTML parser in the core. HTML is easier to scan for some authors; that is an
authoring judgment, not a measured usability result. Both prototypes remain
available for inspection. No PRD text was rewritten to conceal the unmet eager
tracking gate. Supporting eager templates would require an explicit relaxation
of exact per-binding evaluation or a different authorized language contract.
