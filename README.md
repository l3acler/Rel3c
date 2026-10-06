# mini-framework

A JavaScript frontend framework built here, with no third-party runtime dependencies.
It provides transactional state, precise DOM bindings, native events, keyed lists,
routing, priorities and selected state persistence. C.1–C.8 also provide checkpoints, controlled services, fixed ticks, semantic inputs, optional interpolation and bounded recording. Replay and developer tools remain planned for Phases C/D.

The public API is experimental (`0.1.0`). The Phase B frontend walkthrough is
qualified in desktop Chrome; OS IMEs, system clipboard paste, mobile and other
browsers remain unverified. See [browser support](docs/browser-support.md) and the
[public guide](DOCUMENTATION.md) for the exact contracts and limits.

## Run from the root

Use Node.js 18 or later (verified with Node 26). From this folder:

```sh
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/) for the basic example, or
[http://localhost:3000/examples/auditor/](http://localhost:3000/examples/auditor/)
for the routed form/list walkthrough below. Startup needs no install or build.
If port 3000 is busy, use `npm run dev -- --port 3001` and open the same path on
port 3001. Stop the server with Ctrl+C.

Browser modules import `../../src/index.js` from an example folder. Package
consumers import `mini-framework`; `package.json` exposes `src/index.js` and its
TypeScript declarations. Only the public entry is supported for application use.

## Build the walkthrough using public imports

Create `examples/auditor/index.html` with the following content. These are the
complete files served by the example; no runtime edits are needed.

<!-- auditor:index.html -->
```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mini-framework public walkthrough</title>
  <div id="app"></div>
  <script type="module" src="./main.js"></script>
</html>
```

Create `examples/auditor/main.js` with this code. The type comments help the
optional checker; the browser runs the JavaScript directly.

<!-- auditor:main.js -->
```js
import {
  createApp, createActionSchema, div, p, span, button, form, label, input, ul, li,
} from '../../src/index.js';

/** @typedef {{ nextId: number, rows: { id: number, title: string, done: boolean }[] }} Board */
/** @typedef {{ board: Board, draft: string, scroll: number, key: string }} State */
/** @type {typeof createActionSchema<State>} */
const createSchema = createActionSchema;
const schema = createSchema({ version: 'walkthrough-1' })(({ action }) => ({
  edit: action(/** @returns {value is string} */ value => typeof value === 'string',
    (draft, value) => { draft.draft = value; }),
  save: action(draft => {
    const title = draft.draft.trim();
    if (!title) return;
    draft.board.rows.push({ id: draft.board.nextId++, title, done: false });
    draft.draft = '';
    app.navigate('/'); // Applied after this action commits; discarded if it throws.
  }),
  toggle: action(/** @returns {value is number} */ value => Number.isSafeInteger(value),
    (draft, id) => {
      const row = draft.board.rows.find(row => row.id === id);
      if (row) row.done = !row.done;
    }),
  reverse: action(draft => { draft.board.rows.reverse(); }),
  scrolled: action(/** @returns {value is number} */ value => typeof value === 'number' && Number.isFinite(value),
    (draft, value) => { draft.scroll = value; }),
  key: action(/** @returns {value is string} */ value => typeof value === 'string',
    (draft, value) => { draft.key = value; }),
}));

/** @param {unknown} value @returns {value is Board} */
function isBoard(value) {
  if (!value || typeof value !== 'object' || !('nextId' in value) || !('rows' in value)
    || typeof value.nextId !== 'number' || !Number.isSafeInteger(value.nextId)
    || value.nextId < 1 || !Array.isArray(value.rows)) return false;
  const ids = new Set(), nextId = value.nextId;
  return value.rows.every(row => {
    if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.id) || row.id < 1
      || row.id >= nextId || typeof row.title !== 'string' || typeof row.done !== 'boolean'
      || ids.has(row.id)) return false;
    ids.add(row.id); return true;
  });
}

