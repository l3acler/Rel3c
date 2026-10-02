const tags = new Set(['div', 'p', 'span', 'button', 'form', 'label', 'input', 'textarea', 'select', 'option',
  'ul', 'ol', 'li', 'section', 'main', 'article', 'a', 'h1', 'h2', 'h3', 'strong', 'em', 'small', 'br']);
const booleans = new Set(['disabled', 'checked', 'selected', 'multiple', 'required', 'readonly', 'hidden', 'autofocus']);
const urls = new Set(['href', 'src', 'action', 'formaction', 'poster']);

export function validateTag(tag) {
  if (!tags.has(tag.toLowerCase())) throw new TypeError(`Unsupported or unsafe prototype tag: ${tag}`);
  return tag.toLowerCase();
}

export function validateAttribute(name, value, document) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) || /^on/i.test(name) || name.toLowerCase() === 'srcdoc') {
    throw new TypeError(`Unsafe attribute: ${name}`);
  }
  if (name.toLowerCase() === 'style') throw new TypeError('Use element-function style objects; raw style strings are unsupported');
  if (value !== null && value !== undefined && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new TypeError(`Attribute ${name} requires a primitive value`);
  }
  if (urls.has(name.toLowerCase()) && value !== null && value !== undefined) {
    const protocol = new URL(String(value), document.baseURI).protocol;
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) throw new TypeError(`Unsafe URL protocol: ${protocol}`);
  }
}

export function setAttribute(node, name, value, metrics) {
  if (name === 'className') name = 'class';
  if (name === 'htmlFor') name = 'for';
  validateAttribute(name, value, node.ownerDocument);
  const lower = name.toLowerCase();
  if (lower === 'value' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) {
    const next = value === null || value === undefined ? '' : String(value);
    if (node.value !== next) { node.value = next; metrics.valueWrites++; }
    return;
  }
  if (lower === 'checked' && node.tagName === 'INPUT') {
    const next = !!value;
    if (node.checked !== next) { node.checked = next; metrics.valueWrites++; }
    return;
  }
  const next = booleans.has(lower) ? (value === false || value === null || value === undefined ? null : '')
    : value === null || value === undefined ? null : String(value);
  if (next === null) {
    if (node.hasAttribute(name)) { node.removeAttribute(name); metrics.valueWrites++; }
  } else if (node.getAttribute(name) !== next) { node.setAttribute(name, next); metrics.valueWrites++; }
}

export function setStyles(node, value, metrics) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('style requires a property/value object');
  const names = new Set(Object.keys(value).map(name => name.replace(/[A-Z]/g, match => '-' + match.toLowerCase())));
  for (const existing of [...node.style]) {
    if (!names.has(existing)) { node.style.removeProperty(existing); metrics.valueWrites++; }
  }
  for (const [name, input] of Object.entries(value)) {
    const property = name.replace(/[A-Z]/g, match => '-' + match.toLowerCase());
    if (!/^--[a-z0-9-]+$|^[a-z][a-z-]*$/.test(property)) throw new TypeError('Unsupported style property');
    const next = input === null || input === undefined ? '' : String(input);
    if (/url\s*\(|expression\s*\(/i.test(next)) throw new TypeError('URL/expression style values are unsupported');
    if (node.style.getPropertyValue(property) !== next) {
      if (next) node.style.setProperty(property, next); else node.style.removeProperty(property);
      metrics.valueWrites++;
    }
  }
}
