import { FrameworkError, fail } from "../errors.js";
import { readRecord } from "../records.js";
import { freezeGraph } from "../state/data.js";
import { createGraphCodec } from "../serialization/graph.js";
import {
  decodeCheckpoint,
  RUNTIME_VERSION,
} from "../serialization/checkpoint.js";
import { sha256 } from "../serialization/sha256.js";
import { logicalTime, uint32 } from "../determinism/controls.js";

export const MAX_RECORDING_BYTES = 67_108_864;
export const STATUS_RESERVE = 256;
const validatedRecordings = new WeakMap();
export const byteLength = (text) => new TextEncoder().encode(text).length;
const invalid = (message) => fail("RECORDING_INVALID", message);
export const recordCodec = createGraphCodec({
  format: "mini-framework-record-data",
  version: 1,
  defaultLimits: {
    maxBytes: MAX_RECORDING_BYTES,
    maxNodes: 20_000,
    maxEntries: 200_000,
    maxDepth: 136,
    maxArrayLength: 100_000,
    maxArraySlots: 200_000,
  },
  fail: invalid,
});
export function recordingPolicy(raw = {}) {
  const {
    mode = "recent",
    maxActions = 1024,
    maxBytes = 33_554_432,
    keyframeInterval = 64,
  } = readRecord(raw, "RECORDING_INVALID", "recording options", [
    "mode",
    "maxActions",
    "maxBytes",
    "keyframeInterval",
  ]);
  if (
    !["recent", "session"].includes(mode) ||
    !Number.isInteger(maxActions) ||
    maxActions < 1 ||
    maxActions > 100_000 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_RECORDING_BYTES ||
    !Number.isInteger(keyframeInterval) ||
    keyframeInterval < 1 ||
    keyframeInterval > 100_000
  )
    invalid(
      "Recording requires recent/session mode, 1–100000 action slots/interval and 1–67108864 bytes.",
    );
  return Object.freeze({ mode, maxActions, maxBytes, keyframeInterval });
}
export function errorSummary(error) {
  // Never retain application errors or call their accessors/toString.
  const text = (key, fallback, length) => {
    const value =
      error && (typeof error === "object" || typeof error === "function")
        ? Object.getOwnPropertyDescriptor(error, key)?.value
        : undefined;
    return typeof value === "string" ? value.slice(0, length) : fallback;
  };
  try {
    return Object.freeze({
      name: text("name", "Error", 128),
      message: text(
        "message",
        typeof error === "string" ? error.slice(0, 2048) : "Operation failed.",
        2048,
      ),
      code: text("code", null, 128),
    });
  } catch {
    return Object.freeze({
      name: "Error",
      message: "Operation failed.",
      code: null,
    });
  }
}
function fields(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    invalid("Malformed recording fields.");
}
function canonicalWire(wire) {
  const localRoute = (value) =>
    value === null
      ? null
      : { mode: value.mode, base: value.base, url: value.url };
  const point = (value) => ({
    sequence: value.sequence,
    snapshot: value.snapshot,
    route: localRoute(value.route),
  });
  const error = (value) =>
    value === null
      ? null
      : { name: value.name, message: value.message, code: value.code };
  const { mode, maxActions, maxBytes, keyframeInterval } = wire.policy;
  return JSON.stringify({
    format: wire.format,
    version: wire.version,
    runtimeVersion: wire.runtimeVersion,
    schemaVersion: wire.schemaVersion,
    policy: { mode, maxActions, maxBytes, keyframeInterval },
    status: wire.status,
    reason: wire.reason,
    evictedRecords: wire.evictedRecords,
    evictedActions: wire.evictedActions,
    baseline: point(wire.baseline),
    records: wire.records.map((record) => ({
      sequence: record.sequence,
      root: record.root,
      events: record.events,
      actions: record.actions,
      commits: record.commits,
      after: {
        hash: record.after.hash,
        stateVersion: record.after.stateVersion,
        tick: record.after.tick,
        time: record.after.time,
        draws: record.after.draws,
        randomState: record.after.randomState,
        route: localRoute(record.after.route),
      },
      checkpoint: record.checkpoint,
      outcome: record.outcome,
      error: error(record.error),
    })),
    end: point(wire.end),
  });
}
function summary(value) {
  if (value === null) return;
  fields(value, ["name", "message", "code"]);
  if (
    typeof value.name !== "string" ||
    value.name.length > 128 ||
    typeof value.message !== "string" ||
    value.message.length > 2048 ||
    (value.code !== null &&
      (typeof value.code !== "string" || value.code.length > 128))
  )
    invalid("Malformed recorded error summary.");
}
function route(value) {
  if (value === null) return;
  fields(value, ["mode", "base", "url"]);
  if (
    !["history", "hash"].includes(value.mode) ||
    typeof value.base !== "string" ||
    !value.base.startsWith("/") ||
    /[?#%\\\s]/.test(value.base) ||
    value.base.includes("//") ||
    (value.base.length > 1 && value.base.endsWith("/")) ||
    value.base.split("/").some((segment) => [".", ".."].includes(segment)) ||
    typeof value.url !== "string" ||
    !value.url.startsWith("/") ||
    value.url.startsWith("//") ||
    value.url.length > 8192 ||
    /[\\\u0000-\u0020]/.test(value.url)
  )
    invalid("Malformed recording route continuation.");
  const url = new URL(value.url, "https://mini-framework.invalid");
  if (url.pathname + url.search + url.hash !== value.url)
    invalid("Noncanonical recording route.");
  const location =
    value.mode === "hash"
      ? new URL(url.hash.slice(1) || "/", "https://mini-framework.invalid")
      : url;
  if (location.origin !== "https://mini-framework.invalid")
    invalid("Hash route must remain local.");
  try {
    location.pathname.split("/").forEach(decodeURIComponent);
  } catch {
    invalid("Malformed route path encoding.");
  }
}
function checkpoint(text, schemaVersion) {
  try {
    return decodeCheckpoint(text, schemaVersion);
  } catch (cause) {
    throw new FrameworkError(
      cause.code === "SNAPSHOT_INCOMPATIBLE"
        ? "RECORDING_INCOMPATIBLE"
        : cause.code === "SNAPSHOT_LIMIT"
          ? "RECORDING_LIMIT"
          : "RECORDING_INVALID",
      "Invalid recording checkpoint.",
      { cause },
    );
  }
}
export function endpoint(snapshot, recordedRoute) {
  const value = JSON.parse(snapshot),
    { clock, random } = value.controls;
  return {
    hash: sha256(snapshot),
    stateVersion: value.stateVersion,
    tick: clock.tick,
    time: clock.time,
    draws: random.draws,
    randomState: random.state,
    route: recordedRoute,
  };
}
function packet(value) {
  if (value?.version !== 1)
    fail("RECORDING_INCOMPATIBLE", "Unsupported recorded input version.");
  switch (value.kind) {
    case "action":
      fields(value, ["version", "kind", "name", "args"]);
      if (
        typeof value.name !== "string" ||
        !value.name.trim() ||
        !Array.isArray(value.args) ||
        value.args.length > 1 ||
        Object.keys(value.args).length !== value.args.length ||
        (value.args.length && !Object.hasOwn(value.args, "0"))
      )
        invalid("Malformed recorded action.");
      break;
    case "navigation":
      fields(value, ["version", "kind", "mode", "base", "url", "replace"]);
      route({ mode: value.mode, base: value.base, url: value.url });
      if (typeof value.replace !== "boolean")
        invalid("Malformed navigation policy.");
      break;
    case "location":
      fields(value, [
        "version",
        "kind",
        "mode",
        "base",
        "url",
        "cause",
        "hydrate",
      ]);
      route({ mode: value.mode, base: value.base, url: value.url });
      if (
        !["mount", "native", "navigation", "state"].includes(value.cause) ||
        typeof value.hydrate !== "boolean"
      )
        invalid("Malformed location policy.");
      break;
    case "hydration": {
      fields(value, [
        "version",
        "kind",
        "namespace",
        "schemaVersion",
        "groups",
      ]);
      if (
        typeof value.namespace !== "string" ||
        !value.namespace.trim() ||
        value.namespace.length > 128 ||
        typeof value.schemaVersion !== "string" ||
        !value.schemaVersion.trim() ||
        value.schemaVersion.length > 128 ||
        !Array.isArray(value.groups) ||
        value.groups.length > 3 ||
        Object.keys(value.groups).length !== value.groups.length
      )
        invalid("Malformed hydration metadata.");
      const locations = new Set();
      for (const group of value.groups) {
        fields(group, ["location", "values"]);
        if (
          !["session", "local", "url"].includes(group.location) ||
          locations.has(group.location)
        )
          invalid("Malformed hydration groups.");
        locations.add(group.location);
        readRecord(group.values, "RECORDING_INVALID", "hydration values");
      }
      break;
    }
    default:
      invalid("Unsupported recorded packet kind.");
  }
}
function input(value) {
  fields(value, ["sequence", "tick", "time", "derived", "packet"]);
  if (
    !logicalTime(value.sequence) ||
    value.sequence < 1 ||
    !logicalTime(value.tick) ||
    !logicalTime(value.time) ||
    typeof value.derived !== "boolean"
  )
    invalid("Malformed input receipt.");
  packet(value.packet);
}
function root(value) {
  switch (value?.kind) {
    case "dispatch":
      fields(value, ["kind", "packet"]);
      packet(value.packet);
      if (value.packet.kind !== "action")
        invalid("Dispatch requires an action.");
      break;
    case "input":
      fields(value, ["kind", "input", "queued"]);
      input(value.input);
      if (typeof value.queued !== "boolean")
        invalid("Malformed queued input metadata.");
      break;
    case "tick":
      fields(value, ["kind", "tick", "action"]);
      if (
        !logicalTime(value.tick) ||
        value.tick < 1 ||
        (value.action !== null &&
          (typeof value.action !== "string" || !value.action.trim()))
      )
        invalid("Malformed tick root.");
      break;
    case "time":
      fields(value, ["kind", "time"]);
      if (!logicalTime(value.time)) invalid("Malformed time root.");
      break;
    default:
      invalid("Unsupported recording root.");
  }
}
function trace(events, rootValue, before, after) {
  const actions = new Map(),
    packets = new Map(),
    stack = [],
    ready = [];
  let next = 1,
    admitted = 0,
    committed = 0;
  let version = before.stateVersion,
    failed = false;
  if (rootValue.kind === "time" && events.length)
    invalid("Manual time roots cannot contain action/input work.");
  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event))
      invalid("Malformed trace event.");
    if (event.type === "action" && event.phase === "queued") {
      fields(event, ["type", "phase", "id", "parent", "packet"]);
      packet(event.packet);
      if (
        event.packet.kind !== "action" ||
        event.id !== next++ ||
        (event.parent !== null &&
          actions.get(event.parent)?.phase !== "dispatched")
      )
        invalid("Invalid action ownership.");
      if (
        !admitted &&
        rootValue.kind === "dispatch" &&
        recordCodec.encode(event.packet) !==
          recordCodec.encode(rootValue.packet)
      )
        invalid("Dispatch root does not match its trace.");
      actions.set(event.id, {
        phase: "queued",
        parent: event.parent,
        children: [],
      });
      admitted++;
      if (event.parent === null) ready.push(event.id);
      else actions.get(event.parent).children.push(event.id);
    } else if (event.type === "action") {
      fields(event, ["type", "phase", "id", "stateVersion", "error"]);
      summary(event.error);
      const action = actions.get(event.id);
      if (
        !action ||
        !["dispatched", "committed", "failed", "discarded"].includes(
          event.phase,
        )
      )
        invalid("Invalid action trace phase.");
      if (event.phase === "dispatched") {
        if (
          action.phase !== "queued" ||
          ready.shift() !== event.id ||
          event.error !== null ||
          event.stateVersion !== version
        )
          invalid("Invalid action dispatch order.");
      } else if (event.phase === "discarded") {
        if (
          action.phase !== "queued" ||
          actions.get(action.parent)?.phase !== "failed" ||
          event.error !== null ||
          event.stateVersion !== version
        )
          invalid("Invalid discarded child.");
      } else {
        if (
          action.phase !== "dispatched" ||
          (event.phase === "committed" && event.error !== null) ||
          (event.phase === "failed" && event.error === null)
        )
          invalid("Invalid action outcome.");
        if (
          event.stateVersion !==
          version + (event.phase === "committed" ? 1 : 0)
        )
          invalid("Invalid committed version order.");
        if (event.phase === "committed") {
          version++;
          committed++;
          ready.push(...action.children);
        }
      }
      action.phase = event.phase;
      failed ||= event.phase === "failed";
    } else if (event.type === "input" && event.phase === "dispatched") {
      fields(event, ["type", "phase", "id", "parent", "input", "queued"]);
      input(event.input);
      if (
        event.id !== next++ ||
        event.parent !== (stack.at(-1) ?? null) ||
        typeof event.queued !== "boolean"
      )
        invalid("Invalid input ownership.");
      if (
        rootValue.kind === "input" &&
        !packets.size &&
        recordCodec.encode(event.input) !== recordCodec.encode(rootValue.input)
      )
        invalid("Input root does not match its trace.");
      if (event.input.tick !== after.tick || event.input.time !== after.time)
        invalid("Input clock differs from its execution root.");
      packets.set(event.id, event);
      stack.push(event.id);
    } else if (event.type === "input") {
      fields(event, ["type", "phase", "id", "stateVersion", "error"]);
      summary(event.error);
      if (
        !["succeeded", "failed"].includes(event.phase) ||
        stack.pop() !== event.id ||
        (event.phase === "succeeded" && event.error !== null) ||
        (event.phase === "failed" && event.error === null) ||
        !Number.isSafeInteger(event.stateVersion) ||
        event.stateVersion < version ||
        event.stateVersion > version + 1 ||
        (event.stateVersion !== version &&
          packets.get(event.id)?.input.packet.kind !== "hydration")
      )
        invalid("Invalid input outcome.");
      // Hydration can publish a state version without invoking a named action.
      version = event.stateVersion;
      failed ||= event.phase === "failed";
    } else invalid("Unsupported trace event.");
  }
  if (
    stack.length ||
    ready.length ||
    [...actions.values()].some(
      (value) => !["committed", "failed", "discarded"].includes(value.phase),
    ) ||
    version !== after.stateVersion
  )
    invalid("Incomplete execution trace.");
  if (
    (rootValue.kind === "dispatch" && !admitted) ||
    (rootValue.kind === "input" && !packets.size)
  )
    invalid("Missing root trace.");
  return { actions: admitted, committed, failed };
}

