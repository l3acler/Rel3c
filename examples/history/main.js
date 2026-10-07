import {
  createApp,
  createActionSchema,
  createHistory,
  div,
  p,
  button,
} from "../../src/index.js";
/** @typedef {{n:number,draw:number,time:number}} SampleState */
/** @type {ReturnType<typeof createActionSchema<SampleState>>} */
const sampleBuild = createActionSchema({ version: "history-example/1" });
const sampleSchema = sampleBuild(({ action }) => ({
  sample: action((draft, services) => {
    draft.n++;
    draft.draw = services.random();
    draft.time = services.now();
  }),
}));
const source = createApp({
  schema: sampleSchema,
  initialState: { n: 0, draw: 0, time: 0 },
  controls: { seed: 7 },
});
source.startRecording({ keyframeInterval: 3, maxActions: 64, maxBytes: 64000 });
for (let i = 1; i <= 12; i++) {
  source.setLogicalTime(i * 1000);
  source.actions.sample();
}
const recording = source.exportRecording();
source.dispose();
export const history = createHistory({
  recording,
  schema: sampleSchema,
  reversible: ["sample"],
  view: ({ bind }) =>
    div(
      p("Selected samples: ", bind.n),
      p("Controlled draw: ", bind.draw),
      p("Logical microseconds: ", bind.time),
    ),
});
/** @typedef {{selected:number,status:string,canUndo:boolean,canRedo:boolean,branched:boolean,discarded:number}} ControlsState */
function selectedStatus() {
  const current = history.status;
  return {
    selected: current.sequence,
    status: current.status,
    canUndo: current.canUndo,
    canRedo: current.canRedo,
    branched: current.status === "branched",
    discarded: current.discardedRecords,
  };
}
/** @type {ReturnType<typeof createActionSchema<ControlsState>>} */
const controlsBuild = createActionSchema();
const controlsSchema = controlsBuild(({ action }) => ({
  show: action(
    /** @returns {value is ControlsState} */ (value) =>
      !!value &&
      typeof value === "object" &&
      "selected" in value &&
      typeof value.selected === "number" &&
      "status" in value &&
      typeof value.status === "string" &&
      "canUndo" in value &&
      typeof value.canUndo === "boolean" &&
      "canRedo" in value &&
      typeof value.canRedo === "boolean" &&
      "branched" in value &&
      typeof value.branched === "boolean" &&
      "discarded" in value &&
      typeof value.discarded === "number",
    (draft, value) => Object.assign(draft, value),
  ),
}));
/** @param {()=>unknown} operation */
function update(operation) {
  operation();
  history.app.flush();
  app.actions.show(selectedStatus());
}
function branch() {
  const next = history.branch(),
    target = document.getElementById("history-view");
  if (!target) throw Error("History view host is missing.");
  next.mount(target);
}
export const app = createApp({
  schema: controlsSchema,
  initialState: selectedStatus(),
  view: ({ bind, derive, onDispose }) => {
    onDispose(() => history.dispose());
    return div(
      p(
        "Status: ",
        bind.status,
        "; selected root: ",
        bind.selected,
        "; discarded future roots: ",
        bind.discarded,
      ),
      button(
        {
          id: "seek-end",
          disabled: bind.branched,
          onClick: () => update(() => history.seek(history.status.endSequence)),
        },
        "Seek captured end",
      ),
      button(
        {
          id: "seek-first",
          disabled: bind.branched,
          onClick: () =>
            update(() => history.seek(history.status.baselineSequence)),
        },
        "Seek retained baseline",
      ),
      button(
        {
          id: "undo",
          disabled: derive((state) => !state.canUndo),
          onClick: () => update(() => history.undo()),
        },
        "Undo root",
      ),
      button(
        {
          id: "redo",
          disabled: derive((state) => !state.canRedo),
          onClick: () => update(() => history.redo()),
        },
        "Redo root",
      ),
      button(
        {
          id: "branch",
          disabled: bind.branched,
          onClick: () => update(branch),
        },
        "Continue as new branch",
      ),
      button(
        {
          id: "branch-sample",
          disabled: derive((state) => !state.branched),
          onClick: () => update(() => history.app.actions.sample()),
        },
        "Sample on branch",
      ),
      div({ id: "history-view", "aria-live": "polite" }),
    );
  },
});
app.mount();
const target = document.getElementById("history-view");
if (!target) throw Error("History view host is missing.");
history.app.mount(target);
