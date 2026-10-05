# Controlled time and restored continuation

Run `npm run dev` from the root and open
`http://localhost:3000/examples/determinism/`. The app imports only the public entry.

Draw a sample, advance logical time by 1 ms, and try a throwing action. The failure
changes neither state/version nor PRNG position. Compare restored continuation
creates a new headless app from a checkpoint, applies the same next action to both
and compares canonical hashes before displaying the result. The temporary fork
is disposed afterward; it never replaces mounted state or touches browser storage.

`services.now()` reads integer logical microseconds. `services.random()` draws
from a seeded simulation stream. This does not use wall time, fixed ticks, a log,
recording/replay or security randomness. Clock values are copied into committed
state for display because control snapshots are nonreactive.

See [the public guide](../../DOCUMENTATION.md#checkpoints-and-controlled-services),
[API contract](../../docs/api/determinism.md) and [format decision](../../docs/adr/0016-deterministic-checkpoints-services.md).
