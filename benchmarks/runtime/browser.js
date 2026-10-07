import {createApp,createDiagnostics,hashSnapshot} from '../../src/index.js';
import {resourceCounts} from '../../src/runtime/diagnostics.js';
import {encodeCheckpoint} from '../../src/runtime/serialization/checkpoint.js';
import {summarize} from '../transactions/workloads.js';
import {SEED,schemaFor,initialState,createReference,createSubject,update,replay,makeRecording,runtimeView,assertDisposed,commitsFor} from './workloads.js';

// Test/benchmark-only native hooks. Never present in timing or heap trials.
function nativeProbe() {
  const counts={writes:0,text:0,tree:0,attributes:0,styles:0},restore=[];
  const method=(prototype,name,type)=>{
    const descriptor=Object.getOwnPropertyDescriptor(prototype,name),original=descriptor.value;
    Object.defineProperty(prototype,name,{...descriptor,value:function(...args){const result=original.apply(this,args);counts.writes++;counts[type]++;return result;}});
    restore.push(()=>Object.defineProperty(prototype,name,descriptor));
  };
  const setter=(prototype,name,type)=>{
    const descriptor=Object.getOwnPropertyDescriptor(prototype,name),original=descriptor.set;
    Object.defineProperty(prototype,name,{...descriptor,set:function(value){original.call(this,value);counts.writes++;counts[type]++;}});
    restore.push(()=>Object.defineProperty(prototype,name,descriptor));
  };
  for(const name of ['appendChild','insertBefore','removeChild'])method(Node.prototype,name,'tree');
  for(const name of ['setAttribute','removeAttribute'])method(Element.prototype,name,'attributes');
  setter(CharacterData.prototype,'data','text');setter(CSSStyleDeclaration.prototype,'cssText','styles');
  return {counts,reset(){for(const key of Object.keys(counts))counts[key]=0;},dispose(){for(const close of restore.reverse())close();}};
}
function referenceView(app,workload,size,target) {
  const root=document.createElement('div');root.setAttribute('data-runtime-benchmark','');
  const button=document.createElement('button');button.appendChild(document.createTextNode('Update'));root.appendChild(button);
  const onClick=()=>{app.dispatch(0);render()};root.addEventListener('click',onClick);
  const rows=new Map(),values=[];
  const independent=['independent-bindings','pre-frame-burst'].includes(workload);
  if(independent)for(let index=0;index<size;index++){
    const span=document.createElement('span');span.setAttribute('data-index',index);const text=document.createTextNode('');span.appendChild(text);root.appendChild(span);values.push(text);
  }
  function render(){
    if(independent){for(let i=0;i<size;i++){const next=String(app.state.values[i]);if(values[i].data!==next)values[i].data=next;}}
    else {
      const keys=new Set(app.state.rows.map(row=>row.id));
      for(const [key,node] of rows)if(!keys.has(key)){root.removeChild(node);rows.delete(key);}
      for(const row of app.state.rows){
        let node=rows.get(row.id);
        if(!node){node=document.createElement('div');node.setAttribute('data-key',row.id);const span=document.createElement('span');span.appendChild(document.createTextNode(''));node.appendChild(span);root.appendChild(node);rows.set(row.id,node);}
        const text=node.firstChild.firstChild,next=String(row.value);if(text.data!==next)text.data=next;
        if(workload==='moving-elements'){const next=`transform: translateX(${row.x}px);`;if(node.style.cssText!==next)node.style.cssText=next;}
      }
      let anchor=null;
      for(let i=app.state.rows.length-1;i>=0;i--){const node=rows.get(app.state.rows[i].id);if(node.nextSibling!==anchor)root.insertBefore(node,anchor);anchor=node;}
    }
  }
  render();target.appendChild(root);
  return {render,listeners:1,dispose(){root.removeEventListener('click',onClick);target.removeChild(root);values.length=0;rows.clear();}};
}
function mounted(variant,workload,size,target,schema) {
  let app,diagnostics=null,view;
  if(variant==='reference'){app=createReference(workload,size,{schemaVersion:schema.version});view=referenceView(app,workload,size,target);}
  else {
    app=createApp({schema,initialState:initialState(size),controls:{seed:SEED},view:runtimeView(workload,size,()=>app)});
    if(variant==='diagnostics')diagnostics=createDiagnostics(app,{maxEntries:8,maxBytes:65536});app.mount(target);
    view={render:()=>app.flush(),get listeners(){return resourceCounts(app).listeners},dispose:()=>{}};
  }
  return {app,diagnostics,render:view.render,get listeners(){return view.listeners},dispose(){view.dispose();app.dispose();if(variant!=='reference')assertDisposed(app);}};
}
function controller(config) {
  const {variant,workload,size}=config,schema=schemaFor(workload),target=document.getElementById('fixture');
  if(target.childNodes.length)throw Error('Previous fixture still mounted');
  const headless=['transaction-churn','replay-throughput'].includes(workload);
  const source=workload==='replay-throughput'?makeRecording(size,config.replayRoots):null;
  let current=workload==='mount-unmount'||source?null:headless?createSubject(variant,workload,size):mounted(variant,workload,size,target,schema);
  let step=0,lastHash=null,lastState=null,lastVersion=null,lastControls=null,disposed=false;
  function cycle() {
    if(disposed)throw Error('Benchmark controller disposed');
    if(source){const started=performance.now();const result=replay(variant,source,size);lastHash=result.hash;if(lastHash!==source.hash)throw Error('Replay hash differs');return {dispatchMs:performance.now()-started,renderMs:0};}
    if(workload==='mount-unmount'){
      const started=performance.now(),subject=mounted(variant,workload,size,target,schema);
      // Retain one caller-owned frozen state, no app/DOM handles, for an outside-timing checksum.
      lastState=subject.app.state;lastVersion=subject.app.stateVersion;lastControls=variant==='reference'?null:subject.app.controls;
      subject.dispose();step++;return {dispatchMs:0,renderMs:performance.now()-started};
    }
    const started=performance.now();
    if(workload==='transaction-churn')for(let i=0;i<config.batch;i++)update(current,variant,workload,step++);
    else update(current,variant,workload,step++);
    const dispatchMs=performance.now()-started,beforeRender=performance.now();
    if(!headless)current.render();return {dispatchMs,renderMs:performance.now()-beforeRender};
  }
  function checkpoint() {
    if(source)return source.hash;
    if(lastState)return hashSnapshot(encodeCheckpoint(lastState,lastVersion,schema.version,lastControls??{clock:{mode:'manual',time:0,tick:0,tickDuration:null},random:{algorithm:'xorshift32-13-17-5/1',seed:SEED,state:SEED,draws:0}}));
    if(current.app.stateVersion!==1+commitsFor(workload,step))throw Error('Version mismatch');
    return hashSnapshot(current.app.snapshot());
  }
  function verifyDOM() {
    if(headless||workload==='mount-unmount')return;
    const state=current.app.state;
    if(['independent-bindings','pre-frame-burst'].includes(workload)){
      const nodes=[...target.querySelectorAll('[data-index]')];if(nodes.length!==size||nodes.some((n,i)=>n.textContent!==String(state.values[i])))throw Error('Bound values differ');
    } else {
      const nodes=[...target.querySelectorAll('[data-key]')];if(nodes.length!==size||nodes.some((n,i)=>Number(n.dataset.key)!==state.rows[i].id||n.textContent!==String(state.rows[i].value)||workload==='moving-elements'&&n.style.transform!==`translateX(${state.rows[i].x}px)`))throw Error('Keyed/style output differs');
    }
  }
  return {cycle,checkpoint,verifyDOM,get listeners(){return current?.listeners??0},get diagnostics(){return current?.diagnostics??null},get state(){return current?.app.state??null},
    resources(){return variant==='reference'?{listeners:current?.listeners??0}:current?resourceCounts(current.app):{}},
    dispose(){if(disposed)return;disposed=true;current?.dispose?.();if(current&&!current.dispose){const app=current.app;app.dispose();if(variant!=='reference')assertDisposed(app);}current=null;lastState=null;lastControls=null;if(target.childNodes.length)throw Error('Owned DOM survived disposal');}};
}
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function visible(){if(document.visibilityState!=='visible'||!document.hasFocus())throw Error('Benchmark target must be visible/foreground');}

