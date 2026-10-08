import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodoMVC, isBoard } from '../examples/todomvc/app.js';

function withApp(run) {
  const app = createTodoMVC();
  try { run(app); } finally { app.dispose(); }
}

test('TodoMVC adds trimmed titles, ignores whitespace and allocates unique IDs', () => withApp(app => {
  app.actions.add('  Write documentation  '); app.actions.add('  '); app.actions.add('Ship');
  assert.deepEqual(app.state.board, { nextId: 3, todos: [
    { id: 1, title: 'Write documentation', completed: false },
    { id: 2, title: 'Ship', completed: false },
  ] });
  assert.equal(app.state.newTitle, '');
}));
test('TodoMVC toggles individuals, applies bulk completion and clears completed', () => withApp(app => {
  app.actions.add('A'); app.actions.add('B'); app.actions.toggle(1);
  assert.equal(app.state.board.todos[1].completed, false);
  app.actions.toggleAll(true); assert.ok(app.state.board.todos.every(todo => todo.completed));
  app.actions.toggleAll(false); assert.ok(app.state.board.todos.every(todo => !todo.completed));
  app.actions.toggle(2); app.actions.clearCompleted();
  assert.deepEqual(app.state.board.todos.map(todo => todo.id), [1]);
  app.actions.add('C'); assert.equal(app.state.board.todos[1].id, 3);
}));
test('TodoMVC edit commits once and trims its title', () => withApp(app => {
  app.actions.add('Before'); app.actions.beginEdit(1);
  app.actions.typeEdit({ id: 1, title: '  After  ' });
  app.actions.commitEdit({ id: 1, title: app.state.editTitle });
  app.actions.commitEdit({ id: 1, title: 'Duplicate blur' });
  assert.equal(app.state.board.todos[0].title, 'After');
  assert.equal(app.state.editingId, null);
}));
test('TodoMVC Escape discards edits and a later blur cannot save them', () => withApp(app => {
  app.actions.add('Original'); app.actions.beginEdit(1);
  app.actions.typeEdit({ id: 1, title: 'Discard' }); app.actions.cancelEdit(1);
  app.actions.commitEdit({ id: 1, title: 'Discard' });
  assert.equal(app.state.board.todos[0].title, 'Original');
}));
test('TodoMVC empty edit deletes the item', () => withApp(app => {
  app.actions.add('Delete me'); app.actions.beginEdit(1);
  app.actions.commitEdit({ id: 1, title: '   ' });
  assert.equal(app.state.board.todos.length, 0);
  assert.equal(app.state.editingId, null);
}));
test('TodoMVC removing an edited item clears its transient session', () => withApp(app => {
  app.actions.add('A'); app.actions.beginEdit(1); app.actions.remove(1);
  assert.equal(app.state.editingId, null); assert.equal(app.state.editTitle, '');
  app.actions.add('B'); app.actions.beginEdit(2); app.actions.toggle(2); app.actions.clearCompleted();
  assert.equal(app.state.editingId, null);
}));
test('TodoMVC invalid payloads publish no state and committed todos are read-only', () => withApp(app => {
  app.actions.add('Safe'); const version = app.stateVersion;
  assert.throws(() => app.actions.toggle('1'));
  assert.throws(() => app.actions.commitEdit({ id: 1, title: null }));
  assert.equal(app.stateVersion, version);
  assert.throws(() => { app.state.board.todos[0].title = 'Mutation'; }, TypeError);
}));
test('TodoMVC persistence guard rejects malformed items, duplicate IDs and ID reuse', () => {
  assert.equal(isBoard({ nextId: 2, todos: [{ id: 1, title: 'A', completed: false }] }), true);
  for (const board of [null, { nextId: 0, todos: [] }, { nextId: 1, todos: Array(1) },
    { nextId: 1, todos: [{ id: 1, title: 'A', completed: false }] },
    { nextId: 3, todos: [{ id: 1, title: 'A', completed: false }, { id: 1, title: 'B', completed: true }] },
    { nextId: 2, todos: [{ id: 1, title: ' ', completed: false }] },
    { nextId: 2, todos: [{ id: 1, title: 'A', completed: 'false' }] },
  ]) assert.equal(isBoard(board), false);
});
