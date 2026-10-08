# Bounded recording and replay example

Run `npm run dev` at the package root and open `/examples/recording/`.
Click **Start recent** or **Start session**, then **Sample**. Session capture stops
at 20 action slots; the live counter still runs. Recent capture advances its
baseline as whole checkpoint segments expire. **Stop, export and validate** is
an explicit developer action showing canonical JSON and the local validation
result. Start recording before exporting. **Replay captured prefix** restores a
separate app and displays one recorded step every 500 ms, verifying each step's
hashes. **Pause replay** freezes the current state; **Resume replay** continues.
**Step once** advances one complete recorded step and leaves playback paused.
The replay button restarts from the recording's baseline. Completion or divergence
stops playback automatically. A limited export
ends before the live counter; replay reproduces that captured end.

To watch it, start a session, click Sample several times, export, and replay.
The second view first shows the starting snapshot, then the intermediate counts
and seeded random values. The progress message shows completed/total steps.
An empty recording completes immediately; recent history begins at its retained
baseline, which may already have a nonzero count.

All application behavior uses public imports, declarative handlers and synchronous
controlled services. Export display updates happen after capture stops, avoiding
recording the recording itself. No upload/download/storage write is performed.
The output is a captured prefix; `readRecording` validates without replaying it.
`createReplay` then verifies actual transitions with live sources suppressed.
The browser timer only paces display; it does not advance logical time or add
recorded inputs. Starting a recording, exporting again, restarting replay or
disposing the app cancels pending playback and disposes the old replay view.
Playback controls are updated outside capture. The added playback UI state uses
example schema `recording-example/2`; old version-1 example recordings are not
compatible. Framework APIs and recording format versions are unchanged.
See [recording](../../DOCUMENTATION.md#bounded-recording) and
[replay](../../DOCUMENTATION.md#isolated-replay) in the guide.
