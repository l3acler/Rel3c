// Internal verification surface. Not a public inspector or supported app API.
const readers = new WeakMap();
export const registerDiagnostics = (app, read) => readers.set(app, read);
export function resourceCounts(app) {
  const read = readers.get(app);
  if (!read) throw new TypeError("Expected a framework application.");
  return Object.freeze(read());
}
