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
  const core = await open('examples/core/');
  await core.waitFor('document.querySelector("#core-count")?.textContent === "0"');
  const coreExample = await core.evaluate(`(async () => {
    const { app } = await import('/examples/core/main.js');
    const independent = document.getElementById('core-unrelated'), version = app.stateVersion;
    document.getElementById('core-increment').click();
    const committed = app.state.count === 1 && app.stateVersion === version + 1;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const rendered = document.getElementById('core-count').textContent === '1' && document.getElementById('core-unrelated') === independent;
    document.getElementById('core-rename').click(); app.flush();
    const nested = document.getElementById('core-name').textContent === 'Grace';
    document.getElementById('core-toggle').click(); app.flush();
    const conditional = !document.getElementById('core-details');
    const field = document.getElementById('core-input-1'); field.focus(); field.setSelectionRange(1, 3);
    document.getElementById('core-reverse').click(); app.flush();
    const retained = document.getElementById('core-input-1') === field && document.activeElement === field && field.selectionStart === 1 && field.selectionEnd === 3;
    app.dispose(); return committed && rendered && nested && conditional && retained && !document.getElementById('app').firstChild;
  })()`);
  if (!coreExample) throw new Error('Public core example failed');
  tests.results.push({ name: 'public core example mounts from the root and runs counter, nested, conditional, keyed and disposal behavior', passed: true }); tests.passed++;
  const inputs = await open('examples/inputs/');
  await inputs.waitFor('document.querySelector("#input-name") !== null');
  await inputs.evaluate(`(async () => {
    const { app } = await import('/examples/inputs/main.js'); window.inputApp = app;
    window.nativeInputLog = [];
    const field = document.getElementById('input-name');
    for (const type of ['input', 'compositionstart', 'compositionupdate', 'compositionend'])
      field.addEventListener(type, event => window.nativeInputLog.push({ type, trusted: event.isTrusted,
        inputType: event.inputType ?? null, isComposing: event.isComposing ?? null, value: field.value }));
    field.focus(); return true;
  })()`);
  for (const autoRepeat of [false, true]) await inputs.command('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, text: 'a', autoRepeat });
  await inputs.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await inputs.waitFor('window.inputApp.state.name === "aa" && window.inputApp.state.held.length === 0');
  const trustedKeys = await inputs.evaluate('window.nativeInputLog.some(event => event.type === "input" && event.trusted)');
  if (!trustedKeys) throw Error('Trusted keyboard editing failed');
  tests.results.push({ name: 'B.2 trusted keyboard edits, repeat and release update public semantic inputs', passed: true }); tests.passed++;
  await inputs.evaluate('document.getElementById("input-name").setSelectionRange(0, 2); true');
  await inputs.command('Input.insertText', { text: 'مرحبا 😀' });
  await inputs.waitFor('window.inputApp.state.name === "مرحبا 😀"');
  const unicodeSelection = await inputs.evaluate(`(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const field = document.getElementById('input-name');
    return field.value === 'مرحبا 😀' && field.selectionStart === field.value.length && field.selectionEnd === field.value.length && document.activeElement === field;
  })()`);
  if (!unicodeSelection) throw Error('Native Unicode editing/selection failed');
  tests.results.push({ name: 'B.3 trusted replacement editing preserves Arabic/emoji and the native selection after rendering', passed: true }); tests.passed++;
  await inputs.evaluate('document.getElementById("input-name").setSelectionRange(0, document.getElementById("input-name").value.length); true');
  await inputs.command('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
  await inputs.waitFor('window.inputApp.state.name === "に" && window.inputApp.state.composing');
  const compositionProtected = await inputs.evaluate(`(async () => {
    window.inputApp.actions.name({ type: 'text', value: 'external', isComposing: false });
    window.inputApp.flush(); await new Promise(resolve => requestAnimationFrame(resolve));
    return document.getElementById('input-name').value === 'に';
  })()`);
  await inputs.command('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 });
  await inputs.command('Input.insertText', { text: '日本' });
  await inputs.waitFor('window.inputApp.state.name === "日本" && !window.inputApp.state.composing');
  const browserComposition = await inputs.evaluate(`(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    return document.getElementById('input-name').value === '日本' &&
      window.nativeInputLog.some(event => event.type === 'compositionstart' && event.trusted) &&
      window.nativeInputLog.some(event => event.type === 'input' && event.isComposing && event.trusted) &&
      window.nativeInputLog.some(event => event.type === 'compositionend');
  })()`);
  if (!compositionProtected || !browserComposition) throw Error('Browser composition protection/acceptance failed: ' +
    JSON.stringify({ compositionProtected, browserComposition, details: await inputs.evaluate('({ events: window.nativeInputLog, state: window.inputApp.state, value: document.getElementById("input-name").value })') }));
  tests.results.push({ name: 'B.3 Chrome composition engine protects active text from external commits and accepts the latest native value', passed: true }); tests.passed++;
  for (const type of ['keyDown', 'keyUp']) await inputs.command('Input.dispatchKeyEvent', {
    type, key: 'Enter', code: 'Enter', modifiers: 2, windowsVirtualKeyCode: 13 });
  await inputs.waitFor('window.inputApp.state.saves === 1 && window.inputApp.state.saved === "日本"');
  await inputs.evaluate('document.getElementById("input-save").click(); document.getElementById("input-scroll").focus(); true');
  for (const type of ['keyDown', 'keyUp']) await inputs.command('Input.dispatchKeyEvent', {
    type, key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 });
  await inputs.waitFor('window.inputApp.state.scrollTop > 0 && window.inputApp.state.saves === 2');
  const nativeInputs = await inputs.evaluate(`(async () => {
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    const result = { name: window.inputApp.state.name, saves: window.inputApp.state.saves,
      scrollTop: window.inputApp.state.scrollTop, events: window.nativeInputLog };
    window.inputApp.dispose(); result.disposed = Object.values(resourceCounts(window.inputApp)).every(value => value === 0);
    return result;
  })()`);
  if (!nativeInputs.disposed) throw Error('Native input example disposal failed');
  tests.results.push({ name: 'B.1–B.3 public form, Ctrl+Enter shortcut, keyboard scrolling and disposal work without app-managed listeners', passed: true }); tests.passed++;
  const routed = await open('examples/routes/');
  await routed.waitFor('document.getElementById("route-home") !== null');
  await routed.evaluate('document.getElementById("route-increment").click(); document.getElementById("route-profile-link").focus(); true');
  for (const type of ['keyDown', 'keyUp']) await routed.command('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    text: type === 'keyDown' ? '\r' : '', unmodifiedText: type === 'keyDown' ? '\r' : '' });
  await routed.waitFor('document.getElementById("route-name") !== null');
  const routeExample = await routed.evaluate(`(async () => {
    const { app } = await import('/examples/routes/main.js');
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const travel = direction => new Promise(resolve => { window.addEventListener('popstate', resolve, { once: true }); history[direction](); });
    const field = document.getElementById('route-name'); field.focus(); field.setSelectionRange(1, 3);
    app.navigate('?tab=details'); await waitFrame();
    const retained = document.getElementById('route-name') === field && document.activeElement === field && field.selectionStart === 1 && field.selectionEnd === 3;
    const shared = app.state.count === 1 && document.getElementById('route-count').textContent === '1';
    await travel('back'); await waitFrame(); const previousQuery = app.route.query.tab[0] === 'profile';
    await travel('back'); await waitFrame(); const home = !!document.getElementById('route-home') && app.state.count === 1;
    await travel('forward'); await waitFrame(); const profile = !!document.getElementById('route-profile');
    const url = location.href, count = app.state.count; document.getElementById('route-rollback').click(); app.flush();
    const rollback = location.href === url && app.state.count === count;
    document.getElementById('route-normal').click(); await new Promise(resolve => setTimeout(resolve, 20)); await waitFrame();
    const scheduled = app.state.notice.startsWith('Normal task ran');
    app.actions.rename('Grace'); document.getElementById('route-save').click(); await waitFrame();
    const saved = app.route.path === '/' && app.state.saved === 'Grace' && app.state.name === 'Grace';
    app.dispose(); const disposed = Object.values(resourceCounts(app)).every(n => n === 0);
    return retained && shared && previousQuery && home && profile && rollback && scheduled && saved && disposed;
  })()`);
  if (!routeExample) throw Error('Public routes example failed');
  tests.results.push({ name: 'B.4–B.6 public routes example supports trusted Enter links, shared state, query focus, back/forward, post-commit forms, rollback and scheduled work', passed: true }); tests.passed++;
  const deepRoute = await open('examples/routes/people/Grace?tab=details');
  await deepRoute.waitFor('document.getElementById("route-person")?.textContent === "Grace"');
  const directRoute = await deepRoute.evaluate(`(async () => {
    const { app } = await import('/examples/routes/main.js');
    const works = app.route.params.id === 'Grace' && document.getElementById('route-tab').textContent === 'details' && app.state.count === 0;
    app.actions.increment(); return works;
  })()`);
  await deepRoute.command('Page.reload');
  await deepRoute.waitFor('document.getElementById("route-person")?.textContent === "Grace" && document.getElementById("route-count")?.textContent === "0"');
  const reloadRoute = await deepRoute.evaluate(`(async () => { const { app } = await import('/examples/routes/main.js');
    const works = app.route.query.tab[0] === 'details' && app.state.count === 0; app.dispose(); return works; })()`);
  if (!directRoute || !reloadRoute) throw Error('Direct route load/reload failed');
  tests.results.push({ name: 'B.6 root server supports direct route URLs and reload while fresh memory state resets', passed: true }); tests.passed++;
  const paths = ['src/index.js', 'src/index.d.ts', 'src/runtime/app.js', 'src/runtime/errors.js', 'src/runtime/records.js',
    'src/runtime/state/initial-state.js', 'src/runtime/state/transactions.js', 'src/runtime/state/data.js',
    'src/runtime/state/draft.js', 'src/runtime/state/graph.js', 'src/runtime/reactivity/tracking.js', 'src/runtime/dom/bindings.js', 'src/runtime/dom/nodes.js', 'src/runtime/dom/properties.js', 'src/runtime/dom/renderer.js', 'src/runtime/dom/queue.js', 'src/runtime/dom/events.js', 'src/runtime/diagnostics.js', 'src/runtime/actions/schema.js', 'src/runtime/actions/dispatch.js', 'examples/basic/main.js', 'examples/basic/index.html',
    'tests/browser/app-lifecycle.js', 'tests/browser/reactivity.js', 'tests/browser/click.js', 'tests/browser/keyed.js', 'tests/browser/dom.js', 'tests/browser/render-queue.js', 'examples/dom/main.js', 'examples/dom/index.html', 'examples/keyed/main.js', 'examples/keyed/index.html', 'tests/browser/app-lifecycle.html', 'scripts/check-app-lifecycle.js',
    'scripts/local-browser.js', 'scripts/dev-server.js', 'tests/browser/core-slice.js', 'tests/helpers/core-probe.js',
    'tests/core-slice.test.js', 'examples/core/app.js', 'examples/core/main.js', 'examples/core/index.html',
    'src/runtime/dom/inputs.js', 'tests/events-input.test.js', 'tests/browser/events-input.js', 'examples/inputs/main.js', 'examples/inputs/index.html', 'src/runtime/scheduler.js', 'src/runtime/routing/router.js', 'tests/scheduler.test.js', 'tests/router.test.js', 'tests/helpers/fake-browser.js', 'tests/browser/routing-scheduler.js', 'examples/routes/main.js', 'examples/routes/index.html'];
  const sourceFiles = await Promise.all(paths.map(async file => ({ file,
    sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
  const report = { kind: 'app-lifecycle-transactions-and-reactivity', task: 'B.4–B.6', formatVersion: 1, recordedAt: new Date().toISOString(),
    browserVersion, flags, machine: { cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length,
      platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version },
    sourceFiles, example, tests, nativeInputs, limitations: 'Chrome native events, trusted keyboard/Unicode editing and composition-engine automation (CDP final compositionend is untrusted); synthetic paste/composition fixtures. No OS IME, system clipboard paste, mobile or cross-browser qualification. History/hash routing and cooperative priorities covered; no persistence/replay. Resource counters are not a heap-leak proof.' };
  const directory = path.join(root, 'tests/results'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'app-lifecycle-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('Public lifecycle browser checks: ' + tests.passed + ' passed'); console.log('RESULT ' + path.relative(root, file));
});
