import { fail, requireSync } from "../errors.js";
import { readRecord } from "../records.js";

// Capture and nonbubbling registrations use the element's native listener.
const bubbling = new Set([
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "input",
  "beforeinput",
  "change",
  "submit",
  "reset",
  "keydown",
  "keyup",
  "keypress",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "paste",
  "copy",
  "cut",
  "focusin",
  "focusout",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
  "pointercancel",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "wheel",
  "dragstart",
  "dragend",
  "dragover",
  "drop",
]);

export function eventMap(value) {
  if (value == null) return Object.freeze(Object.create(null));
  const map = readRecord(value, "EVENT_OPTIONS_INVALID", "on");
  for (const type of Object.keys(map)) {
    if (!/^[a-z][a-z0-9:-]*$/.test(type))
      fail(
        "EVENT_TYPE_INVALID",
        "Event names must be lowercase native event types.",
      );
    const raw = map[type];
    if (raw == null) continue;
    const options =
      typeof raw === "function"
        ? { handler: raw }
        : readRecord(raw, "EVENT_OPTIONS_INVALID", `on.${type}`, [
            "handler",
            "capture",
            "passive",
            "once",
          ]);
    if (typeof options.handler !== "function")
      fail(
        "EVENT_HANDLER_INVALID",
        `on.${type} requires a synchronous handler.`,
      );
    for (const key of ["capture", "passive", "once"]) {
      if (options[key] !== undefined && typeof options[key] !== "boolean")
        fail("EVENT_OPTIONS_INVALID", `${key} requires a boolean.`);
    }
    map[type] = Object.freeze({
      handler: options.handler,
      capture: options.capture === true,
      passive: options.passive === true,
      once: options.once === true,
    });
  }
  return Object.freeze(map);
}

export function createEvents(target, runEvent) {
  const entries = new Set(),
    delegates = new Map();
  let disposed = false;
  const pathOf = (event) => {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    if (!path.length)
      for (let node = event.target; node; node = node.parentNode)
        path.push(node);
    return path;
  };
  function invoke(route, nativeEvent) {
    if (disposed || !route.some((entry) => entry.live && entry.active()))
      return;
    runEvent(() => {
      const errors = [];
      let stopped = false,
        immediate = false,
        lastNode;
      for (const entry of route) {
        if (immediate || (stopped && entry.node !== lastNode)) break;
        if (disposed || !entry.live || !entry.active()) continue;
        lastNode = entry.node;
        const handler = entry.handler;
        try {
          if (entry.once) entry.remove();
          const context = Object.freeze({
            type: nativeEvent.type,
            target: nativeEvent.target,
            currentTarget: entry.node,
            nativeEvent,
            get defaultPrevented() {
              return nativeEvent.defaultPrevented;
            },
            preventDefault() {
              if (entry.passive)
                fail(
                  "EVENT_PASSIVE",
                  "A passive framework handler cannot preventDefault.",
                );
              nativeEvent.preventDefault();
            },
            stopPropagation() {
              stopped = true;
              nativeEvent.stopPropagation();
            },
            stopImmediatePropagation() {
              stopped = immediate = true;
              nativeEvent.stopImmediatePropagation();
            },
          });
          requireSync(
            entry.legacy ? handler() : handler(context),
            "EVENT_ASYNC",
            "Event handlers must be synchronous.",
          );
          stopped ||= nativeEvent.cancelBubble === true;
        } catch (error) {
          errors.push(error);
          stopped ||= nativeEvent.cancelBubble === true;
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(
          errors,
          "Event handlers failed; remaining live handlers were attempted.",
        );
    });
  }
  function register(node, type, handler, active, options = {}) {
    if (handler == null) return () => {};
    if (typeof handler !== "function")
      fail(
        "EVENT_HANDLER_INVALID",
        `${type} requires a synchronous function, null or undefined.`,
      );
    if (disposed) fail("SCOPE_DISPOSED", "Event registration is disposed.");
    const entry = { node, type, handler, active, live: true, ...options };
    const delegated = !entry.capture && !entry.direct && bubbling.has(type);
    let group, listener;
    if (delegated) {
      group = delegates.get(type);
      if (!group) {
        group = {
          entries: new Map(),
          listener: (event) => {
            if (disposed) return;
            const path = pathOf(event),
              root = path.indexOf(target);
            if (root < 0) return;
            invoke(
              path
                .slice(0, root + 1)
                .flatMap((node) => [...(group.entries.get(node) ?? [])]),
              event,
            );
          },
        };
        // False avoids browser passive defaults. Entries enforce their own
        // cancellation contract through the framework event context.
        target.addEventListener(type, group.listener, { passive: false });
        delegates.set(type, group);
      }
      if (!group.entries.has(node)) group.entries.set(node, new Set());
      group.entries.get(node).add(entry);
    } else {
      listener = (event) => invoke([entry], event);
      node.addEventListener(type, listener, {
        capture: !!entry.capture,
        passive: !!entry.passive,
      });
    }
    entries.add(entry);
    entry.remove = () => {
      if (!entry.live) return;
      entry.live = false;
      entries.delete(entry);
      entry.handler = null;
      if (!delegated) node.removeEventListener(type, listener, !!entry.capture);
      else {
        const owned = group.entries.get(node);
        owned?.delete(entry);
        if (!owned?.size) group.entries.delete(node);
        if (!group.entries.size) {
          delegates.delete(type);
          target.removeEventListener(type, group.listener);
        }
      }
    };
    return entry.remove;
  }
  return Object.freeze({
    register,
    counts: () => ({
      handlers: entries.size,
      listeners:
        delegates.size +
        [...entries].filter(
          (entry) => entry.capture || entry.direct || !bubbling.has(entry.type),
        ).length,
    }),
    dispose() {
      disposed = true;
      const errors = [];
      for (const entry of [...entries])
        try {
          entry.remove();
        } catch (error) {
          errors.push(error);
        }
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(errors, "Event listener cleanup failed.");
    },
  });
}
