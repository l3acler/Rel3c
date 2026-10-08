import {
  createApp,
  createActionSchema,
  element,
  div,
  span,
  button,
  input,
  label,
  ul,
  li,
} from "../../src/index.js";

/** @typedef {{ id: number, title: string, completed: boolean }} Todo */
/** @typedef {{ nextId: number, todos: Todo[] }} Board */
/** @typedef {{ board: Board, newTitle: string, editingId: number | null, editTitle: string }} State */

/** @param {unknown} value @returns {value is number} */
const idInput = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
/** @param {unknown} value @returns {value is string} */
const textInput = (value) => typeof value === "string";
/** @param {unknown} value @returns {value is { id: number, title: string }} */
const editInput = (value) =>
  value !== null &&
  typeof value === "object" &&
  'id' in value && 'title' in value &&
  idInput(value.id) &&
  textInput(value.title);

/** @param {unknown} value @returns {value is Board} */
export function isBoard(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !('nextId' in value) || !('todos' in value) ||
    !idInput(value.nextId) ||
    !Array.isArray(value.todos)
  )
    return false;
  const ids = new Set();
  for (const todo of value.todos) {
    if (
      !todo ||
      typeof todo !== "object" ||
      !idInput(todo.id) ||
      todo.id >= value.nextId ||
      !textInput(todo.title) ||
      !todo.title.trim() ||
      typeof todo.completed !== "boolean" ||
      ids.has(todo.id)
    )
      return false;
    ids.add(todo.id);
  }
  return true;
}

/** @type {typeof createActionSchema<State>} */
const createSchema = createActionSchema;
export const schema = createSchema({ version: "todomvc-1" })(
  ({ action }) => ({
    typeNew: action(textInput, (draft, value) => {
      draft.newTitle = value;
    }),
    add: action(textInput, (draft, value) => {
      const title = value.trim();
      if (!title) return;
      if (draft.board.nextId === Number.MAX_SAFE_INTEGER)
        throw Error("Todo ID limit reached.");
      draft.board.todos.push({
        id: draft.board.nextId++,
        title,
        completed: false,
      });
      draft.newTitle = "";
    }),
    toggle: action(idInput, (draft, id) => {
      const todo = draft.board.todos.find((todo) => todo.id === id);
      if (todo) todo.completed = !todo.completed;
    }),
    toggleAll: action(
      /** @returns {value is boolean} */ (value) => typeof value === "boolean",
      (draft, completed) => {
        for (const todo of draft.board.todos) todo.completed = completed;
      },
    ),
    remove: action(idInput, (draft, id) => {
      draft.board.todos = draft.board.todos.filter((todo) => todo.id !== id);
      if (draft.editingId === id) {
        draft.editingId = null;
        draft.editTitle = "";
      }
    }),
    clearCompleted: action((draft) => {
      draft.board.todos = draft.board.todos.filter((todo) => !todo.completed);
      if (!draft.board.todos.some((todo) => todo.id === draft.editingId)) {
        draft.editingId = null;
        draft.editTitle = "";
      }
    }),
    beginEdit: action(idInput, (draft, id) => {
      const todo = draft.board.todos.find((todo) => todo.id === id);
      if (todo) {
        draft.editingId = id;
        draft.editTitle = todo.title;
      }
    }),
    typeEdit: action(editInput, (draft, value) => {
      if (draft.editingId === value.id) draft.editTitle = value.title;
    }),
    commitEdit: action(editInput, (draft, value) => {
      // Enter may be followed by blur: only the current session can commit.
      if (draft.editingId !== value.id) return;
      const todo = draft.board.todos.find((todo) => todo.id === value.id);
      const title = value.title.trim();
      if (todo && title) todo.title = title;
      else
        draft.board.todos = draft.board.todos.filter(
          (todo) => todo.id !== value.id,
        );
      draft.editingId = null;
      draft.editTitle = "";
    }),
    cancelEdit: action(idInput, (draft, id) => {
      if (draft.editingId === id) {
        draft.editingId = null;
        draft.editTitle = "";
      }
    }),
  }),
);

