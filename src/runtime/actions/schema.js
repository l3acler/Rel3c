import { fail, observePromise } from "../errors.js";
import { readRecord } from "../records.js";

const specifications = new WeakMap();
const schemas = new WeakMap();

export function createActionSchema(options = {}) {
  const { version = "app/1" } = readRecord(
    options,
    "SCHEMA_INVALID",
    "schema",
    ["version"],
  );
  if (typeof version !== "string" || !version.trim())
    fail("SCHEMA_INVALID", "Schema version must be a nonempty string.");
  return (build) => {
    if (typeof build !== "function")
      fail("SCHEMA_INVALID", "Schema builder must be a synchronous function.");
    function action(...args) {
      const input = args.length === 1 ? "none" : "payload";
      const validate = args.length === 2 ? args[0] : undefined;
      const run = args.at(-1);
      if (
        ![1, 2].includes(args.length) ||
        typeof run !== "function" ||
        (input === "payload" && typeof validate !== "function")
      ) {
        fail(
          "SCHEMA_INVALID",
          "Use action(run) or action(validatePayload, run).",
        );
      }

      const spec = Object.freeze({ input });
      specifications.set(spec, Object.freeze({ input, validate, run }));
      return spec;
    }
    const definitions = build(Object.freeze({ action }));
    observePromise(definitions);
    const record = readRecord(
      definitions,
      "SCHEMA_INVALID",
      "action definitions",
    );
    const registry = new Map();
    for (const name of Object.keys(record)) {
      const spec = specifications.get(record[name]);
      if (!name.trim() || !spec)
        fail(
          "SCHEMA_INVALID",
          "Actions require nonempty names and builder-created specifications.",
        );
      registry.set(name, spec);
    }
    const schema = Object.freeze({
      version,
      names: Object.freeze([...registry.keys()]),
    });
    schemas.set(schema, registry);
    return schema;
  };
}

// Every app gets a separate registry. Public metadata does not expose callbacks.
export function ownActionRegistry(schema) {
  const registry = schemas.get(schema);
  if (!registry)
    fail("SCHEMA_INVALID", "schema must come from createActionSchema.");
  return new Map(registry);
}
