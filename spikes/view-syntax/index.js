import { createReferenceEngine } from '../transactions/reference-evaluator.js';
import { createReactivity } from './reactivity.js';
import { createEvents } from './events.js';
import { createTemplateCompiler } from './templates.js';
import { createRenderer } from './renderer.js';
import { createBindings } from './bindings.js';
import { component } from './nodes.js';

export * from './nodes.js';
export { derive } from './bindings.js';

export function createSyntaxApp({ target, initialState, actions: definitions = {}, view,
  engineFactory = createReferenceEngine }) {
  const runtime = createReactivity(engineFactory(initialState), target.ownerDocument);
  const scope = runtime.scope();
  const actions = Object.create(null);
  for (const [name, action] of Object.entries(definitions)) {
    actions[name] = payload => {
      // A no-payload action may be used directly as a declarative handler.
      // Payload actions still need an adapter that extracts semantic data.
      if (action.length < 2 && payload instanceof target.ownerDocument.defaultView.Event) payload = undefined;
      return runtime.transact(action, payload);
    };
  }
  const context = { actions, bind: createBindings(runtime.root), get state() { return runtime.root(); } };
  const renderer = createRenderer(runtime, createEvents(target, runtime.metrics),
    createTemplateCompiler(target.ownerDocument, runtime.metrics), target.ownerDocument);
  try { renderer.slot(target, null, scope, context).update(component(view)); }
  catch (error) { scope.dispose(); runtime.dispose(); throw error; }
  return { actions, flush: runtime.flush,
    get state() { return runtime.root(); },
    get version() { return runtime.engine.getVersion(); },
    get metrics() { return { ...runtime.metrics, subscriptions: runtime.subscriptionCount }; },
    dispose() { scope.dispose(); runtime.dispose(); },
  };
}
