import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto'; // Independent test oracle, never a runtime dependency.
import { createApp, createActionSchema, hashSnapshot } from '../src/index.js';
import { sha256 } from '../src/runtime/serialization/sha256.js';
import { MAX_CHECKPOINT_BYTES } from '../src/runtime/serialization/checkpoint.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const baseline = () => { const app = createApp(); const text = app.snapshot(); app.dispose(); return text; };
const mutate = run => { const value = JSON.parse(baseline()); run(value); return JSON.stringify(value); };

test('C.1 canonical empty checkpoint is a versioned golden fixture', () => {
  const golden = '{"format":"mini-framework-checkpoint","version":1,"runtimeVersion":"mini-framework-runtime/1","schemaVersion":"app/1","stateVersion":1,"controls":{"clock":{"mode":"manual","time":0,"tick":0,"tickDuration":null},"random":{"algorithm":"xorshift32-13-17-5/1","seed":1,"state":1,"draws":0}},"state":{"format":"mini-framework-state-graph","version":1,"root":["ref",0],"nodes":[{"kind":"object","prototype":"plain","entries":[]}]}}';
  assert.equal(baseline(), golden);
  assert.equal(hashSnapshot(golden), createHash('sha256').update(golden).digest('hex'));
});

test('C.1 restored state preserves aliases, distinct equal nodes, holes, prototypes and property order', () => {
  const nullNode = Object.assign(Object.create(null), { name: 'مرحبا 🎉', zero: -0, absent: undefined });
  const rows = new Array(5); rows[2] = nullNode; rows.custom = nullNode;
  const root = { z: nullNode, a: nullNode, rows, distinct: { name: 'مرحبا 🎉', zero: -0, absent: undefined } };
  Object.defineProperty(root, '__proto__', { value: { safe: true }, enumerable: true });
  const app = createApp({ initialState: root, controls: { seed: 0, time: 42 } });
  const restored = createApp({ snapshot: app.snapshot() });
  assert.deepEqual(Reflect.ownKeys(restored.state), Reflect.ownKeys(root));
  assert.equal(restored.state.z, restored.state.a); assert.equal(restored.state.a, restored.state.rows[2]);
  assert.equal(restored.state.rows.custom, restored.state.z); assert.notEqual(restored.state.distinct, restored.state.z);
  assert.notEqual(restored.state.z, root.z); assert.equal(Object.getPrototypeOf(restored.state.z), null);
  assert.equal(restored.state.rows.length, 5); assert.ok(!(0 in restored.state.rows) && !(4 in restored.state.rows));
  assert.ok(Object.is(restored.state.z.zero, -0) && Object.hasOwn(restored.state.z, 'absent'));
  assert.equal(restored.state.__proto__.safe, true); assert.equal(Object.getPrototypeOf(restored.state), Object.prototype);
  assert.ok(Object.isFrozen(restored.state.rows)); assert.equal(restored.snapshot(), app.snapshot());
  assert.deepEqual(restored.controls, app.controls); app.dispose(); restored.dispose();
});

test('C.1 array state roots restore and app/store versions continue exactly', () => {
  const schema = createActionSchema({ version: 'array/1' })(({ action }) => ({ add: action(draft => { draft.push(undefined); }) }));
  const app = createApp({ initialState: [], schema }); app.actions.add(); app.actions.add();
  const restored = createApp({ schema, snapshot: app.snapshot() });
  assert.equal(restored.stateVersion, 3); restored.actions.add(); app.actions.add();
  assert.equal(restored.snapshot(), app.snapshot()); assert.equal(restored.stateVersion, 4); app.dispose(); restored.dispose();
});

test('C.1 hashes distinguish key order, alias topology, numeric meaning, versions and controls', () => {
  const checkpoints = [];
  for (const initialState of [{a:1,b:2},{b:2,a:1},{n:0},{n:-0},{n:undefined},{}]) {
    const app = createApp({ initialState }); checkpoints.push(app.snapshot()); app.dispose();
  }
  const shared = {}, alias = createApp({ initialState: { a: shared, b: shared } }), distinct = createApp({ initialState: { a: {}, b: {} } });
  checkpoints.push(alias.snapshot(), distinct.snapshot()); alias.dispose(); distinct.dispose();
  checkpoints.push(mutate(value => { value.stateVersion = 2; }), mutate(value => { value.controls.clock.time = 1; }),
    mutate(value => { value.schemaVersion = 'another/1'; }), mutate(value => { value.controls.random.draws = 1; value.controls.random.state = 270369; }));
  assert.equal(new Set(checkpoints.map(hashSnapshot)).size, checkpoints.length);
});

