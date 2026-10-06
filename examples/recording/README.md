# Bounded recording example

Run `npm run dev` at the package root and open `/examples/recording/`.
Click **Start recent** or **Start session**, then **Sample**. Session capture stops
at 20 action slots; the live counter still runs. Recent capture advances its
baseline as whole checkpoint segments expire. **Stop, export and validate** is
an explicit developer action showing canonical JSON and the local validation
result. Start recording before exporting.

All application behavior uses public imports, declarative handlers and synchronous
controlled services. Export display updates happen after capture stops, avoiding
recording the recording itself. No upload/download/storage write is performed.
The output is a captured prefix; `readRecording` validates without replaying it.
See [the guide](../../DOCUMENTATION.md#bounded-recording).
