// Clean-candidate walkthrough. No signed-in browser, deployment, or Git mutation.
import assert from 'node:assert/strict';
import { cp, readdir, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--offline'), 'Only --offline is supported.');
const offline = args.includes('--offline');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'mini-framework-auditor-'));
const commands = [], checks = [], sourceFiles = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const excluded = file => ['node_modules', '.git', 'results'].includes(path.basename(file))
  || file === path.join(root, 'examples/auditor');
async function files(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory() && !excluded(file)) result.push(...await files(file));
    else if (entry.isFile()) result.push(file);
    else if (entry.isSymbolicLink()) throw Error('Unexpected symlink in candidate: ' + file);
  }
  return result.sort();
}
async function run(arguments_) {
  console.log('[auditor] ' + npm + ' ' + arguments_.join(' '));
  const command = { command: ['npm', ...arguments_], exitCode: null, output: '' };
  commands.push(command);
  await new Promise((resolve, reject) => {
    const child = spawn(npm, arguments_, { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      // Bound retained output; test reporters put their final totals at the end.
      command.output = (command.output + chunk).slice(-65536);
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      command.exitCode = code; command.signal = signal;
      if (code !== 0) reject(Error(command.command.join(' ') + ' failed:\n' + command.output));
      else { console.log(command.output.trim().split('\n').slice(-10).join('\n')); resolve(); }
    });
  });
}
let browser = null, passed = false, failure;
try {
  for (const name of ['src', 'scripts', 'tests', 'examples', 'spikes', 'benchmarks', 'docs',
    'package.json', 'package-lock.json', 'README.md', 'DOCUMENTATION.md', 'Framework_PRD.md', 'AGENTS.md']) {
    await cp(path.join(root, name), path.join(temporary, name), {
      recursive: true, filter: file => !excluded(file),
    });
  }
  const readme = await readFile(path.join(temporary, 'README.md'), 'utf8');
  const snippets = [...readme.matchAll(/<!-- auditor:(index\.html|main\.js) -->\n```(?:html|js)\n([\s\S]*?)\n```/g)];
  assert.equal(snippets.length, 2, 'README must provide exactly two complete walkthrough files.');
  assert.equal(new Set(snippets.map(match => match[1])).size, 2);
  await mkdir(path.join(temporary, 'examples/auditor'), { recursive: true });
  for (const [, name, content] of snippets) {
    const canonical = await readFile(path.join(root, 'examples/auditor', name), 'utf8');
    assert.equal(content + '\n', canonical, 'README snippet and served example differ: ' + name);
    await writeFile(path.join(temporary, 'examples/auditor', name), content + '\n');
  }
  checks.push('Fresh copy without .git, node_modules or old results; app reconstructed from README.');
  // Fingerprint executable sources, declarations, examples and public docs. Reports
  // are evidence outputs and deliberately excluded from this candidate manifest.
  for (const folder of ['src', 'scripts', 'tests', 'examples', 'docs/api']) {
    for (const file of await files(path.join(temporary, folder))) {
      sourceFiles.push({ file: path.relative(temporary, file), sha256: hash(await readFile(file)) });
    }
  }
  for (const file of ['README.md', 'DOCUMENTATION.md', 'Framework_PRD.md', 'package.json', 'package-lock.json', 'docs/browser-support.md'])
    sourceFiles.push({ file, sha256: hash(await readFile(path.join(temporary, file))) });
  // Startup and runtime verification precede installation: no hidden dependency.
  await run(['test']);
  await run(['run', 'test:spikes']);
  await run(['run', 'test:benchmarks']);
  await run(['run', 'smoke']);
  await run(['ci', '--ignore-scripts', ...(offline ? ['--offline'] : [])]);
  await run(['run', 'test:types']);
  await run(['ls', '--omit=dev']);
  const pkg = JSON.parse(await readFile(path.join(temporary, 'package.json'), 'utf8'));
  for (const name of ['dependencies', 'optionalDependencies', 'peerDependencies'])
    assert.equal(Object.keys(pkg[name] ?? {}).length, 0, 'No third-party runtime dependency: ' + name);
  assert.deepEqual(pkg.devDependencies, { typescript: '5.9.3' });
  const ts = createRequire(path.join(temporary, 'package.json'))('typescript');
  for (const file of (await files(path.join(temporary, 'src'))).filter(file => file.endsWith('.js'))) {
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const reference = node.moduleSpecifier.text;
        assert.ok(reference.startsWith('.') && reference.endsWith('.js'), 'Runtime import must be local JavaScript: ' + reference);
        const target = path.resolve(path.dirname(file), reference);
        assert.ok(target.startsWith(path.join(temporary, 'src') + path.sep), 'Runtime cannot delegate to spikes/tools/dependencies.');
      }
      if (ts.isCallExpression(node)) {
        assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, 'No runtime dynamic import escape.');
        assert.ok(!(ts.isIdentifier(node.expression) && node.expression.text === 'require'), 'No runtime require escape.');
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const appSource = await readFile(path.join(temporary, 'examples/auditor/main.js'), 'utf8');
  assert.ok(!/addEventListener|innerHTML|querySelector|createElement|appendChild/.test(appSource), 'Application must consume declarative public APIs.');
  checks.push('Runtime imports stay inside src; no runtime dependencies; app imports the public entry without DOM patches/listeners.');
  await run(['run', 'test:browser']);
  const browserFiles = (await readdir(path.join(temporary, 'tests/results'))).filter(name => name.startsWith('app-lifecycle-'));
  assert.equal(browserFiles.length, 1);
  browser = JSON.parse(await readFile(path.join(temporary, 'tests/results', browserFiles[0]), 'utf8'));
  assert.equal(browser.tests.results.filter(item => item.name.startsWith('B.11 auditor:')).length, 8);
  assert.ok(browser.tests.results.every(item => item.passed));
  for (const entry of sourceFiles) assert.equal(hash(await readFile(path.join(temporary, entry.file))), entry.sha256,
    'Checks must not modify candidate sources: ' + entry.file);
  checks.push('All candidate sources retain their original hashes after setup and verification.');
  passed = true;
} catch (error) {
  failure = { message: error.message }; console.error('[auditor] FAILED: ' + error.message);
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  const directory = path.join(root, 'tests/results'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'auditor-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json');
  await writeFile(file, JSON.stringify({ kind: 'clean-candidate-frontend-auditor', task: 'C.3–C.4', formatVersion: 1,
    recordedAt: new Date().toISOString(), passed, offline, checks, sourceFiles, commands, browser, failure,
    machine: { node: process.version, platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model },
    limitations: 'Temporary candidate copy, not a committed Git checkout. Chrome desktop automation only; OS IME, system clipboard, mobile and cross-browser qualification remain open. Controlled checkpoint/service continuation covered, fixed ticks/external inputs covered; no recording/replay, performance or heap-leak claim.' }, null, 2) + '\n', { flag: 'wx' });
  console.log('[auditor] RESULT ' + path.relative(root, file));
  if (passed) console.log('[auditor] CLEAN-CANDIDATE WALKTHROUGH PASSED.');
}
