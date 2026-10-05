import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';
import { coreConfig, ROLLBACK_MESSAGE } from '../examples/core/app.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeDocument } from './helpers/fake-dom.js';
import { bindingProbe, domProbe, byId } from './helpers/core-probe.js';

function setup() {
  const document = fakeDocument(), target = document.createElement('div'), reads = bindingProbe(), reports = [];
  const config = coreConfig();
  const app = createApp({ ...config, target, view: reads.wrap(config.view), onError: (error, info) => reports.push({ error, ...info }) });
  const writes = domProbe(target);
  return { app, document, target, reads, writes, reports, get: id => byId(target, id),
    close() { app.dispose(); writes.restore(); } };
}

test('A.10 one click commits once, evaluates only the counter binding and writes exactly one text node', () => {
  const fixture = setup(), { app, document, target, reads, writes, get } = fixture;
  try {
    const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot(), version = app.stateVersion;
    const unrelated = get('core-unrelated'), nested = get('core-name'), rows = get('core-items');
    get('core-increment').childNodes[0].click();
    assert.equal(app.state.count, 1); assert.equal(app.stateVersion, version + 1);
    assert.equal(get('core-count').textContent, '0'); assert.equal(document.pendingFrames, 1);
    assert.deepEqual(reads.delta(beforeReads), {}); assert.deepEqual(writes.delta(beforeWrites), {});
    document.flushFrame();
    assert.deepEqual(reads.delta(beforeReads), { 'root.count': 1 });
    assert.deepEqual(writes.delta(beforeWrites), { 'text:core-count': 1 });
    assert.equal(get('core-unrelated'), unrelated); assert.equal(unrelated.textContent, 'Independent');
    assert.equal(get('core-name'), nested); assert.equal(get('core-items'), rows); assert.equal(get('core-count').textContent, '1');
    assert.ok(target.childNodes.length);
  } finally { fixture.close(); }
});

test('A.10 a click that throws across every section keeps the state snapshot, version and whole UI', () => {
  const fixture = setup(), { app, document, reads, writes, reports, get } = fixture;
  try {
    const state = app.state, version = app.stateVersion, beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
    const references = ['core-count', 'core-unrelated', 'core-name', 'core-details', 'core-items', 'core-input-1'].map(get);
    const text = fixture.target.textContent;
    assert.throws(() => get('core-fail').click(), error => error.message === ROLLBACK_MESSAGE);
    app.flush(); document.flushFrame();
    assert.equal(app.state, state); assert.equal(app.stateVersion, version); assert.equal(fixture.target.textContent, text);
    assert.deepEqual(['core-count', 'core-unrelated', 'core-name', 'core-details', 'core-items', 'core-input-1'].map(get), references);
    assert.deepEqual(reads.delta(beforeReads), {}); assert.deepEqual(writes.delta(beforeWrites), {});
    assert.equal(document.pendingFrames, 0); assert.equal(reports.length, 1); assert.equal(reports[0].phase, 'event');
  } finally { fixture.close(); }
});

test('A.10 independent nested and item properties update only their exact bindings', () => {
  const fixture = setup(), { document, reads, writes, get } = fixture;
  try {
    let beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
    get('core-rename').click(); document.flushFrame();
    assert.equal(get('core-name').textContent, 'Grace');
    assert.deepEqual(reads.delta(beforeReads), { 'root.profileName': 1 });
    assert.deepEqual(writes.delta(beforeWrites), { 'text:core-name': 1 });
    beforeReads = reads.snapshot(); beforeWrites = writes.snapshot();
    get('core-rename-1').click(); document.flushFrame();
    assert.deepEqual(reads.delta(beforeReads), { 'root.row1.itemName': 1, 'root.row1.editValue': 1 });
    assert.deepEqual(writes.delta(beforeWrites), { 'text:core-item-1': 1, 'value:core-input-1': 1 });
    assert.equal(get('core-item-2').textContent, 'Second item');
  } finally { fixture.close(); }
});

test('A.10 keyed reorders retain rows and insertion/removal restore resource ownership', () => {
  const fixture = setup(), { app, document, reads, writes, get } = fixture;
  try {
    const first = get('core-input-1'), second = get('core-input-2'); first.value = 'Local edit';
    const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
    get('core-reverse').click(); document.flushFrame();
    assert.equal(get('core-input-1'), first); assert.equal(get('core-input-2'), second); assert.equal(first.value, 'Local edit');
    assert.equal(get('core-position-1').textContent, '2'); assert.equal(get('core-position-2').textContent, '1');
    assert.deepEqual(reads.delta(beforeReads), { 'root.items': 1, 'root.key': 2, 'root.row1.position': 1, 'root.row2.position': 1 });
    assert.equal(writes.delta(beforeWrites)['value:core-input-1'], undefined);
    const baseline = resourceCounts(app);
    get('core-add').click(); app.flush(); assert.ok(get('core-input-3'));
    const removed = get('core-rename-3'); get('core-remove-3').click(); app.flush();
    assert.equal(get('core-input-3'), null); assert.deepEqual(resourceCounts(app), baseline);
    fixture.target.appendChild(removed); const version = app.stateVersion; removed.click();
    assert.equal(app.stateVersion, version); fixture.target.removeChild(removed);
  } finally { fixture.close(); }
});

test('A.10 conditional removal cancels queued descendant reads/writes and stale handlers', () => {
  const fixture = setup(), { app, document, reads, writes, get } = fixture;
  try {
    const removed = get('core-details-change'), oldText = get('core-details-text'), textNode = oldText.childNodes[0];
    const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
    removed.click(); get('core-toggle').click(); document.flushFrame();
    assert.equal(get('core-details'), null); assert.equal(textNode.data, 'Visible details');
    assert.deepEqual(reads.delta(beforeReads), { 'root.visible': 1 });
    assert.equal(writes.delta(beforeWrites)['text:core-details-text'], undefined);
    fixture.target.appendChild(removed); const version = app.stateVersion; removed.click();
    assert.equal(app.stateVersion, version); fixture.target.removeChild(removed);
    get('core-toggle').click(); app.flush(); assert.equal(get('core-details-text').textContent, 'Updated details');
    assert.notEqual(get('core-details-text'), oldText);
  } finally { fixture.close(); }
});

test('A.10 click bursts coalesce, explicit flush avoids duplicates, and disposal cancels later work', () => {
  const fixture = setup(), { app, document, reads, writes, get } = fixture;
  try {
    const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot(), version = app.stateVersion;
    for (let i = 0; i < 3; i++) get('core-increment').click();
    assert.equal(app.stateVersion, version + 3); app.flush(); document.flushFrame();
    assert.equal(get('core-count').textContent, '3');
    assert.deepEqual(reads.delta(beforeReads), { 'root.count': 1 });
    assert.deepEqual(writes.delta(beforeWrites), { 'text:core-count': 1 });
    get('core-increment').click(); const finalReads = reads.snapshot(), finalWrites = writes.snapshot();
    app.dispose(); const disposalWrites = writes.delta(finalWrites); document.flushFrame();
    assert.deepEqual(reads.delta(finalReads), {}); assert.deepEqual(writes.delta(finalWrites), disposalWrites);
    assert.ok(Object.values(resourceCounts(app)).every(value => value === 0));
    assert.equal(fixture.target.childNodes.length, 0);
  } finally { fixture.close(); }
});
