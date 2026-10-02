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
import { WORKLOAD_NAMES, WORKLOAD_VERSION, caseOrder, summarize } from '../benchmarks/transactions/workloads.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const config = quick ? { sizes: [32], warmup: 2, samples: 4, rounds: 1 }
  : { sizes: [128, 1024], warmup: 8, samples: 30, rounds: 3 };
const chrome = process.env.MINI_FRAMEWORK_CHROME_PATH
  ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
await access(chrome);
const profile = await mkdtemp(path.join(os.tmpdir(), 'mini-fw-benchmark-'));
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
    url: server.url + 'benchmarks/transactions/', background: false,
  });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    ready = await evaluate('typeof window.runBenchmarkCase === "function"');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Browser benchmark module did not load');
  const browserEnvironment = await evaluate('({userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,visibility:document.visibilityState,memoryApi:!!performance.memory})');
  const results = [];
  console.log('Browser transaction/frame measurements: ' + JSON.stringify(config));
  console.log(browserVersion.product + ' / ' + browserVersion.jsVersion);
  for (let round = 0; round < config.rounds; round++) {
    for (const size of config.sizes) {
      for (const workload of WORKLOAD_NAMES) {
        for (const engine of caseOrder(round)) {
          const result = await evaluate('window.runBenchmarkCase(' + JSON.stringify({ ...config, round, size, workload, engine }) + ')');
          results.push(result);
          console.log('round=' + round + ' ' + workload + ' n=' + size + ' ' + engine
            + ' callback median=' + result.callbackScriptingMs.median.toFixed(3)
            + 'ms p95=' + result.callbackScriptingMs.p95.toFixed(3) + 'ms');
        }
      }
    }
  }
  const summaries = [];
  for (const size of config.sizes) {
    for (const workload of WORKLOAD_NAMES) {
      const group = results.filter(row => row.size === size && row.workload === workload);
      const reference = group.find(row => row.engine === 'reference');
      for (const trial of group) {
        if (trial.checksum !== reference.checksum || trial.version !== reference.version
          || trial.invalidations !== reference.invalidations) throw new Error('Browser equivalent-work check failed: ' + workload);
      }
      for (const engine of ['reference', 'cow', 'staged']) {
        const trials = group.filter(row => row.engine === engine);
        summaries.push({ engine, workload, size, callbackScriptingMs: summarize(trials.flatMap(row => row.samplesMs)),
          frameIntervalMs: summarize(trials.flatMap(row => row.frameIntervalsMs)),
          roundMediansMs: trials.map(row => row.callbackScriptingMs.median), equivalentWork: true });
      }
    }
  }
  const paths = ['benchmarks/transactions/browser.js', 'benchmarks/transactions/index.html',
    'benchmarks/transactions/workloads.js', 'benchmarks/transactions/engines.js', 'scripts/bench-spikes-browser.js',
    'spikes/transactions/contract.js', 'spikes/transactions/graph.js', 'spikes/transactions/draft-view.js',
    'spikes/transactions/engine-shell.js', 'spikes/transactions/reference-evaluator.js',
    'spikes/transactions/cow-engine.js', 'spikes/transactions/staged-engine.js'];
  const sourceFiles = await Promise.all(paths.map(async file => ({ file,
    sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
  const report = { formatVersion: 1, kind: 'browser-transaction-spikes', workloadVersion: WORKLOAD_VERSION,
    recordedAt: new Date().toISOString(), quick, config, browserVersion, browserEnvironment,
    machine: { cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(),
      platform: os.platform(), release: os.release(), arch: os.arch() }, chromeFlags: flags,
    sourceFiles, methodology: {
      timing: 'One full synchronous transaction per real requestAnimationFrame callback; warmup excluded. Closure setup, checksum and UI outside timed callback work.',
      frames: 'Callback scripting and consecutive rAF timestamp intervals, not a browser tracing total-frame or paint-latency measurement. No framework DOM bindings exist yet.',
      ordering: 'One isolated headless Chrome process/tab for all trials; engine order rotates by round. No forced GC.',
      memory: 'Chromium performance.memory before/after observations; neither exact allocation nor retained heap. Browser GC pause API unavailable; Node profiles separately supply GC observations.',
      environment: 'Headless Chrome with foreground/visibility checks and explicit flags. Desktop browsers/displays may differ.',
    }, summaries, results };
  const directory = path.join(root, 'benchmarks/results');
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, 'browser-' + (quick ? 'quick-' : '') + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
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
