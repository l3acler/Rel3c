import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, span, input, when, keyed, hashSnapshot } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code=name=>error=>error.code===name;
const schema=createActionSchema()(({action})=>({
  tick:action(draft=>{draft.x+=10;}), jump:action(draft=>{draft.x=100;}),
  fail:action(draft=>{draft.x=-100;throw Error('failure');}),
}));
const make=(options={})=>createApp({schema,initialState:{x:0,text:'stable'},simulation:{tickDuration:10000,action:'tick',maxCatchUp:2},...options});
const smooth=({previous,current,alpha})=>previous.x+(current.x-previous.x)*alpha;

test('C.6 fractional elapsed changes only opted-in bindings and preserves versions/hash/forms',()=>{
  const browser=fakeBrowser();let frames=[],ordinary=0;
  const app=make({target:browser.target,view:({interpolate,derive,bind})=>div(
    span(interpolate(frame=>{frames.push(frame);return smooth(frame);})),
    span(derive(state=>{ordinary++;return state.x;})),input({value:bind.text})
  )});
  app.resumeTicks();app.advanceTicks(10000);app.flush();assert.equal(browser.target.childNodes[0].childNodes[0].textContent,'0');
  const hash=hashSnapshot(app.snapshot()),version=app.stateVersion,reads=ordinary;
  app.advanceTicks(5000);app.flush();const nodes=browser.target.childNodes[0].childNodes;
  assert.equal(nodes[0].textContent,'5');assert.equal(nodes[1].textContent,'10');assert.equal(nodes[2].value,'stable');
  assert.equal(ordinary,reads);assert.equal(app.stateVersion,version);assert.equal(hashSnapshot(app.snapshot()),hash);
  const frame=frames.at(-1);assert.ok(Object.isFrozen(frame)&&Object.isFrozen(frame.previous)&&Object.isFrozen(frame.current));
  assert.equal(frame.previous.x,0);assert.equal(frame.current.x,10);assert.equal(frame.alpha,.5);app.dispose();
});

test('C.6 pause, resume, hidden state and overload clamp alpha without extrapolation',()=>{
  const browser=fakeBrowser();let frame;
  const app=make({target:browser.target,view:({interpolate})=>interpolate(value=>{frame=value;return smooth(value);})});
  app.resumeTicks();app.advanceTicks(100000);app.flush();assert.equal(frame.alpha,1);assert.equal(frame.current.x,20);
  app.advanceTicks(0);app.advanceTicks(0);app.advanceTicks(0);app.advanceTicks(0);app.advanceTicks(5000);app.flush();
  assert.equal(frame.alpha,.5);app.pauseTicks();app.flush();assert.equal(frame.alpha,1);
  app.resumeTicks();app.flush();assert.equal(frame.alpha,.5);
  browser.document.visibilityState='hidden';browser.document.dispatchEvent({type:'visibilitychange'});app.flush();assert.equal(frame.alpha,1);
  browser.document.visibilityState='visible';browser.document.dispatchEvent({type:'visibilitychange'});app.flush();assert.equal(frame.alpha,.5);app.dispose();
});

test('C.6 successful tick prefixes and direct commits reset the display window predictably',()=>{
  const browser=fakeBrowser();let frame;
  const app=make({target:browser.target,view:({interpolate})=>interpolate(value=>{frame=value;return smooth(value);})});
  app.resumeTicks();app.advanceTicks(15000);app.flush();assert.equal(smooth(frame),5);
  app.actions.jump();app.flush();assert.equal(frame.previous.x,100);assert.equal(frame.current.x,100);
  app.enqueue('fail');assert.throws(()=>app.advanceTicks(5000),/failure/);app.flush();
  assert.equal(frame.previous.x,100);assert.equal(frame.current.x,110);assert.equal(frame.alpha,1);app.dispose();
});

test('C.6 interpolation cannot mutate snapshots, enter runtime actions, or return async values',()=>{
  const browser=fakeBrowser();let app,shouldFail=false;
  app=make({view:({interpolate})=>interpolate(frame=>{
    if(shouldFail){assert.throws(()=>{frame.current.x=8;},TypeError);assert.throws(app.actions.jump,code('ACTION_REENTRANT'));
      assert.throws(()=>app.receiveInput({version:1,kind:'action',name:'jump',args:[]}),code('INPUT_REENTRANT'));}
    return smooth(frame);
  })});app.mount(browser.target);shouldFail=true;app.resumeTicks();app.advanceTicks(15000);app.flush();assert.equal(app.state.x,10);app.dispose();
  const asynchronous=make({view:({interpolate})=>interpolate(async()=>1)});
  assert.throws(()=>asynchronous.mount(fakeBrowser().target),code('REACTIVITY_ASYNC'));asynchronous.dispose();
});

