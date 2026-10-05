import { createApp, createActionSchema, div, button, p } from '../../src/index.js';

/** @typedef {{ticks:number,time:number,draw:number,result:string}} State */
/** @param {unknown} value @returns {value is import('../../src/index.js').ExternalInput} */
const external = value => value !== null && typeof value === 'object' &&
  'version' in value && value.version === 1 && 'status' in value &&
  (value.status === 'success' || value.status === 'error' || value.status === 'cancelled');
/** @type {typeof createActionSchema<State>} */
const createSchema=createActionSchema;
const schema = createSchema({version:'ticks-example/1'})(
  ({ action }) => ({
    tick: action((draft, services) => { draft.ticks++; draft.time=services.now(); draft.draw=services.random(); }),
    external: action(external, (draft, input) => {
      draft.result = input.origin + ': ' + input.status + ' ' + JSON.stringify(input.value ?? input.error);
    }),
  }));
export const app = createApp({ schema, initialState: { ticks:0,time:0,draw:0,result:'Ready' },
  controls:{seed:123}, simulation:{tickDuration:10000,action:'tick',maxCatchUp:8},
  view: /** @returns {import('../../src/index.js').ViewNode} */ ({bind,inputs})=>div(
    p('Ticks: ',bind.ticks,' · Logical microseconds: ',bind.time),p('Seeded draw: ',bind.draw),p(bind.result),
    button({id:'run',onClick:()=>{app.resumeTicks();}},'Run'),
    button({id:'pause',onClick:()=>{app.pauseTicks();}},'Pause'),
    button({id:'step',onClick:()=>{app.resumeTicks();app.advanceTicks(10000);app.pauseTicks();}},'Advance 10 ms'),
    button({id:'viewport',onClick:()=>{inputs.measure('viewport','external','viewport');}},'Sample viewport'),
    button({id:'timer',onClick:()=>{inputs.timer('timer','external',50,'timer completed');}},'Start timer'),
    button({id:'network',onClick:()=>{inputs.effect('network','external',async signal=>{
      const response=await fetch('./sample.json',{signal});return {status:response.status,body:await response.text()};
    });}},'Fetch local data'),
    p('Inputs wait for the next tick. Pause keeps elapsed backlog; a hidden tab excludes hidden wall time.'),
  ) });
app.mount();
