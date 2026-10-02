import { ENGINES } from './engines.js';
import { makeInitialState, makeAction, perform, canonicalState, summarize,
  expectedVersion } from './workloads.js';

const status = document.querySelector('#status');
let running = false;
window.benchmarkStatus = 'ready';
window.runBenchmarkCase = async config => {
  if (running) throw new Error('A browser benchmark is already running');
  if (document.visibilityState !== 'visible') throw new Error('Benchmark requires a visible document');
  if (!ENGINES[config.engine]) throw new Error('Unknown engine');
  running = true;
  try {
    const engine = ENGINES[config.engine](makeInitialState(config.size));
    const samplesMs = [];
    const frameIntervalsMs = [];
    const visibleSamples = [];
    const heapBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
    let previousTimestamp = null;
    let invalidations = 0;
    for (let step = 0; step < config.warmup + config.samples; step++) {
      const action = makeAction(config.workload, config.size, step);
      await new Promise((resolve, reject) => requestAnimationFrame(timestamp => {
        try {
          const visibility = document.visibilityState;
          if (visibility !== 'visible') throw new Error('Document became hidden during benchmark');
          const start = performance.now();
          const dirty = perform(engine, action, config.workload);
          const duration = performance.now() - start;
          if (step >= config.warmup) {
            invalidations += dirty;
            samplesMs.push(duration);
            if (previousTimestamp !== null) frameIntervalsMs.push(timestamp - previousTimestamp);
            visibleSamples.push(visibility);
          }
          previousTimestamp = timestamp;
          resolve();
        } catch (error) { reject(error); }
      }));
    }
    if (engine.getVersion() !== expectedVersion(config.workload, config.warmup + config.samples)) throw new Error('Unexpected browser version');
    const canonical = canonicalState(engine);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const checksum = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    const result = { ...config, samplesMs, frameIntervalsMs, callbackScriptingMs: summarize(samplesMs),
      frameIntervalMs: summarize(frameIntervalsMs), version: engine.getVersion(), invalidations, checksum,
      visibleSamples, heapBeforeBytes: heapBefore,
      heapAfterBytes: performance.memory ? performance.memory.usedJSHeapSize : null,
      gcEvents: null, exactAllocationBytes: null };
    window.benchmarkStatus = 'finished';
    status.textContent = JSON.stringify({ engine: config.engine, workload: config.workload, size: config.size,
      callbackScriptingMs: result.callbackScriptingMs, frameIntervalMs: result.frameIntervalMs, checksum }, null, 2);
    return result;
  } finally { running = false; }
};

document.querySelector('#run').addEventListener('click', async () => {
  window.benchmarkStatus = 'running';
  try {
    await window.runBenchmarkCase({ engine: 'cow', workload: 'sparse-nested', size: 128, warmup: 6, samples: 24, round: 0 });
  } catch (error) { window.benchmarkStatus = 'failed'; status.textContent = error.message; }
});
