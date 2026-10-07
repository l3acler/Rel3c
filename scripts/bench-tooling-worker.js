import {performance,PerformanceObserver,constants} from 'node:perf_hooks';
import {createSubject,update,replay,makeRecording,assertEquivalent,assertDisposed,commitsFor} from '../benchmarks/runtime/workloads.js';
import {hashSnapshot} from '../src/index.js';
import {summarize} from '../benchmarks/transactions/workloads.js';

const config=JSON.parse(process.argv[2]);
if(!['transaction-churn','replay-throughput'].includes(config.workload)||!['timing','memory'].includes(config.mode))throw Error('Invalid worker configuration');
const source=config.workload==='replay-throughput'?makeRecording(config.size,config.replayRoots):null;
let subject=config.workload==='transaction-churn'?createSubject(config.variant,config.workload,config.size):null,step=0,lastHash=null;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function perform() {
  if(source){const result=replay(config.variant,source,config.size);assertEquivalent(result.hash,source.hash);lastHash=result.hash;}
  else for(let i=0;i<config.batch;i++)update(subject,config.variant,config.workload,step++);
}
function finish() {
  if(subject){
    if(subject.app.stateVersion!==1+commitsFor(config.workload,step))throw Error('Version mismatch');
    lastHash=hashSnapshot(subject.app.snapshot());const app=subject.app;app.dispose();
    if(config.variant!=='reference')assertDisposed(app);subject=null;
  }
  return {hash:lastHash,attemptedActions:step,roots:source?.roots??null};
}
for(let i=0;i<config.warmup;i++)perform();
let result;
if(config.mode==='timing') {
  const samplesMs=[];
  for(let i=0;i<config.samples;i++){const started=performance.now();perform();samplesMs.push(performance.now()-started);}
  result={samplesMs,timingMs:summarize(samplesMs),...finish()};
} else {
  if(typeof global.gc!=='function')throw Error('Memory trial requires --expose-gc');
  const gcEvents=[],kindNames=new Map([[constants.NODE_PERFORMANCE_GC_MAJOR,'major'],[constants.NODE_PERFORMANCE_GC_MINOR,'minor'],[constants.NODE_PERFORMANCE_GC_INCREMENTAL,'incremental'],[constants.NODE_PERFORMANCE_GC_WEAKCB,'weak-callback']]);
  const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())gcEvents.push({startTimeMs:entry.startTime,durationMs:entry.duration,kind:kindNames.get(entry.detail.kind)??String(entry.detail.kind)})});
  observer.observe({entryTypes:['gc']});
  const forced=[];
  const collect=async label=>{const started=performance.now();global.gc();forced.push({label,durationMs:performance.now()-started});await settle();await settle();};
  await collect('before-work');const baseline=process.memoryUsage(),heapSamples=[];
  const started=performance.now();
  for(let i=0;i<config.memorySamples;i++){perform();heapSamples.push({sample:i+1,...process.memoryUsage()});if((i+1)%5===0)await settle();}
  const ended=performance.now();await settle();await settle();const naturalGcEvents=gcEvents.filter(e=>e.startTimeMs>=started&&e.startTimeMs<ended);
  const beforeGc=process.memoryUsage();await collect('after-work-live-subject');const retainedLive=process.memoryUsage();
  const correctness=finish();await collect('after-disposal');const retainedDisposed=process.memoryUsage();observer.disconnect();
  result={baseline,heapSamples,beforeGc,retainedLive,retainedDisposed,forced,naturalGcEvents,
    naturalGcDurationMs:summarize(naturalGcEvents.map(e=>e.durationMs)),
    sampledHeapHighWaterDeltaBytes:Math.max(baseline.heapUsed,...heapSamples.map(x=>x.heapUsed))-baseline.heapUsed,
    retainedLiveDeltaBytes:retainedLive.heapUsed-baseline.heapUsed,retainedDisposedDeltaBytes:retainedDisposed.heapUsed-baseline.heapUsed,
    ...correctness};
}
process.stdout.write(JSON.stringify({...config,...result})+'\n');
