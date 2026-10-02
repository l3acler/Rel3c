import { isBinding } from './bindings.js';

const descriptors = new WeakSet();
function node(kind, fields) {
  const descriptor = Object.freeze({ kind, ...fields });
  descriptors.add(descriptor);
  return descriptor;
}
export const isViewNode = value => value !== null && typeof value === 'object' && descriptors.has(value);

export function element(tag, ...arguments_) {
  let props = {};
  const first = arguments_[0];
  if (first !== null && typeof first === 'object' && !Array.isArray(first)
    && !isBinding(first) && !isViewNode(first)) props = arguments_.shift();
  return node('element', { tag, props: { ...props }, children: arguments_ });
}

export const div = (...args) => element('div', ...args);
export const p = (...args) => element('p', ...args);
export const span = (...args) => element('span', ...args);
export const button = (...args) => element('button', ...args);
export const form = (...args) => element('form', ...args);
export const label = (...args) => element('label', ...args);
export const input = (...args) => element('input', ...args);
export const ul = (...args) => element('ul', ...args);
export const li = (...args) => element('li', ...args);
export const section = (...args) => element('section', ...args);
export const a = (...args) => element('a', ...args);
export const when = (condition, yes, no = () => null) => node('when', { condition, yes, no });
export const keyed = (items, key, view) => node('keyed', { items, key, view });
export const component = view => node('component', { view });
export const html = (strings, ...values) => node('template', { strings, values });
