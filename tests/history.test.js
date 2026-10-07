import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApp,createActionSchema,createHistory,readRecording,div,ul,li,input,button} from '../src/index.js';
import {resourceCounts} from '../src/runtime/diagnostics.js';
import {fakeBrowser} from './helpers/fake-browser.js';
const code=value=>error=>error.code===value;
const hash=text=>createHash('sha256').update(text).digest('hex');
const packet=(name,...args)=>({version:1,kind:'action',name,args});
function fixture(config={}) {
  let app,history;
  const current=()=>history?.app??app;
  const schema=createActionSchema({version:'history/1'})(({action})=>({
    increment:action((draft,services)=>{draft.n++;draft.draws.push(services.random());draft.time=services.now();}),
    parent:action(draft=>{draft.order.push('parent');current().actions.child('one');current().actions.child('two');}),
    child:action(value=>typeof value==='string',(draft,value)=>{draft.order.push(value);}),
    fail:action((draft,services)=>{draft.n=-1;services.random();current().actions.increment();throw Error('rollback');}),
    partial:action(draft=>{draft.order.push('partial');current().actions.fail();current().actions.increment();}),
    reverse:action(draft=>draft.rows.reverse()),
    external:action(value=>value?.version===1,(draft,value)=>{draft.external=value;}),
    navigate:action(()=>current().navigate('/next')),
    reenter:action(draft=>{if(history){assert.throws(()=>history.seek(0),code('HISTORY_REENTRANT'));assert.throws(()=>history.dispose(),code('HISTORY_REENTRANT'));}draft.n++;}),
  }));
  if(config.recording) {history=createHistory({schema,...config});app=history.app;}
  else app=createApp({schema,initialState:{n:0,draws:[],time:0,order:[],rows:[{id:1,text:'one'},{id:2,text:'two'}],external:null},controls:{seed:7},...config});
  return {app,schema,history};
}
function recorded(run,config={},policy={}) {
  const {app}=fixture(config);app.startRecording({keyframeInterval:3,...policy});run(app);
  app.stopRecording();const text=app.exportRecording();app.dispose();return text;
}
const pure=['increment','parent','child','fail','partial','reverse','external','reenter'];
const all=app=>Object.values(resourceCounts(app)).every(n=>n===0);