test('C.6 structural interpolation is rejected before a timed display can create or dispose effects',()=>{
  for(const view of [({interpolate})=>when(interpolate(()=>true),()=>div()),
    ({interpolate})=>keyed(interpolate(()=>[]),value=>value.id,()=>div())]){
    const app=make({view});assert.throws(()=>app.mount(fakeBrowser().target),code('INTERPOLATION_STRUCTURAL'));app.dispose();
  }
  const manual=createApp();assert.throws(()=>manual.interpolate(()=>0),code('INTERPOLATION_MODE'));manual.dispose();
});

test('C.6 restored apps begin with equal display roots while tick continuation still matches',()=>{
  const app=make();app.resumeTicks();app.advanceTicks(20000);const text=app.snapshot();
  const browser=fakeBrowser();let frame;
  const fork=createApp({schema,snapshot:text,simulation:{tickDuration:10000,action:'tick'},target:browser.target,
    view:({interpolate})=>interpolate(value=>{frame=value;return smooth(value);})});
  assert.equal(frame.previous,frame.current);assert.equal(frame.current.x,20);assert.equal(frame.alpha,1);
  app.advanceTicks(10000);fork.resumeTicks();fork.advanceTicks(10000);fork.pauseTicks();app.pauseTicks();
  assert.equal(app.snapshot(),fork.snapshot());app.dispose();fork.dispose();
});

test('C.6 frame-rate display differences preserve corresponding authoritative checkpoints',()=>{
  const outcomes=[];
  for(const remainder of [1000,5000,9000]){
    const browser=fakeBrowser();const app=make({target:browser.target,view:({interpolate})=>interpolate(smooth)});
    app.resumeTicks();app.advanceTicks(10000+remainder);app.flush();outcomes.push([app.snapshot(),browser.target.textContent]);app.dispose();
  }
  assert.equal(outcomes[0][0],outcomes[1][0]);assert.equal(outcomes[1][0],outcomes[2][0]);
  assert.deepEqual(outcomes.map(row=>row[1]),['1','5','9']);
});

test('C.6 scoped interpolation tokens and queued bindings expire and resource counts return to zero',()=>{
  const browser=fakeBrowser();let scoped;
  const family=createActionSchema()(({action})=>({hide:action(draft=>{draft.show=false;})}));
  const app=createApp({target:browser.target,schema:family,initialState:{show:true},simulation:{tickDuration:1},
    view:({bind})=>when(bind.show,context=>{scoped=context;return context.interpolate(frame=>frame.alpha);})});
  app.resumeTicks();app.advanceTicks(1);app.actions.hide();app.flush();
  assert.throws(()=>scoped.interpolate(()=>1),code('SCOPE_DISPOSED'));app.dispose();
  assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));assert.equal(browser.document.pendingFrames,0);
});

test('C.6 previous/current roots preserve historical aliases and array reorder meaning',()=>{
  const browser=fakeBrowser(),shared={n:1};let frame;
  const family=createActionSchema()(({action})=>({tick:action(draft=>{draft.a.n++;draft.rows.reverse();})}));
  const app=createApp({target:browser.target,schema:family,initialState:{a:shared,b:shared,rows:[shared,{n:2}]},
    simulation:{tickDuration:1,action:'tick'},view:({interpolate})=>interpolate(value=>{frame=value;return value.current.a.n;})});
  app.resumeTicks();app.advanceTicks(1);app.pauseTicks();app.flush();
  assert.equal(frame.previous.a,frame.previous.b);assert.equal(frame.previous.rows[0],frame.previous.a);
  assert.equal(frame.current.a,frame.current.b);assert.equal(frame.current.rows[1],frame.current.a);
  assert.equal(frame.previous.a.n,1);assert.equal(frame.current.a.n,2);assert.notEqual(frame.previous.a,frame.current.a);app.dispose();
});
