import { createApp, createReplay, createActionSchema, readRecording, div, p, button, textarea, label } from '../../src/index.js';
/** @typedef {{ n:number, draw:number, time:number, summary:string, exported:string }} State */
/** @typedef {{ summary:string, exported:string }} Output */
/** @type {ReturnType<typeof createActionSchema<State>>} */
const build = createActionSchema({ version:'recording-example/1' });
export const schema = build(({action})=>({
  sample:action((draft,services)=>{draft.n++;draft.draw=services.random();draft.time=services.now();}),
  output:action(/** @returns {value is Output} */ value=>!!value&&typeof value==='object'&&
    'summary' in value&&typeof value.summary==='string'&&'exported' in value&&typeof value.exported==='string',
    (draft,value)=>{draft.summary=value.summary;draft.exported=value.exported;}),
}));
/** @param {'recent'|'session'} mode */
function start(mode) {
  app.stopRecording();app.actions.output({summary:`Recording ${mode}; limit: 20 action slots / 64,000 bytes.`,exported:''});
  app.startRecording({mode,maxActions:20,maxBytes:64000,keyframeInterval:4});
}
function exportCaptured() {
  app.stopRecording();const text=app.exportRecording(),log=readRecording(text,{schemaVersion:schema.version});
  app.actions.output({summary:`${log.status}: ${log.records.length} roots, baseline ${log.baseline.sequence}, end ${log.end.sequence}, ${log.evictedRecords} evicted; ${log.reason??'no limit reached'}. Validated locally.`,exported:text});
}
/** @param {string} recording */
function makeReplay(recording) {
  return createReplay({recording,schema,
    view:({bind})=>p('Replayed samples: ',bind.n,'; controlled draw: ',bind.draw,'; logical microseconds: ',bind.time)});
}
/** @type {ReturnType<typeof makeReplay> | null} */
export let replay=null;
function replayCaptured() {
  replay?.dispose();
  replay=makeReplay(app.state.exported);
  const target=document.getElementById('replay-host');
  if(!target)throw Error('Replay host is missing.');
  replay.app.mount(target);const result=replay.run();replay.app.flush();
  app.actions.output({summary:`Replay ${result.status}: ${result.position}/${result.total} roots; ${result.divergence?.reason??'all hashes matched'}.`,exported:app.state.exported});
}
export const app=createApp({schema,initialState:{n:0,draw:0,time:0,summary:'Choose a recording mode.',exported:''},controls:{seed:7},
  view:({bind,actions,derive,onDispose})=>{onDispose(()=>replay?.dispose());return div(
    p('Committed samples: ',bind.n,'; controlled draw: ',bind.draw,'; logical microseconds: ',bind.time),
    button({id:'recent',onClick:()=>start('recent')},'Start recent'),button({id:'session',onClick:()=>start('session')},'Start session'),
    button({id:'sample',onClick:actions.sample},'Sample'),button({id:'export',onClick:exportCaptured},'Stop, export and validate'),
    button({id:'replay',disabled:derive(state=>!state.exported),onClick:replayCaptured},'Replay captured prefix'),
    div({id:'replay-host','aria-live':'polite'}),
    p({id:'summary'},bind.summary),label({for:'recording-export'},'Explicit recording export'),
    textarea({id:'recording-export',readOnly:true,value:bind.exported})
  );}});
app.mount();
