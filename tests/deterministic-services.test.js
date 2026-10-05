import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div } from '../src/index.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const schema = createActionSchema({ version: 'draws/1' })(({ action }) => ({
  draw: action((draft, services) => { draft.values.push(services.random()); draft.times.push(services.now()); }),
  many: action(value => Number.isSafeInteger(value), (draft, count, services) => {
    for (let i = 0; i < count; i++) draft.values.push(services.random()); draft.times.push(services.now());
  }),
  fail: action((draft, services) => { draft.values.push(services.random()); throw Error('rollback'); }),
}));
const make = options => createApp({ initialState: { values: [], times: [] }, schema, ...options });

test('C.2 known xorshift32 vector and logical time reach no-payload and payload actions', () => {
  const app = make({ controls: { seed: 1, time: 5000 } });
  app.actions.draw(); app.actions.many(4);
  assert.deepEqual(app.state.values.map(value => value * 4294967296), [270369,67634689,2647435461,307599695,2398689233]);
  assert.deepEqual(app.state.times, [5000,5000]); assert.equal(app.controls.random.draws, 5);
  assert.equal(app.controls.random.state, 2398689233); app.dispose();
});

test('C.2 independent BigInt oracle covers zero seed, uint32 boundary and repeated draws', () => {
  for (const seed of [0,1,2,17,0x80000000,0xffffffff]) {
    const app = make({ controls: { seed } }); let word = BigInt(seed || 0x6d2b79f5);
    app.actions.many(64);
    const expected = [];
    for (let i = 0; i < 64; i++) {
      word ^= word << 13n & 0xffffffffn; word ^= word >> 17n; word ^= word << 5n & 0xffffffffn;
      expected.push(Number(word) / 4294967296);
    }
    assert.deepEqual(app.state.values, expected); assert.equal(app.controls.random.seed, seed); app.dispose();
  }
});

test('C.2 throwing action preserves state, version, random continuation and logical clock', () => {
  const app = make({ controls: { seed: 123 } }), control = app.controls;
  assert.throws(app.actions.fail, /rollback/);
  assert.equal(app.stateVersion, 1); assert.deepEqual(app.state.values, []); assert.deepEqual(app.controls, control);
  const reference = make({ controls: { seed: 123 } }); app.actions.draw(); reference.actions.draw();
  assert.equal(app.snapshot(), reference.snapshot()); app.dispose(); reference.dispose();
});

test('C.2 commit graph validation and version overflow also discard draws', () => {
  const invalidSchema = createActionSchema()(({ action }) => ({
    cycle: action((draft, services) => { services.random(); draft.self = draft; }),
    draw: action((draft, services) => { draft.n = services.random(); }),
  }));
  const app = createApp({ initialState: { n: 0 }, schema: invalidSchema }), control = app.controls;
  assert.throws(app.actions.cycle, code('STATE_CYCLE')); assert.deepEqual(app.controls, control);
  const envelope = JSON.parse(app.snapshot()); envelope.stateVersion = Number.MAX_SAFE_INTEGER;
  const restored = createApp({ snapshot: JSON.stringify(envelope), schema: invalidSchema }), before = restored.snapshot();
  assert.throws(restored.actions.draw, code('VERSION_LIMIT')); assert.equal(restored.snapshot(), before);
  app.dispose(); restored.dispose();
});

test('C.2 Promise/thenable actions revoke leaked service closures and publish no draws', async () => {
  let leaked;
  const bad = createActionSchema()(({ action }) => ({
    async: action((draft, services) => { leaked = services; services.random(); return Promise.resolve().then(() => services.random()); }),
    thenable: action((draft, services) => { services.random(); return { then() { throw Error('never execute'); } }; }),
  }));
  const app = createApp({ schema: bad });
  assert.throws(app.actions.async, code('ACTION_ASYNC')); await new Promise(resolve => setTimeout(resolve, 0));
  assert.throws(() => leaked.random(), code('CONTROL_EXPIRED')); assert.throws(() => leaked.now(), code('CONTROL_EXPIRED'));
  assert.throws(app.actions.thenable, code('ACTION_ASYNC')); assert.equal(app.controls.random.draws, 0); app.dispose();
});

