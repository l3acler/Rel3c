import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApp,createActionSchema,readRecording,serializeRecording,div} from '../src/index.js';
import {resourceCounts} from '../src/runtime/diagnostics.js';
import {recordCodec} from '../src/runtime/recording/format.js';
import {fakeBrowser} from './helpers/fake-browser.js';
const code=name=>error=>error.code===name;
const hash=text=>createHash('sha256').update(text).digest('hex');
const packet=(name,...args)=>({version:1,kind:'action',name,args});
function make(options={}) {
  let app;
  const schema=createActionSchema({version:'recording/1'})(({action})=>({
    increment:action((draft,services)=>{draft.n++;draft.draws.push(services.random());draft.time=services.now();}),
    parent:action(draft=>{draft.order.push('parent');app.actions.child('one');app.actions.child('two');}),
    child:action(value=>typeof value==='string',(draft,value)=>{draft.order.push(value);if(value==='one')app.actions.child('grandchild');}),
    abort:action((draft,services)=>{draft.n=-1;services.random();app.actions.increment();throw Error('rollback');}),
    partial:action(draft=>{draft.order.push('partial');app.actions.abort();app.actions.increment();}),
    noOp:action(()=>{}), payload:action(()=>true,(draft,value)=>{draft.payload=value;}),
    undefinedError:action(()=>{throw undefined;}),
    external:action(value=>value?.version===1,(draft,value)=>{draft.external=value;}),
  }));
  app=createApp({schema,initialState:{n:0,draws:[],order:[],time:0,payload:null,external:null},controls:{seed:7},...options});
  return app;
}
const imported=app=>readRecording(app.exportRecording(),{schemaVersion:'recording/1'});
// Independent test harness for state-only fixtures. No public replay/effect suppression API.
function reproduce(recording, options={}) {
  const app=make({initialState:undefined,controls:undefined,snapshot:recording.baseline.snapshot,...options});
  for(const record of recording.records) {
    try {
      const root=record.root;
      if(root.kind==='dispatch')app.dispatch(root.packet.name,...root.packet.args);
      if(root.kind==='input')app.receiveInput(root.input.packet);
      if(root.kind==='time')app.setLogicalTime(root.time);
      if(root.kind==='tick'){
        for(const event of record.events.filter(event=>event.type==='input'&&event.phase==='dispatched'&&event.parent===null&&!event.input.derived))
          app.receiveInput(event.input.packet,{tick:root.tick});
        app.resumeTicks();app.advanceTicks(app.controls.clock.tickDuration);app.pauseTicks();
      }
    } catch(error) {if(record.outcome!=='failed')throw error;}
    assert.equal(hash(app.snapshot()),record.after.hash);
  }
  assert.equal(app.snapshot(),recording.end.snapshot);app.dispose();
}

test('C.7 recording is opt-in, explicit export only, stop/clear independent of application commits',()=>{
  const app=make();app.actions.increment();assert.equal(app.recording.status,'off');assert.throws(app.exportRecording,code('RECORDING_MISSING'));
  const start=app.startRecording();assert.ok(Object.isFrozen(start));assert.equal(imported(app).baseline.snapshot,app.snapshot());
  app.actions.increment();const captured=app.stopRecording();assert.equal(captured.status,'stopped');const text=app.exportRecording();
  app.actions.increment();assert.equal(app.exportRecording(),text);assert.equal(imported(app).records.length,1);
  app.clearRecording();assert.equal(app.recording.bytes,0);assert.equal(resourceCounts(app).recordingRecords,0);app.dispose();
});

test('C.7 nested FIFO actions are one root with ordered committed versions and owned payloads',()=>{
  const app=make();app.startRecording();app.actions.parent();const log=imported(app),record=log.records[0];
  assert.deepEqual(app.state.order,['parent','one','two','grandchild']);assert.equal(log.records.length,1);
  assert.equal(record.actions,4);assert.equal(record.commits,4);
  assert.deepEqual(record.events.filter(e=>e.phase==='committed').map(e=>e.stateVersion),[2,3,4,5]);
  assert.deepEqual(record.events.filter(e=>e.phase==='queued').map(e=>e.parent),[null,1,1,2]);
  assert.ok(Object.isFrozen(log)&&Object.isFrozen(record.root.packet.args));reproduce(log);app.dispose();
});

