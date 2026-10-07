import test from 'node:test';
import assert from 'node:assert/strict';
import {hashSnapshot} from '../../src/index.js';
import {initialState,indexFor,WORKLOADS,VARIANTS,createSubject,update,commitsFor,assertDisposed,makeRecording,replay,SEED} from './workloads.js';

test('D.5 fixtures preserve aliases and seeded indices without ambient randomness',()=>{
  const state=initialState(64);assert.equal(state.primary,state.secondary);assert.equal(state.primary,state.rows[0]);
  assert.deepEqual(Array.from({length:20},(_,i)=>indexFor(i,64)),Array.from({length:20},(_,i)=>indexFor(i,64)));
  assert.ok(indexFor(0,64)>=0&&indexFor(0,64)<64);assert.throws(()=>initialState(1),RangeError);assert.equal(SEED,0x5eed1234);
});
for(const workload of WORKLOADS.filter(w=>!['mount-unmount','replay-throughput'].includes(w)))test('D.5 equivalent seeded action/alias/version checkpoints: '+workload,()=>{
  const subjects=VARIANTS.map(variant=>({variant,...createSubject(variant,workload,32)}));
  try {
    for(let step=0;step<30;step++){
      const before=subjects.map(s=>s.app.snapshot());
      for(const subject of subjects)update(subject,subject.variant,workload,step);
      const hashes=subjects.map(s=>hashSnapshot(s.app.snapshot()));assert.equal(new Set(hashes).size,1);
      for(const subject of subjects){assert.equal(subject.app.stateVersion,1+commitsFor(workload,step+1));assert.equal(subject.app.state.primary,subject.app.state.secondary);}
      if(workload==='transaction-churn'&&step%5===4)for(let i=0;i<subjects.length;i++)assert.equal(subjects[i].app.snapshot(),before[i]);
    }
  } finally {for(const subject of subjects){subject.app.dispose();if(subject.variant!=='reference')assertDisposed(subject.app);}}
});
test('D.5 three-variant flat-log replay checks each endpoint and completes at the source hash',()=>{
  const source=makeRecording(32,40);for(const variant of VARIANTS){const result=replay(variant,source,32);assert.equal(result.hash,source.hash);assert.equal(result.roots,40);}
});
test('D.5 pre-frame bursts commit eight transactions for one selected property',()=>{
  const subject=createSubject('runtime','pre-frame-burst',32),before=subject.app.state;
  update(subject,'runtime','pre-frame-burst',0);assert.equal(subject.app.state.values[indexFor(0,32)],8);assert.equal(before.values[indexFor(0,32)],0);assert.equal(subject.app.stateVersion,9);subject.app.dispose();assertDisposed(subject.app);
});
test('D.5 sampled alias churn rollback never publishes a partially reordered graph',()=>{
  const subject=createSubject('diagnostics','transaction-churn',16);
  for(let i=0;i<4;i++)update(subject,'diagnostics','transaction-churn',i);
  const state=subject.app.state,snapshot=subject.app.snapshot();update(subject,'diagnostics','transaction-churn',4);
  assert.equal(subject.app.state,state);assert.equal(subject.app.snapshot(),snapshot);assert.equal(subject.app.state.primary.value,4*48);subject.app.dispose();assertDisposed(subject.app);
});
