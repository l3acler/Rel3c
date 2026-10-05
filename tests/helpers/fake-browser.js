import { fakeDocument } from './fake-dom.js';
export function fakeBrowser(url = 'https://example.test/app/') {
  const document = fakeDocument(), view = document.defaultView;
  const entries = [{ url: new URL(url), state: { host: true } }]; let index = 0;
  const timers = new Map(), idle = new Map(); let next = 1;
  const location = {};
  for (const key of ['href', 'pathname', 'search', 'hash', 'origin']) Object.defineProperty(location, key, { get: () => entries[index].url[key] });
  view.location = location;
  view.history = {
    get state() { return entries[index].state; }, get length() { return entries.length; },
    pushState(state, title, to) { const nextURL = new URL(to, location.href); entries.splice(index + 1); entries.push({ url: nextURL, state }); index++; },
    replaceState(state, title, to) { entries[index] = { url: new URL(to, location.href), state }; },
    back() { go(-1); }, forward() { go(1); },
  };
  function go(delta) {
    const previous = location.hash;
    if (index + delta < 0 || index + delta >= entries.length) return;
    index += delta; view.dispatchEvent({ type: 'popstate' });
    if (previous !== location.hash) view.dispatchEvent({ type: 'hashchange' });
  }
  view.setTimeout = (callback, delay) => { const id = next++; timers.set(id, { callback, delay }); return id; };
  view.clearTimeout = id => timers.delete(id);
  view.requestIdleCallback = callback => { const id = next++; idle.set(id, callback); return id; };
  view.cancelIdleCallback = id => idle.delete(id);
  const turn = (delay = 0) => {
    const item = [...timers].find(([, item]) => item.delay === delay); if (!item) return false;
    timers.delete(item[0]); item[1].callback(); return true;
  };
  const idleTurn = (remaining = 10, didTimeout = false) => {
    const item = idle.entries().next().value; if (!item) return false;
    idle.delete(item[0]); item[1]({ timeRemaining: () => remaining, didTimeout }); return true;
  };
  return { document, view, turn, idleTurn, timers, idle, target: document.createElement('main') };
}
