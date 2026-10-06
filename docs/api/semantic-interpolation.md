# Semantic packets and display interpolation — C.5/C.6

The [public guide](../../DOCUMENTATION.md#semantic-input-packets) contains full
copyable examples. [ADR 0018](../adr/0018-semantic-inputs-interpolation.md) specifies
the decisions and [the runnable example](../../examples/interpolation/README.md)
combines native editing and display interpolation. APIs remain experimental.

## Semantic adapters

`context.inputs.keyboard(origin,action)` returns an onKey callback.
`context.inputs.text(origin,action)` returns an onText callback. The underlying
B.2/B.3 adapters normalize actual browser values, then C.4 external envelopes
cross the owned input boundary. Payload actions receive version/origin/status/
value/error. Direct callbacks/dispatch keep immediate behavior; these helpers
queue values in fixed mode and execute immediately in manual mode.

Keyboard snapshots retain key/code/location, repeat/composition/modifiers and
held-key/reset semantics. Text snapshots retain actual value/phase/composition,
inputType/data and selection. Native Events, targets, cancellation and active
focus are browser presentation. Wrap a helper and cancel native defaults
synchronously if needed. Editing may display ahead of committed fixed inputs;
composition/selection-aware value writes remain unchanged. Scoped helpers own
their queued inputs and stop with that view. Existing origin/action/scope and
payload/queue bounds still apply.

## Packet observation and application

`observeInputs(callback)` returns an idempotent stop function. View-context
subscriptions are scoped; app subscriptions survive until explicit stop/disposal.
Limit: 1024 independent subscriptions. Callbacks receive frozen execution
attempts `{sequence,tick,time,derived,packet}`, before the body. They must be
synchronous and cannot enter runtime mutations. Callback failure does not stop
healthy execution; errors propagate afterward, possibly as an aggregate. There
is no post-body outcome field. Sequence is session admission order; explicitly
assigned future ticks can execute out of sequence. Use callback order/tick.

Packets use version 1 and exact owned fields:

| kind | Fields |
| --- | --- |
| action | name, args (dense zero/one-element data array) |
| navigation | mode, base, canonical local url, replace |
| location | mode, base, canonical local url, cause (mount/native/navigation/state), hydrate |
| hydration | namespace, schemaVersion, groups [{location:session/local/url, values}] |

Action payload guards run at execution. Route config mode/base must match.
Hydration namespace/version and every configured field/location/guard validate
before admission; groups are unique and limited to three. Memory fields cannot
be hydrated. Values preserve supported aliases and are owned/frozen. Ordinary
packet/tuple accessors and extra keys reject; Proxy traps and global reads in
application code are outside sandbox guarantees.

`receiveInput(packet,options={})` validates and admits a supplied packet, returning
a frozen cancelable ticket. `options.tick` optionally assigns a future fixed tick;
unknown/accessor options reject. Manual roots execute immediately, fixed roots
queue by default. Fresh unmounted mount-location/hydration packets bootstrap
immediately unless an explicit tick is supplied. Their compatible initial-state/
schema/seed/runtime configuration remains caller responsibility. On bootstrap,
mount location waits for the separately supplied hydration projection, preserving
one initial combined field commit.

Live initial location/hydration and derived work remain immediate. Fixed native
route observations queue after the browser URL already changed; imperative
navigation writes History at its assigned tick. Relative requests resolve at
admission against current committed route. Action-requested navigation is still
post-commit derived work and is discarded with failed parents. State-to-URL
projection is derived with hydration disabled. Later location application can
derive URL fields from the supplied URL without consulting live storage.

Location packets update route cells without writing History or sampling the live
URL and can execute headlessly. Navigation packets require a mounted router and
perform ordinary History writes. Hydration packets assign supplied projections
without storage reads. Existing persistence fallback/write behavior is retained.
Use normal navigate for live URL synchronization; receiveInput is an explicit
controlled boundary. Pending fixed inputs still reject checkpoint export.

Errors: INPUT_INVALID/INPUT_INCOMPATIBLE, INPUT_ASYNC (observer Promise), INPUT_LIMIT,
INPUT_REENTRANT and existing TICK/action/payload/router/persistence errors. App
operations report input; native event/navigation paths retain their phases.
Token creation validation errors may throw directly like other binding helpers.

Derived location/hydration packets are labeled to avoid executing them again as
independent roots in the opt-in recorder. Nested named dispatch stays dispatcher-
owned. Direct dispatch is not observed here. No automatic log is retained; caller
captures must be bounded by the caller. C.7/C.8 provide [outcome records and bounded baselines](recording.md);
whole-session replay/live-effect suppression remains C.9 work.

## Interpolation

`interpolate(read)` returns an app-owned Binding of its synchronous result. View
contexts create tokens that expire with that scope. Fixed simulation is required.
The callback receives frozen previous/current committed tick roots, alpha, tick
and logical time. Initially and after checkpoint restoration, both roots match.

Alpha is accumulator/duration while running below one tick of backlog; paused,
hidden or backlogged simulation uses 1. Resume uses the retained fraction; there
is no extrapolation. Completed ticks shift roots, including successful prefixes
of a failed tick. Direct commits outside ticks reset both to latest state. COW
roots retain historical arrays/aliases without mutation or fresh full copies.

Only interpolation consumers are invalidated by alpha; the existing render
queue coalesces work. No extra frame driver is created. Explicit elapsed advances
also update alpha. Ordinary binding/text/form behavior remains committed.
Presentation callbacks can return text/attribute/style data; structural when/
keyed sources reject these tokens, preventing render timing from creating effects.
Readonly/reentrant guards forbid authoritative mutation and async callbacks.

Errors: INTERPOLATION_MODE, INTERPOLATION_REENTRANT, INTERPOLATION_STRUCTURAL,
REACTIVITY_ASYNC and existing readonly/binding/disposal errors. Render failures
retain committed state and normal retry behavior. One lazy reactive cell and two
bounded COW roots are retained; app disposal releases them and view cleanup
removes subscriptions/queued bindings. Caller-held frames remain caller-owned.
Interpolation changes no state versions, logical clock/PRNG or checkpoint hashes.
Display roots/alpha are not serialized into authoritative checkpoints.
