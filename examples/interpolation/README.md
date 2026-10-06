# Semantic inputs and display interpolation

Run `npm run dev` at the root and open `/examples/interpolation/`.
Run enables 20 ms ticks; Pause displays current committed position. The moving
dot and numeric display interpolate previous/current frozen tick values while
ordinary state/text bindings stay committed. Keyboard/text helpers queue owned
semantic packets; native editing remains visible immediately. Advance consumes
20 ms and any retained backlog, bounded by eight ticks, then pauses.

The app uses only public exports and framework-owned views/events/effects.
This example has no retained recording or replay UI. See the public guide for
packet observation/application and compatible route/hydration policies.
