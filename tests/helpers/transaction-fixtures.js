// Ported Phase 0 fixtures: production error codes/native revocation and successful no-op versions adapted.
/**
 * tests/helpers/transaction-fixtures.js
 *
 * Port of the shared Phase 0 fixture suite for production transactions.
 * Exercises all required contract behaviors:
 * 1. Primitive property updates
 * 2. Nested object mutations
 * 3. Property addition and deletion
 * 4. Array structure, reordering, and item mutations
 * 5. Aliases & state graph reference identity
 * 6. Snapshot isolation & committed state immutability
 * 7. Unsupported types & circular reference rejection
 * 8. No-op data with one-version publication on success
 * 9. Rollback on abort and error
 * 10. Transaction lifetime & leaked draft revocation
 *
 * Original cases exercised COW/staged spikes. This port uses production errors
 * and the accepted successful no-op version policy; spike sources stay unchanged.
 *
 * NOTE: Internal spike code, not exported publicly.
 */

import assert from 'node:assert/strict';
const hasCode = (...codes) => error => codes.includes(error.code);
const TransactionActiveError = hasCode('TRANSACTION_ACTIVE');
const TransactionCompletedError = hasCode('TRANSACTION_COMPLETED');
const DraftRevokedError = error => error instanceof TypeError && /revoked/.test(error.message);
const UnsupportedTypeError = hasCode('STATE_INVALID', 'TRANSACTION_ASYNC');
const CircularReferenceError = hasCode('STATE_CYCLE');


