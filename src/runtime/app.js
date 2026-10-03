import { FrameworkError, fail, observePromise, requireSync } from "./errors.js";
import { readRecord } from "./records.js";
import { createTransactionStore } from "./state/transactions.js";
import { createActionSchema, ownActionRegistry } from "./actions/schema.js";
import { createDispatcher } from "./actions/dispatch.js";
import { createTracking } from "./reactivity/tracking.js";
import { createBindings, derive as binding } from "./dom/bindings.js";
import { when } from "./dom/nodes.js";
import { createRenderer } from "./dom/renderer.js";

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
  let reported = new WeakSet();
  let reporting = false;
  let dispatcher;
  function report(error, phase) {
    // Defer callback invocation until the outer dispatch drains committed work.
    if (dispatcher?.isActive()) throw error;
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
  let store;
  let registry;
  try {
    store = createTransactionStore(
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
  let renderer = null;
  let rendering = false;
  let mountCleanups = [];
  const appCleanups = [];
  const tracking = createTracking(store);
  const bindingOwner = Object.freeze({});
  const bind = createBindings(bindingOwner, live);
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
  dispatcher = createDispatcher(store, registry, () => {
    live();
    if (status === "mounting" || reporting || rendering || tracking.isBusy())
      fail(
        "ACTION_REENTRANT",
        "Cannot dispatch during view mounting, reactive reads/notifications or error reporting.",
      );
  }, result => {
    const errors = [];
    try { tracking.publish(result); } catch (error) { errors.push(error); }
    try { renderer?.schedule(); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "Notifications/scheduling failed after commit.");
  });
  function render(run) {
    const previous = rendering;
    rendering = true;
    try { return run(); } finally { rendering = previous; }
  }
  function flush() {
    if (!rendering && !reporting && !dispatcher?.isActive() && !tracking.isBusy()) reported = new WeakSet();
    try {
      live();
      if (status === "mounting" || rendering || reporting || dispatcher.isActive() || tracking.isBusy())
        fail("FLUSH_REENTRANT", "Cannot flush during mounting, dispatch, rendering, reactive reads/notifications or error reporting.");
      render(() => renderer?.flush());
    } catch (error) { report(error, "render"); }
  }
  function derive(read) {
    live();
    return binding(read, bindingOwner);
  }
  function makeContext(addCleanup, isActive) {
    const scopeLive = () => {
      if (!isActive()) fail("SCOPE_DISPOSED", "This view scope is no longer active.");
      live();
    };
    return Object.freeze({
      get state() { live(); return tracking.state(); },
      get bind() { scopeLive(); return bind; },
      actions, dispatch,
      derive(read) { scopeLive(); return derive(read); },
      when,
      observe(read, notify) {
        scopeLive();
        const resource = observe(read, notify);
        addCleanup(resource.dispose);
        return resource;
      },
      computed(read) {
        scopeLive();
        const resource = computed(read);
        addCleanup(resource.dispose);
        return resource;
      },
      onDispose(cleanup) {
        scopeLive();
        if (typeof cleanup !== "function") fail("CLEANUP_INVALID", "onDispose requires a synchronous cleanup function.");
        addCleanup(cleanup);
      },
    });
  }
  function observe(read, notify) {
    live();
    return tracking.observe(read, notify);
  }
  function computed(read) {
    live();
    return tracking.computed(read);
  }
  function dispatch(...args) {
    const nested = dispatcher?.isActive();
    // Deduplicate propagation within this operation, not future batches that
    // happen to throw the same application Error instance.
    if (!nested && status !== "mounting" && !reporting)
      reported = new WeakSet();
    try {
      live();
      return dispatcher.dispatch(...args);
    } catch (error) {
      if (nested) throw error;
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
    flush,
    observe,
    computed,
    derive,
    when,
    get bind() { live(); return bind; },
    get status() {
      return status;
    },
    get mounted() {
      return status === "mounted";
    },
    get state() {
      live();
      return tracking.state();
    },
    get stateVersion() {
      live();
      return store.getVersion();
    },
    onDispose(cleanup) {
      register(appCleanups, cleanup);
    },
    mount(mountTarget = defaultTarget) {
      try {
        live();
        if (dispatcher.isActive() || rendering || tracking.isBusy())
          fail(
            "LIFECYCLE_REENTRANT",
            "Cannot mount during action dispatch or payload validation.",
          );
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
      const context = makeContext(cleanup => register(attemptCleanups, cleanup),
        () => mountCleanups === attemptCleanups && ["mounting", "mounted"].includes(status));
      try {
        renderer = createRenderer(target.ownerDocument, tracking, bindingOwner, makeContext, render, error => {
          reported = new WeakSet();
          report(error, "render");
        });
        render(() => {
          const output = view(context);
          observePromise(output);
          renderer.mount(output, target);
        });
        status = "mounted";
        return app;
      } catch (cause) {
        // Invalidate the failed view scope before running its cleanup hooks.
        mountCleanups = [];
        const cleanupErrors = renderer ? renderer.dispose() : [];
        cleanupErrors.push(...drain(attemptCleanups));
        renderer = null;
        targets.delete(target);
        target = null;
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
      if (status === "mounting" || dispatcher.isActive() || rendering || tracking.isBusy())
        report(
          new FrameworkError(
            "LIFECYCLE_REENTRANT",
            "Cannot dispose during view mounting, action dispatch or payload validation.",
          ),
          "dispose",
        );
      status = "disposing";
      // Stop the complete graph before scoped/user cleanup can dispose sources
      // and accidentally notify other resources in this closing application.
      tracking.dispose();
      const errors = renderer ? renderer.dispose() : [];
      errors.push(...drain(mountCleanups));
      errors.push(...drain(appCleanups));
      renderer = null;
      if (target) targets.delete(target);
      target = null;
      defaultTarget = null;
      store.dispose();
      store = null;
      dispatcher = null;
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
