// Private verification counters and ports used by public diagnostic sessions.
const readers = new WeakMap();
const ports = new WeakMap();
export const registerDiagnostics = (app, read, port) => {
  readers.set(app, read);
  if (port) ports.set(app, port);
};
export const diagnosticsPort = app => ports.get(app);
export function resourceCounts(app) {
  const read = readers.get(app);
  if (!read) throw new TypeError("Expected a framework application.");
  return Object.freeze(read());
}
