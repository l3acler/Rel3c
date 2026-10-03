import { fail } from "../errors.js";
import { inspectGraph, copyGraph, freezeGraph, isObject } from "./data.js";

export function ownInitialState(input) {
  if (!isObject(input))
    fail("STATE_INVALID", "initialState root must be an object or array.");
  const { records } = inspectGraph(input);
  return freezeGraph(copyGraph(input, records).root);
}
