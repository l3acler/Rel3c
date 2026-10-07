import {createApp,createActionSchema,createDiagnostics,createInspector,createHistory,div,p,button,input,keyed} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
export async function runInspectorTests({test,host,assert}) {
  await test('D.3 native frame diagnostics link coalesced causes to one exact text write and dependency target',async()=>{
    const target=host();const schema=createActionSchema()(({action})=>({inc:action(s=>{s.n++})}));
    const app=createApp({schema,initialState:{n:0,other:'untouched'},view:({bind,actions})=>div(p({id:'diagnostic-n'},bind.n),p({id:'diagnostic-other'},bind.other),button({onClick:actions.inc},'Increment'))});
    const d=createDiagnostics(app);app.mount(target);app.actions.inc();app.actions.inc();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const frame=d.snapshot().entries.at(-1),roots=d.snapshot().entries.filter(x=>x.kind==='dispatch');
    assert(frame.kind==='render'&&frame.root.source==='frame'&&Number.isFinite(frame.frame.timestampMs));
    assert(frame.counts['dom-write']===1&&frame.counts['binding-evaluation']===1&&frame.causes.length===2);
    assert(frame.events.find(e=>e.type==='evaluation').detail.binding.target==='text:diagnostic-n');
    assert(roots.every(x=>x.events.filter(e=>e.type==='dirty').length===1));
    app.actions.inc();await new Promise(resolve=>requestAnimationFrame(resolve));assert(d.snapshot().entries.at(-1).frame.intervalMs>=0);
    app.dispose();assert(Object.values(resourceCounts(app)).every(x=>x===0));target.remove();
  });
  await test('D.4 native inspector select/refresh/export keeps source state and displays included values',()=>{
    const sourceHost=host(),panelHost=host();const schema=createActionSchema()(({action})=>({rename:action(v=>typeof v==='string',(s,v)=>{s.name=v})}));
    const app=createApp({schema,initialState:{name:'Ada'},target:sourceHost,view:({bind})=>p(bind.name)}),d=createDiagnostics(app);app.startRecording();app.actions.rename('Grace');app.flush();
    const before=app.snapshot();let exported='';const inspector=createInspector({diagnostics:d,target:panelHost,onExport:text=>{exported=text}});
    const choose=panelHost.querySelector('select');choose.value=String(d.snapshot().entries[0].sequence);choose.dispatchEvent(new Event('change',{bubbles:true}));
    assert(panelHost.querySelector('[data-inspector-details]').value.includes('Grace'));
    panelHost.querySelector('[data-inspector-export]').click();inspector.app.flush();assert(JSON.parse(exported).format==='mini-framework-diagnostics');
    panelHost.querySelector('[data-inspector-recording]').click();inspector.app.flush();assert(exported===app.exportRecording());
    assert(panelHost.textContent.includes('Full recording snapshots/payloads')&&app.snapshot()===before);
    choose.focus();const selected=choose.value;inspector.refresh();assert(document.activeElement===choose&&choose.value===selected);
    inspector.dispose();assert(panelHost.childNodes.length===0&&app.status==='mounted'&&d.snapshot().status==='active');app.dispose();sourceHost.remove();panelHost.remove();
  });
  await test('D.3 native structural/property writes match instrumented setters and retain keyed focus',()=>{
    const target=host();const schema=createActionSchema()(({action})=>({reverse:action(s=>s.rows.reverse()),rename:action(s=>{s.rows[0].name='new'})}));
    const app=createApp({schema,initialState:{rows:[{id:1,name:'one'},{id:2,name:'two'}]},view:({bind})=>div(keyed(bind.rows,x=>x.id,({item,key})=>input({'data-row':key,value:item.name}))) }),d=createDiagnostics(app);app.mount(target);
    const field=target.querySelector('[data-row="1"]');field.focus();field.setSelectionRange(0,2);app.actions.reverse();app.flush();
    assert(document.activeElement===field&&field.selectionEnd===2&&target.querySelector('[data-row="1"]')===field);
    const reordered=d.snapshot().entries.at(-1);assert((reordered.counts['dom-write']??0)>0);
    app.actions.rename();app.flush();const frame=d.snapshot().entries.at(-1);assert(frame.events.some(e=>e.type==='dom-write'&&e.detail.kind==='property'));
    app.dispose();target.remove();
  });
  await test('D.4 inspector history buttons seek/undo/redo explicitly and clean up without taking source ownership',()=>{
    const schema=createActionSchema()(({action})=>({inc:action(s=>{s.n++})})),source=createApp({schema,initialState:{n:0}});source.startRecording();source.actions.inc();source.actions.inc();const wire=source.exportRecording();source.dispose();
    const history=createHistory({recording:wire,schema,reversible:['inc']}),d=createDiagnostics(history.app),target=host();const inspector=createInspector({diagnostics:d,history,target});
    const click=text=>{[...target.querySelectorAll('button')].find(x=>x.textContent===text).click();inspector.app.flush()};
    click('Seek end');assert(history.status.sequence===2);click('Undo root');assert(history.status.sequence===1);click('Redo root');assert(history.status.sequence===2);click('Seek baseline');assert(history.status.sequence===0);
    inspector.dispose();assert(history.app.status!=='disposed');history.dispose();assert(d.snapshot().entries.length===0);target.remove();
  });
}
