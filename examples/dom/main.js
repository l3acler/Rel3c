// Public-only form and conditional example. Event handling comes in A.9/B.
import { createApp, createActionSchema, div, form, label, input, span, section } from '../../src/index.js';
const schema = createActionSchema()(({ action }) => ({
  rename: action(value => typeof value === 'string', (draft, value) => { draft.name = value; }),
  hide: action(draft => { draft.visible = false; }),
}));
export const app = createApp({ initialState: { name: 'Ada', visible: true }, schema,
  view: ({ bind, derive, when }) => div({ id: 'profile', class: 'profile', 'data-kind': 'form' },
    form({ method: 'get' }, label({ htmlFor: 'name' }, 'Name'), input({ id: 'name', name: 'name', value: bind.name })),
    span({ id: 'greeting' }, derive(state => `Hello, ${state.name}`)),
    when(bind.visible, ({ bind }) => section({ id: 'conditional', style: { color: 'teal' } }, bind.name)),
  ),
});
app.mount();
app.actions.rename('Grace');
app.flush(); // Use an explicit boundary here so the example immediately displays Grace.
