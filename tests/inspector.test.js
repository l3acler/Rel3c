import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, createDiagnostics, createInspector, createHistory, createReplay, hashSnapshot, div, p, input, keyed } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { preview } from '../src/runtime/inspector/instrumentation.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const ofType = (entry, type) => entry.events.filter(e => e.type === type).map(e => e.detail);
function fixture(extra = {}) {
  let app;
  const schema = createActionSchema()(({action}) => ({
    inc: action((s, services) => { s.n++; s.draw = services.random(); }),
    rename: action(v => typeof v === 'string', (s,v) => { s.name = v; }),
    noop: action(() => {}),
    parent: action(s => { s.n++; app.actions.inc(); }),
    bad: action(s => { s.n = 999; app.actions.inc(); throw Error('rollback'); }),
    reverse: action(s => { s.rows.reverse(); }),
  }));
  app = createApp({ schema, initialState: {n:0,name:'Ada',draw:0,rows:[{id:1},{id:2}]}, controls:{seed:7},
    view:({bind}) => div(p({id:'n'},bind.n), p({id:'name'},bind.name), keyed(bind.rows,x=>x.id,({item})=>input({value:item.id}))), ...extra });
  return {app,schema};
}

test('D.3 off mode retains no diagnostic data; one optional session owns bounded storage', () => {
  const {app} = fixture(); app.actions.inc();
  assert.equal(resourceCounts(app).diagnosticEntries,0);
  const d = createDiagnostics(app);
  assert.throws(()=>createDiagnostics(app),code('DIAGNOSTICS_ACTIVE'));
  app.actions.inc(); assert.equal(d.snapshot().entries.length,1);
  const saved=d.snapshot(); d.dispose(); d.dispose();
  assert.equal(d.snapshot().status,'disposed'); assert.equal(d.snapshot().entries.length,0);
  assert.equal(saved.entries.length,1); app.actions.inc();
  assert.equal(resourceCounts(app).diagnosticBytes,0);
  createDiagnostics(app).dispose(); app.dispose();
});

test('D.3 coalesced render explains exact dirty/evaluated bindings and one text write', () => {
  const {app}=fixture(), d=createDiagnostics(app); app.mount(fakeBrowser().target);
  app.actions.inc(); app.actions.inc(); app.actions.inc(); app.flush();
  const snap=d.snapshot(), roots=snap.entries.filter(x=>x.kind==='dispatch'), frame=snap.entries.at(-1);
  assert.equal(frame.kind,'render'); assert.deepEqual(frame.causes,roots.map(x=>x.sequence));
  assert.equal(frame.counts['binding-evaluation'],1); assert.equal(frame.counts['dom-write'],1);
  for (const root of roots) {
    assert.equal(root.counts.commit,1); assert.equal(root.counts.change,2);
    assert.equal(ofType(root,'dirty').length,1);
    assert.equal(ofType(root,'dirty')[0].binding.target,'text:P'); // fake DOM has no reflected id property
  }
  assert.equal(ofType(frame,'evaluation')[0].resource,ofType(roots[0],'dirty')[0].resource);
  assert.equal(ofType(frame,'dom-write')[0].kind,'text');
  assert.ok(frame.durationMs===null || frame.durationMs>=0);
  assert.equal(frame.frame,null); assert.ok(Object.isFrozen(snap.entries[0].events));
  app.dispose(); assert.ok(Object.values(resourceCounts(app)).every(x=>x===0));
});

test('D.3 diagnostic summaries retain input origins, payload previews and property deltas', () => {
  const {app}=fixture(), d=createDiagnostics(app);
  app.receiveInput({version:1,kind:'action',name:'rename',args:['Grace']});
  const root=d.snapshot().entries[0]; assert.equal(root.kind,'input');
  assert.equal(ofType(root,'input')[0].packet.name,'rename');
  assert.equal(ofType(root,'action')[0].args['0'],'Grace');
  const change=ofType(root,'change')[0]; assert.equal(change.oldValue,'Ada'); assert.equal(change.value,'Grace');
  app.dispose();
});

test('D.3 captures FIFO children and rollback/discard without changing versions or errors', () => {
  const {app}=fixture(), d=createDiagnostics(app); app.actions.parent();
  assert.deepEqual(ofType(d.snapshot().entries[0],'action').filter(x=>x.phase==='dispatched').map(x=>x.name),['parent','inc']);
  const before=app.snapshot(); assert.throws(()=>app.actions.bad(),/rollback/); assert.equal(app.snapshot(),before);
  const root=d.snapshot().entries.at(-1); assert.equal(root.outcome,'failed'); assert.equal(root.error.message,'rollback');
  assert.deepEqual(ofType(root,'action').map(x=>x.phase),['queued','dispatched','queued','failed','discarded']);
  assert.equal(root.counts.change,undefined); app.dispose();
});

