import { fail, requireSync } from "../errors.js";

function checkHandler(handler, name) {
  if (handler != null && typeof handler !== "function")
    fail(
      "EVENT_HANDLER_INVALID",
      `${name} requires a synchronous function, null or undefined.`,
    );
}
function cleanAll(cleanups) {
  const errors = [];
  while (cleanups.length)
    try {
      cleanups.pop()();
    } catch (error) {
      errors.push(error);
    }
  if (errors.length === 1) throw errors[0];
  if (errors.length)
    throw new AggregateError(errors, "Input listener cleanup failed.");
}
const modifiers = (event) => ({
  altKey: !!event.altKey,
  ctrlKey: !!event.ctrlKey,
  metaKey: !!event.metaKey,
  shiftKey: !!event.shiftKey,
});

export function keyboardInput(node, handler, active, events) {
  checkHandler(handler, "onKey");
  if (handler == null) return () => {};
  const held = new Map(),
    cleanups = [];
  let live = true;
  const emit = (data, context) =>
    requireSync(
      handler(
        Object.freeze({ ...data, held: Object.freeze([...held.values()]) }),
        context,
      ),
      "EVENT_ASYNC",
      "onKey must be synchronous.",
    );
  const listen = (target, type, callback) =>
    cleanups.push(
      events.register(target, type, callback, () => live && active(), {
        direct: true,
      }),
    );
  const reset = (reason, context) => {
    if (!held.size) return;
    held.clear();
    emit(
      {
        type: "reset",
        reason,
        key: "",
        code: "",
        location: 0,
        repeat: false,
        isComposing: false,
        ...modifiers({}),
      },
      Object.freeze({ ...context, currentTarget: node }),
    );
  };
  try {
    for (const type of ["keydown", "keyup"])
      listen(node, type, (context) => {
        const event = context.nativeEvent;
        const key = String(event.key ?? ""),
          code = String(event.code ?? ""),
          location = Number(event.location ?? 0);
        const identity = JSON.stringify([code && code !== "Unidentified" ? code : key, location]);
        if (type === "keydown") {
          if (!held.has(identity) && held.size >= 256) {
            held.clear();
            fail(
              "EVENT_INPUT_LIMIT",
              "A keyboard scope supports at most 256 held keys.",
            );
          }
          held.set(identity, Object.freeze({ key, code, location }));
        } else held.delete(identity);
        emit(
          {
            type,
            reason: null,
            key,
            code,
            location,
            repeat: !!event.repeat,
            isComposing: !!event.isComposing,
            ...modifiers(event),
          },
          context,
        );
      });
    listen(node, "focusout", (context) => {
      if (!node.contains(context.nativeEvent.relatedTarget))
        reset("focus", context);
    });
    const view = node.ownerDocument.defaultView,
      document = node.ownerDocument;
    if (view?.addEventListener)
      listen(view, "blur", (context) => reset("window-blur", context));
    if (document.addEventListener)
      listen(document, "visibilitychange", (context) => {
        if (document.visibilityState === "hidden") reset("hidden", context);
      });
  } catch (error) {
    live = false;
    try {
      cleanAll(cleanups);
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Keyboard setup and cleanup failed.",
      );
    }
    throw error;
  }
  return () => {
    live = false;
    held.clear();
    cleanAll(cleanups);
  };
}

export const isTextControl = (node) =>
  node.tagName.toLowerCase() === "textarea" ||
  (node.tagName.toLowerCase() === "input" &&
    ["text", "search", "url", "tel", "email", "password", "number"].includes(
      node.type,
    ));

// A value binding may be invalidated during composition. The renderer supplies
// a resume callback that rereads latest committed state; never replay an old write.
export function textInput(node, handler, active, events) {
  checkHandler(handler, "onText");
  if (!isTextControl(node))
    fail("TEXT_CONTROL_INVALID", "onText requires a text input or textarea.");
  const cleanups = [];
  let live = true,
    composing = false,
    deferred = null;
  let previousValue = node.value,
    previousComposing = false;
  const listen = (type, callback) =>
    cleanups.push(
      events.register(node, type, callback, () => live && active(), {
        direct: true,
      }),
    );
  const emit = (phase, context) => {
    const event = context.nativeEvent,
      value = node.value;
    if (value === previousValue && composing === previousComposing) return;
    previousValue = value;
    previousComposing = composing;
    if (handler == null) return;
    const payload = Object.freeze({
      type: "text",
      phase,
      value,
      isComposing: composing,
      inputType: typeof event.inputType === "string" ? event.inputType : "",
      data: typeof event.data === "string" ? event.data : null,
      selectionStart:
        typeof node.selectionStart === "number" ? node.selectionStart : null,
      selectionEnd:
        typeof node.selectionEnd === "number" ? node.selectionEnd : null,
      selectionDirection:
        typeof node.selectionDirection === "string"
          ? node.selectionDirection
          : null,
    });
    requireSync(
      handler(payload, context),
      "EVENT_ASYNC",
      "onText must be synchronous.",
    );
  };
  const finish = (context) => {
    composing = false;
    try {
      emit("commit", context);
    } finally {
      const resume = deferred;
      deferred = null;
      if (live && active()) resume?.();
    }
  };
  try {
    listen("compositionstart", () => {
      composing = true;
    });
    listen("compositionupdate", (context) => {
      composing = true;
      emit("composition", context);
    });
    listen("input", (context) => {
      composing ||= context.nativeEvent.isComposing === true;
      emit(composing ? "composition" : "input", context);
    });
    listen("compositionend", finish);
    listen("blur", (context) => {
      if (composing) finish(context);
    });
  } catch (error) {
    live = false;
    try {
      cleanAll(cleanups);
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Text setup and cleanup failed.",
      );
    }
    throw error;
  }
  return Object.freeze({
    defer(resume) {
      if (!composing) return false;
      deferred = resume;
      return true;
    },
    wrote(value) {
      if (!composing) {
        previousValue = value;
        previousComposing = false;
      }
    },
    dispose() {
      live = false;
      composing = false;
      deferred = null;
      cleanAll(cleanups);
    },
  });
}
