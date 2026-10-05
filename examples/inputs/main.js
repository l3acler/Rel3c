import {
  createApp,
  createActionSchema,
  div,
  form,
  label,
  input,
  textarea,
  button,
  span,
  p,
} from "../../src/index.js";

/** @typedef {import('../../src/index.js').TextInput} TextInput */
/** @typedef {import('../../src/index.js').KeyboardInput} KeyboardInput */
/** @typedef {{name: string, notes: string, saved: string, saves: number, composing: boolean,
 * key: string, held: string[], scrollTop: number}} State */
/** @type {typeof createActionSchema<State>} */
const createInputSchema = createActionSchema;
const schema = createInputSchema({ version: "inputs-1" })(({ action }) => ({
  name: action(
    /** @returns {value is TextInput} */ (value) =>
      !!value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "text" &&
      "value" in value &&
      typeof value.value === "string" &&
      "isComposing" in value &&
      typeof value.isComposing === "boolean",
    (draft, value) => {
      draft.name = value.value;
      draft.composing = value.isComposing;
    },
  ),
  notes: action(
    /** @returns {value is string} */ (value) => typeof value === "string",
    (draft, value) => {
      draft.notes = value;
    },
  ),
  key: action(
    /** @returns {value is KeyboardInput} */ (value) =>
      !!value &&
      typeof value === "object" &&
      "type" in value &&
      ["keydown", "keyup", "reset"].includes(String(value.type)) &&
      "held" in value &&
      Array.isArray(value.held),
    (draft, value) => {
      draft.key =
        value.type === "reset"
          ? `Reset: ${value.reason}`
          : `${value.type}: ${value.key}${value.repeat ? " (repeat)" : ""}`;
      draft.held = value.held.map((key) => key.code || key.key);
    },
  ),
  save: action((draft) => {
    draft.saved = draft.name;
    draft.saves++;
  }),
  scroll: action(
    /** @returns {value is number} */ (value) =>
      typeof value === "number" && Number.isFinite(value),
    (draft, value) => {
      draft.scrollTop = value;
    },
  ),
}));

export const app = createApp({
  initialState: /** @type {State} */ ({
    name: "",
    notes: "",
    saved: "",
    saves: 0,
    composing: false,
    key: "",
    held: [],
    scrollTop: 0,
  }),
  schema,
  view: ({ actions, bind, derive }) =>
    div(
      form(
        {
          on: {
            submit: (event) => {
              event.preventDefault();
              actions.save();
            },
          },
        },
        label({ for: "input-name" }, "Name"),
        input({
          id: "input-name",
          name: "name",
          type: "text",
          value: bind.name,
          onText: (value) => actions.name(value),
          onKey: (value, event) => {
            actions.key(value);
            if (
              value.type === "keydown" &&
              value.ctrlKey &&
              value.key === "Enter" &&
              !value.repeat &&
              !value.isComposing
            ) {
              event.preventDefault();
              actions.save();
            }
          },
        }),
        label({ for: "input-notes" }, "Notes"),
        textarea({
          id: "input-notes",
          name: "notes",
          value: bind.notes,
          onText: (value) => actions.notes(value.value),
        }),
        button({ id: "input-save", type: "submit" }, "Save"),
      ),
      p(
        "Current name: ",
        span({ id: "input-current" }, bind.name),
        " ",
        derive((state) => (state.composing ? "(composing)" : "(accepted)")),
      ),
      p(
        "Saved: ",
        span({ id: "input-saved" }, bind.saved),
        " • Saves: ",
        span({ id: "input-saves" }, bind.saves),
      ),
      p(
        { id: "input-key" },
        bind.key,
        " • Held: ",
        derive((state) => state.held.join(", ")),
      ),
      div(
        {
          id: "input-scroll",
          tabIndex: 0,
          role: "region",
          "aria-label": "Scrollable event example",
          style: {
            height: "100px",
            overflow: "auto",
            border: "1px solid #aaa",
          },
          on: {
            scroll: {
              passive: true,
              handler: (event) =>
                actions.scroll(
                  /** @type {HTMLElement} */ (event.currentTarget).scrollTop,
                ),
            },
          },
        },
        div(
          { style: { height: "400px", padding: "1rem" } },
          "Scroll this area using the keyboard, wheel or touch.",
        ),
      ),
      p("Scroll top: ", span({ id: "input-scroll-top" }, bind.scrollTop)),
    ),
});
app.mount();
