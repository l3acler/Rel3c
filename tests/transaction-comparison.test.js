import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionStore } from '../src/runtime/state/transactions.js';
const hasCode = (...codes) => error => codes.includes(error.code);
const TransactionActiveError = hasCode('TRANSACTION_ACTIVE');
const TransactionCompletedError = hasCode('TRANSACTION_COMPLETED');
const DraftRevokedError = error => error instanceof TypeError && /revoked/.test(error.message);
const UnsupportedTypeError = hasCode('STATE_INVALID', 'TRANSACTION_ASYNC');
const CircularReferenceError = hasCode('STATE_CYCLE');

import { initialComparisonState, createRandom, createProgram, applyOperation,
  createNativeModel, expectedInvalidations, sortInvalidations, assertGraphMatches } from '../spikes/transactions/comparison-fixtures.js';

const factories = { production: createTransactionStore };

for (const [name, createEngine] of Object.entries(factories)) {
  describe(`A.2 ${name} identity regressions`, () => {
    test('an unread alias observes a mutation and remains aliased at commit', () => {
      const shared = { count: 1 };
      const engine = createEngine({ primary: shared, secondary: shared, nested: { shared } });
      const result = engine.run(draft => { draft.primary.count = 2; });
      assert.equal(result.state.primary, result.state.secondary);
      assert.equal(result.state.primary, result.state.nested.shared);
      assert.equal(result.state.secondary.count, 2);
    });

    test('repeated edits through different aliases target the same draft', () => {
      const shared = { count: 1 };
      const engine = createEngine({ primary: shared, secondary: shared });
      engine.run(draft => {
        const first = draft.primary;
        first.count = 2;
        assert.equal(draft.primary, first);
        assert.equal(draft.secondary, first);
        draft.secondary.count += 1;
        assert.equal(first.count, 3);
      });
      assert.equal(engine.getState().primary.count, 3);
      assert.equal(engine.getState().primary, engine.getState().secondary);
    });

    test('a held item survives reorder and edits follow its identity', () => {
      const a = { id: 'a', count: 0 };
      const engine = createEngine({ items: [a, { id: 'b', count: 0 }], selected: a });
      engine.run(draft => {
        const held = draft.items[0];
        held.count = 1;
        draft.items.reverse();
        assert.equal(draft.items[1], held);
        held.count = 2;
        assert.equal(draft.items[1].count, 2);
      });
      assert.deepEqual(engine.getState().items.map(item => item.id), ['b', 'a']);
      assert.equal(engine.getState().items[1], engine.getState().selected);
      assert.equal(engine.getState().selected.count, 2);
    });

    test('remove/reinsert retains item identity and revokes the returned draft', () => {
      const engine = createEngine({ items: [{ id: 'a', count: 0 }, { id: 'b', count: 0 }] });
      let removed;
      engine.run(draft => {
        removed = draft.items.shift();
        removed.count = 5;
        draft.items.push(removed);
        assert.equal(draft.items[1], removed);
      });
      assert.equal(engine.getState().items[1].count, 5);
      assert.throws(() => removed.count, DraftRevokedError);
    });

    test('adding undefined differs from absence; array holes survive commits', () => {
      const engine = createEngine({ items: [1, 2, 3] });
      engine.run(draft => {
        draft.added = undefined;
        delete draft.items[1];
        assert.equal(1 in draft.items, false);
        assert.deepEqual(Object.keys(draft.items), ['0', '2']);
      });
      assert.equal(Object.hasOwn(engine.getState(), 'added'), true);
      assert.equal(1 in engine.getState().items, false);
    });

    test('item property changes invalidate neither other items nor array structure', () => {
      const engine = createEngine(initialComparisonState());
      const before = engine.getState();
      const targetId = engine.getObjectId(before.items[0]);
      const result = engine.run(draft => { draft.selected.count = 3; });
      assert.deepEqual(result.affectedProperties, [{ targetId, kind: 'value', key: 'count' }]);
      assert.equal(engine.getObjectId(result.state.items[0]), targetId);
      assert.equal(result.state.selected, result.state.items[0]);
    });

    test('reorder changes index/iteration bindings but not length or item fields', () => {
      const engine = createEngine(initialComparisonState());
      const before = engine.getState();
      const targetId = engine.getObjectId(before.items);
      const itemId = engine.getObjectId(before.items[0]);
      const result = engine.run(draft => { draft.items.reverse(); });
      assert.deepEqual(sortInvalidations(result.affectedProperties), sortInvalidations([
        { targetId, kind: 'value', key: '0' }, { targetId, kind: 'value', key: '1' },
        { targetId, kind: 'iterate', key: null },
      ]));
      assert.equal(engine.getObjectId(result.state.items[1]), itemId);
      assert.equal(result.state.selected, result.state.items[1]);
      if (name !== 'reference') assert.equal(result.state.items[1], before.items[0]);
    });

    test('net invalidations omit reverted/repeated writes even in a changed transaction', () => {
      const engine = createEngine({ nested: { x: 0, y: 1 } });
      const targetId = engine.getObjectId(engine.getState().nested);
      const result = engine.run(draft => {
        draft.nested.x = 99;
        draft.nested.x = 0;
        draft.nested.y = 2;
        draft.nested.y = 3;
      });
      assert.deepEqual(result.affectedProperties, [{ targetId, kind: 'value', key: 'y' }]);
      assert.equal(result.changes.length, 1);
      assert.equal(result.changes[0].oldValue, 1);
      assert.equal(result.changes[0].value, 3);
    });

    test('adding undefined invalidates existence and keys, not an unchanged value', () => {
      const engine = createEngine({});
      const targetId = engine.getObjectId(engine.getState());
      const result = engine.run(draft => { draft.added = undefined; });
      assert.deepEqual(sortInvalidations(result.affectedProperties), sortInvalidations([
        { targetId, kind: 'has', key: 'added' }, { targetId, kind: 'keys', key: null },
      ]));
    });

    test('new alias edges and same-shaped replacements are observable identity changes', () => {
      const engine = createEngine({ a: { x: 1 }, b: { x: 1 } });
      const before = engine.getState();
      const aId = engine.getObjectId(before.a);
      const merged = engine.run(draft => { draft.b = draft.a; });
      assert.equal(merged.isNoop, false);
      assert.equal(merged.state.a, merged.state.b);
      const split = engine.run(draft => { draft.a = { x: 1 }; });
      assert.equal(split.isNoop, false);
      assert.notEqual(split.state.a, split.state.b);
      assert.equal(engine.getObjectId(split.state.b), aId);
      assert.notEqual(engine.getObjectId(split.state.a), aId);
    });

    test('imported object graphs preserve aliases across assignments without freezing callers', () => {
      const engine = createEngine({});
      const child = { x: 0 };
      const external = { left: child, right: child };
      engine.run(draft => {
        draft.a = external;
        draft.b = external;
        draft.a.left.x = 3;
        assert.equal(draft.a, draft.b);
        assert.equal(draft.a.left, draft.b.right);
      });
      assert.equal(engine.getState().a, engine.getState().b);
      assert.equal(engine.getState().a.left, engine.getState().b.right);
      assert.equal(child.x, 0);
      assert.equal(Object.isFrozen(external), false);
      child.x = 4;
      assert.equal(engine.getState().a.left.x, 3);
    });

    test('commit-time cycles roll back, revoke drafts, and allow a next transaction', () => {
      const engine = createEngine({ x: 0 });
      const before = engine.getState();
      const version = engine.getVersion();
      let leaked;
      assert.throws(() => engine.run(draft => {
        leaked = draft;
        draft.x = 1;
        draft.self = draft;
      }), CircularReferenceError);
      assert.equal(engine.getState(), before);
      assert.equal(engine.getVersion(), version);
      assert.equal(engine.hasActiveTransaction(), false);
      assert.throws(() => leaked.x, DraftRevokedError);
      assert.equal(engine.run(draft => { draft.x = 2; }).state.x, 2);
    });

    test('descriptor reads cannot leak raw nodes; prototype/symbol changes reject', () => {
      const engine = createEngine({ child: { x: 0 }, values: [1, 2] });
      let held;
      engine.run(draft => {
        held = Object.getOwnPropertyDescriptor(draft, 'child').value;
        assert.equal(held, draft.child);
        held.x = 1;
        assert.equal(Object.getOwnPropertyDescriptor(draft.values, 'length').value, 2);
        assert.throws(() => Object.setPrototypeOf(draft, {}), UnsupportedTypeError);
        assert.throws(() => Object.defineProperty(draft, 'hidden', { value: 1 }), UnsupportedTypeError);
        assert.throws(() => { draft[Symbol('hidden')] = 1; }, UnsupportedTypeError);
      });
      assert.throws(() => held.x, DraftRevokedError);
      assert.equal(engine.getState().child.x, 1);
    });

    test('a current committed reference creates an alias rather than a fresh copy', () => {
      const engine = createEngine({ a: { count: 0 }, b: null });
      const snapshot = engine.getState();
      const id = engine.getObjectId(snapshot.a);
      engine.run(draft => {
        draft.b = snapshot.a;
        assert.equal(draft.b, draft.a);
        draft.b.count = 1;
      });
      assert.equal(engine.getState().a, engine.getState().b);
      assert.equal(engine.getObjectId(engine.getState().b), id);
      assert.equal(snapshot.a.count, 0);
    });

    test('same-shaped distinct items still reorder; splice(start) removes the suffix', () => {
      const engine = createEngine({ items: [{ x: 1 }, { x: 1 }, { x: 1 }] });
      const initial = engine.getState();
      const ids = initial.items.map(item => engine.getObjectId(item));
      const reversed = engine.run(draft => { draft.items.reverse(); });
      assert.equal(reversed.isNoop, false);
      assert.deepEqual(reversed.state.items.map(item => engine.getObjectId(item)), [...ids].reverse());
      engine.run(draft => {
        const removed = draft.items.splice(1);
        assert.equal(removed.length, 2);
        removed[0].x = 5;
        draft.items.push(removed[0]);
      });
      assert.equal(engine.getState().items.length, 2);
      assert.equal(engine.getObjectId(engine.getState().items[1]), ids[1]);
      assert.equal(engine.getState().items[1].x, 5);
    });

    test('key order, null prototypes, and a literal __proto__ property survive commits', () => {
      const extra = Object.assign(Object.create(null), { a: 1, b: 2 });
      const engine = createEngine({ extra });
      const result = engine.run(draft => {
        delete draft.extra.a;
        draft.extra.a = 1;
        draft.extra.__proto__ = { value: 7 };
      });
      assert.equal(Object.getPrototypeOf(result.state.extra), null);
      assert.deepEqual(Object.keys(result.state.extra), ['b', 'a', '__proto__']);
      assert.equal(result.state.extra.__proto__.value, 7);
      assert.ok(result.affectedProperties.some(value => value.kind === 'keys'));
    });

    test('unsupported initial values reject before getters execute or data disappears', () => {
      let reads = 0;
      const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { reads++; return 1; } });
      const array = [];
      array.extra = () => {};
      for (const state of [{ value: 1n }, { [Symbol('x')]: 1 }, accessor, { array }]) {
        assert.throws(() => createEngine(state), UnsupportedTypeError);
      }
      assert.equal(reads, 0);
    });

    test('deleting own properties reveals inherited methods with native semantics', () => {
      const engine = createEngine({ extra: { toString: 'own value' } });
      const model = createNativeModel(engine);
      const before = model.observe();
      const result = engine.run(draft => {
        delete draft.extra.toString;
        delete model.state.extra.toString;
        assert.equal('toString' in draft.extra, true);
        assert.equal(draft.extra.toString, Object.prototype.toString);
        draft.extra.constructor = undefined;
        model.state.extra.constructor = undefined;
      });
      assert.deepEqual(sortInvalidations(result.affectedProperties), expectedInvalidations(before, model.observe()));
    });
  });
}

