import { FrameworkError, fail, requireSync } from "../errors.js";
import {
  inspectGraph,
  copyGraph,
  freezeGraph,
  addUsage,
  zeroUsage,
} from "../state/data.js";

// Internal limits; no public queue or transaction escape hatch.
const ACTION_LIMIT = 1_024;

function payloadError(error) {
  if (error instanceof FrameworkError && error.code.startsWith("STATE_"))
    return new FrameworkError(
      error.code.replace("STATE_", "PAYLOAD_"),
      "Payload requires bounded supported acyclic data.",
      { cause: error },
    );
  return error;
}

export function createDispatcher(store, registry, check) {
  let running = false,
    preparing = false,
    children = null;
  let admitted = 0,
    usage = null;

  function prepare(name, args) {
    if (typeof name !== "string" || !registry.has(name))
      fail("ACTION_UNKNOWN", "Unknown registered action name.");
    const spec = registry.get(name);
    if (args.length !== (spec.input === "none" ? 0 : 1))
      fail(
        "ACTION_ARITY",
        `Action ${name} requires ${spec.input === "none" ? "no arguments" : "one payload"}.`,
      );
    if (admitted >= ACTION_LIMIT)
      fail(
        "ACTION_QUEUE_LIMIT",
        "Dispatch batch exceeds 1,024 admitted actions.",
      );
    preparing = true;
    try {
      let payload,
        nextUsage = usage;
      if (spec.input === "payload") {
        try {
          const checked = inspectGraph(args[0]);
          nextUsage = addUsage(usage, checked.usage);
          payload = freezeGraph(copyGraph(args[0], checked.records).root);
        } catch (error) {
          throw payloadError(error);
        }
        const { validate } = spec;
        let valid;
        try {
          valid = validate(payload);
        } catch (cause) {
          throw new FrameworkError(
            "PAYLOAD_INVALID",
            `Payload guard for ${name} failed.`,
            { cause },
          );
        }
        requireSync(
          valid,
          "PAYLOAD_ASYNC",
          "Payload guards must return true synchronously.",
        );
        if (valid !== true)
          fail(
            "PAYLOAD_INVALID",
            `Payload guard for ${name} must return true.`,
          );
      }
      admitted++;
      usage = nextUsage;
      return { spec, payload };
    } finally {
      preparing = false;
    }
  }

  return Object.freeze({
    isActive: () => running,
    dispatch(name, ...args) {
      check();
      if (preparing)
        fail(
          "ACTION_REENTRANT",
          "Cannot dispatch from a payload guard or during payload admission.",
        );
      if (running) {
        children.push(prepare(name, args));
        return;
      }
      running = true;
      admitted = 0;
      usage = zeroUsage();
      const queue = [],
        failures = [];
      try {
        queue.push(prepare(name, args));
        // Release consumed entries rather than retaining the complete batch.
        while (queue.length) {
          const { spec, payload } = queue.shift();
          children = [];
          try {
            const { run } = spec;
            store.run((draft) => {
              const result =
                spec.input === "none" ? run(draft) : run(draft, payload);
              requireSync(
                result,
                "ACTION_ASYNC",
                "Actions must be synchronous; Promise/thenable returns reject.",
              );
            });
            queue.push(...children);
          } catch (error) {
            failures.push(error);
          } finally {
            children = null;
          }
        }
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1)
          throw new AggregateError(
            failures,
            "Dispatch batch actions failed; successful actions remain committed.",
          );
      } finally {
        queue.length = 0;
        children = null;
        usage = null;
        admitted = 0;
        running = false;
      }
    },
  });
}
