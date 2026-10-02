import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createApp,
  createActionSchema,
  FrameworkError,
  VERSION,
} from "mini-framework";
import { fakeDocument } from "./helpers/fake-dom.js";
const code = (expected) => (error) =>
  error instanceof FrameworkError && error.code === expected;
const host = () => fakeDocument().createElement("div");
function withDocument(document, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  }
}

test("default mount resolves #app lazily and preserves host content", () => {
  const document = fakeDocument();
  const target = document.createElement("div");
  const foreign = document.createTextNode("host ");
  target.appendChild(foreign);
  let lookups = 0;
  let views = 0;
  document.getElementById = (id) => { assert.equal(id, "app"); lookups++; return target; };
  withDocument(document, () => {
    const app = createApp({ view: () => { views++; return "owned"; } });
    assert.equal(lookups, 0);
    assert.equal(views, 0);
    const { mount } = app;
    assert.equal(mount(), app);
    assert.equal(lookups, 1);
    assert.equal(views, 1);
    assert.equal(target.textContent, "host owned");
    app.dispose();
    assert.deepEqual(target.childNodes, [foreign]);
  });
});
test("default mount fails clearly without DOM or #app and can retry after target appears", () => {
  const reports = [];
  const app = createApp({ view: () => "ready", onError: (error, info) => reports.push([error.code, info.phase]) });
  withDocument(undefined, () => {
    assert.throws(() => app.mount(), (error) => code("TARGET_INVALID")(error) && error.message.includes('id is "app"'));
    assert.equal(app.status, "created");
  });
  const document = fakeDocument();
  let target = null;
  document.getElementById = () => target;
  withDocument(document, () => {
    assert.throws(() => app.mount(), code("TARGET_INVALID"));
    assert.equal(app.status, "created");
    target = document.createElement("div");
    app.mount(undefined);
    assert.equal(target.textContent, "ready");
    app.dispose();
  });
  assert.deepEqual(reports, [["TARGET_INVALID", "mount"], ["TARGET_INVALID", "mount"]]);
});
test("explicit and configured targets bypass default lookup; invalid explicit targets do not fall back", () => {
  const document = fakeDocument();
  document.getElementById = () => { throw Error("Unexpected default lookup"); };
  withDocument(document, () => {
    const configured = createApp({ target: document.createElement("div"), view: () => "auto" });
    assert.equal(configured.mounted, true);
    configured.dispose();
    assert.throws(() => createApp({ target: null }), code("TARGET_INVALID"));
    const app = createApp({ target: undefined });
    for (const invalid of [null, "#app", {}, { nodeType: 1 }])
      assert.throws(() => app.mount(invalid), code("TARGET_INVALID"));
    assert.equal(app.status, "created");
    const custom = document.createElement("section");
    app.mount(custom);
    app.dispose();
  });
});
test("default targets use existing claims and check lifecycle before resolving DOM", () => {
  const document = fakeDocument();
  const target = document.createElement("div");
  let lookups = 0;
  document.getElementById = () => { lookups++; return target; };
  withDocument(document, () => {
    const a = createApp();
    const b = createApp();
    a.mount();
    assert.throws(() => b.mount(), code("TARGET_OWNED"));
    assert.equal(b.status, "created");
    assert.throws(() => a.mount(), code("APP_MOUNTED"));
    assert.equal(lookups, 2);
    a.dispose();
    assert.throws(() => a.mount(), code("APP_DISPOSED"));
    assert.equal(lookups, 2);
    b.mount();
    b.dispose();
    assert.equal(lookups, 3);
  });
});

