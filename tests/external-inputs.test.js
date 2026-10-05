import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, when } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const schema = createActionSchema()(({action})=>({
  external:action(value=>value?.version===1 && ['success','error','cancelled'].includes(value.status),
    (draft,value)=>{draft.results.push(value);}),
  hide:action(draft=>{draft.visible=false;}),
  reject:action(()=>false,()=>{}),
  fail:action(()=>true,()=>{throw Error('body');}),
  none:action(()=>{}),
}));
const make=(options={})=>createApp({schema,initialState:{results:[],visible:true},...options});
const turn=()=>new Promise(resolve=>queueMicrotask(resolve));

test('C.4 external inputs are owned frozen versioned envelopes with origin and admission receipts',()=>{
  const app=make(),node={n:1},value={a:node,b:node};
  const receipt=app.inputs.send('pointer','external',value);node.n=9;
  assert.equal(receipt.sequence,1);assert.equal(receipt.tick,0);assert.equal(receipt.time,0);
  assert.equal(receipt.input.value.a,receipt.input.value.b);assert.equal(app.state.results[0].value.a.n,1);
  assert.ok(Object.isFrozen(receipt.input.value.a));assert.equal(app.stateVersion,2);
  app.setLogicalTime(15);const next=app.inputs.sample('layout','external',()=>({width:123}));
  assert.equal(next.sequence,2);assert.equal(next.time,15);assert.equal(app.state.results[1].value.width,123);
  app.dispose();
});

test('C.4 measurements and storage normalize values, errors and missing values outside actions',()=>{
  const browser=fakeBrowser();Object.assign(browser.view,{innerWidth:800,innerHeight:600,devicePixelRatio:2,scrollX:1,scrollY:2});
  const app=make({target:browser.target});
  app.inputs.measure('window','external','viewport');
  app.inputs.measure('window','external','scroll');
  app.inputs.measure('panel','external','scroll',{scrollLeft:4,scrollTop:8});
  app.inputs.measure('panel','external','layout',{getBoundingClientRect:()=>({x:1,y:2,width:3,height:4,top:2,right:4,bottom:6,left:1})});
  app.inputs.storage('settings','external',browser.view.localStorage,'missing');
  app.inputs.storage('settings','external',{getItem:()=>{throw new DOMException('denied','SecurityError');}},'key');
  assert.deepEqual(app.state.results.slice(0,3).map(input=>input.value),[{width:800,height:600,scale:2},{x:1,y:2},{x:4,y:8}]);
  assert.equal(app.state.results[3].value.bottom,6);assert.deepEqual(app.state.results[4].value,{key:'missing',value:null});
  assert.deepEqual(app.state.results[5].error,{name:'SecurityError',message:'denied'});app.dispose();
});

test('C.4 failed samplers emit plain errors, async samplers and unsupported returned data reject',()=>{
  const app=make();app.inputs.sample('bad','external',()=>{throw Error('reader');});
  assert.equal(app.state.results[0].status,'error');assert.equal(app.state.results[0].value,null);
  assert.throws(()=>app.inputs.sample('async','external',async()=>1),code('INPUT_ASYNC'));
  for(const value of [new Date(),()=>1,Symbol(),Infinity])assert.throws(()=>app.inputs.send('bad','external',value),code('PAYLOAD_INVALID'));
  assert.equal(app.state.results.length,1);app.dispose();
});

test('C.4 inputs cannot enter from an action, reader, observer or invalid action registration',()=>{
  const app=make();assert.throws(()=>app.inputs.send('x','none',1),code('INPUT_INVALID'));
  for(const origin of ['',null,'x'.repeat(129)])assert.throws(()=>app.inputs.send(origin,'external',1),code('INPUT_INVALID'));
  const receipt=app.inputs.sample('nested','external',()=>{
    assert.throws(()=>app.inputs.send('nested','external',1),code('INPUT_REENTRANT'));
    assert.throws(()=>app.actions.none(),code('ACTION_REENTRANT'));
    assert.throws(app.dispose,code('LIFECYCLE_REENTRANT'));return 1;
  });assert.equal(receipt.input.value,1);
  assert.throws(()=>app.observe(()=>app.inputs.send('observe','external',1)),code('INPUT_REENTRANT'));
  app.dispose();
});

test('C.4 effect success/rejection ordering follows completion, cancellation wins once and late results are consumed',async()=>{
  const app=make();let firstResolve,secondReject,signal;
  const first=app.inputs.effect('one','external',value=>{signal=value;return new Promise(resolve=>{firstResolve=resolve;});});
  const second=app.inputs.effect('two','external',()=>new Promise((resolve,reject)=>{secondReject=reject;}));
  await turn();secondReject(Error('network'));await second.done;first.cancel();await first.done;
  assert.equal(signal.aborted,true);firstResolve(42);await turn();await turn();
  assert.deepEqual(app.state.results.map(input=>[input.origin,input.status]),[['two','error'],['one','cancelled']]);
  assert.equal(resourceCounts(app).externalEffects,0);app.dispose();
});

test('C.4 immediate effect cancellation prevents callback launch and app disposal suppresses late success/error',async()=>{
  const app=make();let runs=0;
  const canceled=app.inputs.effect('cancel','external',()=>{runs++;return 1;});canceled.cancel();
  assert.equal((await canceled.done).input.status,'cancelled');await turn();assert.equal(runs,0);
  let reject,signal;
  const pending=app.inputs.effect('later','external',value=>{signal=value;return new Promise((yes,no)=>{reject=no;});});
  await turn();assert.throws(app.snapshot,code('SNAPSHOT_PENDING'));app.dispose();
  assert.equal(await pending.done,null);assert.equal(signal.aborted,true);reject(Error('late'));await turn();
  assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));
});

