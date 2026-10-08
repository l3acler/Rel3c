import {
  createApp,
  createActionSchema,
  createReplay,
  readRecording,
  div,
  element,
  p,
  span,
  button,
  section,
  label,
  select,
  option,
  textarea,
} from "../../src/index.js";
import { createGame, schema, simulation, TICK_DURATION } from "./game.js";
import { arenaView } from "./view.js";

/** @typedef {'idle'|'playing'|'paused'|'complete'|'diverged'} Playback */
/** @typedef {{running:boolean,captured:boolean,playback:Playback,summary:string,exported:string,speed:number}} UIState */
/** @type {typeof createActionSchema<UIState>} */
const createUISchema = createActionSchema;
const uiSchema = createUISchema({ version: "replay-arena-controls/1" })(
  ({ action }) => ({
    report: action(
      /** @returns {value is UIState} */ (value) =>
        value !== null &&
        typeof value === "object" &&
        "running" in value &&
        typeof value.running === "boolean" &&
        "captured" in value &&
        typeof value.captured === "boolean" &&
        "summary" in value &&
        typeof value.summary === "string" &&
        "exported" in value &&
        typeof value.exported === "string" &&
        "speed" in value &&
        (value.speed === 50 || value.speed === 100 || value.speed === 300) &&
        "playback" in value &&
        (value.playback === "idle" ||
          value.playback === "playing" ||
          value.playback === "paused" ||
          value.playback === "complete" ||
          value.playback === "diverged"),
      (draft, value) => {
        Object.assign(draft, value);
      },
    ),
  }),
);
/** @param {Partial<UIState>} patch */
function report(patch) {
  ui.actions.report({ ...ui.state, ...patch });
  ui.flush();
}
/** @param {string} id */
function target(id) {
  const node = document.getElementById(id);
  if (!node) throw Error(`Missing ${id}.`);
  return node;
}
/** @type {import('../../src/index.js').KeyboardHandler} */
function handleKey(key, event) {
  if (
    !ui.state.running ||
    game.state.finished ||
    key.isComposing ||
    key.altKey ||
    key.ctrlKey ||
    key.metaKey
  )
    return;
  const moves = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
  ];
  if (key.type === "reset" || moves.includes(key.code)) {
    if (key.type !== "reset") event.preventDefault();
    if (key.repeat) return;
    const held = key.held.map((value) => value.code);
    const has = (/** @type {string} */ a, /** @type {string} */ b) =>
      held.includes(a) || held.includes(b);
    game.enqueue("direction", {
      id: 1,
      dx: Number(has("ArrowRight", "KeyD")) - Number(has("ArrowLeft", "KeyA")),
      dy: Number(has("ArrowDown", "KeyS")) - Number(has("ArrowUp", "KeyW")),
    });
  } else if (
    key.type === "keydown" &&
    !key.repeat &&
    (key.code === "Space" || key.code === "KeyE")
  ) {
    event.preventDefault();
    game.enqueue(key.code === "Space" ? "dash" : "emote", 1);
  }
}
export let game = createGame((context) => arenaView(context, handleKey));
/** @param {string} recording */
function makeReplay(recording) {
  return createReplay({ recording, schema, simulation, view: arenaView });
}
/** @type {ReturnType<typeof makeReplay> | null} */
export let replay = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let replayTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let matchMonitor = null;
function cancelPlayback() {
  if (replayTimer !== null) clearTimeout(replayTimer);
  replayTimer = null;
}
function releaseReplay() {
  cancelPlayback();
  replay?.dispose();
  replay = null;
}
function stopMonitor() {
  if (matchMonitor !== null) clearTimeout(matchMonitor);
  matchMonitor = null;
}
function monitorMatch() {
  matchMonitor = setTimeout(() => {
    matchMonitor = null;
    if (game.state.finished || game.recording.status === "limit-reached")
      stopAndExport();
    else if (ui.state.running) monitorMatch();
  }, 100);
}
function startMatch() {
  stopMonitor();
  releaseReplay();
  game.dispose();
  game = createGame((context) => arenaView(context, handleKey));
  game.mount(target("live-host"));
  game.startRecording({
    mode: "session",
    maxActions: 600,
    maxBytes: 8_000_000,
    keyframeInterval: 20,
  });
  report({
    running: true,
    captured: false,
    playback: "idle",
    exported: "",
    summary:
      "Recording a new match. Click the live arena and move; the other players are simulated.",
  });
  game.resumeTicks();
  monitorMatch();
  target("live-arena").focus();
}
function pauseMatch() {
  if (ui.state.running) {
    stopMonitor();
    game.pauseTicks();
    report({
      running: false,
      summary:
        "Live match paused. Advance one tick, resume, or stop and replay.",
    });
  } else {
    report({ running: true, summary: "Live match resumed." });
    game.resumeTicks();
    monitorMatch();
    target("live-arena").focus();
  }
}
function advanceMatch() {
  game.resumeTicks();
  game.advanceTicks(TICK_DURATION);
  game.pauseTicks();
  game.flush();
  if (game.state.finished || game.recording.status === "limit-reached")
    stopAndExport();
}
function stopAndExport() {
  stopMonitor();
  game.pauseTicks();
  // Include already-admitted commands in one closing tick before exporting.
  if (game.ticks.queuedInputs) {
    game.resumeTicks();
    game.advanceTicks(TICK_DURATION);
    game.pauseTicks();
  }
  game.stopRecording();
  const exported = game.exportRecording(),
    log = readRecording(exported, { schemaVersion: schema.version });
  game.flush();
  report({
    running: false,
    captured: true,
    exported,
    summary: `Captured ${log.records.length} steps through tick ${game.state.tick}. Ready to replay${log.reason ? ` (${log.reason})` : ""}.`,
  });
}
/** @param {'playing'|'paused'} mode */
function presentReplay(mode) {
  if (!replay) return false;
  const status = replay.status;
  const playback =
    status.status === "complete" || status.status === "diverged"
      ? status.status
      : mode;
  replay.app.flush();
  report({
    playback,
    summary: `Replay ${playback}: ${status.position}/${status.total} steps · ${status.divergence?.reason ?? "all hashes matched"}.`,
  });
  return playback === "playing";
}
function playNext() {
  // Wall-clock pacing changes presentation only, never recorded simulation time.
  replayTimer = setTimeout(() => {
    replayTimer = null;
    if (!replay) return;
    replay.step();
    if (presentReplay("playing")) playNext();
  }, ui.state.speed);
}
function startReplay() {
  releaseReplay();
  replay = makeReplay(ui.state.exported);
  replay.app.mount(target("replay-host"));
  if (presentReplay("playing")) playNext();
}
function pauseReplay() {
  if (!replay) return;
  if (ui.state.playback === "playing") {
    cancelPlayback();
    presentReplay("paused");
  } else if (ui.state.playback === "paused" && presentReplay("playing"))
    playNext();
}
function stepReplay() {
  if (!replay) return;
  cancelPlayback();
  replay.step();
  presentReplay("paused");
}
/** @param {number} dx @param {number} dy */
function nudge(dx, dy) {
  game.enqueue("nudge", { id: 1, dx, dy });
}
export const ui = createApp({
  schema: uiSchema,
  initialState: {
    running: false,
    captured: false,
    playback: /** @type {Playback} */ ("idle"),
    summary:
      "Start a match to record four players moving, collecting coins, dashing and emoting.",
    exported: "",
    speed: 300,
  },
  view: ({ bind, derive, onDispose }) => {
    onDispose(() => {
      stopMonitor();
      releaseReplay();
      game.dispose();
    });
    const unavailable = derive(
      (state) =>
        state.captured || (!state.running && game.recording.status === "off"),
    );
    const noPlayback = derive(
      (state) => state.playback !== "playing" && state.playback !== "paused",
    );
    return div(
      { class: "page" },
      element(
        "header",
        { class: "topbar" },
        span({ class: "brand" }, "REL3C / PLAYGROUND"),
        span("GAME REPLAY · 01"),
      ),
      section(
        { class: "intro" },
        p({ class: "eyebrow" }, "ONE MATCH. EVERY MOMENT."),
        element("h1", "Play it. Replay it."),
        p(
          "You + three simulated players. Collect coins, dash across the arena, and leave a message. Then watch the same match unfold again, one recorded tick at a time.",
        ),
      ),
      div(
        { class: "control-strip" },
        button(
          {
            id: "start-match",
            class: "primary",
            type: "button",
            onClick: startMatch,
          },
          "Start new match",
        ),
        button(
          {
            id: "pause-match",
            type: "button",
            disabled: unavailable,
            onClick: pauseMatch,
          },
          derive((state) => (state.running ? "Pause live" : "Resume live")),
        ),
        button(
          {
            id: "advance-match",
            type: "button",
            disabled: derive(
              (state) =>
                state.running ||
                state.captured ||
                game.recording.status === "off",
            ),
            onClick: advanceMatch,
          },
          "Advance one tick",
        ),
        button(
          {
            id: "stop-match",
            type: "button",
            disabled: unavailable,
            onClick: stopAndExport,
          },
          "Stop & capture",
        ),
        span({ class: "hint" }, "12-second match · 10 ticks/s · 4 players"),
      ),
      div(
        { class: "boards" },
        section(
          { class: "arena-card" },
          div(
            { class: "card-header" },
            element("h2", "The live match"),
            span(
              { class: "badge" },
              derive((state) =>
                state.captured
                  ? "CAPTURED"
                  : state.running
                    ? "RECORDING"
                    : "PAUSED",
              ),
            ),
          ),
          div({ id: "live-host" }),
        ),
        section(
          { class: "arena-card" },
          div(
            { class: "card-header" },
            element("h2", "The recorded match"),
            span(
              { class: "badge replay-badge" },
              derive((state) => state.playback.toUpperCase()),
            ),
          ),
          div(
            {
              class: "replay-placeholder",
              hidden: derive((state) => state.playback !== "idle"),
            },
            element("strong", "The same moves. The same outcome."),
            p(
              "Capture a match, then replay it here. Positions, scores, coin spawns and messages are verified at every recorded step.",
            ),
          ),
          div({ id: "replay-host" }),
        ),
      ),
      div(
        { class: "movement" },
        span("Move:"),
        button(
          {
            id: "move-left",
            disabled: derive((state) => !state.running),
            onClick: () => nudge(-1, 0),
            "aria-label": "Move left",
          },
          "←",
        ),
        button(
          {
            id: "move-up",
            disabled: derive((state) => !state.running),
            onClick: () => nudge(0, -1),
            "aria-label": "Move up",
          },
          "↑",
        ),
        button(
          {
            id: "move-down",
            disabled: derive((state) => !state.running),
            onClick: () => nudge(0, 1),
            "aria-label": "Move down",
          },
          "↓",
        ),
        button(
          {
            id: "move-right",
            disabled: derive((state) => !state.running),
            onClick: () => nudge(1, 0),
            "aria-label": "Move right",
          },
          "→",
        ),
        button(
          {
            id: "dash",
            disabled: derive((state) => !state.running),
            onClick: () => {
              game.enqueue("dash", 1);
            },
          },
          "Dash / Space",
        ),
        button(
          {
            id: "emote",
            disabled: derive((state) => !state.running),
            onClick: () => {
              game.enqueue("emote", 1);
            },
          },
          "Emote / E",
        ),
        span("Or focus the arena: WASD / arrow keys."),
      ),
      div(
        { class: "replay-controls" },
        button(
          {
            id: "replay-match",
            class: "primary",
            disabled: derive((state) => !state.captured),
            onClick: startReplay,
          },
          "Replay match",
        ),
        button(
          {
            id: "pause-game-replay",
            disabled: noPlayback,
            onClick: pauseReplay,
          },
          derive((state) =>
            state.playback === "playing" ? "Pause replay" : "Resume replay",
          ),
        ),
        button(
          { id: "step-game-replay", disabled: noPlayback, onClick: stepReplay },
          "Step once",
        ),
        label({ for: "replay-speed" }, "Playback"),
        select(
          {
            id: "replay-speed",
            value: derive((state) => String(state.speed)),
            on: {
              change: (event) => {
                if (!(event.currentTarget instanceof HTMLSelectElement)) return;
                report({ speed: Number(event.currentTarget.value) });
                if (ui.state.playback === "playing") {
                  cancelPlayback();
                  playNext();
                }
              },
            },
          },
          option({ value: "300" }, "Slow · ⅓×"),
          option({ value: "100" }, "Normal · 1×"),
          option({ value: "50" }, "Fast · 2×"),
        ),
      ),
      p({ id: "game-summary", class: "status", role: "status" }, bind.summary),
      section(
        { class: "notes" },
        p(
          "The simulation records commands and seeded state transitions. Replay rebuilds the world from its starting snapshot and checks every step.",
        ),
        p(
          "Iris, Kai and Milo are local simulations. Real multiplayer would deliver ordered server commands through the same input boundary.",
        ),
        element(
          "details",
          element("summary", "Inspect the captured JSON"),
          label({ for: "game-recording" }, "Match recording"),
          textarea({
            id: "game-recording",
            readOnly: true,
            value: bind.exported,
          }),
        ),
      ),
    );
  },
});
ui.mount();
game.mount(target("live-host"));
