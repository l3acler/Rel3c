# Priority scheduling (B.4)

Experimental public API: app.schedule(lane, callback) returns an idempotent cancel
function. View contexts have the same method with automatic scope cancellation.
See the [public guide](../../DOCUMENTATION.md#priority-work-and-cancellation) for
copyable examples.

| Lane | Contract |
| --- | --- |
| immediate | Run synchronously now, without a bound this |
| frame | After dirty bindings in the app's frame or explicit flush; newly added frame tasks wait for another frame |
| normal | Independent timer queue, at most 32 FIFO callbacks per turn |
| idle | Native requestIdleCallback with 1,000 ms timeout or 32 ms timer fallback; at most eight callbacks within the deadline and after pending normal work |

Callbacks must be synchronous zero-argument functions. Cancel removes pending work
without interrupting a running callback. Frame callbacks cannot dispatch or navigate.
Idle work must not control correctness. New input and render frames do not cancel a
pending normal task. Browser task/paint opportunities determine the relative order
of future frames and normal tasks. Budgets bound callback counts, not callback CPU,
real-time latency, browser throttling or heap bytes.

Normal and idle can run before mount; frame callbacks wait for a renderer. Explicit
flush drains visual/frame work only. At most 1,024 deferred callbacks may be queued
per app. Completed/canceled context tasks leave the scope's pending set. Unmount
cancels context work; disposal cancels every lane/driver before user cleanup. Stale
native callbacks remain inert.

Actions, payload guards, reactive reads/notifications and error hooks cannot
schedule. Immediate work also rejects during view construction/rendering and
immediate recursion. Deferred work may be scheduled by view factories.
Promise/thenable returns reject rather than accepting async callbacks.

Errors: SCHEDULE_LANE_INVALID, SCHEDULE_CALLBACK_INVALID, SCHEDULE_REENTRANT,
SCHEDULE_ASYNC, SCHEDULE_LIMIT, SCOPE_DISPOSED and APP_DISPOSED. Failed callbacks
are consumed while other eligible work runs. Normal/idle continue in future turns
after an error. Immediate/normal/idle errors report phase schedule; frame callbacks
report render. Queued failures reach the browser after the synchronous onError hook.

This extends A.7 batching without changing commit/rollback ordering. Fixed ticks,
controlled time/random and optional display interpolation are available through
their dedicated APIs; scheduling does not advance logical time. [Bounded recording](recording.md) is opt-in;
full replay remains unimplemented. See [ticks and inputs](ticks-inputs.md) and
[semantic inputs and interpolation](semantic-interpolation.md).
Decision: [ADR 0012](../adr/0012-priority-scheduling.md).
