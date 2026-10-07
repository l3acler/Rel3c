import { fail, observePromise } from "../errors.js";
import { readRecord } from "../records.js";
import { isBinding } from "./bindings.js";
import { eventMap } from "./events.js";

const descriptors = new WeakSet();
const tags = new Set([
  "div",
  "p",
  "span",
  "button",
  "form",
  "label",
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "fieldset",
  "legend",
  "ul",
  "ol",
  "li",
  "section",
  "main",
  "article",
  "header",
  "footer",
  "nav",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "small",
  "br",
  "hr",
  "img",
  "pre",
  "code",
  "output",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
]);
const voids = new Set(["input", "br", "hr", "img"]);
export const isViewNode = (value) =>
  value !== null && typeof value === "object" && descriptors.has(value);
export const isVoid = (tag) => voids.has(tag);
function node(kind, fields) {
  const result = Object.freeze({ kind, ...fields });
  descriptors.add(result);
  return result;
}
function copyChildren(children, active = new Set(), depth = 0) {
  if (depth > 128) fail("DOM_LIMIT", "Child arrays exceed 128 levels.");
  if (active.has(children))
    fail("DOM_CHILD_INVALID", "Cyclic child arrays are unsupported.");
  active.add(children);
  try {
    const result = [];
    for (let i = 0; i < children.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(children, String(i));
      if (!descriptor) {
        result.push(undefined);
        continue;
      }
      if (!("value" in descriptor))
        fail("DOM_CHILD_INVALID", "Child arrays cannot contain accessors.");
      const value = descriptor.value;
      if (Array.isArray(value))
        result.push(copyChildren(value, active, depth + 1));
      else {
        observePromise(value);
        if (
          value !== null &&
          value !== undefined &&
          typeof value !== "boolean" &&
          typeof value !== "string" &&
          !(typeof value === "number" && Number.isFinite(value)) &&
          !isBinding(value) &&
          !isViewNode(value)
        )
          fail(
            "DOM_CHILD_INVALID",
            "Children require text, finite numbers, booleans, null, bindings or framework descriptors.",
          );
        result.push(value);
      }
    }
    return Object.freeze(result);
  } finally {
    active.delete(children);
  }
}
export function element(tag, ...args) {
  if (typeof tag !== "string" || !tags.has(tag.toLowerCase()))
    fail(
      "DOM_TAG_INVALID",
      "element requires a supported HTML tag; scripts, templates, SVG and custom elements are not supported.",
    );
  tag = tag.toLowerCase();
  let props = Object.freeze({});
  const first = args[0];
  if (
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    !isBinding(first) &&
    !isViewNode(first)
  ) {
    const copied = readRecord(
      args.shift(),
      "DOM_PROPS_INVALID",
      "element props",
    );
    if (Object.hasOwn(copied, "on")) copied.on = eventMap(copied.on);
    if (copied.on?.click != null && copied.onClick != null)
      fail("EVENT_DUPLICATE", "Use either on.click or onClick on an element.");
    for (const key of ["class", "className", "style"]) {
      const value = copied[key];
      if (value !== null && typeof value === "object" && !isBinding(value))
        copied[key] = Object.freeze(
          readRecord(value, "DOM_PROPS_INVALID", key),
        );
    }
    props = Object.freeze(copied);
  }
  const children = copyChildren(args);
  if (
    isVoid(tag) &&
    children
      .flat(Infinity)
      .some(
        (value) =>
          value !== null && value !== undefined && typeof value !== "boolean",
      )
  )
    fail("DOM_CHILD_INVALID", `Void element ${tag} cannot have children.`);
  return node("element", { tag, props, children });
}
export function when(condition, yes, no = () => null) {
  if (
    (!isBinding(condition) && typeof condition !== "boolean") ||
    typeof yes !== "function" ||
    typeof no !== "function"
  )
    fail(
      "DOM_CONDITION_INVALID",
      "when requires a boolean/binding and synchronous branch functions.",
    );
  return node("when", { condition, yes, no });
}
export function outlet() {
  return node("outlet", {});
}
export function keyed(items, key, view) {
  if (
    !isBinding(items) ||
    typeof key !== "function" ||
    typeof view !== "function"
  )
    fail(
      "LIST_INVALID",
      "keyed requires an array binding, a key function and a synchronous item view.",
    );
  return node("keyed", { items, key, view });
}
export const div = (...args) => element("div", ...args);
export const span = (...args) => element("span", ...args);
export const p = (...args) => element("p", ...args);
export const button = (...args) => element("button", ...args);
export const form = (...args) => element("form", ...args);
export const label = (...args) => element("label", ...args);
export const input = (...args) => element("input", ...args);
export const textarea = (...args) => element("textarea", ...args);
export const select = (...args) => element("select", ...args);
export const option = (...args) => element("option", ...args);
export const section = (...args) => element("section", ...args);
export const a = (...args) => element("a", ...args);
export const ul = (...args) => element("ul", ...args);
export const li = (...args) => element("li", ...args);
