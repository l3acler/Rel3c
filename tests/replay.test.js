import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApp,createReplay,createActionSchema,readRecording,div,button} from '../src/index.js';
import {resourceCounts} from '../src/runtime/diagnostics.js';
import {fakeBrowser} from './helpers/fake-browser.js';
const code=name=>error=>error.code===name;
const hash=text=>createHash('sha256').update(text).digest('hex');
const packet=(name,...args)=>({version:1,kind:'action',name,args});
function fixture(options={}) {
  let app,controller;
  const schema=createActionSchema({version:'replay/1'})(({action})=>({
    increment:action((draft,services)=>{draft.n+=options.changed?2:1;draft.draws.push(services.random());draft.time=services.now();}),
    parent:action(draft=>{draft.order.push('parent');app.actions.child('one');app.actions.child('two');}),
    child:action(value=>typeof value==='string',(draft,value)=>{draft.order.push(value);if(value==='one')app.actions.child('grandchild');}),
    abort:action((draft,services)=>{draft.n=-1;services.random();app.actions.increment();throw Error(options.error??'rollback');}),
    partial:action(draft=>{draft.order.push('partial');app.actions.abort();app.actions.increment();}),
    noOp:action(()=>{}), payload:action(()=>true,(draft,value)=>{draft.payload=value;}),
    undefinedError:action(()=>{throw undefined;}),
    external:action(value=>value?.version===1,(draft,value)=>{draft.external=value;}),
    navigate:action(()=>app.navigate('/next')),
    reenter:action(draft=>{assert.throws(()=>controller.step(),code('REPLAY_REENTRANT'));assert.throws(()=>controller.dispose(),code('REPLAY_REENTRANT'));draft.n++;}),
  }));
  if(options.recording) {
    controller=createReplay({recording:options.recording,schema,...options.config});app=controller.app;
  } else app=createApp({schema,initialState:{n:0,draws:[],order:[],time:0,payload:null,external:null},controls:{seed:7},...options.config});
  return {app,controller,schema};
}
function record(run,config={},policy={}) {
  const {app}=fixture({config});app.startRecording(policy);run(app);app.stopRecording();const text=app.exportRecording();app.dispose();return text;
}
function verify(text,config={}) {
  const {app,controller}=fixture({recording:text,config}),log=readRecording(text);
  for(const root of log.records) {
    const status=controller.step();assert.equal(status.divergence,null);assert.equal(hash(app.snapshot()),root.after.hash);
    assert.equal(status.sequence,root.sequence);app.flush();
  }
  assert.equal(controller.status.status,'complete');assert.equal(app.snapshot(),log.end.snapshot);
  controller.dispose();assert.equal(controller.status.status,'disposed');assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));return log;
}

