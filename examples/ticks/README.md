# Fixed ticks and external inputs

From the root, run `npm run dev` and open `/examples/ticks/`. The app starts
paused. Run starts the framework's owned frame driver; Pause stops sampling.
Advance supplies 10,000 elapsed microseconds and pauses again. Existing backlog
may allow more than one tick, bounded by eight per advance.

Viewport, timer and local network results use view-owned input adapters and wait
for the next numbered tick. Removing the view/app cancels its pending work.
No application listener or DOM mutation is used. This is a framework example,
not the separate assignment demonstration application or a recording/replay UI.
