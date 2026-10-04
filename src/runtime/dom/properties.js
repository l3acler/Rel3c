import { fail, requireSync } from '../errors.js';
import { readRecord } from '../records.js';
import { isBinding, resolveBinding } from './bindings.js';

const booleans = new Set(['disabled', 'checked', 'selected', 'multiple', 'required',
  'readonly', 'hidden', 'autofocus', 'novalidate', 'formnovalidate', 'open', 'reversed',
  'allowfullscreen', 'ismap', 'itemscope', 'inert']);
const urls = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite']);
const forbidden = new Set(['srcdoc', 'innerhtml', 'outerhtml', 'textcontent', 'dangerouslysetinnerhtml']);
const aliases = { className: 'class', htmlFor: 'for', readOnly: 'readonly', tabIndex: 'tabindex' };
export const propertyName = name => Object.hasOwn(aliases, name) ? aliases[name] : name;
export function validateName(name) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) || /^on/i.test(name) || forbidden.has(name.toLowerCase()))
    fail('DOM_ATTRIBUTE_INVALID', `Unsupported attribute ${name}; Only the onClick function prop is supported; other event attributes are unavailable.`);
}
const scalar = value => value === null || value === undefined || ['string', 'boolean'].includes(typeof value) ||
  (typeof value === 'number' && Number.isFinite(value));
export function text(value) {
  if (!scalar(value)) fail('DOM_TEXT_INVALID', 'Bound text requires a string, finite number, boolean, null or undefined.');
  return value === null || value === undefined || typeof value === 'boolean' ? '' : String(value);
}
function boolean(value, name) {
  if (value !== null && value !== undefined && typeof value !== 'boolean')
    fail('DOM_ATTRIBUTE_INVALID', `${name} requires a boolean, null or undefined.`);
  return value === true;
}
function resolve(value, state, owner) {
  const result = resolveBinding(value, state, owner);
  requireSync(result, 'REACTIVITY_ASYNC', 'DOM binding reads must be synchronous.');
  return result;
}
export function classText(value, state, owner) {
  value = resolve(value, state, owner);
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  const classes = readRecord(value, 'DOM_CLASS_INVALID', 'class');
  return Object.entries(classes).filter(([name, flag]) => {
    if (!name || /\s/.test(name)) fail('DOM_CLASS_INVALID', 'Class map keys must be nonempty single class names.');
    return boolean(resolve(value[name], state, owner), `Class ${name}`);
  }).map(([name]) => name).join(' ');
}
export function styleText(value, state, owner) {
  value = resolve(value, state, owner);
  if (value === null || value === undefined) return '';
  const styles = readRecord(value, 'DOM_STYLE_INVALID', 'style');
  return Object.entries(styles).map(([key, raw]) => {
    const name = key.startsWith('--') ? key : key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    if (!/^(--[a-zA-Z0-9_-]+|[a-z][a-z-]*)$/.test(name)) fail('DOM_STYLE_INVALID', `Unsupported CSS property ${key}.`);
    const result = resolve(value[key], state, owner);
    if (result === null || result === undefined) return '';
    if (!['string', 'number'].includes(typeof result) || (typeof result === 'number' && !Number.isFinite(result)))
      fail('DOM_STYLE_INVALID', 'Style values require strings, finite numbers, null or undefined.');
    const serialized = String(result);
    if (/[;{}]|url\s*\(|expression\s*\(/i.test(serialized))
      fail('DOM_STYLE_INVALID', 'Style values cannot contain declarations, URL functions or expressions.');
    return `${name}: ${serialized};`;
  }).filter(Boolean).join(' ');
}
export function hasBindings(value) {
  if (isBinding(value)) return true;
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some(isBinding);
}
export function prepareProperty(node, rawName, input, state, owner) {
  const name = propertyName(rawName);
  validateName(name);
  const lower = name.toLowerCase(), tag = node.tagName.toLowerCase();
  if (name === 'class') return { kind: 'attribute', name, value: classText(input, state, owner) };
  if (lower === 'style') return { kind: 'style', name, value: styleText(input, state, owner) };
  const value = resolve(input, state, owner);
  if (!scalar(value)) fail('DOM_ATTRIBUTE_INVALID', `Attribute ${name} requires supported primitive data.`);
  if (urls.has(lower) && value !== null && value !== undefined) {
    const protocol = new URL(String(value), node.ownerDocument.baseURI).protocol;
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(protocol))
      fail('DOM_ATTRIBUTE_INVALID', `Unsupported URL protocol ${protocol}.`);
  }
  if (lower === 'value' && ['input', 'textarea', 'select'].includes(tag)) {
    const next = value === null || value === undefined ? '' : String(value);
    if (tag === 'input' && node.type === 'file' && next !== '')
      fail('DOM_PROPERTY_INVALID', 'File inputs cannot have a nonempty bound value.');
    return { kind: 'property', name: 'value', value: next, defaultName: tag === 'select' ? null : 'defaultValue' };
  }
  if ((lower === 'checked' && tag === 'input') || (lower === 'selected' && tag === 'option'))
    return { kind: 'property', name: lower, value: boolean(value, name), defaultName: lower === 'checked' ? 'defaultChecked' : 'defaultSelected' };
  return { kind: 'attribute', name, value: booleans.has(lower) ? (boolean(value, name) ? '' : null) :
    value === null || value === undefined ? null : String(value) };
}
export function applyProperty(node, prepared, initial) {
  const { kind, name, value, defaultName } = prepared;
  if (kind === 'property') {
    if (initial && defaultName) node[defaultName] = value;
    if (!Object.is(node[name], value)) node[name] = value;
  } else if (kind === 'style') {
    if (node.style.cssText !== value) node.style.cssText = value;
  } else if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
