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
  const paths = ['src/index.js', 'src/index.d.ts', 'src/runtime/app.js', 'src/runtime/errors.js', 'src/runtime/records.js',
    'src/runtime/state/initial-state.js', 'src/runtime/state/transactions.js', 'src/runtime/state/data.js',
    'src/runtime/state/draft.js', 'src/runtime/state/graph.js', 'src/runtime/reactivity/tracking.js', 'src/runtime/actions/schema.js', 'src/runtime/actions/dispatch.js', 'examples/basic/main.js', 'examples/basic/index.html',
    'tests/browser/app-lifecycle.js', 'tests/browser/reactivity.js', 'tests/browser/app-lifecycle.html', 'scripts/check-app-lifecycle.js',
    'scripts/local-browser.js', 'scripts/dev-server.js'];
  const sourceFiles = await Promise.all(paths.map(async file => ({ file,
    sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
  const report = { kind: 'app-lifecycle-transactions-and-reactivity', task: 'A.4+A.5', formatVersion: 1, recordedAt: new Date().toISOString(),
    browserVersion, flags, machine: { cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length,
      platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version },
    sourceFiles, example, tests, limitations: 'Public lifecycle/text-only views, named dispatch and internal COW engine; exact observers/lazy computed values; no reactive DOM/events/replay or cross-browser/IME qualification. Resource counters are not a heap-leak proof.' };
  const directory = path.join(root, 'tests/results'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'app-lifecycle-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('Public lifecycle browser checks: ' + tests.passed + ' passed'); console.log('RESULT ' + path.relative(root, file));
});
