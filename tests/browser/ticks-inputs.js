import { createApp, createActionSchema, div, when, hashSnapshot } from '../../src/index.js';
import { resourceCounts } from '../../src/runtime/diagnostics.js';
export async function runTickInputTests({test,host,assert,throws}) {
  await test('C.3 fixed tick states and restored continuation match with different native render boundaries',async()=>{
    const schema=createActionSchema()(({action})=>({
      tick:action((draft,services)=>{draft.n++;draft.time=services.now();draft.draw=services.random();}),
      value:action(value=>typeof value==='number',(draft,value)=>{draft.value=value;}),
    }));
    const one=host(),two=host(),options={schema,initialState:{n:0,time:0,draw:0,value:0},
      simulation:{tickDuration:10000,action:'tick',maxCatchUp:4},view:({bind})=>div(bind.n,':',bind.value)};
    const a=createApp({...options,target:one}),b=createApp({...options,target:two});
    // Stay headless while manually driving, then mount to exercise DOM batching.
    const x=createApp({...options,target:undefined}),y=createApp({...options,target:undefined});
    x.enqueueAt(2,'value',7);y.enqueueAt(2,'value',7);x.resumeTicks();y.resumeTicks();
    x.advanceTicks(40000);for(let i=0;i<4;i++)y.advanceTicks(10000);
    assert(hashSnapshot(x.snapshot())===hashSnapshot(y.snapshot()));
    const fork=createApp({schema,snapshot:x.snapshot(),simulation:options.simulation});fork.resumeTicks();
    x.advanceTicks(10000);fork.advanceTicks(10000);assert(x.snapshot()===fork.snapshot());
    a.enqueueAt(2,'value',7);b.enqueueAt(2,'value',7);
    for(const app of [a,b]){app.resumeTicks();app.advanceTicks(40000);app.pauseTicks();}
    a.flush();await new Promise(resolve=>requestAnimationFrame(resolve));b.flush();
    assert(one.textContent==='4:7'&&one.textContent===two.textContent&&a.snapshot()===b.snapshot());
    for(const app of [a,b,x,y,fork]){app.dispose();assert(Object.values(resourceCounts(app)).every(n=>n===0));}
    one.remove();two.remove();
  });
  await test('C.3 native frame driver advances logical ticks and pause cancels further sampling',async()=>{
    const schema=createActionSchema()(({action})=>({tick:action((draft,services)=>{draft.n++;draft.time=services.now();})}));
    const target=host(),app=createApp({target,schema,initialState:{n:0,time:0},simulation:{tickDuration:10000,action:'tick'},
      view:({bind})=>div(bind.n)});
    app.resumeTicks();await new Promise(resolve=>setTimeout(resolve,120));app.pauseTicks();
    assert(app.state.n>0&&app.controls.clock.tick===app.state.n&&app.state.time===app.state.n*10000);
    const before=app.snapshot();await new Promise(resolve=>requestAnimationFrame(resolve));assert(app.snapshot()===before);
    app.dispose();assert(Object.values(resourceCounts(app)).every(n=>n===0));target.remove();
  });
  await test('C.4 native viewport/layout/scroll/storage and normalized network values enter owned inputs',async()=>{
    const schema=createActionSchema()(({action})=>({external:action(value=>value?.version===1,(draft,value)=>{draft.values.push(value);})}));
    const target=host(),app=createApp({target,schema,initialState:{values:[]},view:()=>div('sample')});
    app.inputs.measure('window','external','viewport');app.inputs.measure('box','external','layout',target);
    app.inputs.measure('box','external','scroll',target);app.inputs.storage('settings','external',sessionStorage,'mini-framework-missing-tick-key');
    const task=app.inputs.effect('network','external',async signal=>{
      const response=await fetch('/examples/ticks/sample.json',{signal});return {status:response.status,body:await response.text()};
    });await task.done;
    assert(app.state.values.length===5&&app.state.values[0].value.width===innerWidth);
    assert(app.state.values[1].value.width===target.getBoundingClientRect().width&&app.state.values[2].value.y===target.scrollTop);
    assert(app.state.values[3].value.value===null&&app.state.values[4].value.status===200);
    app.dispose();target.remove();
  });
  await test('C.4 native timer and removed view scopes abort/suppress effects and queued inputs',async()=>{
    let task,signal,scoped,resolve;
    const schema=createActionSchema()(({action})=>({
      external:action(value=>value?.version===1,(draft,value)=>{draft.values.push(value);}),
      hide:action(draft=>{draft.visible=false;}),
    }));
    const target=host(),app=createApp({target,schema,initialState:{values:[],visible:true},simulation:{tickDuration:10},
      view:({bind})=>when(bind.visible,context=>{
        scoped=context.inputs;task=scoped.effect('pending','external',value=>{signal=value;return new Promise(yes=>{resolve=yes;});});
        return div('active');
      })});
    await new Promise(yes=>queueMicrotask(yes));
    const timer=scoped.timer('timer','external',5,'elapsed');await timer.done;
    assert(app.ticks.queuedInputs===1);throws(app.snapshot,'SNAPSHOT_PENDING');
    app.actions.hide();app.flush();assert(await task.done===null&&signal.aborted&&app.ticks.queuedInputs===0);
    resolve('late');await new Promise(yes=>queueMicrotask(yes));assert(app.state.values.length===0);
    throws(()=>scoped.send('late','external',1),'SCOPE_DISPOSED');app.dispose();
    assert(Object.values(resourceCounts(app)).every(n=>n===0));target.remove();
  });
}
