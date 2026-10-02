# Task 0.7 — View syntax evidence

Completed: 2026-10-02 (Bahrain). Result: element functions selected for the core;
optional templates deferred. See [ADR 0001](../adr/0001-view-syntax.md).

Historical measurement note: the shared transaction validator is corrected in
task 0.9. Its [follow-up review](task-0.9-architecture-review.md) records 40 passing
DOM regressions on the corrected sources/Chrome patch. The original full timing
dataset here remains unchanged and fingerprinted; quick follow-up timings are
smoke-only and are not a new full syntax-performance comparison.

## Scope and reproduction

`spikes/view-syntax/` contains an isolated browser renderer, read-only dependency
adapter, binding tokens, element descriptors, conditional/keyed helpers, owned
events, and cached template parser. None is wired into the package public entry.
No third-party libraries or compiler were used. Node's standard library runs the
server/tests and drives installed Chrome through its pipe protocol.

```sh
npm run test:spikes
npm run check:view-syntax
npm test
npm run test:benchmarks
npm run smoke
```

The browser command requires installed Google Chrome at the platform default
path, or `MINI_FRAMEWORK_CHROME_PATH` pointing to the executable. It uses an
ephemeral localhost server and an isolated temporary browser profile, removed
afterward. `-- --quick` runs the full browser correctness suite but abbreviated
measurements. For manual inspection, run `npm run dev` and open
`http://localhost:3000/spikes/view-syntax/`.

## Equivalent examples and authoring assessment

All three modes create the same labeled text input, increment button, count
text/attribute, unrelated text, conditional content, and keyed row list with
inputs. Actions consume serializable semantic values; input handlers extract
`event.currentTarget.value` outside actions. No-payload named actions can be
registered directly as declarative handlers. Template whitespace differs from
element descriptors; semantic output and keyed identity, not byte-identical DOM
allocation, are the equivalence checks.

| Mode | Property text | Event registration | Tracking |
| --- | --- | --- | --- |
| Element functions | `span(bind.count)` | `button({ onClick: actions.increment }, '+')` | Exact leaf binding |
| Token template | `html\`<span>${bind.count}</span>\`` | `@click=${actions.increment}` | Exact leaf binding |
| Eager template | `html\`<span>${state.count}</span>\`` | `@click=${actions.increment}` | Conservative view capture |

Element functions omit empty props, support flat event props, and compose cleanly
with ordinary JavaScript control descriptors. Templates keep native HTML/attribute
structure readable. Both need explicit keyed/conditional helpers and semantic
event adapters. These are authoring observations from equivalent fixtures, not
a user study or a quantified readability ranking.

### Correctness and resource checks

40 browser checks passed, covering:

- Immediate committed state and delayed/coalesced DOM writes; thrown and
  Promise-returning actions publish neither state nor DOM changes.
- Deep properties, aliases, replacement, exact text-only invalidation, and
  unchanged unrelated bindings.
- Keyed reverse/insert/delete/replacement, retained row node identity, focused
  input/selection preservation, selective row updates, and refreshed eager closures.
- Native label association, required/disabled controls, semantic input values,
  form cancellation, trusted Enter activation and Tab focus traversal. Scroll,
  keyboard, bubbling cancellation, and owned delegated/direct listeners.
- Conditional disposal, detached handler inactivity, zero owned live effects,
  handlers/listeners/subscriptions after app disposal, idempotent disposal, and
  100 conditional off/on cycles with no resource-counter growth.
- Malicious-looking text/quoted attributes remain data. Inline `onclick`, string
  handlers, unsafe URL protocols/static URLs, scripts, comment slots, dynamic
  attribute names, and raw style strings are rejected. Failed mounts clean DOM.
- Mixed dynamic attributes, attribute removal, safe links, restricted style
  objects, derived expressions, native template-site identity/cached cloning,
  render-time dispatch/mutation rejection, and automatic rAF rendering.
- The same renderer adapter works with COW and staged engines. Timed measurements
  intentionally use only the reference engine, without selecting a production engine.

Node verification: 164 spike tests (157 transaction tests + seven syntax tests),
eight workload tests, and three scaffold tests passed. Root startup smoke passed.
Owned-resource checks are not heap proofs; externally retained DOM/proxy references
can remain alive. Browser support, IME/paste handling, routing, full action
scheduling, and robust render-error recovery remain later work.

## Measurement record

Authoritative full dataset:
[view-syntax-1790896108425-a49740a2.json](../../benchmarks/results/view-syntax-1790896108425-a49740a2.json).
It records raw samples, source SHA-256 fingerprints, all browser test names,
configuration, machine/browser versions, flags, and resource deltas. Earlier
quick/intermediate files are historical harness runs with their own fingerprints,
not the evidence for this report.

