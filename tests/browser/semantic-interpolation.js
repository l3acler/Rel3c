import {createApp,createActionSchema,div,input,span,hashSnapshot} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
export async function runSemanticInterpolationTests({test,host,assert,throws}){
  await test('C.5 native semantic keyboard/text packets reproduce values without browser Events',()=>{
    const schema=createActionSchema()(({action})=>({external:action(value=>value?.version===1,(draft,packet)=>{draft.inputs.push(packet);})}));
    const target=host(),packets=[],app=createApp({target,schema,initialState:{inputs:[]},
      view:({inputs})=>input({onKey:inputs.keyboard('keys','external'),onText:inputs.text('text','external')})});
    app.observeInputs(event=>packets.push(event.packet));const field=target.querySelector('input');field.focus();
    field.dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',repeat:false,bubbles:true}));
    field.dispatchEvent(new KeyboardEvent('keydown',{key:'a',code:'KeyA',repeat:true,bubbles:true}));
    field.value='pasted 日本';field.dispatchEvent(new InputEvent('input',{inputType:'insertFromPaste',data:null,bubbles:true}));
    field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));field.value='日本語';
    field.dispatchEvent(new CompositionEvent('compositionupdate',{data:'日本語',bubbles:true}));
    field.dispatchEvent(new CompositionEvent('compositionend',{data:'日本語',bubbles:true}));
    const copy=createApp({schema,initialState:{inputs:[]}});for(const packet of packets)copy.receiveInput(packet);
    assert(app.snapshot()===copy.snapshot()&&app.state.inputs[1].value.repeat&&app.state.inputs.at(-1).value.phase==='commit');
    assert(!('nativeEvent' in packets[0].args[0].value));app.dispose();copy.dispose();target.remove();
  });
  await test('C.5 native navigation produces root/derived packets while shared state stays committed',()=>{
    const target=host(),events=[],old=location.pathname+location.search+location.hash;
    const schema=createActionSchema()(({action})=>({increment:action(draft=>{draft.n++;})}));
    const app=createApp({target,schema,initialState:{n:0},router:{routes:[]},view:()=>div('route')});
    app.observeInputs(event=>events.push(event));app.actions.increment();app.navigate('/semantic-fixture?value=one');
    assert(app.route.path==='/semantic-fixture'&&app.state.n===1);
    assert(events[0].packet.kind==='navigation'&&!events[0].derived&&events[1].packet.kind==='location'&&events[1].derived);
    const observed=events[1].packet,copy=createApp({initialState:{n:1},router:{routes:[]}});copy.receiveInput(observed);
    assert(copy.route.path===app.route.path&&copy.route.query.value[0]==='one');
    app.dispose();copy.dispose();history.replaceState(history.state,'',old);target.remove();
  });
  await test('C.6 native fractional bindings differ while authoritative state/hash/text/forms stay identical',()=>{
    const schema=createActionSchema()(({action})=>({tick:action(draft=>{draft.x+=10;})}));
    const states=[],displays=[],apps=[],targets=[];
    for(const elapsed of [11000,15000,19000]){
      const target=host(),app=createApp({target,schema,initialState:{x:0,text:'native'},simulation:{tickDuration:10000,action:'tick'},
        view:({bind,interpolate})=>div(span({class:'smooth'},interpolate(({previous,current,alpha})=>previous.x+(current.x-previous.x)*alpha)),
          span({class:'state'},bind.x),input({value:bind.text}))});
      app.resumeTicks();app.advanceTicks(elapsed);app.flush();states.push(hashSnapshot(app.snapshot()));
      displays.push(target.querySelector('.smooth').textContent);assert(target.querySelector('.state').textContent==='10'&&target.querySelector('input').value==='native');
      app.pauseTicks();apps.push(app);targets.push(target);
    }
    assert(states.every(value=>value===states[0])&&displays.join(',')==='1,5,9');
    for(const app of apps){app.dispose();assert(Object.values(resourceCounts(app)).every(n=>n===0));}for(const target of targets)target.remove();
  });
  await test('C.6 interpolation callbacks are immutable and cannot dispatch during native rendering',()=>{
    let app,attempt=false;const target=host(),schema=createActionSchema()(({action})=>({tick:action(draft=>{draft.x++;})}));
    app=createApp({target,schema,initialState:{x:0},simulation:{tickDuration:1,action:'tick'},view:({interpolate})=>interpolate(frame=>{
      if(attempt){let frozen=false;try{frame.current.x=9;}catch{frozen=true;}assert(frozen);throws(app.actions.tick,'ACTION_REENTRANT');}
      return frame.current.x;
    })});attempt=true;app.resumeTicks();app.advanceTicks(1);app.pauseTicks();app.flush();assert(app.state.x===1);app.dispose();target.remove();
  });
}
