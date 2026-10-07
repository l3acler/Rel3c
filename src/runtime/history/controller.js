import { FrameworkError, fail } from "../errors.js";
import { readRecord } from "../records.js";
import { createReplayController } from "../recording/replay.js";
import { logicalTime } from "../determinism/controls.js";

// Own public configuration without invoking accessors or mutating caller objects.
// Functions remain application code; schemas are already immutable registrations.
function ownConfig(value, ancestors = new Set(), depth = 0) {
  if (value === null || typeof value !== "object") return value;
  if (depth > 32 || ancestors.has(value))
    fail(
      "HISTORY_INVALID",
      "History configuration must be bounded and acyclic.",
    );
  ancestors.add(value);
  const array = Array.isArray(value);
  if (array && Object.getPrototypeOf(value) !== Array.prototype)
    fail(
      "HISTORY_INVALID",
      "History configuration arrays must be ordinary arrays.",
    );
  const source = array
    ? value
    : readRecord(value, "HISTORY_INVALID", "history configuration");
  const result = array ? new Array(value.length) : Object.create(null);
  for (const key of Reflect.ownKeys(source)) {
    if (array && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (
      typeof key !== "string" ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    )
      fail(
        "HISTORY_INVALID",
        "History configuration requires data properties.",
      );
    Object.defineProperty(result, key, {
      value: ownConfig(descriptor.value, ancestors, depth + 1),
      enumerable: true,
    });
  }
  ancestors.delete(value);
  return Object.freeze(result);
}

export function createHistoryController(raw, frameworkVersion) {
  const config = readRecord(raw, "HISTORY_INVALID", "history", [
    "recording",
    "schema",
    "router",
    "persistence",
    "simulation",
    "view",
    "reversible",
  ]);
  const { recording: input, schema, view } = config;
  const reversible = ownConfig(config.reversible ?? []);
  if (
    !Array.isArray(reversible) ||
    reversible.length > 1024 ||
    Object.keys(reversible).length !== reversible.length ||
    Object.keys(reversible).some((key, index) => key !== String(index)) ||
    reversible.some(
      (name) => typeof name !== "string" || !schema?.names.includes(name),
    ) ||
    new Set(reversible).size !== reversible.length
  )
    fail(
      "HISTORY_INVALID",
      "reversible requires a dense unique list of registered action names (maximum 1024).",
    );
  const names = new Set(reversible);
  let replay,
    port,
    inspectionApp,
    branchApp = null,
    busy = false,
    handingOff = false,
    disposed = false;
  let recording = null,
    keyframes = [],
    eligible = [],
    charges = [];
  let lastStatus = { sequence: 0, position: 0, divergence: null };
  let baseline = 0,
    end = 0,
    checkpointSequence = 0,
    replayedRoots = 0,
    replayedSlots = 0,
    discardedRecords = 0;
  const clear = () => {
    recording = null;
    keyframes = [];
    eligible = [];
    charges = [];
    names.clear();
    port = null;
  };
  const bridge = {
    connect(value) {
      port = value;
      recording = value.recording;
    },
    closed() {
      if (!handingOff) {
        if (replay) lastStatus = replay.status;
        disposed = true;
        clear();
      }
    },
    counts: () => ({
      historyRecords: recording?.records.length ?? 0,
      historyKeyframes: keyframes.length,
    }),
  };
  replay = createReplayController(
    {
      recording: input,
      schema,
      view,
      router:
        config.router === undefined ? undefined : ownConfig(config.router),
      persistence:
        config.persistence === undefined
          ? undefined
          : ownConfig(config.persistence),
      simulation:
        config.simulation === undefined
          ? undefined
          : ownConfig(config.simulation),
    },
    frameworkVersion,
    bridge,
  );
  inspectionApp = replay.app;
  raw = null;
  config.recording = null;
  baseline = recording.baseline.sequence;
  end = recording.end.sequence;
  checkpointSequence = baseline;
  try {
    keyframes = [{ point: recording.baseline, index: 0 }];
    charges = [0];
    for (let index = 0; index < recording.records.length; index++) {
      const record = recording.records[index];
      port.prepareRoute(record.after.route);
      if (record.checkpoint !== null)
        keyframes.push({
          index: index + 1,
          point: {
            sequence: record.sequence,
            snapshot: record.checkpoint,
            route: record.after.route,
          },
        });
      const packets = record.events.filter(
        (event) => event.type === "input" && event.phase === "dispatched",
      );
      const actions = record.events.filter(
        (event) => event.type === "action" && event.phase === "queued",
      );
      eligible.push(
        packets.every((event) => event.input.packet.kind === "action") &&
          actions.every((event) => names.has(event.packet.name)),
      );
      charges.push(charges.at(-1) + Math.max(1, record.actions));
    }
  } catch (cause) {
    replay.dispose();
    throw new FrameworkError(
      "HISTORY_INCOMPATIBLE",
      "History checkpoint configuration is incompatible.",
      { cause },
    );
  }
  const app = () => branchApp ?? inspectionApp;
  function status() {
    const closed = disposed || app().status === "disposed",
      current = replay?.status ?? lastStatus;
    const inspecting = !closed && !branchApp && !current.divergence;
    return Object.freeze({
      status: closed
        ? "disposed"
        : branchApp
          ? "branched"
          : current.divergence
            ? "diverged"
            : "inspecting",
      baselineSequence: baseline,
      endSequence: end,
      sequence: branchApp ? end : current.sequence,
      position: branchApp ? 0 : current.position,
      records: recording?.records.length ?? 0,
      canUndo:
        inspecting &&
        current.position > 0 &&
        eligible[current.position - 1] === true,
      canRedo: inspecting && eligible[current.position] === true,
      checkpointSequence,
      replayedRoots,
      replayedSlots,
      discardedRecords,
      divergence: branchApp ? null : current.divergence,
    });
  }
  function check() {
    if (disposed || app().status === "disposed")
      fail("HISTORY_DISPOSED", "History controller is disposed.");
    if (busy)
      fail(
        "HISTORY_REENTRANT",
        "History operations require an idle controller boundary.",
      );
    if (branchApp)
      fail(
        "HISTORY_BRANCHED",
        "This branch discarded its inspection/redo history.",
      );
    port.check();
  }
  function target(sequence) {
    if (!logicalTime(sequence))
      fail(
        "HISTORY_INVALID",
        "Seek requires a nonnegative safe integer root sequence.",
      );
    if (sequence < baseline)
      fail("HISTORY_EXPIRED", "Requested root precedes the retained baseline.");
    if (sequence > end)
      fail("HISTORY_RANGE", "Requested root exceeds the captured end.");
    return sequence - baseline;
  }
  function seek(sequence) {
    check();
    const index = target(sequence);
    if (sequence === replay.status.sequence && !replay.status.divergence)
      return status();
    // Binary search the already validated snapshot index; retain no duplicate log.
    let low = 0,
      high = keyframes.length;
    while (low + 1 < high) {
      const mid = Math.floor((low + high) / 2);
      if (keyframes[mid].index <= index) low = mid;
      else high = mid;
    }
    const keyframe = keyframes[low];
    busy = true;
    checkpointSequence = keyframe.point.sequence;
    replayedRoots = replayedSlots = 0;
    try {
      try {
        port.restore(keyframe.point, keyframe.index);
      } catch (cause) {
        throw new FrameworkError(
          "HISTORY_RESTORE_FAILED",
          "History cursor/state restored; notification failed.",
          { cause },
        );
      }
      let remaining = index - keyframe.index;
      while (remaining > 0 && !replay.status.divergence) {
        const count = Math.min(remaining, 1024),
          before = replay.status.position;
        replay.step(count);
        const after = replay.status.position;
        replayedRoots += after - before;
        replayedSlots += charges[after] - charges[before];
        remaining -= after - before;
      }
      return status();
    } finally {
      busy = false;
    }
  }
  function move(count, direction) {
    check();
    if (!Number.isInteger(count) || count < 1 || count > 1024)
      fail(
        "HISTORY_INVALID",
        "undo/redo count requires 1–1024 complete roots.",
      );
    if (replay.status.divergence)
      fail(
        "HISTORY_DIVERGED",
        "Seek a valid checkpoint before undo/redo or branching.",
      );
    const before = replay.status.position,
      after = before + direction * count;
    if (after < 0)
      fail("HISTORY_EXPIRED", "Undo exceeds the retained baseline.");
    if (after > recording.records.length)
      fail("HISTORY_RANGE", "Redo exceeds the captured end.");
    for (
      let index = Math.min(before, after);
      index < Math.max(before, after);
      index++
    )
      if (!eligible[index])
        fail(
          "HISTORY_IRREVERSIBLE",
          "Undo/redo cannot cross an undeclared action or route/hydration barrier.",
        );
    return seek(baseline + after);
  }
  return Object.freeze({
    get app() {
      return app();
    },
    get status() {
      return status();
    },
    seek,
    undo: (count = 1) => move(count, -1),
    redo: (count = 1) => move(count, 1),
    branch() {
      check();
      if (replay.status.divergence)
        fail("HISTORY_DIVERGED", "Seek a valid checkpoint before branching.");
      busy = true;
      try {
        const next = port.fork(),
          selected = replay.status.sequence;
        discardedRecords = recording.records.length - replay.status.position;
        handingOff = true;
        try {
          replay.dispose();
        } finally {
          branchApp = next;
          inspectionApp = null;
          baseline = end = selected;
          checkpointSequence = selected;
          clear();
          replay = null;
          handingOff = false;
        }
        return next;
      } finally {
        busy = false;
      }
    },
    dispose() {
      if (disposed || app().status === "disposing") return;
      if (busy)
        fail("HISTORY_REENTRANT", "Cannot dispose during a history operation.");
      if (!branchApp) port?.check();
      try {
        app().dispose();
      } finally {
        disposed = true;
        clear();
        replay = null;
      }
    },
  });
}
