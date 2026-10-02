/**
 * spikes/transactions/contract.test.js
 *
 * Runs the shared transaction test fixtures against the Reference Evaluator.
 * Verifies that the reference evaluator implements all aspects of the prototype contract:
 * - Property addition/deletion
 * - Array structure & reordering
 * - Alias preservation
 * - Snapshot isolation & immutability
 * - Unsupported type rejection
 * - No-op actions
 * - Rollback on throw / abort
 * - Transaction lifetime & leaked draft revocation
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createReferenceEngine } from './reference-evaluator.js';
import { FIXTURES } from './fixtures.js';

describe('Phase 0.2 Transaction Contract & Reference Evaluator', () => {
  for (const fixture of FIXTURES) {
    test(`[${fixture.category}] ${fixture.id}: ${fixture.name}`, () => {
      const initial = fixture.initialState();
      const engine = createReferenceEngine(initial);

      const result = fixture.execute(engine);

      if (fixture.verify) {
        fixture.verify(result, { initial, engine });
      }
    });
  }

  test('reference evaluator handles multiple sequential transactions cleanly', () => {
    const engine = createReferenceEngine({ count: 0 });

    const tx1 = engine.begin();
    tx1.draft.count = 1;
    const res1 = tx1.commit();
    assert.equal(res1.version, 2);
    assert.equal(res1.state.count, 1);

    const tx2 = engine.begin();
    tx2.draft.count = 2;
    const res2 = tx2.commit();
    assert.equal(res2.version, 3);
    assert.equal(res2.state.count, 2);
  });
});
