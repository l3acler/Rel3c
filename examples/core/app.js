// The complete Phase A example consumes only the public framework entry point.
import {
  createActionSchema,
  div,
  element,
  button,
  span,
  input,
  ul,
  li,
} from "../../src/index.js";

/** @typedef {{ count: number, unrelated: { text: string }, profile: { name: string }, details: { text: string }, showDetails: boolean, nextId: number, items: { id: number, name: string }[] }} CoreState */
/** @type {typeof createActionSchema<CoreState>} */
const createCoreSchema = createActionSchema;
export const ROLLBACK_MESSAGE = "Intentional core rollback";
const schema = createCoreSchema({ version: "core-example/1" })(
  ({ action }) => ({
    increment: action((draft) => {
      draft.count++;
    }),
    rename: action((draft) => {
      draft.profile.name = draft.profile.name === "Ada" ? "Grace" : "Ada";
    }),
    changeDetails: action((draft) => {
      draft.details.text = "Updated details";
    }),
    toggleDetails: action((draft) => {
      draft.showDetails = !draft.showDetails;
    }),
    reverse: action((draft) => {
      draft.items.reverse();
    }),
    add: action((draft) => {
      const id = draft.nextId++;
      draft.items.push({ id, name: `Item ${id}` });
    }),
    renameItem: action(
      (value) => typeof value === "number",
      (draft, id) => {
        const item = draft.items.find((item) => item.id === id);
        if (item) item.name += "!";
      },
    ),
    removeItem: action(
      (value) => typeof value === "number",
      (draft, id) => {
        draft.items = draft.items.filter((item) => item.id !== id);
      },
    ),
    fail: action((draft) => {
      draft.count++;
      draft.profile.name =
        draft.unrelated.text =
        draft.details.text =
          "Discarded";
      draft.showDetails = !draft.showDetails;
      draft.items.reverse();
      if (draft.items[0]) draft.items[0].name = "Discarded";
      draft.items.push({ id: draft.nextId++, name: "Discarded" });
      throw new Error(ROLLBACK_MESSAGE);
    }),
  }),
);

/** @typedef {typeof schema extends import('../../src/index.js').ActionSchema<CoreState, infer D extends import('../../src/index.js').Definitions<CoreState>> ? D : never} CoreActions */
/** @param {import('../../src/index.js').ViewContext<CoreState, CoreActions>} context */
export function coreView(context) {
  const { actions, derive, when, keyed } = context;
  return element(
    "main",
    { id: "core-example" },
    element("h1", "A small, complete core"),
    element(
      "p",
      "Change one value at a time. The counter, nested name, details and list have independent bindings.",
    ),
    div(
      { class: "controls" },
      button(
        { id: "core-increment", type: "button", onClick: actions.increment },
        span("Increment"),
      ),
      button(
        { id: "core-rename", type: "button", onClick: actions.rename },
        "Change nested name",
      ),
      button(
        { id: "core-toggle", type: "button", onClick: actions.toggleDetails },
        "Show / hide details",
      ),
      button(
        { id: "core-reverse", type: "button", onClick: actions.reverse },
        "Reverse list",
      ),
      button(
        { id: "core-add", type: "button", onClick: actions.add },
        "Add item",
      ),
      button(
        { id: "core-fail", type: "button", onClick: actions.fail },
        "Try rollback",
      ),
    ),
    element(
      "p",
      "Counter: ",
      span(
        { id: "core-count" },
        derive(function count(state) {
          return state.count;
        }),
      ),
    ),
    element(
      "p",
      "Independent value: ",
      span(
        { id: "core-unrelated" },
        derive(function unrelated(state) {
          return state.unrelated.text;
        }),
      ),
    ),
    element(
      "p",
      "Nested name: ",
      span(
        { id: "core-name" },
        derive(function profileName(state) {
          return state.profile.name;
        }),
      ),
    ),
    when(
      derive(function visible(state) {
        return state.showDetails;
      }),
      (child) =>
        element(
          "section",
          { id: "core-details" },
          span(
            { id: "core-details-text" },
            child.derive(function detailsText(state) {
              return state.details.text;
            }),
          ),
          button(
            {
              id: "core-details-change",
              type: "button",
              onClick: actions.changeDetails,
            },
            "Change details",
          ),
        ),
    ),
    ul(
      { id: "core-items" },
      keyed(
        derive(function items(state) {
          return state.items;
        }),
        (item) => item.id,
        (row) =>
          li(
            { "data-key": row.key },
            span(
              { id: `core-position-${row.key}` },
              row.derive(function position() {
                return row.position + 1;
              }),
            ),
            span(
              { id: `core-item-${row.key}` },
              row.derive(function itemName() {
                return row.value.name;
              }),
            ),
            input({
              id: `core-input-${row.key}`,
              "aria-label": `Local edit for item ${row.key}`,
              value: row.derive(function editValue() {
                return row.value.name;
              }),
            }),
            button(
              {
                id: `core-rename-${row.key}`,
                type: "button",
                onClick: () => actions.renameItem(row.key),
              },
              "Rename",
            ),
            button(
              {
                id: `core-remove-${row.key}`,
                type: "button",
                onClick: () => actions.removeItem(row.key),
              },
              "Remove",
            ),
          ),
      ),
    ),
    element(
      "p",
      "Try rollback attempts changes to every section, then throws. The committed state and this page stay unchanged.",
    ),
    element(
      "p",
      "Text edits remain local to the native input. Reorder preserves them; changing that item’s bound name replaces its input value. Input-to-state synchronization follows in Phase B.",
    ),
  );
}

/** Fresh application state for each example instance. */
export function coreConfig() {
  return {
    initialState: {
      count: 0,
      unrelated: { text: "Independent" },
      profile: { name: "Ada" },
      details: { text: "Visible details" },
      showDetails: true,
      nextId: 3,
      items: [
        { id: 1, name: "First item" },
        { id: 2, name: "Second item" },
      ],
    },
    schema,
    view: coreView,
  };
}
