import { FrameworkError, fail, observePromise, requireSync } from "./errors.js";
import { readRecord } from "./records.js";
import { createTransactionStore } from "./state/transactions.js";
import { createActionSchema, ownActionRegistry } from "./actions/schema.js";
import { createDispatcher } from "./actions/dispatch.js";
import { createTracking } from "./reactivity/tracking.js";
import { createBindings, derive as binding } from "./dom/bindings.js";
import { when, keyed, outlet, a } from "./dom/nodes.js";
import { registerDiagnostics } from "./diagnostics.js";
import { createEvents } from "./dom/events.js";
import { createRenderer } from "./dom/renderer.js";
import { createScheduler } from "./scheduler.js";
import { ownRouterConfig, createRouter } from "./routing/router.js";

const targets = new WeakMap();
const emptySchema = createActionSchema()(() => ({}));

export function createApplication(config, frameworkVersion) {
  let options = readRecord(config, "CONFIG_INVALID", "app", [
    "target",
    "initialState",
    "schema",
    "view",
    "onError",
    "router",
  ]);
  let { view = options.router === undefined ? () => "" : () => outlet(), onError } = options;
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
  let routerConfig;
  try {
    store = createTransactionStore(
      options.initialState === undefined ? {} : options.initialState,
    );
    registry = ownActionRegistry(
      options.schema === undefined ? emptySchema : options.schema,
    );
    routerConfig = options.router === undefined ? null : ownRouterConfig(options.router);
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
  let events = null, handlingEvent = false;
  let rendering = false;
  let mountCleanups = [];
  const appCleanups = [];
  const tracking = createTracking(store);
  const bindingOwner = Object.freeze({});
  const bind = createBindings(bindingOwner, live);
  const router = routerConfig ? createRouter(routerConfig, tracking, () => renderer?.schedule(), runLocationInput) : null;
  routerConfig = null;
  const scheduler = createScheduler(run => run(), error => {
    reported = new WeakSet(); report(error, "schedule");
  });
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
  function runEvent(run) {
    if (!handlingEvent && !reporting && !dispatcher?.isActive()) reported = new WeakSet();
    try {
      live();
      if (status !== "mounted" || handlingEvent || rendering || reporting || dispatcher.isActive() || tracking.isBusy())
        fail("EVENT_REENTRANT", "Cannot invoke event handlers during mounting, actions, rendering, reactive reads/notifications or another event/error handler.");
      handlingEvent = true;
      try { return run(); } finally { handlingEvent = false; }
    } catch (error) { report(error, "event"); }
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
    const scheduled = new Set();
    let ownsScheduled = false;
    const scopeLive = () => {
      if (!isActive()) fail("SCOPE_DISPOSED", "This view scope is no longer active.");
      live();
    };
    return Object.freeze({
      get state() { live(); return tracking.state(); },
      get bind() { scopeLive(); return bind; },
      actions, dispatch,
      derive(read) { scopeLive(); return derive(read); },
      when, keyed,
      outlet,
      get route() { scopeLive(); return router?.route ?? null; },
      navigate(to, options) { scopeLive(); return navigate(to, options); },
      link(to, ...args) { scopeLive(); return link(to, ...args); },
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
      schedule(lane, callback) {
        scopeLive();
        if (lane === "immediate" || typeof callback !== "function") return schedule(lane, callback, isActive);
        let cancel;
        const stop = schedule(lane, () => {
          try { return callback(); } finally { scheduled.delete(cancel); }
        }, isActive);
        cancel = () => { scheduled.delete(cancel); stop(); };
        if (!ownsScheduled) {
          addCleanup(() => {
            const errors = [];
            for (const stop of [...scheduled]) try { stop(); } catch (error) { errors.push(error); }
            scheduled.clear();
            if (errors.length) throw new AggregateError(errors, "Scoped work cancellation failed.");
          });
          ownsScheduled = true;
        }
        scheduled.add(cancel); return cancel;
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
      if (nested || handlingEvent) throw error;
      report(error, "dispatch");
    }
  }
  function schedule(lane, callback, active) {
    if (!handlingEvent && !reporting && !dispatcher?.isActive()) reported = new WeakSet();
    try {
      live();
      if (dispatcher.isActive() || (rendering && lane === "immediate") || reporting || tracking.isBusy() ||
          (lane === "immediate" && status === "mounting"))
        fail("SCHEDULE_REENTRANT", "Cannot schedule during actions, rendering, reactive/error work or immediate view construction.");
      return scheduler.schedule(lane, callback, active);
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, "schedule");
    }
  }
  function navigate(to, options) {
    if (!handlingEvent && !reporting && !dispatcher?.isActive()) reported = new WeakSet();
    try {
      live();
      if (!router) fail("ROUTER_MISSING", "Configure a router before navigating.");
      if (status !== "mounted" || rendering || reporting || tracking.isBusy() ||
          (dispatcher.isActive() && !dispatcher.isExecuting()))
        fail("NAVIGATION_REENTRANT", "Navigation requires a mounted app outside reactive/render/error work or payload admission.");
      const request = router.prepare(to, options);
      if (dispatcher.isExecuting()) dispatcher.afterCommit(() => router.commit(request));
      else router.commit(request);
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, "navigation");
    }
  }
  function runLocationInput(run) {
    if (status !== "mounted") return;
    reported = new WeakSet();
    try {
      if (rendering || reporting || dispatcher.isActive() || tracking.isBusy())
        fail("NAVIGATION_REENTRANT", "Cannot process native navigation during active runtime work.");
      run();
    } catch (error) { report(error, "navigation"); }
  }
  function link(to, ...args) {
    live();
    if (!router) fail("ROUTER_MISSING", "Configure a router before creating framework links.");
    const descriptor = a(...args);
    if (Object.hasOwn(descriptor.props, "href") || descriptor.props.onClick != null || descriptor.props.on?.click != null)
      fail("ROUTE_LINK_INVALID", "Framework links own href and click handling; other attributes/events are supported.");
    const href = router.href(to);
    return a({ ...descriptor.props, href, on: { ...descriptor.props.on, click: event => {
      if (router.follows(event, href, typeof to === "string" && to.startsWith("#"))) {
        event.preventDefault(); navigate(router.absolute(href));
      }
    } } }, ...descriptor.children);
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
    schedule,
    navigate, link, outlet,
    get route() { live(); return router?.route ?? null; },
    observe,
    computed,
    derive,
    when, keyed,
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
        router?.start(target.ownerDocument.defaultView);
        events = createEvents(target, runEvent);
        renderer = createRenderer(target.ownerDocument, tracking, bindingOwner, makeContext, render, error => {
          reported = new WeakSet();
          report(error, "render");
        }, events, scheduler, router);
        scheduler.connect(target.ownerDocument.defaultView, () => renderer?.schedule());
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
        const cleanupErrors = [];
        try { router?.stop(); } catch (error) { cleanupErrors.push(error); }
        try { events?.dispose(); } catch (error) { cleanupErrors.push(error); }
        events = null;
        if (renderer) cleanupErrors.push(...renderer.dispose());
        cleanupErrors.push(...drain(attemptCleanups));
        renderer = null;
        scheduler.connect(null, null);
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
      const errors = [];
      try { scheduler.dispose(); } catch (error) { errors.push(error); }
      tracking.dispose();
      try { router?.dispose(); } catch (error) { errors.push(error); }
      try { events?.dispose(); } catch (error) { errors.push(error); }
      events = null;
      if (renderer) errors.push(...renderer.dispose());
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
  registerDiagnostics(app, () => ({ ...tracking.counts(),
    ...scheduler.counts(),
    ...(router?.counts() ?? { routeListeners: 0 }),
    ...(renderer?.counts() ?? { scopes: 0, bindings: 0, ownedNodes: 0, queuedBindings: 0, frames: 0 }),
    ...(events?.counts() ?? { handlers: 0, listeners: 0 }) }));
  if (defaultTarget !== undefined) app.mount(defaultTarget);
  return app;
}