Recorded UTC: 2026-10-01 23:08:28 (2026-10-02 in Bahrain). Apple M4, ten cores,
16 GiB RAM, Darwin 24.6.0 arm64, Chrome 154.0.8037.92 / V8 15.4.80.19.

Final collection ran without concurrent test/benchmark jobs. Three rotated-order
rounds; 32/256 rows; five excluded warmups then 20 measured
samples per mode/size/round. 18 trials yield 360 samples for each of mount,
count update, reverse, and disposal (1,440 timed spans total). Each sample mounts
a fresh app, increments/flushed count, reverses/flushed rows, verifies DOM/value
equivalence and identity, then disposes and checks zero resources. Checks sit
outside measured spans. The update/reverse spans include the reference engine
transaction and reindexing, not only DOM work.

### Times (milliseconds, median / nearest-rank p95)

| Rows | Mode | Mount | Count update | Reverse | Dispose |
| ---: | --- | ---: | ---: | ---: | ---: |
| 32 | Elements | 0.400 / 1.100 | 0.100 / 0.200 | 0.200 / 0.300 | 0.200 / 0.300 |
| 32 | Token template | 0.400 / 0.600 | 0.100 / 0.100 | 0.150 / 0.300 | 0.100 / 0.200 |
| 32 | Eager template | 0.400 / 1.000 | 0.100 / 0.200 | 0.100 / 0.200 | 0.100 / 0.200 |
| 256 | Elements | 2.600 / 5.000 | 0.400 / 0.500 | 1.100 / 1.400 | 1.000 / 1.300 |
| 256 | Token template | 2.400 / 4.700 | 0.400 / 0.700 | 1.100 / 1.300 | 0.600 / 0.800 |
| 256 | Eager template | 2.500 / 4.300 | 0.600 / 0.700 | 1.100 / 1.300 | 0.650 / 0.900 |

Counters for every measured count update, at both sizes:

| Mode | Effect evaluations | View evaluations (subset) | Value writes | Structural writes | New parse / clone |
| --- | ---: | ---: | ---: | ---: | ---: |
| Elements | 2 | 0 | 2 | 0 | 0 / 0 |
| Token template | 2 | 0 | 2 | 0 | 0 / 0 |
| Eager template | 6 | 1 | 2 | 0 | 0 / 0 |

Eager capture remains correct but reevaluates unaffected attribute/control effects.
The decisive failure is per-binding provenance, not a timing threshold. Tokens
preserve the reader explicitly without changing ordinary primitive state values.
See the ADR and the executable provenance fixture for equal-value/read-sequence
ambiguity.

### Template cache microprobe

Same native template site, five excluded warmups and 20 samples of 100 operations
per batch. Each number is the batch elapsed time divided by 100, not an
individually timed operation. Cold parse includes creating a new compiler/cache;
cache hit includes creating the descriptor and checking the cached identity;
clone includes native `cloneNode(true)` and resolving slot paths.

| Operation | Median ms/op | p95 ms/op |
| --- | ---: | ---: |
| Cold parse/validation/path build | 0.007 | 0.008 |
| Cached site lookup | Below timer resolution (0 recorded) | 0.001 |
| Native clone + slot resolution | 0.001 | 0.002 |

The reusable compiler records one parse and 2,500 clones including warmups.
Repeated conditional mounts likewise clone without reparsing. A zero elapsed
lookup sample is timer quantization, not zero computation. WeakMap lookup is
constant-time; cloning and slot handling scale with template size.

## Security and limitations

Only static developer-authored segments and internal slot markers enter the
parser's `template.innerHTML`. Dynamic values are text nodes/`Node.data`, validated
attributes, supported native control properties, or branded view descriptors.
Event directives are removed and converted to owned handlers; bubbling events
share root delegates, while nonbubbling scroll/focus/blur use owned direct listeners.

This is a constrained prototype: a small native tag allowlist, no arbitrary HTML
injection, no SVG/custom elements, no dynamic tag/attribute names, no raw style
strings, and restricted URL/style values. Style objects are developer-authored,
not an arbitrary untrusted-CSS sanitizer. This evidence does not justify a
universal “XSS immunity” claim, arbitrary HTML/CSS support, or a CSP claim.

Synchronous timings do not include traced layout/paint latency or total frames.
Headless Chrome, JIT/GC, timer granularity, warmup, descriptor shape, whitespace,
and reference graph scans affect the numbers. No exact allocation/GC profile was
collected for these syntax examples. Counts demonstrate ownership cleanup and
work, not retained heap or universal performance. Core lifecycle, diagnostics,
action metadata/typing, browser matrix and native IME semantics require their
own acceptance gates.