const SEEDS = [1, 2, 7, 42, 1234, 4096, 65535, 0x12345678, 0x9e3779b9, 0xabcdef01, 0xfffffffe, 0xffffffff];
const STEPS = 160;

describe('A.2 production seeded state/identity/invalidation comparison', () => {
  for (const seed of SEEDS) {
    test(`seed=${seed}: ${STEPS} transitions across production COW/native oracle`, () => {
      const random = createRandom(seed);
      const engines = Object.entries(factories).map(([name, factory]) => [name, factory(initialComparisonState())]);
      for (let step = 0; step < STEPS; step++) {
        const program = createProgram(random, step);
        const mode = step % 10;
        const failureAt = random(program.length);
        const injected = new Error('injected action failure');
        for (const [name, engine] of engines) {
          try {
            const before = engine.getState();
            const version = engine.getVersion();
            const model = createNativeModel(engine);
            const snapshot = createNativeModel(engine).state;
            const observations = model.observe();
            let leaked;
            let result;
            const action = draft => {
              leaked = draft.user.profile;
              for (let i = 0; i < program.length; i++) {
                applyOperation(draft, program[i]);
                applyOperation(model.state, program[i]);
                assertGraphMatches(draft, model.state);
                assert.equal(engine.getState(), before);
                assertGraphMatches(before, snapshot);
                if (mode === 0 && i === failureAt) throw injected;
                if (mode === 3 && i === failureAt) draft.extra.invalid = () => {};
              }
              if (mode === 2) return { then() {} };
              if (mode === 4) draft.extra.cycle = draft;
            };
            if (mode === 1) {
              const tx = engine.begin();
              action(tx.draft);
              tx.abort();
            } else if (mode <= 4) {
              assert.throws(() => engine.run(action), error => mode === 0 ? error === injected
                : mode === 4 ? CircularReferenceError(error) : UnsupportedTypeError(error));
            } else {
              result = engine.run(action);
              assertGraphMatches(result.state, model.state, engine, model.id);
              const expected = expectedInvalidations(observations, model.observe());
              assert.deepEqual(sortInvalidations(result.affectedProperties), expected);
              assert.equal(result.isNoop, expected.length === 0);
              assert.equal(result.version, version + 1);
              assert.equal(new Set(sortInvalidations(result.affectedProperties)).size, result.affectedProperties.length);
            }
            if (mode <= 4) {
              assert.equal(engine.getState(), before);
              assert.equal(engine.getVersion(), version);
              const noop = engine.run(() => {});
              assert.equal(noop.isNoop, true);
              assert.deepEqual(noop.changes, []);
              assert.deepEqual(noop.affectedProperties, []);
            }
            assertGraphMatches(before, snapshot);
            assert.equal(engine.hasActiveTransaction(), false);
            assert.throws(() => leaked.age, DraftRevokedError);
          } catch (error) {
            error.message += `\nengine=${name} seed=${seed} step=${step} mode=${mode} failureAt=${failureAt}\nprogram=${JSON.stringify(program)}`;
            throw error;
          }
        }
      }
    });
  }
});
