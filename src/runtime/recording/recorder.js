import { fail } from '../errors.js';
import { RUNTIME_VERSION } from '../serialization/checkpoint.js';
import { recordingPolicy, recordCodec, byteLength, STATUS_RESERVE, endpoint, errorSummary } from './format.js';

export function createRecorder(options, capture, schemaVersion) {
  const policy=recordingPolicy(options), initial=capture();
  let baseline={sequence:0,...initial}, end=baseline, records=[], status='active', reason=null;
  let evictedRecords=0,evictedActions=0,sequence=0,sinceKeyframe=0,working=null,disposed=false;
  const wire=()=>({format:'mini-framework-recording',version:1,runtimeVersion:RUNTIME_VERSION,schemaVersion,policy,
    status,reason,evictedRecords,evictedActions,baseline,records,end});
  const bytes=()=>byteLength(JSON.stringify({...wire(),status:'active',reason:null}))+STATUS_RESERVE;
  const slots=()=>records.reduce((sum,record)=>sum+Math.max(1,record.actions),0);
  if(bytes()>policy.maxBytes) fail('RECORDING_LIMIT','Recording budget cannot retain its initial baseline/end and metadata.');
  function limit(why) {status='limit-reached';reason=why;}
  function append(event) {
    if(!working||working.overflow)return;
    try {
      const text=recordCodec.encode(event), size=byteLength(JSON.stringify(text))+1;
      if(working.bytes+size>policy.maxBytes){working.overflow='byte-limit';working.events.length=0;return;}
      working.bytes+=size;working.events.push(text);
    } catch {working.overflow='capture-failed';working.events.length=0;}
  }
  function evict(count, point) {
    for(const record of records.splice(0,count)){evictedRecords++;evictedActions+=Math.max(1,record.actions);}
    baseline=point;
  }
  function accept(work, next, outcome, error) {
    const point={sequence:++sequence,...next}, after=endpoint(next.snapshot,next.route);
    if(work.overflow) {
      if(policy.mode==='session'||work.overflow==='capture-failed'){limit(work.overflow);return;}
      const saved={baseline,end,records:[...records],evictedRecords,evictedActions};
      evict(records.length,point);evictedRecords++;evictedActions+=Math.max(1,work.actions);end=point;sinceKeyframe=0;
      if(bytes()>policy.maxBytes){({baseline,end,records,evictedRecords,evictedActions}=saved);limit('baseline-limit');}
      return;
    }
    const charge=Math.max(1,work.actions), due=sinceKeyframe+charge>=policy.keyframeInterval;
    const record={sequence,root:work.root,events:work.events,actions:work.actions,
      commits:after.stateVersion-work.before.stateVersion,after,checkpoint:due?next.snapshot:null,
      outcome,error:outcome==='failed'?errorSummary(error):null};
    const oldEnd=end;records.push(record);end=point;
    if(policy.mode==='session') {
      const why=slots()>policy.maxActions?'action-limit':bytes()>policy.maxBytes?'byte-limit':null;
      if(why){records.pop();end=oldEnd;limit(why);return;}
    } else {
      const saved={baseline,records:[...records],evictedRecords,evictedActions};
      while(slots()>policy.maxActions||bytes()>policy.maxBytes) {
        const index=records.findIndex(item=>item.checkpoint!==null);
        if(index<0){evict(records.length,point);break;}
        const keyframe=records[index];evict(index+1,{sequence:keyframe.sequence,snapshot:keyframe.checkpoint,route:keyframe.after.route});
      }
      if(bytes()>policy.maxBytes){({baseline,records,evictedRecords,evictedActions}=saved);records.pop();end=oldEnd;limit('baseline-limit');return;}
    }
    sinceKeyframe=due||!records.length?0:sinceKeyframe+charge;
  }
  return Object.freeze({
    get active(){return status==='active'&&!disposed;},
    get busy(){return working!==null;},
    run(root,run) {
      if(status!=='active'||working)return run();
      const before=endpoint(end.snapshot,end.route);
      const work={root:null,events:[],actions:0,next:1,packets:[],bytes:0,overflow:null,before};working=work;
      try {
        work.root=recordCodec.encode(root);work.bytes=byteLength(JSON.stringify(work.root));
        if(work.bytes>policy.maxBytes){work.overflow='byte-limit';work.root=null;work.bytes=0;}
      } catch {work.overflow='capture-failed';}
      let result, failure, failed=false;
      try {result=run();}catch(error){failure=error;failed=true;}
      try {
        const next=capture();accept(work,next,failed?'failed':'succeeded',failed?failure:undefined);
      } catch {limit('capture-failed');}
      finally {working=null;}
      if(failed)throw failure;
      return result;
    },
    queued(name,args,parent) {
      if(!working)return null;
      const id=working.next++;working.actions++;
      if(working.actions>policy.maxActions){working.overflow='action-limit';working.events.length=0;}
      append({type:'action',phase:'queued',id,parent:parent??null,packet:{version:1,kind:'action',name,args}});return id;
    },
    action(id,phase,stateVersion,error) {
      if(id===null||id===undefined)return;
      append({type:'action',phase,id,stateVersion,error:phase==='failed'?errorSummary(error):null});
    },
    input(input,queued) {
      if(!working)return null;
      const id=working.next++,parent=working.packets.at(-1)??null;
      working.packets.push(id);append({type:'input',phase:'dispatched',id,parent,input,queued});return id;
    },
    inputEnd(id,stateVersion,error,failed = false) {
      if(!working||id===null)return;
      working.packets.pop();append({type:'input',phase:failed?'failed':'succeeded',id,stateVersion,error:failed?errorSummary(error):null});
    },
    stop(){if(status==='active')status='stopped';},
    export(){return JSON.stringify(wire());},
    get status(){return Object.freeze({status,mode:policy.mode,reason,records:records.length,actions:slots(),
      bytes:disposed?0:bytes(),maxBytes:policy.maxBytes,maxActions:policy.maxActions,keyframeInterval:policy.keyframeInterval,
      baselineSequence:baseline?.sequence??0,endSequence:end?.sequence??0,evictedRecords,evictedActions});},
    counts:()=>({recordingRecords:records.length,recordingBytes:disposed?0:bytes(),recordingScratch:working?.bytes??0}),
    dispose(){disposed=true;status='stopped';working=null;records=[];baseline=end=null;},
  });
}