test('C.7 rollback discards child traces and PRNG draws without discarding healthy sibling commits',()=>{
  const app=make();app.startRecording();assert.throws(app.actions.partial,/rollback/);const log=imported(app),record=log.records[0];
  assert.equal(record.outcome,'failed');assert.equal(record.actions,4);assert.equal(record.commits,2);
  assert.deepEqual(record.events.filter(e=>['committed','failed','discarded'].includes(e.phase)).map(e=>e.phase),['committed','failed','discarded','committed']);
  assert.equal(app.state.n,1);assert.equal(app.controls.random.draws,1);reproduce(log);app.dispose();
});

test('C.7 no-op commits and manual logical-time inputs preserve exact versions/control continuation',()=>{
  const app=make();app.startRecording();app.actions.noOp();app.setLogicalTime(30);app.actions.increment();app.setLogicalTime(30);
  const log=imported(app);assert.deepEqual(log.records.map(r=>[r.root.kind,r.commits]),[['dispatch',1],['time',0],['dispatch',1],['time',0]]);
  assert.equal(log.records[2].after.time,30);assert.equal(app.state.time,30);reproduce(log);app.dispose();
});

test('C.7 graph payloads round-trip aliases, holes, undefined, negative zero, null prototypes and insertion order',()=>{
  const app=make(),shared=Object.assign(Object.create(null),{z:undefined,a:-0}),array=new Array(4);array[1]=shared;array.note='x';
  const value={array,a:shared,b:shared};app.startRecording();app.actions.payload(value);value.a.z='changed';
  const log=imported(app),saved=log.records[0].root.packet.args[0];assert.equal(saved.a,saved.b);assert.equal(saved.array[1],saved.a);
  assert.equal(Object.getPrototypeOf(saved.a),null);assert.equal(saved.a.z,undefined);assert.ok(Object.is(saved.a.a,-0));
  assert.equal(saved.array.length,4);assert.ok(!(0 in saved.array));assert.deepEqual(Object.keys(saved.a),['z','a']);
  assert.throws(()=>{saved.a.a=3;},TypeError);reproduce(log);app.dispose();
});

test('C.7 consumed external inputs retain queued admission metadata; canceled/unconsumed inputs have no transition',()=>{
  const app=make({simulation:{tickDuration:10}});app.startRecording();const canceled=app.enqueue('increment');canceled.cancel();
  app.inputs.send('measurement','external',{width:500});app.enqueueAt(3,'increment');
  assert.equal(imported(app).records.length,0);app.resumeTicks();app.advanceTicks(10);app.pauseTicks();
  const log=imported(app),record=log.records[0],event=record.events.find(e=>e.type==='input'&&e.phase==='dispatched');
  assert.equal(record.root.kind,'tick');assert.equal(event.queued,true);assert.equal(event.input.sequence,2);
  assert.equal(event.input.tick,1);assert.equal(event.input.packet.args[0].origin,'measurement');assert.equal(event.input.packet.args[0].value.width,500);
  assert.equal(app.ticks.queuedInputs,1);assert.equal(record.after.stateVersion,app.stateVersion);
  assert.throws(app.snapshot,code('SNAPSHOT_PENDING'));reproduce(log,{simulation:{tickDuration:10}});app.dispose();
});

test('C.7 fixed tick roots are independent of render cadence and include their configured tick action',()=>{
  const logs=[];
  for(const schedule of [[10,10,10,10],[5,15,3,17],[40]]){
    const app=make({simulation:{tickDuration:10,action:'increment'}});app.startRecording();app.enqueueAt(2,'parent');app.resumeTicks();
    for(const delta of schedule){app.advanceTicks(delta);app.flush();}app.pauseTicks();logs.push(imported(app));app.dispose();
  }
  assert.deepEqual(logs[0],logs[1]);assert.deepEqual(logs[1],logs[2]);assert.equal(logs[0].records[1].actions,5);
  reproduce(logs[0],{simulation:{tickDuration:10,action:'increment'}});
});

