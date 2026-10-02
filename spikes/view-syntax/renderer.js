import { isBinding, readBinding, createBindings } from './bindings.js';
import { isViewNode, component } from './nodes.js';
import { validateTag, setAttribute, setStyles } from './security.js';

// Deliberately small syntax spike, not a production reconciler.
export function createRenderer(runtime, events, compiler, document) {
  const { metrics } = runtime;
  function insert(parent, node, before) { parent.insertBefore(node, before); metrics.structuralWrites++; }
  function remove(node) { if (node.parentNode) { node.remove(); metrics.structuralWrites++; } }
  function reactive(owner, value, write) {
    let current = value;
    let effect;
    const run = () => write(isBinding(current) ? readBinding(current) : current);
    if (isBinding(current)) effect = runtime.effect(owner, run);
    else run();
    return { update(next) {
      current = next;
      if (isBinding(next)) {
        if (effect) effect.run(); else effect = runtime.effect(owner, run);
      } else { effect?.dispose(); effect = null; run(); }
    } };
  }

  function slot(parent, before, owner, context) {
    const scope = runtime.scope(owner);
    const start = document.createComment('start');
    const end = document.createComment('end');
    insert(parent, start, before); insert(parent, end, before);
    let handle;
    let contentScope;
    let binding;
    function clear() {
      contentScope?.dispose();
      handle = null;
      for (let node = start.nextSibling; node && node !== end;) {
        const next = node.nextSibling; remove(node); node = next;
      }
    }
    function apply(value) {
      if (scope.disposed) return;
      const kind = isViewNode(value) ? value.kind : Array.isArray(value) ? 'array'
        : value == null || typeof value === 'boolean' ? 'empty' : 'text';
      if (kind === 'text' && !['string', 'number', 'bigint'].includes(typeof value)) {
        throw new TypeError('Children must be primitive values, bindings, or view descriptors');
      }
      const identity = kind === 'element' ? validateTag(value.tag) : kind === 'template' ? value.strings : kind;
      if (!handle || handle.identity !== identity || handle.kind !== kind) {
        clear(); contentScope = runtime.scope(scope);
        handle = mount(value, kind, parent, end, contentScope, context);
        handle.identity = identity; handle.kind = kind;
      } else handle.update(value);
    }
    const result = { start, end, scope,
      update(value) {
        if (isBinding(value)) {
          if (binding) binding.update(value); else binding = reactive(scope, value, apply);
        } else { if (binding) { binding.update(value); binding = null; } else apply(value); }
      },
      dispose() { scope.dispose(); },
      move(beforeNode) {
        if (end.nextSibling === beforeNode) return;
        const focus = document.activeElement;
        const selection = focus && 'selectionStart' in focus ? [focus.selectionStart, focus.selectionEnd] : null;
        for (let node = start; node;) {
          const next = node.nextSibling;
          if (parent.moveBefore && node.isConnected && beforeNode?.isConnected) parent.moveBefore(node, beforeNode);
          else parent.insertBefore(node, beforeNode);
          metrics.structuralWrites++;
          if (node === end) break;
          node = next;
        }
        if (focus?.isConnected && document.activeElement !== focus) {
          focus.focus({ preventScroll: true });
          if (selection && selection[0] !== null) focus.setSelectionRange(...selection);
        }
      },
    };
    scope.cleanups.push(() => { clear(); remove(start); remove(end); });
    return result;
  }

  function sequence(parent, before, owner, context, initial) {
    const slots = [];
    const update = values => {
      while (slots.length > values.length) slots.pop().dispose();
      values.forEach((value, index) => {
        if (!slots[index]) slots[index] = slot(parent, before, owner, context);
        slots[index].update(value);
      });
    };
    update(initial);
    return { update };
  }

  function mount(value, kind, parent, before, owner, context) {
    if (kind === 'empty') return { update() {} };
    if (kind === 'text') {
      const text = document.createTextNode(String(value)); metrics.textCreates++;
      insert(parent, text, before);
      return { update(next) { if (text.data !== String(next)) { text.data = String(next); metrics.valueWrites++; } } };
    }
    if (kind === 'array') return sequence(parent, before, owner, context, value);
    if (kind === 'element') {
      const node = document.createElement(validateTag(value.tag)); metrics.elementCreates++;
      const properties = new Map();
      function updateProps(props) {
        for (const [name, record] of properties) if (!Object.hasOwn(props, name)) {
          record.scope.dispose(); properties.delete(name);
          if (!name.startsWith('on')) {
            if (name === 'style') setStyles(node, {}, metrics); else setAttribute(node, name, null, metrics);
          }
        }
        for (const [name, next] of Object.entries(props)) {
          if (properties.has(name)) { properties.get(name).part.update(next); continue; }
          const scope = runtime.scope(owner);
          let part;
          if (/^on[A-Z]/.test(name)) part = events.register(node, name.slice(2).toLowerCase(), next, scope);
          else part = reactive(scope, next, current => name === 'style'
            ? setStyles(node, current, metrics) : setAttribute(node, name, current, metrics));
          properties.set(name, { scope, part });
        }
      }
      updateProps(value.props);
      const children = sequence(node, null, owner, context, value.children);
      insert(parent, node, before);
      return { update(next) { updateProps(next.props); children.update(next.children); } };
    }
    if (kind === 'template') {
      const { fragment, slots } = compiler.clone(compiler.compile(value.strings));
      metrics.elementCreates += fragment.querySelectorAll('*').length;
      while (fragment.firstChild) insert(parent, fragment.firstChild, before);
      let values = value.values;
      const parts = slots.map(descriptor => {
        if (descriptor.kind === 'child') {
          const child = slot(descriptor.node.parentNode, descriptor.node, owner, context);
          return () => child.update(values[descriptor.index]);
        }
        if (descriptor.kind === 'event') {
          const event = events.register(descriptor.node, descriptor.event, values[descriptor.index], owner);
          return () => event.update(values[descriptor.index]);
        }
        // One token for the whole attribute records every explicit binding read.
        let effect;
        const run = () => {
          const resolved = descriptor.parts.map(part => typeof part === 'string' ? part
            : isBinding(values[part.index]) ? readBinding(values[part.index]) : values[part.index]);
          setAttribute(descriptor.node, descriptor.name, resolved.length === 1 ? resolved[0]
            : resolved.map(part => part ?? '').join(''), metrics);
        };
        effect = runtime.effect(owner, run);
        return () => effect.run();
      });
      parts.forEach(update => update());
      return { update(next) { values = next.values; parts.forEach(update => update()); } };
    }
    if (kind === 'component') {
      const child = slot(parent, before, owner, context);
      let view = value.view;
      const effect = runtime.effect(owner, () => { metrics.viewEvaluations++; child.update(view(context)); }, 0);
      return { update(next) { view = next.view; effect.run(); } };
    }
    if (kind === 'when') {
      const child = slot(parent, before, owner, context);
      let descriptor = value;
      let selected;
      const effect = runtime.effect(owner, () => {
        const condition = isBinding(descriptor.condition) ? readBinding(descriptor.condition) : descriptor.condition;
        const branch = condition ? descriptor.yes : descriptor.no;
        if (selected !== branch) { selected = branch; child.update(component(branch)); }
      }, 1);
      return { update(next) { descriptor = next; effect.run(); } };
    }
    if (kind === 'keyed') {
      const anchor = document.createComment('list'); insert(parent, anchor, before);
      let descriptor = value;
      const entries = new Map();
      const effect = runtime.effect(owner, () => {
        const items = isBinding(descriptor.items) ? readBinding(descriptor.items) : descriptor.items;
        if (!Array.isArray(items)) throw new TypeError('keyed requires an array');
        runtime.track(runtime.identity(items), 'iterate');
        const keys = new Set();
        const rows = [...items].map(item => {
          const key = descriptor.key(item);
          if (!['string', 'number'].includes(typeof key) || keys.has(key)) throw new TypeError('Missing or duplicate list key');
          keys.add(key); return { key, id: runtime.identity(item) };
        });
        for (const [key, entry] of entries) if (!keys.has(key)) { entry.slot.dispose(); entries.delete(key); }
        for (const row of rows) {
          let entry = entries.get(row.key);
          if (!entry) {
            const holder = { id: row.id };
            const rowContext = { actions: context.actions, bind: createBindings(() => runtime.node(holder.id)),
              get state() { return runtime.node(holder.id); } };
            const child = slot(parent, anchor, owner, rowContext);
            entry = { holder, slot: child, view: descriptor.view }; entries.set(row.key, entry);
            child.update(component(descriptor.view));
          } else if (entry.holder.id !== row.id) { entry.holder.id = row.id; entry.slot.scope.refresh(); }
          if (entry.view !== descriptor.view) { entry.view = descriptor.view; entry.slot.update(component(descriptor.view)); }
        }
        let cursor = anchor;
        for (const row of [...rows].reverse()) { const entry = entries.get(row.key); entry.slot.move(cursor); cursor = entry.slot.start; }
      }, 1);
      return { update(next) { descriptor = next; effect.run(); } };
    }
    throw new TypeError('Unknown view descriptor');
  }
  return { slot };
}
