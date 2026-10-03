import test from 'node:test';
import assert from 'node:assert/strict';
import { createCowEngine } from '../../spikes/transactions/cow-engine.js';
import { createTransactionStore } from '../../src/runtime/state/transactions.js';
import { WORKLOAD_NAMES, makeInitialState, makeAction, perform, canonicalState } from './workloads.js';
for (const workload of WORKLOAD_NAMES) test('A.2 equivalent changing workload: ' + workload, () => {
  const spike = createCowEngine(makeInitialState(32)), runtime = createTransactionStore(makeInitialState(32));
  for (let step = 0; step < 12; step++) {
    const action = makeAction(workload, 32, step);
    assert.equal(perform(runtime, action, workload), perform(spike, action, workload));
    assert.equal(runtime.getVersion(), spike.getVersion());
    assert.equal(canonicalState(runtime), canonicalState(spike));
  }
  runtime.dispose();
});