export const app = createApp({
  initialState: {
    board: { nextId: 3, rows: [
      { id: 1, title: 'Read the guide', done: false },
      { id: 2, title: 'Try a native form', done: false },
    ] },
    draft: '', scroll: 0, key: '',
  },
  schema,
  persistence: { namespace: 'walkthrough', version: '1', fields: {
    board: { location: 'local', validate: isBoard },
    draft: { location: 'session', validate: value => typeof value === 'string' },
  } },
  onError: (error, { phase }) => console.error(phase, error),
  router: { mode: 'hash', routes: [
    { path: '/', view: ({ bind, keyed, actions, link }) => div({ id: 'tasks' },
      p(link('/new', { id: 'new-task' }, 'Add a task')),
      button({ id: 'reverse', type: 'button', onClick: actions.reverse }, 'Reverse order'),
      ul({ id: 'task-list' }, keyed(bind.board.rows, row => row.id, context =>
        li({ 'data-id': context.key },
          span({ class: { complete: context.item.done } }, context.item.title), ' ',
          button({ type: 'button', 'aria-pressed': context.item.done,
            onClick: () => actions.toggle(context.key) }, 'Toggle complete'),
        ))),
    ) },
    { path: '/new', view: ({ bind, actions, link }) => div({ id: 'editor' },
      form({ id: 'task-form', on: { submit: event => {
        event.preventDefault(); actions.save();
      } } },
        label({ htmlFor: 'title' }, 'Task title'),
        input({ id: 'title', name: 'title', required: true, value: bind.draft,
          onText: value => actions.edit(value.value),
          onKey: (value, event) => {
            if (value.type === 'keydown' && value.key === 'Escape' && !value.isComposing) {
              event.preventDefault(); actions.edit(''); actions.key('Escape');
            }
          },
        }),
        button({ id: 'save', type: 'submit' }, 'Save and return'),
      ),
      p(link('/', { id: 'cancel' }, 'Cancel')),
    ) },
  ], notFound: ({ link }) => p('Page not found. ', link('/', 'Home')) },
  view: ({ bind, derive, outlet, link, actions }) => div(
    { id: 'board', class: 'task-board', 'data-example': 'public-api' },
    p(link('/', { id: 'home' }, 'Tasks'), ' · ', link('/new', 'New task')),
    p('Tasks: ', span({ id: 'total' }, derive(state => state.board.rows.length))),
    outlet(),
    div({ id: 'scroll-area', tabIndex: 0, role: 'region', 'aria-label': 'Scroll example',
      style: { height: '80px', overflow: 'auto' },
      on: { scroll: { passive: true, handler: event => {
        if (event.currentTarget instanceof HTMLElement) actions.scrolled(event.currentTarget.scrollTop);
      } } },
    }, div({ style: { height: '240px' } }, 'Scroll with the keyboard or pointer.')),
    p({ role: 'status' }, 'Scroll: ', span({ id: 'scroll-position' }, bind.scroll),
      ' · Last handled key: ', span({ id: 'last-key' }, bind.key)),
  ),
});
app.mount();
```

Open `/examples/auditor/` after starting the server. Add a task, enter a title,
and press Enter or Save. An empty required field uses native validation. Escape
clears the edit. Toggle a task, reverse the list, and scroll the focusable region.
Navigation retains the shared store; browser back/forward changes the routed
view. Reload retains the local board and session draft while resetting memory-only
scroll/key values. Each successful commit queues a storage write; to guarantee a
write before a programmatic reload or disposal, call `app.flushPersistence()`.

The example uses hash routing so copying it to a static server needs no route
fallback. [The History example](examples/routes/README.md) uses
`/examples/routes/people/Ada` and documents direct loads and host fallback setup.
For URL-backed fields, see [the persistence example](examples/persistence/README.md).

## Why these APIs behave this way

- **Elements describe native HTML.** `div(props, children...)` creates a descriptor;
  the framework mounts it. Props set ID, class and other attributes, and child
  arguments nest elements or text. Dynamic text is written as text, so task titles
  cannot inject markup. `label`/`input`/`form` preserve native HTML semantics.
- **Bindings select the work.** `bind.draft` and `context.item.title` subscribe to
  the properties they read. `derive(...)` captures a calculation's dependencies.
  A state commit invalidates those bindings; a render frame writes their latest
  values. Unrelated nodes retain identity. `app.flush()` explicitly applies pending
  visual work when a synchronous boundary is useful.
- **Named actions are atomic.** Actions mutate a transaction draft synchronously.
  A successful action publishes one version, including a no-op; a throwing action
  publishes none. Nested dispatches run FIFO after a successful parent. Side effects
  outside the draft cannot roll back. Async effects run outside actions and dispatch
  their results. Controlled `now()`/`random()` services are available to actions;
  fixed ticks/external adapters are implemented; bounded recording is available; full replay remains unimplemented.
- **Events belong to view scopes.** `onClick` needs no event argument; `on.submit`
  supplies cancellation and native event access; `onText` supplies semantic text;
  `onKey` supplies key/held/reset information. Scroll reads happen in the event
  adapter before dispatching a scalar payload. Disposal removes handlers.
- **Keys retain rows and focus.** `keyed` uses stable, unique string/finite-number
  keys when items move. Read `context.key`/`context.value` when handling an event;
  avoid saving an old item snapshot.
- **Routes share app ownership.** `link`, `outlet` and `app.navigate` manage views
  and history while keeping the same state store. Navigation requested inside an
  action is applied after commit and discarded if the action throws.
- **Persistence is explicit.** Each configured top-level field selects one source.
  Valid storage/URL inputs hydrate before the first view. Missing or invalid
  storage retains current memory; URL absence restores the configured initial
  default. Writes run after commits and coalesce. Errors are reported through
  `onError` and rethrown; they do not undo committed memory. `app.dispose()` cancels
  pending work rather than flushing it.

For disposal, argument validation, errors, resource budgets and copyable focused
examples, read [DOCUMENTATION.md](DOCUMENTATION.md). Runtime validation remains
necessary for imported data even when TypeScript accepts its declared type.

## Fixed ticks and external inputs

Use `simulation: {tickDuration:10000, action:'tick', maxCatchUp:8}` to run a
registered no-payload action on 10 ms logical ticks. Apps start paused.
`resumeTicks()` enables the mounted frame driver; `pauseTicks()` retains backlog.
Headless apps can supply integer elapsed microseconds through `advanceTicks()`.
Tick IDs never skip under overload; hiding a tab excludes hidden wall time.

```js
import {createApp, createActionSchema} from './src/index.js';
const schema = createActionSchema()(({action}) => ({
  tick: action((draft, services) => { draft.count++; draft.time=services.now(); }),
}));
const app = createApp({schema, initialState:{count:0,time:0},
  simulation:{tickDuration:10000, action:'tick'}});
