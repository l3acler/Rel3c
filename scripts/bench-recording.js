#!/usr/bin/env node
// Headless, deterministic 20 Hz authoritative updates; no wall-clock waiting.
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createApp,createActionSchema,createReplay,readRecording,serializeRecording} from '../src/index.js';
const updates=1200;
const statusReads=Number(process.env.BENCH_STATUS_READS || 10000);
const schema=createActionSchema({version:'recorder-bench/1'})(({action})=>({
  update:action(value=>typeof value?.frame==='number',(draft,value)=>{draft.world=value;}),
}));
function payload(frame) {
  return {frame,time:frame*50,match:'arena-日本😀',
    players:Array.from({length:4},(_,id)=>({id,x:(frame+id)%15,y:(frame*3+id)%15,score:frame%100,hp:3,keys:['up','bomb'],name:`Player ${id}`})),
    tiles:Array.from({length:225},(_,id)=>(id+frame)%4),
    bombs:Array.from({length:12},(_,id)=>({id,owner:id%4,x:id,y:(frame+id)%15,fuse:frame%60})),
    events:[{kind:'authoritative',text:'ready\n"arena"\\同期',frame}]};
}
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.ceil(sorted.length*.95)-1]};};
function run(recording) {
  const app=createApp({schema,initialState:{world:null}});
  if(recording)app.startRecording({mode:'session',maxActions:2000,maxBytes:67108864,keyframeInterval:64});
  const times=[],bytes=[];
  for(let i=0;i<updates;i++) {
    const value=payload(i),start=performance.now();app.actions.update(value);times.push(performance.now()-start);
    bytes.push(recording?app.recording.bytes:0);
  }
  const start=performance.now();for(let i=0;i<statusReads;i++)void app.recording;
  const statusReadUs=(performance.now()-start)*1000/statusReads;
  if(recording){
    assert.equal(app.recording.records,updates);assert.equal(app.recording.status,'active');
    const text=app.exportRecording();assert.equal(serializeRecording(readRecording(text)),text);
    const replay=createReplay({recording:text,schema});replay.run();
    assert.equal(replay.app.snapshot(),app.snapshot());replay.dispose();
  }
  app.dispose();return {times,bytes,statusReadUs};
}
// Warm engine/code paths before collecting either variant.
const warm=createApp({schema,initialState:{world:null}});warm.startRecording({mode:'session',maxActions:2000,maxBytes:67108864});
for(let i=0;i<150;i++)warm.actions.update(payload(i));warm.dispose();
const off=run(false),on=run(true);
const windows={early:[0,200],middle:[500,700],late:[1000,1200]};
const results=Object.fromEntries(Object.entries(windows).map(([name,[a,b]])=>[name,{
  withoutRecordingMs:stats(off.times.slice(a,b)),withRecordingMs:stats(on.times.slice(a,b)),
  // Differences of quantiles, not paired per-update latency samples.
  recordingCostMs:{median:stats(on.times.slice(a,b)).median-stats(off.times.slice(a,b)).median,p95:stats(on.times.slice(a,b)).p95-stats(off.times.slice(a,b)).p95},
  retainedBytes:on.bytes[b-1],
}]));
console.log(JSON.stringify({environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model},updates,statusReads,simulatedSeconds:updates/20,windows:results,statusReadUs:on.statusReadUs},null,2));
