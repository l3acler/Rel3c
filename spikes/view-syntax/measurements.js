import { createSyntaxApp, html } from './index.js';
import { createTemplateCompiler } from './templates.js';
import { modes, initialState, actions, exampleView } from './examples.js';

export function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}
const measure = fn => { const start = performance.now(); fn(); return performance.now() - start; };
const delta = (next, previous) => Object.fromEntries(Object.keys(next).map(key => [key, next[key] - previous[key]]));

export async function runSyntaxMeasurements({ sizes = [32, 256], warmup = 5, samples = 20, rounds = 3 } = {}) {
  const results = [];
  for (let round = 0; round < rounds; round++) for (const size of sizes) {
    const order = modes.slice(round % 3).concat(modes.slice(0, round % 3));
    for (const mode of order) {
      const target = document.createElement('section'); document.body.append(target);
      const mountSamples = [], updateSamples = [], reorderSamples = [], disposeSamples = [];
      let counts;
      for (let sample = -warmup; sample < samples; sample++) {
        let app;
        const mount = measure(() => { app = createSyntaxApp({ target, initialState: initialState(size), actions, view: exampleView(mode) }); });
        const before = app.metrics;
        const update = measure(() => { app.actions.increment(); app.flush(); });
        const updates = delta(app.metrics, before);
        const rows = [...target.querySelectorAll('li')];
        const reorder = measure(() => { app.actions.reverse(); app.flush(); });
        if (target.querySelector('#count').textContent !== '1' || ![...target.querySelectorAll('li')].every((node, i) => node === rows[size - i - 1])) {
          throw new Error('Equivalent work/identity check failed');
        }
        const disposal = measure(() => app.dispose());
        if (target.childNodes.length || app.metrics.effects || app.metrics.handlers || app.metrics.listeners || app.metrics.subscriptions) {
          throw new Error('Retained owned resource after dispose');
        }
        if (sample >= 0) { mountSamples.push(mount); updateSamples.push(update); reorderSamples.push(reorder); disposeSamples.push(disposal); }
        counts = updates;
      }
      target.remove();
      results.push({ mode, size, round, mountSamples, updateSamples, reorderSamples, disposeSamples, updateCounts: counts,
        mountMs: summary(mountSamples), updateMs: summary(updateSamples), reorderMs: summary(reorderSamples), disposeMs: summary(disposeSamples) });
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }
  // Same real TemplateStringsArray site; no fabricated identity/cache keys.
  const site = () => html`<div class="cached"><label>Name</label><input value=${'Ada'}><span>${1}</span></div>`;
  const metrics = { templateParses: 0, templateClones: 0 };
  const compiler = createTemplateCompiler(document, metrics);
  const strings = site().strings;
  const blueprint = compiler.compile(strings);
  const parsing = [], lookup = [], cloning = [];
  const batch = 100;
  for (let sample = -warmup; sample < samples; sample++) {
    const parse = measure(() => { for (let i = 0; i < batch; i++) createTemplateCompiler(document, { templateParses: 0 }).compile(strings); }) / batch;
    const hit = measure(() => { for (let i = 0; i < batch; i++) if (compiler.compile(site().strings) !== blueprint) throw new Error('Cache miss'); }) / batch;
    const clone = measure(() => { for (let i = 0; i < batch; i++) compiler.clone(blueprint); }) / batch;
    if (sample >= 0) { parsing.push(parse); lookup.push(hit); cloning.push(clone); }
  }
  const summaries = [];
  for (const size of sizes) for (const mode of modes) {
    const trials = results.filter(row => row.size === size && row.mode === mode);
    summaries.push({ mode, size, mountMs: summary(trials.flatMap(row => row.mountSamples)),
      updateMs: summary(trials.flatMap(row => row.updateSamples)), reorderMs: summary(trials.flatMap(row => row.reorderSamples)),
      disposeMs: summary(trials.flatMap(row => row.disposeSamples)), updateCounts: trials[0].updateCounts });
  }
  return { summaries, results, templateCache: { batch, parsing, lookup, cloning, parseMs: summary(parsing),
    lookupMs: summary(lookup), cloneMs: summary(cloning), parses: metrics.templateParses, clones: metrics.templateClones } };
}
