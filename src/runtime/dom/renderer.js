import { fail, observePromise, requireSync } from "../errors.js";
import {
  createBindings,
  derive,
  isBinding,
  resolveBinding,
  isPresentationBinding,
} from "./bindings.js";
import { isViewNode } from "./nodes.js";
import {
  text,
  prepareProperty,
  applyProperty,
  hasBindings,
  propertyName,
  validateName,
} from "./properties.js";

import { createRenderQueue } from "./queue.js";
import { keyboardInput, textInput, isTextControl } from "./inputs.js";
const eventProps = new Set(["on", "onClick", "onKey", "onText"]);

export function createRenderer(
  document,
  tracking,
  owner,
  makeContext,
  render,
  report,
  events,
  scheduler,
  router,
) {
  const pending = createRenderQueue(
    document.defaultView,
    render,
    report,
    scheduler,
  );
  let disposed = false;
  let hasOutlet = false;
  const scopes = new Set(),
    bindings = new Set();
  function scope(parent = null) {
    const result = {
      parent,
      depth: parent ? parent.depth + 1 : 0,
      children: new Set(),
      nodes: [],
      cleanups: [],
      disposed: false,
    };
    scopes.add(result);
    if (parent) parent.children.add(result);
    result.context = makeContext(
      (cleanup) => result.cleanups.push(cleanup),
      () => !result.disposed && !disposed,
    );
    return result;
  }
  const root = scope();
  function removeScope(current) {
    if (current.disposed) return [];
    current.disposed = true;
    scopes.delete(current);
    const errors = [];
    for (const child of [...current.children])
      errors.push(...removeScope(child));
    while (current.cleanups.length) {
      try {
        requireSync(
          current.cleanups.pop()(),
          "CLEANUP_ASYNC",
          "DOM scope cleanup must be synchronous.",
        );
      } catch (error) {
        errors.push(error);
      }
    }
    for (const node of current.nodes.reverse()) {
      try {
        if (node.parentNode) node.parentNode.removeChild(node);
      } catch (error) {
        errors.push(error);
      }
    }
    current.nodes.length = 0;
    current.parent?.children.delete(current);
    return errors;
  }
  function append(node, parent, current) {
    current.nodes.push(node);
    parent.appendChild(node);
    return node;
  }
  function watch(current, read, apply, structural = false) {
    let normalized,
      initial = true;
    const job = {
      depth: current.depth,
      structural,
      active: () => !disposed && !current.disposed,
      run() {
        if (!job.active()) return;
        observer.read();
        apply(normalized, initial);
        initial = false;
      },
    };
    const observer = tracking.observe(
      (state) => {
        normalized = read(state);
        return normalized;
      },
      () => pending.add(job),
    );
    bindings.add(job);
    current.cleanups.push(() => {
      bindings.delete(job);
      pending.delete(job);
      observer.dispose();
    });
    // Initial reads already established dependencies; never evaluate twice.
    apply(normalized, initial);
    initial = false;
    return job;
  }
  function build(value, parent, current, depth = 0, arrays = new Set()) {
    if (depth > 128) fail("DOM_LIMIT", "Views exceed 128 nesting levels.");
    observePromise(value);
    if (value === null || value === undefined || typeof value === "boolean")
      return;
    if (Array.isArray(value)) {
      if (arrays.has(value))
        fail("DOM_CHILD_INVALID", "Cyclic child arrays are unsupported.");
      arrays.add(value);
      try {
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (descriptor && !("value" in descriptor))
            fail("DOM_CHILD_INVALID", "Child arrays cannot contain accessors.");
          build(descriptor?.value, parent, current, depth + 1, arrays);
        }
      } finally {
        arrays.delete(value);
      }
      return;
    }
    if (isBinding(value)) {
      const node = append(document.createTextNode(""), parent, current);
      watch(
        current,
        (state) => {
          const result = resolveBinding(value, state, owner);
          requireSync(
            result,
            "REACTIVITY_ASYNC",
            "Text binding reads must be synchronous.",
          );
          return text(result);
        },
        (next) => {
          if (node.data !== next) node.data = next;
        },
      );
      return;
    }
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      append(document.createTextNode(String(value)), parent, current);
      return;
    }
    if (!isViewNode(value))
      fail(
        "VIEW_RESULT_INVALID",
        "Views require text, finite numbers, null/booleans, child arrays, bindings or framework descriptors.",
      );
    if (value.kind === "outlet") {
      if (!router)
        fail("ROUTER_MISSING", "An outlet requires a configured router.");
      if (hasOutlet)
        fail(
          "ROUTE_OUTLET_DUPLICATE",
          "Only one active route outlet is supported.",
        );
      hasOutlet = true;
      current.cleanups.push(() => {
        hasOutlet = false;
      });
      append(document.createComment("outlet"), parent, current);
      const end = append(document.createComment("/outlet"), parent, current);
      let selected = null,
        previousKey;
      watch(
        current,
        () => router.selection,
        (next) => {
          if (selected && previousKey === next.key) return;
          const candidate = scope(current),
            container = document.createDocumentFragment();
          try {
            const routeView = router.view(next),
              output = routeView(candidate.context);
            requireSync(
              output,
              "VIEW_RESULT_INVALID",
              "Route views must synchronously return declarative children.",
            );
            build(output, container, candidate, depth + 1);
            for (const node of [...container.childNodes])
              end.parentNode.insertBefore(node, end);
          } catch (error) {
            const errors = removeScope(candidate);
            if (errors.length)
              throw new AggregateError(
                [error, ...errors],
                "Route construction and cleanup failed.",
              );
            throw error;
          }
          const errors = selected ? removeScope(selected) : [];
          selected = candidate;
          previousKey = next.key;
          if (errors.length)
            throw new AggregateError(
              errors,
              "Route cleanup failed; the new route remains mounted.",
            );
        },
        true,
      );
      return;
    }
    if (value.kind === "when") {
      if (isPresentationBinding(value.condition))
        fail(
          "INTERPOLATION_STRUCTURAL",
          "Interpolation cannot control view lifetime.",
        );
      append(document.createComment("when"), parent, current);
      const end = append(document.createComment("/when"), parent, current);
      let selected = null,
        previous;
      const apply = (next) => {
        if (selected && next === previous) return;
        const candidate = scope(current);
        const container = document.createDocumentFragment();
        try {
          const branch = next ? value.yes : value.no;
          const output = branch(candidate.context);
          requireSync(
            output,
            "VIEW_RESULT_INVALID",
            "Conditional views must synchronously return declarative children.",
          );
          build(output, container, candidate, depth + 1);
          for (const node of [...container.childNodes])
            end.parentNode.insertBefore(node, end);
        } catch (error) {
          const errors = removeScope(candidate);
          if (errors.length)
            throw new AggregateError(
              [error, ...errors],
              "Conditional construction and cleanup failed.",
            );
          throw error;
        }
        const cleanupErrors = selected ? removeScope(selected) : [];
        selected = candidate;
        previous = next;
        if (cleanupErrors.length)
          throw new AggregateError(
            cleanupErrors,
            "Conditional cleanup failed; replacement completed.",
          );
      };
      if (isBinding(value.condition))
        watch(
          current,
          (state) => {
            const next = resolveBinding(value.condition, state, owner);
            requireSync(
              next,
              "REACTIVITY_ASYNC",
              "Conditional reads must be synchronous.",
            );
            if (typeof next !== "boolean")
              fail(
                "DOM_CONDITION_INVALID",
                "Conditional binding must return a boolean.",
              );
            return next;
          },
          apply,
          true,
        );
      else apply(value.condition);
      return;
    }
    if (value.kind === "keyed") {
      if (isPresentationBinding(value.items))
        fail(
          "INTERPOLATION_STRUCTURAL",
          "Interpolation cannot control keyed view lifetime.",
        );
      append(document.createComment("keyed"), parent, current);
      const end = append(document.createComment("/keyed"), parent, current);
      let entries = new Map();
      const range = (entry) => {
        const result = [];
        for (let node = entry.start; node; node = node.nextSibling) {
          result.push(node);
          if (node === entry.end) return result;
        }
        fail("LIST_RANGE_INVALID", "A list range was externally modified.");
      };
      const place = (entry, anchor) => {
        if (entry.end.nextSibling === anchor) return;
        for (const node of range(entry))
          end.parentNode.insertBefore(node, anchor);
      };
      const apply = (rows) => {
        const next = new Map(),
          candidates = [];
        try {
          for (const row of rows) {
            let entry = entries.get(row.key);
            if (!entry) {
              const owned = scope(current);
              const container = document.createDocumentFragment();
              entry = { scope: owned, start: null, end: null, container };
              candidates.push(entry);
              const itemCell = tracking.cell(row.item),
                indexCell = tracking.cell(row.index);
              owned.cleanups.push(itemCell.dispose, indexCell.dispose);
              const check = () => {
                if (disposed || owned.disposed)
                  fail("SCOPE_DISPOSED", "List item scope is disposed.");
              };
              const context = Object.freeze(
                Object.defineProperties(
                  {
                    key: row.key,
                    item: createBindings(
                      owner,
                      check,
                      [],
                      () => itemCell.value,
                    ),
                    index: derive(() => {
                      check();
                      return indexCell.value;
                    }, owner),
                    get value() {
                      check();
                      return itemCell.value;
                    },
                    get position() {
                      check();
                      return indexCell.value;
                    },
                  },
                  Object.getOwnPropertyDescriptors(owned.context),
                ),
              );
              entry.itemCell = itemCell;
              entry.indexCell = indexCell;
              entry.start = append(
                document.createComment("item"),
                container,
                owned,
              );
              const output = value.view(context);
              requireSync(
                output,
                "VIEW_RESULT_INVALID",
                "Keyed item views must synchronously return declarative children.",
              );
              build(output, container, owned, depth + 1);
              entry.end = append(
                document.createComment("/item"),
                container,
                owned,
              );
            }
            next.set(row.key, entry);
          }
        } catch (error) {
          const errors = candidates.flatMap((entry) =>
            removeScope(entry.scope),
          );
          if (errors.length)
            throw new AggregateError(
              [error, ...errors],
              "List construction and cleanup failed.",
            );
          throw error;
        }
        // Determine the focused retained range before inserting or moving nodes.
        const active = document.activeElement;
        const ordered = [...next.values()];
        const focused = active
          ? ordered.findIndex(
              (entry) =>
                !entry.container &&
                range(entry).some(
                  (node) => node === active || node.contains?.(active),
                ),
            )
          : -1;
        try {
          for (const entry of candidates) {
            for (const node of [...entry.container.childNodes])
              end.parentNode.insertBefore(node, end);
            entry.container = null;
          }
          // Arrange around the focused range, leaving that range connected and
          // untouched. Native focus/selection survive without blur/refocus tricks.
          let anchor = end;
          for (let i = ordered.length - 1; i > focused; i--) {
            place(ordered[i], anchor);
            anchor = ordered[i].start;
          }
          if (focused !== -1) {
            anchor = ordered[focused].start;
            for (let i = focused - 1; i >= 0; i--) {
              place(ordered[i], anchor);
              anchor = ordered[i].start;
            }
          }
        } catch (error) {
          const errors = candidates.flatMap((entry) =>
            removeScope(entry.scope),
          );
          if (errors.length)
            throw new AggregateError(
              [error, ...errors],
              "List placement and cleanup failed.",
            );
          throw error;
        }
        const errors = [];
        for (const [key, entry] of entries)
          if (!next.has(key)) errors.push(...removeScope(entry.scope));
        entries = next;
        try {
          tracking.updateCells(
            rows.flatMap((row) => {
              const entry = next.get(row.key);
              return [
                [entry.itemCell, row.item],
                [entry.indexCell, row.index],
              ];
            }),
          );
        } catch (error) {
          errors.push(error);
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length)
          throw new AggregateError(
            errors,
            "List replacement completed with resource errors.",
          );
      };
      watch(
        current,
        (state) => {
          const items = resolveBinding(value.items, state, owner);
          requireSync(
            items,
            "REACTIVITY_ASYNC",
            "List source must be synchronous.",
          );
          if (!Array.isArray(items))
            fail("LIST_SOURCE_INVALID", "keyed requires an array.");
          const keys = new Set(),
            rows = [];
          const keyOf = value.key;
          for (let index = 0; index < items.length; index++) {
            if (!Object.hasOwn(items, index))
              fail("LIST_ITEM_MISSING", "Keyed arrays cannot contain holes.");
            const item = items[index],
              key = keyOf(item);
            requireSync(
              key,
              "REACTIVITY_ASYNC",
              "List keys must be synchronous.",
            );
            if (key === null || key === undefined)
              fail("LIST_KEY_MISSING", `Missing list key at index ${index}.`);
            if (
              typeof key !== "string" &&
              !(typeof key === "number" && Number.isFinite(key))
            )
              fail(
                "LIST_KEY_INVALID",
                "List keys must be strings or finite numbers.",
              );
            if (keys.has(key))
              fail("LIST_KEY_DUPLICATE", `Duplicate list key ${String(key)}.`);
            keys.add(key);
            rows.push({ key, item, index });
          }
          return rows;
        },
        apply,
        true,
      );
      return;
    }
    const node = append(document.createElement(value.tag), parent, current);
    const keys = Object.keys(value.props),
      names = new Set();
    const active = () => !disposed && !current.disposed;
    let editor = null;
    // Establish input type/multiple before children and value properties, even
    // when authored props use a different order. Reject alias collisions.
    for (const key of keys) {
      const name = propertyName(key).toLowerCase();
      if (!eventProps.has(key)) validateName(name);
      if (names.has(name))
        fail("DOM_ATTRIBUTE_INVALID", `Duplicate attribute/alias ${name}.`);
      names.add(name);
    }
    const apply = (key) => {
      if (key === "onClick") {
        current.cleanups.push(
          events.register(node, "click", value.props[key], active, {
            legacy: true,
          }),
        );
        return;
      }
      if (key === "on") {
        for (const [type, options] of Object.entries(value.props.on))
          if (options != null)
            current.cleanups.push(
              events.register(node, type, options.handler, active, options),
            );
        return;
      }
      if (key === "onKey") {
        current.cleanups.push(
          keyboardInput(node, value.props[key], active, events),
        );
        return;
      }
      if (key === "onText") {
        return;
      }
      let previousStyle, job;
      const applyPrepared = (prepared, initial) => {
        if (
          prepared.kind === "style" &&
          !initial &&
          previousStyle === prepared.value
        )
          return;
        if (
          !initial &&
          prepared.kind === "property" &&
          prepared.name === "value" &&
          editor?.defer(() => pending.add(job))
        )
          return;
        applyProperty(node, prepared, initial);
        if (prepared.kind === "property" && prepared.name === "value")
          editor?.wrote(prepared.value);
        if (prepared.kind === "style") previousStyle = prepared.value;
      };
      const input = value.props[key];
      if (hasBindings(input))
        job = watch(
          current,
          (state) => prepareProperty(node, key, input, state, owner),
          applyPrepared,
        );
      else
        applyPrepared(
          prepareProperty(node, key, input, undefined, owner),
          true,
        );
    };
    const before = keys.filter(
      (key) =>
        !["value", "checked", "selected"].includes(
          propertyName(key).toLowerCase(),
        ),
    );
    for (const key of before) apply(key);
    if (
      value.props.onText != null ||
      (isTextControl(node) &&
        keys.some(
          (key) =>
            propertyName(key).toLowerCase() === "value" &&
            hasBindings(value.props[key]),
        ))
    ) {
      editor = textInput(node, value.props.onText, active, events);
      current.cleanups.push(editor.dispose);
    }
    for (const child of value.children) build(child, node, current, depth + 1);
    for (const key of keys.filter((key) => !before.includes(key))) apply(key);
  }
  return Object.freeze({
    mount(output, target) {
      const container = document.createDocumentFragment();
      build(output, container, root);
      for (const node of [...container.childNodes]) target.appendChild(node);
    },
    flush: pending.flush,
    schedule: pending.schedule,
    counts() {
      return {
        scopes: scopes.size,
        bindings: bindings.size,
        ownedNodes: [...scopes].reduce(
          (sum, scope) => sum + scope.nodes.length,
          0,
        ),
        ...pending.counts(),
      };
    },
    dispose() {
      if (disposed) return [];
      disposed = true;
      const errors = [];
      try {
        pending.dispose();
      } catch (error) {
        errors.push(error);
      }
      errors.push(...removeScope(root));
      return errors;
    },
  });
}
