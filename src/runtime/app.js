import { FrameworkError, fail, observePromise, requireSync } from "./errors.js";
import { readRecord } from "./records.js";
import { createTransactionStore } from "./state/transactions.js";
import { createActionSchema, ownActionRegistry } from "./actions/schema.js";
import { createDispatcher } from "./actions/dispatch.js";
import { createTracking } from "./reactivity/tracking.js";
import { createBindings, derive as binding } from "./dom/bindings.js";
import { when, keyed, outlet, a } from "./dom/nodes.js";
import { registerDiagnostics } from "./diagnostics.js";
import { errorSummary } from "./recording/format.js";
import { createDiagnosticHub } from "./inspector/instrumentation.js";
import { createEvents } from "./dom/events.js";
import { createRenderer } from "./dom/renderer.js";
import { createScheduler } from "./scheduler.js";
import { ownRouterConfig, createRouter } from "./routing/router.js";
import {
  ownPersistenceConfig,
  createPersistence,
} from "./persistence/locations.js";
import { createControls } from "./determinism/controls.js";
import {
  encodeCheckpoint,
  decodeCheckpoint,
} from "./serialization/checkpoint.js";
import { ownSimulation, createTicks } from "./determinism/ticks.js";
import { ownInput, ownValue } from "./inputs/ownership.js";
import { createInputs } from "./inputs/adapters.js";
import { createInputBoundary } from "./inputs/boundary.js";
import { createInterpolation } from "./determinism/interpolation.js";
import { createRecorder } from "./recording/recorder.js";

const targets = new WeakMap();
const emptySchema = createActionSchema()(() => ({}));

