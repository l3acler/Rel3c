import { validateTag, validateAttribute } from './security.js';

const marker = index => `mfv-slot-${index}-end`;
const pattern = /mfv-slot-(\d+)-end/g;

export function createTemplateCompiler(document, metrics) {
  const cache = new WeakMap();
  function compile(strings) {
    if (!Array.isArray(strings) || !Array.isArray(strings.raw) || !Object.isFrozen(strings)) {
      throw new TypeError('html requires a native TemplateStringsArray');
    }
    if (cache.has(strings)) return cache.get(strings);
    if (strings.some(value => value.includes('mfv-slot-'))) throw new TypeError('Reserved template marker');
    const source = strings.map((value, index) => value + (index < strings.length - 1 ? marker(index) : '')).join('');
    const template = document.createElement('template');
    // Only developer-authored static segments and numeric markers enter HTML.
    // No runtime interpolation value is ever inserted into this string.
    template.innerHTML = source;
    const slots = [];
    const usage = new Map();
    const matches = text => {
      const parts = [];
      let last = 0;
      for (const match of text.matchAll(pattern)) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        const index = Number(match[1]);
        usage.set(index, (usage.get(index) ?? 0) + 1);
        parts.push({ index });
        last = match.index + match[0].length;
      }
      if (last < text.length) parts.push(text.slice(last));
      return parts;
    };
    function walk(parent) {
      for (const node of [...parent.childNodes]) {
        if (node.nodeType === 1) {
          validateTag(node.localName);
          for (const attribute of [...node.attributes]) {
            if (attribute.name.includes('mfv-slot-')) throw new TypeError('Dynamic attribute names are unsupported');
            if (attribute.name.startsWith('@')) {
              const parts = matches(attribute.value);
              if (!/^@[a-z]+$/.test(attribute.name) || parts.length !== 1 || typeof parts[0] !== 'object') {
                throw new TypeError('Event directives require one dynamic handler');
              }
              slots.push({ kind: 'event', node, event: attribute.name.slice(1), index: parts[0].index });
              node.removeAttribute(attribute.name);
            } else if (attribute.value.includes('mfv-slot-')) {
              validateAttribute(attribute.name, '', document);
              slots.push({ kind: 'attribute', node, name: attribute.name, parts: matches(attribute.value) });
              node.removeAttribute(attribute.name);
            } else validateAttribute(attribute.name, attribute.value, document);
          }
          walk(node);
        } else if (node.nodeType === 3 && node.data.includes('mfv-slot-')) {
          const fragment = document.createDocumentFragment();
          for (const part of matches(node.data)) {
            if (typeof part === 'string') fragment.append(document.createTextNode(part));
            else {
              const anchor = document.createComment('slot');
              fragment.append(anchor);
              slots.push({ kind: 'child', node: anchor, index: part.index });
            }
          }
          node.replaceWith(fragment);
        } else if (node.nodeType === 8 && node.data.includes('mfv-slot-')) {
          throw new TypeError('Interpolations in comments are unsupported');
        }
      }
    }
    walk(template.content);
    function path(node) {
      const result = [];
      while (node.parentNode) {
        result.unshift([...node.parentNode.childNodes].indexOf(node));
        node = node.parentNode;
      }
      return result;
    }
    for (let index = 0; index < strings.length - 1; index++) {
      if (usage.get(index) !== 1) throw new TypeError('Unsupported template slot position');
    }
    const blueprint = { template, slots: slots.map(({ node, ...slot }) => ({ ...slot, path: path(node) })) };
    metrics.templateParses++;
    cache.set(strings, blueprint);
    return blueprint;
  }
  function clone(blueprint) {
    const fragment = blueprint.template.content.cloneNode(true);
    metrics.templateClones++;
    const slots = blueprint.slots.map(slot => ({ ...slot,
      node: slot.path.reduce((node, index) => node.childNodes[index], fragment) }));
    return { fragment, slots };
  }
  return { compile, clone };
}
