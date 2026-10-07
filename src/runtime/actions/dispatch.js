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

export function createDispatcher(
  store,
  registry,
  check,
  publish = () => {},
  controls = null,
  hooks = {},
) {
  let running = false,
    preparing = false,
    children = null,
    executing = false,
    postCommit = null,
    currentId = null;
  let traceSequence = 0, currentTraceId = null;
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
      return { spec, payload, name, traceId: ++traceSequence };
    } finally {
      preparing = false;
    }
  }

  return Object.freeze({
    isActive: () => running,
    isExecuting: () => executing,
    afterCommit(operation) {
      if (!executing || preparing)
        fail(
          "NAVIGATION_REENTRANT",
          "Navigation requests require an executing action.",
        );
      if (postCommit.length >= ACTION_LIMIT)
        fail(
          "ROUTE_QUEUE_LIMIT",
          "An action supports at most 1,024 navigation requests.",
        );
      postCommit.push(operation);
    },
    dispatch(name, ...args) {
      check();
      if (preparing)
        fail(
          "ACTION_REENTRANT",
          "Cannot dispatch from a payload guard or during payload admission.",
        );
      if (running) {
        const entry = prepare(name, args);
        entry.recordId = hooks.queued?.(
          name,
          entry.spec.input === "none" ? [] : [entry.payload],
          currentId,
        );
        hooks.trace?.("queued", entry.name, entry.traceId, currentTraceId, entry.spec.input === "none" ? [] : [entry.payload], store.getVersion());
        children.push(entry);
        return;
      }
      running = true;
      admitted = 0;
      traceSequence = 0;
      usage = zeroUsage();
      const queue = [],
        failures = [];
      try {
        const initial = prepare(name, args);
        const packet = {
          version: 1,
          kind: "action",
          name,
          args: initial.spec.input === "none" ? [] : [initial.payload],
        };
        const drain = () => {
          initial.recordId = hooks.queued?.(name, packet.args, null);
          hooks.trace?.("queued", initial.name, initial.traceId, null, packet.args, store.getVersion());
          queue.push(initial);
          // Release consumed entries rather than retaining the complete batch.
          while (queue.length) {
            const { spec, payload, recordId, name, traceId } = queue.shift();
            currentId = recordId;
            children = [];
            currentTraceId = traceId;
            postCommit = [];
            let result, serviceTransaction;
            hooks.trace?.("dispatched", name, traceId, null, null, store.getVersion());
            hooks.action?.(recordId, "dispatched", store.getVersion());
            try {
              const { run } = spec;
              serviceTransaction = controls?.begin(
                () => executing && !preparing,
              );
              result = store.run((draft) => {
                executing = true;
                try {
                  const services = serviceTransaction?.services;
                  const result =
                    spec.input === "none"
                      ? run(draft, services)
                      : run(draft, payload, services);
                  requireSync(
                    result,
                    "ACTION_ASYNC",
                    "Actions must be synchronous; Promise/thenable returns reject.",
                  );
                } finally {
                  executing = false;
                  serviceTransaction?.revoke();
                }
              });
              serviceTransaction?.commit();
              hooks.trace?.("committed", name, traceId, null, null, store.getVersion());
              hooks.action?.(recordId, "committed", store.getVersion());
              queue.push(...children);
            } catch (error) {
              serviceTransaction?.abort();
              failures.push(error);
              hooks.trace?.("failed", name, traceId, null, null, store.getVersion(), error);
              hooks.action?.(recordId, "failed", store.getVersion(), error);
              for (const child of children) {
                hooks.trace?.("discarded", child.name, child.traceId, traceId, null, store.getVersion());
                hooks.action?.(child.recordId, "discarded", store.getVersion());
              }
            }
            // Successful actions retain queued children and operations even if a
            // notification or native History write fails after publication.
            if (result) {
              try {
                publish(result);
              } catch (error) {
                failures.push(error);
              }
              for (const operation of postCommit)
                try {
                  operation();
                } catch (error) {
                  failures.push(error);
                }
            }
            children = postCommit = null;
          }
          if (failures.length === 1) throw failures[0];
          if (failures.length > 1)
            throw new AggregateError(
              failures,
              "Dispatch batch actions failed; successful actions remain committed.",
            );
        };
        return hooks.batch ? hooks.batch(packet, drain) : drain();
      } finally {
        queue.length = 0;
        children = null;
        postCommit = null;
        executing = false;
        currentId = null;
        currentTraceId = null;
        usage = null;
        admitted = 0;
        running = false;
      }
    },
  });
}
