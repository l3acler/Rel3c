import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {withLocalBrowser} from './local-browser.js';
import {WORKLOAD_VERSION,WORKLOADS,VARIANTS,SEED} from '../benchmarks/runtime/workloads.js';
import {caseOrder,summarize} from '../benchmarks/transactions/workloads.js';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
if(args.some(a=>a!=='--quick'))throw Error('Only --quick is supported');
const quick=args.includes('--quick');
const config=quick?{sizes:[16,64],warmup:2,samples:6,rounds:1,batch:4,replayRoots:16,memorySamples:8}
  :{sizes:[64,256],warmup:8,samples:30,rounds:3,batch:8,replayRoots:128,memorySamples:60};
const files=['scripts/bench-tooling-browser.js','scripts/local-browser.js','scripts/dev-server.js','benchmarks/transactions/workloads.js'];
async function visit(folder){for(const entry of await readdir(path.join(root,folder),{withFileTypes:true})){const name=folder+'/'+entry.name;if(entry.isDirectory())await visit(name);else files.push(name);}}
await visit('src');await visit('benchmarks/runtime');
const sourceFiles=await Promise.all(files.sort().map(async file=>({file,sha256:createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')})));
const results=[],probes=[],memory=[];
console.log('Browser runtime measurements: '+JSON.stringify(config));
await withLocalBrowser(async({open,browserVersion,flags})=>{
  const fixture=async()=>{const page=await open('benchmarks/runtime/');await page.waitFor('typeof window.runRuntimeBenchmark === "function"');return page;};
  const close=page=>page.command('Page.close');
  const capability=async(page,method)=>{try{return {available:true,value:await page.command(method)};}catch(error){return {available:false,reason:error.message};}};
  const environmentPage=await fixture(),browserEnvironment=await environmentPage.evaluate('({userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,devicePixelRatio,visibility:document.visibilityState,foreground:document.hasFocus(),timingClock:"performance.now",nativeAnimationFrames:true})');await close(environmentPage);
  // Separate correctness/native-counter pages before clean timing. Hooks restored even on failure.
  for(const size of config.sizes)for(const workload of WORKLOADS)for(const variant of VARIANTS){
    const page=await fixture(),trial={...config,size,workload,variant};
    try {const result=await page.evaluate(`window.probeRuntimeBenchmark(${JSON.stringify(trial)})`);probes.push({size,workload,variant,...result});}
    finally{await close(page);}
  }
  for(let round=0;round<config.rounds;round++)for(const size of config.sizes)for(const workload of WORKLOADS)for(const variant of caseOrder(round,VARIANTS)){
    const page=await fixture(),trial={...config,round,size,workload,variant};
    try {const result=await page.evaluate(`window.runRuntimeBenchmark(${JSON.stringify(trial)})`);results.push(result);
      console.log(`${round} ${workload} n=${size} ${variant} median=${result.scriptingMs.median.toFixed(3)}ms p95=${result.scriptingMs.p95.toFixed(3)}ms`);}
    finally{await close(page);}
  }
  // Memory/forced collections run only after timing, in distinct fresh pages.
  for(const size of config.sizes)for(const workload of WORKLOADS)for(const variant of VARIANTS){
    const page=await fixture(),trial={...config,size,workload,variant};
    try {
      await page.evaluate(`window.prepareRuntimeMemory(${JSON.stringify(trial)});window.runtimeMemoryProfile.run(${config.warmup});true`);
      const collect=async label=>{const start=performance.now(),result=await capability(page,'HeapProfiler.collectGarbage');return {label,...result,roundTripMs:performance.now()-start};};
      const beforeCollection=await collect('before-work'),baselineHeap=await capability(page,'Runtime.getHeapUsage'),baselineDOM=await capability(page,'Memory.getDOMCounters');
      const heapSamples=[];let state;
      for(let i=0;i<config.memorySamples;i+=4){state=await page.evaluate(`window.runtimeMemoryProfile.run(${Math.min(4,config.memorySamples-i)})`);heapSamples.push({sample:Math.min(i+4,config.memorySamples),heap:await capability(page,'Runtime.getHeapUsage')});}
      const liveCollection=await collect('after-work-live-subject'),liveHeap=await capability(page,'Runtime.getHeapUsage'),liveDOM=await capability(page,'Memory.getDOMCounters');
      await page.evaluate('window.runtimeMemoryProfile.dispose();true');
      const disposedCollection=await collect('after-disposal'),disposedHeap=await capability(page,'Runtime.getHeapUsage'),disposedDOM=await capability(page,'Memory.getDOMCounters');
      memory.push({size,workload,variant,state,baselineHeap,baselineDOM,heapSamples,liveHeap,liveDOM,disposedHeap,disposedDOM,forcedCollections:[beforeCollection,liveCollection,disposedCollection],naturalGcEvents:null});
      console.log(`memory ${workload} n=${size} ${variant} complete`);
    }finally{await close(page);}
  }
  const summaries=[];
  for(const size of config.sizes)for(const workload of WORKLOADS){
    const group=results.filter(r=>r.size===size&&r.workload===workload),pgroup=probes.filter(r=>r.size===size&&r.workload===workload),mgroup=memory.filter(r=>r.size===size&&r.workload===workload);
    for(const rows of [group,pgroup,mgroup]){const expected=rows[0].hash??rows[0].state.hash;for(const row of rows)if((row.hash??row.state.hash)!==expected)throw Error('Equivalent-work hash mismatch: '+workload);}
    for(const variant of VARIANTS){const trials=group.filter(r=>r.variant===variant),samples=trials.flatMap(r=>r.samples);
      summaries.push({size,workload,variant,scriptingMs:summarize(samples.map(s=>s.scriptingMs)),dispatchMs:summarize(samples.map(s=>s.dispatchMs)),renderMs:summarize(samples.map(s=>s.renderMs)),frameIntervalsMs:summarize(trials.flatMap(r=>r.frameIntervalSamplesMs)),roundMediansMs:trials.map(r=>r.scriptingMs.median),
        ...(workload==='replay-throughput'?{rootsPerSecond:summarize(samples.map(s=>config.replayRoots*1000/s.scriptingMs))}:{}),hash:trials[0].hash,listeners:trials[0].listeners});}
  }
  // Catch source changes during a long measurement instead of labeling mixed code as one campaign.
  for(const entry of sourceFiles)if(createHash('sha256').update(await readFile(path.join(root,entry.file))).digest('hex')!==entry.sha256)throw Error('Benchmark source changed during run: '+entry.file);
  const report={kind:'browser-runtime-tooling',formatVersion:1,recordedAt:new Date().toISOString(),quick,workloadVersion:WORKLOAD_VERSION,seed:SEED,config,browserVersion,browserEnvironment,chromeFlags:flags,
    machine:{node:process.version,cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,totalMemoryBytes:os.totalmem(),platform:os.platform(),release:os.release(),arch:os.arch()},sourceFiles,
    methodology:{timing:'Fresh foreground target per trial; real RAF callback scripting, dispatch and explicit flush/mount-dispose durations. Warmup excluded. Native probes, hashing, UI verification and output outside clean timing; replay includes import/preflight/run/hash/disposal. Diagnostics variant captures bounded public instrumentation during work. No native prototype hooks or forced GC in timing.',
      reference:'Benchmark-only eager structuredClone/freeze state and full-view DOM scan with retained keyed elements, one delegated listener. Same fixture actions, pixels/order/keyed identity and endpoint hashes; fewer general guards/anchors/lifecycle features than runtime. Not another frontend framework.',
      probes:'Separate un-timed native method/setter hooks count successful tree/text/attribute/style writes; verify diagnostics against native calls, exact independent/burst text writes and retained key identity. Counter hooks restored on failure.',
      frames:'Native timestamp intervals are between captured RAF callbacks, not total frame/paint/input latency, refresh rate or tracing-based scripting budgets.',
      memory:'Separate fresh target per profile after timing. CDP heap usage and DOM/listener counters include harness/modules/JIT/renderer overhead. Forced-GC CDP round trips separately labeled, not GC pause duration. Natural browser GC pause API is not collected (null); heap samples are not allocated bytes/true peak/leak proof.',
      ordering:'Rotate variants by round, sequential cases. One isolated Chrome process/profile per campaign. Do not run other tests/benchmarks concurrently.'},summaries,results,probes,memory};
  await mkdir(path.join(root,'benchmarks/results'),{recursive:true});const file=`benchmarks/results/tooling-browser-${quick?'quick-':''}${Date.now()}-${randomUUID().slice(0,8)}.json`;
  await writeFile(path.join(root,file),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('RESULT '+file);
});
