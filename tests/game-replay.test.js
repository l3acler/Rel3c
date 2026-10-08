import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplay, readRecording } from '../src/index.js';
import { createGame, schema, simulation, initialState, TICK_DURATION, MATCH_TICKS } from '../examples/game-replay/game.js';

function advance(game, count) {
  game.resumeTicks();
  for (let index = 0; index < count; index++) game.advanceTicks(TICK_DURATION);
  game.pauseTicks();
}
test('game replay restores four players, seeded coins, scores, dashes and messages at every root', () => {
  const game = createGame(); let replay;
  try {
    game.startRecording({ mode: 'session', maxActions: 600, maxBytes: 8_000_000, keyframeInterval: 20 });
    game.enqueueAt(1, 'direction', { id: 1, dx: 1, dy: -1 });
    game.enqueueAt(3, 'dash', 1); game.enqueueAt(4, 'emote', 1);
    game.enqueueAt(8, 'direction', { id: 1, dx: 0, dy: 1 });
    game.enqueueAt(12, 'direction', { id: 1, dx: 0, dy: 0 });
    advance(game, 60); game.stopRecording();
    const log = readRecording(game.exportRecording());
    assert.equal(log.records.length, 60);
    assert.equal(log.records[0].root.kind, 'tick');
    assert.deepEqual(log.records.flatMap(record => record.events
      .filter(event => event.type === 'input' && event.phase === 'dispatched')
      .map(event => event.input.packet.name)), ['direction', 'dash', 'emote', 'direction', 'direction']);
    assert.equal(game.state.commands, 5);
    assert.ok(game.state.players.every((player, index) => player.x !== initialState().players[index].x || player.y !== initialState().players[index].y));
    assert.ok(game.state.players.slice(1).some(player => player.score > 0));
    assert.ok(game.state.events.length <= 6);
    replay = createReplay({ recording: game.exportRecording(), schema, simulation });
    for (let index = 0; index < log.records.length; index++) {
      const status = replay.step(); assert.equal(status.divergence, null);
      assert.equal(replay.app.controls.clock.tick, index + 1);
    }
    assert.equal(replay.status.status, 'complete');
    assert.equal(replay.app.snapshot(), game.snapshot());
  } finally { replay?.dispose(); game.dispose(); }
});
test('game commands queued for different players run in admission order before the assigned tick', () => {
  const game = createGame();
  try {
    game.enqueueAt(2, 'nudge', { id: 1, dx: 1, dy: 0 });
    game.enqueueAt(2, 'nudge', { id: 2, dx: -1, dy: 0 });
    game.enqueueAt(2, 'emote', 3);
    advance(game, 1); assert.equal(game.state.commands, 0);
    advance(game, 1); assert.equal(game.state.commands, 3);
    assert.equal(game.state.players[0].x, 22);
    assert.ok(game.state.events.some(event => event.text === 'Kai: Hello!'));
  } finally { game.dispose(); }
});
test('game domain validation and movement bounds protect committed state', () => {
  const game = createGame();
  try {
    const version = game.stateVersion;
    for (const value of [{ id: 9, dx: 1, dy: 0 }, { id: 1, dx: 2, dy: 0 }, { id: 1, dx: 0, dy: NaN }])
      assert.throws(() => game.actions.direction(value));
    assert.throws(() => game.actions.emote('1'));
    assert.equal(game.stateVersion, version);
    game.enqueue('direction', { id: 1, dx: -1, dy: 0 }); advance(game, 40);
    assert.equal(game.state.players[0].x, 4);
    game.enqueue('direction', { id: 1, dx: 0, dy: 0 }); advance(game, 1);
    const position = game.state.players[0].x; advance(game, 5);
    assert.equal(game.state.players[0].x, position);
    assert.throws(() => { game.state.players[0].x = 99; }, TypeError);
  } finally { game.dispose(); }
});
test('a finished match freezes gameplay and stepped replay matches an uninterrupted replay', () => {
  const game = createGame(); let slow, fast;
  try {
    game.startRecording({ mode: 'session', maxActions: 600, maxBytes: 8_000_000 });
    advance(game, MATCH_TICKS); assert.equal(game.state.finished, true);
    const world = JSON.stringify(game.state); game.actions.nudge({ id: 1, dx: 1, dy: 0 });
    assert.equal(JSON.stringify(game.state), world);
    game.stopRecording(); const recording = game.exportRecording();
    slow = createReplay({ recording, schema, simulation }); fast = createReplay({ recording, schema, simulation });
    while (slow.status.status !== 'complete') slow.step(3);
    fast.run(); assert.equal(slow.app.snapshot(), fast.app.snapshot());
    assert.equal(fast.app.snapshot(), game.snapshot());
  } finally { slow?.dispose(); fast?.dispose(); game.dispose(); }
});
