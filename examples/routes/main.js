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
  outlet,
} from "../../src/index.js";

/** @typedef {{ count: number, name: string, saved: string, notice: string }} State */
/** @type {typeof createActionSchema<State>} */
const createSchema = createActionSchema;
const schema = createSchema({ version: "routes-1" })(({ action }) => ({
  increment: action((draft) => {
    draft.count++;
  }),
  rename: action(
    /** @returns {value is string} */ (value) => typeof value === "string",
    (draft, value) => {
      draft.name = value;
    },
  ),
  save: action((draft) => {
    draft.saved = draft.name;
    app.navigate("/");
  }),
  rollback: action((draft) => {
    draft.count++;
    app.navigate("/people/failed");
    throw Error("Discard this navigation");
  }),
  notice: action(
    /** @returns {value is string} */ (value) => typeof value === "string",
    (draft, value) => {
      draft.notice = value;
    },
  ),
}));

export const app = createApp({
  initialState: { count: 0, name: "Ada", saved: "", notice: "" },
  schema,
  router: {
    base: "/examples/routes",
    routes: [
      {
        path: "/",
        view: ({ bind, actions, link }) =>
          div(
            { id: "route-home" },
            p("Shared count: ", span({ id: "route-count" }, bind.count)),
            button(
              {
                id: "route-increment",
                type: "button",
                onClick: actions.increment,
              },
              "Increment",
            ),
            p(
              link(
                "/people/Ada?tab=profile",
                { id: "route-profile-link" },
                "Edit profile",
              ),
            ),
            p("Saved name: ", bind.saved),
          ),
      },
      {
        path: "/people/:id",
        view(context) {
          const { bind, actions, derive, link } = context;
          return div(
            { id: "route-profile" },
            p(
              "Person: ",
              span(
                { id: "route-person" },
                derive(() => context.route.params.id),
              ),
            ),
            p(
              "Tab: ",
              span(
                { id: "route-tab" },
                derive(() => context.route.query.tab?.join(", ") ?? "profile"),
              ),
            ),
            p("Shared count: ", span({ id: "route-count" }, bind.count)),
            form(
              {
                on: {
                  submit: (event) => {
                    event.preventDefault();
                    actions.save();
                  },
                },
              },
              label({ for: "route-name" }, "Name"),
              input({
                id: "route-name",
                name: "name",
                value: bind.name,
                onText: (value) => actions.rename(value.value),
              }),
              button(
                { id: "route-save", type: "submit" },
                "Save and return home",
              ),
            ),
            p(
              link(
                "?tab=details",
                { id: "route-query-link" },
                "Change tab without replacing the form",
              ),
            ),
            p(link("/", "Home")),
          );
        },
      },
    ],
    notFound: ({ link }) =>
      div({ id: "route-missing" }, "Route not found. ", link("/", "Home")),
  },
  view: ({ bind, actions, link }) =>
    div(
      p(
        link("/", { id: "route-home-link" }, "Home"),
        " · ",
        link("/people/Ada?tab=profile", "Profile"),
      ),
      outlet(),
      button(
        {
          id: "route-rollback",
          type: "button",
          onClick: () => {
            try {
              actions.rollback();
            } catch {
              actions.notice(
                "State and URL unchanged after a throwing action.",
              );
            }
          },
        },
        "Try rollback",
      ),
      button(
        {
          id: "route-normal",
          type: "button",
          onClick: () => {
            app.schedule("normal", () =>
              actions.notice(
                "Normal task ran; shared state is still available.",
              ),
            );
          },
        },
        "Schedule normal work",
      ),
      p({ id: "route-notice", role: "status" }, bind.notice),
    ),
});
app.mount();
