// Persistence wire format, independently validated; not a replay checkpoint format.
export const SNAPSHOT_FORMAT = "mini-framework-persistence-graph";
export const SNAPSHOT_VERSION = 1;
export const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 262_144,
  maxNodes: 10_000,
  maxEntries: 100_000,
  maxDepth: 128,
  maxArrayLength: 100_000,
  maxArraySlots: 100_000,
});

import { FrameworkError } from "../errors.js";
import { createGraphCodec } from "../serialization/graph.js";
export class SnapshotError extends FrameworkError {
  constructor(message) {
    super("PERSIST_FORMAT_INVALID", message);
  }
}
const codec = createGraphCodec({
  format: SNAPSHOT_FORMAT,
  version: SNAPSHOT_VERSION,
  defaultLimits: DEFAULT_LIMITS,
  fail: (message) => {
    throw new SnapshotError(message);
  },
});
export const encodeSnapshot = codec.encode;
export const decodeSnapshot = codec.decode;
