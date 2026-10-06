import {createApp,createActionSchema,readRecording,input,div} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
export async function runRecordingTests({test,host,assert,throws}) {
  await test('C.7 native semantic text records owned execution traces and frozen versioned continuation',()=>{
    const target=host(),schema=createActionSchema({version:'record-browser/1'})(({action})=>({
      edit:action(value=>value?.version===1,(draft,value,services)=>{draft.text=value.value.value;draft.draw=services.random();})
    }));
    const app=createApp({target,schema,initialState:{text:'',draw:0},view:({inputs,bind})=>input({value:bind.text,onText:inputs.text('editor','edit')})});
    app.startRecording();const field=target.querySelector('input');field.focus();field.value='日本 😀';
    field.dispatchEvent(new InputEvent('input',{inputType:'insertFromPaste',bubbles:true}));app.flush();
    const text=app.exportRecording(),log=readRecording(text,{schemaVersion:schema.version});
    assert(log.records.length===1&&log.records[0].commits===1&&log.records[0].root.kind==='input');
    assert(log.records[0].root.input.packet.args[0].value.value==='日本 😀'&&Object.isFrozen(log.records[0].events));
    assert(log.end.snapshot===app.snapshot()&&field===document.activeElement);app.dispose();
    assert(Object.values(resourceCounts(app)).every(n=>n===0));target.remove();
  });
  await test('C.7 browser tick recording preserves nested failure/child ownership and authoritative state versions',()=>{
    let app;const target=host(),schema=createActionSchema()(({action})=>({
      parent:action(draft=>{draft.n++;app.actions.fail();app.actions.child();}),
      fail:action(()=>{app.actions.child();throw Error('abort');}),child:action(draft=>{draft.n++;})
    }));
    app=createApp({target,schema,initialState:{n:0},simulation:{tickDuration:10},view:({bind})=>div(bind.n)});app.startRecording();
    app.enqueue('parent');app.resumeTicks();let failed=false;try{app.advanceTicks(10);}catch{failed=true;}app.flush();
    const log=readRecording(app.exportRecording());assert(failed&&log.records.length===1&&log.records[0].outcome==='failed');
    assert(log.records[0].actions===4&&log.records[0].commits===2&&log.records[0].events.some(e=>e.phase==='discarded'));
    assert(app.state.n===2&&target.textContent==='2'&&log.end.snapshot===app.snapshot());app.dispose();target.remove();
  });
  await test('C.8 browser retention advances whole keyframe baselines and session limits remain visible',()=>{
    const schema=createActionSchema()(({action})=>({increment:action(draft=>{draft.n++;})}));
    for(const mode of ['recent','session']) {
      const app=createApp({schema,initialState:{n:0}});app.startRecording({mode,maxActions:3,keyframeInterval:2,maxBytes:12000});
      for(let i=0;i<12;i++)app.actions.increment();const log=readRecording(app.exportRecording());
      assert(app.recording.bytes<=12000&&app.state.n===12);
      if(mode==='recent')assert(log.evictedRecords>0&&log.baseline.sequence+log.records.length===12);
      else assert(log.status==='limit-reached'&&log.reason==='action-limit'&&log.evictedRecords===0&&log.records.length===3);
      app.dispose();assert(Object.values(resourceCounts(app)).every(n=>n===0));
    }
  });
  await test('C.7 browser recording validation rejects incompatible input without changing History or live state',()=>{
    const target=host(),original=location.pathname+location.search+location.hash;
    const app=createApp({target,initialState:{n:1},router:{routes:[]},view:()=>div('recorded route')});app.startRecording();app.navigate('/recording-fixture');
    const log=readRecording(app.exportRecording());assert(log.end.route.url==='/recording-fixture'&&log.records[0].events[1].input.derived);
    const wire=JSON.parse(app.exportRecording());wire.version=2;throws(()=>readRecording(JSON.stringify(wire)),'RECORDING_INCOMPATIBLE');
    assert(app.state.n===1&&app.route.path==='/recording-fixture');app.dispose();history.replaceState(history.state,'',original);target.remove();
  });
}
