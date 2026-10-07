import { FrameworkError, fail } from "../errors.js";
import { inspectGraph, freezeGraph } from "../state/data.js";
import { createGraphCodec } from "./graph.js";
import { sha256 } from "./sha256.js";
import {
  RANDOM_ALGORITHM,
  initialWord,
  uint32,
  logicalTime,
} from "../determinism/controls.js";
export const CHECKPOINT_FORMAT = "mini-framework-checkpoint";
export const CHECKPOINT_VERSION = 1;
export const RUNTIME_VERSION = "mini-framework-runtime/1";
export const MAX_CHECKPOINT_BYTES = 8_388_608;
const invalid = (message) => fail("SNAPSHOT_INVALID", message);
const codec = createGraphCodec({
  format: "mini-framework-state-graph",
  version: 1,
  defaultLimits: Object.freeze({
    maxBytes: MAX_CHECKPOINT_BYTES,
    maxNodes: 10_000,
    maxEntries: 100_000,
    maxDepth: 128,
    maxArrayLength: 100_000,
    maxArraySlots: 100_000,
  }),
  fail: (message) =>
    fail(
      message.includes("exceeds") ? "SNAPSHOT_LIMIT" : "SNAPSHOT_INVALID",
      message,
    ),
});
function bytes(text) {
  if (typeof text !== "string")
    invalid("Snapshot must be a canonical JSON string.");
  if (
    text.length > MAX_CHECKPOINT_BYTES ||
    new TextEncoder().encode(text).length > MAX_CHECKPOINT_BYTES
  )
    fail("SNAPSHOT_LIMIT", "Checkpoint exceeds 8,388,608 UTF-8 bytes.");
}
function fields(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    invalid("Malformed checkpoint fields.");
}
function metadata(value) {
  fields(value, [
    "format",
    "version",
    "runtimeVersion",
    "schemaVersion",
    "stateVersion",
    "controls",
    "state",
  ]);
  if (
    value.format !== CHECKPOINT_FORMAT ||
    value.version !== CHECKPOINT_VERSION ||
    value.runtimeVersion !== RUNTIME_VERSION
  )
    fail(
      "SNAPSHOT_INCOMPATIBLE",
      "Unsupported checkpoint format/version/runtime.",
    );
  if (
    typeof value.schemaVersion !== "string" ||
    !value.schemaVersion.trim() ||
    value.schemaVersion.length > 128 ||
    !Number.isSafeInteger(value.stateVersion) ||
    value.stateVersion < 1
  )
    invalid("Invalid schema or state version.");
  fields(value.controls, ["clock", "random"]);
  const { clock, random } = value.controls;
  fields(clock, ["mode", "time", "tick", "tickDuration"]);
  if (clock.mode === "manual") {
    if (
      clock.tick !== 0 ||
      Object.is(clock.tick, -0) ||
      clock.tickDuration !== null
    )
      fail(
        "SNAPSHOT_INCOMPATIBLE",
        "Manual clocks require tick 0 and no tick duration.",
      );
  } else if (clock.mode === "fixed") {
    if (
      !logicalTime(clock.tick) ||
      !logicalTime(clock.tickDuration) ||
      clock.tickDuration === 0 ||
      !logicalTime(clock.tick * clock.tickDuration) ||
      clock.time < clock.tick * clock.tickDuration
    )
      invalid("Invalid fixed clock continuation.");
  } else fail("SNAPSHOT_INCOMPATIBLE", "Unsupported clock mode.");
  if (!logicalTime(clock.time)) invalid("Invalid logical clock time.");
  fields(random, ["algorithm", "seed", "state", "draws"]);
  if (random.algorithm !== RANDOM_ALGORITHM)
    fail("SNAPSHOT_INCOMPATIBLE", "Unsupported random algorithm.");
  if (
    !uint32(random.seed) ||
    !uint32(random.state) ||
    random.state === 0 ||
    !logicalTime(random.draws) ||
    (random.draws === 0 && random.state !== initialWord(random.seed))
  )
    invalid("Invalid PRNG continuation.");
}
function stateData(value) {
  if (!value || typeof value !== "object")
    invalid("Checkpoint state root must be an object or array.");
  try {
    inspectGraph(value);
  } catch (cause) {
    throw new FrameworkError(
      cause.code === "STATE_LIMIT" ? "SNAPSHOT_LIMIT" : "SNAPSHOT_INVALID",
      "Checkpoint state requires bounded supported acyclic data.",
      { cause },
    );
  }
}
export function encodeCheckpoint(state, stateVersion, schemaVersion, controls) {
  stateData(state);
  const envelope = {
    format: CHECKPOINT_FORMAT,
    version: CHECKPOINT_VERSION,
    runtimeVersion: RUNTIME_VERSION,
    schemaVersion,
    stateVersion,
    controls,
    state: JSON.parse(codec.encode(state)),
  };
  metadata(envelope);
  const { clock, random } = controls;
  envelope.controls = {
    clock: {
      mode: clock.mode,
      time: clock.time,
      tick: clock.tick,
      tickDuration: clock.tickDuration,
    },
    random: {
      algorithm: random.algorithm,
      seed: random.seed,
      state: random.state,
      draws: random.draws,
    },
  };
  const text = JSON.stringify(envelope);
  bytes(text);
  return text;
}
export function decodeCheckpoint(text, schemaVersion) {
  bytes(text);
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    invalid("Malformed checkpoint JSON.");
  }
  metadata(envelope);
  if (schemaVersion !== undefined && envelope.schemaVersion !== schemaVersion)
    fail(
      "SNAPSHOT_INCOMPATIBLE",
      "Checkpoint action schema version does not match this application.",
    );
  const state = codec.decode(JSON.stringify(envelope.state));
  stateData(state);
  if (
    encodeCheckpoint(
      state,
      envelope.stateVersion,
      envelope.schemaVersion,
      envelope.controls,
    ) !== text
  )
    invalid("Noncanonical checkpoint encoding.");
  return Object.freeze({
    state: freezeGraph(state),
    stateVersion: envelope.stateVersion,
    schemaVersion: envelope.schemaVersion,
    controls: freezeGraph(envelope.controls),
  });
}
export function hashSnapshot(text) {
  decodeCheckpoint(text);
  return sha256(text);
}
