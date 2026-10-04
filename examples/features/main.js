// Every view and state change uses public exports. Native GET forms provide
// controls while framework event handlers are still a future feature.
import {
  createApp,
  createActionSchema,
  element,
  div,
  span,
  p,
  form,
  label,
  input,
  select,
  option,
  button,
  section,
  a,
} from "../../src/index.js";

const initialState = {
  project: { title: "Orbit launch", owner: "Ada", completed: 3, total: 8 },
  accent: "teal",
  showDetails: true,
  scenario: "normal",
  message: "Ready. Change the settings and apply a new scenario.",
};
const colors = { teal: "#13786b", blue: "#315dc4", orange: "#b05b28" };
const schema = createActionSchema({ version: "launch-board/1" })(
  ({ action }) => ({
    configure: action(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        typeof value.title === "string" &&
        value.title.length > 0 &&
        value.title.length <= 80 &&
        typeof value.owner === "string" &&
        value.owner.length > 0 &&
        value.owner.length <= 40 &&
        Number.isInteger(value.completed) &&
        Number.isInteger(value.total) &&
        value.total >= 1 &&
        value.total <= 100 &&
        value.completed >= 0 &&
        value.completed <= value.total &&
        Object.hasOwn(colors, value.accent) &&
        typeof value.showDetails === "boolean" &&
        ["normal", "burst", "rollback"].includes(value.scenario),
      (draft, value) => {
        draft.project = {
          title: value.title,
          owner: value.owner,
          completed: value.completed,
          total: value.total,
        };
        draft.accent = value.accent;
        draft.showDetails = value.showDetails;
        draft.scenario = value.scenario;
      },
    ),
    advance: action((draft) => {
      draft.project.completed = Math.min(
        draft.project.completed + 1,
        draft.project.total,
      );
    }),
    burst: action((draft) => {
      draft.message = "Three queued progress actions share one render frame.";
      app.actions.advance();
      app.actions.advance();
      app.actions.advance();
    }),
    toggleDetails: action((draft) => {
      draft.showDetails = !draft.showDetails;
    }),
    fail: action((draft) => {
      draft.project.completed = draft.project.total;
      throw new Error("Intentional rollback example");
    }),
    reportRollback: action((draft) => {
      draft.message =
        "The failed action published no state version. Progress stayed unchanged.";
    }),
  }),
);

