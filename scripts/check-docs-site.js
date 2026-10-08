// Check generated links and module paths under the actual GitHub project-site prefix.
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = path.join(root, 'build/docs-site');
const prefix = '/Rel3c';
async function htmlFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await htmlFiles(file));
    else if (entry.isFile() && file.endsWith('.html')) result.push(file);
  }
  return result;
}
let links = 0;
for (const file of await htmlFiles(folder)) {
  const html = await readFile(file, 'utf8');
  assert.ok(html.includes('<html') && html.includes('<body'), 'Empty or unrendered page: ' + file);
  if (!file.includes(path.join('examples', 'todomvc'))) {
    assert.ok(html.includes('class="site-header"') && html.includes('<h1'), 'Documentation layout/content missing: ' + file);
    assert.ok(!html.includes('{% raw %}') && !html.includes('{{ page.'), 'Unexpanded template: ' + file);
  }
  const current = new URL(prefix + '/' + path.relative(folder, file), 'https://pages.example');
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), current);
    if (url.origin !== current.origin) continue;
    assert.ok(url.pathname.startsWith(prefix + '/'), 'Project prefix lost: ' + file + ' -> ' + match[1]);
    let target = path.join(folder, decodeURIComponent(url.pathname.slice(prefix.length + 1)));
    if ((await stat(target).catch(() => null))?.isDirectory()) target = path.join(target, 'index.html');
    assert.ok((await stat(target).catch(() => null))?.isFile(), 'Broken generated link: ' + file + ' -> ' + match[1]);
    links++;
  }
}
for (const name of ['index.html', 'docs/quickstart.html', 'DOCUMENTATION.html', 'docs/api/application.html',
  'examples/todomvc/index.html', 'examples/todomvc/app.js', 'src/index.js', 'LICENSE']) {
  assert.ok((await stat(path.join(folder, name))).isFile(), 'Missing published file: ' + name);
}
await assert.rejects(stat(path.join(folder, 'tests')));
await assert.rejects(stat(path.join(folder, 'benchmarks/results')));
console.log('Generated documentation verified: ' + links + ' local links/assets under ' + prefix + ', public guide and TodoMVC modules present.');