export function createApplication(
  config,
  frameworkVersion,
  replay = null,
  continuation = null,
) {
  let options = readRecord(config, "CONFIG_INVALID", "app", [
    "target",
    "initialState",
    "schema",
    "view",
    "onError",
    "router",
    "persistence",
    "controls",
    "snapshot",
    "simulation",
  ]);
  let {
    view = options.router === undefined ? () => "" : () => outlet(),
    onError,
  } = options;
  if (
    typeof view !== "function" ||
    (onError !== undefined && typeof onError !== "function")
  ) {
    fail("CONFIG_INVALID", "view and optional onError must be functions.");
  }
  let reported = new WeakSet();
  let reporting = false;
  let dispatcher;
  let inputBusy = false;
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
  let persistenceConfig;
  let controls;
  let simulationConfig;
  try {
    registry = ownActionRegistry(
      options.schema === undefined ? emptySchema : options.schema,
    );
    if (
      options.snapshot !== undefined &&
      (options.initialState !== undefined || options.controls !== undefined)
    )
      fail(
        "SNAPSHOT_CONFLICT",
        "Use snapshot or initialState/controls, not both.",
      );
    const restored =
      options.snapshot === undefined
        ? null
        : decodeCheckpoint(
            options.snapshot,
            options.schema?.version ?? emptySchema.version,
          );
    controls = createControls(options.controls, restored?.controls);
    if (
      restored &&
      restored.controls.clock.mode === "manual" &&
      options.simulation !== undefined
    )
      fail(
        "SNAPSHOT_CONFLICT",
        "A manual checkpoint requires manual clock configuration.",
      );
    simulationConfig = ownSimulation(
      options.simulation,
      registry,
      controls.snapshot.clock,
    );
    store = createTransactionStore(
      restored?.state ??
        (options.initialState === undefined ? {} : options.initialState),
      restored?.stateVersion ?? 1,
    );
    routerConfig =
      options.router === undefined ? null : ownRouterConfig(options.router);
    persistenceConfig =
      options.persistence === undefined
        ? null
        : ownPersistenceConfig(
            options.persistence,
            store.getState(),
            options.schema?.version ?? emptySchema.version,
            !!routerConfig,
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
  let events = null,
    handlingEvent = false;
  let rendering = false;
  let mountCleanups = [];
  const appCleanups = [];
  const diagnostics = createDiagnosticHub();
  const tracking = createTracking(store, diagnostics);
  let interpolation = null;
  let recorder = null;
  const recordRun = (root, run) =>
    diagnostics.run(root.kind, root, () => recorder?.active ? recorder.run(root, run) : run());
  const captureRecording = () => ({
    snapshot: encodeCheckpoint(
      store.getState(),
      store.getVersion(),
      schemaVersion,
      controls.snapshot,
    ),
    route: router?.route
      ? { mode: router.mode, base: router.base, url: router.route.url }
      : null,
  });
  const bindingOwner = Object.freeze({});
  const bind = createBindings(bindingOwner, live);
  const router = routerConfig
    ? createRouter(
        routerConfig,
        tracking,
        () => renderer?.schedule(),
        runLocationInput,
        (route) =>
          replay
            ? replay.location()
            : persistence?.location(route, status === "created"),
        (packet) => admitInternal(packet),
        replay,
      )
    : null;
  routerConfig = null;
  const scheduler = createScheduler(
    (run) => run(),
    (error) => {
      reported = new WeakSet();
      report(
        error,
        error.code?.startsWith("PERSIST_") ? "persistence" : "schedule",
      );
    },
  );
  const persistence = persistenceConfig
    ? createPersistence(
        persistenceConfig,
        store,
        router,
        scheduler,
        publishInput,
        withInput,
        (packet) => admitInternal(packet),
        !!replay,
      )
    : null;
  persistenceConfig = null;
  function withInput(run) {
    const previous = inputBusy;
    inputBusy = true;
    try {
      return run();
    } finally {
      inputBusy = previous;
    }
  }
  function publishInput(result) {
    const errors = [];
    try {
      tracking.batch(() => {
        if (diagnostics.enabled) diagnostics.emit("commit", { version: result.version, isNoop: result.isNoop });
        if (diagnostics.enabled) for (const change of result.changes) diagnostics.emit("change", change);
        tracking.publish(result);
        interpolation?.committed();
      });
    } catch (error) {
      errors.push(error);
    }
    try {
      renderer?.schedule();
    } catch (error) {
      errors.push(error);
    }
    replay?.published();
    if (errors.length === 1) throw errors[0];
    if (errors.length)
      throw new AggregateError(
        errors,
        "External input notifications failed after commit.",
      );
  }
  function live() {
    if (status === "disposed" || status === "disposing")
      fail(
        "APP_DISPOSED",
        "Application is disposed. Create a new app to mount again.",
      );
  }
  function register(list, cleanup) {
    live();
    if (inputBusy)
      fail(
        "PERSIST_REENTRANT",
        "Cannot register lifecycle work from a persistence guard.",
      );
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
  dispatcher = createDispatcher(
    store,
    registry,
    () => {
      live();
      if (
        status === "mounting" ||
        inputBusy ||
        reporting ||
        rendering ||
        tracking.isBusy()
      )
        fail(
          "ACTION_REENTRANT",
          "Cannot dispatch during view mounting, reactive reads/notifications or error reporting.",
        );
    },
    (result) => {
      const errors = [];
      try {
        tracking.batch(() => {
          if (diagnostics.enabled) {
            diagnostics.emit("commit", { version: result.version, isNoop: result.isNoop });
            for (const change of result.changes) diagnostics.emit("change", change);
          }
          tracking.publish(result);
          interpolation?.committed();
          persistence?.committed();
        });
      } catch (error) {
        errors.push(error);
      }
      try {
        renderer?.schedule();
      } catch (error) {
        errors.push(error);
      }
      replay?.published();
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(
          errors,
          "Notifications/scheduling failed after commit.",
        );
    },
    controls,
    {
      batch: (packet, run) => recordRun({ kind: "dispatch", packet }, run),
      queued: (name, args, parent) => {
        return replay ? replay.queued(name, args, parent) : recorder?.queued(name, args, parent);
      },
      trace: (phase, name, id, parent, args, stateVersion, error) => {
        if (diagnostics.enabled) diagnostics.emit("action", { phase, name, id, parent, args, stateVersion, error: error === undefined ? null : errorSummary(error) });
      },
      action: (...args) => {
        recorder?.action(...args);
        replay?.action(...args);
      },
    },
  );
  function render(run, frame = { source: "flush" }) {
    const previous = rendering;
    rendering = true;
    try {
      return diagnostics.run("render", frame, run);
    } finally {
      rendering = previous;
    }
  }
  function runEvent(run) {
    if (replay) return;
    if (!handlingEvent && !reporting && !dispatcher?.isActive())
      reported = new WeakSet();
    try {
      live();
      if (
        status !== "mounted" ||
        inputBusy ||
        handlingEvent ||
        rendering ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy()
      )
        fail(
          "EVENT_REENTRANT",
          "Cannot invoke event handlers during mounting, actions, rendering, reactive reads/notifications or another event/error handler.",
        );
      handlingEvent = true;
      try {
        return run();
      } finally {
        handlingEvent = false;
      }
    } catch (error) {
      report(error, "event");
    }
  }
  function flush() {
    if (
      !rendering &&
      !reporting &&
      !dispatcher?.isActive() &&
      !tracking.isBusy()
    )
      reported = new WeakSet();
    try {
      live();
      if (
        status === "mounting" ||
        inputBusy ||
        rendering ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy()
      )
        fail(
          "FLUSH_REENTRANT",
          "Cannot flush during mounting, dispatch, rendering, reactive reads/notifications or error reporting.",
        );
      render(() => renderer?.flush());
    } catch (error) {
      report(error, "render");
    }
  }
  function derive(read) {
    live();
    return binding(read, bindingOwner);
  }
  function interpolate(read, check = live) {
    check();
    if (inputBusy || reporting || dispatcher.isActive() || tracking.isBusy())
      fail(
        "INTERPOLATION_REENTRANT",
        "Cannot create interpolation bindings during active actions/reads/input reporting.",
      );
    interpolation ??= createInterpolation(
      store,
      tracking,
      controls,
      ticks,
      bindingOwner,
      () => renderer?.schedule(),
    );
    return interpolation.binding(read, check);
  }
  function flushPersistence() {
    if (!reporting && !dispatcher?.isActive() && !handlingEvent)
      reported = new WeakSet();
    try {
      live();
      if (
        status === "mounting" ||
        inputBusy ||
        rendering ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy()
      )
        fail(
          "PERSIST_REENTRANT",
          "Cannot flush persistence during active runtime work.",
        );
      persistence?.flush();
    } catch (error) {
      report(error, "persistence");
    }
  }
  function checkpointOperation(run, phase) {
    if (!reporting && !dispatcher?.isActive() && !handlingEvent)
      reported = new WeakSet();
    try {
      live();
      if (
        status === "mounting" ||
        ticks.busy ||
        inputBusy ||
        rendering ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy()
      )
        fail(
          phase === "snapshot" ? "SNAPSHOT_REENTRANT" : "CONTROL_REENTRANT",
          "Checkpoint/control operations require a boundary outside active runtime work.",
        );
      return run();
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, phase);
    }
  }
  function inputOperation(run, allowMount = false) {
    if (!reporting && !dispatcher?.isActive() && !handlingEvent)
      reported = new WeakSet();
    try {
      live();
      if (
        (!allowMount && status === "mounting") ||
        ticks.busy ||
        inputBusy ||
        (!allowMount && rendering) ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy()
      )
        fail(
          "INPUT_REENTRANT",
          "External inputs require a boundary outside active runtime work.",
        );
      return run();
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, "input");
    }
  }
  function recordingOperation(run) {
    if (!reporting && !dispatcher?.isActive() && !handlingEvent)
      reported = new WeakSet();
    try {
      live();
      if (replay)
        fail(
          "REPLAY_READONLY",
          "Replay owns authoritative recording/control/input operations.",
        );
      if (
        status === "mounting" ||
        ticks.busy ||
        inputBusy ||
        rendering ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy() ||
        recorder?.busy
      )
        fail(
          "RECORDING_REENTRANT",
          "Recording operations require an idle runtime boundary.",
        );
      return run();
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, "recording");
    }
  }
  const ticks = createTicks(
    simulationConfig,
    controls,
    (...args) => dispatcher.dispatch(...args),
    (run) => checkpointOperation(run, "control"),
    (error) => report(error, "control"),
    {
      simulate: (run) => diagnostics.simulate(run),
      tick: () => interpolation?.tick(),
      frame: () => interpolation?.frame(),
      runTick: (tick, action, run) =>
        recordRun({ kind: "tick", tick, action }, run),
    },
  );
  simulationConfig = null;
  function normalizePacket(value, preflight = false) {
    const record = readRecord(value, "INPUT_INVALID", "input packet");
    if (record.version !== 1)
      fail("INPUT_INCOMPATIBLE", "Unsupported semantic input packet version.");
    if (record.kind === "action") {
      readRecord(value, "INPUT_INVALID", "action input", [
        "version",
        "kind",
        "name",
        "args",
      ]);
      const args = record.args;
      if (
        !Array.isArray(args) ||
        args.length > 1 ||
        Object.getPrototypeOf(args) !== Array.prototype ||
        Reflect.ownKeys(args).some((key) => key !== "length" && key !== "0") ||
        (args.length &&
          !Object.hasOwn(
            Object.getOwnPropertyDescriptor(args, "0") ?? {},
            "value",
          ))
      )
        fail(
          "INPUT_INVALID",
          "Action input args require a dense zero/one-element data array.",
        );
      const owned = ownInput(registry, record.name, args);
      const packet = Object.freeze({
        version: 1,
        kind: "action",
        name: owned.name,
        args: Object.freeze(owned.args),
      });
      return {
        packet,
        usage: owned.usage,
        execute: () => dispatcher.dispatch(owned.name, ...owned.args),
      };
    }
    const owned = ownValue(value),
      packet = owned.value;
    if (packet.kind === "location" || packet.kind === "navigation") {
      const location = packet.kind === "location";
      readRecord(packet, "INPUT_INVALID", "route input", [
        "version",
        "kind",
        "mode",
        "base",
        "url",
        ...(location ? ["cause", "hydrate"] : ["replace"]),
      ]);
      if (!router)
        fail("ROUTER_MISSING", "Route packets require a configured router.");
      if (
        (location &&
          (!["native", "mount", "navigation", "state"].includes(packet.cause) ||
            typeof packet.hydrate !== "boolean")) ||
        (!location && typeof packet.replace !== "boolean")
      )
        fail("INPUT_INVALID", "Malformed route input policy.");
      const next = router.prepareInput(packet);
      const request =
        location || preflight
          ? null
          : router.prepare(router.absolute(packet.url), {
              replace: packet.replace,
            });
      return {
        packet,
        usage: owned.usage,
        execute: () =>
          location
            ? router.applyPrepared(
                next,
                packet.hydrate &&
                  !(packet.cause === "mount" && status === "created"),
              )
            : router.commit(request),
      };
    }
    if (packet.kind === "hydration") {
      readRecord(packet, "INPUT_INVALID", "hydration input", [
        "version",
        "kind",
        "namespace",
        "schemaVersion",
        "groups",
      ]);
      if (!persistence)
        fail(
          "PERSIST_CONFIG_INVALID",
          "Hydration packets require configured persistence fields.",
        );
      const groups = withInput(() => persistence.prepareInput(packet));
      return {
        packet,
        usage: owned.usage,
        execute: () => persistence.applyPrepared(groups),
      };
    }
    fail("INPUT_INVALID", "Unknown semantic input packet kind.");
  }
  const inputBoundary = createInputBoundary(
    () => controls.snapshot.clock,
    ticks,
    normalizePacket,
    withInput,
    {
      root: (input, queued, run) =>
        recordRun({ kind: "input", input, queued }, run),
      input: (input, queued) => {
        if (diagnostics.enabled) diagnostics.emit("input", { ...input, queued });
        return replay ? replay.input(input, queued) : recorder?.input(input, queued);
      },
      end: (id, error, failed) => {
        if (diagnostics.enabled) diagnostics.emit("input-end", { id: id ?? null, failed, stateVersion: store.getVersion() });
        recorder?.inputEnd(id, store.getVersion(), error, failed);
        replay?.inputEnd(id, store.getVersion(), error, failed);
      },
    },
  );
  function admitInternal(packet) {
    const derived =
      inputBoundary.executing ||
      dispatcher.isActive() ||
      packet.cause === "state";
    return inputBoundary.admit(packet, {
      derived,
      immediate:
        derived || status === "mounting" || packet.kind === "hydration",
    });
  }
  const inputs = createInputs(
    (name, payload, active) => {
      return inputBoundary.admit(
        { version: 1, kind: "action", name, args: [payload] },
        { active },
      );
    },
    (run) => inputOperation(run),
    (run, scopedConstruction) =>
      inputOperation(run, scopedConstruction || status === "mounting"),
    (name) => {
      if (registry.get(name)?.input !== "payload")
        fail(
          "INPUT_INVALID",
          "External inputs require a registered payload action.",
        );
    },
    () => target?.ownerDocument.defaultView ?? globalThis,
    withInput,
    replay ? { clock: () => controls.snapshot.clock } : null,
  );
  const appInputs = inputs.scoped();
  function enqueue(tick, name, args) {
    return inputOperation(() => {
      if (replay)
        fail(
          "REPLAY_READONLY",
          "Replay consumes recorded inputs through its controller.",
        );
      if (!ticks.status.enabled)
        fail(
          "TICK_MISSING",
          "Configure simulation before enqueueing tick inputs.",
        );
      const ticket = inputBoundary.admit(
        { version: 1, kind: "action", name, args },
        { tick },
      );
      return Object.freeze({
        ...ticket,
        cancel: () => inputOperation(ticket.cancel),
      });
    });
  }
  function receiveInput(packet, raw = {}) {
    return inputOperation(() => {
      if (replay)
        fail(
          "REPLAY_READONLY",
          "Replay consumes recorded inputs through its controller.",
        );
      const { tick } = readRecord(raw, "INPUT_INVALID", "input options", [
        "tick",
      ]);
      if (tick !== undefined && !ticks.status.enabled)
        fail("TICK_MISSING", "Tick assignment requires fixed simulation.");
      const ticket = inputBoundary.admit(packet, {
        tick,
        bootstrap: status === "created" && tick === undefined,
      });
      return Object.freeze({
        ...ticket,
        cancel: () => inputOperation(() => ticket.cancel?.()),
      });
    });
  }
  function observeInputs(callback, scoped = false) {
    return inputOperation(() => inputBoundary.observe(callback), scoped);
  }
  function makeContext(addCleanup, isActive) {
    const scheduled = new Set();
    let ownsScheduled = false;
    let scopedInputs;
    const scopeLive = () => {
      if (!isActive())
        fail("SCOPE_DISPOSED", "This view scope is no longer active.");
      live();
    };
    return Object.freeze({
      get state() {
        live();
        return tracking.state();
      },
      get bind() {
        scopeLive();
        return bind;
      },
      actions,
      dispatch,
      get inputs() {
        scopeLive();
        return (scopedInputs ??= inputs.scoped(isActive, addCleanup));
      },
      observeInputs(callback) {
        scopeLive();
        const stop = observeInputs(callback, true);
        addCleanup(stop);
        return stop;
      },
      derive(read) {
        scopeLive();
        return derive(read);
      },
      interpolate(read) {
        return interpolate(read, scopeLive);
      },
      when,
      keyed,
      outlet,
      get route() {
        scopeLive();
        return router?.route ?? null;
      },
      navigate(to, options) {
        scopeLive();
        return navigate(to, options);
      },
      link(to, ...args) {
        scopeLive();
        return link(to, ...args);
      },
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
        if (inputBusy)
          fail(
            "PERSIST_REENTRANT",
            "Cannot register view cleanup from a persistence guard.",
          );
        if (typeof cleanup !== "function")
          fail(
            "CLEANUP_INVALID",
            "onDispose requires a synchronous cleanup function.",
          );
        addCleanup(cleanup);
      },
      schedule(lane, callback) {
        scopeLive();
        if (lane === "immediate" || typeof callback !== "function")
          return schedule(lane, callback, isActive);
        let cancel;
        const stop = schedule(
          lane,
          () => {
            try {
              return callback();
            } finally {
              scheduled.delete(cancel);
            }
          },
          isActive,
        );
        cancel = () => {
          scheduled.delete(cancel);
          stop();
        };
        if (!ownsScheduled) {
          addCleanup(() => {
            const errors = [];
            for (const stop of [...scheduled])
              try {
                stop();
              } catch (error) {
                errors.push(error);
              }
            scheduled.clear();
            if (errors.length)
              throw new AggregateError(
                errors,
                "Scoped work cancellation failed.",
              );
          });
          ownsScheduled = true;
        }
        scheduled.add(cancel);
        return cancel;
      },
    });
  }
  function observe(read, notify) {
    live();
    if (inputBusy)
      fail(
        "REACTIVITY_REENTRANT",
        "Cannot register observers from a persistence guard.",
      );
    return tracking.observe(read, notify);
  }
  function computed(read) {
    live();
    if (inputBusy)
      fail(
        "REACTIVITY_REENTRANT",
        "Cannot register computed values from a persistence guard.",
      );
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
      if (replay && (!replay.driving || !dispatcher.isExecuting()))
        fail(
          "REPLAY_READONLY",
          "Only executing replay bodies can dispatch nested actions.",
        );
      return dispatcher.dispatch(...args);
    } catch (error) {
      if (nested || handlingEvent) throw error;
      report(error, "dispatch");
    }
  }
  function schedule(lane, callback, active) {
    if (!handlingEvent && !reporting && !dispatcher?.isActive())
      reported = new WeakSet();
    try {
      live();
      if (
        inputBusy ||
        dispatcher.isActive() ||
        (rendering && lane === "immediate") ||
        reporting ||
        tracking.isBusy() ||
        (lane === "immediate" && status === "mounting")
      )
        fail(
          "SCHEDULE_REENTRANT",
          "Cannot schedule during actions, rendering, reactive/error work or immediate view construction.",
        );
      if (replay) {
        if (!["immediate", "frame", "normal", "idle"].includes(lane))
          fail("SCHEDULE_LANE_INVALID", "Unknown scheduling lane.");
        if (typeof callback !== "function")
          fail(
            "SCHEDULE_CALLBACK_INVALID",
            "Scheduled work requires a callback.",
          );
        return () => {};
      }
      return scheduler.schedule(lane, callback, active);
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, "schedule");
    }
  }
  function navigate(to, options) {
    if (!handlingEvent && !reporting && !dispatcher?.isActive())
      reported = new WeakSet();
    try {
      live();
      if (!router)
        fail("ROUTER_MISSING", "Configure a router before navigating.");
      if (replay && (!replay.driving || !dispatcher.isExecuting()))
        fail(
          "REPLAY_READONLY",
          "Only executing replay bodies can request derived navigation.",
        );
      if (
        (!replay && status !== "mounted") ||
        inputBusy ||
        rendering ||
        reporting ||
        tracking.isBusy() ||
        (dispatcher.isActive() && !dispatcher.isExecuting())
      )
        fail(
          "NAVIGATION_REENTRANT",
          "Navigation requires a mounted app outside reactive/render/error work or payload admission.",
        );
      const request = router.prepare(to, options);
      const prepared = {
        version: 1,
        kind: "navigation",
        mode: router.mode,
        base: router.base,
        url: request.url,
        replace: request.replace,
      };
      if (dispatcher.isExecuting())
        dispatcher.afterCommit(() => admitInternal(prepared));
      else admitInternal(prepared);
    } catch (error) {
      if (handlingEvent || dispatcher?.isActive()) throw error;
      report(error, "navigation");
    }
  }
  function runLocationInput(run) {
    if (status !== "mounted") return;
    reported = new WeakSet();
    try {
      if (
        inputBusy ||
        rendering ||
        reporting ||
        dispatcher.isActive() ||
        tracking.isBusy()
      )
        fail(
          "NAVIGATION_REENTRANT",
          "Cannot process native navigation during active runtime work.",
        );
      run();
    } catch (error) {
      report(error, "navigation");
    }
  }
  function link(to, ...args) {
    live();
    if (!router)
      fail(
        "ROUTER_MISSING",
        "Configure a router before creating framework links.",
      );
    const descriptor = a(...args);
    if (
      Object.hasOwn(descriptor.props, "href") ||
      descriptor.props.onClick != null ||
      descriptor.props.on?.click != null
    )
      fail(
        "ROUTE_LINK_INVALID",
        "Framework links own href and click handling; other attributes/events are supported.",
      );
    const href = router.href(to);
    return a(
      {
        ...descriptor.props,
        href,
        on: {
          ...descriptor.props.on,
          click: (event) => {
            if (
              router.follows(
                event,
                href,
                typeof to === "string" && to.startsWith("#"),
              )
            ) {
              event.preventDefault();
              navigate(router.absolute(href));
            }
          },
        },
      },
      ...descriptor.children,
    );
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
    replaying: !!replay,
    schemaVersion,
    actionNames,
    actions,
    dispatch,
    flush,
    flushPersistence,
    snapshot() {
      return checkpointOperation(() => {
        if (ticks.pending || inputs.pending)
          fail(
            "SNAPSHOT_PENDING",
            "Drain/cancel queued inputs and pending effects before exporting a checkpoint.",
          );
        return encodeCheckpoint(
          store.getState(),
          store.getVersion(),
          schemaVersion,
          controls.snapshot,
        );
      }, "snapshot");
    },
    setLogicalTime(time) {
      return checkpointOperation(() => {
        if (replay) fail("REPLAY_READONLY", "Replay owns the logical clock.");
        // Validate before opening a recording root; invalid control calls have no transition.
        if (
          controls.snapshot.clock.mode !== "manual" ||
          !Number.isSafeInteger(time) ||
          Object.is(time, -0) ||
          time < controls.snapshot.clock.time
        )
          return controls.setTime(time);
        return recordRun({ kind: "time", time }, () => controls.setTime(time));
      }, "control");
    },
    startRecording(options = {}) {
      return recordingOperation(() => {
        if (recorder?.active)
          fail(
            "RECORDING_ACTIVE",
            "Stop or clear the current recording first.",
          );
        if (ticks.pending || inputs.pending)
          fail(
            "RECORDING_PENDING",
            "Drain/cancel pending inputs/effects before starting recording.",
          );
        const next = createRecorder(options, captureRecording, schemaVersion);
        recorder?.dispose();
        recorder = next;
        return recorder.status;
      });
    },
    stopRecording() {
      return recordingOperation(() => {
        recorder?.stop();
        return app.recording;
      });
    },
    clearRecording() {
      return recordingOperation(() => {
        recorder?.dispose();
        recorder = null;
      });
    },
    exportRecording() {
      return recordingOperation(() => {
        if (!recorder)
          fail("RECORDING_MISSING", "Start recording before exporting.");
        return recorder.export();
      });
    },
    get recording() {
      live();
      return (
        recorder?.status ??
        Object.freeze({
          status: "off",
          mode: null,
          reason: null,
          records: 0,
          actions: 0,
          bytes: 0,
          maxBytes: 0,
          maxActions: 0,
          keyframeInterval: 0,
          baselineSequence: 0,
          endSequence: 0,
          evictedRecords: 0,
          evictedActions: 0,
        })
      );
    },
    get controls() {
      live();
      return controls.snapshot;
    },
    get ticks() {
      live();
      return ticks.status;
    },
    inputs: appInputs,
    receiveInput,
    observeInputs,
    enqueue(name, ...args) {
      return enqueue(undefined, name, args);
    },
    enqueueAt(tick, name, ...args) {
      return enqueue(tick, name, args);
    },
    advanceTicks(elapsed) {
      return checkpointOperation(() => {
        if (replay) fail("REPLAY_READONLY", "Replay owns ticks.");
        return ticks.advance(elapsed);
      }, "control");
    },
    pauseTicks() {
      return checkpointOperation(() => {
        if (replay) fail("REPLAY_READONLY", "Replay owns ticks.");
        return ticks.pause();
      }, "control");
    },
    resumeTicks() {
      return checkpointOperation(() => {
        if (replay) fail("REPLAY_READONLY", "Replay owns ticks.");
        return ticks.resume();
      }, "control");
    },
    get persistence() {
      live();
      return (
        persistence?.status ??
        Object.freeze({
          active: false,
          pending: false,
          errors: Object.freeze([]),
        })
      );
    },
    schedule,
    navigate,
    link,
    outlet,
    get route() {
      live();
      return router?.route ?? null;
    },
    observe,
    computed,
    derive,
    interpolate,
    when,
    keyed,
    get bind() {
      live();
      return bind;
    },
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
        if (recorder?.active)
          fail(
            "RECORDING_ACTIVE",
            "Mount before recording, or stop recording before mounting.",
          );
        if (
          ticks.busy ||
          inputBusy ||
          dispatcher.isActive() ||
          rendering ||
          tracking.isBusy()
        )
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
      const context = makeContext(
        (cleanup) => register(attemptCleanups, cleanup),
        () =>
          mountCleanups === attemptCleanups &&
          ["mounting", "mounted"].includes(status),
      );
      try {
        tracking.batch(() => {
          router?.start(target.ownerDocument.defaultView, continuation?.route);
          persistence?.start(target.ownerDocument.defaultView, !continuation);
        });
        events = createEvents(target, runEvent);
        renderer = createRenderer(
          target.ownerDocument,
          tracking,
          bindingOwner,
          makeContext,
          render,
          (error) => {
            reported = new WeakSet();
            report(error, "render");
          },
          events,
          scheduler,
          router,
          diagnostics,
        );
        scheduler.connect(target.ownerDocument.defaultView, () =>
          renderer?.schedule(),
        );
        render(() => {
          const output = view(context);
          observePromise(output);
          renderer.mount(output, target);
        }, { source: "mount" });
        status = "mounted";
        if (!replay)
          ticks.connect(target.ownerDocument.defaultView, target.ownerDocument);
        return app;
      } catch (cause) {
        // Invalidate the failed view scope before running its cleanup hooks.
        mountCleanups = [];
        const cleanupErrors = [];
        try {
          ticks.disconnect();
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          persistence?.stop();
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          router?.stop();
        } catch (error) {
          cleanupErrors.push(error);
        }
        try {
          events?.dispose();
        } catch (error) {
          cleanupErrors.push(error);
        }
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
      if (
        status === "mounting" ||
        ticks.busy ||
        inputBusy ||
        dispatcher.isActive() ||
        rendering ||
        tracking.isBusy()
      )
        report(
          new FrameworkError(
            "LIFECYCLE_REENTRANT",
            "Cannot dispose during view mounting, action dispatch or payload validation.",
          ),
          "dispose",
        );
      status = "disposing";
      diagnostics.dispose();
      // Stop the complete graph before scoped/user cleanup can dispose sources
      // and accidentally notify other resources in this closing application.
      const errors = [];
      try {
        recorder?.dispose();
      } catch (error) {
        errors.push(error);
      }
      recorder = null;
      try {
        ticks.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        inputBoundary.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        inputs.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        scheduler.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        persistence?.dispose();
      } catch (error) {
        errors.push(error);
      }
      tracking.dispose();
      try {
        interpolation?.dispose();
      } catch (error) {
        errors.push(error);
      }
      interpolation = null;
      try {
        router?.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        events?.dispose();
      } catch (error) {
        errors.push(error);
      }
      events = null;
      if (renderer) errors.push(...renderer.dispose());
      errors.push(...drain(mountCleanups));
      errors.push(...drain(appCleanups));
      renderer = null;
      if (target) targets.delete(target);
      target = null;
      defaultTarget = null;
      store.dispose();
      controls.dispose();
      store = null;
      dispatcher = null;
      registry.clear();
      registry = null;
      view = null;
      mountCleanups = [];
      status = "disposed";
      replay?.closed();
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
  const resources = () => ({
    ...diagnostics.counts(),
    ...tracking.counts(),
    ...ticks.counts(),
    ...inputs.counts(),
    ...inputBoundary.counts(),
    ...(replay?.counts() ?? { replayTrace: 0 }),
    ...(recorder?.counts() ?? {
      recordingRecords: 0,
      recordingBytes: 0,
      recordingScratch: 0,
    }),
    ...scheduler.counts(),
    ...(persistence?.counts() ?? { persistenceTasks: 0 }),
    ...(router?.counts() ?? { routeListeners: 0 }),
    ...(renderer?.counts() ?? {
      scopes: 0,
      bindings: 0,
      ownedNodes: 0,
      queuedBindings: 0,
      frames: 0,
    }),
    ...(events?.counts() ?? { handlers: 0, listeners: 0 }),
  });
  registerDiagnostics(app, resources, {
    hub: diagnostics,
    resources,
    dependencies: () => tracking.dependencies(),
    check() {
      live();
      if (status === "mounting" || ticks.busy || inputBusy || rendering || reporting || dispatcher.isActive() || tracking.isBusy())
        fail("DIAGNOSTICS_REENTRANT", "Diagnostics lifecycle operations require an idle boundary.");
    },
  });
  if (replay)
    replay.connect(
      Object.freeze({
        capture: captureRecording,
        check() {
          live();
          if (
            status === "mounting" ||
            ticks.busy ||
            inputBusy ||
            rendering ||
            reporting ||
            dispatcher.isActive() ||
            tracking.isBusy()
          )
            fail(
              "REPLAY_REENTRANT",
              "Replay controller requires an idle boundary.",
            );
        },
        diagnose: (root, run) => diagnostics.run(root.kind, root, run),
        preparePacket: (value) => normalizePacket(value, true),
        prepareRoute(value) {
          if (value && !router)
            fail("INPUT_INCOMPATIBLE", "History checkpoint requires a router.");
          if (value) router.prepareInput(value);
        },
        restore(point) {
          return diagnostics.run("restore", { sequence: point.sequence }, () => {
            const restored = decodeCheckpoint(point.snapshot, schemaVersion);
            store.restore(restored.state, restored.stateVersion);
            controls.restore(restored.controls);
            ticks.restore();
            inputBoundary.restore();
            // Complete authoritative replacement before notifying any presentation read.
            const errors = [];
            try {
              tracking.batch(() => {
                tracking.restore();
                router?.restoreReplay(point.route);
                interpolation?.restore();
              });
            } catch (error) {
              errors.push(error);
            }
            try {
              renderer?.schedule();
            } catch (error) {
              errors.push(error);
            }
            if (errors.length === 1) throw errors[0];
            if (errors.length)
              throw new AggregateError(
                errors,
                "History restored; notifications failed.",
              );
          });
        },
        restoreRoute: (value) => {
          if (value && !router)
            fail(
              "INPUT_INCOMPATIBLE",
              "Recording baseline requires matching router configuration.",
            );
          router?.restoreReplay(value);
        },
        input: (input, queued) => inputBoundary.replay(input, queued),
        dispatch: (...args) => dispatcher.dispatch(...args),
        time: (value) => controls.setTime(value),
        tick: (run) => ticks.replayTick(run),
      }),
    );
  if (continuation?.route) router?.restoreReplay(continuation.route);
  if (defaultTarget !== undefined) app.mount(defaultTarget);
  return app;
}
