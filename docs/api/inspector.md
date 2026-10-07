# Optional diagnostics and development inspector — D.3/D.4

Use public `createDiagnostics(app, options?)` and `createInspector(config)`.
The [root guide](../../DOCUMENTATION.md#development-diagnostics-and-inspector)
contains a complete example; `/examples/inspector/` runs without a build.
No runtime dependencies, DOM patching or application listeners are needed.

## Capture and storage

Create diagnostics before mounting to include construction, or attach later to
capture subsequent work. Capture is off by default. An app supports one active
session; another attachment throws `DIAGNOSTICS_ACTIVE`. Dispose the session to
attach a replacement. Attachment/disposal/full-recording export require a live,
idle boundary; active actions, reads, notifications, rendering, mounting, ticks,
guards or error reporting throw `DIAGNOSTICS_REENTRANT`. Invalid apps/options
throw `DIAGNOSTICS_INVALID`; disposed apps throw `APP_DISPOSED`.

| Option | Default | Accepted range |
| --- | --- | --- |
| `maxEntries` | 256 | Integer 1–4096 |
| `maxBytes` | 1,048,576 | Integer 16,384–16,777,216 |

Unknown options/accessors reject. A recent window evicts the oldest completed
entries until both limits hold. `bytes` is the sum of JSON UTF-8 sizes of retained
entry objects; it excludes the snapshot envelope, current resource/dependency
summary and JS object overhead. It is a serialized-data bound, not a heap-size
measurement. A working entry keeps at most 256 detail events and reserves 8,192
bytes for metadata; counters still count omitted events. Capture failures increment
`dropped` and leave application results/errors untouched.

Descriptor-only previews keep at most 128 visited values, four object levels,
32 properties per object and 256 UTF-16 units per string/key. Arrays use numeric
keys plus `[array length]`; aliases, undefined and negative zero use display
markers. Limits/omissions are visible markers. These previews are lossy and may
contain application values; they are never replay inputs or full state snapshots.
No getters/toJSON are invoked; no payload graph, DOM node, callback, transaction
view or application Error survives in retained entries.

## Session methods and fields

- `snapshot()` returns a deeply frozen, nonreactive value. It includes format/version,
  status, policy, bytes, eviction/capture-failure counts, completed entries, current
  owned-resource counts, a bounded dependency graph preview, recording status and
  a description of included values. Caller-retained snapshots remain valid.
- `export()` returns that diagnostic snapshot as JSON. Capture never exports
  automatically. This format is version 1, for inspection only; no diagnostic
  importer/replay contract exists.
- `exportRecording()` explicitly calls the source app's recording export. It
  includes the full recording baseline/end/keyframes, input/action payloads,
  values and controlled continuation. It does not start recording. Normal
  recording errors such as `RECORDING_MISSING` propagate. After disposal it throws
  `DIAGNOSTICS_DISPOSED`.
- `dispose()` is idempotent, stops capture and clears retained/scratch data and
  source references. Subsequent snapshot/export return an empty disposed session
  with no dependency/recording/resource data. The app remains usable. App disposal
  automatically closes its session. A new branch requires a new session on its
  new `history.app`; old inspection diagnostics are disposed.

Each entry has a diagnostic `sequence`, `kind`, root preview, before/after
`stateVersion`/logical tick/time, event details, counters, render `causes`, omitted
detail count, observed duration, frame data, outcome/error summary and owned
resources at completion. Diagnostic sequences include renders/restores and are
**not recording root sequences** or state versions.

| Event/work | Meaning |
| --- | --- |
| `action` | Admitted name/payload preview, batch-local ID/parent and queued/dispatched/committed/failed/discarded phases; FIFO order is preserved |
| `input`, `input-end` | Executed semantic packets, origin/result payload previews, execution sequence, derived/queued flags and outcome |
| `commit`, `change` | Successful state version/no-op flag and actual transaction deltas: logical node ID, canonical path, add/set/delete, old/new previews |
| `dirty` | Affected resource ID, kind, binding target, dependency tokens/source IDs and whether it newly became dirty |
| `evaluation` | Actual tracked evaluation and its current property/source dependencies, binding target and failure flag |
| `binding-evaluation` counter | Evaluations belonging to renderer-owned bindings, separate from general observer/computed evaluation counts |
| `dom-write` | Successful renderer append/insert/move/remove, text, attribute, style, native form-property/default-property mutation |

Property tokens encode `[logicalNodeId, readKind, key]`; read kinds include value,
presence, keys and array iteration. Join changed IDs/keys to dirty dependency tokens;
join dirty resource IDs to render evaluations. Computed/cell/observer edges use
resource IDs, so indirect dependencies are visible. Evaluation/dirty/current graph details sample at most 32 property/source edges per resource and include full `dependencyCount`/`sourceCount`. Node IDs are local to that
application lifetime; a history restore establishes a new state graph. Paths choose
one canonical route through aliases. The bounded current graph contains at most
32 resources and 32 property/source edges per resource before preview limits.

`dispatch` groups a root and FIFO children; `input` groups immediate semantic work;
`tick` groups queued inputs and its simulation action; `time` records a controlled
manual time change. Replay uses the same groups. History restoration has `restore`
entries; restoration is bulk invalidation, not a synthetic property-delta action.
Rendering is a separate `render` entry and coalesces current values. Its `causes`
lists up to 256 preceding dirty transition sequences since the last render; referenced
entries may already be evicted. Causes describe invalidation, not a promise that
every dirty observer runs or writes. Retried failed renders can have no new causes.

`durationMs` observes synchronous grouped work with `performance.now()` when
available; failures/unavailable clocks yield null. Tick duration includes inputs,
simulation action and notifications. Dispatch duration includes commit/notifications.
Render duration includes binding work and frame-priority callbacks; construction
uses source `mount`, explicit flush uses `flush`. Automatic renders use source
`frame` with the native RAF timestamp and interval between captured visual frames.
`simulationDurationMs` separately measures the configured simulation-action dispatch region (including FIFO children/commit/notifications) within a tick; it excludes other queued inputs. `renderDurationMs` reports the render region. Either is null when not measured. The interval is not display-refresh rate or a simulation tick; ticks/render frames
remain separate. These timings never enter authoritative controls, actions,
checkpoints, hashes or recordings. Manual reads/scheduled work outside a captured
root are reflected by current resource/dependency counts, not separate traced
transitions. DOM counts exclude selection restoration, listener operations, node
allocation, browser internals and application mutations outside the framework.
Resource counts enumerate framework-owned handles, including native listeners,
queue/frame/tick/effect/persistence work; they do not prove garbage collection.

## Inspector

`createInspector({ diagnostics, target?, history?, onExport? })` creates a separate
framework-owned panel app. Without `target`, call `inspector.mount(element)`
explicitly (or mount at `#app`). `history`, if supplied, must expose the same app
as the diagnostic session. Invalid config/selection/export kind throws
`INSPECTOR_INVALID`. APIs remain experimental.

The panel shows included-value disclosure, retention counters, native transition
selection, selected root/inputs/changes/dirty/evaluation/write/timing details,
resource/dependency/queue counts, and explicit exports. It shows at most the latest
256 selector rows; older retained entries can be selected programmatically.
Read-only labeled textareas preserve native selection and keyboard access. The
native select supports arrow keys; buttons support Enter/Space. Refresh is explicit
to keep inspector sampling independent of the source simulation/render schedule.

- `app` exposes the separate panel app for lifecycle/flush inspection.
- `refresh()` resamples completed diagnostics/current resources. The selected
  entry survives if retained; otherwise selection falls back to the latest.
- `select(sequence)` selects a nonnegative safe diagnostic sequence (negative zero
  rejects); missing/evicted sequences fall back to the latest. Selection does not
  seek or dispatch to the source.
- `export('diagnostics' | 'recording')` defaults to diagnostics, returns the full
  JSON text, and updates an explicit export preview. Optional synchronous
  `onExport(text,kind)` receives the complete string after an explicit API/button
  call; configure it to save/copy externally if desired. Promise returns throw
  `INSPECTOR_ASYNC`; the export/preview has already completed. It is never called
  by construction, refresh or selection.
- `mount(target?)` mounts the declarative panel and returns the inspector.
- `dispose()` is idempotent and releases only the panel's DOM/handlers/resources
  and source references. It never disposes the supplied diagnostics/history/app.
  Direct panel-app disposal also closes the inspector. Later active methods throw
  `INSPECTOR_DISPOSED`.

Details/export previews are capped at 65,536 characters. The full export still
returns to the caller/`onExport`; the panel displays a truncation marker. Button
errors appear in a native status region, while direct API calls throw.
With `history`, separate Seek baseline/Seek end/Undo root/Redo root controls
explicitly mutate inspected state under its existing policy, flush its view and
refresh the panel. These use recording sequences, not diagnostic sequence selection.
Completed external effects are never undone. Branching stays on the history API;
dispose/recreate diagnostics/panel around the new app after branching.

See [ADR 0022](../adr/0022-bounded-diagnostics-inspector.md) and
[verification](../reports/task-D.3-D.4-diagnostics-inspector.md). The
[D.5/D.6 report](../reports/task-D.5-D.6-performance.md) measures bounded capture
overhead and heap/GC observations separately; it does not measure an open panel.
