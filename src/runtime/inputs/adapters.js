import { fail, requireSync } from '../errors.js';
import { ownValue } from './ownership.js';

function originValue(origin) {
  if (typeof origin !== 'string' || !origin.trim() || origin.length > 128)
    fail('INPUT_INVALID', 'Input origin must be a nonempty string of at most 128 UTF-16 units.');
}
function errorValue(error) {
  try {
    return Object.freeze({ name: typeof error?.name === 'string' ? error.name.slice(0, 128) : 'Error',
      message: typeof error?.message === 'string' ? error.message.slice(0, 2048) : 'External operation failed.' });
  } catch { return Object.freeze({ name: 'Error', message: 'External operation failed.' }); }
}

export function createInputs(deliver, operation, registration, validateAction, host, readExternal, replay = null) {
  const scopes = new Map(); let disposed = false, pending = 0;
  function scoped(active = () => true, addCleanup = null) {
    const resources = new Set(); let closed = false;
    const live = () => {
      if (closed || !active()) fail('SCOPE_DISPOSED', 'External input scope is disposed.');
      if (disposed) fail('APP_DISPOSED', 'External input owner is disposed.');
    };
    function close() {
      if (closed) return;
      closed = true;
      const errors = [];
      for (const stop of [...resources]) try { stop(); } catch (error) { errors.push(error); }
      resources.clear(); scopes.delete(close);
      if (errors.length) throw new AggregateError(errors, 'External input cleanup failed.');
    }
    scopes.set(close, resources); addCleanup?.(close);
    function admit(origin, action, status, value, error = null) {
      live(); originValue(origin); validateAction(action);
      if (replay) return Object.freeze({ sequence:0, tick:replay.clock().tick, time:replay.clock().time,
        input:Object.freeze({version:1,origin,status:'cancelled',value:null,error:null}),cancel:()=>{} });
      const input = ownValue({ version: 1, origin, status, value, error }).value;
      let stop;
      const ticket = deliver(action, input, () => {
        resources.delete(stop); return !closed && active() && !disposed;
      });
      if (ticket.cancel) {
        stop = () => { resources.delete(stop); ticket.cancel(); };
        resources.add(stop);
      }
      return Object.freeze({ sequence: ticket.sequence, tick: ticket.tick, time: ticket.time, input,
        cancel: () => operation(() => { live(); stop?.(); }) });
    }
    function send(origin, action, value) {
      return operation(() => admit(origin, action, 'success', value));
    }
    function sample(origin, action, read) {
      return operation(() => {
        live(); originValue(origin); validateAction(action);
        if (typeof read !== 'function') fail('INPUT_INVALID', 'sample requires a synchronous reader.');
        if (replay) return admit(origin, action, 'cancelled', null);
        let value, error;
        try { value = readExternal(() => {
          const result = read(); requireSync(result, 'INPUT_ASYNC', 'Use effect for asynchronous external values.'); return result;
        }); }
        catch (cause) {
          if (cause?.code === 'INPUT_ASYNC') throw cause;
          error = errorValue(cause);
        }
        return admit(origin, action, error ? 'error' : 'success', error ? null : value, error ?? null);
      });
    }
    function effect(origin, action, run) {
      return registration(() => {
        live(); originValue(origin); validateAction(action);
        if (typeof run !== 'function') fail('INPUT_INVALID', 'effect requires a callback receiving an AbortSignal.');
        if (replay) return Object.freeze({ done:Promise.resolve(null), cancel:()=>{} });
        if (pending >= 1024) fail('INPUT_LIMIT', 'An app supports at most 1024 pending effects.');
        const controller = new AbortController(); let ended = false, resolve, reject;
        const done = new Promise((yes, no) => { resolve = yes; reject = no; });
        done.catch(() => {});
        pending++;
        function finish(status, value, error = null, suppress = false) {
          if (ended) return;
          ended = true; pending--; resources.delete(stop);
          try {
            if (suppress || closed || !active() || disposed) resolve(null);
            else resolve(operation(() => admit(origin, action, status, value, error)));
          } catch (cause) { reject(cause); }
          finally { if (status === 'cancelled') controller.abort(); }
        }
        const stop = () => finish('cancelled', null, null, true);
        resources.add(stop);
        // Consume both outcomes even when cancellation/disposal wins the race.
        Promise.resolve().then(() => {
          if (!ended) return run(controller.signal);
        }).then(value => finish('success', value), cause => finish('error', null, errorValue(cause)));
        return Object.freeze({ done, cancel: () => operation(() => { live(); finish('cancelled', null); }) });
      }, !!addCleanup);
    }
    return Object.freeze({
      send, sample, effect,
      keyboard(origin, action) {
        registration(() => { live(); originValue(origin); validateAction(action); }, !!addCleanup);
        return (input, _event) => send(origin, action, input);
      },
      text(origin, action) {
        registration(() => { live(); originValue(origin); validateAction(action); }, !!addCleanup);
        return (input, _event) => send(origin, action, input);
      },
      measure(origin, action, kind, target) {
        return sample(origin, action, () => {
          const view = host();
          let value;
          if (kind === 'viewport') value = { width: view.innerWidth, height: view.innerHeight, scale: view.devicePixelRatio };
          else if (kind === 'layout') {
            const rect = target.getBoundingClientRect();
            value = Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(key => [key, rect[key]]));
          } else if (kind === 'scroll') {
            value = target ? { x: target.scrollLeft, y: target.scrollTop } : { x: view.scrollX, y: view.scrollY };
          } else fail('INPUT_INVALID', 'Unknown measurement kind.');
          if (Object.values(value).some(number => typeof number !== 'number' || !Number.isFinite(number)))
            fail('INPUT_INVALID', 'Measurements require finite numeric browser values.');
          return value;
        });
      },
      storage(origin, action, storage, key) {
        return sample(origin, action, () => {
          if (typeof key !== 'string') fail('INPUT_INVALID', 'Storage keys must be strings.');
          const value = storage.getItem(key);
          if (value !== null && typeof value !== 'string') fail('INPUT_INVALID', 'Storage results must be strings or null.');
          return { key, value };
        });
      },
      timer(origin, action, delay, value = null) {
        // Own the future value before waiting, so caller mutation cannot change it.
        return registration(() => {
          live();
          if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0 || delay > 2147483647)
            fail('INPUT_INVALID', 'Timer delay must be between 0 and 2147483647 milliseconds.');
          const owned = ownValue(value).value;
          return effect(origin, action, signal => new Promise(resolve => {
            const view = host(), timerHost = typeof view.setTimeout === 'function' ? view : globalThis;
            const id = timerHost.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(owned); }, delay);
            function cancel() { timerHost.clearTimeout(id); resolve(null); }
            signal.addEventListener('abort', cancel, { once: true });
          }));
        }, !!addCleanup);
      },
    });
  }
  return Object.freeze({
    scoped,
    get pending() { return pending; },
    counts: () => ({ externalEffects: pending,
      inputResources: [...scopes.values()].reduce((sum, resources) => sum + resources.size, 0) }),
    dispose() {
      disposed = true; const errors = [];
      for (const close of [...scopes.keys()]) try { close(); } catch (error) { errors.push(error); }
      scopes.clear();
      if (errors.length) throw new AggregateError(errors, 'Input scopes failed to close.');
    },
  });
}
