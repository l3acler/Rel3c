import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div } from '../src/index.js';
import { createHash } from 'node:crypto';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code = name => error => error.code === name;
const schema = createActionSchema({ version: 'ticks/1' })(({ action }) => ({
  tick: action((draft, services) => { draft.log.push(['tick', services.now(), services.random()]); }),
  input: action(value => typeof value === 'number', (draft, value, services) => { draft.log.push([value, services.now()]); }),
  fail: action((draft, services) => { draft.log.push('bad'); services.random(); throw Error('failed input'); }),
}));
const make = (options = {}) => createApp({ initialState: { log: [] }, schema,
  simulation: { tickDuration: 10000, action: 'tick', maxCatchUp: 4 }, ...options });

test('C.3 inputs run in FIFO order before tick logic and paused sampling leaves state unchanged', () => {
  const app = make(); app.enqueueAt(2, 'input', 2); app.enqueue('input', 1); app.enqueueAt(2, 'input', 3);
  assert.throws(() => app.snapshot(), code('SNAPSHOT_PENDING'));
  assert.equal(app.advanceTicks(10000), 0); assert.equal(app.controls.clock.tick, 0);
  app.resumeTicks(); assert.equal(app.advanceTicks(20000), 2);
  assert.deepEqual(app.state.log.map(row => row.slice(0,2)), [[1,10000],['tick',10000],[2,20000],[3,20000],['tick',20000]]);
  assert.equal(app.stateVersion, 6); assert.equal(app.ticks.queuedInputs, 0); app.dispose();
});

test('C.3 retained queue payloads preserve aliases and aggregate budgets reclaim capacity on cancel',()=>{
  const family=createActionSchema()(({action})=>({input:action(()=>true,(draft,value)=>{draft.value=value;})}));
  const app=createApp({schema:family,initialState:{value:null},simulation:{tickDuration:1}});
  const node={n:1},ticket=app.enqueue('input',{a:node,b:node});node.n=2;
  app.resumeTicks();app.advanceTicks(1);assert.equal(app.state.value.a.n,1);assert.equal(app.state.value.a,app.state.value.b);
  ticket.cancel();const tickets=[];for(let i=0;i<1000;i++)tickets.push(app.enqueue('input','x'.repeat(1000)));
  assert.throws(()=>app.enqueue('input','x'),code('PAYLOAD_LIMIT'));tickets[0].cancel();app.enqueue('input','x'.repeat(1000));app.dispose();
});

test('C.3 automatic driver errors report once and pause without retrying a failed tick',()=>{
  const browser=fakeBrowser(),phases=[];
  const app=make({target:browser.target,onError:(error,info)=>{phases.push(info.phase);}});
  app.enqueue('fail');app.resumeTicks();browser.document.flushFrame(0);
  assert.throws(()=>browser.document.flushFrame(10),/failed input/);
  assert.deepEqual(phases,['control']);assert.equal(app.ticks.paused,true);assert.equal(app.controls.clock.tick,1);
  assert.equal(resourceCounts(app).tickFrames,0);assert.equal(app.controls.random.draws,1);app.dispose();
});

test('C.3 overload retains numbered ticks and drains the accumulator within each bounded advance', () => {
  const app = make(); app.resumeTicks();
  assert.equal(app.advanceTicks(100000), 4); assert.equal(app.controls.clock.tick, 4); assert.equal(app.ticks.accumulator, 60000);
  assert.equal(app.advanceTicks(0), 4); assert.equal(app.advanceTicks(0), 2);
  assert.deepEqual(app.state.log.map(row => row[1]), Array.from({length:10},(_,i)=>(i+1)*10000));
  app.pauseTicks(); app.advanceTicks(900000); assert.equal(app.ticks.accumulator,0);
  app.resumeTicks(); app.advanceTicks(9000); app.pauseTicks(); app.resumeTicks(); app.advanceTicks(1000);
  assert.equal(app.controls.clock.tick,11); app.dispose();
});

