#!/usr/bin/env node
/**
 * scripts/bench-spikes.js
 *
 * Benchmark harness for Phase 0 transaction spikes (COW vs Staged Operations).
 * Captures execution environment and workload performance.
 * Populated with workloads during Phase 0.6.
 */

import os from 'node:os';

console.log('====================================================');
console.log('mini-framework Architecture Spike Benchmark Runner');
console.log('====================================================');
console.log(`Node.js:  ${process.version}`);
console.log(`OS:       ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`CPUs:     ${os.cpus().length}x ${os.cpus()[0]?.model || 'Unknown'}`);
console.log(`Memory:   ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
console.log('----------------------------------------------------');
console.log('Phase 0.1 benchmark scaffold ready.');
console.log('Transaction spike comparison workloads will run in Phase 0.6.');
console.log('====================================================');
