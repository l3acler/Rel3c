import {createApp,createActionSchema,createDiagnostics,createReplay,div,span,button,keyed,hashSnapshot,readRecording} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
import {encodeCheckpoint,decodeCheckpoint} from '../../src/runtime/serialization/checkpoint.js';

export const WORKLOAD_VERSION=1;
export const SEED=0x5eed1234;
export const WORKLOADS=['independent-bindings','pre-frame-burst','keyed-list-edits','moving-elements','mount-unmount','transaction-churn','replay-throughput'];
export const VARIANTS=['reference','runtime','diagnostics'];
export const ROLLBACK=new Error('benchmark rollback');
export function initialState(size) {
  if(!Number.isInteger(size)||size<2||size>1024)throw RangeError('size must be 2–1024');
  const rows=Array.from({length:size},(_,id)=>({id,value:0,x:id}));
  return {values:Array(size).fill(0),rows,nextId:size,primary:rows[0],secondary:rows[0]};
}
export const indexFor=(step,size)=>(Math.imul((step+1)^SEED,2654435761)>>>0)%size;
export function mutate(state,workload,step) {
  const index=indexFor(step,state.values.length);
  if(workload==='independent-bindings'||workload==='pre-frame-burst'||workload==='replay-throughput')state.values[index]++;
  else if(workload==='keyed-list-edits') {
    if(step%3===0)state.rows[index].value++;
    else if(step%3===1)state.rows.splice(index,1,{id:state.nextId++,value:step+1,x:index});
    else state.rows.unshift(state.rows.pop());
  } else if(workload==='moving-elements')for(const row of state.rows)row.x=(row.id+step+1)%1000;
  else if(workload==='transaction-churn') {
    for(let i=0;i<24;i++){state.primary.value++;state.secondary.value++;}
    state.rows.reverse();
    if(step%5===4)throw ROLLBACK;
  } else throw RangeError('Unknown mutation workload');
}
export const commitsFor=(workload,updates)=>workload==='transaction-churn'?updates-Math.floor(updates/5):workload==='pre-frame-burst'?updates*8:updates;
export function schemaFor(workload) {
  return createActionSchema({version:`runtime-benchmark-${workload}/1`})(({action})=>({
    update:action(value=>Number.isSafeInteger(value)&&value>=0,(draft,step)=>mutate(draft,workload,step)),
  }));
}
function freeze(value,seen=new WeakSet()) {
  if(!value||typeof value!=='object'||seen.has(value))return value;
  seen.add(value);for(const child of Object.values(value))freeze(child,seen);return Object.freeze(value);
}
const controls=()=>({clock:{mode:'manual',time:0,tick:0,tickDuration:null},random:{algorithm:'xorshift32-13-17-5/1',seed:SEED,state:SEED,draws:0}});
export function createReference(workload,size,{state=initialState(size),stateVersion=1,controlState=controls(),schemaVersion=schemaFor(workload).version}={}) {
  // Benchmark-only eager clone/freeze, retained keyed DOM, whole-view scan.
  // Supports this fixture domain, not the framework's general transaction API.
  let current=freeze(structuredClone(state)),version=stateVersion,dead=false;
  return {
    get state(){return current},get stateVersion(){return version},
    dispatch(step){if(dead)throw Error('Reference disposed');if(!Number.isSafeInteger(step)||step<0)throw RangeError('step');const candidate=structuredClone(current);mutate(candidate,workload,step);current=freeze(candidate);version++;},
    snapshot:()=>encodeCheckpoint(current,version,schemaVersion,controlState),
    dispose(){dead=true;current=null;},
  };
}
export function createSubject(variant,workload,size) {
  if(variant==='reference')return {app:createReference(workload,size),diagnostics:null};
  if(!['runtime','diagnostics'].includes(variant))throw RangeError('variant');
  const schema=schemaFor(workload),app=createApp({schema,initialState:initialState(size),controls:{seed:SEED}});
  return {app,diagnostics:variant==='diagnostics'?createDiagnostics(app,{maxEntries:8,maxBytes:65536}):null};
}
export function dispatch(app,variant,workload,step) {
  try {variant==='reference'?app.dispatch(step):app.actions.update(step);}
  catch(error){if(workload!=='transaction-churn'||error!==ROLLBACK)throw error;}
}
export function update(subject,variant,workload,step) {
  for(let i=0;i<(workload==='pre-frame-burst'?8:1);i++)dispatch(subject.app,variant,workload,step);
}
export function assertEquivalent(actual,expected,message='Equivalent-work checkpoint failed') {
  if(actual!==expected)throw Error(message);
}
export function assertDisposed(app) {
  if(!Object.values(resourceCounts(app)).every(value=>value===0))throw Error('Owned resources survived disposal');
}
export function makeRecording(size,roots) {
  const schema=schemaFor('replay-throughput');
  const app=createApp({schema,initialState:initialState(size),controls:{seed:SEED}});
  app.startRecording({mode:'session',maxActions:roots,maxBytes:8388608,keyframeInterval:32});
  for(let step=0;step<roots;step++)app.actions.update(step);
  const recording=app.exportRecording(),hash=hashSnapshot(app.snapshot());
  if(app.recording.records!==roots)throw Error('Recording truncated');app.dispose();assertDisposed(app);
  return {recording,hash,roots,schema};
}
export function replay(variant,source,size) {
  if(variant==='reference') {
    const log=readRecording(source.recording),base=decodeCheckpoint(log.baseline.snapshot,source.schema.version);
    const app=createReference('replay-throughput',size,{state:base.state,stateVersion:base.stateVersion,controlState:base.controls,schemaVersion:source.schema.version});
    try {
      for(const record of log.records) {
        const root=record.root;
        if(root.kind!=='dispatch'||root.packet.name!=='update'||root.packet.args.length!==1||record.actions!==1||record.commits!==1)throw Error('Flat-log reference requires one valid committed update per root');
        app.dispatch(root.packet.args[0]);assertEquivalent(hashSnapshot(app.snapshot()),record.after.hash);
      }
      return {hash:hashSnapshot(app.snapshot()),roots:log.records.length};
    } finally {app.dispose();}
  }
  const controller=createReplay({recording:source.recording,schema:source.schema});
  if(variant==='diagnostics')createDiagnostics(controller.app,{maxEntries:8,maxBytes:65536});
  try {
    const status=controller.run();if(status.status!=='complete'||status.divergence)throw Error('Replay diverged');
    return {hash:hashSnapshot(controller.app.snapshot()),roots:status.position};
  } finally {const app=controller.app;controller.dispose();assertDisposed(app);}
}

export function runtimeView(workload,size,app) {
  return ({bind,derive})=>div({'data-runtime-benchmark':''},
    button({onClick:()=>app().actions.update(0)},'Update'),
    workload==='independent-bindings'||workload==='pre-frame-burst'
      ?Array.from({length:size},(_,index)=>span({'data-index':index},derive(s=>s.values[index])))
      :keyed(bind.rows,row=>row.id,ctx=>div({'data-key':ctx.key,
        ...(workload==='moving-elements'?{style:{transform:ctx.derive(()=>`translateX(${ctx.value.x}px)`)}}:{})},span(ctx.item.value))));
}
