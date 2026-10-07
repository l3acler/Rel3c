import { createApp, createActionSchema, createDiagnostics, createInspector, div, p, button } from '../../src/index.js';
/** @typedef {{count:number,unrelated:string}} State */
/** @type {ReturnType<typeof createActionSchema<State>>} */
const build = createActionSchema({version:'inspector-example/1'});
const schema=build(({action})=>({increment:action(s=>{s.count++})}));
export const app=createApp({schema,initialState:{count:0,unrelated:'This binding stays untouched.'},
  view:({bind,actions})=>div(p({id:'counter'},'Count: ',bind.count),p(bind.unrelated),
    button({id:'increment',onClick:actions.increment},'Increment'),
    button({id:'burst',onClick:()=>{actions.increment();actions.increment();actions.increment()}},'Three commits, one render'))});
export const diagnostics=createDiagnostics(app,{maxEntries:64,maxBytes:256000});
app.mount();
app.startRecording({maxActions:64,maxBytes:256000,keyframeInterval:8});
const target=document.getElementById('inspector');
if(!target)throw Error('Inspector host missing.');
export const inspector=createInspector({diagnostics,target});
app.onDispose(()=>inspector.dispose());
