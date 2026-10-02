#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WORKLOAD_NAMES, WORKLOAD_VERSION, caseOrder, summarize } from '../benchmarks/transactions/workloads.js';

const runFile = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const config = quick
  ? { sizes: [32, 128], warmup: 4, samples: 12, rounds: 1, memorySamples: 10, memoryRounds: 1 }
  : { sizes: [128, 1024], warmup: 12, samples: 60, rounds: 3, memorySamples: 30, memoryRounds: 1 };
const sourcePaths = [
  'spikes/transactions/contract.js', 'spikes/transactions/graph.js', 'spikes/transactions/draft-view.js',
  'spikes/transactions/engine-shell.js', 'spikes/transactions/reference-evaluator.js',
  'spikes/transactions/cow-engine.js', 'spikes/transactions/staged-engine.js',
  'benchmarks/transactions/engines.js', 'benchmarks/transactions/workloads.js',
  'scripts/bench-spikes.js', 'scripts/bench-spikes-worker.js',
];
const sourceFiles = await Promise.all(sourcePaths.map(async file => ({
  file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'),
})));
const results = [];
console.log('Transaction spike measurements: ' + JSON.stringify(config));
console.log('Reference is an equivalent-work eager-clone baseline, not an existing frontend framework.');
for (let round = 0; round < config.rounds; round++) {
  for (const size of config.sizes) {
    for (const workload of WORKLOAD_NAMES) {
      for (const engine of caseOrder(round)) {
        const timingConfig = { mode: 'timing', engine, workload, size, round, ...config };
        const timed = await runFile(process.execPath, [path.join(root, 'scripts/bench-spikes-worker.js'), JSON.stringify(timingConfig)],
          { maxBuffer: 8 * 1024 * 1024 });
        const timing = JSON.parse(timed.stdout);
        let memory = null;
        if (round < config.memoryRounds) {
          const profile = await runFile(process.execPath,
            ['--expose-gc', path.join(root, 'scripts/bench-spikes-worker.js'), JSON.stringify({ ...timingConfig, mode: 'memory' })],
            { maxBuffer: 8 * 1024 * 1024 });
          memory = JSON.parse(profile.stdout);
        }
        results.push({ engine, workload, size, round, timing, memory });
        console.log('round=' + round + ' ' + workload + ' n=' + size + ' ' + engine
          + ' median=' + timing.timingMs.median.toFixed(3) + 'ms p95=' + timing.timingMs.p95.toFixed(3) + 'ms');
      }
    }
  }
}
const summaries = [];
for (const size of config.sizes) {
  for (const workload of WORKLOAD_NAMES) {
    const group = results.filter(row => row.size === size && row.workload === workload);
    const baseline = group.find(row => row.engine === 'reference');
    for (const row of group) {
      if (row.timing.checksum !== baseline.timing.checksum || row.timing.version !== baseline.timing.version
        || row.timing.invalidations !== baseline.timing.invalidations) throw new Error('Equivalent-work check failed: ' + workload);
      if (row.memory && row.memory.checksum !== baseline.memory.checksum) throw new Error('Profile equivalence failed: ' + workload);
    }
    for (const engine of ['reference', 'cow', 'staged']) {
      const trials = group.filter(row => row.engine === engine);
      const profiles = trials.map(row => row.memory).filter(Boolean);
      summaries.push({ engine, workload, size, timingMs: summarize(trials.flatMap(row => row.timing.samplesMs)),
        roundMediansMs: trials.map(row => row.timing.timingMs.median),
        retainedHeapDeltaBytes: profiles.map(row => row.retainedHeapDeltaBytes),
        sampledHeapHighWaterDeltaBytes: profiles.map(row => row.sampledHeapHighWaterDeltaBytes),
        naturalGcCount: profiles.map(row => row.naturalGcEvents.length),
        naturalGcDurationMs: summarize(profiles.flatMap(row => row.naturalGcEvents.map(event => event.durationMs))),
        equivalentWork: true });
    }
  }
}
const report = { formatVersion: 1, kind: 'node-transaction-spikes', workloadVersion: WORKLOAD_VERSION,
  recordedAt: new Date().toISOString(), quick, config,
  environment: { node: process.version, v8: process.versions.v8, platform: os.platform(), release: os.release(),
    arch: os.arch(), cpu: os.cpus()[0]?.model ?? 'unknown', cpuCount: os.cpus().length, totalMemoryBytes: os.totalmem() },
  sourceFiles, methodology: {
    timing: 'Fresh process per engine/workload/size/round; no explicit GC or memory observer. Full transaction timing; closure setup and checksum outside the sample.',
    memory: 'Different fresh --expose-gc process; GC observer and sampled heap/RSS. Forced collections bracket workload and are reported separately.',
    allocation: 'Sampled heap high-water delta is a churn proxy, not total allocated bytes or exact peak. Retained deltas include profiler/harness overhead.',
    baseline: 'Eager full-clone reference using identical actions, state and metadata contract.',
    ordering: 'Rotate engine order by round; processes otherwise run sequentially.',
    correctness: 'Final alias/identity-aware SHA-256, versions and aggregate invalidation counts must match across engines/rounds.',
  }, summaries, results };
const directory = path.join(root, 'benchmarks/results');
await mkdir(directory, { recursive: true });
const output = path.join(directory, 'node-' + (quick ? 'quick-' : '') + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log('RESULT ' + path.relative(root, output));
