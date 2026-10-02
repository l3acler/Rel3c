import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ts;
try { ts = (await import('typescript')).default; }
catch { console.error('Type tests require the development dependency: run npm ci first.'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'spikes/action-schema/types');
const files = ['positive.ts', 'negative.ts', 'javascript.js'].map(file => path.join(directory, file));
const negative = files[1];
const source = fs.readFileSync(negative, 'utf8');
const expectedLines = new Set(source.split('\n').flatMap((line, index) => line.includes('@ts-expect-error') ? [index + 1] : []));
const options = { strict: true, noEmit: true, allowJs: true, checkJs: true, skipLibCheck: false,
  noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] };
const format = diagnostics => ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
});
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
if (diagnostics.length) { console.error(format(diagnostics)); process.exit(1); }
// Independently remove the directives: every negative line must really fail.
// This catches both unused directives and declarations accidentally widening to any.
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host);
host.readFile = file => path.resolve(file) === negative
  ? source.replaceAll('@ts-expect-error', 'expected-error-disabled') : read(file);
const rejected = ts.getPreEmitDiagnostics(ts.createProgram(files, options, host));
const actualLines = new Set();
for (const diagnostic of rejected) {
  if (!diagnostic.file || path.resolve(diagnostic.file.fileName) !== negative || diagnostic.start === undefined) {
    console.error(format([diagnostic])); process.exit(1);
  }
  actualLines.add(diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line);
}
if (!expectedLines.size || [...expectedLines].some(line => !actualLines.has(line))
  || [...actualLines].some(line => !expectedLines.has(line))) {
  console.error('Negative oracle mismatch', { expected: [...expectedLines], actual: [...actualLines] }); process.exit(1);
}
console.log('TypeScript ' + ts.version + ': positive TypeScript + checked JavaScript pass; '
  + expectedLines.size + ' independent negative lines rejected. No files emitted.');