test('D.2 history starts at retained baseline and seeks exact snapshots in both directions',()=>{
  const text=recorded(app=>{for(let i=0;i<10;i++)app.actions.increment();}),log=readRecording(text),{app,history}=fixture({recording:text});
  assert.equal(history.status.sequence,log.baseline.sequence);assert.equal(app.snapshot(),log.baseline.snapshot);
  const hashes=new Map([[log.baseline.sequence,hash(log.baseline.snapshot)],...log.records.map(r=>[r.sequence,r.after.hash])]);
  for(const sequence of [10,2,7,0,9,4,10]){const status=history.seek(sequence);assert.equal(status.divergence,null);assert.equal(hash(app.snapshot()),hashes.get(sequence));assert.equal(history.app,app);}
  assert.equal(app.snapshot(),log.end.snapshot);history.dispose();assert.equal(history.status.status,'disposed');assert.ok(all(app));
});
test('D.2 nearest-keyframe seek executes only the bounded suffix',()=>{
  let calls=0;const schema=createActionSchema()(({action})=>({add:action(d=>{calls++;d.n++;})}));
  const source=createApp({schema,initialState:{n:0}});source.startRecording({keyframeInterval:4});for(let i=0;i<13;i++)source.actions.add();
  const history=createHistory({recording:source.exportRecording(),schema});calls=0;
  const status=history.seek(11);assert.equal(calls,3);assert.equal(status.checkpointSequence,8);assert.equal(status.replayedRoots,3);assert.equal(status.replayedSlots,3);
  history.seek(12);assert.equal(calls,3);history.dispose();source.dispose();
});
test('D.1 undo/redo defaults to explicit reversible names, with whole nested batches grouped',()=>{
  const text=recorded(app=>{app.actions.increment();app.actions.parent();app.actions.increment();});
  const blocked=fixture({recording:text});blocked.history.seek(3);assert.equal(blocked.history.status.canUndo,false);
  assert.throws(()=>blocked.history.undo(),code('HISTORY_IRREVERSIBLE'));assert.equal(blocked.history.status.sequence,3);blocked.history.dispose();
  const {app,history}=fixture({recording:text,reversible:pure});history.seek(3);history.undo();assert.equal(app.state.n,1);
  history.undo();assert.deepEqual(app.state.order,[]);assert.equal(history.status.sequence,1);
  history.redo();assert.deepEqual(app.state.order,['parent','one','two']);history.redo();assert.equal(app.state.n,2);history.dispose();
});
test('D.1 failed/discarded names participate in policy; partial successes remain one root',()=>{
  const text=recorded(app=>assert.throws(app.actions.partial));
  const blocked=fixture({recording:text,reversible:['partial','fail']});blocked.history.seek(1);assert.equal(blocked.app.state.n,1);
  assert.throws(()=>blocked.history.undo(),code('HISTORY_IRREVERSIBLE'));blocked.history.dispose();
  const {app,history}=fixture({recording:text,reversible:pure});history.seek(1);const end=app.snapshot();history.undo();assert.equal(app.state.n,0);history.redo();assert.equal(app.snapshot(),end);history.dispose();
});
test('D.1 multi-root undo/redo validates the whole barrier range before any mutation',()=>{
  const text=recorded(app=>{app.actions.increment();app.actions.parent();app.actions.increment();});
  const {app,history}=fixture({recording:text,reversible:['increment']});history.seek(3);const before=app.snapshot();
  assert.throws(()=>history.undo(2),code('HISTORY_IRREVERSIBLE'));assert.equal(app.snapshot(),before);assert.equal(history.status.sequence,3);
  history.seek(0);assert.throws(()=>history.redo(2),code('HISTORY_IRREVERSIBLE'));assert.equal(history.status.sequence,0);history.redo();history.dispose();
});
test('D.1 route/location/hydration groups are barriers even when their action names are declared',()=>{
  const browser=fakeBrowser(),router={base:'/app',routes:[]},text=recorded(app=>{app.actions.navigate();app.actions.increment();},
    {target:browser.target,router,view:()=>div('source')});
  const {app,history}=fixture({recording:text,router,reversible:[...pure,'navigate']});history.seek(2);history.undo();
  assert.throws(()=>history.undo(),code('HISTORY_IRREVERSIBLE'));history.seek(0);assert.equal(app.route.url,'/app/');history.seek(1);assert.equal(app.route.url,'/app/next');history.dispose();
});
test('D.1 pure logical-time and empty fixed-tick roots are reversible without action declarations',()=>{
  const text=recorded(app=>{app.setLogicalTime(30);app.setLogicalTime(50);}),{app,history}=fixture({recording:text});
  history.seek(2);history.undo();assert.equal(app.controls.clock.time,30);history.redo();assert.equal(app.controls.clock.time,50);history.dispose();
  const ticks=recorded(app=>{app.resumeTicks();app.advanceTicks(20);app.pauseTicks();},{simulation:{tickDuration:10}});
  const fixed=fixture({recording:ticks});fixed.history.seek(2);fixed.history.undo();assert.equal(fixed.app.controls.clock.tick,1);fixed.history.redo();assert.equal(fixed.app.controls.clock.tick,2);fixed.history.dispose();
});
test('D.2 expired/out-of-range/malformed seeks and move counts leave selected state untouched',()=>{
  const text=recorded(app=>{for(let i=0;i<25;i++)app.actions.increment();},{},{maxActions:5,keyframeInterval:2}),log=readRecording(text);
  const {app,history}=fixture({recording:text,reversible:pure});assert.ok(log.baseline.sequence>0);const before=app.snapshot();
  assert.throws(()=>history.seek(log.baseline.sequence-1),code('HISTORY_EXPIRED'));assert.throws(()=>history.seek(log.end.sequence+1),code('HISTORY_RANGE'));
  for(const value of [-1,-0,1.5,NaN,Infinity,'1'])assert.throws(()=>history.seek(value),code('HISTORY_INVALID'));
  for(const value of [0,1025,1.5,'1'])assert.throws(()=>history.undo(value),code('HISTORY_INVALID'));
  assert.throws(()=>history.undo(),code('HISTORY_EXPIRED'));assert.equal(app.snapshot(),before);history.seek(log.end.sequence);
  assert.throws(()=>history.redo(),code('HISTORY_RANGE'));history.dispose();
});
test('D.2 branch continues seed/version/time state, discards future and starts an empty input session',()=>{
  const text=recorded(app=>{app.setLogicalTime(50);app.actions.increment();app.actions.increment();app.actions.parent();});
  const {history}=fixture({recording:text,reversible:pure});history.seek(4);history.undo();history.undo();const selected=history.app.snapshot();
  const {app:reference}=fixture({initialState:undefined,controls:undefined,snapshot:selected});reference.actions.increment();
  const old=history.app,branch=history.branch();assert.equal(branch,history.app);assert.notEqual(branch,old);assert.equal(old.status,'disposed');assert.ok(all(old));
  branch.actions.increment();assert.equal(branch.snapshot(),reference.snapshot());assert.equal(branch.replaying,false);assert.equal(history.status.discardedRecords,2);
  assert.throws(()=>history.redo(),code('HISTORY_BRANCHED'));assert.throws(()=>history.seek(1),code('HISTORY_BRANCHED'));
  branch.startRecording();branch.actions.parent();assert.equal(readRecording(branch.exportRecording()).baseline.sequence,0);
  history.dispose();reference.dispose();assert.ok(all(branch));
});
test('D.2 fixed branches resume deterministic ticks after replay selection with no future tickets',()=>{
  const text=recorded(app=>{app.enqueueAt(1,'parent');app.resumeTicks();app.advanceTicks(30);app.pauseTicks();},
    {simulation:{tickDuration:10,action:'increment'}});const {history}=fixture({recording:text,reversible:pure});history.seek(1);
  const snapshot=history.app.snapshot(),reference=fixture({snapshot,initialState:undefined,controls:undefined,simulation:{tickDuration:10,action:'increment'}}).app;
  const branch=history.branch();assert.equal(branch.ticks.paused,true);assert.equal(branch.ticks.queuedInputs,0);
  for(const app of [reference,branch]){app.enqueue('parent');app.resumeTicks();app.advanceTicks(20);app.pauseTicks();}
  assert.equal(branch.snapshot(),reference.snapshot());history.dispose();reference.dispose();
});
test('D.2 mounted inspection retains keyed node identity/focus and observers across restores',()=>{
  const text=recorded(app=>{app.actions.increment();app.actions.reverse();app.actions.increment();}),browser=fakeBrowser();let notifications=0;
  const {app,history}=fixture({recording:text,reversible:pure,view:({bind,keyed})=>div(bind.n,
    ul(keyed(bind.rows,row=>row.id,({item})=>li(input({value:item.text})))))});app.mount(browser.target);
  const rows=browser.target.childNodes.find(n=>n.nodeType===1).childNodes.find(n=>n.tagName==='UL');
  const one=rows.childNodes.find(n=>n.tagName==='LI'),field=one.childNodes.find(n=>n.tagName==='INPUT');field.focus();field.setSelectionRange(1,2);
  const observer=app.observe(state=>state.n,()=>{notifications++;});
  history.seek(3);app.flush();assert.equal(history.app,app);assert.equal(observer.read(),2);assert.ok(notifications>0);
  assert.equal(rows.childNodes.filter(n=>n.tagName==='LI')[1],one);assert.equal(browser.document.activeElement,field);assert.equal(field.selectionStart,1);
  history.undo(2);app.flush();assert.equal(rows.childNodes.filter(n=>n.tagName==='LI')[0],one);assert.equal(observer.read(),1);
  history.dispose();assert.ok(all(app));
});
test('D.2 mounted inspection never samples location/storage or runs native callbacks during seeks',()=>{
  const text=recorded(app=>app.actions.increment()),browser=fakeBrowser();let reads=0,clicks=0;
  for(const key of ['location','history','localStorage','sessionStorage'])Object.defineProperty(browser.view,key,{get(){reads++;throw Error(key);}});
  const {app,history}=fixture({recording:text,view:({bind})=>button({onClick:()=>clicks++},bind.n)});app.mount(browser.target);history.seek(1);app.flush();
  browser.target.childNodes.find(n=>n.tagName==='BUTTON').click();assert.equal(reads+clicks,0);history.seek(0);app.flush();assert.equal(reads,0);history.dispose();
});
test('D.2 branch first mount restores local URL and skips changed ambient persistence defaults',()=>{
  const source=fakeBrowser(),router={base:'/app',routes:[]},persistence={namespace:'history-state',fields:{n:{location:'local',validate:v=>typeof v==='number'}}};
  const text=recorded(app=>{app.navigate('/next');app.actions.increment();},{target:source.target,router,persistence,view:()=>div('source')});
  const {history}=fixture({recording:text,router,persistence,view:({bind})=>div(bind.n)});history.seek(2);const selected=history.app.snapshot();
  const browser=fakeBrowser('https://fresh.test/different');let reads=0,writes=0;
  browser.view.localStorage={getItem(){reads++;throw Error('ambient');},setItem(){writes++;}};
  const branch=history.branch();assert.equal(branch.route.url,'/app/next');branch.mount(browser.target);
  assert.equal(branch.snapshot(),selected);assert.equal(browser.view.location.pathname,'/app/next');assert.equal(reads,0);branch.actions.increment();branch.flushPersistence();assert.ok(writes>0);history.dispose();
});
test('D.2 divergence leaves the consumed root inspectable and blocks undo/branch until a valid seek',()=>{
  const text=recorded(app=>{app.actions.increment();app.actions.increment();});
  const schema=createActionSchema({version:'history/1'})(({action})=>({increment:action(d=>{d.n+=2;})})),history=createHistory({recording:text,schema,reversible:['increment']});
  const result=history.seek(2);assert.equal(result.status,'diverged');assert.equal(result.sequence,1);assert.equal(result.divergence.sequence,1);assert.equal(history.app.state.n,2);
  assert.throws(()=>history.undo(),code('HISTORY_DIVERGED'));assert.throws(()=>history.branch(),code('HISTORY_DIVERGED'));
  history.seek(0);assert.equal(history.status.divergence,null);history.dispose();
});
test('D.2 restores entire graph aliases/holes and preserves snapshots saved before seeking',()=>{
  const shared={value:-0},rows=new Array(3);rows[1]=shared;const schema=createActionSchema()(({action})=>({edit:action(d=>{d.a.value=4;})}));
  const source=createApp({schema,initialState:{a:shared,b:shared,rows}});source.startRecording({keyframeInterval:1});source.actions.edit();const text=source.exportRecording();
  const history=createHistory({recording:text,schema});history.seek(1);const saved=history.app.state;history.seek(0);
  assert.equal(history.app.state.a,history.app.state.b);assert.equal(history.app.state.rows[1],history.app.state.a);assert.ok(!(0 in history.app.state.rows));
  assert.ok(Object.is(history.app.state.a.value,-0));assert.equal(saved.a.value,4);history.dispose();source.dispose();
});
test('D.2 reentrant seeking/disposal is rejected from actions and reactive notification work',()=>{
  const text=recorded(app=>app.actions.reenter()),{app,history}=fixture({recording:text,reversible:pure});
  app.observe(state=>state.n,()=>assert.throws(()=>history.seek(0),code('HISTORY_REENTRANT')));
  assert.equal(history.seek(1).divergence,null);history.dispose();
});
test('D.2 post-restore notification errors retain the restored checkpoint cursor and permit recovery',()=>{
  const text=recorded(app=>{for(let i=0;i<6;i++)app.actions.increment();}),{app,history}=fixture({recording:text});let fail=false;
  const observer=app.observe(state=>state.n,()=>{if(fail)throw Error('observer');});history.seek(5);observer.read();fail=true;
  assert.throws(()=>history.seek(0),code('HISTORY_RESTORE_FAILED'));assert.equal(history.status.sequence,0);assert.equal(app.state.n,0);
  fail=false;observer.read();assert.equal(history.seek(2).divergence,null);history.dispose();
});
test('D.2 direct inspection/branch app disposal closes the controller without retaining history',()=>{
  const text=recorded(()=>{}),one=fixture({recording:text});one.app.dispose();assert.equal(one.history.status.status,'disposed');assert.ok(all(one.app));
  assert.throws(()=>one.history.seek(0),code('HISTORY_DISPOSED'));one.history.dispose();
  const two=fixture({recording:text}),branch=two.history.branch();branch.dispose();assert.equal(two.history.status.status,'disposed');two.history.dispose();
});
test('D.1 policy/configuration reject getters, sparse/duplicate/unknown names before execution',()=>{
  const text=recorded(()=>{}),temporary=fixture(),schema=temporary.schema;temporary.app.dispose();let getters=0;
  for(const reversible of [['missing'],['increment','increment'],new Array(2),'increment'])
    assert.throws(()=>createHistory({recording:text,schema,reversible}),code('HISTORY_INVALID'));
  assert.throws(()=>createHistory({recording:text,schema,get view(){getters++;}}),code('HISTORY_INVALID'));assert.equal(getters,0);
});