test('C.7 failed ticks retain consumed logical time, successful prefixes, and stop capture only at the root boundary',()=>{
  const app=make({simulation:{tickDuration:10,action:'increment'}});app.startRecording();app.enqueue('abort');app.enqueue('parent');app.resumeTicks();
  assert.throws(()=>app.advanceTicks(20),/rollback/);const log=imported(app);assert.equal(log.records.length,1);assert.equal(log.records[0].after.tick,1);
  assert.equal(log.records[0].commits,5);assert.equal(log.records[0].outcome,'failed');assert.equal(app.ticks.paused,true);
  reproduce(log,{simulation:{tickDuration:10,action:'increment'}});app.dispose();
});

test('C.7 action failure and observer failure remain separate from already committed state',()=>{
  const app=make();app.startRecording();app.observe(state=>state.n,()=>{throw Error('notify');});assert.throws(app.actions.increment,/notify/);
  const record=imported(app).records[0];assert.equal(record.outcome,'failed');assert.equal(record.commits,1);
  assert.equal(record.events.at(-1).phase,'committed');assert.equal(record.error.message,'notify');app.dispose();
  const input=make();input.startRecording();input.observeInputs(()=>{throw Error('input observer');});assert.throws(()=>input.receiveInput(packet('increment')),/input observer/);
  assert.equal(imported(input).records[0].commits,1);assert.equal(imported(input).records[0].events.at(-1).phase,'failed');input.dispose();
});

test('C.7 failed payload execution is recorded without a false admitted action; invalid direct admissions are excluded',()=>{
  const app=make();app.startRecording();assert.throws(()=>app.dispatch('child',3),code('PAYLOAD_INVALID'));assert.equal(imported(app).records.length,0);
  assert.throws(()=>app.receiveInput(packet('child',3)),code('PAYLOAD_INVALID'));const record=imported(app).records[0];
  assert.equal(record.actions,0);assert.equal(record.commits,0);assert.equal(record.outcome,'failed');reproduce(imported(app));app.dispose();
});

test('C.7 thrown undefined and hostile error accessors produce bounded inert summaries',()=>{
  const app=make();app.startRecording();assert.throws(app.actions.undefinedError);const record=imported(app).records[0];
  assert.equal(record.outcome,'failed');assert.equal(record.error.name,'Error');assert.equal(record.events.at(-1).error.message,'Operation failed.');app.dispose();
  let reads=0;const error={get name(){reads++;return 'bad';},get message(){reads++;return 'bad';}};
  const schema=createActionSchema()(({action})=>({fail:action(()=>{throw error;})})),other=createApp({schema});other.startRecording();
  assert.throws(other.actions.fail);assert.equal(readRecording(other.exportRecording()).records[0].error.message,'Operation failed.');assert.equal(reads,0);other.dispose();
});

test('C.7 native navigation, derived location and hydration have one owner and route continuations',()=>{
  const browser=fakeBrowser(),app=make({target:browser.target,router:{base:'/app',routes:[]},
    persistence:{namespace:'recorded',fields:{time:{location:'url',validate:value=>typeof value==='number'}}},view:()=>div('record')});
  app.startRecording();app.navigate('/next');const log=imported(app),record=log.records[0];
  assert.equal(log.baseline.route.url,'/app/');assert.equal(log.end.route.url,'/app/next');assert.equal(log.records.length,1);
  const packets=record.events.filter(e=>e.type==='input'&&e.phase==='dispatched');assert.deepEqual(packets.map(e=>e.input.packet.kind),['navigation','location']);
  assert.deepEqual(packets.map(e=>e.input.derived),[false,true]);app.dispose();
});

