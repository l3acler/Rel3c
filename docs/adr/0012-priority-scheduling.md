# ADR 0012: Priority lanes and bounded cooperative scheduling

Status: implemented in B.4. Date: 5 October 2026.

Immediate work runs synchronously on admission. Actions and native input retain
synchronous state commits. Frame work uses the existing owned animation-frame
queue: dirty visual bindings run before user frame callbacks, which cannot dispatch
or navigate during rendering. app.flush drains visual/frame work only. Normal work
runs FIFO in an independent setTimeout task, at most 32 callbacks per turn. Pending
normal turns are not canceled/replaced by new immediate input or render frames, so
normal work can progress even without animation frames. Idle work uses native
requestIdleCallback when present, otherwise a delayed timer; at most eight callbacks
run per idle turn and normal work has precedence. Idle cannot control correctness.

There is no claimed total browser ordering between a future frame and a normal
task; ready immediate work runs now, while host task/paint opportunities determine
when the other lanes run. Fairness bounds framework callback counts, not execution
time of arbitrary JavaScript or browser scheduling under a blocked main thread.

app.schedule(lane, callback) returns an idempotent cancel function; view-context
schedule also cancels on its scope's disposal. Scheduling during actions,
reactive reads/notifications or error hooks rejects; frame callbacks cannot mutate
state. Immediate callback reentry rejects. Queued callbacks may enqueue work, but
new work stays subject to turn budgets. Callbacks must be synchronous. Errors
consume the failed task and attempt remaining eligible tasks. Immediate/normal/idle
failures report phase schedule; frame callback failures report render;
visual binding errors retain the existing render retry/error contract. Cancellation
and disposal make stale native callbacks inert before attempting native removal.
Queued work is bounded to 1,024 callbacks per application.

No tick clock, simulation lane, idle persistence or performance claim is added.
Standards: [HTML event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
and [requestIdleCallback](https://w3c.github.io/requestidlecallback/).