/** @typedef {typeof schema extends import('../../src/index.js').ActionSchema<State, infer D extends import('../../src/index.js').Definitions<State>> ? D : never} TodoActions */
/** @returns {import('../../src/index.js').AppInstance<State, TodoActions>} */
export function createTodoMVC() {
  const app = createApp({
    schema,
    initialState: {
      board: { nextId: 1, todos: [] },
      newTitle: "",
      editingId: null,
      editTitle: "",
    },
    persistence: {
      namespace: "todos-rel3c",
      version: "1",
      fields: { board: { location: "local", validate: isBoard } },
    },
    router: {
      mode: "hash",
      routes: ["/", "/active", "/completed"].map((path) => ({
        path,
        view: () => null,
      })),
      notFound: () => null,
    },
    view: (context) => {
      const { bind, derive, actions, keyed, when } = context;
      /** @param {import('../../src/index.js').DeepReadonly<State>} state */
      const activeCount = (state) =>
        state.board.todos.filter((todo) => !todo.completed).length;
      const visibleTodos = derive((state) =>
        state.board.todos.filter((todo) =>
          context.route?.path === "/active"
            ? !todo.completed
            : context.route?.path === "/completed"
              ? todo.completed
              : true,
        ),
      );
      /** @param {string} path @param {string} title */
      const filter = (path, title) =>
        li(
          element(
            "a",
            {
              href: "#" + path,
              class: { selected: derive(() => context.route?.path === path) },
            },
            title,
          ),
        );

      return [
        element(
          "header",
          { class: "header", "data-testid": "header" },
          element("h1", "todos"),
          input({
            class: "new-todo",
            type: "text",
            "data-testid": "text-input",
            "aria-label": "New Todo Input",
            placeholder: "What needs to be done?",
            autofocus: true,
            value: bind.newTitle,
            onText: (value) => actions.typeNew(value.value),
            onKey: (key, event) => {
              if (
                key.type === "keydown" &&
                key.key === "Enter" &&
                !key.isComposing &&
                !(event.nativeEvent instanceof KeyboardEvent && event.nativeEvent.keyCode === 229) &&
                event.currentTarget instanceof HTMLInputElement
              ) {
                event.preventDefault();
                actions.add(event.currentTarget.value);
              }
            },
          }),
        ),
        element(
          "main",
          {
            id: "main",
            class: "main",
            "data-testid": "main",
            hidden: derive((state) => state.board.todos.length === 0),
          },
          div(
            { class: "toggle-all-container" },
            input({
              id: "toggle-all",
              class: "toggle-all",
              type: "checkbox",
              "data-testid": "toggle-all",
              checked: derive(
                (state) =>
                  state.board.todos.length > 0 && activeCount(state) === 0,
              ),
              on: {
                change: (event) => {
                  if (event.currentTarget instanceof HTMLInputElement) actions.toggleAll(event.currentTarget.checked);
                },
              },
            }),
            label(
              { class: "toggle-all-label", htmlFor: "toggle-all" },
              "Toggle All Input",
            ),
          ),
          ul(
            { class: "todo-list", "data-testid": "todo-list" },
            keyed(
              visibleTodos,
              (todo) => todo.id,
              (row) =>
                li(
                  {
                    "data-id": row.key,
                    "data-testid": "todo-item",
                    class: {
                      completed: row.item.completed,
                      editing: row.derive(
                        (state) => state.editingId === row.key,
                      ),
                    },
                  },
                  div(
                    { class: "view" },
                    input({
                      class: "toggle",
                      type: "checkbox",
                      "data-testid": "todo-item-toggle",
                      "aria-label": row.derive(
                        () => `Complete ${row.value.title}`,
                      ),
                      checked: row.item.completed,
                      onClick: () => actions.toggle(row.key),
                    }),
                    label(
                      {
                        "data-testid": "todo-item-label",
                        on: {
                          dblclick: (event) => {
                            if (!(event.currentTarget instanceof Element)) return;
                            actions.beginEdit(row.key);
                            app.flush();
                            // Focus/selection are native presentation effects, outside the transaction.
                            const editor = event.currentTarget
                              .closest("li")
                              ?.querySelector(".edit");
                            if (!(editor instanceof HTMLInputElement)) return;
                            editor.focus();
                            editor.setSelectionRange(
                              editor.value.length,
                              editor.value.length,
                            );
                          },
                        },
                      },
                      row.item.title,
                    ),
                    button({
                      class: "destroy",
                      type: "button",
                      "data-testid": "todo-item-button",
                      "aria-label": "Delete todo",
                      onClick: () => actions.remove(row.key),
                    }),
                  ),
                  when(
                    row.derive((state) => state.editingId === row.key),
                    () =>
                      input({
                        class: "edit",
                        type: "text",
                        "data-testid": "text-input",
                        "aria-label": "Edit todo",
                        value: bind.editTitle,
                        onText: (value) =>
                          actions.typeEdit({ id: row.key, title: value.value }),
                        on: {
                          blur: (event) => {
                            if (event.currentTarget instanceof HTMLInputElement) actions.commitEdit({
                              id: row.key,
                              title: event.currentTarget.value,
                            });
                          },
                        },
                        onKey: (key, event) => {
                          if (
                            key.type !== "keydown" ||
                            key.isComposing ||
                            (event.nativeEvent instanceof KeyboardEvent && event.nativeEvent.keyCode === 229) ||
                            !(event.currentTarget instanceof HTMLInputElement)
                          )
                            return;
                          if (key.key === "Enter") {
                            event.preventDefault();
                            actions.commitEdit({
                              id: row.key,
                              title: event.currentTarget.value,
                            });
                          } else if (key.key === "Escape") {
                            event.preventDefault();
                            actions.cancelEdit(row.key);
                          }
                        },
                      }),
                  ),
                ),
            ),
          ),
        ),
        element(
          "footer",
          {
            id: "footer",
            class: "footer",
            "data-testid": "footer",
            hidden: derive((state) => state.board.todos.length === 0),
          },
          span(
            { class: "todo-count" },
            element("strong", derive(activeCount)),
            derive((state) =>
              activeCount(state) === 1 ? " item left" : " items left",
            ),
          ),
          ul(
            { class: "filters", "data-testid": "footer-navigation" },
            filter("/", "All"),
            filter("/active", "Active"),
            filter("/completed", "Completed"),
          ),
          button(
            {
              class: "clear-completed",
              type: "button",
              hidden: derive(
                (state) => !state.board.todos.some((todo) => todo.completed),
              ),
              onClick: actions.clearCompleted,
            },
            "Clear completed",
          ),
        ),
      ];
    },
  });
  return app;
}
