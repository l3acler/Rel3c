# Public state-location example

Run npm run dev from the root, then open http://localhost:3000/examples/persistence/.
Increment both counts, edit the session note and URL filter, and flush storage.
Reload: local count, session note and URL filter restore; memory count resets.

Change the filter on Home, open Details and change it there, then use browser
back/forward. Each history entry restores its own URL filter while the app keeps
its local/session fields. Entering a route without an owned query key resets that
URL field to its initial default. Try rollback: the throwing action changes no
committed state, URL or persisted data.

The app configures only four top-level fields, uses hash routing and public
framework imports, and registers native editing handlers through descriptors.
Storage errors appear through onError; invalid external data falls back and queues
an error report. Disposal cancels writes, so flushPersistence is available before
an explicit disposal when the pending write is needed.

See the [public guide](../../DOCUMENTATION.md#state-locations-and-hydration) for
namespaces, validators, versions, precedence, wire limits and lifecycle behavior.
