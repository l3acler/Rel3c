import { test, describe } from 'node:test';
import { createTransactionStore } from '../src/runtime/state/transactions.js';
import { FIXTURES } from './helpers/transaction-fixtures.js';
describe('A.2 production transaction contract', () => {
  for (const fixture of FIXTURES) test(fixture.id + ': ' + fixture.name, () => {
    const initial = fixture.initialState(); const engine = createTransactionStore(initial);
    const result = fixture.execute(engine);
    fixture.verify?.(result, { initial, engine });
    engine.dispose();
  });
});
