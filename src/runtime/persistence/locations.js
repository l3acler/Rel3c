import { FrameworkError, fail, requireSync } from "../errors.js";
import { readRecord } from "../records.js";
import { put, freezeGraph } from "../state/data.js";
import { encodeSnapshot, decodeSnapshot } from "./codec.js";

const areas = ["session", "local"],
  MAX_ERRORS = 16;
const error = (code, message, cause, source, field = null) =>
  Object.assign(new FrameworkError(code, message, { cause }), {
    source,
    field,
  });
function validate(field, value) {
  try {
    const { validate } = field;
    const result = validate(value);
    requireSync(
      result,
      "PERSIST_VALIDATE_ASYNC",
      "Persistence guards must be synchronous.",
    );
    if (result !== true)
      fail(
        "PERSIST_VALUE_INVALID",
        "Persistence guard must return exactly true.",
      );
  } catch (cause) {
    throw error(
      "PERSIST_VALUE_INVALID",
      "Invalid persisted field: " + field.name,
      cause,
      field.location,
      field.name,
    );
  }
}
export function ownPersistenceConfig(raw, state, schemaVersion, hasRouter) {
  const config = readRecord(raw, "PERSIST_CONFIG_INVALID", "persistence", [
    "namespace",
    "version",
    "fields",
  ]);
  const version = config.version === undefined ? schemaVersion : config.version;
  if (
    typeof config.namespace !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(config.namespace) ||
    typeof version !== "string" ||
    !version ||
    version.length > 128 ||
    Array.isArray(state)
  )
    fail(
      "PERSIST_CONFIG_INVALID",
      "Persistence requires an object root, identifier namespace and bounded nonempty version.",
    );
  const fields = readRecord(
    config.fields,
    "PERSIST_CONFIG_INVALID",
    "persistence fields",
  );
  if (Object.keys(fields).length > 64)
    fail(
      "PERSIST_CONFIG_INVALID",
      "At most 64 persistence fields are supported.",
    );
  const owned = [],
    keys = new Set();
  for (const name of Object.keys(fields)) {
    if (!Object.hasOwn(state, name))
      fail(
        "PERSIST_CONFIG_INVALID",
        "Persistence fields must exist in initialState.",
      );
    const entry = readRecord(
      fields[name],
      "PERSIST_CONFIG_INVALID",
      "persistence field",
      ["location", "validate", "key"],
    );
    if (
      !["memory", ...areas, "url"].includes(entry.location) ||
      (entry.location !== "memory" && typeof entry.validate !== "function") ||
      (entry.location === "memory" && entry.validate !== undefined) ||
      (entry.location !== "url" && entry.key !== undefined)
    )
      fail(
        "PERSIST_CONFIG_INVALID",
        "Each field requires one location and a nonmemory validation function; key is URL-only.",
      );
    const key = entry.key === undefined ? name : entry.key;
    if (
      entry.location === "url" &&
      (typeof key !== "string" ||
        !key ||
        key.length > 64 ||
        /[\u0000-\u001f]/.test(key))
    )
      fail(
        "PERSIST_CONFIG_INVALID",
        "URL keys require 1–64 characters without controls.",
      );
    if (entry.location === "url") {
      if (!hasRouter || keys.has(key))
        fail(
          "PERSIST_CONFIG_INVALID",
          "URL fields require a router and unique query keys.",
        );
      keys.add(key);
    }
    const field = Object.freeze({
      name,
      ...entry,
      key,
      queryKey: "mf:" + config.namespace + ":" + key,
    });
    if (field.location !== "memory") validate(field, state[name]);
    owned.push(field);
  }
  return Object.freeze({
    namespace: config.namespace,
    version,
    fields: Object.freeze(owned),
  });
}