test('C.7 supplied hydration commits and preserves aliases outside named actions',()=>{
  const app=createApp({initialState:{a:null,b:null},persistence:{namespace:'recorded',fields:{a:{location:'local',validate:()=>true},b:{location:'local',validate:()=>true}}}});
  app.startRecording();const shared={x:1};app.receiveInput({version:1,kind:'hydration',namespace:'recorded',schemaVersion:'app/1',groups:[{location:'local',values:{a:shared,b:shared}}]});
  const log=readRecording(app.exportRecording());assert.equal(log.records[0].commits,1);assert.equal(log.records[0].actions,0);
  assert.equal(log.records[0].root.input.packet.groups[0].values.a,log.records[0].root.input.packet.groups[0].values.b);app.dispose();
});

test('C.7 recording operations reject active actions/reads/inputs and mount transitions',()=>{
  let app;const schema=createActionSchema()(({action})=>({attempt:action(()=>{
    for(const run of [app.startRecording,app.stopRecording,app.clearRecording,app.exportRecording])assert.throws(run,code('RECORDING_REENTRANT'));
  })}));app=createApp({schema});app.startRecording();app.actions.attempt();assert.equal(readRecording(app.exportRecording()).records.length,1);
  const resource=app.observe(()=>{assert.throws(app.exportRecording,code('RECORDING_REENTRANT'));return 1;});resource.dispose();
  app.observeInputs(()=>assert.throws(app.stopRecording,code('RECORDING_REENTRANT')));app.receiveInput(packet('attempt'));
  assert.throws(()=>app.mount(fakeBrowser().target),code('RECORDING_ACTIVE'));app.dispose();
});

test('C.7 recording start rejects existing tick queues and pending effects',async()=>{
  const app=make({simulation:{tickDuration:1}}),ticket=app.enqueue('increment');assert.throws(app.startRecording,code('RECORDING_PENDING'));ticket.cancel();
  let resolve;const task=app.inputs.effect('network','external',()=>new Promise(done=>{resolve=done;}));assert.throws(app.startRecording,code('RECORDING_PENDING'));
  await Promise.resolve();task.cancel();resolve(3);await task.done;
  // Adapter cancellation is itself a normalized queued result in fixed mode.
  app.resumeTicks();app.advanceTicks(1);app.pauseTicks();app.startRecording();assert.equal(app.recording.status,'active');app.dispose();
});

test('C.8 recording option validation and failed restarts preserve the prior usable recording',()=>{
  const app=make();let reads=0;
  for(const options of [null,[],{mode:'full'},{maxActions:0},{maxActions:100001},{maxBytes:67108865},{maxBytes:0},{keyframeInterval:0},{unknown:1},
    {get maxBytes(){reads++;return 1000;}}])assert.throws(()=>app.startRecording(options),code('RECORDING_INVALID'));
  assert.equal(reads,0);assert.throws(()=>app.startRecording({maxBytes:1}),code('RECORDING_LIMIT'));app.startRecording();
  assert.throws(app.startRecording,code('RECORDING_ACTIVE'));app.actions.increment();app.stopRecording();const prior=app.exportRecording();
  assert.throws(()=>app.startRecording({maxBytes:1}),code('RECORDING_LIMIT'));assert.equal(app.exportRecording(),prior);app.dispose();
});

test('C.8 long recent histories stay bounded and every retained checkpoint suffix reproduces from its baseline',()=>{
  const app=make();app.startRecording({maxActions:7,maxBytes:200000,keyframeInterval:3});
  for(let i=0;i<120;i++){
    app.actions.increment();assert.ok(app.recording.actions<=7&&app.recording.bytes<=200000);assert.equal(resourceCounts(app).recordingScratch,0);
    if(i%20===0)reproduce(imported(app));
  }
  const log=imported(app);assert.ok(log.evictedRecords>0);assert.equal(log.end.sequence,120);
  assert.equal(log.baseline.sequence+log.records.length,120);assert.ok(log.records.some(r=>r.checkpoint!==null));reproduce(log);app.dispose();
});