for(const mode of ['recent','session'])test(`D.2 randomized retained ${mode} seeks match independent hashes and atomic-root bounds`,()=>{
  const text=recorded(app=>{for(let i=0;i<80;i++){app.actions.increment();if(i%3===0)app.actions.parent();if(i%5===0)app.actions.reverse();}},
    {},{mode,maxActions:25,keyframeInterval:7,maxBytes:40000});
  const log=readRecording(text),expected=new Map([[log.baseline.sequence,hash(log.baseline.snapshot)],...log.records.map(r=>[r.sequence,r.after.hash])]);
  const {history}=fixture({recording:text,reversible:pure});let random=19;
  for(let i=0;i<80;i++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const sequence=log.baseline.sequence+random%(log.records.length+1),status=history.seek(sequence);
    assert.equal(status.divergence,null);assert.equal(hash(history.app.snapshot()),expected.get(sequence));
    const rootCharge=Math.max(1,...log.records.map(r=>Math.max(1,r.actions)));
    assert.ok(status.replayedSlots<=log.policy.keyframeInterval+rootCharge);
  }
  history.dispose();assert.ok(all(history.app));
});
test('D.2 supplied hydration is an undo barrier and virtual routes restore to null baseline',()=>{
  const router={routes:[]},persistence={namespace:'hydrated-history',fields:{n:{location:'local',validate:v=>typeof v==='number'}}};
  const text=recorded(app=>{
    app.receiveInput({version:1,kind:'location',mode:'history',base:'/',url:'/somewhere',cause:'native',hydrate:false});
    app.receiveInput({version:1,kind:'hydration',namespace:'hydrated-history',schemaVersion:'history/1',groups:[{location:'local',values:{n:7}}]});
  },{router,persistence});
  const {app,history}=fixture({recording:text,router,persistence,reversible:pure});assert.equal(app.route,null);history.seek(2);assert.equal(app.state.n,7);
  assert.throws(()=>history.undo(),code('HISTORY_IRREVERSIBLE'));history.seek(0);assert.equal(app.route,null);assert.equal(app.state.n,0);history.dispose();
});
test('D.2 caller router/persistence configuration is owned before later seeks/branch construction',()=>{
  const router={base:'/app',routes:[]},browser=fakeBrowser(),text=recorded(app=>app.navigate('/next'),{target:browser.target,router,view:()=>div('source')});
  const {history}=fixture({recording:text,router});router.base='/mutated';router.routes.push({path:'/next',view:()=>{throw Error('mutated');}});
  assert.equal(history.seek(1).divergence,null);const branch=history.branch();assert.equal(branch.route.url,'/app/next');history.dispose();
});
test('D.2 branch cleanup errors retain the created live app and release inspection resources',()=>{
  const text=recorded(app=>app.actions.increment()),browser=fakeBrowser(),{history}=fixture({recording:text,view:({onDispose})=>{
    onDispose(()=>{throw Error('cleanup');});return div('inspection');
  }});const old=history.app;old.mount(browser.target);history.seek(1);assert.throws(()=>history.branch(),/cleanup/);
  assert.equal(history.status.status,'branched');assert.equal(history.app.status,'created');assert.ok(all(old));history.app.actions.increment();history.dispose();
});
test('D.2 branches replace a hash URL without hydrating old browser state and remain initially paused',()=>{
  const browser=fakeBrowser('https://example.test/app/#/start'),router={mode:'hash',base:'/app',routes:[]};
  const text=recorded(app=>{app.navigate('/next');app.resumeTicks();app.advanceTicks(10);app.pauseTicks();},
    {target:browser.target,router,simulation:{tickDuration:10},view:()=>div('source')});
  const log=readRecording(text),{history}=fixture({recording:text,router});history.seek(log.end.sequence);
  const branch=history.branch(),fresh=fakeBrowser('https://fresh.test/unrelated');branch.mount(fresh.target);
  assert.equal(branch.route.url,log.end.route.url);assert.equal(fresh.view.location.pathname+fresh.view.location.search+fresh.view.location.hash,log.end.route.url);
  assert.equal(branch.ticks.paused,true);history.dispose();
});
test('D.1 fake dense policy arrays with custom keys cannot bypass registration checks',()=>{
  const text=recorded(()=>{}),sparse=new Array(1);sparse.custom='increment';
  assert.throws(()=>createHistory({recording:text,reversible:sparse}),code('HISTORY_INVALID'));
});