export function createPersistence(
  config,
  store,
  router,
  scheduler,
  publish,
  guarded,
  admit = null,
  replay = false,
) {
  let host = null,
    cancel = null,
    dirty = false,
    disposed = false,
    flushing = false,
    dropped = 0;
  const reports = [],
    issues = [],
    written = new Map(),
    defaults = new Map();
  for (const field of config.fields)
    if (field.location === "url")
      defaults.set(field.name, store.getState()[field.name]);
  const selected = (location) =>
    config.fields.filter((field) => field.location === location);
  const projection = (fields, state) => {
    const values = Object.create(null);
    for (const field of fields) put(values, field.name, state[field.name]);
    return values;
  };
  const encode = (values) =>
    encodeSnapshot({
      namespace: config.namespace,
      version: config.version,
      values,
    });
  function record(failure, pending = true) {
    issues.push(
      Object.freeze({
        code: failure.code,
        source: failure.source ?? "persistence",
        field: failure.field ?? null,
        message: failure.message,
      }),
    );
    if (issues.length > MAX_ERRORS) issues.shift();
    if (pending) {
      if (reports.length === MAX_ERRORS) {
        reports.shift();
        dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + 1);
      }
      reports.push(failure);
      queue();
    }
  }
  function queue() {
    if (!host || disposed || flushing || cancel || (!dirty && !reports.length))
      return;
    try {
      cancel = scheduler.schedule("normal", () => flush());
    } catch (cause) {
      throw error(
        "PERSIST_SCHEDULE_FAILED",
        "Cannot schedule persistence work.",
        cause,
        "persistence",
      );
    }
  }
  function decode(text) {
    const envelope = readRecord(
      decodeSnapshot(text),
      "PERSIST_FORMAT_INVALID",
      "persistence envelope",
      ["namespace", "version", "values"],
    );
    if (
      envelope.namespace !== config.namespace ||
      envelope.version !== config.version
    )
      fail(
        "PERSIST_VERSION_INVALID",
        "Persistence namespace/schema version does not match.",
      );
    return readRecord(
      envelope.values,
      "PERSIST_FORMAT_INVALID",
      "persisted values",
    );
  }
  function accepted(field, value) {
    // The codec owns data; guards may inspect it but never mutate candidates.
    freezeGraph(value);
    guarded(() => validate(field, value));
    return value;
  }
  function storageInput(area) {
    const fields = selected(area);
    if (!fields.length) return null;
    const values = projection(fields, store.getState());
    let data;
    try {
      const storage = host[area + "Storage"];
      const text = storage.getItem(
        "mini-framework:" + config.namespace + ":" + area,
      );
      if (text === null) return null;
      data = decode(text);
    } catch (cause) {
      record(
        error(
          "PERSIST_READ_FAILED",
          "Cannot read valid " + area + " state; memory retained.",
          cause,
          area,
        ),
      );
      return null;
    }
    for (const field of fields)
      if (Object.hasOwn(data, field.name)) {
        try {
          put(values, field.name, accepted(field, data[field.name]));
        } catch (cause) {
          record(cause);
        }
      }
    return { fields, values };
  }
  function urlInput(route) {
    const fields = selected("url");
    if (!fields.length) return null;
    const values = Object.create(null);
    for (const field of fields) {
      put(values, field.name, defaults.get(field.name));
      const entries = route.query[field.queryKey];
      if (!entries) continue;
      try {
        if (entries.length !== 1)
          fail(
            "PERSIST_URL_INVALID",
            "Owned URL state keys must occur exactly once.",
          );
        const data = decode(entries[0]);
        if (Object.keys(data).length !== 1 || !Object.hasOwn(data, field.name))
          fail(
            "PERSIST_URL_INVALID",
            "URL state envelope must contain its configured field.",
          );
        put(values, field.name, accepted(field, data[field.name]));
      } catch (cause) {
        record(
          error(
            "PERSIST_URL_INVALID",
            "Invalid URL state; initial default retained.",
            cause,
            "url",
            field.name,
          ),
        );
      }
    }
    return { fields, values };
  }
  function apply(groups, fromInput = false) {
    const changes = [];
    for (const group of groups.filter(Boolean)) {
      if (
        encodeSnapshot(projection(group.fields, store.getState())) !==
        encodeSnapshot(group.values)
      )
        changes.push(group);
    }
    if (!changes.length) return;
    if (admit && !fromInput)
      return admit(
        {
          version: 1,
          kind: "hydration",
          namespace: config.namespace,
          schemaVersion: config.version,
          groups: changes.map((group) => ({
            location: group.fields[0].location,
            values: group.values,
          })),
        },
        () => apply(changes, true),
      );
    let result;
    try {
      result = store.run((draft) => {
        for (const group of changes)
          for (const field of group.fields)
            draft[field.name] = group.values[field.name];
      });
    } catch (cause) {
      record(
        error(
          "PERSIST_INPUT_FAILED",
          "Hydrated projection exceeds the state contract; memory retained.",
          cause,
          "input",
        ),
      );
      return;
    }
    publish(result);
  }
  function writeURL() {
    if (!selected("url").length) return;
    const updates = [];
    for (const field of selected("url")) {
      try {
        const value = store.getState()[field.name];
        accepted(field, value);
        const values = Object.create(null);
        put(values, field.name, value);
        const text = encode(values);
        updates.push([
          field.queryKey,
          encodeSnapshot(value) === encodeSnapshot(defaults.get(field.name))
            ? null
            : text,
        ]);
      } catch (cause) {
        record(
          error(
            "PERSIST_WRITE_FAILED",
            "Cannot encode URL state.",
            cause,
            "url",
            field.name,
          ),
        );
      }
    }
    if (updates.length)
      try {
        const request = router.prepareQuery(updates);
        if (request) router.commit(request, false); // State -> URL never feeds back into input hydration.
      } catch (cause) {
        record(
          error(
            "PERSIST_WRITE_FAILED",
            "Cannot replace URL state; memory retained.",
            cause,
            "url",
          ),
        );
      }
  }
  function flush() {
    const stop = cancel;
    cancel = null;
    stop?.();
    if (!host || disposed || flushing) return;
    flushing = true;
    const failures = reports.splice(0),
      lost = dropped;
    dropped = 0;
    const write = dirty;
    dirty = false;
    try {
      if (write)
        for (const area of areas) {
          const fields = selected(area);
          if (!fields.length) continue;
          try {
            const values = projection(fields, store.getState());
            for (const field of fields) accepted(field, values[field.name]);
            const text = encode(values);
            if (text !== written.get(area)) {
              host[area + "Storage"].setItem(
                "mini-framework:" + config.namespace + ":" + area,
                text,
              );
              written.set(area, text);
            }
          } catch (cause) {
            const failure = error(
              "PERSIST_WRITE_FAILED",
              "Cannot write " + area + " state; committed memory retained.",
              cause,
              area,
            );
            record(failure, false);
            failures.push(failure);
          }
        }
    } finally {
      flushing = false;
    }
    if (failures.length)
      throw new FrameworkError(
        "PERSIST_FAILED",
        "Persistence errors after fallback/healthy writes" +
          (lost ? "; " + lost + " older reports omitted" : "") +
          ".",
        {
          cause:
            failures.length === 1
              ? failures[0]
              : new AggregateError(failures, "Persistence failures."),
        },
      );
  }
  return Object.freeze({
    prepareInput(input) {
      if (
        input.namespace !== config.namespace ||
        input.schemaVersion !== config.version
      )
        fail(
          "INPUT_INCOMPATIBLE",
          "Hydration namespace/version does not match this app.",
        );
      if (!Array.isArray(input.groups) || input.groups.length > 3)
        fail(
          "INPUT_INVALID",
          "Hydration requires at most three location groups.",
        );
      const seen = new Set(),
        groups = [];
      for (const raw of input.groups) {
        const group = readRecord(raw, "INPUT_INVALID", "hydration group", [
          "location",
          "values",
        ]);
        if (
          ![...areas, "url"].includes(group.location) ||
          seen.has(group.location)
        )
          fail("INPUT_INVALID", "Invalid/duplicate hydration location.");
        seen.add(group.location);
        const values = readRecord(
            group.values,
            "INPUT_INVALID",
            "hydration values",
          ),
          fields = [];
        for (const name of Object.keys(values)) {
          const field = config.fields.find(
            (field) => field.name === name && field.location === group.location,
          );
          if (!field)
            fail(
              "INPUT_INVALID",
              "Hydration cannot assign an unconfigured field.",
            );
          accepted(field, values[name]);
          fields.push(field);
        }
        groups.push({ fields, values });
      }
      return groups;
    },
    applyInput(input) {
      apply(this.prepareInput(input), true);
    },
    applyPrepared(groups) {
      apply(groups, true);
    },
    start(window, hydrate = true) {
      if (replay) return;
      host = window;
      if (!hydrate) return;
      guarded(() =>
        apply([
          ...areas.map(storageInput),
          router ? urlInput(router.route) : null,
        ]),
      );
    },
    location(route, allowUnstarted = false) {
      if ((host || allowUnstarted) && !disposed)
        guarded(() => apply([urlInput(route)]));
    },
    committed() {
      if (replay) return;
      if (!host || disposed) return;
      guarded(writeURL);
      if (areas.some((area) => selected(area).length)) dirty = true;
      queue();
    },
    flush,
    get status() {
      return Object.freeze({
        active: !!host,
        pending: dirty || reports.length > 0,
        errors: Object.freeze([...issues]),
      });
    },
    counts: () => ({ persistenceTasks: Number(cancel !== null) }),
    stop() {
      const stop = cancel;
      cancel = null;
      host = null;
      dirty = false;
      reports.length = 0;
      dropped = 0;
      written.clear();
      stop?.();
    },
    dispose() {
      disposed = true;
      try {
        this.stop();
      } finally {
        defaults.clear();
        config = null;
      }
    },
  });
}