test('C.3 fake 30/60/120 Hz and irregular elapsed schedules match every corresponding tick hash', () => {
  const outcomes = [];
  for (const schedule of [Array(30).fill(1e6/30),Array(60).fill(1e6/60),Array(120).fill(1e6/120),[1,300000,4,450000,249995]]) {
    const checkpoints=[]; let app;
    const family = createActionSchema({version:'schedule/1'})(({action})=>({
      tick:action((draft,services)=>{draft.position+=draft.speed; draft.time=services.now(); draft.draw=services.random();}),
      speed:action(value=>typeof value==='number',(draft,value)=>{draft.speed=value;}),
    }));
    app=createApp({schema:family,initialState:{position:0,speed:1,time:0,draw:0},controls:{seed:97},
      simulation:{tickDuration:10000,action:'tick',maxCatchUp:1}});
    app.enqueueAt(5,'speed',3); app.enqueueAt(70,'speed',-2); app.resumeTicks();
    let previous=0, absolute=0;
    for(const delta of schedule){ absolute+=delta;const endpoint=Math.round(absolute);
      const consumed=app.advanceTicks(endpoint-previous);previous=endpoint;
      if(consumed)checkpoints.push(JSON.stringify({ state:app.state, controls:app.controls, version:app.stateVersion }));
      while(app.ticks.accumulator>=10000){app.advanceTicks(0);checkpoints.push(JSON.stringify({ state:app.state, controls:app.controls, version:app.stateVersion }));}
    }
    assert.equal(app.controls.clock.tick,100); outcomes.push(checkpoints.map(value=>createHash('sha256').update(value).digest('hex')));app.dispose();
  }
  for(const result of outcomes.slice(1))assert.deepEqual(result,outcomes[0]);
});

test('C.3 nested FIFO and failed roots preserve healthy input commits, draws and consumed tick', () => {
  let app; const order=[];
  const family=createActionSchema()(({action})=>({
    root:action(()=>{order.push('root');app.actions.child();app.actions.sibling();}),
    child:action(()=>{order.push('child');app.actions.grandchild();}),
    sibling:action(()=>{order.push('sibling');}), grandchild:action(()=>{order.push('grandchild');}),
    fail:action((draft,services)=>{services.random();throw Error('fail');}),
    tick:action((draft,services)=>{order.push('tick');draft.n=services.random();}),
  }));
  app=createApp({initialState:{n:0},schema:family,simulation:{tickDuration:10,action:'tick'}});
  app.enqueue('root'); app.enqueue('fail'); app.resumeTicks();
  assert.throws(()=>app.advanceTicks(30),/fail/);
  assert.deepEqual(order,['root','child','sibling','grandchild','tick']); assert.equal(app.controls.clock.tick,1);
  assert.equal(app.stateVersion,6); assert.equal(app.controls.random.draws,1); assert.equal(app.ticks.accumulator,20);
  assert.equal(app.ticks.paused,true);app.resumeTicks();app.advanceTicks(0);assert.equal(app.controls.clock.tick,3);app.dispose();
});

test('C.3 guards are deferred to tick execution; rejection continues siblings and pauses',()=>{
  const app=make();app.enqueue('input','invalid');app.enqueue('input',7);app.resumeTicks();
  assert.throws(()=>app.advanceTicks(10000),code('PAYLOAD_INVALID'));assert.equal(app.state.log[0][0],7);
  assert.equal(app.ticks.paused,true);assert.equal(app.controls.clock.tick,1);app.dispose();
});

