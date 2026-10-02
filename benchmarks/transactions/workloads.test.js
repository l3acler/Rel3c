import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES } from './engines.js';
import { WORKLOAD_NAMES, makeInitialState, makeAction, perform, canonicalState,
  expectedVersion, summarize, caseOrder } from './workloads.js';
import { createNativeModel, assertGraphMatches, expectedInvalidations,
  sortInvalidations } from '../../spikes/transactions/comparison-fixtures.js';

for (const name of WORKLOAD_NAMES) {
  test(`benchmark ${name}: equivalent values/identity/invalidations and bounded size`, () => {
    const engines = Object.values(ENGINES).map(createEngine => createEngine(makeInitialState(8)));
    for (let step = 0; step < 8; step++) {
      for (const engine of engines) {
        const initial = engine.getState();
        const model = createNativeModel(engine);
        const before = model.observe();
        const action = makeAction(name, 8, step);
        if (name === 'rollback') {
          perform(engine, action, name);
          assert.equal(engine.getState(), initial);
          assert.equal(engine.getVersion(), 1);
        } else {
          action(model.state);
          const result = engine.run(action);
          assertGraphMatches(result.state, model.state, engine, model.id);
          assert.deepEqual(sortInvalidations(result.affectedProperties), expectedInvalidations(before, model.observe()));
          assert.equal(engine.getVersion(), expectedVersion(name, step + 1));
        }
        assert.equal(engine.getState().rows.length, 8);
        assert.equal(engine.getState().primary, engine.getState().secondary);
        assert.equal(engine.getState().primary, engine.getState().group.shared);
      }
      assert.equal(canonicalState(engines[0]), canonicalState(engines[1]));
      assert.equal(canonicalState(engines[0]), canonicalState(engines[2]));
    }
  });
}

test('quantiles use median and nearest-rank p95 without mutating raw samples', () => {
  const samples = [5, 1, 2, 4, 3];
  assert.deepEqual(summarize(samples), { count: 5, median: 3, p95: 5, min: 1, max: 5 });
  assert.equal(summarize([1, 2]).median, 1.5);
  assert.deepEqual(samples, [5, 1, 2, 4, 3]);
  assert.equal(summarize([]).p95, null);
  assert.deepEqual(caseOrder(1), ['cow', 'staged', 'reference']);
  assert.deepEqual(caseOrder(2), ['staged', 'reference', 'cow']);
});
