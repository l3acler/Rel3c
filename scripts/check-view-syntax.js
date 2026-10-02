#!/usr/bin/env node
// Reproducible local headless Chrome measurement driver. Uses an isolated
// temporary profile and Chromium's pipe protocol; no user browser/profile.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { startServer } from './dev-server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const config = quick ? { sizes: [4], warmup: 1, samples: 3, rounds: 1 }
  : { sizes: [32, 256], warmup: 5, samples: 20, rounds: 3 };
const chrome = process.env.MINI_FRAMEWORK_CHROME_PATH
  ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
await access(chrome);
const profile = await mkdtemp(path.join(os.tmpdir(), 'mini-fw-syntax-'));
let server;
let child;
let exited;
let stderr = '';
let closing = false;
try {
  server = await startServer(0, '127.0.0.1');
  const flags = ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--enable-precise-memory-info'];
  child = spawn(chrome, [...flags, '--user-data-dir=' + profile, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  exited = once(child, 'exit');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-10000); });
  const pending = new Map();
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  function failAll(error) {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  }
  child.on('error', failAll);
  child.on('exit', () => { if (!closing) failAll(new Error('Chrome exited: ' + stderr)); });
  child.stdio[4].on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    let split;
    while ((split = buffer.indexOf(0)) !== -1) {
      const text = buffer.subarray(0, split).toString();
      buffer = buffer.subarray(split + 1);
      if (!text) continue;
      const message = JSON.parse(text);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });
  function command(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome protocol timeout: ' + method + ' ' + stderr)); }, 45000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  const browserVersion = await command('Browser.getVersion');
  const { targetId } = await command('Target.createTarget', {
    url: server.url + 'spikes/view-syntax/?runner', background: false,
  });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    ready = await evaluate('typeof window.runSyntaxTests === "function" && typeof window.runSyntaxMeasurements === "function"');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Browser benchmark module did not load');
  const browserEnvironment = await evaluate('({userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,visibility:document.visibilityState,memoryApi:!!performance.memory})');
  const tests = await evaluate('window.runSyntaxTests()');
  // Trusted keyboard input through Chrome, not a synthetic KeyboardEvent.
  await evaluate(`(async () => {
    const { createSyntaxApp, div, button, input, span } = await import('/spikes/view-syntax/index.js');
    const target = document.createElement('section'); document.body.append(target);
    const app = createSyntaxApp({ target, initialState: { count: 0 },
      actions: { increment: state => { state.count++; } },
      view: ({ bind, actions }) => div(button({ onClick: actions.increment }, 'Native activation'),
        input({ 'aria-label': 'Next control' }), span(bind.count)) });
    window.keyboardProbe = { target, app }; target.querySelector('button').focus();
  })()`);
  for (const type of ['keyDown', 'keyUp']) await command('Input.dispatchKeyEvent',
    { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
      ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) }, sessionId);
  const activation = await evaluate('keyboardProbe.app.flush(), keyboardProbe.app.state.count');
  for (const type of ['rawKeyDown', 'keyUp']) await command('Input.dispatchKeyEvent',
    { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
  const tab = await evaluate('document.activeElement === keyboardProbe.target.querySelector("input")');
  await evaluate('keyboardProbe.app.dispose(); keyboardProbe.target.remove(); delete window.keyboardProbe');
  if (activation !== 1 || !tab) throw new Error('Native Enter activation/Tab navigation failed: count=' + activation + ' tab=' + tab);
  tests.results.push({ name: 'trusted Enter activation and Tab focus navigation', passed: true });
  tests.passed++;
  console.log('Browser syntax tests: ' + tests.passed + ' passed');
  const measurements = await evaluate('window.runSyntaxMeasurements(' + JSON.stringify(config) + ')');
  const paths = ['scripts/check-view-syntax.js', 'scripts/dev-server.js',
    ...['bindings.js', 'nodes.js', 'reactivity.js', 'events.js', 'security.js', 'templates.js',
      'renderer.js', 'index.js', 'examples.js', 'browser-tests.js', 'measurements.js', 'index.html']
      .map(file => 'spikes/view-syntax/' + file),
    ...['contract.js', 'graph.js', 'draft-view.js', 'engine-shell.js', 'reference-evaluator.js',
      'cow-engine.js', 'staged-engine.js'].map(file => 'spikes/transactions/' + file)];
  const sourceFiles = await Promise.all(paths.map(async file => ({ file,
    sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
  const report = { formatVersion: 1, kind: 'view-syntax-spike', recordedAt: new Date().toISOString(),
    quick, config, browserVersion, browserEnvironment,
    machine: { cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(),
      platform: os.platform(), release: os.release(), arch: os.arch() },
    chromeFlags: flags, sourceFiles, tests, ...measurements,
    methodology: { timing: 'Synchronous JS+DOM mount, transaction/flush update, reorder and disposal; not paint latency. Warmup excluded.',
      ordering: 'Modes rotated by round, one isolated headless browser/profile. Reference engine for all timed modes.',
      cache: '100-operation batches; separate cold compiler/parse, same native site cache lookup, and clone+slot-path resolution.',
      memory: 'Owned live resource counters and disposal checks, not exact heap allocation or GC measurements.',
      scope: 'Syntax prototypes only; no production API or transaction engine selection.' } };
  const directory = path.join(root, 'benchmarks/results');
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, 'view-syntax-' + (quick ? 'quick-' : '') + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('RESULT ' + path.relative(root, output));
  closing = true;
  await command('Browser.close');
} finally {
  if (child) {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited?.catch(() => {});
  }
  await server?.close();
  // Exact directory returned by mkdtemp above, containing only this runner's profile.
  await rm(profile, { recursive: true, force: true });
}