test('C.3 queue bounds, cancellation, safe tick assignment and overflow preserve remaining work',()=>{
  const app=make();const tickets=[];
  for(let i=0;i<1024;i++)tickets.push(app.enqueue('input',i));
  assert.throws(()=>app.enqueue('input',0),code('INPUT_LIMIT'));tickets[0].cancel();app.enqueue('input',0);
  for(const ticket of tickets)ticket.cancel();app.resumeTicks();app.advanceTicks(10000);app.snapshot();
  for(const tick of [0,-0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>app.enqueueAt(tick,'input',0),code('TICK_INVALID'));
  assert.throws(()=>app.enqueue('missing'),code('ACTION_UNKNOWN'));assert.throws(()=>app.enqueue('tick',1),code('ACTION_ARITY'));
  assert.throws(()=>app.setLogicalTime(1),code('CONTROL_MODE'));app.dispose();
  const overflow=make({controls:{time:Number.MAX_SAFE_INTEGER}});overflow.resumeTicks();
  assert.throws(()=>overflow.advanceTicks(10000),code('CONTROL_LIMIT'));assert.equal(overflow.controls.clock.tick,0);assert.equal(overflow.ticks.accumulator,10000);overflow.dispose();
});

test('C.3 fixed checkpoint restores exact continuation, requires matching duration and resets driver metadata',()=>{
  const app=make();app.resumeTicks();app.advanceTicks(25000);const text=app.snapshot();
  assert.throws(()=>createApp({schema,snapshot:text}),code('SNAPSHOT_CONFLICT'));
  assert.throws(()=>createApp({schema,snapshot:text,simulation:{tickDuration:1}}),code('SNAPSHOT_CONFLICT'));
  const fork=createApp({schema,snapshot:text,simulation:{tickDuration:10000,action:'tick'}});
  assert.equal(fork.snapshot(),text);assert.equal(fork.ticks.accumulator,0);assert.equal(fork.ticks.paused,true);
  app.pauseTicks();fork.resumeTicks();app.resumeTicks();app.advanceTicks(5000);fork.advanceTicks(10000);
  assert.equal(app.snapshot(),fork.snapshot());app.dispose();fork.dispose();
  const manual=createApp();assert.throws(()=>createApp({snapshot:manual.snapshot(),simulation:{tickDuration:1}}),code('SNAPSHOT_CONFLICT'));manual.dispose();
});

test('C.3 real driver sampling, hidden/resume epochs and complete disposal use independent DOM frames',()=>{
  const browser=fakeBrowser(),app=make({target:browser.target,view:({derive})=>div(derive(state=>state.log.length))});
  app.resumeTicks();browser.document.flushFrame(100);browser.document.flushFrame(135);
  assert.equal(app.controls.clock.tick,3);assert.equal(app.ticks.accumulator,5000);
  browser.document.visibilityState='hidden';browser.document.dispatchEvent({type:'visibilitychange'});
  assert.equal(resourceCounts(app).tickFrames,0);
  browser.document.visibilityState='visible';browser.document.dispatchEvent({type:'visibilitychange'});
  browser.document.flushFrame(10000);assert.equal(app.controls.clock.tick,3);
  browser.document.flushFrame(10005);assert.equal(app.controls.clock.tick,4);app.pauseTicks();
  app.flush();assert.equal(browser.target.textContent,'4');app.dispose();
  assert.ok(Object.values(resourceCounts(app)).every(value=>value===0));assert.equal(browser.document.pendingFrames,0);
});

test('C.3 active callbacks cannot drive ticks, enqueue, cancel or snapshot mid-tick',()=>{
  let app,ticket;
  const family=createActionSchema()(({action})=>({tick:action(()=>{
    assert.throws(()=>app.enqueue('tick'),code('INPUT_REENTRANT'));
    assert.throws(()=>app.advanceTicks(0),code('CONTROL_REENTRANT'));
    assert.throws(()=>app.snapshot(),code('SNAPSHOT_REENTRANT'));
    assert.throws(ticket.cancel,code('INPUT_REENTRANT'));
  })}));
  app=createApp({schema:family,simulation:{tickDuration:1,action:'tick'}});ticket=app.enqueue('tick');app.resumeTicks();app.advanceTicks(1);app.dispose();
});

test('C.3 failed native frame cancellation still removes visibility ownership and queued inputs',()=>{
  const browser=fakeBrowser(),app=make({target:browser.target});app.enqueue('input',1);app.resumeTicks();
  browser.view.cancelAnimationFrame=()=>{throw Error('cancel');};
  assert.throws(app.dispose,AggregateError);assert.equal(app.status,'disposed');
  assert.ok(Object.values(resourceCounts(app)).every(value=>value===0));
  browser.document.dispatchEvent({type:'visibilitychange'}); // Removed handler cannot schedule new work.
  assert.doesNotThrow(()=>browser.document.flushFrame(100)); // A host callback that could not cancel stays inert.
});

for(const simulation of [null,{}, {tickDuration:0},{tickDuration:-0},{tickDuration:-1},{tickDuration:1.5},
  {tickDuration:1,maxCatchUp:0},{tickDuration:1,maxCatchUp:1025},{tickDuration:1,action:'input'},
  {tickDuration:1,action:'missing'},{tickDuration:1,unknown:1}])test('C.3 invalid simulation '+JSON.stringify(simulation),()=>{
  assert.throws(()=>make({simulation}),code('TICK_INVALID'));
});

test('C.3 absent simulation and invalid elapsed values reject with no publication',()=>{
  const manual=createApp();for(const fn of [()=>manual.enqueue('missing'),()=>manual.advanceTicks(0),manual.resumeTicks,manual.pauseTicks])assert.throws(fn);
  manual.dispose();const app=make();app.resumeTicks();const before=app.snapshot();
  for(const elapsed of [-1,-0,0.5,NaN,Infinity,null])assert.throws(()=>app.advanceTicks(elapsed),code('TICK_INVALID'));
  assert.equal(app.snapshot(),before);app.dispose();
});