export const app = createApp({
  initialState,
  schema,
  view({ bind, computed, derive, when, observe, onDispose }) {
    const progress = computed((state) =>
      Math.round((state.project.completed / state.project.total) * 100),
    );
    const remaining = computed(
      (state) => state.project.total - state.project.completed,
    );
    const complete = computed(() => remaining.value === 0);
    // This scope owns both the computed values and observer; disposal removes them.
    let observer;
    observer = observe(
      (state) => state.project.completed,
      () => {
        console.info("[Launch Board] Committed progress:", observer.read());
      },
    );
    onDispose(() => console.info("[Launch Board] View disposed."));

    const field = (name, title, props) =>
      div(
        { class: "field" },
        label({ htmlFor: name }, title),
        input({ id: name, name, ...props }),
      );
    return element(
      "main",
      {
        class: "board",
        style: { "--accent": derive((state) => colors[state.accent]) },
      },
      element(
        "header",
        { class: "masthead" },
        a({ class: "wordmark", href: "./" }, "mini / framework"),
        span({ class: "version-label" }, "CURRENT FEATURES · A.1–A.7"),
      ),
      section(
        { class: "intro" },
        p({ class: "eyebrow" }, "A SMALL APPLICATION, BUILT FROM SCRATCH"),
        element(
          "h1",
          "Your next launch,",
          element("br"),
          element("em", "in view."),
        ),
        p(
          { class: "intro-copy" },
          "A working example of owned state, computed values and precise DOM updates.",
        ),
      ),
      div(
        { class: "workspace" },
        section(
          { class: "preview", "aria-label": "Live project preview" },
          div(
            { class: "preview-topline" },
            span({ class: "eyebrow" }, "PROJECT OVERVIEW"),
            span(
              {
                id: "status",
                class: { pill: true, complete: derive(() => complete.value) },
              },
              derive(() =>
                complete.value ? "Ready to launch" : "In progress",
              ),
            ),
          ),
          element("h2", { id: "project-title" }, bind.project.title),
          p(
            { class: "owner" },
            "Led by ",
            span({ id: "project-owner" }, bind.project.owner),
          ),
          div(
            { class: "progress-heading" },
            p("Launch readiness"),
            span(
              { id: "progress", class: "percentage" },
              derive(() => `${progress.value}%`),
            ),
          ),
          div(
            {
              class: "track",
              role: "progressbar",
              "aria-label": "Launch readiness",
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": derive(() => progress.value),
            },
            div({
              id: "progress-fill",
              class: "fill",
              style: { width: derive(() => `${progress.value}%`) },
            }),
          ),
          div(
            { class: "metrics" },
            div(
              p(
                { class: "metric-number", id: "completed-count" },
                bind.project.completed,
              ),
              p({ class: "metric-label" }, "steps complete"),
            ),
            div(
              p(
                { class: "metric-number", id: "remaining-count" },
                derive(() => remaining.value),
              ),
              p({ class: "metric-label" }, "steps remaining"),
            ),
          ),
          when(
            bind.showDetails,
            ({ onDispose }) => {
              onDispose(() =>
                console.info("[Launch Board] Details scope removed."),
              );
              return section(
                { id: "details", class: "details" },
                span({ class: "eyebrow" }, "HOW THIS VIEW WORKS"),
                p(
                  "The title reads ",
                  element("code", "bind.project.title"),
                  ". The percentage is a lazy computed value. ",
                  "Progress changes leave the title and owner nodes in place.",
                ),
              );
            },
            () => p({ class: "details-hidden" }, "Project details are hidden."),
          ),
          when(
            derive(() => complete.value),
            () =>
              p(
                { id: "completion", class: "completion" },
                "All steps complete. You’re ready.",
              ),
          ),
          p(
            {
              id: "scenario-message",
              class: "scenario-message",
              "aria-live": "polite",
            },
            bind.message,
          ),
        ),
        section(
          { class: "settings", "aria-labelledby": "settings-title" },
          p({ class: "eyebrow" }, "MAKE IT YOURS"),
          element("h2", { id: "settings-title" }, "Try a scenario"),
          p(
            { class: "settings-copy" },
            "Change the values, then apply them to a fresh board.",
          ),
          form(
            { id: "settings-form", action: "./", method: "get" },
            field("title", "Project name", {
              value: bind.project.title,
              required: true,
              maxLength: 80,
            }),
            field("owner", "Project lead", {
              value: bind.project.owner,
              required: true,
              maxLength: 40,
            }),
            div(
              { class: "field-row" },
              field("completed", "Complete", {
                type: "number",
                value: bind.project.completed,
                min: 0,
                max: bind.project.total,
                required: true,
              }),
              field("total", "Total steps", {
                type: "number",
                value: bind.project.total,
                min: 1,
                max: 100,
                required: true,
              }),
            ),
            div(
              { class: "field" },
              label({ htmlFor: "accent" }, "Accent color"),
              select(
                { id: "accent", name: "accent", value: bind.accent },
                option({ value: "teal" }, "Forest teal"),
                option({ value: "blue" }, "Ocean blue"),
                option({ value: "orange" }, "Burnt orange"),
              ),
            ),
            div(
              { class: "field" },
              label({ htmlFor: "scenario" }, "State scenario"),
              select(
                { id: "scenario", name: "scenario", value: bind.scenario },
                option({ value: "normal" }, "Use these values"),
                option({ value: "burst" }, "Advance three steps in one frame"),
                option({ value: "rollback" }, "Try a failing action"),
              ),
            ),
            label(
              { class: "checkbox", htmlFor: "showDetails" },
              input({
                id: "showDetails",
                type: "checkbox",
                name: "showDetails",
                value: "1",
                checked: bind.showDetails,
              }),
              "Show project details",
            ),
            button(
              { class: "apply", type: "submit" },
              "Apply scenario ",
              span({ "aria-hidden": true }, "↗"),
            ),
            a(
              { class: "reset-link", href: "./" },
              "Reset to the original board",
            ),
          ),
          p(
            { class: "native-note" },
            "These controls use a native GET form and reload the page. Live input handlers are a future framework feature.",
          ),
        ),
      ),
      element(
        "footer",
        { class: "footer" },
        p("Vanilla JavaScript. Public imports. Zero runtime dependencies."),
        a({ href: "../../DOCUMENTATION.md" }, "Read the framework guide ↗"),
      ),
      element(
        "details",
        { class: "console-guide" },
        element("summary", "Try live state updates in your browser console"),
        p(
          "Import the example, then run public actions. State commits immediately; bound DOM updates next frame.",
        ),
        element(
          "pre",
          element(
            "code",
            "const { app, runRollback } = await import('/examples/features/main.js');\napp.actions.advance();\napp.actions.burst();\napp.actions.toggleDetails();\napp.flush(); // optional immediate DOM update\nrunRollback();\n// app.dispose(); // removes the view and cancels pending work",
          ),
        ),
      ),
    );
  },
});

// Browser values are read outside actions, normalized, and admitted as owned data.
// This is example startup configuration, not a router or recording/input adapter.
const params = new URLSearchParams(globalThis.location.search);
const integer = (name, fallback, min, max) => {
  fallback = Math.min(max, Math.max(min, fallback));
  const raw = params.get(name);
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const number = Number(raw);
  return Number.isSafeInteger(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
};
const total = integer("total", 8, 1, 100);
const configured = params.has("title");
app.actions.configure({
  title: params.get("title")?.trim().slice(0, 80) || "Orbit launch",
  owner: params.get("owner")?.trim().slice(0, 40) || "Ada",
  completed: integer("completed", 3, 0, total),
  total,
  accent: Object.hasOwn(colors, params.get("accent"))
    ? params.get("accent")
    : "teal",
  showDetails: configured ? params.get("showDetails") === "1" : true,
  scenario: ["normal", "burst", "rollback"].includes(params.get("scenario"))
    ? params.get("scenario")
    : "normal",
});

export function runRollback() {
  const before = app.state,
    version = app.stateVersion;
  try {
    app.actions.fail();
  } catch (error) {
    if (error.message !== "Intentional rollback example") throw error;
    if (app.state !== before || app.stateVersion !== version)
      throw Error("Rollback did not preserve state.");
  }
  app.actions.reportRollback(); // Separate successful action reports the failed attempt.
}
app.mount();
if (app.state.scenario === "burst") app.actions.burst();
if (app.state.scenario === "rollback") runRollback();
// The browser frame scheduler applies pending bindings; no manual DOM writes.
