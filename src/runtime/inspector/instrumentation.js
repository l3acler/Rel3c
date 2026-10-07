import { fail } from '../errors.js';
import { readRecord } from '../records.js';
import { freezeGraph } from '../state/data.js';
import { byteLength, errorSummary } from '../recording/format.js';
import { diagnosticsPort } from '../diagnostics.js';

// Descriptor-only previews: no getters/toJSON, state graphs, DOM nodes, errors,
// callbacks or payload references survive a hook. Limits apply to scratch too.
export function preview(value) {
  let remaining = 128;
  const seen = new WeakSet();
  function visit(value, depth) {
    if (--remaining < 0) return '[preview limit]';
    if (value === undefined) return '[undefined]';
    if (typeof value === 'number' && Object.is(value, -0)) return '[-0]';
    if (typeof value === 'string') return value.length > 256 ? value.slice(0, 256) + '…' : value;
    if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
    if (typeof value !== 'object') return '[unsupported]';
    if (seen.has(value)) return '[alias]';
    if (depth >= 4) return '[depth limit]';
    seen.add(value);
    const out = Object.create(null);
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count++ >= 32 || remaining < 1) { out['[omitted]'] = true; break; }
      const d = Object.getOwnPropertyDescriptor(value, key);
      out[key.slice(0, 256)] = d && 'value' in d ? visit(d.value, depth + 1) : '[accessor]';
    }
    if (Array.isArray(value)) out['[array length]'] = value.length;
    return out;
  }
  return visit(value, 0);
}

const sessions = new WeakMap();
export const diagnosticSource = session => sessions.get(session);

export function createDiagnosticHub() {
  let session = null;
  return Object.freeze({
    get enabled() { return session !== null; },
    attach(next) { if (session) fail('DIAGNOSTICS_ACTIVE', 'Dispose the existing diagnostics session first.'); session = next; },
    detach(next) { if (session === next) session = null; },
    run(kind, root, run) { return session ? session.run(kind, root, run) : run(); },
    emit(type, detail) { session?.emit(type, detail); },
    simulate(run) { return session ? session.simulate(run) : run(); },
    counts: () => session?.counts() ?? { diagnosticEntries: 0, diagnosticBytes: 0, diagnosticScratch: 0 },
    dispose() { session?.close(); session = null; },
  });
}

export function createDiagnostics(app, raw = {}) {
  let port = diagnosticsPort(app);
  if (!port) fail('DIAGNOSTICS_INVALID', 'Expected a framework application.');
  port.check();
  const { maxEntries = 256, maxBytes = 1_048_576 } = readRecord(raw, 'DIAGNOSTICS_INVALID', 'diagnostics options', ['maxEntries', 'maxBytes']);
  raw = null;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096 || !Number.isInteger(maxBytes) || maxBytes < 16_384 || maxBytes > 16_777_216)
    fail('DIAGNOSTICS_INVALID', 'Use 1–4096 entries and 16384–16777216 bytes.');
  let entries = [], bytes = 0, sequence = 0, evicted = 0, dropped = 0, working = null, closed = false, previousFrame = null;
  const causes = new Set();
  const now = (() => {
    try { return globalThis.performance?.now.bind(globalThis.performance) ?? (() => null); } catch { return () => null; }
  })();
  const time = () => { try { const n = now(); return Number.isFinite(n) ? n : null; } catch { return null; } };
  const endpoint = () => ({ stateVersion: app.stateVersion, tick: app.controls.clock.tick, time: app.controls.clock.time });
  const safe = run => { try { return run(); } catch { dropped++; return null; } };
  const sink = {
    emit(type, detail) {
      if (closed || !working) return;
      safe(() => {
        working.counts[type] = (working.counts[type] ?? 0) + 1;
        if (type === "evaluation" && detail.binding) working.counts["binding-evaluation"] = (working.counts["binding-evaluation"] ?? 0) + 1;
        if (type === 'dirty' && working.kind !== 'render' && causes.size < 256) causes.add(working.sequence);
        const event = { type, detail: preview(detail) }, cost = byteLength(JSON.stringify(event)) + 1;
        if (working.events.length >= 256 || working.bytes + cost > maxBytes - 8192) { working.omittedEvents++; return; }
        working.bytes += cost; working.events.push(event);
      });
    },
    run(kind, root, run) {
      if (closed || working) return run();
      const started = time();
      const work = safe(() => ({ sequence: ++sequence, kind, root: preview(root), before: endpoint(), after: null,
        events: [], simulationDurationMs: null, renderDurationMs: null, counts: Object.create(null), causes: kind === 'render' ? [...causes] : [], omittedEvents: 0, durationMs: null,
        frame: kind === 'render' && root.source === 'frame' && Number.isFinite(root.timestampMs) ? { timestampMs: root.timestampMs, intervalMs: previousFrame === null ? null : Math.max(0, root.timestampMs - previousFrame) } : null,
        outcome: 'succeeded', error: null, bytes: 0 }));
      if (!work) return run();
      working = work;
      try { return run(); }
      catch (error) { work.outcome = 'failed'; work.error = errorSummary(error); throw error; }
      finally {
        safe(() => {
          work.after = endpoint();
          const ended = time(); work.durationMs = started === null || ended === null ? null : Math.max(0, ended - started);
          if (kind === 'render') work.renderDurationMs = work.durationMs;
          work.resources = port.resources(); delete work.bytes;
          if (kind === 'render') { causes.clear(); if (work.frame) previousFrame = work.frame.timestampMs; }
          let size = byteLength(JSON.stringify(work));
          while (size > maxBytes && work.events.length) { work.events.pop(); work.omittedEvents++; size = byteLength(JSON.stringify(work)); }
          if (size > maxBytes) { dropped++; return; }
          while (entries.length && (entries.length >= maxEntries || bytes + size > maxBytes)) { bytes -= entries.shift().size; evicted++; }
          entries.push({ value: freezeGraph(work), size }); bytes += size;
        });
        working = null;
      }
    },
    simulate(run) {
      if (!working) return run();
      const work = working, started = time();
      try { return run(); } finally {
        const ended = time();
        if (started === null || ended === null) work.simulationDurationMs = null;
        else work.simulationDurationMs = (work.simulationDurationMs ?? 0) + Math.max(0, ended - started);
      }
    },
    counts: () => ({ diagnosticEntries: entries.length, diagnosticBytes: bytes, diagnosticScratch: working ? working.events.length : 0 }),
    close() { closed = true; entries = []; bytes = 0; working = null; causes.clear(); previousFrame = null; port.hub.detach(sink); sessions.delete(session); port = null; app = null; },
  };
  port.hub.attach(sink);
  const session = Object.freeze({
    snapshot() {
      return freezeGraph({ format: 'mini-framework-diagnostics', version: 1, status: closed ? 'disposed' : 'active',
        policy: { maxEntries, maxBytes }, bytes, evicted, dropped, entries: entries.map(x => x.value),
        resources: closed ? {} : port.resources(), dependencies: closed ? null : preview(port.dependencies()),
        recording: closed ? null : app.recording,
        included: 'Truncated action/input payloads, changed values, dependency IDs, binding targets, timing and resource counts. Full recording snapshots/payloads are exported only by exportRecording().' });
    },
    export() { return JSON.stringify(session.snapshot()); },
    exportRecording() { if (closed) fail('DIAGNOSTICS_DISPOSED', 'Diagnostics session is disposed.'); port.check(); return app.exportRecording(); },
    dispose() { if (!closed) { port.check(); sink.close(); } },
  });
  sessions.set(session, app);
  return session;
}
