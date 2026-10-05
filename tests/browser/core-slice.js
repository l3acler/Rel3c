import { createApp } from '../../src/index.js';
import { coreConfig, ROLLBACK_MESSAGE } from '../../examples/core/app.js';
import { resourceCounts } from '../../src/runtime/diagnostics.js';
import { bindingProbe, domProbe, byId } from '../helpers/core-probe.js';

export async function runCoreSliceTests(test, assert, host) {
  const evidence = {};
  const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  function setup() {
    const target = host(), reads = bindingProbe(), reports = [], config = coreConfig();
    const app = createApp({ ...config, target, view: reads.wrap(config.view),
      onError: (error, info) => reports.push({ error, ...info }) });
    const writes = domProbe(target), records = [];
    const mutations = new MutationObserver(batch => records.push(...batch));
    mutations.observe(target, { childList: true, characterData: true, attributes: true, subtree: true });
    return { app, target, reads, writes, reports, get: id => byId(target, id),
      takeMutations() { return records.splice(0).concat(mutations.takeRecords()); },
      close() { mutations.disconnect(); app.dispose(); writes.restore(); target.remove(); } };
  }
  await test('A.10 native click commits one version, evaluates one binding and mutates exactly its text', async () => {
    const fixture = setup(), { app, reads, writes, get } = fixture;
    try {
      const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot(), beforeVersion = app.stateVersion;
      const independent = get('core-unrelated'), nested = get('core-name'), list = get('core-items');
      get('core-increment').querySelector('span').click();
      assert(app.state.count === 1 && app.stateVersion === beforeVersion + 1 && get('core-count').textContent === '0');
      equal(reads.delta(beforeReads), {}); equal(writes.delta(beforeWrites), {});
      await nextFrame();
      equal(reads.delta(beforeReads), { 'root.count': 1 }); equal(writes.delta(beforeWrites), { 'text:core-count': 1 });
      const mutations = fixture.takeMutations();
      assert(mutations.length === 1 && mutations[0].type === 'characterData' && mutations[0].target === get('core-count').firstChild);
      assert(get('core-count').textContent === '1' && get('core-unrelated') === independent && independent.textContent === 'Independent');
      assert(get('core-name') === nested && get('core-items') === list);
      evidence.counter = { beforeVersion, afterVersion: app.stateVersion, reads: reads.delta(beforeReads),
        writes: writes.delta(beforeWrites), mutationTypes: mutations.map(record => record.type), unrelatedNodeRetained: true };
    } finally { fixture.close(); }
  });
  await test('A.10 native throwing action publishes no version, evaluations, setters or mutations', async () => {
    const fixture = setup(), { app, target, reads, writes, reports, get } = fixture;
    let errors = 0;
    const listener = event => { if (event.error?.message === ROLLBACK_MESSAGE) { errors++; event.preventDefault(); } };
    window.addEventListener('error', listener);
    try {
      const field = get('core-input-1'); field.value = 'Local edit'; field.focus(); field.setSelectionRange(1, 4);
      const state = app.state, version = app.stateVersion, markup = target.innerHTML;
      const nodes = [...target.querySelectorAll('*')], beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
      get('core-fail').click(); app.flush(); await nextFrame();
      assert(app.state === state && app.stateVersion === version && target.innerHTML === markup);
      assert([...target.querySelectorAll('*')].every((node, index) => node === nodes[index]));
      assert(document.activeElement === field && field.value === 'Local edit' && field.selectionStart === 1 && field.selectionEnd === 4);
      equal(reads.delta(beforeReads), {}); equal(writes.delta(beforeWrites), {}); assert(fixture.takeMutations().length === 0);
      assert(reports.length === 1 && reports[0].phase === 'event' && errors === 1 && resourceCounts(app).frames === 0);
      evidence.rollback = { version, afterVersion: app.stateVersion, snapshotRetained: true, nodesRetained: true,
        reads: reads.delta(beforeReads), writes: writes.delta(beforeWrites), mutations: 0, errorReports: reports.length };
    } finally { window.removeEventListener('error', listener); fixture.close(); }
  });
  await test('A.10 native nested/item updates skip independent bindings and list structure', async () => {
    const fixture = setup(), { reads, writes, get } = fixture;
    try {
      let beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
      get('core-rename').click(); await nextFrame();
      equal(reads.delta(beforeReads), { 'root.profileName': 1 }); equal(writes.delta(beforeWrites), { 'text:core-name': 1 });
      assert(get('core-name').textContent === 'Grace');
      const nested = { reads: reads.delta(beforeReads), writes: writes.delta(beforeWrites) };
      beforeReads = reads.snapshot(); beforeWrites = writes.snapshot();
      get('core-rename-1').click(); await nextFrame();
      equal(reads.delta(beforeReads), { 'root.row1.itemName': 1, 'root.row1.editValue': 1 });
      equal(writes.delta(beforeWrites), { 'text:core-item-1': 1, 'value:core-input-1': 1 });
      assert(get('core-item-2').textContent === 'Second item' && get('core-count').textContent === '0');
      evidence.exactFields = { nested, item: { reads: reads.delta(beforeReads), writes: writes.delta(beforeWrites) } };
    } finally { fixture.close(); }
  });
  await test('A.10 native keyed reorder preserves focus/selection and add/remove restores resources', async () => {
    const fixture = setup(), { app, target, reads, writes, get } = fixture;
    try {
      const field = get('core-input-1'), second = get('core-input-2');
      field.value = 'Local edit'; field.focus(); field.setSelectionRange(1, 4);
      let blurs = 0; const blur = () => { blurs++; }; field.addEventListener('blur', blur);
      try {
        const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
        get('core-reverse').click(); await nextFrame();
        const changes = reads.delta(beforeReads);
        equal(changes, { 'root.items': 1, 'root.key': 2, 'root.row1.position': 1, 'root.row2.position': 1 });
        assert(get('core-input-1') === field && get('core-input-2') === second && document.activeElement === field && blurs === 0);
        assert(field.value === 'Local edit' && field.selectionStart === 1 && field.selectionEnd === 4);
        assert(writes.delta(beforeWrites)['value:core-input-1'] === undefined);
        const baseline = resourceCounts(app);
        get('core-add').click(); app.flush(); assert(get('core-input-3'));
        const removed = get('core-rename-3'); get('core-remove-3').click(); app.flush();
        equal(resourceCounts(app), baseline); assert(!get('core-input-3'));
        target.appendChild(removed); const version = app.stateVersion; removed.click(); assert(app.stateVersion === version); removed.remove();
        evidence.keyed = { reorderReads: changes, retainedNodes: true, retainedFocusAndSelection: true,
          blurEvents: blurs, resourcesRestored: true, staleHandlerInert: true };
      } finally { field.removeEventListener('blur', blur); }
    } finally { fixture.close(); }
  });
  await test('A.10 native conditional removal cancels descendant reads and handler ownership', async () => {
    const fixture = setup(), { app, target, reads, writes, get } = fixture;
    try {
      const oldText = get('core-details-text').firstChild, oldButton = get('core-details-change');
      const beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
      oldButton.click(); get('core-toggle').click(); await nextFrame();
      equal(reads.delta(beforeReads), { 'root.visible': 1 });
      assert(!get('core-details') && oldText.data === 'Visible details' && writes.delta(beforeWrites)['text:core-details-text'] === undefined);
      target.appendChild(oldButton); const version = app.stateVersion; oldButton.click(); assert(app.stateVersion === version); oldButton.remove();
      get('core-toggle').click(); app.flush(); assert(get('core-details-text').textContent === 'Updated details');
      evidence.conditional = { removedBindingEvaluations: 0, removedTextWrites: 0, staleHandlerInert: true, freshScopeReadsLatestState: true };
    } finally { fixture.close(); }
  });
  await test('A.10 native click burst writes latest once and disposal cancels queued work', async () => {
    const fixture = setup(), { app, target, reads, writes, get } = fixture;
    try {
      const version = app.stateVersion, beforeReads = reads.snapshot(), beforeWrites = writes.snapshot();
      for (let i = 0; i < 3; i++) get('core-increment').click();
      assert(app.stateVersion === version + 3); app.flush(); await nextFrame();
      equal(reads.delta(beforeReads), { 'root.count': 1 }); equal(writes.delta(beforeWrites), { 'text:core-count': 1 });
      assert(get('core-count').textContent === '3');
      evidence.burst = { commits: 3, reads: reads.delta(beforeReads), writes: writes.delta(beforeWrites) };
      get('core-increment').click(); const finalReads = reads.snapshot(), finalWrites = writes.snapshot();
      app.dispose(); const removalWrites = writes.delta(finalWrites); await nextFrame();
      equal(reads.delta(finalReads), {}); equal(writes.delta(finalWrites), removalWrites);
      assert(!target.firstChild && Object.values(resourceCounts(app)).every(value => value === 0));
      evidence.disposal = { laterBindingReads: 0, laterBindingWrites: 0, resources: resourceCounts(app) };
    } finally { fixture.close(); }
  });
  return evidence;
}