export function readRecording(text, options = {}) {
  const { schemaVersion } = readRecord(
    options,
    "RECORDING_INVALID",
    "recording import options",
    ["schemaVersion"],
  );
  if (
    schemaVersion !== undefined &&
    (typeof schemaVersion !== "string" || !schemaVersion.trim())
  )
    invalid("Invalid expected schema version.");
  if (typeof text !== "string")
    invalid("Recording input must be canonical JSON.");
  if (
    text.length > MAX_RECORDING_BYTES ||
    byteLength(text) > MAX_RECORDING_BYTES
  )
    fail("RECORDING_LIMIT", "Recording exceeds the hard byte limit.");
  let wire;
  try {
    wire = JSON.parse(text);
  } catch {
    invalid("Malformed recording JSON.");
  }
  fields(wire, [
    "format",
    "version",
    "runtimeVersion",
    "schemaVersion",
    "policy",
    "status",
    "reason",
    "evictedRecords",
    "evictedActions",
    "baseline",
    "records",
    "end",
  ]);
  if (
    wire.format !== "mini-framework-recording" ||
    wire.version !== 1 ||
    wire.runtimeVersion !== RUNTIME_VERSION
  )
    fail(
      "RECORDING_INCOMPATIBLE",
      "Unsupported recording format/runtime version.",
    );
  if (
    typeof wire.schemaVersion !== "string" ||
    !wire.schemaVersion.trim() ||
    wire.schemaVersion.length > 128 ||
    (schemaVersion !== undefined && schemaVersion !== wire.schemaVersion)
  )
    fail("RECORDING_INCOMPATIBLE", "Recording schema version does not match.");
  fields(wire.policy, ["mode", "maxActions", "maxBytes", "keyframeInterval"]);
  const policy = recordingPolicy(wire.policy);
  if (
    !["active", "stopped", "limit-reached"].includes(wire.status) ||
    !logicalTime(wire.evictedRecords) ||
    !logicalTime(wire.evictedActions) ||
    (wire.status === "limit-reached" &&
      ![
        "action-limit",
        "byte-limit",
        "baseline-limit",
        "capture-failed",
      ].includes(wire.reason)) ||
    (wire.status !== "limit-reached" && wire.reason !== null) ||
    (policy.mode === "session" && (wire.evictedRecords || wire.evictedActions))
  )
    invalid("Malformed recording status.");
  if (
    byteLength(JSON.stringify({ ...wire, status: "active", reason: null })) +
      STATUS_RESERVE >
    policy.maxBytes
  )
    fail(
      "RECORDING_LIMIT",
      "Recording exceeds its declared retained byte budget.",
    );
  for (const point of [wire.baseline, wire.end]) {
    fields(point, ["sequence", "snapshot", "route"]);
    if (!logicalTime(point.sequence)) invalid("Invalid baseline/end sequence.");
    route(point.route);
  }
  if (!Array.isArray(wire.records) || wire.records.length > policy.maxActions)
    fail("RECORDING_LIMIT", "Too many recording roots.");
  const baseline = checkpoint(wire.baseline.snapshot, wire.schemaVersion),
    end = checkpoint(wire.end.snapshot, wire.schemaVersion);
  let previous = endpoint(wire.baseline.snapshot, wire.baseline.route),
    sequence = wire.baseline.sequence,
    slots = 0;
  const records = [];
  for (const record of wire.records) {
    fields(record, [
      "sequence",
      "root",
      "events",
      "actions",
      "commits",
      "after",
      "checkpoint",
      "outcome",
      "error",
    ]);
    fields(record.after, [
      "hash",
      "stateVersion",
      "tick",
      "time",
      "draws",
      "randomState",
      "route",
    ]);
    route(record.after.route);
    summary(record.error);
    if (
      record.sequence !== ++sequence ||
      !logicalTime(record.actions) ||
      !logicalTime(record.commits) ||
      record.commits > 100_000_000 ||
      !["succeeded", "failed"].includes(record.outcome) ||
      (record.outcome === "succeeded" && record.error !== null) ||
      (record.outcome === "failed" && record.error === null) ||
      !Array.isArray(record.events) ||
      record.events.length > 500_000
    )
      invalid("Invalid recording record.");
    slots += Math.max(1, record.actions);
    if (slots > policy.maxActions)
      fail("RECORDING_LIMIT", "Recording exceeds its action-slot budget.");
    const value = recordCodec.decode(record.root);
    root(value);
    const after = record.after;
    if (
      typeof after.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(after.hash) ||
      !logicalTime(after.time) ||
      !logicalTime(after.tick) ||
      !Number.isSafeInteger(after.stateVersion) ||
      after.stateVersion !== previous.stateVersion + record.commits ||
      !logicalTime(after.draws) ||
      after.draws < previous.draws ||
      !uint32(after.randomState) ||
      after.randomState === 0 ||
      (after.draws === previous.draws &&
        after.randomState !== previous.randomState)
    )
      invalid("Invalid endpoint progression.");
    if (value.kind === "tick") {
      if (
        baseline.controls.clock.mode !== "fixed" ||
        value.tick !== previous.tick + 1 ||
        after.tick !== value.tick ||
        after.time !== previous.time + baseline.controls.clock.tickDuration
      )
        invalid("Invalid numbered tick progression.");
    } else if (
      after.tick !== previous.tick ||
      after.time !== (value.kind === "time" ? value.time : previous.time) ||
      (value.kind === "time" &&
        (baseline.controls.clock.mode !== "manual" ||
          value.time < previous.time))
    )
      invalid("Invalid clock progression.");
    const events = record.events.map((item) => recordCodec.decode(item)),
      counts = trace(events, value, previous, after);
    if (
      counts.actions !== record.actions ||
      counts.committed > record.commits ||
      (counts.failed && record.outcome !== "failed")
    )
      invalid("Trace counts differ from record metadata.");
    if (record.checkpoint !== null) {
      const keyframe = checkpoint(record.checkpoint, wire.schemaVersion);
      if (
        keyframe.controls.clock.mode !== baseline.controls.clock.mode ||
        keyframe.controls.clock.tickDuration !==
          baseline.controls.clock.tickDuration ||
        keyframe.controls.random.seed !== baseline.controls.random.seed
      )
        invalid("Keyframe control policy mismatch.");
      if (
        JSON.stringify(endpoint(record.checkpoint, after.route)) !==
        JSON.stringify(after)
      )
        invalid("Keyframe endpoint mismatch.");
    }
    records.push({ ...record, root: value, events });
    previous = after;
  }
  if (
    wire.end.sequence !== sequence ||
    JSON.stringify(endpoint(wire.end.snapshot, wire.end.route)) !==
      JSON.stringify(previous) ||
    end.controls.clock.mode !== baseline.controls.clock.mode ||
    end.controls.clock.tickDuration !== baseline.controls.clock.tickDuration ||
    end.controls.random.seed !== baseline.controls.random.seed
  )
    invalid("Invalid final continuation.");
  if (canonicalWire(wire) !== text) invalid("Noncanonical recording encoding.");
  const result = freezeGraph({ ...wire, records });
  validatedRecordings.set(result, text);
  return result;
}

/** Serialize only a validated, immutable recording; this never writes storage. */
export function serializeRecording(recording) {
  const text = validatedRecordings.get(recording);
  if (text === undefined)
    invalid(
      "serializeRecording requires a recording returned by readRecording.",
    );
  return text;
}
