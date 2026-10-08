import {
  createApp,
  createReplay,
  createActionSchema,
  readRecording,
  div,
  p,
  button,
  textarea,
  label,
} from "../../src/index.js";
/** @typedef {'idle'|'playing'|'paused'|'complete'|'diverged'} Playback */
/** @typedef {{ n:number, draw:number, time:number, summary:string, exported:string, playback:Playback }} State */
/** @typedef {{ summary:string, exported:string, playback:Playback }} Output */
/** @type {ReturnType<typeof createActionSchema<State>>} */
const build = createActionSchema({ version: "recording-example/2" });
export const schema = build(({ action }) => ({
  sample: action((draft, services) => {
    draft.n++;
    draft.draw = services.random();
    draft.time = services.now();
  }),
  output: action(
    /** @returns {value is Output} */ (value) =>
      !!value &&
      typeof value === "object" &&
      "summary" in value &&
      typeof value.summary === "string" &&
      "exported" in value &&
      typeof value.exported === "string" &&
      "playback" in value &&
      (value.playback === "idle" ||
        value.playback === "playing" ||
        value.playback === "paused" ||
        value.playback === "complete" ||
        value.playback === "diverged"),
    (draft, value) => {
      draft.summary = value.summary;
      draft.exported = value.exported;
      draft.playback = value.playback;
    },
  ),
}));
/** @param {'recent'|'session'} mode */
function start(mode) {
  releaseReplay();
  app.stopRecording();
  app.actions.output({
    summary: `Recording ${mode}; limit: 20 action slots / 64,000 bytes.`,
    exported: "",
    playback: "idle",
  });
  app.startRecording({
    mode,
    maxActions: 20,
    maxBytes: 64000,
    keyframeInterval: 4,
  });
}
function exportCaptured() {
  releaseReplay();
  app.stopRecording();
  const text = app.exportRecording(),
    log = readRecording(text, { schemaVersion: schema.version });
  app.actions.output({
    summary: `${log.status}: ${log.records.length} roots, baseline ${log.baseline.sequence}, end ${log.end.sequence}, ${log.evictedRecords} evicted; ${log.reason ?? "no limit reached"}. Validated locally.`,
    exported: text,
    playback: "idle",
  });
}
/** @param {string} recording */
function makeReplay(recording) {
  return createReplay({
    recording,
    schema,
    view: ({ bind }) =>
      p(
        "Replayed samples: ",
        bind.n,
        "; controlled draw: ",
        bind.draw,
        "; logical microseconds: ",
        bind.time,
      ),
  });
}
/** @type {ReturnType<typeof makeReplay> | null} */
export let replay = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let playbackTimer = null;
function stopPlayback() {
  if (playbackTimer !== null) clearTimeout(playbackTimer);
  playbackTimer = null;
}
function releaseReplay() {
  stopPlayback();
  replay?.dispose();
  replay = null;
}
/** @param {'playing'|'paused'} mode */
function presentReplay(mode) {
  if (!replay) return false;
  const result = replay.status;
  const playback =
    result.status === "complete" || result.status === "diverged"
      ? result.status
      : mode;
  replay.app.flush();
  app.actions.output({
    summary: `Replay ${playback}: ${result.position}/${result.total} steps; ${result.divergence?.reason ?? "all hashes matched"}.`,
    exported: app.state.exported,
    playback,
  });
  app.flush();
  return playback === "playing";
}
function queueReplayStep() {
  // Presentation pacing only: recorded logical time and inputs stay unchanged.
  playbackTimer = setTimeout(() => {
    playbackTimer = null;
    if (!replay) return;
    replay.step();
    if (presentReplay("playing")) queueReplayStep();
  }, 500);
}
function replayCaptured() {
  releaseReplay();
  replay = makeReplay(app.state.exported);
  const target = document.getElementById("replay-host");
  if (!target) throw Error("Replay host is missing.");
  replay.app.mount(target);
  if (presentReplay("playing")) queueReplayStep();
}
function togglePlayback() {
  if (!replay) return;
  if (app.state.playback === "playing") {
    stopPlayback();
    presentReplay("paused");
  } else if (app.state.playback === "paused") {
    if (presentReplay("playing")) queueReplayStep();
  }
}
function stepReplay() {
  if (!replay) return;
  stopPlayback();
  replay.step();
  presentReplay("paused");
}
export const app = createApp({
  schema,
  initialState: {
    n: 0,
    draw: 0,
    time: 0,
    summary: "Choose a recording mode.",
    exported: "",
    playback: "idle",
  },
  controls: { seed: 7 },
  view: ({ bind, actions, derive, onDispose }) => {
    onDispose(releaseReplay);
    return div(
      p(
        "Committed samples: ",
        bind.n,
        "; controlled draw: ",
        bind.draw,
        "; logical microseconds: ",
        bind.time,
      ),
      button({ id: "recent", onClick: () => start("recent") }, "Start recent"),
      button(
        { id: "session", onClick: () => start("session") },
        "Start session",
      ),
      button({ id: "sample", onClick: actions.sample }, "Sample"),
      button(
        { id: "export", onClick: exportCaptured },
        "Stop, export and validate",
      ),
      button(
        {
          id: "replay",
          disabled: derive((state) => !state.exported),
          onClick: replayCaptured,
        },
        "Replay captured prefix",
      ),
      button(
        {
          id: "pause-replay",
          disabled: derive(
            (state) => state.playback !== "playing" && state.playback !== "paused",
          ),
          onClick: togglePlayback,
        },
        derive((state) =>
          state.playback === "playing" ? "Pause replay" : "Resume replay",
        ),
      ),
      button(
        {
          id: "step-replay",
          disabled: derive(
            (state) => state.playback !== "playing" && state.playback !== "paused",
          ),
          onClick: stepReplay,
        },
        "Step once",
      ),
      p(
        "Replay shows one recorded step every half-second. Pause to inspect a state, or use Step once.",
      ),
      div({ id: "replay-host", "aria-live": "polite" }),
      p({ id: "summary" }, bind.summary),
      label({ for: "recording-export" }, "Explicit recording export"),
      textarea({
        id: "recording-export",
        readOnly: true,
        value: bind.exported,
      }),
    );
  },
});
app.mount();
