import test from 'node:test';
import assert from 'node:assert/strict';
import { div, button, span, html, keyed, when, isViewNode } from './nodes.js';
import { createBindings, derive, isBinding, readBinding } from './bindings.js';
import { validateAttribute, validateTag } from './security.js';
import { summary } from './measurements.js';

test('element functions accept no props, flat props, nested descriptors and direct tokens', () => {
  const bind = createBindings(() => ({ count: 2 }));
  const value = div(button({ onClick() {} }, '-'), span(bind.count));
  assert.equal(value.children.length, 2); assert.deepEqual(value.props, {});
  assert.equal(readBinding(value.children[1].children[0]), 2);
  assert.equal(isViewNode(value), true); assert.equal(Object.isFrozen(value), true);
});
test('binding tokens resolve current nested state and do not box primitive state', () => {
  let state = { person: { name: 'Ada' }, count: 1 };
  const bind = createBindings(() => state); const token = bind.person.name;
  state = { person: { name: 'Grace' }, count: 2 };
  assert.equal(readBinding(token), 'Grace'); assert.equal(typeof state.count, 'number');
  assert.equal(readBinding(derive(() => state.count * 3)), 6);
  assert.equal(isBinding(token), true); assert.throws(() => { bind.count = 9; }, /read-only/);
});
test('native template sites have stable identity, different sites do not', () => {
  const site = value => html`<span>${value}</span>`;
  const first = site(1); const second = site(2);
  assert.equal(first.strings, second.strings); assert.equal(Object.isFrozen(first.strings), true);
  assert.notEqual(first.strings, html`<span>${1}</span>`.strings);
  assert.deepEqual(second.values, [2]);
});
test('eager primitives do not carry their property/expression provenance into a tag', () => {
  const reads = []; const state = new Proxy({ a: 0, b: 0 }, { get(target, key) { reads.push(key); return target[key]; } });
  const evaluate = (a, b) => [a, b];
  const values = evaluate(state.a + state.b, state.a);
  assert.deepEqual(values, [0, 0]); assert.deepEqual(reads, ['a', 'b', 'a']);
  // No boundary tells the tag whether read "b" belongs to slot 0 or slot 1.
  reads.length = 0;
  const swapped = evaluate(state.a, state.b + state.a);
  assert.deepEqual(swapped, values);
  assert.deepEqual(reads, ['a', 'b', 'a']);
});
test('control descriptors remain explicit, without application DOM mutation', () => {
  assert.equal(keyed([], item => item.id, () => div()).kind, 'keyed');
  assert.equal(when(true, () => div()).kind, 'when');
});
test('inline events, unsupported tags and active URL protocols are rejected', () => {
  const document = { baseURI: 'https://example.com/' };
  for (const name of ['onclick', 'onClick', 'srcdoc', '@click', 'style']) assert.throws(() => validateAttribute(name, 'x', document));
  for (const value of ['javascript:alert(1)', 'data:text/html,evil', 'vbscript:bad']) assert.throws(() => validateAttribute('href', value, document));
  assert.doesNotThrow(() => validateAttribute('href', '/safe', document));
  assert.equal(validateTag('DIV'), 'div'); assert.throws(() => validateTag('script'));
});
test('syntax measurements use conventional median and nearest-rank p95', () => {
  const samples = [4, 2, 1, 3]; assert.deepEqual(summary(samples), { median: 2.5, p95: 4 });
  assert.deepEqual(samples, [4, 2, 1, 3]);
});