test('C.4 scope disposal aborts effects and removes already queued results before their future tick',async()=>{
  const browser=fakeBrowser();let scoped,pending,signal;
  const app=make({target:browser.target,simulation:{tickDuration:10},view:({bind})=>when(bind.visible,context=>{
    scoped=context.inputs;pending=scoped.effect('route','external',value=>{signal=value;return new Promise(()=>{});});
    scoped.timer('clock','external',100);return div('visible');
  })});
  await turn();const queued=scoped.send('measurement','external',123);assert.equal(app.ticks.queuedInputs,1);
  app.actions.hide();app.flush();assert.equal(await pending.done,null);assert.equal(signal.aborted,true);
  assert.equal(app.ticks.queuedInputs,0);assert.equal(browser.timers.size,0);assert.equal(resourceCounts(app).externalEffects,0);
  assert.throws(()=>scoped.send('late','external',1),code('SCOPE_DISPOSED'));
  app.resumeTicks();app.advanceTicks(10);assert.equal(app.state.results.length,0);app.dispose();
});

test('C.4 fixed adapters queue at the next tick, own values, and scoped cancellation cannot mutate state',async()=>{
  const app=make({simulation:{tickDuration:10}}),value={n:1};
  const first=app.inputs.send('sample','external',value);value.n=2;
  const effect=app.inputs.effect('effect','external',()=>3);const result=await effect.done;
  assert.equal(first.tick,1);assert.equal(result.tick,1);assert.equal(first.time,10);
  assert.equal(app.stateVersion,1);assert.equal(app.ticks.queuedInputs,2);
  first.cancel();app.resumeTicks();app.advanceTicks(10);assert.equal(app.state.results.length,1);assert.equal(app.state.results[0].value,3);
  assert.equal(app.inputs.send('next','external',5).tick,2);app.dispose();
});

test('C.4 timer samples owned payloads and cancellation clears host timers',async()=>{
  const browser=fakeBrowser(),app=make({target:browser.target}),value={n:1};
  const timer=app.inputs.timer('timeout','external',20,value);value.n=2;await turn();assert.equal(browser.timers.size,1);
  browser.turn(20);const receipt=await timer.done;assert.equal(receipt.input.value.n,1);
  const second=app.inputs.timer('timeout','external',30);await turn();second.cancel();await second.done;
  assert.equal(browser.timers.size,0);assert.equal(app.state.results[1].status,'cancelled');app.dispose();
});

test('C.4 application delivery failures reject done without duplicating the terminal result',async()=>{
  const app=make();const reject=app.inputs.effect('bad','reject',()=>1);await assert.rejects(reject.done,code('PAYLOAD_INVALID'));
  const fail=app.inputs.effect('bad','fail',()=>1);await assert.rejects(fail.done,/body/);
  assert.equal(app.stateVersion,1);assert.equal(resourceCounts(app).externalEffects,0);app.dispose();
});

test('C.4 bounded pending effects recover capacity after cancellation and disposal',async()=>{
  const app=make(),tasks=[];
  for(let i=0;i<1024;i++)tasks.push(app.inputs.effect('bounded','external',()=>new Promise(()=>{})));
  assert.throws(()=>app.inputs.effect('overflow','external',()=>1),code('INPUT_LIMIT'));
  tasks[0].cancel();const extra=app.inputs.effect('recovered','external',()=>1);await extra.done;
  app.dispose();assert.equal(await tasks[1].done,null);assert.equal(resourceCounts(app).externalEffects,0);
});

test('C.4 manually injected saved external payloads match despite different live layout/network values',async()=>{
  const one=make({simulation:{tickDuration:10}}),two=make({simulation:{tickDuration:10}});
  let samples=0,requests=0;
  const measured=one.inputs.sample('viewport','external',()=>{samples++;return {width:800};});
  const resolved=await one.inputs.effect('network','external',async()=>{requests++;return {status:200,body:'original'};}).done;
  two.enqueue('external',measured.input);two.enqueue('external',resolved.input);
  for(const app of [one,two]){app.resumeTicks();app.advanceTicks(10);}
  assert.equal(one.snapshot(),two.snapshot());assert.equal(samples,1);assert.equal(requests,1);one.dispose();two.dispose();
});

test('C.4 unsupported effect values and pathological errors remain bounded and cannot retain native errors',async()=>{
  const app=make();await assert.rejects(app.inputs.effect('bad','external',()=>new Date()).done,code('PAYLOAD_INVALID'));
  const result=await app.inputs.effect('error','external',()=>{throw {get message(){throw Error('getter');}};}).done;
  assert.deepEqual(result.input.error,{name:'Error',message:'External operation failed.'});app.dispose();
});

test('C.4 failed mount closes effect scopes before microtasks can launch ambient work',async()=>{
  const browser=fakeBrowser();let task,runs=0;
  const app=make({view:context=>{task=context.inputs.effect('mount','external',()=>{runs++;return 1;});throw Error('view');}});
  assert.throws(()=>app.mount(browser.target),code('VIEW_FAILED'));assert.equal(await task.done,null);await turn();
  assert.equal(runs,0);assert.equal(resourceCounts(app).externalEffects,0);app.dispose();
});

test('C.4 scopes created on later render frames can register and deliver owned effects',async()=>{
  const browser=fakeBrowser();let task;
  const app=make({target:browser.target,view:({bind})=>when(bind.visible,()=>div('first'),context=>{
    task=context.inputs.effect('later-view','external',()=>5);return div('later');
  })});
  app.actions.hide();app.flush();await task.done;assert.equal(app.state.results[0].value,5);app.dispose();
});