test('C.8 no-keyframe eviction advances to the latest baseline rather than leaving an unreplayable suffix',()=>{
  const app=make();app.startRecording({maxActions:2,keyframeInterval:100});for(let i=0;i<3;i++)app.actions.increment();
  const log=imported(app);assert.equal(log.records.length,0);assert.equal(log.baseline.sequence,3);assert.equal(log.baseline.snapshot,app.snapshot());
  app.actions.increment();assert.equal(imported(app).records.length,1);reproduce(imported(app));app.dispose();
});

test('C.8 recent oversized atomic batches advance the baseline and report coordinated eviction',()=>{
  const app=make();app.startRecording({maxActions:2});app.actions.increment();app.actions.parent();
  const log=imported(app);assert.equal(log.records.length,0);assert.equal(log.baseline.snapshot,app.snapshot());assert.equal(log.evictedRecords,2);
  assert.equal(log.evictedActions,5);assert.equal(app.recording.status,'active');app.actions.increment();reproduce(imported(app));app.dispose();
});

test('C.8 recent byte pressure accounts UTF-8, escaped graph strings, snapshots and metadata',()=>{
  const app=make();app.startRecording({maxActions:100,maxBytes:7000,keyframeInterval:2});
  for(let i=0;i<30;i++){
    app.actions.payload('日本😀\\\"'.repeat(30)+i);assert.ok(app.recording.bytes<=7000);
    assert.ok(Buffer.byteLength(app.exportRecording())<=app.recording.bytes);readRecording(app.exportRecording());
  }
  assert.ok(app.recording.evictedRecords>0);assert.equal(app.recording.status,'active');reproduce(imported(app));app.dispose();
});

test('C.8 oversized baseline stops recent capture and preserves the prior prefix without affecting commits',()=>{
  const app=make();app.startRecording({maxBytes:4000,keyframeInterval:2});app.actions.noOp();const prefix=imported(app);
  app.actions.payload('x'.repeat(8000));assert.equal(app.state.payload.length,8000);assert.equal(app.recording.status,'limit-reached');
  assert.equal(app.recording.reason,'baseline-limit');const log=imported(app);assert.equal(log.end.snapshot,prefix.end.snapshot);
  assert.equal(log.baseline.snapshot,prefix.baseline.snapshot);assert.ok(app.recording.bytes<=4000);app.actions.increment();assert.equal(imported(app).end.snapshot,log.end.snapshot);app.dispose();
});

test('C.8 session action limits stop visibly without dropping already captured roots',()=>{
  const app=make();app.startRecording({mode:'session',maxActions:2});app.actions.increment();app.actions.increment();const prefix=imported(app);
  app.actions.parent();const log=imported(app);assert.equal(app.recording.status,'limit-reached');assert.equal(app.recording.reason,'action-limit');
  assert.equal(log.records.length,2);assert.equal(log.evictedRecords,0);assert.equal(log.end.snapshot,prefix.end.snapshot);
  assert.equal(app.state.order.length,4);assert.ok(app.recording.bytes<=app.recording.maxBytes);reproduce(log);app.dispose();
});

test('C.8 session byte limits freeze a complete prefix while the live app continues',()=>{
  const app=make();app.startRecording({mode:'session',maxBytes:6000});app.actions.increment();const prefix=imported(app);
  app.actions.payload('😀'.repeat(500));assert.equal(app.recording.status,'limit-reached');assert.equal(app.recording.reason,'byte-limit');
  assert.equal(imported(app).end.snapshot,prefix.end.snapshot);assert.equal(app.state.payload.length,1000);assert.equal(app.recording.evictedActions,0);app.dispose();
});

test('C.8 empty ticks/control roots consume action slots so histories cannot grow without actions',()=>{
  const app=make({simulation:{tickDuration:1}});app.startRecording({maxActions:3,keyframeInterval:2});app.resumeTicks();
  for(let i=0;i<20;i++)app.advanceTicks(1);app.pauseTicks();assert.ok(app.recording.records<=3&&app.recording.actions<=3);
  const log=imported(app);assert.ok(log.evictedRecords>0);assert.equal(log.end.sequence,20);reproduce(log,{simulation:{tickDuration:1}});app.dispose();
});

