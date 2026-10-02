import { PerformanceObserver, performance, constants } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { ENGINES } from '../benchmarks/transactions/engines.js';
import { makeInitialState, makeAction, perform, canonicalState, summarize,
  expectedVersion } from '../benchmarks/transactions/workloads.js';

const config = JSON.parse(process.argv[2]);
const createEngine = ENGINES[config.engine];
if (!createEngine) throw new Error('Unknown benchmark engine');
const settle = () => new Promise(resolve => setImmediate(resolve));
const gcKinds = new Map([
  [constants.NODE_PERFORMANCE_GC_MAJOR, 'major'], [constants.NODE_PERFORMANCE_GC_MINOR, 'minor'],
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL, 'incremental'], [constants.NODE_PERFORMANCE_GC_WEAKCB, 'weak-callback'],
]);

async function timing() {
  const engine = createEngine(makeInitialState(config.size));
  // Action closure construction is outside timing and identical for all engines.
  for (let step = 0; step < config.warmup; step++) perform(engine, makeAction(config.workload, config.size, step), config.workload);
  const samplesMs = [];
  let invalidations = 0;
  for (let i = 0; i < config.samples; i++) {
    const action = makeAction(config.workload, config.size, config.warmup + i);
    const start = performance.now();
    // Includes begin, body, validation, publication, freeze, delta, and errors.
    invalidations += perform(engine, action, config.workload);
    samplesMs.push(performance.now() - start);
  }
  if (engine.getVersion() !== expectedVersion(config.workload, config.warmup + config.samples)) throw new Error('Unexpected committed version');
  return { samplesMs, timingMs: summarize(samplesMs), invalidations,
    version: engine.getVersion(), checksum: createHash('sha256').update(canonicalState(engine)).digest('hex') };
}

async function memory() {
  if (typeof global.gc !== 'function') throw new Error('Memory profile requires --expose-gc');
  const events = [];
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) events.push({ startTimeMs: entry.startTime,
      durationMs: entry.duration, kind: gcKinds.get(entry.detail.kind) ?? String(entry.detail.kind) });
  });
  observer.observe({ entryTypes: ['gc'] });
  const engine = createEngine(makeInitialState(config.size));
  for (let step = 0; step < config.warmup; step++) perform(engine, makeAction(config.workload, config.size, step), config.workload);
  const baselineGCStart = performance.now();
  global.gc();
  const baselineForcedGcMs = performance.now() - baselineGCStart;
  await settle();
  const baseline = process.memoryUsage();
  const start = performance.now();
  const heapSamples = [];
  for (let i = 0; i < config.memorySamples; i++) {
    perform(engine, makeAction(config.workload, config.size, config.warmup + i), config.workload);
    // Instrumentation is deliberately in a different child than clean timing.
    if ((i + 1) % 5 === 0 || i + 1 === config.memorySamples) {
      heapSamples.push({ updates: i + 1, elapsedMs: performance.now() - start, ...process.memoryUsage() });
      await settle();
    }
  }
  const end = performance.now();
  await settle();
  await settle();
  const beforeFinalGc = process.memoryUsage();
  const finalGCStart = performance.now();
  global.gc();
  const finalForcedGcMs = performance.now() - finalGCStart;
  await settle();
  const retained = process.memoryUsage();
  observer.disconnect();
  const naturalGcEvents = events.filter(entry => entry.startTimeMs >= start && entry.startTimeMs < end);
  if (engine.getVersion() !== expectedVersion(config.workload, config.warmup + config.memorySamples)) throw new Error('Unexpected profile version');
  return { baseline, heapSamples, beforeFinalGc, retained,
    retainedHeapDeltaBytes: retained.heapUsed - baseline.heapUsed,
    sampledHeapHighWaterDeltaBytes: Math.max(baseline.heapUsed, ...heapSamples.map(entry => entry.heapUsed)) - baseline.heapUsed,
    baselineForcedGcMs, finalForcedGcMs, naturalGcEvents,
    naturalGcDurationMs: summarize(naturalGcEvents.map(entry => entry.durationMs)),
    checksum: createHash('sha256').update(canonicalState(engine)).digest('hex') };
}

const result = config.mode === 'timing' ? await timing() : await memory();
process.stdout.write(JSON.stringify({ ...config, ...result }) + '\n');
