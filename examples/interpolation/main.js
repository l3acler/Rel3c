import {createApp,createActionSchema,div,p,span,input,button} from '../../src/index.js';
/** @typedef {{x:number,time:number,text:string,key:string,result:string}} State */
/** @type {typeof createActionSchema<State>} */
const createSchema=createActionSchema;
/** @param {unknown} value @returns {value is import('../../src/index.js').ExternalInput} */
const external=value=>!!value&&typeof value==='object'&&'version' in value&&value.version===1;
export const schema=createSchema({version:'interpolation-example/1'})(({action})=>({
  tick:action((draft,services)=>{draft.x++;draft.time=services.now();}),
  external:action(external,(draft,packet)=>{
    draft.result=packet.origin+': '+packet.status;
    const value=packet.value;
    if(value&&typeof value==='object'){
      if(packet.origin==='editor'&&'value' in value&&typeof value.value==='string')draft.text=value.value;
      if(packet.origin==='keyboard'&&'key' in value&&typeof value.key==='string')draft.key=value.key;
    }
  }),
}));
export const app=createApp({schema,initialState:{x:0,time:0,text:'',key:'',result:'Ready'},
  simulation:{tickDuration:20000,action:'tick'},
  view: /** @returns {import('../../src/index.js').ViewNode} */ ({bind,interpolate,inputs})=>div(
    p('Committed position: ',span({id:'position'},bind.x),' · Logical time: ',bind.time),
    p('Interpolated display: ',span({id:'smooth'},interpolate(({previous,current,alpha})=>
      (previous.x+(current.x-previous.x)*alpha).toFixed(2)))),
    div({style:{transform:interpolate(({previous,current,alpha})=>
      'translateX('+((previous.x+(current.x-previous.x)*alpha)%100)+'px)')}},'●'),
    input({id:'editor',type:'text',value:bind.text,onText:inputs.text('editor','external'),onKey:inputs.keyboard('keyboard','external')}),
    p('Accepted text: ',span({id:'accepted'},bind.text),' · Last key: ',bind.key),p(bind.result),
    button({id:'run',onClick:()=>{app.resumeTicks();}},'Run'),
    button({id:'pause',onClick:()=>{app.pauseTicks();}},'Pause'),
    button({id:'step',onClick:()=>{app.resumeTicks();app.advanceTicks(20000);app.pauseTicks();}},'Advance 20 ms'),
    p('Editing remains native. Accepted key/text packets wait for the next tick. Pause displays the latest committed position.'),
  )});
app.mount();
