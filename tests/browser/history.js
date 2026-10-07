import {createApp,createActionSchema,createHistory,readRecording,hashSnapshot,div,ul,li,input} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
export async function runHistoryTests({test,host,assert,throws}) {
  await test('D.2 seeking retains the inspection app/keyed DOM/focus/selection and matches recorded checkpoints',()=>{
    const schema=createActionSchema()(({action})=>({reverse:action(d=>d.rows.reverse()),increment:action(d=>{d.n++;})}));
    const source=createApp({schema,initialState:{n:0,rows:[{id:1,text:'first'},{id:2,text:'second'}]}});source.startRecording({keyframeInterval:2});
    source.actions.increment();source.actions.reverse();source.actions.increment();const text=source.exportRecording();source.dispose();const log=readRecording(text),target=host();
    const history=createHistory({recording:text,schema,reversible:['increment','reverse'],view:({bind,keyed})=>div(bind.n,
      ul(keyed(bind.rows,row=>row.id,({item})=>li(input({value:item.text})))))}),app=history.app;app.mount(target);
    const rows=[...target.querySelectorAll('li')],field=rows[0].querySelector('input');field.focus();field.setSelectionRange(1,3);
    for(const sequence of [3,0,2,1,3]){const result=history.seek(sequence);app.flush();
      assert(result.divergence===null&&history.app===app&&hashSnapshot(app.snapshot())===(sequence===0?hashSnapshot(log.baseline.snapshot):log.records[sequence-1].after.hash));
      assert(document.activeElement===field&&field.selectionStart===1&&field.selectionEnd===3&&target.contains(rows[0]));
    }
    history.undo(2);app.flush();assert(target.querySelector('li')===rows[0]&&app.state.n===1);history.redo(2);assert(app.state.n===2);
    history.dispose();assert(Object.values(resourceCounts(app)).every(n=>n===0));target.remove();
  });
  await test('D.1 reversible roots enforce barriers and undo/redo cannot partially cross a disallowed batch',()=>{
    const schema=createActionSchema()(({action})=>({add:action(d=>{d.n++;}),other:action(d=>{d.n++;})})),source=createApp({schema,initialState:{n:0}});
    source.startRecording();source.actions.add();source.actions.other();source.actions.add();const text=source.exportRecording();source.dispose();
    const history=createHistory({recording:text,schema,reversible:['add']});history.seek(3);const before=history.app.snapshot();
    throws(()=>history.undo(2),'HISTORY_IRREVERSIBLE');assert(history.status.sequence===3&&history.app.snapshot()===before);
    history.seek(0);throws(()=>history.redo(2),'HISTORY_IRREVERSIBLE');assert(history.status.sequence===0);history.dispose();
  });
  await test('D.2 history inspection leaves browser URL/storage untouched; branch mount restores the selected URL without hydration',()=>{
    const original=location.pathname+location.search+location.hash,target=host(),router={routes:[]};
    const schema=createActionSchema()(({action})=>({add:action(d=>{d.n++;})}));
    const source=createApp({target,schema,initialState:{n:0},router,view:({bind})=>div(bind.n)});source.startRecording({keyframeInterval:2});
    source.navigate('/history-selected');source.actions.add();source.navigate('/history-future');const text=source.exportRecording();source.dispose();
    const history=createHistory({recording:text,schema,router,reversible:['add'],view:({bind})=>div(bind.n)}),old=history.app;old.mount(target);
    const live=location.href,length=window.history.length;history.seek(2);old.flush();assert(location.href===live&&window.history.length===length);
    throws(()=>history.undo(2),'HISTORY_IRREVERSIBLE');const selected=old.snapshot(),branch=history.branch();
    assert(old.status==='disposed'&&branch.replaying===false&&history.status.discardedRecords===1);branch.mount(target);
    assert(location.pathname==='/history-selected'&&window.history.length===length&&branch.snapshot()===selected);
    branch.actions.add();branch.flush();assert(target.textContent==='2');throws(()=>history.redo(),'HISTORY_BRANCHED');
    history.dispose();window.history.replaceState(window.history.state,'',original);target.remove();
  });
  await test('D.2 branching after undo preserves seeded fixed-clock continuation and starts fresh paused queues',()=>{
    const schema=createActionSchema()(({action})=>({tick:action((d,s)=>{d.x+=s.random();})}));
    const source=createApp({schema,initialState:{x:0},controls:{seed:7},simulation:{tickDuration:10000,action:'tick'}});
    source.startRecording({keyframeInterval:2});source.resumeTicks();source.advanceTicks(30000);source.pauseTicks();const text=source.exportRecording();source.dispose();
    const history=createHistory({recording:text,schema,reversible:['tick']}),target=host();history.app.mount(target);history.seek(3);history.undo();
    const saved=history.app.snapshot(),reference=createApp({schema,snapshot:saved,simulation:{tickDuration:10000,action:'tick'}}),branch=history.branch();
    assert(branch.ticks.paused&&branch.ticks.queuedInputs===0);branch.mount(target);
    for(const app of [reference,branch]){app.resumeTicks();app.advanceTicks(10000);app.pauseTicks();}
    assert(branch.snapshot()===reference.snapshot());history.dispose();reference.dispose();target.remove();
  });
}
