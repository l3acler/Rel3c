# Routing and shared state (B.5/B.6)

Experimental public API. Use public imports and the
[copyable guide](../../DOCUMENTATION.md#routing-and-shared-application-state) or
[runnable routes example](../../examples/routes/README.md).

| API | Arguments and behavior |
| --- | --- |
| createApp({ router }) | Owned configuration: mode?, base?, routes, notFound? |
| outlet() | Public descriptor rendering one active route scope; default app view when a router is supplied |
| app.route / context.route | Immutable reactive snapshot; null before mount or without a router |
| navigate(to, options?) | URL string, optional { replace?: boolean }; returns undefined |
| link(to, props?, ...children) | Native anchor with owned href/click; other element props supported |

History is the default mode; base defaults to / and prefixes application paths.
Hash retains the mounted document path/query and places app path/query/fragment
after #; base affects History only. History hosting must serve the same module
page at deep route URLs. The root server supplies an extensionless fallback only
under /examples/routes/; missing assets return 404. Use absolute module script URLs.

Routes are an ordered array of at most 256 { path, view } records; first match
wins. Absolute literal segments and :name parameters support equivalent trailing
slashes. Parameter names are unique identifiers. Decode parameter segments once,
including encoded slash as opaque text. Wildcards, regex/optional syntax, dot
segments, duplicate patterns, holes, accessors, extra fields and async views reject.
Default notFound returns Not found. Patterns are bounded to 2,048 characters and
URLs to 8,192 characters.

Snapshot fields: encoded app path; decoded params; query mapping decoded keys to
frozen arrays preserving duplicate values; serialized search/hash; native url
(pathname/search/hash); matched/outsideBase booleans. Params/query use null-prototype
records. Reads inside derive/observe/computed track the whole location snapshot;
capturing a plain snapshot does not create live text. User-state dependencies
remain exact and independent. Location-only navigation does not advance stateVersion. Configured URL-backed
fields hydrate through a separate input commit; batched notifications see matching
route/state. See [persistence](persistence.md).

Absolute app paths prepend History base; relative/query/fragment references resolve
against the route current at admission. Full URLs must remain same-origin, within
History base or the exact hash-mode document path/query. Credentials, unsupported
protocols, whitespace/backslashes and malformed path encoding reject. Replace
uses replaceState; identical URLs write nothing. Writes preserve history.state.
Native popstate/hashchange publish once without feedback writes; History traversal
outside base produces not-found state. A malformed native location reports an error
and retains the previous snapshot until the next valid input; native history has
already changed its URL in that case. Navigation requires a mounted router.

During a successful action: publish state/notifications, apply admitted navigation
requests FIFO, then run nested actions. Each request resolves against location at
admission, not previous queued requests. Throwing/async/invalid actions discard
requests and children. At most 1,024 requests per action are admitted. Notification
or history failure after commit preserves committed state and healthy requests/
children. Failed native writes retain the previous location snapshot. Reactive
reads/notifications, payload guards, rendering and error hooks cannot navigate.

One mounted router claims each Window URL. Failure/disposal releases listeners
and ownership; callbacks from old mount attempts stay inert after retry. Nonrouter
apps may use that Window. Routes share the original store/schema/actions. A shell
may contain one outlet. Path/record changes replace its route scope; query/hash
changes retain nodes, edits, focus and selection. Navigations before a frame render
the latest view only. Unmount releases subscriptions, handlers and scheduled work.
Failed candidates dispose their resources and retain old DOM for retry while
URL/route stay committed. Cleanup failure reports a completed replacement.
Disposal does not notify location observers.

Links use native anchors/keyboard activation. Unmodified primary clicks navigate
and cancel default. Modified/middle clicks, already prevented events, download,
non-self targets, rel external, external/out-of-base URLs and History fragment-only
references retain native behavior. Link href/onClick/on.click overrides reject.
Ordinary a descriptors stay native. Links require an activated router, including
construction by views during mounting.

Errors: ROUTER_CONFIG_INVALID, ROUTER_HOST_INVALID, ROUTER_OWNED, ROUTER_MISSING,
ROUTER_NOT_MOUNTED, ROUTE_URL_INVALID, ROUTE_OPTIONS_INVALID, ROUTE_HISTORY_FAILED,
ROUTE_QUEUE_LIMIT, ROUTE_OUTLET_DUPLICATE, ROUTE_LINK_INVALID, NAVIGATION_REENTRANT,
VIEW_RESULT_INVALID, SCOPE_DISPOSED and APP_DISPOSED. Direct/native failures use
phase navigation. Action failures propagate through dispatch, or event when called
by a native handler. Outlet errors use render; initial errors use mount. Hooks
report and rethrow rather than swallowing errors.

Nested outlets, loaders, async guards and automatic focus/scroll policies remain
unimplemented. URL-backed state fields and storage are implemented in B.7/B.8;
recorded/replayed navigation remains unimplemented. State
survives route changes; reload creates a fresh app with configured field hydration and memory defaults. Browser
qualification remains Chrome-only. Decision: [ADR 0013](../adr/0013-routing-navigation.md).
