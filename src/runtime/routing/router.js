import { FrameworkError, fail } from "../errors.js";
import { readRecord } from "../records.js";

const owners = new WeakMap(),
  MAX_URL = 8192;
const trim = (path) => (path === "/" ? path : path.replace(/\/+$/, ""));
function segments(path) {
  try {
    return path === "/"
      ? []
      : trim(path).slice(1).split("/").map(decodeURIComponent);
  } catch (cause) {
    throw new FrameworkError(
      "ROUTE_URL_INVALID",
      "Malformed percent encoding in route path.",
      { cause },
    );
  }
}
export function ownRouterConfig(raw) {
  const config = readRecord(raw, "ROUTER_CONFIG_INVALID", "router", [
    "mode",
    "base",
    "routes",
    "notFound",
  ]);
  const mode = config.mode === undefined ? "history" : config.mode,
    rawBase = config.base === undefined ? "/" : config.base;
  if (typeof rawBase !== "string")
    fail("ROUTER_CONFIG_INVALID", "Base path requires a string.");
  const base = trim(rawBase);
  if (
    !["history", "hash"].includes(mode) ||
    typeof base !== "string" ||
    !base.startsWith("/") ||
    /[?#%\\\s]/.test(base) ||
    base.includes("//") ||
    base.split("/").some((segment) => [".", ".."].includes(segment))
  )
    fail(
      "ROUTER_CONFIG_INVALID",
      "Router requires history/hash mode and an absolute literal base path.",
    );
  if (!Array.isArray(config.routes) || config.routes.length > 256)
    fail(
      "ROUTER_CONFIG_INVALID",
      "Router requires an array of at most 256 routes.",
    );
  if (
    Reflect.ownKeys(config.routes).some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" ||
          !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= config.routes.length),
    )
  )
    fail("ROUTER_CONFIG_INVALID", "Routes cannot contain extra properties.");
  if (config.notFound !== undefined && typeof config.notFound !== "function")
    fail(
      "ROUTER_CONFIG_INVALID",
      "notFound requires a synchronous view function.",
    );
  const patterns = new Set(),
    routes = [];
  for (let index = 0; index < config.routes.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(
      config.routes,
      String(index),
    );
    if (!descriptor || !("value" in descriptor))
      fail(
        "ROUTER_CONFIG_INVALID",
        "Routes cannot contain holes or accessors.",
      );
    const route = readRecord(
      descriptor.value,
      "ROUTER_CONFIG_INVALID",
      "route",
      ["path", "view"],
    );
    if (
      typeof route.path !== "string" ||
      !route.path.startsWith("/") ||
      route.path.length > 2048 ||
      /[?#\\]/.test(route.path) ||
      route.path.includes("//") ||
      typeof route.view !== "function"
    )
      fail(
        "ROUTER_CONFIG_INVALID",
        "Each route requires an absolute path pattern and synchronous view.",
      );
    const path = trim(route.path),
      names = new Set();
    let parts;
    try {
      parts = segments(path);
    } catch (cause) {
      throw new FrameworkError(
        "ROUTER_CONFIG_INVALID",
        "Malformed percent encoding in route pattern.",
        { cause },
      );
    }
    for (const part of parts) {
      if (part.startsWith(":")) {
        const name = part.slice(1);
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || names.has(name))
          fail(
            "ROUTER_CONFIG_INVALID",
            "Route parameter names must be unique identifiers.",
          );
        names.add(name);
      } else if (part === "." || part === ".." || part.includes("*"))
        fail(
          "ROUTER_CONFIG_INVALID",
          "Dot segments and wildcard patterns are unsupported.",
        );
    }
    if (patterns.has(path))
      fail("ROUTER_CONFIG_INVALID", "Duplicate route pattern.");
    patterns.add(path);
    routes.push(
      Object.freeze({ path, parts: Object.freeze(parts), view: route.view }),
    );
  }
  return Object.freeze({
    mode,
    base,
    routes: Object.freeze(routes),
    notFound: config.notFound ?? (() => "Not found"),
  });
}

