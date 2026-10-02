/**
 * spikes/transactions/staged.test.js
 *
 * Runs the shared transaction fixture suite against the Staged-Operation Engine.
 * Verifies:
 * 1. All 28 contract fixtures pass identically
 * 2. Structural sharing: untouched branches maintain strict reference equality (===)
 * 3. Array structural sharing: untouched items preserve reference identity
 * 4. Alias preservation across multiple parents and collections
 * 5. Zero-cost rollback and draft revocation
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createStagedEngine } from './staged-engine.js';
import { FIXTURES } from './fixtures.js';

describe('Phase 0.4 Staged-Operation Transaction Engine', () => {
  // 1. Run all 28 shared contract fixtures
  for (const fixture of FIXTURES) {
    test(`[Staged Fixture - ${fixture.category}] ${fixture.id}: ${fixture.name}`, () => {
      const initial = fixture.initialState();
      const engine = createStagedEngine(initial);

      const result = fixture.execute(engine);

      if (fixture.verify) {
        fixture.verify(result, { initial, engine });
      }
    });
  }

  // 2. Staged-specific verification: Structural Sharing on Objects
  test('Staged Engine preserves structural sharing for untouched object branches', () => {
    const initial = {
      user: {
        profile: { name: 'Alice', age: 30 },
        preferences: { theme: 'dark', notifications: true }
      },
      settings: {
        locale: 'en',
        features: { beta: false }
      }
    };

    const engine = createStagedEngine(initial);
    const stateV1 = engine.getState();

    // Mutate only user.profile.age
    const res = engine.run((draft) => {
      draft.user.profile.age = 31;
    });

    const stateV2 = res.state;

    // Modified branch is a new reference
    assert.notEqual(stateV2, stateV1);
    assert.notEqual(stateV2.user, stateV1.user);
    assert.notEqual(stateV2.user.profile, stateV1.user.profile);
    assert.equal(stateV2.user.profile.age, 31);

    // CRITICAL STRUCTURAL SHARING ASSERTION: Untouched branches maintain strict reference equality (===)!
    assert.equal(
      stateV2.user.preferences,
      stateV1.user.preferences,
      'Untouched sibling preferences must maintain strict reference equality'
    );
    assert.equal(
      stateV2.settings,
      stateV1.settings,
      'Untouched root sibling settings must maintain strict reference equality'
    );
    assert.equal(
      stateV2.settings.features,
      stateV1.settings.features,
      'Untouched nested features must maintain strict reference equality'
    );
  });

  // 3. Staged-specific verification: Structural Sharing on Arrays
  test('Staged Engine preserves structural sharing for untouched array items', () => {
    const item1 = { id: 1, text: 'Item 1' };
    const item2 = { id: 2, text: 'Item 2' };
    const item3 = { id: 3, text: 'Item 3' };

    const engine = createStagedEngine({
      list: [item1, item2, item3],
      unrelated: { count: 0 }
    });

    const stateV1 = engine.getState();

    // Mutate only item 2's text
    const res = engine.run((draft) => {
      draft.list[1].text = 'Item 2 Updated';
    });

    const stateV2 = res.state;

    // List and item2 are modified
    assert.notEqual(stateV2.list, stateV1.list);
    assert.notEqual(stateV2.list[1], stateV1.list[1]);
    assert.equal(stateV2.list[1].text, 'Item 2 Updated');

    // CRITICAL ASSERTIONS: Untouched items retain exact memory reference!
    assert.equal(
      stateV2.list[0],
      stateV1.list[0],
      'Untouched array item 0 must preserve exact reference equality'
    );
    assert.equal(
      stateV2.list[2],
      stateV1.list[2],
      'Untouched array item 2 must preserve exact reference equality'
    );
    assert.equal(
      stateV2.unrelated,
      stateV1.unrelated,
      'Untouched unrelated object must preserve exact reference equality'
    );
  });

  // 4. Staged-specific verification: Sequential transactions across versions
  test('Staged Engine handles sequential transactions with persistent sharing', () => {
    const engine = createStagedEngine({
      branchA: { count: 0 },
      branchB: { count: 0 }
    });

    const s1 = engine.getState();

    // Transaction 1: Mutate branchA
    engine.run((draft) => {
      draft.branchA.count = 1;
    });
    const s2 = engine.getState();
    assert.equal(s2.branchB, s1.branchB, 'branchB retained across Tx 1');

    // Transaction 2: Mutate branchB
    engine.run((draft) => {
      draft.branchB.count = 1;
    });
    const s3 = engine.getState();
    assert.equal(s3.branchA, s2.branchA, 'branchA retained across Tx 2');
    assert.equal(s3.branchA.count, 1);
    assert.equal(s3.branchB.count, 1);
  });
});
