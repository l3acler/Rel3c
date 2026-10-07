import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {VARIANTS,WORKLOAD_VERSION,SEED} from '../benchmarks/runtime/workloads.js';
import {summarize,caseOrder} from '../benchmarks/transactions/workloads.js';
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile);
const args=process.argv.slice(2);if(args.some(a=>a!=='--quick'))throw Error('Only --quick is supported');
const quick=args.includes('--quick');
const config=quick?{sizes:[16,64],warmup:2,samples:6,rounds:1,batch:4,replayRoots:16,memorySamples:8}
  :{sizes:[64,256],warmup:8,samples:30,rounds:3,batch:8,replayRoots:128,memorySamples:60};
async function fingerprints(folders,extra=[]) {
  const names=[...extra];
  async function visit(folder){for(const entry of await readdir(path.join(root,folder),{withFileTypes:true})){const name=folder+'/'+entry.name;if(entry.isDirectory())await visit(name);else names.push(name);}}
  for(const folder of folders)await visit(folder);
  return Promise.all([...new Set(names)].sort().map(async file=>({file,sha256:createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')})));
}
const sourceFiles=await fingerprints(['src','benchmarks/runtime'],['scripts/bench-tooling-node.js','scripts/bench-tooling-worker.js','benchmarks/transactions/workloads.js']);
const results=[];
console.log('Headless tooling measurements: '+JSON.stringify(config));
for(let round=0;round<config.rounds;round++)for(const size of config.sizes)for(const workload of ['transaction-churn','replay-throughput'])for(const variant of caseOrder(round,VARIANTS)) {
  const trial={...config,round,size,workload,variant};
  const timed=await exec(process.execPath,[path.join(root,'scripts/bench-tooling-worker.js'),JSON.stringify({...trial,mode:'timing'})],{maxBuffer:16*1024*1024});
  const timing=JSON.parse(timed.stdout);
  let memory=null;
  if(round===0){const profiled=await exec(process.execPath,['--expose-gc',path.join(root,'scripts/bench-tooling-worker.js'),JSON.stringify({...trial,mode:'memory'})],{maxBuffer:16*1024*1024});memory=JSON.parse(profiled.stdout);}
  results.push({round,size,workload,variant,timing,memory});
  console.log(`${round} ${workload} n=${size} ${variant} median=${timing.timingMs.median.toFixed(3)}ms p95=${timing.timingMs.p95.toFixed(3)}ms`);
}
const summaries=[];
for(const size of config.sizes)for(const workload of ['transaction-churn','replay-throughput']) {
  const group=results.filter(r=>r.size===size&&r.workload===workload),expected=group[0];
  for(const row of group){if(row.timing.hash!==expected.timing.hash||row.memory&&row.memory.hash!==expected.memory.hash)throw Error('Equivalent-work final hash mismatch');}
  for(const variant of VARIANTS){const trials=group.filter(r=>r.variant===variant),samples=trials.flatMap(r=>r.timing.samplesMs);
    summaries.push({size,workload,variant,timingMs:summarize(samples),roundMediansMs:trials.map(r=>r.timing.timingMs.median),
      ...(workload==='replay-throughput'?{rootsPerSecond:summarize(samples.map(ms=>config.replayRoots*1000/ms))}:{perAttemptedActionMs:summarize(samples.map(ms=>ms/config.batch))}),equivalentHash:expected.timing.hash});}
}
for(const entry of sourceFiles)if(createHash('sha256').update(await readFile(path.join(root,entry.file))).digest('hex')!==entry.sha256)throw Error('Benchmark source changed during run: '+entry.file);
const report={kind:'node-runtime-tooling',formatVersion:1,recordedAt:new Date().toISOString(),quick,workloadVersion:WORKLOAD_VERSION,seed:SEED,config,
  environment:{node:process.version,v8:process.versions.v8,platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,totalMemoryBytes:os.totalmem()},
  sourceFiles,methodology:{timing:'Fresh child per variant/workload/size/round. No explicit GC or memory observer. Churn sample contains batch attempted actions including rollback; final hash/dispose outside timing. Replay sample includes import/preflight/create/run/per-root hashes/final hash/dispose; source recording built outside timing.',
    reference:'Benchmark-only eager structuredClone/freeze state reference; replay supports only valid flat one-action logs and verifies every endpoint hash. It omits general runtime guards, nested FIFO, input/effect/routing/reactivity features. Same fixture effects/versions/alias graph and endpoint hashes; not a frontend-framework comparison.',
    memory:'Separate fresh --expose-gc process for round 0, samples include harness/observer/JIT overhead. Natural GC events restricted to work interval; forced collections separately labeled. Heap high water is sampled, not allocated bytes/true peak; post-disposal deltas are trends, not leak proof.',
    ordering:'Rotate variant order each round; cases run sequentially; do not run other test/benchmark jobs concurrently.'},summaries,results};
await mkdir(path.join(root,'benchmarks/results'),{recursive:true});
const file=`benchmarks/results/tooling-node-${quick?'quick-':''}${Date.now()}-${randomUUID().slice(0,8)}.json`;
await writeFile(path.join(root,file),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('RESULT '+file);