test('C.2 FIFO children see parent committed draws; failed parent discards queued descendants', () => {
  let leaked, app;
  const order = [];
  const family = createActionSchema()(({ action }) => ({
    root: action((draft, services) => { leaked = services; draft.values.push(services.random()); app.actions.child(); app.actions.sibling(); }),
    child: action((draft, services) => {
      order.push('child'); assert.throws(() => leaked.random(), code('CONTROL_EXPIRED'));
      draft.values.push(services.random()); app.actions.grandchild();
    }),
    sibling: action((draft, services) => { order.push('sibling'); draft.values.push(services.random()); }),
    grandchild: action((draft, services) => { order.push('grandchild'); draft.values.push(services.random()); }),
    fail: action((draft, services) => { services.random(); app.actions.child(); throw Error('discard'); }),
  }));
  app = createApp({ initialState: { values: [] }, schema: family });
  app.actions.root(); assert.deepEqual(order, ['child','sibling','grandchild']); assert.equal(app.controls.random.draws, 4);
  const before = app.snapshot(); assert.throws(app.actions.fail, /discard/); assert.equal(app.snapshot(), before); app.dispose();
});

test('C.2 failed child discards its draws while committed siblings continue the stream', () => {
  let app;
  const family = createActionSchema()(({ action }) => ({
    root: action(() => { app.actions.fail(); app.actions.draw(); }),
    fail: action((draft, services) => { services.random(); throw Error('child'); }),
    draw: action((draft, services) => { draft.n = services.random(); }),
  }));
  app = createApp({ initialState: { n: 0 }, schema: family });
  assert.throws(app.actions.root, /child/); assert.equal(app.stateVersion, 3);
  assert.equal(app.state.n * 4294967296, 270369); assert.equal(app.controls.random.draws, 1); app.dispose();
});

test('C.2 post-commit notification failure retains both state and service advancement', () => {
  const app = make(); app.observe(state => state.values.length, () => { throw Error('observer'); });
  assert.throws(app.actions.draw, /observer/); assert.equal(app.state.values.length, 1);
  assert.equal(app.controls.random.draws, 1); assert.equal(app.controls.random.state, 270369); app.dispose();
});

test('C.2 manual time is monotone, frozen, nonreactive and independent from state versions', () => {
  const app = make(), version = app.stateVersion, snapshot = app.controls;
  let invalidations = 0; const observer = app.observe(() => app.controls.clock.time, () => { invalidations++; });
  app.setLogicalTime(10000); app.setLogicalTime(10000);
  assert.equal(app.controls.clock.time, 10000); assert.equal(snapshot.clock.time, 0);
  assert.equal(app.stateVersion, version); assert.equal(invalidations, 0);
  for (const value of [-1,-0,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,9999,null])
    assert.throws(() => app.setLogicalTime(value), code('CONTROL_INVALID'));
  assert.throws(() => { app.controls.clock.time = 3; }, TypeError);
  assert.throws(() => { app.controls.random.draws = 9; }, TypeError);
  assert.ok(Object.isFrozen(app.controls) && Object.isFrozen(app.controls.random));
  app.actions.draw(); assert.deepEqual(app.state.times, [10000]); observer.dispose(); app.dispose();
  assert.throws(() => app.setLogicalTime(10000), code('APP_DISPOSED'));
});

test('C.2 control and snapshot boundaries reject during actions, guards and reactive work', () => {
  let app;
  const guarded = createActionSchema()(({ action }) => ({
    action: action((draft, services) => { services.random(); app.setLogicalTime(1); }),
    snapshot: action(() => app.snapshot()),
    guard: action(value => { app.setLogicalTime(1); return true; }, () => {}),
  }));
  app = createApp({ schema: guarded });
  assert.throws(app.actions.action, code('CONTROL_REENTRANT'));
  assert.throws(app.actions.snapshot, code('SNAPSHOT_REENTRANT'));
  assert.throws(() => app.actions.guard('x'), error => code('PAYLOAD_INVALID')(error) && error.cause.code === 'CONTROL_REENTRANT');
  assert.throws(() => app.observe(() => app.setLogicalTime(1)), code('CONTROL_REENTRANT'));
  assert.throws(() => app.computed(() => app.snapshot()).value, code('SNAPSHOT_REENTRANT'));
  assert.equal(app.controls.random.draws, 0); assert.equal(app.controls.clock.time, 0); app.dispose();
});

test('C.2 clocks remain scoped and cannot advance from mounting or error hooks', () => {
  const browser = fakeBrowser();
  const mounting = createApp({ view: () => { mounting.setLogicalTime(1); return div(); } });
  assert.throws(() => mounting.mount(browser.target), code('CONTROL_REENTRANT')); mounting.dispose();
  const errorHook = createApp({ onError: () => errorHook.setLogicalTime(1) });
  assert.throws(() => errorHook.dispatch('missing'), error => error instanceof AggregateError && error.errors[1].code === 'CONTROL_REENTRANT');
  assert.equal(errorHook.controls.clock.time, 0); errorHook.dispose();
});

