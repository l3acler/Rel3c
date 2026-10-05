// Node 18 does not expand the quoted glob used by newer node:test versions.
// Discover files explicitly so the documented minimum has the same test set.
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.argv[2];
if (!['tests', 'spikes', 'benchmarks'].includes(directory)) throw Error('Select tests, spikes or benchmarks.');
async function discover(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== 'results') files.push(...await discover(file));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) files.push(file);
  }
  return files.sort();
}
const files = await discover(path.join(root, directory));
if (!files.length) throw Error('No test files found.');
const child = spawn(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