app.enqueue('tick'); // One queued root, followed by configured tick logic.
app.resumeTicks(); app.advanceTicks(10000);
console.log(app.state.count, app.controls.clock.tick); // 2, 1
app.dispose();
```

Use `context.inputs` for view-owned viewport/layout/scroll/storage samples,
timers and network effects. Results enter payload actions as versioned
success/error/cancelled inputs. Removing a view aborts pending effects and removes
its queued results. `app.inputs` owns work until app disposal. Fixed inputs wait
for the next tick; manual inputs dispatch immediately. Snapshots require no
pending inputs/effects, and fixed restoration needs matching simulation duration.
See the [guide](DOCUMENTATION.md#fixed-ticks-and-external-inputs),
[API reference](docs/api/ticks-inputs.md), and runnable
[ticks example](examples/ticks/README.md) at `/examples/ticks/`.

## Bounded recording

Call `app.startRecording({mode:'recent',maxActions:1024,maxBytes:33554432,keyframeInterval:64})`
at an idle boundary after mounting and draining existing inputs/effects. Whole
execution roots retain nested action/input order, failure outcomes, checkpoint
hashes and usable baselines. Recent history evicts complete segments; session mode
stops visibly at limits while the app continues. `app.recording` exposes limits
and expiry. `app.stopRecording()` preserves the prefix; `app.clearRecording()`
releases it. Only `app.exportRecording()` produces a recording string explicitly.
Public `readRecording(text,{schemaVersion?})` validates/decode-freezes it without
executing app code; `serializeRecording(value)` returns the same canonical wire.

Run `/examples/recording/` after `npm run dev`. See the [guide](DOCUMENTATION.md#bounded-recording)
for a complete copyable public-import example, exact byte accounting, root/queue
ownership, limits, errors and cleanup. Full replay/effect suppression remain future
work; structural validation does not certify application behavior.

## Semantic inputs and display interpolation

`context.inputs.keyboard(origin,action)` and `.text(origin,action)` supply onKey/
onText callbacks that send owned native semantic snapshots to payload actions.
Fixed apps queue accepted values while native editing stays live. Navigation,
location and accepted hydration use the same packet boundary.
`observeInputs` reports execution attempts; `receiveInput` validates supplied
packets for controlled tests. The packet boundary has no automatic log; bounded recording is opt-in. Full replay remains unimplemented.

Use `context.interpolate(({previous,current,alpha}) => ...)` in text/attributes/
style for an optional display value between frozen ticks. Ordinary bindings/forms
stay committed. Pause, hiding or overload displays current values without
extrapolation. Interpolation changes no authoritative state versions or hashes;
it cannot control effect-owning structural views.

Run `/examples/interpolation/` after `npm run dev`, or read the
[guide](DOCUMENTATION.md#semantic-input-packets) and
[API reference](docs/api/semantic-interpolation.md) for packet compatibility,
timing, cleanup and copyable public examples. Bounded recording is described above; full replay remains later work.

## Controlled services and checkpoints

C.1/C.2 provide manual logical microseconds and seeded simulation draws to actions.
This root browser-module example needs no mount or DOM:

```js
import { createApp, createActionSchema, hashSnapshot } from './src/index.js';
const schema = createActionSchema({ version: 'sample/1' })(({ action }) => ({
  sample: action((draft, services) => {
    draft.value = services.random(); draft.time = services.now();
  }),
}));
const app = createApp({ schema, initialState: { value: 0, time: 0 },
  controls: { seed: 123 } });
