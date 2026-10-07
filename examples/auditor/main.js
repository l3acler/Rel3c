import {
  createApp,
  createActionSchema,
  div,
  p,
  span,
  button,
  form,
  label,
  input,
  ul,
  li,
} from "../../src/index.js";

/** @typedef {{ nextId: number, rows: { id: number, title: string, done: boolean }[] }} Board */
/** @typedef {{ board: Board, draft: string, scroll: number, key: string }} State */
/** @type {typeof createActionSchema<State>} */
const createSchema = createActionSchema;
const schema = createSchema({ version: "walkthrough-1" })(({ action }) => ({
  edit: action(
    /** @returns {value is string} */ (value) => typeof value === "string",
    (draft, value) => {
      draft.draft = value;
    },
  ),
  save: action((draft) => {
    const title = draft.draft.trim();
    if (!title) return;
    draft.board.rows.push({ id: draft.board.nextId++, title, done: false });
    draft.draft = "";
    app.navigate("/"); // Applied after this action commits; discarded if it throws.
  }),
  toggle: action(
    /** @returns {value is number} */ (value) => Number.isSafeInteger(value),
    (draft, id) => {
      const row = draft.board.rows.find((row) => row.id === id);
      if (row) row.done = !row.done;
    },
  ),
  reverse: action((draft) => {
    draft.board.rows.reverse();
  }),
  scrolled: action(
    /** @returns {value is number} */ (value) =>
      typeof value === "number" && Number.isFinite(value),
    (draft, value) => {
      draft.scroll = value;
    },
  ),
  key: action(
    /** @returns {value is string} */ (value) => typeof value === "string",
    (draft, value) => {
      draft.key = value;
    },
  ),
}));

/** @param {unknown} value @returns {value is Board} */
function isBoard(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !("nextId" in value) ||
    !("rows" in value) ||
    typeof value.nextId !== "number" ||
    !Number.isSafeInteger(value.nextId) ||
    value.nextId < 1 ||
    !Array.isArray(value.rows)
  )
    return false;
  const ids = new Set(),
    nextId = value.nextId;
  return value.rows.every((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      !Number.isSafeInteger(row.id) ||
      row.id < 1 ||
      row.id >= nextId ||
      typeof row.title !== "string" ||
      typeof row.done !== "boolean" ||
      ids.has(row.id)
    )
      return false;
    ids.add(row.id);
    return true;
  });
}

export const app = createApp({
  initialState: {
    board: {
      nextId: 3,
      rows: [
        { id: 1, title: "Read the guide", done: false },
        { id: 2, title: "Try a native form", done: false },
      ],
    },
    draft: "",
    scroll: 0,
    key: "",
  },
  schema,
  persistence: {
    namespace: "walkthrough",
    version: "1",
    fields: {
      board: { location: "local", validate: isBoard },
      draft: {
        location: "session",
        validate: (value) => typeof value === "string",
      },
    },
  },
  onError: (error, { phase }) => console.error(phase, error),
  router: {
    mode: "hash",
    routes: [
      {
        path: "/",
        view: ({ bind, keyed, actions, link }) =>
          div(
            { id: "tasks" },
            p(link("/new", { id: "new-task" }, "Add a task")),
            button(
              { id: "reverse", type: "button", onClick: actions.reverse },
              "Reverse order",
            ),
            ul(
              { id: "task-list" },
              keyed(
                bind.board.rows,
                (row) => row.id,
                (context) =>
                  li(
                    { "data-id": context.key },
                    span(
                      { class: { complete: context.item.done } },
                      context.item.title,
                    ),
                    " ",
                    button(
                      {
                        type: "button",
                        "aria-pressed": context.item.done,
                        onClick: () => actions.toggle(context.key),
                      },
                      "Toggle complete",
                    ),
                  ),
              ),
            ),
          ),
      },
      {
        path: "/new",
        view: ({ bind, actions, link }) =>
          div(
            { id: "editor" },
            form(
              {
                id: "task-form",
                on: {
                  submit: (event) => {
                    event.preventDefault();
                    actions.save();
                  },
                },
              },
              label({ htmlFor: "title" }, "Task title"),
              input({
                id: "title",
                name: "title",
                required: true,
                value: bind.draft,
                onText: (value) => actions.edit(value.value),
                onKey: (value, event) => {
                  if (
                    value.type === "keydown" &&
                    value.key === "Escape" &&
                    !value.isComposing
                  ) {
                    event.preventDefault();
                    actions.edit("");
                    actions.key("Escape");
                  }
                },
              }),
              button({ id: "save", type: "submit" }, "Save and return"),
            ),
            p(link("/", { id: "cancel" }, "Cancel")),
          ),
      },
    ],
    notFound: ({ link }) => p("Page not found. ", link("/", "Home")),
  },
  view: ({ bind, derive, outlet, link, actions }) =>
    div(
      { id: "board", class: "task-board", "data-example": "public-api" },
      p(link("/", { id: "home" }, "Tasks"), " · ", link("/new", "New task")),
      p(
        "Tasks: ",
        span(
          { id: "total" },
          derive((state) => state.board.rows.length),
        ),
      ),
      outlet(),
      div(
        {
          id: "scroll-area",
          tabIndex: 0,
          role: "region",
          "aria-label": "Scroll example",
          style: { height: "80px", overflow: "auto" },
          on: {
            scroll: {
              passive: true,
              handler: (event) => {
                if (event.currentTarget instanceof HTMLElement)
                  actions.scrolled(event.currentTarget.scrollTop);
              },
            },
          },
        },
        div(
          { style: { height: "240px" } },
          "Scroll with the keyboard or pointer.",
        ),
      ),
      p(
        { role: "status" },
        "Scroll: ",
        span({ id: "scroll-position" }, bind.scroll),
        " · Last handled key: ",
        span({ id: "last-key" }, bind.key),
      ),
    ),
});
app.mount();
