import { fail, requireSync } from "../errors.js";
import { derive } from "../dom/bindings.js";

export function createInterpolation(
  store,
  tracking,
  controls,
  ticks,
  owner,
  schedule,
) {
  if (controls.snapshot.clock.mode !== "fixed")
    fail("INTERPOLATION_MODE", "Interpolation requires fixed simulation.");
  let previous = store.getState(),
    current = previous,
    disposed = false;
  function window() {
    const { clock } = controls.snapshot,
      status = ticks.status;
    return Object.freeze({
      previous,
      current,
      alpha:
        status.paused ||
        status.hidden ||
        status.accumulator >= clock.tickDuration
          ? 1
          : status.accumulator / clock.tickDuration,
      tick: clock.tick,
      time: clock.time,
    });
  }
  const cell = tracking.cell(window());
  function publish() {
    if (disposed) return;
    const next = window(),
      old = cell.value;
    if (Object.keys(next).every((key) => Object.is(next[key], old[key])))
      return;
    try {
      tracking.updateCells([[cell, next]]);
    } finally {
      schedule();
    }
  }
  return Object.freeze({
    binding(read, check) {
      if (typeof read !== "function")
        fail(
          "BINDING_INVALID",
          "interpolate requires a synchronous read function.",
        );
      return derive(
        () => {
          check();
          if (disposed)
            fail("APP_DISPOSED", "Interpolation owner is disposed.");
          const result = read(cell.value);
          requireSync(
            result,
            "REACTIVITY_ASYNC",
            "Interpolation reads must be synchronous.",
          );
          return result;
        },
        owner,
        true,
      );
    },
    restore() {
      previous = current = store.getState();
      publish();
    },
    committed() {
      if (!ticks.busy) {
        previous = current = store.getState();
        publish();
      }
    },
    tick() {
      previous = current;
      current = store.getState();
      publish();
    },
    frame: publish,
    dispose() {
      disposed = true;
      previous = current = null;
      cell.dispose();
    },
  });
}
