# Fixed ticks and external-input adapters — C.3/C.4

The [public guide](../../DOCUMENTATION.md#fixed-ticks-and-external-inputs) contains
complete copyable examples. The [runnable example](../../examples/ticks/README.md)
uses public imports, buttons and view-owned adapters. [ADR 0017](../adr/0017-fixed-ticks-external-inputs.md)
defines the version/ordering decisions. APIs remain experimental.

## Simulation

`createApp({simulation:{tickDuration,action?,maxCatchUp?},...})` owns a fixed
integer-microsecond clock. Duration is positive and safe; action must name a
registered no-payload action. Catch-up defaults to 8, limited to integers 1–1024.
Initial status is paused. Omit simulation for the existing manual clock.

| Method | Behavior |
| --- | --- |
| `enqueue(name,...args)` | Own supported arguments for next tick; returns an InputTicket |
| `enqueueAt(tick,name,...args)` | Same, assigned to a future positive safe tick with representable logical time |
| `resumeTicks()` | Enable explicit advances and mounted frame sampling |
| `pauseTicks()` | Stop sampling, retain backlog/roots |
| `advanceTicks(elapsedMicroseconds)` | Consume at most maxCatchUp numbered ticks; return count; paused calls ignore elapsed |

Tickets expose frozen sequence/tick/time/cancel. Inputs execute in admission
order within their tick, before configured tick logic. Guards run at execution;
arity and supported graph/aggregate budgets validate at admission. Nested actions
retain normal FIFO order, parent rollback and successful sibling continuation.
Direct dispatch remains immediate at current logical time. Tick advancement
publishes no state version independently of actions.

`ticks` exposes frozen nonreactive enabled/paused/hidden/accumulator/queuedInputs/
maxCatchUp. The accumulator retains all eligible elapsed work, including overload;
zero elapsed can drain it. No numbered ticks skip. Frame timestamps are rounded
absolute microseconds. Mounting connects the target window; headless advances
need no browser. First frame/resume/visibility establishes a new epoch. Hiding
stops frame sampling and excludes hidden wall time; existing backlog remains.
Explicit advances are allowed while hidden. Avoid driving elapsed time twice.
`flush()` only renders. C.6 adds optional [display interpolation](semantic-interpolation.md).

Failed roots roll back their state/draws while healthy roots/tick logic continue.
The consumed tick and successful prefixes remain. Failures pause the driver,
throw/report once, and retain later backlog. Overflow leaves the unconsumed tick
and its roots pending. Applications choose recovery before explicit resume.

Queues retain at most 1024 root inputs and aggregate supported payload budgets:
10,000 nodes, 100,000 entries, 100,000 array slots, 1,000,000 UTF-16 text units;
each graph has at most 128 object levels. Cancellation releases retained budget.
Per-root dispatch can still admit nested actions up to its existing 1024 bound.
These bounds do not constrain arbitrary callback CPU or external allocations.

Fixed checkpoint format/runtime v1 now accepts its reserved clock mode with
tick/time/positive duration. Restore needs matching simulation duration and
compatible schema/tick code; pause/frame/accumulator reset to paused/zero.
Manual checkpoints require manual configuration. Any pending root/effect rejects
snapshot export with SNAPSHOT_PENDING. `setLogicalTime` rejects fixed mode with
CONTROL_MODE. Manual wire encoding remains unchanged.

Errors: TICK_INVALID (configuration/elapsed/future assignment), TICK_MISSING,
INPUT_LIMIT (count/sequence), PAYLOAD_LIMIT (aggregate graph), existing action/
payload codes, INPUT_REENTRANT (queue admission/cancel), CONTROL_REENTRANT
(tick operations), CONTROL_LIMIT (time/tick overflow). Explicit drives report
phase control; admission reports input. APIs reject active actions/admission,
rendering/reads/notifications and error hooks. Disposal stops queued work, native
frame handles and the visibility listener.

## Adapters

`app.inputs` owns work until app disposal. `context.inputs` owns it until that
root/conditional/list-item/route view scope is disposed. All adapter actions must
accept a payload with this supported shape:

```js
{version:1,origin:'layout',status:'success',value:{width:123},error:null}
```

Error results use status error, null value, and `{name,message}`. Explicit
cancellation uses status cancelled with null value/error. Origin must be a
nonempty string of at most 128 UTF-16 units. Names/messages are truncated to
128/2048 units; native Error/Response/Event/DOM objects never enter as values.
Payload guard/domain validation remains application-owned. Sequence/tick/time
are receipts outside action payloads, local to the app session rather than
restored recording positions.

- `send(origin,action,value)` owns/delivers supported values.
- `sample(origin,action,read)` calls a synchronous reader outside actions. Throw
  becomes error input; async return rejects INPUT_ASYNC. Unsupported data rejects.
- `measure(origin,action,'viewport')` samples window width/height/device-pixel
  scale; `'layout',element` samples x/y/width/height/top/right/bottom/left;
  `'scroll',element?` samples x/y element scroll positions or the window.
- `storage(origin,action,storage,key)` invokes getItem and returns `{key,value}`;
  missing value is null, source failure becomes error input. This samples values
  and does not replace automatic persistence or change its B.7/B.8 behavior.
- `timer(origin,action,delayMilliseconds,value=null)` owns value before waiting.
  Delay is finite, nonnegative and at most 2147483647. Browser clamping affects
  arrival, which is external input; it does not alter logical tick duration.
- `effect(origin,action,run)` starts run in a microtask with an AbortSignal and
  awaits its result. Normalize network responses inside run to supported data.

Send/sample/measurement/storage return frozen receipts with
sequence/tick/time/input/cancel. Manual delivery is immediate; cancel cannot undo
that action. Fixed delivery queues at the next tick; cancellation removes it.
Readers cannot recursively dispatch, enqueue, sample or dispose during sampling.
Invalid origin/action/callback uses INPUT_INVALID; ambient measurement/storage
failures become serializable error inputs. Operations report phase input.

Effect/timer return frozen `{cancel,done}`. At most 1024 pending effects per app.
Success/rejection completion determines admission order. Explicit cancel aborts
and produces exactly one cancellation result while live. Scope/app disposal
aborts, suppresses results, removes scoped queued inputs and resolves done to
null. Late outcomes are consumed. Successful live tasks resolve done to their
receipt; fixed tasks acknowledge admission, with guard/body failures reported at
the later tick. Immediate delivery and unsupported result errors reject done.
The task internally handles rejections, while callers may await done to recover.

Scoped effects/timers can register during view construction; run/delivery occurs
later. Synchronous samplers/send require a boundary outside construction and
active action/reactive/render/error work. Closed scoped APIs use SCOPE_DISPOSED.
Aborting cannot reverse an already completed remote effect or force an arbitrary
promise to release application-owned closures. Runtime cleanup removes its owned
resources; no heap-collection guarantee is made.

This is an ordered serializable external-input boundary. C.7/C.8 provide opt-in [bounded executed-prefix recording](recording.md);
full replay/suppression remain unimplemented. C.5/C.6 implement
[semantic event/router/persistence packets and display interpolation](semantic-interpolation.md). Manually forwarding a saved envelope through
enqueue can demonstrate deterministic transitions without claiming public replay.