export function createRouter(
  config,
  tracking,
  schedule,
  receive,
  onLocation = () => {},
  admit = null,
  replay = null,
) {
  const cell = tracking.cell(null);
  let view = null,
    origin = null,
    documentURL = null,
    disposed = false,
    listener = null,
    generation = 0;
  const withinBase = (path) =>
    config.base === "/" ||
    path === config.base ||
    path.startsWith(config.base + "/");
  const appPath = (pathname) =>
    config.base === "/" ? pathname : pathname.slice(config.base.length) || "/";
  const query = (search) => {
    const result = Object.create(null);
    for (const [key, value] of new URLSearchParams(search))
      (result[key] ??= []).push(value);
    for (const values of Object.values(result)) Object.freeze(values);
    return Object.freeze(result);
  };
  function snapshot(url) {
    let path,
      search,
      hash,
      outsideBase = false;
    if (config.mode === "hash") {
      const routeOrigin = origin ?? url.origin;
      const route = new URL(url.hash.slice(1) || "/", routeOrigin);
      if (route.origin !== routeOrigin)
        fail("ROUTE_URL_INVALID", "Hash routes must be application paths.");
      path = trim(route.pathname);
      search = route.search;
      hash = route.hash;
    } else {
      outsideBase = !withinBase(url.pathname);
      path = trim(outsideBase ? url.pathname : appPath(url.pathname));
      search = url.search;
      hash = url.hash;
    }
    const parts = segments(path),
      params = Object.create(null);
    let match = -1;
    if (!outsideBase)
      for (let index = 0; index < config.routes.length; index++) {
        const pattern = config.routes[index].parts;
        if (
          pattern.length !== parts.length ||
          pattern.some((part, i) => !part.startsWith(":") && part !== parts[i])
        )
          continue;
        match = index;
        pattern.forEach((part, i) => {
          if (part.startsWith(":")) params[part.slice(1)] = parts[i];
        });
        break;
      }
    const route = Object.freeze({
      path,
      params: Object.freeze(params),
      query: query(search),
      search,
      hash,
      url: url.pathname + url.search + url.hash,
      matched: match >= 0,
      outsideBase,
    });
    return { route, match, key: JSON.stringify([match, path, outsideBase]) };
  }
  function publish(next, hydrate = true) {
    if (cell.value?.route.url === next.route.url) return;
    try {
      tracking.batch(() => {
        tracking.updateCells([[cell, Object.freeze(next)]]);
        if (hydrate) onLocation(next.route);
      });
    } finally {
      schedule();
    }
  }
  function observed(next, cause, hydrate = true) {
    if (admit)
      return admit(
        {
          version: 1,
          kind: "location",
          mode: config.mode,
          base: config.base,
          url: next.route.url,
          cause,
          hydrate,
        },
        () => publish(next, hydrate),
      );
    publish(next, hydrate);
  }
  function mounted() {
    if ((!view && !replay) || disposed)
      fail("ROUTER_NOT_MOUNTED", "Navigation requires a mounted router.");
  }
  function resolve(to) {
    mounted();
    if (
      typeof to !== "string" ||
      !to ||
      to.length > MAX_URL ||
      /[\u0000-\u0020\\]/.test(to)
    )
      fail(
        "ROUTE_URL_INVALID",
        "Navigation requires a nonempty URL of at most 8,192 characters without whitespace/backslashes.",
      );
    let url;
    try {
      const current = cell.value.route;
      const absolute = /^[a-z][a-z0-9+.-]*:/i.test(to) || to.startsWith("//");
      if (absolute) url = new URL(to, origin);
      else {
        const path = new URL(
          to,
          origin + current.path + current.search + current.hash,
        );
        url =
          config.mode === "history"
            ? new URL(
                (config.base === "/" ? "" : config.base) +
                  path.pathname +
                  path.search +
                  path.hash,
                origin,
              )
            : new URL(
                documentURL + "#" + path.pathname + path.search + path.hash,
                origin,
              );
      }
      if (
        replay &&
        absolute &&
        !url.username &&
        !url.password &&
        ["http:", "https:"].includes(url.protocol) &&
        replay.localNavigation(url.pathname + url.search + url.hash)
      )
        url = new URL(url.pathname + url.search + url.hash, origin);
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !["http:", "https:"].includes(url.protocol) ||
        (config.mode === "history" && !withinBase(url.pathname)) ||
        (config.mode === "hash" && url.pathname + url.search !== documentURL)
      )
        fail(
          "ROUTE_URL_INVALID",
          "Navigation must stay within the mounted router URL space.",
        );
      const next = snapshot(url);
      if (url.href.length > MAX_URL)
        fail(
          "ROUTE_URL_INVALID",
          "Resolved navigation URL exceeds 8,192 characters.",
        );
      return { url: url.pathname + url.search + url.hash, next };
    } catch (cause) {
      if (cause instanceof FrameworkError) throw cause;
      throw new FrameworkError("ROUTE_URL_INVALID", "Invalid navigation URL.", {
        cause,
      });
    }
  }
  return Object.freeze({
    mode: config.mode,
    base: config.base,
    start(window, restored = null) {
      if (replay) {
        view = window;
        return;
      }
      if (
        !window?.location ||
        !window.history?.pushState ||
        !window.history?.replaceState ||
        !window.addEventListener
      )
        fail(
          "ROUTER_HOST_INVALID",
          "Routing requires native location, History and event APIs.",
        );
      if (owners.has(window))
        fail("ROUTER_OWNED", "Another mounted router owns this window URL.");
      view = window;
      origin = new URL(window.location.href).origin;
      documentURL = window.location.pathname + window.location.search;
      owners.set(view, cell);
      const expected = ++generation;
      listener = () => {
        if (!disposed && view === window && generation === expected)
          receive(() =>
            observed(snapshot(new URL(window.location.href)), "native"),
          );
      };
      try {
        if (restored) {
          const next = this.prepareInput(restored);
          view.history.replaceState(view.history.state, "", restored.url);
          const url = new URL(restored.url, origin);
          documentURL = url.pathname + url.search;
          publish(next, false);
        } else observed(snapshot(new URL(view.location.href)), "mount");
        view.addEventListener("popstate", listener);
        view.addEventListener("hashchange", listener);
      } catch (error) {
        try {
          this.stop();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Router startup and cleanup failed.",
          );
        }
        throw error;
      }
    },
    stop() {
      const window = view,
        ownedListener = listener;
      view = listener = null;
      generation++;
      const errors = [];
      if (window && !replay) {
        owners.delete(window);
        for (const type of ["popstate", "hashchange"])
          try {
            window.removeEventListener(type, ownedListener);
          } catch (error) {
            errors.push(error);
          }
      }
      if (!disposed && !replay)
        try {
          tracking.updateCells([[cell, null]]);
        } catch (error) {
          errors.push(error);
        }
      // Stale native listeners are inert after a failed removal.
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(errors, "Router listener cleanup failed.");
    },
    get route() {
      return cell.value?.route ?? null;
    },
    get selection() {
      return cell.value;
    },
    view(selection) {
      return selection.match < 0
        ? config.notFound
        : config.routes[selection.match].view;
    },
    prepare(to, raw = {}) {
      const options = readRecord(raw, "ROUTE_OPTIONS_INVALID", "navigation", [
        "replace",
      ]);
      if (options.replace !== undefined && typeof options.replace !== "boolean")
        fail("ROUTE_OPTIONS_INVALID", "replace requires a boolean.");
      return Object.freeze({
        ...resolve(to),
        replace: options.replace === true,
      });
    },
    prepareInput(input) {
      if (input.mode !== config.mode || input.base !== config.base)
        fail(
          "INPUT_INCOMPATIBLE",
          "Route input mode/base does not match this app.",
        );
      if (
        typeof input.url !== "string" ||
        !input.url.startsWith("/") ||
        input.url.startsWith("//") ||
        input.url.length > MAX_URL ||
        /[\u0000-\u0020\\]/.test(input.url)
      )
        fail(
          "INPUT_INVALID",
          "Location inputs require a bounded absolute local URL.",
        );
      const next = snapshot(
        new URL(input.url, origin ?? "https://mini-framework.invalid"),
      );
      if (next.route.url !== input.url)
        fail("INPUT_INVALID", "Location input URL must be canonical.");
      return next;
    },
    applyInput(input) {
      publish(this.prepareInput(input), input.hydrate);
    },
    applyPrepared(next, hydrate) {
      publish(next, hydrate);
    },
    restoreReplay(input) {
      origin = "https://mini-framework.invalid";
      if (input) {
        const next = this.prepareInput(input),
          url = new URL(input.url, origin);
        documentURL = url.pathname + url.search;
        publish(next, false);
      } else {
        documentURL = "/";
        tracking.updateCells([[cell, null]]);
      }
    },
    commit(request, hydrate = true) {
      mounted();
      if (cell.value.route.url === request.url) return;
      if (replay) {
        if (replay.navigationLocation())
          observed(request.next, hydrate ? "navigation" : "state", hydrate);
        return;
      }
      try {
        view.history[request.replace ? "replaceState" : "pushState"](
          view.history.state,
          "",
          request.url,
        );
      } catch (cause) {
        throw new FrameworkError(
          "ROUTE_HISTORY_FAILED",
          "Native history write failed; route state remains unchanged.",
          { cause },
        );
      }
      observed(request.next, hydrate ? "navigation" : "state", hydrate);
    },
    prepareQuery(updates) {
      mounted();
      const current = new URL(cell.value.route.url, origin);
      const routeURL =
        config.mode === "hash"
          ? new URL(current.hash.slice(1) || "/", origin)
          : current;
      for (const [key, value] of updates) {
        if (value === null) routeURL.searchParams.delete(key);
        else routeURL.searchParams.set(key, value);
      }
      if (config.mode === "hash")
        current.hash = routeURL.pathname + routeURL.search + routeURL.hash;
      if (
        current.pathname + current.search + current.hash ===
        cell.value.route.url
      )
        return null;
      return Object.freeze({ ...resolve(current.href), replace: true });
    },
    href(to) {
      mounted();
      try {
        return resolve(to).url;
      } catch (error) {
        // External/out-of-base links retain native anchor behavior; imperative
        // navigation stays strict. Other malformed URLs still reject.
        if (
          typeof to === "string" &&
          to &&
          to.length <= MAX_URL &&
          !/[\u0000-\u0020\\]/.test(to)
        ) {
          let url;
          try {
            url = new URL(
              to,
              replay
                ? origin + (cell.value?.route.url ?? documentURL)
                : view.location.href,
            );
          } catch {
            throw error;
          }
          if (
            !url.username &&
            !url.password &&
            url.href.length <= MAX_URL &&
            ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) &&
            (url.origin !== origin ||
              (config.mode === "history" && !withinBase(url.pathname)))
          )
            return url.href;
        }
        throw error;
      }
    },
    absolute(href) {
      return new URL(href, origin).href;
    },
    follows(event, href, fragmentOnly) {
      const native = event.nativeEvent,
        node = event.currentTarget;
      if (
        event.defaultPrevented ||
        native.button > 0 ||
        native.altKey ||
        native.ctrlKey ||
        native.metaKey ||
        native.shiftKey ||
        node.hasAttribute("download") ||
        (node.getAttribute("target") &&
          node.getAttribute("target") !== "_self") ||
        (node.getAttribute("rel") ?? "").split(/\s+/).includes("external") ||
        (fragmentOnly && config.mode === "history")
      )
        return false;
      const url = new URL(href, view.location.href);
      return (
        url.origin === origin &&
        !url.username &&
        !url.password &&
        (config.mode === "hash"
          ? url.pathname + url.search === documentURL
          : withinBase(url.pathname))
      );
    },
    counts: () => ({ routeListeners: view && !replay ? 2 : 0 }),
    dispose() {
      disposed = true;
      try {
        this.stop();
      } finally {
        cell.dispose();
        config = null;
        origin = documentURL = null;
      }
    },
  });
}