test('C.9 replay executes nested FIFO once, no-ops and manual time with exact control hashes',()=>{
  const text=record(app=>{app.actions.parent();app.actions.noOp();app.setLogicalTime(30);app.actions.increment();});
  const log=verify(text);assert.equal(log.records[0].actions,4);
});
test('C.9 replay preserves partial successes, rollback, discarded children and random continuation',()=>{
  verify(record(app=>{assert.throws(app.actions.partial,/rollback/);assert.throws(app.actions.undefinedError);app.actions.increment();}));
});
test('C.9 replay supports decoded recordings and restored alias/hole payload graphs',()=>{
  const shared=Object.assign(Object.create(null),{z:undefined,a:-0}),array=new Array(4);array[1]=shared;array.note='x';
  const text=record(app=>app.actions.payload({array,a:shared,b:shared}));
  const {app,controller}=fixture({recording:readRecording(text)});assert.equal(controller.run().status,'complete');
  assert.equal(app.state.payload.a,app.state.payload.b);assert.equal(app.state.payload.array[1],app.state.payload.a);
  assert.equal(Object.getPrototypeOf(app.state.payload.a),null);assert.ok(!(0 in app.state.payload.array));assert.ok(Object.is(app.state.payload.a.a,-0));controller.dispose();
});
test('C.9 replay reports first changed state root and never executes the following root',()=>{
  const text=record(app=>{app.actions.increment();app.actions.parent();});
  const {app,controller}=fixture({recording:text,changed:true});const status=controller.run();
  assert.equal(status.status,'diverged');assert.equal(status.position,1);assert.equal(status.divergence.reason,'state');
  assert.equal(status.divergence.sequence,1);assert.equal(status.divergence.action,'increment');assert.deepEqual(app.state.order,[]);
  assert.equal(status.divergence.actualHash,hash(app.snapshot()));assert.ok(Object.isFrozen(status.divergence));
  assert.equal(controller.step().position,1);controller.dispose();
});
test('C.9 changed transaction failure is a trace divergence at the first differing event',()=>{
  const text=record(app=>assert.throws(app.actions.abort));const {controller}=fixture({recording:text,error:'changed'});
  const result=controller.run();assert.equal(result.status,'diverged');assert.equal(result.divergence.reason,'trace');
  assert.ok(Number.isInteger(result.divergence.eventIndex));assert.ok(result.divergence.expected.length<2200);controller.dispose();
});
test('C.9 missing later action fails preflight before any action executes',()=>{
  const text=record(app=>{app.actions.increment();app.actions.parent();});let runs=0;
  const schema=createActionSchema({version:'replay/1'})(({action})=>({increment:action(()=>{runs++;})}));
  assert.throws(()=>createReplay({recording:text,schema}),code('REPLAY_INCOMPATIBLE'));assert.equal(runs,0);
});
test('C.9 replay rejects incompatible registered arity and schema/format before execution',()=>{
  const text=record(app=>app.actions.child('one'));
  const schema=createActionSchema({version:'replay/1'})(({action})=>({child:action(()=>{})}));
  assert.throws(()=>createReplay({recording:text,schema}),code('REPLAY_INCOMPATIBLE'));
  assert.throws(()=>createReplay({recording:text}),code('RECORDING_INCOMPATIBLE'));
  assert.throws(()=>createReplay({recording:{}}),code('RECORDING_INVALID'));
});
test('C.9 replay rejects incompatible tick role before any root runs',()=>{
  const text=record(app=>{app.resumeTicks();app.advanceTicks(10);app.pauseTicks();},{simulation:{tickDuration:10,action:'increment'}});
  assert.throws(()=>fixture({recording:text,config:{simulation:{tickDuration:10,action:'noOp'}}}),code('REPLAY_INCOMPATIBLE'));
  verify(text);
});
test('C.9 failed tick replay consumes all root inputs and configured action, preserving successful siblings',()=>{
  const text=record(app=>{app.enqueue('abort');app.enqueue('parent');app.resumeTicks();assert.throws(()=>app.advanceTicks(20));app.pauseTicks();},
    {simulation:{tickDuration:10,action:'increment'}});verify(text);
});
test('C.9 replay ignores input admission sequence gaps and future unconsumed queue tickets',()=>{
  const text=record(app=>{app.enqueue('increment').cancel();app.enqueueAt(3,'parent');app.inputs.send('external','external',{width:500});
    app.resumeTicks();app.advanceTicks(10);app.pauseTicks();},{simulation:{tickDuration:10}});verify(text);
});
test('C.9 committed observer failures and input observer failures need not recur in replay',()=>{
  verify(record(app=>{app.observe(state=>state.n,()=>{throw Error('observer');});assert.throws(app.actions.increment); }));
  verify(record(app=>{app.observeInputs(()=>{throw Error('input observer');});assert.throws(()=>app.receiveInput(packet('increment'))); }));
});
test('C.9 recorded failed guard input is a valid replay root without an action admission',()=>{
  verify(record(app=>assert.throws(()=>app.receiveInput(packet('child',3)),code('PAYLOAD_INVALID'))));
});
test('C.9 replay restores routes headlessly and suppresses live History/storage hydration and writes',()=>{
  const source=fakeBrowser(),router={base:'/app',routes:[]},persistence={namespace:'recorded',fields:{time:{location:'url',validate:v=>typeof v==='number'}}};
  const text=record(app=>{app.actions.navigate();app.actions.increment();app.navigate('/other');source.view.history.back();},
    {target:source.target,router,persistence,view:()=>div('source')});
  const target=fakeBrowser('https://different.test/ambient?q=900');let ambient=0;
  for(const key of ['location','history','sessionStorage','localStorage'])Object.defineProperty(target.view,key,{get(){ambient++;throw Error('ambient '+key);}});
  const {app,controller}=fixture({recording:text,config:{router,persistence,view:({bind})=>div(bind.n)}});
  const baseline=readRecording(text).baseline;assert.equal(app.route.url,baseline.route.url);app.mount(target.target);
  assert.equal(controller.run().status,'complete');app.flush();assert.equal(target.target.textContent,'1');assert.equal(ambient,0);
  controller.dispose();assert.equal(ambient,0);assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));
});
test('C.9 source URL default hydration and state URL projection execute only recorded children',()=>{
  const browser=fakeBrowser(),router={base:'/app',routes:[]},persistence={namespace:'replay-url',fields:{time:{location:'url',validate:v=>typeof v==='number'}}};
  const text=record(app=>{app.setLogicalTime(50);app.actions.increment();app.navigate('/next');app.actions.increment();},
    {target:browser.target,router,persistence,view:()=>div('source')});verify(text,{router,persistence});
});
test('C.9 native History failure without derived location remains a no-location replay root',()=>{
  const browser=fakeBrowser(),router={base:'/app',routes:[]};
  const text=record(app=>{browser.view.history.pushState=()=>{throw Error('native history');};assert.throws(app.actions.navigate);},
    {target:browser.target,router,view:()=>div('source')});verify(text,{router});
});
test('C.9 supplied hydration replays without storage and preserves shared field aliases',()=>{
  const persistence={namespace:'recorded',fields:{payload:{location:'local',validate:()=>true},external:{location:'local',validate:()=>true}}};
  const text=record(app=>{const value={n:1};app.receiveInput({version:1,kind:'hydration',namespace:'recorded',schemaVersion:'replay/1',
    groups:[{location:'local',values:{payload:value,external:value}}]});},{persistence});verify(text,{persistence});
  assert.throws(()=>fixture({recording:text}),code('REPLAY_INCOMPATIBLE'));
});
test('C.9 replay suppresses readers/effects/timers/scheduling and consumes only recorded result packets',async()=>{
  let reads=0,effects=0,scheduled=0;
  const browser=fakeBrowser(),{app}=fixture({config:{target:browser.target,view:()=>div('source')}});app.startRecording();
  app.inputs.sample('sample','external',()=>{reads++;return 42;});
  await app.inputs.effect('effect','external',()=>{effects++;return 99;}).done;
  const timer=app.inputs.timer('timer','external',5,'timer');await new Promise(resolve=>setImmediate(resolve));browser.turn(5);await timer.done;
  app.schedule('immediate',()=>scheduled++);const text=app.exportRecording();app.dispose();assert.deepEqual([reads,effects,scheduled],[1,1,1]);
  reads=effects=scheduled=0;
  const target=fakeBrowser(),replay=fixture({recording:text,config:{view:({inputs,bind})=>{
    inputs.effect('effect','external',()=>{effects++;return 999;});inputs.timer('timer','external',5,'changed');return div(bind.n);
  }}});replay.app.mount(target.target);replay.app.schedule('immediate',()=>scheduled++);
  assert.equal(replay.controller.run().status,'complete');assert.deepEqual([reads,effects,scheduled],[0,0,0]);assert.equal(target.timers.size,0);
  const inert=replay.app.inputs.sample('extra','external',()=>{reads++;return 5;});assert.equal(inert.sequence,0);assert.equal(inert.input.status,'cancelled');
  assert.equal(await replay.app.inputs.effect('extra','external',()=>{effects++;}).done,null);assert.equal(reads+effects,0);replay.controller.dispose();
});
test('C.9 controller exclusively owns state transitions, recording, input admission and tick drivers',()=>{
  const text=record(app=>app.actions.increment()),{app,controller}=fixture({recording:text});assert.equal(app.replaying,true);
  for(const operation of [()=>app.actions.increment(),()=>app.receiveInput(packet('increment')),()=>app.enqueue('increment'),
    ()=>app.setLogicalTime(9),()=>app.advanceTicks(10),()=>app.resumeTicks(),()=>app.pauseTicks(),()=>app.startRecording(),
    ()=>app.stopRecording(),()=>app.clearRecording(),()=>app.exportRecording()])assert.throws(operation,code('REPLAY_READONLY'));
  assert.equal(controller.run().status,'complete');controller.dispose();assert.throws(()=>controller.run(),code('REPLAY_DISPOSED'));controller.dispose();
});
test('C.9 controller rejects reentrant stepping/disposal and validates bounded step counts',()=>{
  // Source counterpart has a no-op body with the same transaction/state outcome.
  const schema=createActionSchema({version:'replay/1'})(({action})=>({reenter:action(draft=>{draft.n++;})}));
  const source=createApp({schema,initialState:{n:0,draws:[],order:[],time:0,payload:null,external:null},controls:{seed:7}});
  source.startRecording();source.actions.reenter();const text=source.exportRecording();source.dispose();
  const {controller}=fixture({recording:text});for(const count of [0,-1,1.5,1025,NaN,'1'])assert.throws(()=>controller.step(count),code('REPLAY_INVALID'));
  assert.equal(controller.run().status,'complete');controller.dispose();
});
test('C.9 empty recording is already complete and direct app disposal releases the controller',()=>{
  const text=record(()=>{}),{app,controller}=fixture({recording:text});assert.equal(controller.status.status,'complete');assert.equal(controller.run().position,0);
  app.dispose();assert.equal(controller.status.status,'disposed');assert.throws(()=>controller.step(),code('REPLAY_DISPOSED'));assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));
});
for(const mode of ['recent','session'])test(`C.10 retained ${mode} windows restore their own baseline and captured end`,()=>{
  const text=record(app=>{for(let i=0;i<30;i++){app.actions.increment();app.actions.parent();}}, {}, {mode,maxActions:10,keyframeInterval:3,maxBytes:25000});
  const log=verify(text);if(mode==='recent')assert.ok(log.baseline.sequence>0);else assert.equal(log.status,'limit-reached');
});
for(const seed of [1,7,42,999])test(`C.10 randomized alias/array operations replay every hash, seed ${seed}`,()=>{
  let random=seed;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
  const schema=createActionSchema({version:'collections/1'})(({action})=>({edit:action(v=>typeof v==='number',(draft,value,services)=>{
    const rows=draft.rows;
    if(value%4===0)rows.push({id:rows.length,value:services.random()});
    else if(value%4===1)rows.reverse();else if(value%4===2&&rows.length)rows.splice(value%rows.length,1);
    else if(rows.length)rows[value%rows.length].value=services.random();
    draft.selected=rows[0]??null;
  })}));
  const source=createApp({schema,initialState:{rows:[],selected:null},controls:{seed}});source.startRecording({maxActions:17,keyframeInterval:4,maxBytes:32000});
  for(let i=0;i<90;i++){source.actions.edit(next());if(i%3===0)source.flush();}
  const text=source.exportRecording();source.dispose();const log=readRecording(text),replay=createReplay({recording:text,schema});
  for(const record of log.records){assert.equal(replay.step().divergence,null);assert.equal(hash(replay.app.snapshot()),record.after.hash);replay.app.flush();}
  assert.equal(replay.app.snapshot(),log.end.snapshot);replay.dispose();
});
test('C.10 different fixed/render schedules yield identical recorded checkpoints and replay results',()=>{
  const logs=[];
  for(const schedule of [[10,10,10,10],[5,15,3,17],[40]]) {
    const text=record(app=>{app.enqueueAt(2,'parent');app.resumeTicks();for(const delta of schedule){app.advanceTicks(delta);app.flush();}app.pauseTicks();},
      {simulation:{tickDuration:10,action:'increment'}});logs.push(verify(text));
  }
  assert.deepEqual(logs[0],logs[1]);assert.deepEqual(logs[1],logs[2]);
});
test('C.9 replay native handlers are inert and normal mounted view bindings update under stepping',()=>{
  const text=record(app=>app.actions.increment()),browser=fakeBrowser();let clicks=0;
  const {app,controller}=fixture({recording:text,config:{view:({bind})=>button({onClick:()=>clicks++},bind.n)}});app.mount(browser.target);
  browser.target.childNodes.find(node=>node.nodeType===1).dispatchEvent({type:'click'});assert.equal(clicks,0);controller.step();app.flush();assert.equal(browser.target.textContent,'1');controller.dispose();
});