export const FIXTURES = [
  // ==========================================
  // 1. Primitive updates
  // ==========================================
  {
    id: 'primitive_update',
    category: 'primitive',
    name: 'Updates primitive number, string, boolean, and null properties',
    initialState: () => ({ count: 0, title: 'initial', flag: false, nullable: 'not-null' }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.count = 100;
      tx.draft.title = 'updated';
      tx.draft.flag = true;
      tx.draft.nullable = null;
      return tx.commit();
    },
    verify(result, { initial, engine }) {
      assert.equal(result.isNoop, false);
      assert.equal(result.version, 2);
      assert.deepEqual(result.state, {
        count: 100,
        title: 'updated',
        flag: true,
        nullable: null
      });
      assert.deepEqual(engine.getState(), result.state);
      assert.ok(result.affectedPaths.includes('count'));
      assert.ok(result.affectedPaths.includes('title'));
      assert.ok(result.affectedPaths.includes('flag'));
      assert.ok(result.affectedPaths.includes('nullable'));
    }
  },

  // ==========================================
  // 2. Nested object updates
  // ==========================================
  {
    id: 'nested_update',
    category: 'nested',
    name: 'Updates nested object properties without modifying siblings',
    initialState: () => ({
      user: {
        profile: {
          name: 'Alice',
          age: 30
        },
        settings: {
          theme: 'dark'
        }
      }
    }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.user.profile.age = 31;
      return tx.commit();
    },
    verify(result, { initial, engine }) {
      assert.equal(result.isNoop, false);
      assert.equal(result.state.user.profile.age, 31);
      assert.equal(result.state.user.profile.name, 'Alice');
      assert.equal(result.state.user.settings.theme, 'dark');
      assert.ok(result.affectedPaths.includes('user.profile.age'));
      // Settings sibling was not changed
      assert.equal(result.state.user.settings.theme, initial.user.settings.theme);
    }
  },

  // ==========================================
  // 3. Property addition and deletion
  // ==========================================
  {
    id: 'property_addition_deletion',
    category: 'addition_deletion',
    name: 'Adds new properties and deletes existing properties with delete operator',
    initialState: () => ({
      keep: 'stays',
      removeMe: 'to be deleted',
      nested: {
        existing: 1,
        deleteChild: 2
      }
    }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.addedRoot = 'new root value';
      delete tx.draft.removeMe;
      tx.draft.nested.addedChild = 'new child value';
      delete tx.draft.nested.deleteChild;
      return tx.commit();
    },
    verify(result, { initial, engine }) {
      assert.equal(result.isNoop, false);
      assert.equal(result.state.keep, 'stays');
      assert.equal(result.state.addedRoot, 'new root value');
      assert.equal(result.state.nested.addedChild, 'new child value');
      assert.equal(Object.prototype.hasOwnProperty.call(result.state, 'removeMe'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(result.state.nested, 'deleteChild'), false);
      assert.ok(result.affectedPaths.includes('addedRoot'));
      assert.ok(result.affectedPaths.includes('removeMe'));
      assert.ok(result.affectedPaths.includes('nested.addedChild'));
      assert.ok(result.affectedPaths.includes('nested.deleteChild'));
    }
  },

  {
    id: 'property_undefined_vs_delete',
    category: 'addition_deletion',
    name: 'Distinguishes setting property to undefined from deleting property',
    initialState: () => ({ a: 1, b: 2 }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.a = undefined;
      delete tx.draft.b;
      return tx.commit();
    },
    verify(result) {
      assert.equal(Object.prototype.hasOwnProperty.call(result.state, 'a'), true);
      assert.equal(result.state.a, undefined);
      assert.equal(Object.prototype.hasOwnProperty.call(result.state, 'b'), false);
    }
  },

  // ==========================================
  // 4. Array operations
  // ==========================================
  {
    id: 'array_push_pop_shift_unshift',
    category: 'arrays',
    name: 'Performs array push, pop, shift, and unshift mutations',
    initialState: () => ({ items: [1, 2, 3] }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.items.push(4, 5);
      tx.draft.items.shift();
      return tx.commit();
    },
    verify(result) {
      assert.equal(result.isNoop, false);
      assert.deepEqual(result.state.items, [2, 3, 4, 5]);
      assert.ok(result.affectedPaths.includes('items.length') || result.affectedPaths.includes('items'));
    }
  },

  {
    id: 'array_splice_and_index_assignment',
    category: 'arrays',
    name: 'Splices elements and updates elements via index assignment',
    initialState: () => ({ list: ['a', 'b', 'c', 'd'] }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.list[1] = 'B_MODIFIED';
      tx.draft.list.splice(2, 1, 'X', 'Y');
      return tx.commit();
    },
    verify(result) {
      assert.equal(result.isNoop, false);
      assert.deepEqual(result.state.list, ['a', 'B_MODIFIED', 'X', 'Y', 'd']);
    }
  },

  {
    id: 'array_sort_and_reverse',
    category: 'arrays',
    name: 'Sorts and reverses arrays while preserving element contents',
    initialState: () => ({ numbers: [3, 1, 4, 2] }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.numbers.sort((a, b) => a - b);
      tx.draft.numbers.reverse();
      return tx.commit();
    },
    verify(result) {
      assert.deepEqual(result.state.numbers, [4, 3, 2, 1]);
    }
  },

  {
    id: 'array_of_objects_item_mutation',
    category: 'arrays',
    name: 'Updates properties on an item within an array without altering array structure',
    initialState: () => ({
      todos: [
        { id: 1, text: 'First', done: false },
        { id: 2, text: 'Second', done: false }
      ]
    }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.todos[1].done = true;
      return tx.commit();
    },
    verify(result) {
      assert.equal(result.state.todos[0].done, false);
      assert.equal(result.state.todos[1].done, true);
      assert.equal(result.state.todos[1].text, 'Second');
      assert.ok(result.affectedPaths.includes('todos.1.done'));
    }
  },

  // ==========================================
  // 5. Aliases & graph identity
  // ==========================================
  {
    id: 'alias_shared_object_mutation',
    category: 'aliases',
    name: 'Preserves shared object references (aliases) across multiple paths during transaction and commit',
    initialState: () => {
      const sharedNode = { id: 'shared-1', count: 10 };
      return {
        primary: sharedNode,
        secondary: sharedNode,
        meta: { tag: 'alias-test' }
      };
    },
    execute(engine) {
      const tx = engine.begin();

      // Verify read-your-writes through alias before write
      assert.equal(tx.draft.primary.count, 10);
      assert.equal(tx.draft.secondary.count, 10);

      // Mutate via primary alias
      tx.draft.primary.count = 42;

      // Reading via secondary alias MUST see the write immediately!
      assert.equal(
        tx.draft.secondary.count,
        42,
        'Reading through secondary alias in active draft must reflect mutation made via primary alias'
      );

      return tx.commit();
    },
    verify(result, { initial }) {
      assert.equal(result.isNoop, false);
      assert.equal(result.state.primary.count, 42);
      assert.equal(result.state.secondary.count, 42);

      // Critical identity assertion: committed state MUST preserve alias identity!
      assert.equal(
        result.state.primary,
        result.state.secondary,
        'Committed state must preserve reference identity (primary === secondary) for shared aliases'
      );
    }
  },

  {
    id: 'alias_in_array_and_object',
    category: 'aliases',
    name: 'Preserves alias shared between an object property and an array element',
    initialState: () => {
      const activeUser = { id: 101, name: 'Bader' };
      return {
        currentUser: activeUser,
        users: [activeUser, { id: 102, name: 'Dana' }]
      };
    },
    execute(engine) {
      const tx = engine.begin();
      tx.draft.users[0].name = 'Bader Updated';
      assert.equal(tx.draft.currentUser.name, 'Bader Updated');
      return tx.commit();
    },
    verify(result) {
      assert.equal(result.state.currentUser.name, 'Bader Updated');
      assert.equal(result.state.users[0].name, 'Bader Updated');
      assert.equal(
        result.state.currentUser,
        result.state.users[0],
        'currentUser and users[0] must share exact reference identity'
      );
    }
  },

  // ==========================================
  // 6. Snapshot reads & isolation
  // ==========================================
  {
    id: 'snapshot_reads_isolation',
    category: 'snapshot_reads',
    name: 'Committed state remains unchanged during active transaction until commit',
    initialState: () => ({ value: 10 }),
    execute(engine) {
      const tx = engine.begin();
      tx.draft.value = 999;

      // Read committed state from engine during transaction
      const currentCommitted = engine.getState();
      assert.equal(currentCommitted.value, 10, 'Committed state must not reflect uncommitted writes');
      assert.equal(tx.draft.value, 999, 'Draft must reflect uncommitted writes (read-your-writes)');

      return tx.commit();
    },
    verify(result, { engine }) {
      assert.equal(result.state.value, 999);
      assert.equal(engine.getState().value, 999);
    }
  },

  {
    id: 'committed_state_immutability',
    category: 'snapshot_reads',
    name: 'Committed state is frozen and throws on direct mutation attempt outside transaction',
    initialState: () => ({ count: 5, nested: { item: 1 } }),
    execute(engine) {
      const state = engine.getState();
      assert.throws(() => {
        'use strict';
        state.count = 99;
      }, TypeError);

      assert.throws(() => {
        'use strict';
        state.nested.item = 99;
      }, TypeError);

      assert.throws(() => {
        'use strict';
        state.newProp = 'illegal';
      }, TypeError);

      return { state, isNoop: true };
    },
    verify(result, { initial, engine }) {
      assert.equal(engine.getState().count, 5);
      assert.equal(engine.getState().nested.item, 1);
    }
  },

  // ==========================================
  // 7. Unsupported types & circular reference rejection
  // ==========================================
  {
    id: 'reject_functions',
    category: 'unsupported_types',
    name: 'Rejects storing functions in state draft',
    initialState: () => ({ fn: null }),
    execute(engine) {
      const tx = engine.begin();
      assert.throws(() => {
        tx.draft.fn = function() {};
      }, UnsupportedTypeError);
      tx.abort();
    }
  },

  {
    id: 'reject_symbols',
    category: 'unsupported_types',
    name: 'Rejects storing symbols in state draft',
    initialState: () => ({ sym: null }),
    execute(engine) {
      const tx = engine.begin();
      assert.throws(() => {
        tx.draft.sym = Symbol('invalid');
      }, UnsupportedTypeError);
      tx.abort();
    }
  },

  {
    id: 'reject_promises',
    category: 'unsupported_types',
    name: 'Rejects storing promises or thenables in state draft',
    initialState: () => ({ promise: null }),
    execute(engine) {
      const tx = engine.begin();
      assert.throws(() => {
        tx.draft.promise = Promise.resolve(42);
      }, UnsupportedTypeError);
      tx.abort();
    }
  },

  {
    id: 'reject_dom_nodes',
    category: 'unsupported_types',
    name: 'Rejects storing DOM nodes in state draft',
    initialState: () => ({ element: null }),
    execute(engine) {
      const tx = engine.begin();
      assert.throws(() => {
        tx.draft.element = { nodeType: 1, tagName: 'DIV' };
      }, UnsupportedTypeError);
      tx.abort();
    }
  },

  {
    id: 'reject_class_instances',
    category: 'unsupported_types',
    name: 'Rejects storing class instances (e.g. Date) in state draft',
    initialState: () => ({ date: null }),
    execute(engine) {
      const tx = engine.begin();
      assert.throws(() => {
        tx.draft.date = new Date();
      }, UnsupportedTypeError);
      tx.abort();
    }
  },

  {
    id: 'reject_circular_references',
    category: 'unsupported_types',
    name: 'Rejects circular references assigned to draft',
    initialState: () => ({ tree: {} }),
    execute(engine) {
      const tx = engine.begin();
      const cyclicObj = {};
      cyclicObj.self = cyclicObj;

      assert.throws(() => {
        tx.draft.tree = cyclicObj;
      }, CircularReferenceError);
      tx.abort();
    }
  },

  {
    id: 'reject_async_action_runner',
    category: 'unsupported_types',
    name: 'engine.run() rejects Promise-returning action functions',
    initialState: () => ({ count: 0 }),
    execute(engine) {
      assert.throws(() => {
        engine.run(async (draft) => {
          draft.count += 1;
        });
      }, UnsupportedTypeError);
      assert.equal(engine.getState().count, 0, 'Async failure must not modify committed state');
    }
  },

  // ==========================================
  // 8. No-op mutations
  // ==========================================
  {
    id: 'noop_no_writes',
    category: 'no_op',
    name: 'Committing transaction without any mutations publishes one version with unchanged data',
    initialState: () => ({ count: 10 }),
    execute(engine) {
      const initialVersion = engine.getVersion();
      const initialStateRef = engine.getState();
      const tx = engine.begin();
      // Read but do not write
      const readVal = tx.draft.count;
      assert.equal(readVal, 10);
      const res = tx.commit();
      return { res, initialVersion, initialStateRef };
    },
    verify({ res, initialVersion, initialStateRef }, { engine }) {
      assert.equal(res.isNoop, true);
      assert.equal(res.version, initialVersion + 1);
      assert.equal(res.state, initialStateRef, 'State reference must remain identical on no-op');
      assert.equal(engine.getVersion(), initialVersion + 1);
      assert.equal(res.changes.length, 0);
    }
  },

  {
    id: 'noop_setting_same_value',
    category: 'no_op',
    name: 'Setting property to identical value (Object.is) publishes one version with unchanged data',
    initialState: () => ({ count: 10, title: 'hello' }),
    execute(engine) {
      const initialVersion = engine.getVersion();
      const initialStateRef = engine.getState();
      const tx = engine.begin();
      tx.draft.count = 10;
      tx.draft.title = 'hello';
      const res = tx.commit();
      return { res, initialVersion, initialStateRef };
    },
    verify({ res, initialVersion, initialStateRef }) {
      assert.equal(res.isNoop, true);
      assert.equal(res.version, initialVersion + 1);
      assert.equal(res.state, initialStateRef);
    }
  },

  {
    id: 'noop_reverted_mutation',
    category: 'no_op',
    name: 'Reverting mutated property back to its original value within transaction emits no-op',
    initialState: () => ({ count: 5 }),
    execute(engine) {
      const initialVersion = engine.getVersion();
      const initialStateRef = engine.getState();
      const tx = engine.begin();
      tx.draft.count = 999;
      tx.draft.count = 5; // Reverted back
      const res = tx.commit();
      return { res, initialVersion, initialStateRef };
    },
    verify({ res, initialVersion, initialStateRef }) {
      assert.equal(res.isNoop, true);
      assert.equal(res.version, initialVersion + 1);
      assert.equal(res.state, initialStateRef);
    }
  },

  // ==========================================
  // 9. Rollback & throw
  // ==========================================
  {
    id: 'rollback_on_abort',
    category: 'rollback',
    name: 'Explicit tx.abort() leaves committed state and version unchanged',
    initialState: () => ({ count: 1, list: [1, 2] }),
    execute(engine) {
      const initialVersion = engine.getVersion();
      const initialCommitted = engine.getState();
      const tx = engine.begin();
      tx.draft.count = 500;
      tx.draft.list.push(3);
      tx.abort();
      return { initialVersion, initialCommitted };
    },
    verify({ initialVersion, initialCommitted }, { engine }) {
      assert.equal(engine.getVersion(), initialVersion);
      assert.equal(engine.getState(), initialCommitted);
      assert.equal(engine.hasActiveTransaction(), false);
    }
  },

  {
    id: 'rollback_on_throw_in_runner',
    category: 'rollback',
    name: 'Throwing an exception inside engine.run() rolls back mutations atomically',
    initialState: () => ({ balance: 100 }),
    execute(engine) {
      const initialVersion = engine.getVersion();
      const initialCommitted = engine.getState();

      assert.throws(() => {
        engine.run((draft) => {
          draft.balance = 50;
          throw new Error('Transaction execution aborted due to unexpected business error');
        });
      }, /business error/);

      return { initialVersion, initialCommitted };
    },
    verify({ initialVersion, initialCommitted }, { engine }) {
      assert.equal(engine.getVersion(), initialVersion);
      assert.equal(engine.getState(), initialCommitted);
      assert.equal(engine.getState().balance, 100);
      assert.equal(engine.hasActiveTransaction(), false);
    }
  },

  // ==========================================
  // 10. Transaction lifetime & leaked draft
  // ==========================================
  {
    id: 'single_active_transaction_enforcement',
    category: 'lifetime',
    name: 'Enforces only one active transaction at a time per engine',
    initialState: () => ({ x: 1 }),
    execute(engine) {
      const tx1 = engine.begin();
      assert.equal(engine.hasActiveTransaction(), true);

      assert.throws(() => {
        engine.begin();
      }, TransactionActiveError);

      tx1.abort();
      assert.equal(engine.hasActiveTransaction(), false);

      // Can now begin new transaction
      const tx2 = engine.begin();
      tx2.draft.x = 2;
      return tx2.commit();
    },
    verify(result) {
      assert.equal(result.state.x, 2);
    }
  },

  {
    id: 'prevent_double_commit_or_abort',
    category: 'lifetime',
    name: 'Throws TransactionCompletedError on second commit or abort call',
    initialState: () => ({ count: 0 }),
    execute(engine) {
      const tx = engine.begin();
      tx.commit();

      assert.throws(() => {
        tx.commit();
      }, TransactionCompletedError);

      assert.throws(() => {
        tx.abort();
      }, TransactionCompletedError);
    }
  },

  {
    id: 'leaked_draft_revoked_after_commit',
    category: 'lifetime',
    name: 'Revokes draft access after commit to prevent leaked draft mutations or reads',
    initialState: () => ({ user: { name: 'Alice' } }),
    execute(engine) {
      const tx = engine.begin();
      const leakedUser = tx.draft.user;
      tx.draft.user.name = 'Bob';
      tx.commit();

      // Attempting to read from leaked draft after commit must throw
      assert.throws(() => {
        const val = tx.draft.user;
      }, DraftRevokedError);

      // Attempting to write to leaked draft after commit must throw
      assert.throws(() => {
        tx.draft.user = { name: 'Charlie' };
      }, DraftRevokedError);

      // Attempting to mutate nested reference held before commit must throw
      assert.throws(() => {
        leakedUser.name = 'Charlie';
      }, DraftRevokedError);
    }
  },

  {
    id: 'leaked_draft_revoked_after_abort',
    category: 'lifetime',
    name: 'Revokes draft access after abort to prevent leaked draft mutations or reads',
    initialState: () => ({ count: 1 }),
    execute(engine) {
      const tx = engine.begin();
      const leakedDraft = tx.draft;
      tx.abort();

      assert.throws(() => {
        const x = leakedDraft.count;
      }, DraftRevokedError);

      assert.throws(() => {
        leakedDraft.count = 10;
      }, DraftRevokedError);
    }
  }
];