test("createApp is headless-safe, lazy without target, frozen and method-detachable", () => {
  let calls = 0;
  const app = createApp({
    view: () => {
      calls++;
      return "hello";
    },
  });
  assert.equal(app.status, "created");
  assert.equal(app.mounted, false);
  assert.equal(app.version, VERSION);
  assert.equal(app.stateVersion, 1);
  assert.equal(calls, 0);
  assert.ok(Object.isFrozen(app));
  const { mount, dispose } = app;
  const target = host();
  assert.equal(mount(target), app);
  assert.equal(calls, 1);
  assert.equal(app.status, "mounted");
  assert.equal(target.textContent, "hello");
  dispose();
  dispose();
  assert.equal(app.status, "disposed");
  assert.equal(target.childNodes.length, 0);
  assert.throws(() => mount(target), code("APP_DISPOSED"));
  assert.throws(() => app.state, code("APP_DISPOSED"));
});
test("initial state is privately copied/read-only and independent between apps", () => {
  const initial = { nested: { count: 1 } };
  const a = createApp({ initialState: initial });
  const b = createApp({ initialState: initial });
  initial.nested.count = 9;
  assert.equal(a.state.nested.count, 1);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.state.nested, b.state.nested);
  assert.ok(!Object.isFrozen(initial.nested));
  assert.ok(Object.isFrozen(a.state.nested));
  assert.throws(() => {
    a.state.nested.count++;
  }, TypeError);
  assert.throws(() => {
    a.mounted = true;
  }, TypeError);
  a.dispose();
  assert.equal(b.state.nested.count, 1);
  b.dispose();
});
test("ownership preserves aliases/distinct nodes/prototypes/order/holes/undefined/negative zero", () => {
  const shared = Object.assign(Object.create(null), { count: -0 });
  const rows = new Array(4);
  rows[1] = shared;
  rows[3] = undefined;
  rows.named = shared;
  const initial = {
    first: shared,
    alias: shared,
    distinct: { count: -0 },
    rows,
    missing: undefined,
  };
  Object.defineProperty(initial, "__proto__", {
    value: "literal",
    enumerable: true,
  });
  const app = createApp({ initialState: Object.freeze(initial) });
  const state = app.state;
  assert.equal(state.first, state.alias);
  assert.equal(state.first, state.rows.named);
  assert.notEqual(state.first, state.distinct);
  assert.notEqual(state.first, shared);
  assert.equal(Object.getPrototypeOf(state.first), null);
  assert.equal(Object.getPrototypeOf(state), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(state), Reflect.ownKeys(initial));
  assert.equal(state.__proto__, "literal");
  assert.ok(Object.is(state.first.count, -0));
  assert.ok(Object.hasOwn(state, "missing"));
  assert.equal(state.rows.length, 4);
  assert.ok(!(0 in state.rows) && 3 in state.rows);
  app.dispose();
});
test("unsupported state types/prototypes/accessors fail before exposing an app", () => {
  let calls = 0;
  for (const value of [
    NaN,
    Infinity,
    1n,
    Symbol(),
    () => {},
    new Date(),
    new Map(),
    new Set(),
    /x/,
    new Uint8Array(1),
    Promise.resolve(),
    { then() {} },
    { nodeType: 1 },
    new (class Row {})(),
    new (class Rows extends Array {})(),
    Object.create({
      get then() {
        calls++;
      },
    }),
    Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        calls++;
      },
    }),
    Object.defineProperty({}, "hidden", { value: 1 }),
    { [Symbol()]: 1 },
    {
      toJSON() {
        calls++;
      },
    },
    vm.runInNewContext("({ value: 1 })"),
    vm.runInNewContext("[1]"),
  ]) {
    assert.throws(
      () => createApp({ initialState: { value } }),
      code("STATE_INVALID"),
    );
  }
  assert.equal(calls, 0);
  for (const initialState of [null, 1, "x"])
    assert.throws(() => createApp({ initialState }), code("STATE_INVALID"));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => createApp({ initialState: cyclic }), code("STATE_CYCLE"));
});
test("initial construction limits guard depth, aliases at deeper paths, entries, nodes, text and holes", () => {
  let deep = {};
  for (let i = 0; i < 128; i++) deep = { deep };
  const leaf = {};
  let chain = leaf;
  for (let i = 0; i < 127; i++) chain = { chain };
  const wide = {};
  for (let i = 0; i < 100_001; i++) wide["key" + i] = 1;
  for (const initialState of [
    deep,
    { first: leaf, chain },
    { rows: new Array(100_001) },
    { a: new Array(50_001), b: new Array(50_000) },
    { s: "x".repeat(1_000_001) },
    { rows: Array.from({ length: 10_000 }, () => ({})) },
    wide,
  ]) {
    assert.throws(() => createApp({ initialState }), code("STATE_LIMIT"));
  }
});
test("shared DAG is traversed once per node without ordinary property gets", () => {
  let gets = 0;
  let descriptions = 0;
  const leaf = new Proxy(
    { count: 1 },
    {
      get() {
        gets++;
      },
      getOwnPropertyDescriptor(target, key) {
        descriptions++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  let dag = leaf;
  for (let i = 0; i < 30; i++) dag = { left: dag, right: dag };
  const app = createApp({ initialState: dag });
  assert.equal(gets, 0);
  assert.equal(descriptions, 1);
  let node = app.state;
  for (let i = 0; i < 30; i++) {
    assert.equal(node.left, node.right);
    node = node.left;
  }
  assert.equal(node.count, 1);
  app.dispose();
});
test("config getters and unknown/planned options reject instead of silently doing nothing", () => {
  let calls = 0;
  assert.throws(
    () =>
      createApp(
        Object.defineProperty({}, "view", {
          enumerable: true,
          get() {
            calls++;
          },
        }),
      ),
    code("CONFIG_INVALID"),
  );
  assert.equal(calls, 0);
  for (const config of [
    null,
    [],
    { seed: 1 },
    { actions: {} },
    { view: 1 },
    { onError: true },
    { [Symbol()]: 1 },
  ]) {
    assert.throws(() => createApp(config), code("CONFIG_INVALID"));
  }
});
test("schemas register explicit modes, own names, frozen metadata and safe prototype-colliding names", () => {
  let executed = 0;
  const schema = createActionSchema({ version: "counter/1" })(({ action }) => {
    const record = Object.create(null);
    record.__proto__ = action(() => {
      executed++;
    });
    record.constructor = action(Number.isFinite, () => {
      executed++;
    });
    return record;
  });
  const a = createApp({ schema });
  const b = createApp({ schema });
  assert.deepEqual(a.actionNames, ["__proto__", "constructor"]);
  assert.equal(a.schemaVersion, "counter/1");
  assert.ok(
    Object.isFrozen(schema) &&
      Object.isFrozen(schema.names) &&
      Object.isFrozen(a.actions),
  );
  assert.equal(Object.getPrototypeOf(a.actions), null);
  assert.notEqual(a.actions, b.actions);
  for (const call of [
    () => a.actions.__proto__(),
    () => a.dispatch("constructor", 1),
  ])
    assert.throws(call, code("FEATURE_UNAVAILABLE"));
  assert.throws(() => a.dispatch("toString"), code("ACTION_UNKNOWN"));
  assert.throws(
    () =>
      a.dispatch({
        toString() {
          executed++;
        },
      }),
    code("ACTION_UNKNOWN"),
  );
  assert.equal(executed, 0);
  a.dispose();
  assert.throws(() => a.actions.__proto__(), code("APP_DISPOSED"));
  assert.throws(() => b.actions.__proto__(), code("FEATURE_UNAVAILABLE"));
  b.dispose();
});
test("schema validation rejects forged/accessor definitions and invalid helper/options", () => {
  let calls = 0;
  for (const options of [
    { version: "" },
    { version: 1 },
    { extra: true },
    null,
  ]) {
    assert.throws(() => createActionSchema(options), code("SCHEMA_INVALID"));
  }
  for (const build of [
    null,
    () => ({ forged: { input: "none" } }),
    () =>
      Object.defineProperty({}, "x", {
        enumerable: true,
        get() {
          calls++;
        },
      }),
    ({ action }) => ({ "": action(() => {}) }),
    ({ action }) => ({ x: action(null, () => {}) }),
    ({ action }) => ({ x: action() }),
  ]) {
    assert.throws(() => createActionSchema()(build), code("SCHEMA_INVALID"));
  }
  assert.equal(calls, 0);
  assert.throws(
    () => createApp({ schema: { version: "fake", names: [] } }),
    code("SCHEMA_INVALID"),
  );
});
test("mount invokes frozen context once and preserves host-owned children", () => {
  const target = host();
  const foreign = target.ownerDocument.createTextNode("host ");
  target.appendChild(foreign);
  let calls = 0;
  let context;
  const app = createApp({
    target,
    initialState: { message: "<img src=x onerror=alert(1)>" },
    view(value) {
      calls++;
      context = value;
      return value.state.message;
    },
  });
  assert.equal(calls, 1);
  assert.ok(Object.isFrozen(context));
  assert.equal(context.state, app.state);
  assert.equal(context.actions, app.actions);
  assert.equal(target.childNodes[0], foreign);
  assert.equal(target.childNodes[1].nodeType, 3);
  assert.equal(target.childNodes[1].data, app.state.message);
  assert.throws(() => app.mount(target), code("APP_MOUNTED"));
  app.dispose();
  assert.deepEqual(target.childNodes, [foreign]);
});
test("invalid targets, exclusive ownership and claim release are explicit", () => {
  const target = host();
  const a = createApp();
  const b = createApp();
  for (const value of [
    null,
    undefined,
    {},
    { nodeType: 1 },
    target.ownerDocument,
  ]) {
    assert.throws(() => a.mount(value), code("TARGET_INVALID"));
  }
  a.mount(target);
  assert.throws(() => b.mount(target), code("TARGET_OWNED"));
  assert.equal(b.status, "created");
  a.dispose();
  b.mount(target);
  b.dispose();
});
test("cleanup is LIFO and child scope precedes app scope; dispose-before-mount also cleans", () => {
  const calls = [];
  let leaked;
  const app = createApp({
    view(context) {
      leaked = context;
      context.onDispose(() => {
        calls.push("view-first");
      });
      context.onDispose(() => {
        calls.push("view-last");
      });
      return "hello";
    },
  });
  app.onDispose(() => {
    calls.push("app-first");
  });
  app.onDispose(() => {
    calls.push("app-last");
  });
  app.mount(host());
  app.dispose();
  app.dispose();
  assert.deepEqual(calls, ["view-last", "view-first", "app-last", "app-first"]);
  assert.throws(() => leaked.onDispose(() => {}), code("SCOPE_DISPOSED"));
  assert.throws(() => app.onDispose(() => {}), code("APP_DISPOSED"));
  const unopened = createApp();
  unopened.onDispose(() => {
    calls.push("unopened");
  });
  unopened.dispose();
  assert.equal(calls.at(-1), "unopened");
});
test("failed mount drains its scope, releases target and allows a fresh view attempt", () => {
  const target = host();
  const calls = [];
  const original = new Error("view failed");
  let attempts = 0;
  let stale;
  const app = createApp({
    view(context) {
      attempts++;
      if (attempts === 1) stale = context;
      context.onDispose(() => {
        calls.push(attempts);
      });
      if (attempts === 1) throw original;
      return "retried";
    },
  });
  app.onDispose(() => {
    calls.push("app");
  });
  assert.throws(
    () => app.mount(target),
    (error) => error.code === "VIEW_FAILED" && error.cause === original,
  );
  assert.equal(app.status, "created");
  assert.equal(target.childNodes.length, 0);
  assert.deepEqual(calls, [1]);
  const temporary = createApp({ target });
  temporary.dispose();
  app.mount(target);
  assert.throws(() => stale.onDispose(() => {}), code("SCOPE_DISPOSED"));
  app.dispose();
  assert.deepEqual(calls, [1, 2, "app"]);
});
test("partial DOM mount failure cleans the appended owned node and does not touch foreign children", () => {
  const target = host();
  const foreign = target.ownerDocument.createTextNode("host");
  target.appendChild(foreign);
  const append = target.appendChild;
  target.appendChild = function (node) {
    append.call(this, node);
    throw Error("insertion failed");
  };
  const app = createApp({ view: () => "owned" });
  assert.throws(() => app.mount(target), code("VIEW_FAILED"));
  assert.deepEqual(target.childNodes, [foreign]);
  target.appendChild = append;
  app.mount(target);
  app.dispose();
});
test("disposal continues through all failing callbacks, completes and aggregates failures", () => {
  const calls = [];
  const target = host();
  const one = new Error("one");
  const two = new Error("two");
  const app = createApp({ target });
  app.onDispose(() => {
    calls.push(1);
    throw one;
  });
  app.onDispose(() => {
    calls.push(2);
    throw two;
  });
  assert.throws(
    () => app.dispose(),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === two &&
      error.errors[1] === one,
  );
  assert.deepEqual(calls, [2, 1]);
  assert.equal(app.status, "disposed");
  assert.equal(target.childNodes.length, 0);
  app.dispose();
  const next = createApp({ target });
  next.dispose();
});
test("failed view and failed cleanup preserve both causes", () => {
  const app = createApp({
    view({ onDispose }) {
      onDispose(() => {
        throw new Error("cleanup");
      });
      throw new Error("view");
    },
  });
  assert.throws(
    () => app.mount(host()),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0].cause.message === "view" &&
      error.errors[1].message === "cleanup",
  );
  app.dispose();
});
test("onError observes operation failures without swallowing them or duplicate reports", () => {
  const observed = [];
  const schema = createActionSchema()(({ action }) => ({
    run: action(() => {}),
  }));
  const app = createApp({
    schema,
    onError(error, info) {
      observed.push([error.code, info.phase, Object.isFrozen(info)]);
    },
    view({ actions }) {
      actions.run();
      return "";
    },
  });
  assert.throws(() => app.mount(host()), code("FEATURE_UNAVAILABLE"));
  assert.deepEqual(observed, [["FEATURE_UNAVAILABLE", "dispatch", true]]);
  assert.equal(app.status, "created");
  app.dispose();
  assert.throws(
    () =>
      createApp({
        initialState: { n: Infinity },
        onError(error, info) {
          observed.push([error.code, info.phase]);
        },
      }),
    code("STATE_INVALID"),
  );
  assert.deepEqual(observed.at(-1), ["STATE_INVALID", "create"]);
});
test("throwing error observers preserve original operation failure", () => {
  const observer = new Error("observer");
  const app = createApp({
    onError() {
      throw observer;
    },
  });
  assert.throws(
    () => app.mount(null),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0].code === "TARGET_INVALID" &&
      error.errors[1] === observer,
  );
  app.dispose();
});
test("recursive error reporting does not recursively invoke the observer", () => {
  let calls = 0;
  let app;
  app = createApp({
    onError() {
      calls++;
      app.mount(null);
    },
  });
  assert.throws(
    () => app.mount(null),
    (error) =>
      error instanceof AggregateError &&
      error.errors.every((item) => item.code === "TARGET_INVALID"),
  );
  assert.equal(calls, 1);
  app.dispose();
});
test("runtime module graph contains only production-relative imports, never spikes or dependencies", () => {
  const directory = fileURLToPath(new URL("../src/", import.meta.url));
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        check(file);
        continue;
      }
      if (!file.endsWith(".js")) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g,
      )) {
        assert.ok(
          match[2].startsWith("."),
          "Runtime imports must remain relative: " + file,
        );
        const dependency = path.resolve(path.dirname(file), match[2]);
        assert.ok(
          dependency.startsWith(directory),
          "Runtime cannot import spike/tool modules",
        );
        assert.ok(fs.existsSync(dependency));
      }
    }
  }
  check(directory);
});
test("lifecycle reentrancy is guarded and reentrant dispose while cleaning is harmless", () => {
  let app;
  app = createApp({
    view() {
      app.dispose();
      return "";
    },
  });
  assert.throws(() => app.mount(host()), code("LIFECYCLE_REENTRANT"));
  assert.equal(app.status, "created");
  app.onDispose(() => {
    app.dispose();
    assert.throws(() => app.mount(host()), code("APP_DISPOSED"));
  });
  app.dispose();
});
test("cleanup registration rejects invalid callbacks without running them", () => {
  const app = createApp();
  assert.throws(() => app.onDispose(null), code("CLEANUP_INVALID"));
  app.dispose();
});
test("text-only boundary rejects DOM descriptors, numbers and unknown thenables without execution", () => {
  let calls = 0;
  for (const output of [
    1,
    false,
    {},
    {
      then() {
        calls++;
      },
    },
  ]) {
    const app = createApp({ view: () => output });
    assert.throws(() => app.mount(host()), code("VIEW_RESULT_INVALID"));
    app.dispose();
  }
  assert.equal(calls, 0);
  for (const output of [null, undefined, ""]) {
    const app = createApp({ target: host(), view: () => output });
    app.dispose();
  }
});
test("illegal async views/builders/cleanup/error hooks reject and native rejections are observed", async () => {
  assert.throws(
    () =>
      createActionSchema()(async () => {
        throw Error("builder rejection");
      }),
    code("SCHEMA_INVALID"),
  );
  const app = createApp({
    view: async () => {
      throw Error("view rejection");
    },
  });
  assert.throws(() => app.mount(host()), code("VIEW_RESULT_INVALID"));
  app.dispose();
  const cleanup = createApp({ target: host() });
  cleanup.onDispose(async () => {
    throw Error("cleanup rejection");
  });
  assert.throws(
    () => cleanup.dispose(),
    (error) => error.errors[0].code === "CLEANUP_ASYNC",
  );
  const observer = createApp({
    onError: async () => {
      throw Error("observer rejection");
    },
  });
  assert.throws(
    () => observer.mount(null),
    (error) => error.errors[1].code === "ERROR_HANDLER_ASYNC",
  );
  observer.dispose();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
