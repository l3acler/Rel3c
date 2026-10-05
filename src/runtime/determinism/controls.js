import { fail } from '../errors.js';
import { readRecord } from '../records.js';
export const RANDOM_ALGORITHM = 'xorshift32-13-17-5/1';
export const initialWord = seed => seed === 0 ? 0x6d2b79f5 : seed;
export const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0);
export const logicalTime = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);

export function createControls(options = {}, restored = null) {
  const config = readRecord(options, 'CONTROL_INVALID', 'controls', ['seed', 'time']);
  const seed = config.seed === undefined ? 1 : config.seed, time = config.time === undefined ? 0 : config.time;
  if (!uint32(seed) || !logicalTime(time))
    fail('CONTROL_INVALID', 'controls requires a uint32 seed and nonnegative safe integer time in logical microseconds.');
  let clock = restored?.clock ?? Object.freeze({ mode: 'manual', time, tick: 0, tickDuration: null });
  let random = restored?.random ?? Object.freeze({ algorithm: RANDOM_ALGORITHM, seed, state: initialWord(seed), draws: 0 });
  let active = false, disposed = false;
  const live = () => { if (disposed) fail('CONTROL_DISPOSED', 'Controlled services are disposed.'); };
  return Object.freeze({
    get snapshot() { live(); return Object.freeze({ clock, random }); },
    setTime(value) {
      live();
      if (clock.mode !== 'manual') fail('CONTROL_MODE', 'Fixed simulation owns logical time.');
      if (active) fail('CONTROL_REENTRANT', 'Cannot advance time during an action.');
      if (!logicalTime(value) || value < clock.time)
        fail('CONTROL_INVALID', 'Logical time must be a nonnegative safe integer at or after the current time.');
      if (value !== clock.time) clock = Object.freeze({ ...clock, time: value });
    },
    fixed(duration) {
      live();
      if (clock.mode === 'manual') clock = Object.freeze({ ...clock, mode: 'fixed', tickDuration: duration });
    },
    nextTick() {
      live();
      const time = clock.time + clock.tickDuration, tick = clock.tick + 1;
      if (active || clock.mode !== 'fixed') fail('CONTROL_REENTRANT', 'Ticks require an idle fixed clock.');
      if (!logicalTime(time) || !logicalTime(tick)) fail('CONTROL_LIMIT', 'Tick/time exceeds the safe integer range.');
      clock = Object.freeze({ ...clock, time, tick });
    },
    begin(canUse = () => true) {
      live();
      if (active) fail('CONTROL_REENTRANT', 'A service transaction is already active.');
      active = true;
      let open = true, state = random.state, draws = random.draws;
      const check = () => {
        if (!open || disposed) fail('CONTROL_EXPIRED', 'Action services expire when the action body finishes.');
        if (!canUse()) fail('CONTROL_REENTRANT', 'Services are callable only from the executing action body, outside payload admission.');
      };
      const services = Object.freeze({
        now() { check(); return clock.time; },
        random() {
          check();
          if (draws >= Number.MAX_SAFE_INTEGER) fail('CONTROL_LIMIT', 'Random draw count exceeds the safe integer range.');
          state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
          draws++; return state / 4294967296;
        },
      });
      return Object.freeze({
        services,
        revoke() { open = false; },
        commit() {
          // Called only after store publication; this step cannot fail.
          open = false; active = false;
          if (draws !== random.draws) random = Object.freeze({ ...random, state, draws });
        },
        abort() { open = false; active = false; },
      });
    },
    dispose() { disposed = true; active = false; clock = random = null; },
  });
}
