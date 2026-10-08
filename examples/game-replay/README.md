# Game replay arena

Run `npm run dev` from the repository root and open
[http://localhost:3000/examples/game-replay/](http://localhost:3000/examples/game-replay/).
No install, bundler or third-party runtime is required.

## Try a match

1. Click **Start new match**. You and three simulated players appear in the live arena.
2. The arena receives keyboard focus. Hold WASD or arrow keys to move; Space dashes
   and E shows a message. Collect gold coins by touching them. On-screen arrow,
   Dash and Emote buttons also work; arrows move one short distance per click.
3. Click **Pause live** to freeze simulation or **Advance one tick** to inspect
   one 100 ms game step. Resume to continue. Paused wall time is excluded.
4. Click **Stop & capture**, or let the 12-second match finish. Already queued
   commands are included in one closing tick before export.
5. Click **Replay match**. The second arena starts from the recorded baseline,
   reproducing the same positions, scores, seeded coin spawns, dashes and messages.
6. Use Slow/Normal/Fast, Pause/Resume, and Step once. The status shows verified
   progress. A divergence stops playback before the next recorded step.

New match resets the game and releases the previous recording/replay. Replay
restarts from the baseline. Export is shown locally under **Inspect the captured
JSON**; nothing is uploaded or automatically saved across reloads.

## How it works

`game.js` defines pure synchronous transactions and the initial world. All actors
live in one store. Direction, nudge, dash and emote commands carry a player ID and
are queued to a simulation tick. The tick action advances motion, runs the three
local bot decisions, checks pickups and updates a bounded six-entry event feed.
Simulation uses 100,000 logical microseconds per tick (10 Hz). Coin respawns and
bot decisions call `services.random()` from seed 42; time uses `services.now()`.
The world finishes at tick 120; later ticks/commands do not change gameplay.

`view.js` uses public keyed descriptors and bindings to render players, coins,
scores and messages. Its CSS transitions are display effects; positions in state
are authoritative. Reduced-motion preferences disable transitions.

`main.js` mounts the game, starts session recording, and controls a separate replay
with `createReplay({recording,schema,simulation,view})`. The replay uses the same
actions and tick logic. Each `step()` verifies trace order and state/control hashes.
Live controls/export/progress belong to a separate UI app and are outside the game
recording. Playback delays change viewing speed without changing logical game time.

For example, the same model can be driven headlessly:

```js
import { createReplay } from "../../src/index.js";
import { createGame, schema, simulation, TICK_DURATION } from "./game.js";

const game = createGame();
game.startRecording();
game.enqueueAt(1, "direction", { id: 1, dx: 1, dy: 0 });
game.enqueueAt(2, "dash", 1);
game.enqueueAt(3, "emote", 2);
game.resumeTicks();
game.advanceTicks(3 * TICK_DURATION);
game.pauseTicks();
game.stopRecording();
const replay = createReplay({
  recording: game.exportRecording(),
  schema,
  simulation,
});
replay.run();
console.log(replay.app.snapshot() === game.snapshot()); // true
replay.dispose();
game.dispose();
```

This snippet is a module next to `game.js`. In a mounted live game the framework
already supplies animation-frame elapsed time; use manual advancement while paused
instead of adding a second concurrent elapsed driver.

## Boundaries and cleanup

This is a local simulation of multiple actors. It has no multiplayer server,
WebSocket transport, matchmaking, prediction or correction protocol. For an actual
multiplayer game, normalize accepted server commands into serializable payloads,
order them, then enqueue them for their assigned future ticks. Authority and
late/out-of-order input handling remain application responsibilities. Seeded bots
demonstrate reproducibility rather than network synchronization.

The session retains at most 600 charged action slots and 8,000,000 accounted wire
bytes, with a keyframe interval of 20 slots. Reaching a limit stops capture; the
demo then pauses and exports the usable prefix, which may precede the live world.
These are recording limits, not a JavaScript heap guarantee. There is no persistence
or imported-file UI; programmatic exports use schema `replay-arena/1`.

Reset/disposal cancel playback and monitoring timers and dispose both arenas.
Replay pauses at complete execution roots; it cannot stop halfway through a tick.
Hidden tabs pause the live framework driver; native replay timers may be throttled.
Only desktop Chrome is currently verified. Other browsers/mobile/native input
methods remain unqualified.

## Verify

```sh
node --test tests/game-replay.test.js
npm run test:types
npm run test:browser
npm run smoke
```