test('C.9 absolute same-origin body navigation uses recorded local URLs without sampling a replay host origin',()=>{
  for(const mode of ['history','hash']) {
    let app;const browser=fakeBrowser(),router={mode,base:'/app',routes:[]};
    const destination=mode==='history'?'https://example.test/app/absolute':'https://example.test/app/#/absolute';
    const schema=createActionSchema()(({action})=>({go:action(()=>app.navigate(destination)),
      denied:action(()=>app.navigate('https://external.test/forbidden'))}));
    app=createApp({target:browser.target,schema,router,view:()=>div('route')});app.startRecording();app.actions.go();assert.throws(app.actions.denied);
    const text=app.exportRecording();app.dispose();const replay=createReplay({recording:text,schema,router});app=replay.app;
    assert.equal(replay.run().status,'complete');assert.equal(app.route.path,'/absolute');replay.dispose();
  }
});
test('C.9 changed nested dispatch ordering stops at its first trace mismatch even when final state could match',()=>{
  let app;const sourceSchema=createActionSchema()(({action})=>({parent:action(()=>{app.actions.child(1);app.actions.child(2);}),
    child:action(v=>typeof v==='number',(d,v)=>{d.total+=v;})}));
  app=createApp({schema:sourceSchema,initialState:{total:0}});app.startRecording();app.actions.parent();const text=app.exportRecording();app.dispose();
  const changed=createActionSchema()(({action})=>({parent:action(()=>{app.actions.child(2);app.actions.child(1);}),
    child:action(v=>typeof v==='number',(d,v)=>{d.total+=v;})}));
  const replay=createReplay({recording:text,schema:changed});app=replay.app;const result=replay.run();
  assert.equal(result.divergence.reason,'trace');assert.equal(result.divergence.eventIndex,2);assert.equal(result.divergence.actualHash,hash(app.snapshot()));replay.dispose();
});

test('C.9 mounting cannot dispatch and stepping cannot reenter reactive notification work',()=>{
  const text=record(app=>app.actions.increment()),browser=fakeBrowser();let controller;
  const replay=fixture({recording:text,config:{view:({actions,bind})=>{
    assert.throws(actions.increment,code('REPLAY_READONLY'));return div(bind.n);
  }}});controller=replay.controller;replay.app.mount(browser.target);
  replay.app.observe(state=>state.n,()=>assert.throws(()=>controller.step(),code('REPLAY_REENTRANT')));
  assert.equal(controller.run().status,'complete');controller.dispose();
});
test('C.9 options reject accessors/unknown fields without invoking views or getters',()=>{
  const text=record(()=>{});let reads=0;
  assert.throws(()=>createReplay({recording:text,get view(){reads++;return ()=>div();}}),code('REPLAY_INVALID'));
  assert.throws(()=>createReplay({recording:text,target:{}}),code('REPLAY_INVALID'));assert.equal(reads,0);
});
