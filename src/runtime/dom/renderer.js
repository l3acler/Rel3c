import { fail, observePromise, requireSync } from '../errors.js';
import { isBinding, resolveBinding } from './bindings.js';
import { isViewNode } from './nodes.js';
import { text, prepareProperty, applyProperty, hasBindings, propertyName, validateName } from './properties.js';

import { createRenderQueue } from './queue.js';

export function createRenderer(document, tracking, owner, makeContext, render, report) {
  const pending = createRenderQueue(document.defaultView, render, report);
  let disposed = false;
  function scope(parent = null) {
    const result = { parent, depth: parent ? parent.depth + 1 : 0,
      children: new Set(), nodes: [], cleanups: [], disposed: false };
    if (parent) parent.children.add(result);
    result.context = makeContext(cleanup => result.cleanups.push(cleanup), () => !result.disposed && !disposed);
    return result;
  }
  const root = scope();
  function removeScope(current) {
    if (current.disposed) return [];
    current.disposed = true;
    const errors = [];
    for (const child of [...current.children]) errors.push(...removeScope(child));
    while (current.cleanups.length) {
      try { requireSync(current.cleanups.pop()(), 'CLEANUP_ASYNC', 'DOM scope cleanup must be synchronous.'); }
      catch (error) { errors.push(error); }
    }
    for (const node of current.nodes.reverse()) {
      try { if (node.parentNode) node.parentNode.removeChild(node); }
      catch (error) { errors.push(error); }
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
    let normalized, initial = true;
    const job = { depth: current.depth, structural, active: () => !disposed && !current.disposed,
      run() {
        if (!job.active()) return;
        observer.read();
        apply(normalized, initial);
        initial = false;
      } };
    const observer = tracking.observe(state => { normalized = read(state); return normalized; }, () => pending.add(job));
    current.cleanups.push(() => { pending.delete(job); observer.dispose(); });
    // Initial reads already established dependencies; never evaluate twice.
    apply(normalized, initial);
    initial = false;
  }
  function build(value, parent, current, depth = 0, arrays = new Set()) {
    if (depth > 128) fail('DOM_LIMIT', 'Views exceed 128 nesting levels.');
    observePromise(value);
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      if (arrays.has(value)) fail('DOM_CHILD_INVALID', 'Cyclic child arrays are unsupported.');
      arrays.add(value);
      try {
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (descriptor && !('value' in descriptor)) fail('DOM_CHILD_INVALID', 'Child arrays cannot contain accessors.');
          build(descriptor?.value, parent, current, depth + 1, arrays);
        }
      } finally { arrays.delete(value); }
      return;
    }
    if (isBinding(value)) {
      const node = append(document.createTextNode(''), parent, current);
      watch(current, state => {
        const result = resolveBinding(value, state, owner);
        requireSync(result, 'REACTIVITY_ASYNC', 'Text binding reads must be synchronous.');
        return text(result);
      }, next => { if (node.data !== next) node.data = next; });
      return;
    }
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      append(document.createTextNode(String(value)), parent, current);
      return;
    }
    if (!isViewNode(value)) fail('VIEW_RESULT_INVALID', 'Views require text, finite numbers, null/booleans, child arrays, bindings or framework descriptors.');
    if (value.kind === 'when') {
      append(document.createComment('when'), parent, current);
      const end = append(document.createComment('/when'), parent, current);
      let selected = null, previous;
      const apply = next => {
        if (selected && next === previous) return;
        const candidate = scope(current);
        const container = document.createDocumentFragment();
        try {
          const branch = next ? value.yes : value.no;
          const output = branch(candidate.context);
          requireSync(output, 'VIEW_RESULT_INVALID', 'Conditional views must synchronously return declarative children.');
          build(output, container, candidate, depth + 1);
          for (const node of [...container.childNodes]) end.parentNode.insertBefore(node, end);
        } catch (error) {
          const errors = removeScope(candidate);
          if (errors.length) throw new AggregateError([error, ...errors], 'Conditional construction and cleanup failed.');
          throw error;
        }
        const cleanupErrors = selected ? removeScope(selected) : [];
        selected = candidate;
        previous = next;
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Conditional cleanup failed; replacement completed.');
      };
      if (isBinding(value.condition)) watch(current, state => {
        const next = resolveBinding(value.condition, state, owner);
        requireSync(next, 'REACTIVITY_ASYNC', 'Conditional reads must be synchronous.');
        if (typeof next !== 'boolean') fail('DOM_CONDITION_INVALID', 'Conditional binding must return a boolean.');
        return next;
      }, apply, true);
      else apply(value.condition);
      return;
    }
    const node = append(document.createElement(value.tag), parent, current);
    const keys = Object.keys(value.props), names = new Set();
    // Establish input type/multiple before children and value properties, even
    // when authored props use a different order. Reject alias collisions.
    for (const key of keys) {
      const name = propertyName(key).toLowerCase();
      validateName(name);
      if (names.has(name)) fail('DOM_ATTRIBUTE_INVALID', `Duplicate attribute/alias ${name}.`);
      names.add(name);
    }
    const apply = key => {
      let previousStyle;
      const applyPrepared = (prepared, initial) => {
        if (prepared.kind === 'style' && !initial && previousStyle === prepared.value) return;
        applyProperty(node, prepared, initial);
        if (prepared.kind === 'style') previousStyle = prepared.value;
      };
      const input = value.props[key];
      if (hasBindings(input)) watch(current, state => prepareProperty(node, key, input, state, owner),
        applyPrepared);
      else applyProperty(node, prepareProperty(node, key, input, undefined, owner), true);
    };
    const before = keys.filter(key => !['value', 'checked', 'selected'].includes(propertyName(key).toLowerCase()));
    for (const key of before) apply(key);
    for (const child of value.children) build(child, node, current, depth + 1);
    for (const key of keys.filter(key => !before.includes(key))) apply(key);
  }
  return Object.freeze({
    mount(output, target) {
      const container = document.createDocumentFragment();
      build(output, container, root);
      for (const node of [...container.childNodes]) target.appendChild(node);
    },
    flush: pending.flush,
    schedule: pending.schedule,
    dispose() {
      if (disposed) return [];
      disposed = true;
      pending.dispose();
      return removeScope(root);
    },
  });
}