test('C.8 root-boundary keyframes may cross the interval without splitting nested action ownership',()=>{
  const app=make();app.startRecording({keyframeInterval:2});app.actions.parent();const record=imported(app).records[0];
  assert.equal(record.actions,4);assert.equal(record.commits,4);assert.equal(record.checkpoint,app.snapshot());
  assert.equal(record.after.hash,hash(record.checkpoint));app.dispose();
});

test('C.8 disposal clears retained and scratch records; exported caller strings remain independent',()=>{
  const app=make();app.startRecording();app.actions.parent();const text=app.exportRecording();assert.ok(resourceCounts(app).recordingBytes>0);
  app.dispose();assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));assert.equal(readRecording(text).records.length,1);
  assert.throws(app.exportRecording,code('APP_DISPOSED'));assert.throws(app.startRecording,code('APP_DISPOSED'));
});

test('C.7 import is inert and rejects incompatible formats/schema/runtime/checkpoint versions before execution',()=>{
  const app=make();app.startRecording();app.actions.increment();const text=app.exportRecording(),before=app.snapshot();
  for(const edit of [wire=>{wire.version=2;},wire=>{wire.runtimeVersion='other';},wire=>{wire.schemaVersion='other';},wire=>{
    const cp=JSON.parse(wire.baseline.snapshot);cp.runtimeVersion='other';wire.baseline.snapshot=JSON.stringify(cp);
  }]){
    const wire=JSON.parse(text);edit(wire);assert.throws(()=>readRecording(JSON.stringify(wire),{schemaVersion:'recording/1'}),code('RECORDING_INCOMPATIBLE'));
  }
  assert.equal(app.snapshot(),before);app.dispose();
});

test('C.7 import rejects noncanonical JSON, malformed records and declared budget overflow',()=>{
  const app=make();app.startRecording({keyframeInterval:1});app.actions.increment();const text=app.exportRecording();
  for(const bad of [null,'no JSON',text+' ',text.replace('"version":1','"version":1,"version":1')])assert.throws(()=>readRecording(bad),code('RECORDING_INVALID'));
  const edits=[wire=>{wire.extra=1;},wire=>{const first=wire.format;delete wire.format;wire.format=first;},
    wire=>{wire.policy={keyframeInterval:1,maxBytes:wire.policy.maxBytes,maxActions:wire.policy.maxActions,mode:wire.policy.mode};},
    wire=>{wire.records[0].sequence=4;},wire=>{wire.records[0].commits=0;},
    wire=>{wire.records[0].after.hash='not a hash';},wire=>{wire.records[0].after.time=1;},wire=>{wire.records[0].checkpoint=wire.baseline.snapshot;},
    wire=>{wire.end.snapshot=wire.baseline.snapshot;},wire=>{wire.status='limit-reached';wire.reason=null;},wire=>{wire.baseline.route={mode:'history',base:'/',url:'https://bad.test'};},
    wire=>{wire.records[0].events.pop();}];
  for(const edit of edits){const wire=JSON.parse(text);edit(wire);assert.throws(()=>readRecording(JSON.stringify(wire)),code('RECORDING_INVALID'));}
  for(const edit of [wire=>{wire.policy.maxActions=1;wire.records.push({...wire.records[0],sequence:2});},wire=>{wire.policy.maxBytes=1;}]){
    const wire=JSON.parse(text);edit(wire);assert.throws(()=>readRecording(JSON.stringify(wire)),code('RECORDING_LIMIT'));
  }
  app.dispose();
});

