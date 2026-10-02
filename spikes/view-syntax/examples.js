import { div, span, button, form, label, input, ul, li, p, html, keyed, when } from './index.js';

export const modes = ['elements', 'template-bind', 'template-eager'];
export const initialState = (size = 4) => ({ count: 0, name: 'Ada', show: true, disabled: false,
  unrelated: 'unchanged', rows: Array.from({ length: size }, (_, id) => ({ id, label: 'Row ' + id })) });
export const actions = {
  increment: state => { state.count++; },
  name: (state, value) => { state.name = value; },
  show: state => { state.show = !state.show; },
  disable: state => { state.disabled = !state.disabled; },
  reverse: state => { state.rows.reverse(); },
  insert: state => { state.rows.unshift({ id: 100000, label: 'New' }); },
  edit: (state, { id, label }) => { state.rows.find(row => row.id === id).label = label; },
  remove: (state, id) => { state.rows = state.rows.filter(row => row.id !== id); },
  replace: state => { state.rows[0] = { id: state.rows[0].id, label: 'Replacement' }; },
  fail: state => { state.count++; throw new Error('rollback'); },
  async: state => { state.count++; return Promise.resolve(); },
};

const key = item => item.id;
const conditional = ({ bind }) => p({ id: 'conditional' }, bind.name);
const elementRow = ({ bind }) => li({ 'data-id': bind.id },
  span({ class: 'row-label' }, bind.label), input({ 'aria-label': 'Row edit', value: bind.label }));
const templateRow = ({ bind }) => html`<li data-id=${bind.id}><span class="row-label">${bind.label}</span><input aria-label="Row edit" value=${bind.label}></li>`;

export function exampleView(mode) {
  if (mode === 'elements') return ({ bind, actions }) => div({ class: 'example' },
    form({ onSubmit: event => event.preventDefault() },
      label({ htmlFor: 'name' }, 'Name'),
      input({ id: 'name', value: bind.name, required: true, onInput: event => actions.name(event.currentTarget.value) }),
      button({ id: 'inc', type: 'button', disabled: bind.disabled, onClick: actions.increment }, 'Increment')),
    span({ id: 'count', 'data-count': bind.count }, bind.count),
    span({ id: 'unrelated' }, bind.unrelated),
    when(bind.show, conditional), ul(keyed(bind.rows, key, elementRow)));
  if (mode === 'template-bind') return ({ bind, actions }) => html`<div class="example">
    <form @submit=${event => event.preventDefault()}><label for="name">Name</label>
    <input id="name" value=${bind.name} required @input=${event => actions.name(event.currentTarget.value)}>
    <button id="inc" type="button" disabled=${bind.disabled} @click=${actions.increment}>Increment</button></form>
    <span id="count" data-count=${bind.count}>${bind.count}</span><span id="unrelated">${bind.unrelated}</span>
    ${when(bind.show, conditional)}<ul>${keyed(bind.rows, key, templateRow)}</ul></div>`;
  if (mode === 'template-eager') return ({ state, bind, actions }) => html`<div class="example">
    <form @submit=${event => event.preventDefault()}><label for="name">Name</label>
    <input id="name" value=${state.name} required @input=${event => actions.name(event.currentTarget.value)}>
    <button id="inc" type="button" disabled=${state.disabled} @click=${actions.increment}>Increment</button></form>
    <span id="count" data-count=${state.count}>${state.count}</span><span id="unrelated">${state.unrelated}</span>
    ${when(bind.show, conditional)}<ul>${keyed(bind.rows, key, templateRow)}</ul></div>`;
  throw new Error('Unknown syntax mode');
}