test('D.2 empty retained histories have no undo/redo range and branch from their baseline',()=>{
  const text=recorded(()=>{}),{history}=fixture({recording:text});assert.equal(history.status.canUndo,false);assert.equal(history.status.canRedo,false);
  assert.equal(history.seek(0).replayedRoots,0);assert.throws(()=>history.undo(),code('HISTORY_EXPIRED'));assert.throws(()=>history.redo(),code('HISTORY_RANGE'));
  const branch=history.branch();assert.equal(branch.state.n,0);assert.equal(history.status.discardedRecords,0);history.dispose();history.dispose();
});
test('D.2 reactive resources survive whole-graph replacement and detached tracked facades expire',()=>{
  const text=recorded(app=>{app.actions.increment();app.actions.increment();}),{app,history}=fixture({recording:text});let captured;
  const observation=app.observe(state=>{captured=state.rows;return state.n;}),old=captured,computed=app.computed(state=>state.n*2);
  assert.equal(computed.value,0);history.seek(2);assert.equal(computed.value,4);assert.equal(observation.read(),2);
  assert.throws(()=>old.length,code('STATE_DETACHED'));assert.equal(captured.length,2);history.seek(0);assert.equal(computed.value,0);history.dispose();
});
test('D.2 restored keyframe route configurations preflight before any replay body executes',()=>{
  let calls=0;const schema=createActionSchema()(({action})=>({increment:action(d=>{calls++;d.n++;})})),browser=fakeBrowser(),router={base:'/app',routes:[]};
  const source=createApp({target:browser.target,schema,initialState:{n:0},router,view:()=>div('route')});source.startRecording({keyframeInterval:1});source.actions.increment();
  const wire=JSON.parse(source.exportRecording());source.dispose();wire.records[0].after.route.mode='hash';wire.end.route.mode='hash';calls=0;
  assert.throws(()=>createHistory({recording:JSON.stringify(wire),schema,router}),code('HISTORY_INCOMPATIBLE'));assert.equal(calls,0);
});
test('D.2 disposal callbacks may dispose their history owner idempotently, including branch handoff',()=>{
  const text=recorded(app=>app.actions.increment()),browser=fakeBrowser();let history;
  const temporary=fixture(),schema=temporary.schema;temporary.app.dispose();history=createHistory({recording:text,schema,view:({onDispose})=>{onDispose(()=>history.dispose());return div('history');}});
  history.app.mount(browser.target);history.seek(1);const branch=history.branch();assert.equal(branch.status,'created');assert.equal(history.status.status,'branched');history.dispose();
});
test('D.2 invalid nested configuration accessors are rejected without reading browser/application values',()=>{
  const text=recorded(()=>{});let reads=0;
  assert.throws(()=>createHistory({recording:text,router:{get routes(){reads++;return [];}}}),code('HISTORY_INVALID'));assert.equal(reads,0);
});
