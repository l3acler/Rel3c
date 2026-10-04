import { withLocalBrowser } from './local-browser.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
await withLocalBrowser(async ({ open, browserVersion, flags }) => {
  const basic = await open('examples/basic/');
  await basic.waitFor('document.querySelector("#app")?.textContent.includes("Public application lifecycle is running.")');
  const example = await basic.evaluate(`(async () => {
    const { app } = await import('/examples/basic/main.js');
    const target = document.getElementById('app');
    const mounted = app.mounted;
    const report = JSON.parse(target.textContent);
    app.dispose();
    return { mounted, disposed: app.status,
      removedOwnedText: target.childNodes.length === 0, report };
  })()`);
  if (!example.mounted || example.disposed !== 'disposed' || !example.removedOwnedText ||
      example.report.message !== 'Public application lifecycle is running.' || example.report.initializedThroughAction !== true) {
    throw new Error('Public-only root lifecycle example failed');
  }
  const page = await open('tests/browser/app-lifecycle.html');
  await page.waitFor('typeof window.runAppLifecycleTests === "function"');
  const tests = await page.evaluate('window.runAppLifecycleTests()');
  tests.results.push({ name: 'root public-import example uses default mount and public disposal without DOM patching', passed: true }); tests.passed++;
  const dom = await open('examples/dom/');
  await dom.waitFor('document.querySelector("#greeting")?.textContent === "Hello, Grace"');
  const domExample = await dom.evaluate(`(async () => {
    const { app } = await import('/examples/dom/main.js');
    const field = document.getElementById('name');
    const works = field.value === 'Grace' && field.defaultValue === 'Ada' && document.getElementById('conditional').textContent === 'Grace';
    app.actions.hide(); app.flush();
    const hidden = !document.getElementById('conditional'); app.dispose();
    return works && hidden && !document.getElementById('app').firstChild;
  })()`);
  if (!domExample) throw new Error('Public declarative example failed');
  tests.results.push({ name: 'public declarative example renders native form, bound greeting and conditional disposal', passed: true }); tests.passed++;
  const keyed = await open('examples/keyed/');
  await keyed.waitFor('document.querySelector("#tasks")?.children.length === 3');
  const keyboard = await keyed.evaluate(`document.getElementById('increment').focus(); true`);
  for (const [key, code, number] of [['Enter', 'Enter', 13], [' ', 'Space', 32]]) {
    for (const type of ['keyDown', 'keyUp']) await keyed.command('Input.dispatchKeyEvent', { type, key, code,
      windowsVirtualKeyCode: number,
      text: type === 'keyDown' ? (key === 'Enter' ? '\r' : ' ') : '',
      unmodifiedText: type === 'keyDown' ? (key === 'Enter' ? '\r' : ' ') : '' });
  }
  await keyed.waitFor('document.querySelector("#counter")?.textContent === "2"');
  const keyedExample = await keyed.evaluate(`(async () => {
    const { app } = await import('/examples/keyed/main.js');
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    const row = document.querySelector('[data-key="2"]'), field = row.querySelector('input');
    field.value = 'Local edit'; field.focus(); field.setSelectionRange(0, 5);
    document.getElementById('reverse').click(); app.flush();
    const retained = document.querySelector('[data-key="2"]') === row && document.activeElement === field &&
      field.selectionStart === 0 && field.selectionEnd === 5 && field.value === 'Local edit';
    document.querySelector('[data-toggle="2"]').click(); app.flush();
    const toggled = app.state.rows.find(row => row.id === 2).done === true;
    document.querySelector('[data-remove="2"]').click(); app.flush();
    const removed = !document.querySelector('[data-key="2"]');
    document.getElementById('add').click(); app.flush(); const added = !!document.querySelector('[data-key="4"]');
    const before = app.state.count; document.getElementById('rollback').click(); app.flush();
    const rollback = app.state.count === before && document.getElementById('notice').textContent.includes('unchanged');
    app.dispose(); const disposed = Object.values(resourceCounts(app)).every(value => value === 0);
    return retained && toggled && removed && added && rollback && disposed;
  })()`);
  if (!keyedExample || !keyboard) throw new Error('Public keyed/click example failed');
  tests.results.push({ name: 'native Enter/Space activation dispatches public click actions', passed: true }); tests.passed++;
  tests.results.push({ name: 'public keyed/click example preserves identity, edits and selection; actions and disposal work', passed: true }); tests.passed++;
  const paths = ['src/index.js', 'src/index.d.ts', 'src/runtime/app.js', 'src/runtime/errors.js', 'src/runtime/records.js',
    'src/runtime/state/initial-state.js', 'src/runtime/state/transactions.js', 'src/runtime/state/data.js',
    'src/runtime/state/draft.js', 'src/runtime/state/graph.js', 'src/runtime/reactivity/tracking.js', 'src/runtime/dom/bindings.js', 'src/runtime/dom/nodes.js', 'src/runtime/dom/properties.js', 'src/runtime/dom/renderer.js', 'src/runtime/dom/queue.js', 'src/runtime/dom/events.js', 'src/runtime/diagnostics.js', 'src/runtime/actions/schema.js', 'src/runtime/actions/dispatch.js', 'examples/basic/main.js', 'examples/basic/index.html',
    'tests/browser/app-lifecycle.js', 'tests/browser/reactivity.js', 'tests/browser/click.js', 'tests/browser/keyed.js', 'tests/browser/dom.js', 'tests/browser/render-queue.js', 'examples/dom/main.js', 'examples/dom/index.html', 'examples/keyed/main.js', 'examples/keyed/index.html', 'tests/browser/app-lifecycle.html', 'scripts/check-app-lifecycle.js',
    'scripts/local-browser.js', 'scripts/dev-server.js'];
  const sourceFiles = await Promise.all(paths.map(async file => ({ file,
    sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
  const report = { kind: 'app-lifecycle-transactions-and-reactivity', task: 'A.8/A.9', formatVersion: 1, recordedAt: new Date().toISOString(),
    browserVersion, flags, machine: { cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length,
      platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version },
    sourceFiles, example, tests, limitations: 'Public lifecycle, declarative DOM, named dispatch, exact observers and lazy computed values; frame batching and explicit flush; minimal click events; no scroll/keyboard/input APIs or replay or cross-browser/IME qualification. Resource counters are not a heap-leak proof.' };
  const directory = path.join(root, 'tests/results'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'app-lifecycle-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('Public lifecycle browser checks: ' + tests.passed + ' passed'); console.log('RESULT ' + path.relative(root, file));
});
