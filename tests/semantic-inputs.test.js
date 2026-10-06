import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createActionSchema, div, input } from '../src/index.js';
import { resourceCounts } from '../src/runtime/diagnostics.js';
import { encodeSnapshot } from '../src/runtime/persistence/codec.js';
import { fakeBrowser } from './helpers/fake-browser.js';
const code=name=>error=>error.code===name;
const schema=createActionSchema({version:'semantic/1'})(({action})=>({
  keyboard:action(value=>value?.version===1,(draft,packet)=>{draft.keys.push(packet.value);}),
  text:action(value=>value?.version===1,(draft,packet)=>{draft.text=packet.value.value;draft.edits.push(packet.value);}),
  increment:action(draft=>{draft.saved++;}),
}));
const initialState=()=>({keys:[],edits:[],text:'',saved:1,filter:''});
const make=(options={})=>createApp({schema,initialState:initialState(),...options});
const configuration={namespace:'semantic',version:'1',fields:{
  saved:{location:'local',validate:value=>typeof value==='number'},filter:{location:'url',validate:value=>typeof value==='string'},
}};
const routeConfig={base:'/app',routes:[]};
const packet=(name,...args)=>({version:1,kind:'action',name,args});
const storageValue=value=>encodeSnapshot({namespace:'semantic',version:'1',values:{saved:value}});
const urlValue=value=>encodeSnapshot({namespace:'semantic',version:'1',values:{filter:value}});

test('C.5 scoped semantic keyboard packets preserve held/repeat/reset and native cancellation',()=>{
  const browser=fakeBrowser(),events=[],app=make({view:({inputs})=>{
    const forward=inputs.keyboard('keyboard','keyboard');
    return input({onKey:(value,event)=>{if(value.key==='a')event.preventDefault();forward(value,event);}});
  }});app.observeInputs(event=>events.push(event));app.mount(browser.target);
  const node=browser.target.childNodes[0];node.focus();
  const down={type:'keydown',key:'a',code:'KeyA',repeat:false,ctrlKey:true};node.dispatchEvent(down);
  node.dispatchEvent({type:'keydown',key:'a',code:'KeyA',repeat:true});node.dispatchEvent({type:'keyup',key:'a',code:'KeyA'});
  node.dispatchEvent({type:'keydown',key:'b',code:'KeyB'});browser.view.dispatchEvent({type:'blur'});
  assert.equal(down.defaultPrevented,true);assert.equal(app.state.keys[0].held.length,1);assert.equal(app.state.keys[1].repeat,true);
  assert.equal(app.state.keys[2].held.length,0);assert.equal(app.state.keys[4].reason,'window-blur');
  assert.ok(events.every(event=>event.packet.kind==='action'&&event.packet.args[0].origin==='keyboard'));
  assert.equal(events.at(-1).sequence,5);assert.equal(events.at(-1).derived,false);app.dispose();
});

test('C.5 semantic text captures editing/paste/composition values and forwards saved packets without native Events',()=>{
  const browser=fakeBrowser(),captured=[],app=make({target:browser.target,view:({inputs,bind})=>input({value:bind.text,onText:inputs.text('editor','text')})});
  app.observeInputs(event=>captured.push(event.packet));const node=browser.target.childNodes[0];node.focus();
  node.value='pasted';node.dispatchEvent({type:'input',inputType:'insertFromPaste',data:null});
  node.dispatchEvent({type:'compositionstart'});node.value='日本';node.dispatchEvent({type:'compositionupdate',data:'日本'});
  app.flush();assert.equal(node.value,'日本');node.dispatchEvent({type:'compositionend',data:'日本'});app.flush();
  const other=make();for(const value of captured)other.receiveInput(value);
  assert.equal(app.snapshot(),other.snapshot());assert.equal(app.state.edits[0].inputType,'insertFromPaste');
  assert.equal(app.state.edits[1].isComposing,true);assert.equal(app.state.edits[2].phase,'commit');
  assert.ok(!('nativeEvent' in captured[0].args[0].value));app.dispose();other.dispose();
});

test('C.5 fixed semantic inputs queue in one order, leave native editing live, and cancel with the view',()=>{
  const browser=fakeBrowser(),events=[],app=make({target:browser.target,simulation:{tickDuration:10000},
    view:({inputs,bind})=>input({value:bind.text,onKey:inputs.keyboard('keys','keyboard'),onText:inputs.text('text','text')})});
  app.observeInputs(event=>events.push(event));const node=browser.target.childNodes[0];node.focus();
  node.dispatchEvent({type:'keydown',key:'x',code:'KeyX'});node.value='x';node.dispatchEvent({type:'input',data:'x',inputType:'insertText'});
  assert.equal(app.state.text,'');assert.equal(node.value,'x');assert.equal(events.length,0);assert.equal(app.ticks.queuedInputs,2);
  app.resumeTicks();app.advanceTicks(10000);app.pauseTicks();app.flush();assert.equal(app.state.text,'x');
  assert.deepEqual(events.map(event=>[event.sequence,event.tick]),[[1,1],[2,1]]);
  node.dispatchEvent({type:'keydown',key:'z',code:'KeyZ'});app.dispose();assert.ok(Object.values(resourceCounts(app)).every(n=>n===0));
});