test('D.3 optional instrumentation leaves recording bytes, hashes and replay endpoints identical', () => {
  const run=enabled=>{ const {app,schema}=fixture(); if(enabled)createDiagnostics(app); app.startRecording(); app.actions.inc(); app.actions.rename('Grace'); app.setLogicalTime(1000); app.actions.reverse();
    const wire=app.exportRecording(),hash=hashSnapshot(app.snapshot());app.dispose();return {wire,hash,schema}; };
  const a=run(false),b=run(true);assert.equal(a.wire,b.wire);assert.equal(a.hash,b.hash);
  const replay=createReplay({recording:a.wire,schema:a.schema});const d=createDiagnostics(replay.app);replay.run();
  assert.equal(hashSnapshot(replay.app.snapshot()),a.hash);
  assert.deepEqual(d.snapshot().entries.map(x=>x.kind),['dispatch','dispatch','time','dispatch']);replay.dispose();
});

test('D.3 fixed ticks capture one root with input and simulation work and logical endpoints', () => {
  const schema=createActionSchema()(({action})=>({inc:action(s=>{s.n++})}));
  const app=createApp({schema,initialState:{n:0},simulation:{tickDuration:1000,action:'inc'}}),d=createDiagnostics(app);
  app.enqueue('inc');app.resumeTicks();app.advanceTicks(1000);
  const root=d.snapshot().entries[0];assert.equal(root.kind,'tick');assert.equal(root.after.tick,1);assert.equal(root.after.time,1000);assert.equal(root.counts.commit,2);assert.ok(root.simulationDurationMs===null || root.simulationDurationMs>=0);
  app.dispose();
});

test('D.3 entry and byte limits evict old summaries; oversized transitions truncate details, not counts', () => {
  const schema=createActionSchema()(({action})=>({many:action(s=>{for(let i=0;i<1000;i++)s.values[i]++;})}));
  const app=createApp({schema,initialState:{values:Array(1000).fill(0)}}),d=createDiagnostics(app,{maxEntries:2,maxBytes:16384});
  for(let i=0;i<8;i++)app.actions.many();
  const snap=d.snapshot();assert.ok(snap.entries.length<=2&&snap.entries.length>0);assert.ok(snap.bytes<=16384);assert.ok(snap.evicted>0);
  assert.equal(snap.entries.at(-1).counts.change,1000);assert.ok(snap.entries.at(-1).omittedEvents>0);assert.equal(snap.dropped,0);
  assert.ok(resourceCounts(app).diagnosticScratch===0);app.dispose();
});

test('D.3 preview owns scalar summaries, truncates sensitive strings and never calls accessors', () => {
  const {app}=fixture(),d=createDiagnostics(app);app.actions.rename('secret'.repeat(1000));
  const old=d.snapshot();assert.ok(JSON.stringify(old.entries).length<20000);assert.ok(JSON.stringify(old.entries).includes('…'));
  assert.equal(app.state.name.length,6000);app.actions.rename('new');assert.equal(ofType(old.entries[0],'change')[0].oldValue,'Ada');
  app.dispose();assert.equal(d.snapshot().dependencies,null);assert.equal(d.snapshot().recording,null);
});

test('D.3 invalid configurations and active-boundary attachment fail without a state change', () => {
  assert.throws(()=>createDiagnostics({}),code('DIAGNOSTICS_INVALID'));
  const app=createApp();for(const options of [{maxEntries:0},{maxEntries:4097},{maxBytes:100},{maxBytes:Infinity},{unknown:1}])assert.throws(()=>createDiagnostics(app,options),code('DIAGNOSTICS_INVALID'));
  let called=0;assert.throws(()=>createDiagnostics(app,{get maxEntries(){called++;return 1}}),code('DIAGNOSTICS_INVALID'));assert.equal(called,0);
  assert.throws(()=>app.observe(()=>{createDiagnostics(app)}),code('DIAGNOSTICS_REENTRANT'));app.dispose();
  assert.throws(()=>createDiagnostics(app),code('APP_DISPOSED'));
});

test('D.3 unavailable observation clock does not change controlled execution; off mode never reads it', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');let reads=0;
  Object.defineProperty(globalThis,'performance',{configurable:true,get(){reads++;throw Error('no observer clock')}});
  try {
    const {app}=fixture();app.actions.inc();assert.equal(reads,0);
    const before=app.controls.random.draws,d=createDiagnostics(app);app.actions.inc();
    assert.equal(app.controls.random.draws,before+1);assert.equal(d.snapshot().entries[0].durationMs,null);app.dispose();
  } finally { Object.defineProperty(globalThis,'performance',descriptor); }
});