test('C.1 input conflicts/schema mismatch fail before views or targets are claimed', () => {
  let views = 0; const browser = fakeBrowser(), text = baseline();
  for (const options of [{initialState:{}},{controls:{} }])
    assert.throws(() => createApp({ snapshot: text, target: browser.target, view: () => { views++; return ''; }, ...options }), code('SNAPSHOT_CONFLICT'));
  const schema = createActionSchema({ version: 'wrong' })(() => ({}));
  assert.throws(() => createApp({ schema, snapshot: text, target: browser.target }), code('SNAPSHOT_INCOMPATIBLE'));
  assert.equal(views, 0); assert.equal(browser.target.childNodes.length, 0);
  const healthy = createApp({ snapshot: text, target: browser.target, view: () => 'healthy' });
  assert.equal(browser.target.textContent, 'healthy'); healthy.dispose();
});

const malformed = [
  ['wrong format', value => { value.format = 'other'; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['wrong checkpoint version', value => { value.version = 2; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['wrong runtime version', value => { value.runtimeVersion = 'mini-framework-runtime/2'; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['missing metadata', value => { delete value.controls; }, 'SNAPSHOT_INVALID'],
  ['extra metadata', value => { value.extra = true; }, 'SNAPSHOT_INVALID'],
  ['empty schema', value => { value.schemaVersion = ''; }, 'SNAPSHOT_INVALID'],
  ['oversize schema', value => { value.schemaVersion = 'a'.repeat(129); }, 'SNAPSHOT_INVALID'],
  ['invalid state version', value => { value.stateVersion = 0; }, 'SNAPSHOT_INVALID'],
  ['unsafe version', value => { value.stateVersion = 2**53; }, 'SNAPSHOT_INVALID'],
  ['fractional version', value => { value.stateVersion = 1.5; }, 'SNAPSHOT_INVALID'],
  ['fixed clock unimplemented', value => { value.controls.clock.mode = 'fixed'; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['tick unimplemented', value => { value.controls.clock.tick = 1; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['tick duration unimplemented', value => { value.controls.clock.tickDuration = 16000; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['negative time', value => { value.controls.clock.time = -1; }, 'SNAPSHOT_INVALID'],
  ['fractional time', value => { value.controls.clock.time = 0.5; }, 'SNAPSHOT_INVALID'],
  ['extra clock', value => { value.controls.clock.extra = 1; }, 'SNAPSHOT_INVALID'],
  ['extra controls', value => { value.controls.extra = 1; }, 'SNAPSHOT_INVALID'],
  ['unknown algorithm', value => { value.controls.random.algorithm = 'other'; }, 'SNAPSHOT_INCOMPATIBLE'],
  ['negative seed', value => { value.controls.random.seed = -1; }, 'SNAPSHOT_INVALID'],
  ['unsafe seed', value => { value.controls.random.seed = 2**32; }, 'SNAPSHOT_INVALID'],
  ['zero word', value => { value.controls.random.state = 0; }, 'SNAPSHOT_INVALID'],
  ['fractional word', value => { value.controls.random.state = 1.5; }, 'SNAPSHOT_INVALID'],
  ['wrong initial word', value => { value.controls.random.state = 2; }, 'SNAPSHOT_INVALID'],
  ['negative draws', value => { value.controls.random.draws = -1; }, 'SNAPSHOT_INVALID'],
  ['unsafe draws', value => { value.controls.random.draws = 2**53; }, 'SNAPSHOT_INVALID'],
  ['graph wrong format', value => { value.state.format = 'mini-framework-persistence-graph'; }, 'SNAPSHOT_INVALID'],
  ['graph wrong version', value => { value.state.version = 2; }, 'SNAPSHOT_INVALID'],
  ['primitive state root', value => { value.state.nodes = []; value.state.root = ['undefined']; }, 'SNAPSHOT_INVALID'],
  ['graph dangling ref', value => { value.state.root = ['ref',1]; }, 'SNAPSHOT_INVALID'],
  ['graph cycle', value => { value.state.nodes[0].entries.push(['self',['ref',0]]); }, 'SNAPSHOT_INVALID'],
  ['graph unused node', value => { value.state.nodes.push({kind:'object',prototype:'plain',entries:[]}); }, 'SNAPSHOT_INVALID'],
  ['graph extra field', value => { value.state.nodes[0].unknown = true; }, 'SNAPSHOT_INVALID'],
  ['sparse slot overflow', value => { value.state.nodes[0] = {kind:'array',length:100001,entries:[]}; }, 'SNAPSHOT_LIMIT'],
];
for (const [name, change, expected] of malformed) test('C.1 import rejects ' + name, () => {
  const text = mutate(change);
  assert.throws(() => createApp({ snapshot: text }), code(expected)); assert.throws(() => hashSnapshot(text), code(expected));
});

test('C.1 canonical validation rejects whitespace, duplicate fields and nested metadata reordering', () => {
  const text = baseline(), object = JSON.parse(text);
  const bad = [text+'\n', JSON.stringify(object,null,2), text.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({...object, controls: {random:object.controls.random,clock:object.controls.clock}}),
    JSON.stringify({...object, controls: {...object.controls, clock: {time:0,mode:'manual',tick:0,tickDuration:null}}}),
    text.replace('"time":0','"time":-0'), text.replace('"tick":0','"tick":-0'),
    text.replace('"draws":0','"draws":-0'), text.replace('"seed":1','"seed":1.0')];
  for (const input of bad) assert.throws(() => hashSnapshot(input), error => error.code.startsWith('SNAPSHOT_'));
  for (const input of [null,{},'', '[', 'null']) assert.throws(() => createApp({ snapshot: input }), code('SNAPSHOT_INVALID'));
});

test('C.1 string/byte and state import budgets reject before application use', () => {
  assert.throws(() => hashSnapshot(' '.repeat(MAX_CHECKPOINT_BYTES+1)), code('SNAPSHOT_LIMIT'));
  const tooMuchText = mutate(value => { value.state.nodes[0].entries.push(['text',['string','x'.repeat(1_000_000)]]); });
  assert.throws(() => hashSnapshot(tooMuchText), code('SNAPSHOT_LIMIT'));
  const nodeOverflow = mutate(value => { value.state.nodes = new Array(10001).fill({kind:'object',prototype:'plain',entries:[]}); });
  assert.throws(() => hashSnapshot(nodeOverflow), code('SNAPSHOT_LIMIT'));
  const excessiveDepth = mutate(value => {
    value.state.nodes = Array.from({length:129},(_,id) => ({kind:'object',prototype:'plain',
      entries: id===128?[]:[['child',['ref',id+1]]]}));
  });
  assert.throws(() => hashSnapshot(excessiveDepth), code('SNAPSHOT_LIMIT'));
});

test('C.1 snapshot reads/export never publish versions, bindings or storage writes', () => {
  const browser = fakeBrowser(), app = createApp({ target: browser.target, initialState: { n:0 },
    persistence: { namespace:'snapshot-test',fields:{n:{location:'local',validate:value=>typeof value==='number'}} } });
  const version = app.stateVersion, state = app.state;
  const one = app.snapshot(), two = app.snapshot(); assert.equal(one,two);
  assert.equal(app.stateVersion,version); assert.equal(app.state,state); assert.equal(app.persistence.pending,false);
  assert.equal(browser.view.localStorage.writes.length,0); app.dispose();
  assert.throws(()=>app.snapshot(),code('APP_DISPOSED')); assert.throws(()=>app.controls,code('APP_DISPOSED'));
});

test('C.1 persistence after restoring is ordinary hydration, explicitly separate from checkpoint restore', () => {
  const browser = fakeBrowser(), schema = createActionSchema()(({action})=>({set:action(draft=>{draft.n=9;})}));
  const persistence = {namespace:'restore-hydration',fields:{n:{location:'local',validate:value=>typeof value==='number'}}};
  const old = createApp({target:browser.target,initialState:{n:0},schema,persistence});
  const snapshot=old.snapshot(); old.actions.set(); old.flushPersistence(); old.dispose();
  const restored=createApp({snapshot,schema,persistence}); assert.equal(restored.state.n,0);
  restored.mount(browser.target); assert.equal(restored.state.n,9); assert.equal(restored.stateVersion,2); restored.dispose();
});

test('C.1 SHA-256 standard vectors, UTF-8 and block padding match Node crypto', () => {
  assert.equal(sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const input of ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'a'.repeat(1_000_000),
    ...[1,55,56,63,64,65,127,128,129].map(length=>'x'.repeat(length)), 'مرحبا 🐈\ud800'])
    assert.equal(sha256(input),createHash('sha256').update(input).digest('hex'));
});

test('C.1 a state within graph budgets can exceed the independent export wire budget', () => {
  const state = Object.create(null);
  for (let i = 0; i < 100000; i++) {
    let number = i, suffix = '';
    for (let digit = 0; digit < 4; digit++) { suffix += String.fromCharCode(number % 32); number = Math.floor(number / 32); }
    state['\0'.repeat(6) + suffix] = Number.MAX_VALUE;
  }
  const app = createApp({ initialState: state });
  const before = app.state;
  assert.throws(() => app.snapshot(), code('SNAPSHOT_LIMIT'));
  assert.equal(app.state, before); assert.equal(app.stateVersion,1); app.dispose();
});
