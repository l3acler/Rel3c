import {createApp,createReplay,createActionSchema,readRecording,hashSnapshot,div,input,p,button} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
export async function runReplayTests({test,host,assert,throws}) {
  await test('C.9 native key/text/paste/composition packets replay in a separate mounted app with native handlers inert',()=>{
    const target=host(),mirror=host(),schema=createActionSchema({version:'semantic-replay/1'})(({action})=>({
      edit:action(v=>v?.version===1,(draft,v)=>{draft.text=v.value.value;}),
      key:action(v=>v?.version===1,(draft,v)=>{draft.keys.push(v.value.type+':'+v.value.key);}),
    }));
    const view=({bind,inputs})=>div(input({value:bind.text,onText:inputs.text('editor','edit'),onKey:inputs.keyboard('keys','key')}),p(bind.text));
    const app=createApp({target,schema,initialState:{text:'',keys:[]},view});app.startRecording();const field=target.querySelector('input');field.focus();
    field.dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',bubbles:true}));
    field.dispatchEvent(new KeyboardEvent('keyup',{key:'a',code:'KeyA',bubbles:true}));
    field.value='paste 😀';field.dispatchEvent(new InputEvent('input',{inputType:'insertFromPaste',bubbles:true}));
    field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));field.value='日本 😀';
    field.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',data:'日本',isComposing:true,bubbles:true}));
    field.dispatchEvent(new CompositionEvent('compositionend',{data:'日本',bubbles:true}));app.stopRecording();
    const text=app.exportRecording(),log=readRecording(text),replay=createReplay({recording:text,schema,view});replay.app.mount(mirror);
    for(const record of log.records){assert(replay.step().divergence===null);assert(hashSnapshot(replay.app.snapshot())===record.after.hash);replay.app.flush();}
    assert(replay.status.status==='complete'&&replay.app.snapshot()===log.end.snapshot&&document.activeElement===field);
    const replayField=mirror.querySelector('input');replayField.value='ambient edit';replayField.dispatchEvent(new InputEvent('input',{bubbles:true}));
    assert(replay.app.state.text==='日本 😀');replay.dispose();app.dispose();assert(Object.values(resourceCounts(replay.app)).every(n=>n===0));target.remove();mirror.remove();
  });
  await test('C.9 virtual routing can coexist with a live router without History writes or native route listeners',()=>{
    const original=location.pathname+location.search+location.hash,target=host(),mirror=host(),router={routes:[]};
    const schema=createActionSchema()(({action})=>({increment:action(d=>{d.n++;})}));
    const source=createApp({target,schema,initialState:{n:0},router,view:({bind})=>div(bind.n)});source.startRecording();
    source.navigate('/replay-source');source.actions.increment();source.stopRecording();const log=readRecording(source.exportRecording());
    const replay=createReplay({recording:log,schema,router,view:({derive})=>p(derive(()=>replay.app.route.url))});
    replay.app.mount(mirror);const before=location.href,length=history.length;assert(replay.run().status==='complete');replay.app.flush();
    assert(location.href===before&&history.length===length&&mirror.textContent==='/replay-source');
    assert(resourceCounts(replay.app).routeListeners===0);throws(()=>replay.app.navigate('/live'),'REPLAY_READONLY');
    replay.dispose();source.dispose();history.replaceState(history.state,'',original);target.remove();mirror.remove();
  });
  await test('C.9 recorded measured/async results replay without readers, effects, timers or current browser values',async()=>{
    const target=host(),mirror=host();let reads=0,effects=0;
    const schema=createActionSchema()(({action})=>({external:action(v=>v?.version===1,(draft,v)=>{draft.results.push(v);})}));
    const source=createApp({target,schema,initialState:{results:[]},view:()=>div('source')});source.startRecording();
    source.inputs.sample('layout','external',()=>{reads++;return {width:target.getBoundingClientRect().width};});
    await source.inputs.effect('network','external',async()=>{effects++;return {body:'recorded',status:200};}).done;
    source.stopRecording();const text=source.exportRecording();reads=effects=0;
    const replay=createReplay({recording:text,schema,view:({inputs,derive})=>{
      inputs.effect('network','external',()=>{effects++;return {body:'changed'};});inputs.timer('timer','external',1);
      return p(derive(state=>state.results.length));
    }});replay.app.mount(mirror);replay.app.inputs.sample('layout','external',()=>{reads++;return {width:9999};});
    assert(replay.run().status==='complete');replay.app.flush();await Promise.resolve();
    assert(reads===0&&effects===0&&mirror.textContent==='2'&&replay.app.snapshot()===readRecording(text).end.snapshot);
    assert(resourceCounts(replay.app).externalEffects===0);replay.dispose();source.dispose();target.remove();mirror.remove();
  });
  await test('C.10 fixed tick hashes survive varied render schedules and interpolation is display-only in replay',()=>{
    const schema=createActionSchema()(({action})=>({tick:action((draft,services)=>{draft.x+=services.random();})}));
    for(const schedule of [[10000,10000,10000],[3000,17000,10000],[30000]]) {
      const target=host(),mirror=host(),source=createApp({target,schema,initialState:{x:0},controls:{seed:42},simulation:{tickDuration:10000,action:'tick'},
        view:({interpolate})=>p(interpolate(f=>f.previous.x+(f.current.x-f.previous.x)*f.alpha))});
      source.startRecording();source.resumeTicks();for(const delta of schedule){source.advanceTicks(delta);source.flush();}source.pauseTicks();source.stopRecording();
      const log=readRecording(source.exportRecording()),replay=createReplay({recording:log,schema,
        view:({interpolate})=>p(interpolate(f=>f.previous.x+(f.current.x-f.previous.x)*f.alpha))});replay.app.mount(mirror);
      for(const record of log.records){assert(replay.step().divergence===null&&hashSnapshot(replay.app.snapshot())===record.after.hash);replay.app.flush();}
      assert(replay.app.snapshot()===source.snapshot()&&Number(mirror.textContent)===source.state.x&&resourceCounts(replay.app).tickListeners===0);
      replay.dispose();source.dispose();target.remove();mirror.remove();
    }
  });
  await test('C.9 first divergence preserves the inspectable root and stops before later work',()=>{
    const schema=createActionSchema()(({action})=>({increment:action(d=>{d.n++;})})),source=createApp({schema,initialState:{n:0}});
    source.startRecording();source.actions.increment();source.actions.increment();const text=source.exportRecording();source.dispose();
    const changed=createActionSchema()(({action})=>({increment:action(d=>{d.n+=2;})})),replay=createReplay({recording:text,schema:changed});
    const result=replay.run();assert(result.status==='diverged'&&result.position===1&&result.divergence.action==='increment'&&replay.app.state.n===2);
    assert(result.divergence.actualHash===hashSnapshot(replay.app.snapshot()));replay.dispose();
  });
}