test('D.3 descriptor previews do not execute getters/toJSON or retain aliased data', () => {
  let getters=0;const shared={n:1},data={first:shared,second:shared,value:undefined,negativeZero:-0,
    get secret(){getters++;throw Error('getter')},toJSON(){throw Error('toJSON')}};
  const copy=preview(data);shared.n=2;assert.equal(getters,0);assert.equal(copy.first.n,1);
  assert.equal(copy.secret,'[accessor]');assert.equal(copy.second,'[alias]');assert.equal(copy.value,'[undefined]');assert.equal(copy.negativeZero,'[-0]');
  assert.doesNotThrow(()=>JSON.stringify(copy));
});

test('D.4 Promise-returning export callback rejects after explicit capture with no source mutation', () => {
  const {app}=fixture(),d=createDiagnostics(app);app.actions.inc();const before=app.snapshot();
  const inspector=createInspector({diagnostics:d,onExport:async()=>{throw Error('illegal async hook')}});
  assert.throws(()=>inspector.export(),code('INSPECTOR_ASYNC'));assert.equal(app.snapshot(),before);
  assert.ok(inspector.app.state.exported.includes('mini-framework-diagnostics'));inspector.dispose();app.dispose();
});

test('D.4 inspector selection and export are read-only to the source; cleanup owns only the panel', () => {
  const {app}=fixture(),d=createDiagnostics(app);app.startRecording();app.actions.inc();app.actions.rename('Grace');
  let exports=[];const inspector=createInspector({diagnostics:d,onExport:(text,kind)=>{exports.push({text,kind})}});
  const before=app.snapshot();inspector.mount(fakeBrowser().target);inspector.select(1);
  assert.equal(inspector.app.state.selected,'1');assert.ok(inspector.app.state.details.includes('oldValue'));
  const diagnostic=inspector.export();assert.equal(JSON.parse(diagnostic).format,'mini-framework-diagnostics');
  assert.equal(inspector.export('recording'),app.exportRecording());assert.equal(exports.length,2);assert.equal(app.snapshot(),before);
  inspector.dispose();assert.equal(app.status,'created');assert.equal(d.snapshot().status,'active');
  assert.ok(Object.values(resourceCounts(inspector.app)).every(x=>x===0));assert.throws(()=>inspector.refresh(),code('INSPECTOR_DISPOSED'));app.dispose();
});

test('D.4 missing recording and invalid selection/export report clear failures', () => {
  const app=createApp(),d=createDiagnostics(app),i=createInspector({diagnostics:d});
  assert.throws(()=>i.export('recording'),code('RECORDING_MISSING'));assert.throws(()=>i.export('other'),code('INSPECTOR_INVALID'));
  assert.throws(()=>i.select(-1),code('INSPECTOR_INVALID'));assert.throws(()=>createInspector({diagnostics:{}}),code('INSPECTOR_INVALID'));
  i.dispose();app.dispose();
});

test('D.4 retained history restore and replay are captured; compatible history controls are explicit', () => {
  const {app,schema}=fixture();app.startRecording();app.actions.inc();app.actions.inc();const recording=app.exportRecording();app.dispose();
  const history=createHistory({recording,schema,reversible:['inc']}),d=createDiagnostics(history.app);
  const inspector=createInspector({diagnostics:d,history});history.seek(2);inspector.refresh();
  assert.ok(d.snapshot().entries.some(x=>x.kind==='restore'));assert.equal(history.app.state.n,2);
  assert.equal(inspector.app.state.canUndo,true);inspector.select(1);assert.equal(history.status.sequence,2);
  const wrong=createHistory({recording,schema});assert.throws(()=>createInspector({diagnostics:d,history:wrong}),code('INSPECTOR_INVALID'));
  wrong.dispose();inspector.dispose();history.dispose();assert.equal(d.snapshot().entries.length,0);
});

test('D.3/D.4 repeated panel/session/source disposal returns all owned resources to zero', () => {
  for(let n=0;n<30;n++){const {app}=fixture(),d=createDiagnostics(app),i=createInspector({diagnostics:d});app.mount(fakeBrowser().target);app.actions.inc();app.flush();i.mount(fakeBrowser().target);i.refresh();i.dispose();app.dispose();
    assert.ok(Object.values(resourceCounts(app)).every(x=>x===0));assert.ok(Object.values(resourceCounts(i.app)).every(x=>x===0));assert.equal(d.snapshot().entries.length,0);}
});