app.setLogicalTime(1000); // Explicit logical time: 1 ms, not wall time.
app.actions.sample();
const fork = createApp({ schema, snapshot: app.snapshot() });
app.actions.sample(); fork.actions.sample();
console.log(hashSnapshot(app.snapshot()) === hashSnapshot(fork.snapshot())); // true
app.dispose(); fork.dispose();
```

No-payload handlers receive `(draft, services)`; payload handlers receive
`(draft, payload, services)`. Existing callbacks can ignore the extra argument.
Failed actions discard their random draws with their state changes. Services
expire after the action body; explicit clock changes are monotone and change no
state version. Checkpoints restore a new owned app with the same state version,
clock and random position, without replacing mounted state or restoring browser
effects. `app.controls` is frozen/nonreactive; copy service values into state to
display them. This manual-clock example does not exercise fixed ticks. Bounded recording is available; full replay remains unimplemented.

Try [http://localhost:3000/examples/determinism/](http://localhost:3000/examples/determinism/)
after `npm run dev`, or read the [guide](DOCUMENTATION.md#checkpoints-and-controlled-services)
for schema/runtime versions, supported data, import limits, errors and cleanup.

## Features and boundaries

| Available through public imports | Qualification / next work |
| --- | --- |
| Read-only state, synchronous actions, rollback and FIFO dispatch | Supported acyclic data only; no ambient-value sandbox |
| Exact observers/computed values, conditional DOM and keyed lists | Native HTML subset; no SVG, custom elements, compiler or public templates |
| Click/scroll/keyboard/text/composition adapters | Desktop Chrome evidence; native OS/mobile/browser matrix remains open |
| Immediate/frame/normal/idle work | Cooperative bounded scheduling; no CPU preemption guarantee |
| History/hash routing and shared state | One router per Window; History hosts need a scoped fallback |
| Memory/session/local/URL field locations | Top-level fields, guarded bounded format; no cross-tab merging or migrations |
| Declarations, error codes and root public examples | Experimental compatibility policy; no stable release claim |
| Versioned checkpoints, manual logical clock and transactional seeded draws | C.1/C.2; see the controlled-services example below |
| Fixed ticks and scoped external-input/effect adapters | C.3/C.4; see `/examples/ticks/` and the guide |
| Semantic input packets and display interpolation | C.5/C.6; see `/examples/interpolation/` and the guide |
| Bounded recording/export/import | C.7/C.8; see `/examples/recording/` and the guide |
| Replay, history/inspector | Unimplemented later Phase C/D |

[Compatibility and versioning](docs/adr/0015-public-frontend-compatibility.md)
explain how the experimental frontend can evolve into Phase C without treating
persisted data as a recording format. The assignment's separate demonstration
app is a later integration task; this walkthrough validates the framework API.

## Verification

Node tests and the root smoke test need no dependencies:

```sh
npm test
npm run test:spikes
npm run test:benchmarks
npm run smoke
```

Declarations and checked JavaScript need the pinned development-only checker:

```sh
npm ci --ignore-scripts
npm run test:types
```

With installed Google Chrome, run:

```sh
npm run test:browser
npm run audit:frontend
```

`MINI_FRAMEWORK_CHROME_PATH` can select another Chrome executable. The browser
runner uses a fresh temporary profile and closes it afterward. The auditor command
copies the candidate into a fresh temporary folder without `.git`, `node_modules`
or old results, reconstructs the walkthrough files from this README, and checks
startup, tests, declarations, source independence and real browser behavior.
It installs only locked development tooling with scripts disabled. Use
`npm run audit:frontend -- --offline` when the npm cache already contains it.
The command removes only its own temporary folder and writes a report under
`tests/results/`; failed checks exit nonzero. Neither command verifies OS IMEs or
system clipboard paste. See [the Batch 4 report](docs/reports/task-B.9-B.11-auditor.md).

Benchmarks are separate from the acceptance suite:

```sh
npm run bench:spikes
npm run bench:spikes:browser
npm run bench:runtime
```

See [methodology](benchmarks/README.md). Architecture spikes selected copy-on-write
using equivalent correctness/workloads. No universal speedup or leak guarantee
is claimed, and no final renderer/replay benchmark is implemented.

## Folder map and tooling

| Path | Purpose |
| --- | --- |
| `src/index.js`, `src/index.d.ts` | Browser/package public exports and declarations |
| `src/runtime/` | Independently implemented state, DOM, dependencies, events, router, scheduler and persistence |
| `examples/` | Public-import browser applications |
| `scripts/dev-server.js` | Root static development server, with scoped History-example fallback |
| `tests/`, `tests/results/` | Focused/runtime/browser checks and source-fingerprinted evidence |
| `spikes/`, `benchmarks/` | Isolated architecture prototypes and measurements |
| `DOCUMENTATION.md`, `docs/api/` | Public guide and detailed API contracts |
| `Framework_PRD.md`, `DEVELOPMENT_PLAN.md`, `docs/adr/` | Acceptance criteria, milestones and decisions |

Runtime dependencies: none. The framework implements its own DOM, state, routing,
reactivity and events in JavaScript. Serving, tests and Chrome automation use Node
standard-library modules and installed Chrome. TypeScript **5.9.3** is the sole
pinned development dependency; it checks types without compiling the app or
providing framework behavior. No bundler is needed.