test('C.5 hydration and native route packets reproduce committed versions without consulting another live store',()=>{
  const browser=fakeBrowser(),events=[];browser.view.localStorage.data.set('mini-framework:semantic:local',storageValue(7));
  const app=make({router:routeConfig,persistence:configuration});app.observeInputs(event=>events.push(event));app.mount(browser.target);
  assert.equal(app.state.saved,7);assert.equal(app.stateVersion,2);
  const query=new URLSearchParams({'mf:semantic:filter':urlValue('recorded')});
  browser.view.history.pushState({},'', '/app/next?'+query);browser.view.dispatchEvent({type:'popstate'});
  assert.equal(app.state.filter,'recorded');assert.equal(app.route.path,'/next');assert.equal(app.stateVersion,3);
  const changed=fakeBrowser('https://different.test/app/different');changed.view.localStorage.data.set('mini-framework:semantic:local',storageValue(99));
  const copy=make({router:routeConfig,persistence:configuration});
  for(const event of events.filter(event=>!event.derived))copy.receiveInput(event.packet);
  assert.equal(app.snapshot(),copy.snapshot());assert.deepEqual(app.route,copy.route);
  assert.equal(changed.view.localStorage.getItem('mini-framework:semantic:local'),storageValue(99));
  assert.ok(events.some(event=>event.packet.kind==='hydration'&&event.derived));app.dispose();copy.dispose();
});

test('C.5 immediate and consumed fixed adapter packets release all owned resource tickets',()=>{
  const app=make();for(let i=0;i<100;i++)app.inputs.send('release','keyboard',{});
  assert.equal(resourceCounts(app).inputResources,0);app.dispose();
  const fixed=make({simulation:{tickDuration:1}});fixed.inputs.send('release','keyboard',{});
  assert.equal(resourceCounts(fixed).inputResources,1);fixed.resumeTicks();fixed.advanceTicks(1);
  assert.equal(resourceCounts(fixed).inputResources,0);fixed.dispose();
});

test('C.5 fixed native route observation is queued while boot hydration and derived URL publication remain immediate',()=>{
  const browser=fakeBrowser(),events=[],app=make({router:routeConfig,persistence:configuration,simulation:{tickDuration:10}});
  app.observeInputs(event=>events.push(event));app.mount(browser.target);assert.equal(app.route.path,'/');
  app.navigate('/next');assert.equal(browser.view.location.pathname,'/app/');assert.equal(app.route.path,'/');
  app.resumeTicks();app.advanceTicks(10);app.pauseTicks();assert.equal(app.route.path,'/next');assert.equal(browser.view.location.pathname,'/app/next');
  browser.view.history.back();assert.equal(app.route.path,'/next');assert.equal(app.ticks.queuedInputs,1);
  app.resumeTicks();app.advanceTicks(10);app.pauseTicks();assert.equal(app.route.path,'/');
  assert.deepEqual(events.filter(event=>!event.derived).map(event=>event.packet.kind),['location','navigation','location']);app.dispose();
});

test('C.5 saved hydration guards reject before partial assignments and preserve aliases',()=>{
  const app=make({persistence:configuration,router:routeConfig}),before=app.snapshot();
  const hydration={version:1,kind:'hydration',namespace:'semantic',schemaVersion:'1',groups:[{location:'local',values:{saved:'bad'}}]};
  assert.throws(()=>app.receiveInput(hydration),code('PERSIST_VALUE_INVALID'));assert.equal(app.snapshot(),before);
  assert.throws(()=>app.receiveInput({...hydration,namespace:'wrong'}),code('INPUT_INCOMPATIBLE'));
  assert.throws(()=>app.receiveInput({...hydration,groups:[{location:'local',values:{text:'no'}}]}),code('INPUT_INVALID'));app.dispose();
  const shared={n:7},family=createApp({initialState:{a:null,b:null},persistence:{namespace:'alias',fields:{
    a:{location:'local',validate:value=>typeof value==='object'},b:{location:'local',validate:value=>typeof value==='object'},
  }}});
  family.receiveInput({version:1,kind:'hydration',namespace:'alias',schemaVersion:'app/1',groups:[{location:'local',values:{a:shared,b:shared}}]});
  assert.equal(family.state.a,family.state.b);assert.notEqual(family.state.a,shared);family.dispose();
});

