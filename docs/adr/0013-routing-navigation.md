# ADR 0013: Router ownership, reactive location and post-commit navigation

Status: implemented in B.5/B.6. Date: 5 October 2026.

## Public contract

Configure createApp with router: { mode?, base?, routes, notFound? }. Default mode
is history; hash mode supports hosts without deep-link fallback. Routes are an
ordered array of { path, view }; first matching declaration wins. Patterns use
literal segments and :name parameters; no regex/wildcard/optional syntax. Patterns
are absolute application paths; trailing slashes are equivalent. Parameters decode
one segment, including encoded slash as opaque parameter text; malformed percent
encoding rejects. Query keys map to frozen arrays preserving duplicate values.

app/context route is a frozen reactive snapshot (null before mount), with path,
params, query, search, hash, url, matched and outsideBase. It is separate from user-owned
application state and versions; route reads track the location snapshot, while
ordinary application properties retain exact property tracking. Routes use the
same store/actions, never create a new application. One mounted router owns a
window's URL; nonrouter applications remain independent. The router starts at mount,
reads the initial native location before views run, and unregisters on failure/disposal.

app/context navigate(to, { replace? }) updates URL and route snapshot together,
then renders an outlet on a frame or explicit flush. Absolute app paths are relative
to the configured base; relative/query/fragment references resolve against the
current app route at admission, not prior queued requests. Full same-origin URLs must lie within the base in history mode.
External origins, credentials and unsupported protocols reject imperative navigation.
History writes preserve native history.state; the framework adds no hidden marker.
Native back/forward and hash changes publish location once without writing history
again. Out-of-base history traversals are exposed as not-found snapshots.

A navigation request inside an executing synchronous action is owned by that
transaction. Validate the request on admission; after successful commit, publish
state then process its navigation requests FIFO before queued child actions. A
failed action discards navigation and child requests. Successful post-commit
navigation failure cannot undo the already committed action; healthy requests and
queued siblings still run. Payload guards/reactive reads/error hooks/render callbacks
cannot request navigation. This adds no action run arguments or mutation escape hatch.

outlet() renders one active route scope inside an optional persistent shell. When
no app view is specified, the app uses an outlet. One active outlet is allowed.
Path/matched-record changes replace the route scope; query/hash-only changes retain
the view and update route-bound expressions. Prepare the new route before removing
the old scope; on render failure keep the old subtree for explicit retry while URL
and route snapshot stay committed. Cleanup errors release all old resources and
report rather than undoing native history. Failed candidate scopes cancel their
own resources. There is no loader, async guard, focus override or scroll policy.

link(to, props?, ...children) builds a native anchor through the public descriptor
system with the router's href. Internal unmodified primary activation navigates;
modified/middle clicks, existing default cancellation, download/target/rel external
and external/out-of-base URLs preserve native behavior. Fragment-only links in
history mode keep native fragment behavior. Link-owned click props/href overrides
reject to avoid two navigation policies; other attributes/events remain supported.
Recognized routing clicks cancel default before invoking navigation, so a history
write error cannot silently reload the document. Ordinary a elements stay native.

## Hosting and bounds

History mode requires the host to serve the same module page for direct route URLs.
The root dev server supplies an explicit /examples/routes/ extensionless fallback;
missing assets continue returning 404. Hash mode keeps the document path/query
and encodes the app route/query/fragment after #. URL input is bounded to 8,192
characters and a configuration to 256 routes. Base paths use literal segments and affect History mode only.

Route/state URL-field precedence and storage adapters remain B.7/B.8. Inputs are
normalized outside actions, but recording/replay is Phase C. No persistence of
application state across reload is implied. Broad browser/native-input qualification
remains a separate release gate.

Standards: [HTML History](https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-history-interface)
and [DOM events](https://dom.spec.whatwg.org/#interface-event).