test('C.2 malformed configuration rejects without ordinary accessor execution', () => {
  for (const controls of [null,[],{seed:null},{seed:-0},{seed:-1},{seed:2**32},{seed:0.5},{seed:'1'},
    {time:null},{time:-1},{time:0.5},{unknown:1}]) assert.throws(() => make({ controls }), code('CONTROL_INVALID'));
  let reads = 0;
  assert.throws(() => make({ controls: { get seed() { reads++; return 1; } } }), code('CONTROL_INVALID'));
  assert.equal(reads, 0); const app = make({ controls: { seed: 0, time: Number.MAX_SAFE_INTEGER } });
  app.actions.draw(); assert.equal(app.state.times[0], Number.MAX_SAFE_INTEGER); app.dispose();
});

test('C.2 draw-count overflow rejects without state or control publication', () => {
  const app = make(); app.actions.draw(); const envelope = JSON.parse(app.snapshot());
  envelope.controls.random.draws = Number.MAX_SAFE_INTEGER;
  const restored = createApp({ snapshot: JSON.stringify(envelope), schema }), before = restored.snapshot();
  assert.throws(restored.actions.draw, code('CONTROL_LIMIT')); assert.equal(restored.snapshot(), before); restored.dispose(); app.dispose();
});

test('C.1/C.2 identical inputs and restored continuation match across independent applications', () => {
  for (const seed of [0,1,23,0xffffffff]) {
    const app = make({ controls: { seed } }), reference = make({ controls: { seed } });
    for (let i = 1; i <= 10; i++) {
      for (const target of [app,reference]) { target.setLogicalTime(i*1234); target.actions.many(i%3); }
    }
    assert.equal(app.snapshot(), reference.snapshot());
    const restored = createApp({ schema, snapshot: app.snapshot() });
    for (let i = 11; i <= 40; i++) {
      for (const target of [app,reference,restored]) {
        target.setLogicalTime(i*1234);
        if (i%4 === 0) assert.throws(target.actions.fail, /rollback/);
        else target.actions.many(i%5);
      }
      assert.equal(app.snapshot(), restored.snapshot()); assert.equal(app.snapshot(), reference.snapshot());
    }
    app.dispose(); reference.dispose(); restored.dispose();
  }
});

test('C.2 a payload guard cannot consume the captured parent stream during admission', () => {
  let app, captured;
  const schema = createActionSchema()(({action}) => ({
    root: action((draft, services) => {
      captured = services;
      assert.throws(() => app.actions.child('x'), error => error.code === 'PAYLOAD_INVALID' && error.cause.code === 'CONTROL_REENTRANT');
      draft.value = services.random();
    }),
    child: action(value => { captured.random(); return true; }, () => {}),
  }));
  app = createApp({ initialState: { value:0 }, schema }); app.actions.root();
  assert.equal(app.controls.random.draws,1); assert.equal(app.state.value*4294967296,270369); app.dispose();
});

test('C.2 service-only successful actions publish versions without dirtying unrelated bindings', () => {
  const browser = fakeBrowser(); let reads=0, captured;
  const schema = createActionSchema()(({action}) => ({
    draw: action((draft, services) => {
      captured=services; assert.ok(Object.isFrozen(services));
      assert.throws(() => { services.random = () => 0; },TypeError); services.random();
    }),
  }));
  const app = createApp({target:browser.target,initialState:{n:1},schema,
    view:({derive})=>derive(state=>{reads++;return state.n;})});
  const state=app.state; app.actions.draw();
  assert.equal(app.state,state); assert.equal(app.stateVersion,2); assert.equal(app.controls.random.draws,1);
  assert.equal(reads,1); assert.equal(browser.document.pendingFrames,0);
  assert.throws(()=>captured.random(),code('CONTROL_EXPIRED'));app.dispose();
});

test('C.2 failed post-commit History operations preserve draws and admit healthy FIFO children', () => {
  const browser=fakeBrowser(); let app;
  const schema=createActionSchema()(({action})=>({
    root:action((draft,services)=>{draft.values.push(services.random());app.navigate('/other');app.actions.child();}),
    child:action((draft,services)=>{draft.values.push(services.random());}),
  }));
  app=createApp({target:browser.target,initialState:{values:[]},schema,router:{base:'/app',routes:[]}});
  browser.view.history.pushState=()=>{throw Error('history unavailable');};
  assert.throws(app.actions.root,code('ROUTE_HISTORY_FAILED'));
  assert.deepEqual(app.state.values.map(value=>value*4294967296),[270369,67634689]);
  assert.equal(app.controls.random.draws,2);assert.equal(app.stateVersion,3);app.dispose();
});