test('C.5 input observer failures preserve input execution, block reentry and aggregate independently',()=>{
  const app=make();let observed=0;
  app.observeInputs(event=>{
    observed++;assert.ok(Object.isFrozen(event)&&Object.isFrozen(event.packet));
    assert.throws(app.actions.increment,code('ACTION_REENTRANT'));assert.throws(()=>app.receiveInput(packet('increment')),code('INPUT_REENTRANT'));
    throw Error('observer');
  });
  assert.throws(()=>app.receiveInput(packet('increment')),/observer/);assert.equal(app.state.saved,2);assert.equal(observed,1);
  assert.throws(()=>app.receiveInput(packet('text',null)),AggregateError);assert.equal(app.stateVersion,2);app.dispose();
});

test('C.5 action-origin navigation is derived, stays after commit, and failed action navigation is discarded',()=>{
  const browser=fakeBrowser();let app;const events=[];
  const family=createActionSchema()(({action})=>({
    go:action(draft=>{draft.n++;app.navigate('/next');}),fail:action(()=>{app.navigate('/bad');throw Error('abort');}),
  }));
  app=createApp({schema:family,initialState:{n:0},router:routeConfig,target:browser.target});app.observeInputs(event=>events.push(event));
  app.actions.go();assert.equal(app.state.n,1);assert.equal(app.route.path,'/next');assert.ok(events.every(event=>event.derived));
  const before=events.length;assert.throws(app.actions.fail,/abort/);assert.equal(events.length,before);assert.equal(app.route.path,'/next');app.dispose();
});

test('C.5 packet validation never runs ordinary field/args getters, and structural fields are exact',()=>{
  const app=make(),before=app.snapshot();let reads=0;
  const args=[];Object.defineProperty(args,0,{get(){reads++;return 1;},enumerable:true});
  for(const value of [null,[],{version:2,kind:'action',name:'increment',args:[]},
    {...packet('increment'),extra:1},packet('increment',1),{version:1,kind:'action',name:'text',args},
    {get version(){reads++;return 1;},kind:'action',name:'increment',args:[]}])assert.throws(()=>app.receiveInput(value));
  assert.equal(reads,0);assert.equal(app.snapshot(),before);app.dispose();
});

test('C.5 observer lifetime is bounded, independently disposable and owned by view scopes',()=>{
  const app=make();const stops=[];for(let i=0;i<1024;i++)stops.push(app.observeInputs(()=>{}));
  assert.throws(()=>app.observeInputs(()=>{}),code('INPUT_LIMIT'));stops[0]();app.observeInputs(()=>{});app.dispose();
  assert.equal(resourceCounts(app).inputObservers,0);assert.doesNotThrow(stops[1]);
  const browser=fakeBrowser();const scoped=make({target:browser.target,view:context=>{context.observeInputs(()=>{});return div('scope');}});
  assert.equal(resourceCounts(scoped).inputObservers,1);scoped.dispose();assert.equal(resourceCounts(scoped).inputObservers,0);
});

test('C.5 fixed bootstrap and future native locations reproduce state at matching numbered ticks',()=>{
  const browser=fakeBrowser(),events=[];browser.view.localStorage.data.set('mini-framework:semantic:local',storageValue(7));
  const simulation={tickDuration:10},app=make({router:routeConfig,persistence:configuration,simulation});
  app.observeInputs(event=>events.push(event));app.mount(browser.target);
  const copy=make({router:routeConfig,persistence:configuration,simulation});
  for(const event of events.filter(event=>!event.derived))copy.receiveInput(event.packet);
  assert.equal(app.snapshot(),copy.snapshot());assert.equal(copy.ticks.queuedInputs,0);
  const query=new URLSearchParams({'mf:semantic:filter':urlValue('tick')});
  browser.view.history.pushState({},'', '/app/next?'+query);browser.view.dispatchEvent({type:'popstate'});
  app.resumeTicks();app.advanceTicks(10);app.pauseTicks();
  const observed=events.find(event=>event.packet.kind==='location'&&event.packet.cause==='native');
  copy.receiveInput(observed.packet,{tick:observed.tick});copy.resumeTicks();copy.advanceTicks(10);copy.pauseTicks();
  assert.equal(app.snapshot(),copy.snapshot());assert.deepEqual(app.route,copy.route);app.dispose();copy.dispose();
});

test('C.5 hash locations can be injected headlessly and reject incompatible router policies',()=>{
  const app=make({router:{mode:'hash',base:'/',routes:[]}});
  const location={version:1,kind:'location',mode:'hash',base:'/',url:'/document.html#/people/7?tab=one',cause:'native',hydrate:true};
  app.receiveInput(location);assert.equal(app.route.path,'/people/7');assert.deepEqual(app.route.query.tab,['one']);
  assert.throws(()=>app.receiveInput({...location,mode:'history'}),code('INPUT_INCOMPATIBLE'));
  assert.throws(()=>app.receiveInput({...location,url:'https://external.test/'}),code('INPUT_INVALID'));app.dispose();
});
