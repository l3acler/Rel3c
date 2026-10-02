import { FrameworkError, fail, observePromise, requireSync } from "./errors.js";
import { readRecord } from "./records.js";
import { ownInitialState } from "./state/initial-state.js";
import { createActionSchema, ownActionRegistry } from "./actions/schema.js";

const targets = new WeakMap();
const emptySchema = createActionSchema()(() => ({}));

export function createApplication(config, frameworkVersion) {
  let options = readRecord(config, "CONFIG_INVALID", "app", [
    "target",
    "initialState",
    "schema",
    "view",
    "onError",
  ]);
  let { view = () => "", onError } = options;
  if (
    typeof view !== "function" ||
    (onError !== undefined && typeof onError !== "function")
  ) {
    fail("CONFIG_INVALID", "view and optional onError must be functions.");
  }
  const reported = new WeakSet();
  let reporting = false;
  function report(error, phase) {
    if (!(error instanceof Error))
      error = new FrameworkError("OPERATION_FAILED", `${phase} failed.`, {
        cause: error,
      });
    if (reported.has(error)) throw error;
    reported.add(error);
    if (onError && !reporting) {
      reporting = true;
      try {
        requireSync(
          onError(error, Object.freeze({ phase })),
          "ERROR_HANDLER_ASYNC",
          "onError must be synchronous.",
        );
      } catch (secondary) {
        const combined = new AggregateError(
          [error, secondary],
          "Framework operation and onError both failed.",
        );
        reported.add(combined);
        throw combined;
      } finally {
        reporting = false;
      }
    }
    throw error;
  }
  let state;
  let registry;
  try {
    state = ownInitialState(
      options.initialState === undefined ? {} : options.initialState,
    );
    registry = ownActionRegistry(
      options.schema === undefined ? emptySchema : options.schema,
    );
  } catch (error) {
    report(error, "create");
  }
  const schemaVersion =
    options.schema === undefined ? emptySchema.version : options.schema.version;
  const actionNames = Object.freeze([...registry.keys()]);
  let defaultTarget = options.target;
  options = null;
  config = null; // Do not retain caller state/schema/config through app closures.
  let status = "created";
  let target = null;
  let node = null;
  let mountCleanups = [];
  const appCleanups = [];
  function live() {
    if (status === "disposed" || status === "disposing")
      fail(
        "APP_DISPOSED",
        "Application is disposed. Create a new app to mount again.",
      );
  }
  function register(list, cleanup) {
    live();
    if (typeof cleanup !== "function")
      fail(
        "CLEANUP_INVALID",
        "onDispose requires a synchronous cleanup function.",
      );
    list.push(cleanup);
  }
  function drain(list) {
    const errors = [];
    while (list.length) {
      try {
        requireSync(
          list.pop()(),
          "CLEANUP_ASYNC",
          "Cleanup functions must be synchronous.",
        );
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
  function dispatch(name) {
    try {
      live();
      if (typeof name !== "string" || !registry.has(name))
        fail("ACTION_UNKNOWN", "Unknown registered action name.");
      fail(
        "FEATURE_UNAVAILABLE",
        "Action execution is not implemented in A.1; production transactions/dispatch follow in A.2/A.3.",
      );
    } catch (error) {
      report(error, "dispatch");
    }
  }
  const actions = Object.create(null);
  for (const name of actionNames)
    Object.defineProperty(actions, name, {
      value: (...args) => dispatch(name, ...args),
      enumerable: true,
    });
  Object.freeze(actions);
  const app = Object.freeze({
    version: frameworkVersion,
    schemaVersion,
    actionNames,
    actions,
    dispatch,
    get status() {
      return status;
    },
    get mounted() {
      return status === "mounted";
    },
    get state() {
      live();
      return state;
    },
    get stateVersion() {
      live();
      return 1;
    },
    onDispose(cleanup) {
      register(appCleanups, cleanup);
    },
    mount(mountTarget = defaultTarget) {
      try {
        live();
        if (status !== "created")
          fail("APP_MOUNTED", "Application is already mounted or mounting.");
        if (mountTarget === undefined) {
          mountTarget = globalThis.document?.getElementById("app");
          if (!mountTarget)
            fail(
              "TARGET_INVALID",
              'mount() requires a document with an element whose id is "app", or an explicit DOM element.',
            );
        }
        const ElementClass = mountTarget?.ownerDocument?.defaultView?.Element;
        if (!ElementClass || !(mountTarget instanceof ElementClass))
          fail("TARGET_INVALID", "mount requires a valid target DOM element.");
        if (targets.has(mountTarget))
          fail("TARGET_OWNED", "Another application already owns this target.");
      } catch (error) {
        report(error, "mount");
      }
      target = mountTarget;
      targets.set(target, app);
      status = "mounting";
      const attemptCleanups = [];
      mountCleanups = attemptCleanups;
      const context = Object.freeze({
        state,
        actions,
        dispatch,
        onDispose(cleanup) {
          if (
            mountCleanups !== attemptCleanups ||
            !["mounting", "mounted"].includes(status)
          ) {
            fail("SCOPE_DISPOSED", "This view scope is no longer active.");
          }
          register(attemptCleanups, cleanup);
        },
      });
      try {
        const output = view(context);
        observePromise(output);
        if (
          output !== null &&
          output !== undefined &&
          typeof output !== "string"
        ) {
          fail(
            "VIEW_RESULT_INVALID",
            "A.1 views must synchronously return text, null or undefined. Declarative elements follow in A.6.",
          );
        }
        node = target.ownerDocument.createTextNode(output ?? "");
        target.appendChild(node);
        status = "mounted";
        return app;
      } catch (cause) {
        // Invalidate the failed view scope before running its cleanup hooks.
        mountCleanups = [];
        const cleanupErrors = drain(attemptCleanups);
        if (node?.parentNode) {
          try {
            node.parentNode.removeChild(node);
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        targets.delete(target);
        target = null;
        node = null;
        status = "created";
        const error =
          cause instanceof FrameworkError || cause instanceof AggregateError
            ? cause
            : new FrameworkError(
                "VIEW_FAILED",
                "View invocation/mount failed.",
                { cause },
              );
        report(
          cleanupErrors.length
            ? new AggregateError(
                [error, ...cleanupErrors],
                "Mount failed; cleanup also failed.",
              )
            : error,
          "mount",
        );
      }
    },
    dispose() {
      if (status === "disposed" || status === "disposing") return;
      if (status === "mounting")
        report(
          new FrameworkError(
            "LIFECYCLE_REENTRANT",
            "Cannot dispose during view mounting.",
          ),
          "dispose",
        );
      status = "disposing";
      const errors = drain(mountCleanups);
      errors.push(...drain(appCleanups));
      if (node?.parentNode) {
        try {
          node.parentNode.removeChild(node);
        } catch (error) {
          errors.push(error);
        }
      }
      if (target) targets.delete(target);
      target = null;
      defaultTarget = null;
      node = null;
      state = null;
      registry.clear();
      registry = null;
      view = null;
      mountCleanups = [];
      status = "disposed";
      try {
        if (errors.length)
          report(
            new AggregateError(
              errors,
              "Application cleanup failed; disposal still completed.",
            ),
            "dispose",
          );
      } finally {
        onError = null;
      }
    },
  });
  if (defaultTarget !== undefined) app.mount(defaultTarget);
  return app;
}