test('C.7 import validates graph tags/aliases and nested trace ownership/order',()=>{
  const app=make();app.startRecording();app.actions.parent();const text=app.exportRecording();
  const edits=[wire=>{wire.records[0].root='{}';},wire=>{
    const graph=JSON.parse(wire.records[0].root);graph.root=['ref',999];wire.records[0].root=JSON.stringify(graph);
  },wire=>{
    const event=recordCodec.decode(wire.records[0].events[2]);event.parent=999;wire.records[0].events[2]=recordCodec.encode(event);
  },wire=>{
    const record=wire.records[0],a=record.events.findIndex(t=>recordCodec.decode(t).phase==='committed');
    const event=recordCodec.decode(record.events[a]);event.stateVersion=99;record.events[a]=recordCodec.encode(event);
  },wire=>{wire.records[0].events.reverse();}];
  for(const edit of edits){const wire=JSON.parse(text);edit(wire);assert.throws(()=>readRecording(JSON.stringify(wire)),code('RECORDING_INVALID'));}app.dispose();
});

test('C.7 import options reject ordinary getters and unknown fields without invoking application code',()=>{
  const app=make();app.startRecording();const text=app.exportRecording();let reads=0;
  assert.throws(()=>readRecording(text,{get schemaVersion(){reads++;return 'x';}}),code('RECORDING_INVALID'));
  assert.throws(()=>readRecording(text,{unknown:1}),code('RECORDING_INVALID'));assert.equal(reads,0);app.dispose();
});

test('C.7 validated immutable recording serialization round-trips the canonical wire without trusting forged objects',()=>{
  const app=make();app.startRecording();app.actions.payload({value:undefined,negativeZero:-0});app.stopRecording();
  const text=app.exportRecording(),log=readRecording(text);assert.equal(serializeRecording(log),text);
  assert.deepEqual(readRecording(serializeRecording(log)),log);assert.throws(()=>serializeRecording({...log}),code('RECORDING_INVALID'));
  let reads=0;assert.throws(()=>serializeRecording({get records(){reads++;return [];}}),code('RECORDING_INVALID'));assert.equal(reads,0);app.dispose();
});

test('C.7 recording checkpoints retain array reorder/insertion and aliased object identity',()=>{
  const shared={n:1},schema=createActionSchema()(({action})=>({
    reorder:action(draft=>{draft.a.n++;draft.rows.reverse();draft.rows.splice(1,0,{n:3});})
  }));
  const app=createApp({schema,initialState:{a:shared,b:shared,rows:[shared,{n:2}]}});app.startRecording({keyframeInterval:1});app.actions.reorder();
  const log=readRecording(app.exportRecording()),restored=createApp({schema,snapshot:log.records[0].checkpoint});
  assert.equal(restored.state.a,restored.state.b);assert.equal(restored.state.rows[2],restored.state.a);
  assert.deepEqual(restored.state.rows.map(value=>value.n),[2,3,2]);assert.equal(restored.snapshot(),app.snapshot());app.dispose();restored.dispose();
});

test('C.7 logical tick overflow records no phantom consumed root or queue removal',()=>{
  const app=make({controls:{seed:7,time:Number.MAX_SAFE_INTEGER},simulation:{tickDuration:1}});app.startRecording();app.resumeTicks();
  assert.throws(()=>app.advanceTicks(1),code('CONTROL_LIMIT'));const log=imported(app);
  assert.equal(log.records.length,0);assert.equal(log.end.snapshot,app.snapshot());assert.equal(app.ticks.accumulator,1);app.dispose();
});

test('C.7 malformed decoded trace scalars and nonlocal hash routes fail with recording errors',()=>{
  const app=make();app.startRecording();app.actions.noOp();const original=JSON.parse(app.exportRecording());
  for(const bad of [null,3,[],undefined]){
    const wire=structuredClone(original);wire.records[0].events[0]=recordCodec.encode(bad);
    assert.throws(()=>readRecording(JSON.stringify(wire)),code('RECORDING_INVALID'));
  }
  const wire=structuredClone(original);wire.baseline.route={mode:'hash',base:'/',url:'/doc#https://external.test/'};
  assert.throws(()=>readRecording(JSON.stringify(wire)),code('RECORDING_INVALID'));app.dispose();
});