window.runRuntimeBenchmark=async config=>{
  visible();const subject=controller(config),samples=[],intervals=[];let previous=null;
  try {
    for(let i=0;i<config.warmup+config.samples;i++){
      await new Promise((resolve,reject)=>requestAnimationFrame(timestamp=>{
        try {visible();const started=performance.now(),phases=subject.cycle(),scriptingMs=performance.now()-started;
          if(i>=config.warmup){samples.push({scriptingMs,...phases,timestampMs:timestamp});if(previous!==null)intervals.push(timestamp-previous);previous=timestamp;}
          resolve();
        } catch(error){reject(error);}
      }));
    }
    subject.verifyDOM();const hash=subject.checkpoint(),listeners=subject.listeners,resources=subject.resources();
    return {...config,hash,listeners,resources,samples,scriptingMs:summarize(samples.map(x=>x.scriptingMs)),dispatchMs:summarize(samples.map(x=>x.dispatchMs)),renderMs:summarize(samples.map(x=>x.renderMs)),frameIntervalsMs:summarize(intervals),frameIntervalSamplesMs:intervals};
  } finally {subject.dispose();await frame();}
};

window.probeRuntimeBenchmark=config=>{
  const subject=controller(config),probe=nativeProbe();
  try {
    // No timing samples: independently count native operations and verify the UI after each root.
    const samples=[];
    for(let i=0;i<6;i++){
      const retained=new Map([...document.querySelectorAll('[data-key]')].map(n=>[n.dataset.key,n]));
      probe.reset();subject.cycle();subject.verifyDOM();
      for(const node of document.querySelectorAll('[data-key]'))if(retained.has(node.dataset.key)&&retained.get(node.dataset.key)!==node)throw Error('Stable keyed node was replaced');
      const entry=subject.diagnostics?.snapshot().entries.at(-1);
      if(entry?.kind==='render'&&entry.counts['dom-write']!==undefined&&entry.counts['dom-write']!==probe.counts.writes)throw Error('Diagnostic writes disagree with native setters');
      if(['independent-bindings','pre-frame-burst'].includes(config.workload)&&probe.counts.text!==1)throw Error('Expected one dependent text write');
      samples.push({step:i,...probe.counts,bindingEvaluations:entry?.counts['binding-evaluation']??null,dirtyCauses:entry?.causes.length??null,listeners:subject.listeners});
    }
    return {hash:subject.checkpoint(),samples,resources:subject.resources()};
  } finally {probe.dispose();subject.dispose();}
};

window.prepareRuntimeMemory=config=>{
  const subject=controller(config);let last=null;
  window.runtimeMemoryProfile={run(count){for(let i=0;i<count;i++)subject.cycle();subject.verifyDOM();last=subject.checkpoint();return {hash:last,listeners:subject.listeners,resources:subject.resources()};},dispose(){subject.dispose();window.runtimeMemoryProfile=null;}};
  return true;
};
