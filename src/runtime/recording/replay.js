import { FrameworkError, fail } from "../errors.js";
import { readRecord } from "../records.js";
import { createActionSchema, ownActionRegistry } from "../actions/schema.js";
import { createApplication } from "../app.js";
import { decodeCheckpoint } from "../serialization/checkpoint.js";
import { sha256 } from "../serialization/sha256.js";
import { freezeGraph } from "../state/data.js";
import {
  readRecording,
  serializeRecording,
  recordCodec,
  endpoint,
  errorSummary,
} from "./format.js";

const emptySchema = createActionSchema()(() => ({}));
export function createReplayController(raw, frameworkVersion, history = null) {
  const options = readRecord(raw, "REPLAY_INVALID", "replay", [
    "recording",
    "schema",
    "router",
    "persistence",
    "simulation",
    "view",
  ]);
  const schema = options.schema ?? emptySchema;
  ownActionRegistry(schema);
  let recording = readRecording(
    typeof options.recording === "string"
      ? options.recording
      : serializeRecording(options.recording),
    { schemaVersion: schema.version },
  );
  const clock = decodeCheckpoint(recording.baseline.snapshot, schema.version)
      .controls.clock,
    total = recording.records.length;
  raw = null;
  options.recording = null;
  let simulation = options.simulation;
  if (clock.mode === "fixed" && simulation === undefined) {
    const tick = recording.records.find(
      (record) => record.root.kind === "tick",
    );
    simulation = {
      tickDuration: clock.tickDuration,
      ...(tick?.root.action ? { action: tick.root.action } : {}),
    };
  }
  let port,
    app,
    position = 0,
    state = total ? "ready" : "complete",
    driving = false,
    work = null,
    divergence = null;
  let sequence = recording.baseline.sequence;
  const describe = (value) => {
    if (value === undefined) return "missing";
    try {
      const text = recordCodec.encode(value);
      return text.length > 2048 ? "sha256:" + sha256(text) : text;
    } catch {
      return "unsupported trace value";
    }
  };
  function mismatch(reason, expected, actual, index = null) {
    if (divergence) return;
    const record = work?.record;
    divergence = freezeGraph({
      sequence: record?.sequence ?? sequence,
      tick: record?.after.tick ?? app.controls.clock.tick,
      time: record?.after.time ?? app.controls.clock.time,
      action: work?.action ?? null,
      eventIndex: index,
      reason,
      expected: describe(expected),
      actual: describe(actual),
      expectedHash: record?.after.hash ?? null,
      actualHash: sha256(port.capture().snapshot),
    });
  }
  function normalized(event) {
    if (event?.type === "input" && event.phase === "dispatched")
      return {
        ...event,
        queued: false,
        input: { ...event.input, sequence: 0 },
      };
    // Observer/native presentation failures need not recur; committed versions do.
    if (
      event?.type === "input" &&
      ["succeeded", "failed"].includes(event.phase)
    )
      return { ...event, phase: "completed", error: null };
    return event;
  }
  function emit(event) {
    if (!work) return;
    const index = work.cursor++,
      expected = work.record.events[index];
    if (
      recordCodec.encode(normalized(expected)) !==
      recordCodec.encode(normalized(event))
    )
      mismatch("trace", expected, event, index);
  }
  function pump(predicate) {
    if (!work || divergence) return;
    let next;
    while (
      (next = work.record.events[work.cursor])?.type === "input" &&
      next.phase === "dispatched" &&
      next.input.derived &&
      predicate(next.input.packet)
    ) {
      const cursor = work.cursor;
      port.input(next.input, next.queued);
      if (work.cursor === cursor) break;
    }
  }
  const bridge = {
    get driving() {
      return driving;
    },
    connect(value) {
      port = value;
    },
    queued(name, args, parent) {
      if (!work) return null;
      const id = work.next++;
      work.actions.set(id, name);
      emit({
        type: "action",
        phase: "queued",
        id,
        parent: parent ?? null,
        packet: { version: 1, kind: "action", name, args },
      });
      return id;
    },
    action(id, phase, stateVersion, error) {
      if (!work) return;
      if (phase === "dispatched")
        work.action = work.actions.get(id)?.slice(0, 128) ?? null;
      emit({
        type: "action",
        phase,
        id,
        stateVersion,
        error: phase === "failed" ? errorSummary(error) : null,
      });
    },
    input(input, queued) {
      if (!work) return null;
      const id = work.next++,
        parent = work.packets.at(-1) ?? null;
      work.packets.push(id);
      emit({ type: "input", phase: "dispatched", id, parent, input, queued });
      return id;
    },
    inputEnd(id, stateVersion, error, failed) {
      if (!work) return;
      work.packets.pop();
      emit({
        type: "input",
        phase: failed ? "failed" : "succeeded",
        id,
        stateVersion,
        error: failed ? errorSummary(error) : null,
      });
    },
    published() {
      pump(
        (packet) =>
          packet.kind === "hydration" ||
          (packet.kind === "location" && packet.cause === "state"),
      );
    },
    location() {
      pump((packet) => packet.kind === "hydration");
    },
    localNavigation(url) {
      // The wire intentionally stores local locations, not a browser origin.
      // Permit an absolute body destination only when its local URL was admitted
      // as navigation in this root; failed cross-origin requests have no packet.
      return work?.record.events.some(
        (event) =>
          event.type === "input" &&
          event.phase === "dispatched" &&
          event.input.derived &&
          event.input.packet.kind === "navigation" &&
          event.input.packet.url === url,
      );
    },
    navigationLocation() {
      const next = work?.record.events[work.cursor];
      return (
        next?.type === "input" &&
        next.phase === "dispatched" &&
        next.input.packet.kind === "location"
      );
    },
    closed() {
      state = "disposed";
      recording = null;
      port = null;
      work = null;
      history?.closed();
    },
    counts: () => ({ replayTrace: work ? 1 : 0, ...history?.counts() }),
  };
  try {
    app = createApplication(
      {
        schema,
        snapshot: recording.baseline.snapshot,
        simulation,
        router: options.router,
        persistence: options.persistence,
        view: options.view,
      },
      frameworkVersion,
      bridge,
    );
    port.restoreRoute(recording.baseline.route);
    // All configuration/name/arity/packet compatibility checks precede execution/mount.
    for (const record of recording.records) {
      if (
        record.root.kind === "tick" &&
        (simulation?.action ?? null) !== record.root.action
      )
        fail(
          "REPLAY_INCOMPATIBLE",
          "Configured tick action differs from the recording.",
        );
      if (record.root.kind === "dispatch")
        port.preparePacket(record.root.packet);
      if (record.root.kind === "input")
        port.preparePacket(record.root.input.packet);
      for (const event of record.events) {
        if (event.type === "action" && event.phase === "queued")
          port.preparePacket(event.packet);
        if (event.type === "input" && event.phase === "dispatched")
          port.preparePacket(event.input.packet);
      }
    }
  } catch (cause) {
    try {
      app?.dispose();
    } catch (cleanup) {
      cause = new AggregateError(
        [cause, cleanup],
        "Replay preflight and cleanup failed.",
      );
    }
    throw new FrameworkError(
      "REPLAY_INCOMPATIBLE",
      "Replay configuration/packets are incompatible; no transition executed.",
      { cause },
    );
  }
  const status = () =>
    Object.freeze({
      status: app.status === "disposed" ? "disposed" : state,
      position,
      total,
      sequence,
      divergence,
    });
  function live() {
    if (state === "disposed" || app.status === "disposed")
      fail("REPLAY_DISPOSED", "Replay controller is disposed.");
  }
  function execute(record) {
    work = {
      record,
      cursor: 0,
      next: 1,
      actions: new Map(),
      packets: [],
      action: null,
    };
    driving = true;
    const root = record.root;
    try {
      if (root.kind === "dispatch")
        port.dispatch(root.packet.name, ...root.packet.args);
      else if (root.kind === "input") port.input(root.input, root.queued);
      else if (root.kind === "time") port.time(root.time);
      else
        port.tick(() => {
          const errors = [];
          for (const event of record.events)
            if (
              event.type === "input" &&
              event.phase === "dispatched" &&
              event.parent === null &&
              !event.input.derived
            ) {
              try {
                port.input(event.input, event.queued);
              } catch (error) {
                errors.push(error);
              }
            }
          if (errors.length)
            throw errors.length === 1
              ? errors[0]
              : new AggregateError(errors, "Recorded tick inputs failed.");
        });
    } catch (error) {
      // Transaction failures are evidenced by action traces. Runtime/presentation
      // failures with matching state are not rethrown through live error hooks.
      if (
        work.cursor === 0 &&
        record.events.length === 0 &&
        record.outcome !== "failed"
      )
        mismatch("root", null, errorSummary(error));
    } finally {
      driving = false;
    }
    if (work.cursor !== record.events.length)
      mismatch("trace", record.events[work.cursor], undefined, work.cursor);
    const captured = port.capture(),
      actual = endpoint(captured.snapshot, captured.route);
    const { route: expectedRoute, ...expectedState } = record.after,
      { route: actualRoute, ...actualState } = actual;
    if (JSON.stringify(expectedState) !== JSON.stringify(actualState))
      mismatch("state", expectedState, actualState);
    if (JSON.stringify(expectedRoute) !== JSON.stringify(actualRoute))
      mismatch("route", expectedRoute, actualRoute);
    if (divergence)
      divergence = freezeGraph({ ...divergence, actualHash: actual.hash });
    work = null;
    sequence = record.sequence;
    position++;
    state = divergence ? "diverged" : position === total ? "complete" : "ready";
  }
  function step(count = 1) {
    live();
    if (driving)
      fail(
        "REPLAY_REENTRANT",
        "Replay step/run cannot reenter an executing root.",
      );
    port.check();
    if (!Number.isInteger(count) || count < 1 || count > 1024)
      fail("REPLAY_INVALID", "step requires 1–1024 roots.");
    if (state === "complete" || state === "diverged") return status();
    state = "running";
    for (let i = 0; i < count && position < total && !divergence; i++)
      execute(recording.records[position]);
    return status();
  }
  if (history)
    history.connect(
      Object.freeze({
        recording,
        check: () => {
          live();
          port.check();
        },
        prepareRoute: port.prepareRoute,
        restore(point, index) {
          live();
          port.check();
          position = index;
          sequence = point.sequence;
          divergence = null;
          state = position === total ? "complete" : "ready";
          port.restore(point);
        },
        fork() {
          live();
          port.check();
          const point = port.capture();
          return createApplication(
            {
              schema,
              snapshot: point.snapshot,
              simulation,
              router: options.router,
              persistence: options.persistence,
              view: options.view,
            },
            frameworkVersion,
            null,
            { route: point.route },
          );
        },
      }),
    );
  return Object.freeze({
    app,
    get status() {
      return status();
    },
    step,
    run() {
      live();
      if (driving) fail("REPLAY_REENTRANT", "Replay cannot reenter.");
      port.check();
      while (state !== "complete" && state !== "diverged") step(1024);
      return status();
    },
    dispose() {
      if (state === "disposed") return;
      live();
      if (driving) fail("REPLAY_REENTRANT", "Cannot dispose during replay.");
      app.dispose();
    },
  });
}
