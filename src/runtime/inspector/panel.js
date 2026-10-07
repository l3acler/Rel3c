import { createApplication } from '../app.js';
import { createActionSchema } from '../actions/schema.js';
import { div, p, button, label, select, option, textarea, keyed, when } from '../dom/nodes.js';
import { fail, requireSync } from '../errors.js';
import { diagnosticSource } from './instrumentation.js';
import { readRecord } from '../records.js';

// A separate framework app owns the developer UI. Source actions are never
// dispatched by refresh/selection/export. Native select/buttons provide keys.
export function createInspector(raw) {
  let { diagnostics, target, history, onExport } = readRecord(raw, 'INSPECTOR_INVALID', 'inspector', ['diagnostics', 'target', 'history', 'onExport']);
  raw = null;
  if (!diagnosticSource(diagnostics) ||
      (onExport !== undefined && typeof onExport !== 'function') ||
      (history !== undefined && (!history || typeof history.seek !== 'function' || history.app !== diagnosticSource(diagnostics))))
    fail('INSPECTOR_INVALID', 'Provide diagnostics, an optional history and synchronous onExport.');
  let closed = false, selected = 0;
  const json = value => JSON.stringify(value, null, 2);
  const clip = value => value.length > 65_536 ? value.slice(0, 65_536) + '\n[Preview truncated; inspector.export(kind) returns the full export.]' : value;
  const schema = createActionSchema()(({ action }) => ({
    show: action(value => !!value && typeof value === 'object', (draft, value) => Object.assign(draft, value)),
  }));
  const active = () => { if (closed) fail('INSPECTOR_DISPOSED', 'Inspector is disposed.'); };
  function refresh(sequence = selected) {
    active();
    if (!Number.isSafeInteger(sequence) || sequence < 0 || Object.is(sequence, -0)) fail("INSPECTOR_INVALID", "Select a nonnegative safe transition sequence.");
    const snapshot = diagnostics.snapshot();
    const entry = snapshot.entries.find(x => x.sequence === sequence) ?? snapshot.entries.at(-1);
    selected = entry?.sequence ?? 0;
    const hs = history?.status;
    ui.actions.show({ selected: String(selected), rows: snapshot.entries.slice(-256).map(x => ({ id: x.sequence,
      title: `${x.sequence}: ${x.kind} · v${x.before.stateVersion}→${x.after.stateVersion} · tick ${x.after.tick} · ${x.outcome}` })),
      included: snapshot.included,
      summary: `${snapshot.status}; ${snapshot.entries.length} retained entries (selector shows latest 256); ${snapshot.bytes} bytes; ${snapshot.evicted} evicted; ${snapshot.dropped} capture failures.`,
      details: clip(json(entry ?? { message: 'No captured transition. Enable diagnostics before work, then refresh.' })),
      resources: clip(json({ resources: snapshot.resources, dependencies: snapshot.dependencies, recording: snapshot.recording })),
      history: hs ? json(hs) : '', hasHistory: !!hs, canUndo: !!hs?.canUndo, canRedo: !!hs?.canRedo,
      canSeek: hs?.status === 'inspecting' || hs?.status === 'diverged', notice: '' });
    if (ui.mounted) ui.flush();
    return snapshot;
  }
  function attempt(run) {
    try { run(); } catch (error) { ui.actions.show({ notice: error.code ?? error.message ?? 'Inspector operation failed.' }); }
  }
  function exportData(kind = 'diagnostics') {
    active();
    if (!['diagnostics', 'recording'].includes(kind)) fail('INSPECTOR_INVALID', 'Export diagnostics or recording.');
    const text = kind === 'recording' ? diagnostics.exportRecording() : diagnostics.export();
    ui.actions.show({ exported: clip(text), notice: `${kind} exported explicitly. ${text.length} characters; values may be sensitive.` });
    if (onExport) requireSync(onExport(text, kind), 'INSPECTOR_ASYNC', 'onExport must be synchronous.');
    return text;
  }
  const ui = createApplication({ schema,
    initialState: { selected: '0', rows: [], included: '', summary: '', details: '', resources: '', exported: '',
      notice: '', history: '', hasHistory: false, canUndo: false, canRedo: false, canSeek: false },
    view: ({ bind, derive }) => div({ 'data-inspector': 'mini-framework' },
      p('Development inspector'),
      p(bind.included),
      p({ role: 'status', 'data-inspector-notice': '' }, bind.notice),
      p(bind.summary),
      button({ 'data-inspector-refresh': '', onClick: () => attempt(() => refresh()) }, 'Refresh diagnostics'),
      label('Transition ', select({ 'aria-label': 'Transition', 'data-inspector-transitions': '', value: bind.selected,
        on: { change: event => attempt(() => refresh(Number(event.currentTarget.value))) } },
        keyed(bind.rows, row => row.id, ({ item }) => option({ value: item.id }, item.title)))),
      label('Selected transition, inputs, changes and work', textarea({ readOnly: true, rows: 18, value: bind.details, 'data-inspector-details': '' })),
      label('Resources, dependencies and scheduling', textarea({ readOnly: true, rows: 10, value: bind.resources })),
      when(bind.hasHistory, () => div(
        p('Retained history controls change the inspected application state; diagnostic selection only reads captured summaries.'),
        button({ disabled: derive(s => !s.canSeek), onClick: () => attempt(() => { history.seek(history.status.baselineSequence); history.app.flush(); refresh(); }) }, 'Seek baseline'),
        button({ disabled: derive(s => !s.canSeek), onClick: () => attempt(() => { history.seek(history.status.endSequence); history.app.flush(); refresh(); }) }, 'Seek end'),
        button({ disabled: derive(s => !s.canUndo), onClick: () => attempt(() => { history.undo(); history.app.flush(); refresh(); }) }, 'Undo root'),
        button({ disabled: derive(s => !s.canRedo), onClick: () => attempt(() => { history.redo(); history.app.flush(); refresh(); }) }, 'Redo root'),
        label('History cursor and policy', textarea({ readOnly: true, rows: 5, value: bind.history })))),
      button({ 'data-inspector-export': '', onClick: () => attempt(() => exportData()) }, 'Export diagnostic previews'),
      button({ 'data-inspector-recording': '', onClick: () => attempt(() => exportData('recording')) }, 'Export full recording (snapshots and payloads)'),
      label('Explicit export preview', textarea({ readOnly: true, rows: 8, value: bind.exported, 'data-inspector-output': '' }))),
  }, '0.1.0');
  ui.onDispose(() => { closed = true; diagnostics = null; history = null; onExport = null; target = null; });
  refresh();
  const inspector = Object.freeze({ app: ui, refresh, select(sequence) { return refresh(sequence); }, export: exportData,
    mount(host = target) { active(); ui.mount(host); return inspector; }, dispose() { ui.dispose(); } });
  if (target !== undefined) inspector.mount();
  return inspector;
}
