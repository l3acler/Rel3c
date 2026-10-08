// Development-only staging: publish public docs and TodoMVC, not test artifacts or tooling.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'build/pages-source');
const repository = 'https://github.com/l3acler/Rel3c';
const prefix = '/Rel3c';
const entries = ['docs', 'src', 'examples/todomvc', 'README.md', 'DOCUMENTATION.md',
  'Framework_PRD.md', 'RELEASE_NOTES.md', 'LICENSE'];
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of entries) await cp(path.join(root, name), path.join(destination, name), { recursive: true });
await cp(path.join(root, 'docs/_config.yml'), path.join(destination, '_config.yml'));
await cp(path.join(root, 'docs/_layouts'), path.join(destination, '_layouts'), { recursive: true });

async function markdownFiles(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(file));
    else if (entry.isFile() && file.endsWith('.md')) result.push(file);
    else if (entry.isSymbolicLink()) throw Error('Unexpected symlink in documentation: ' + file);
  }
  return result;
}

// Files outside the curated site stay accessible through their repository links.
// This also keeps old measurement JSON and nonpublished History-mode demos off Pages.
async function rewriteLinks(body, original) {
  const pieces = body.split(/(^```[^\n]*\n[\s\S]*?^```[^\n]*$|`[^`\n]*`)/gm);
  for (let index = 0; index < pieces.length; index += 2) {
    const matches = [...pieces[index].matchAll(/\]\(([^\s)]+)\)/g)];
    for (const match of matches) {
      const target = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;
      const [file, suffix = ''] = target.split(/(?=[?#])/s);
      const resolved = path.resolve(path.dirname(original), decodeURI(file));
      const relative = path.relative(root, resolved).split(path.sep).join('/');
      if (relative.startsWith('../') || path.isAbsolute(relative)) throw Error('Link outside repository: ' + target);
      if (existsSync(path.join(destination, relative))) {
        if (!relative.endsWith('.md')) {
          pieces[index] = pieces[index].replace(match[0], '](' + prefix + '/' + encodeURI(relative) + suffix + ')');
        }
        continue;
      }
      if (!existsSync(resolved)) throw Error('Missing documentation target: ' + original + ' -> ' + target);
      const type = (await stat(resolved)).isDirectory() ? 'tree' : 'blob';
      pieces[index] = pieces[index].replace(match[0], '](' + repository + '/' + type + '/main/' + encodeURI(relative) + suffix + ')');
    }
  }
  return pieces.join('');
}

let pages = 0;
for (const file of await markdownFiles(destination)) {
  const original = path.join(root, path.relative(destination, file));
  const text = await readFile(file, 'utf8');
  const match = text.match(/^---\n[\s\S]*?\n---\n/);
  const title = text.match(/^# (.+)$/m)?.[1] ?? path.basename(file, '.md');
  const frontMatter = match?.[0] ?? '---\ntitle: ' + JSON.stringify(title) + '\n---\n';
  const body = await rewriteLinks(match ? text.slice(match[0].length) : text, original);
  // Runtime examples remain literal code even if they contain Liquid-like text.
  await writeFile(file, frontMatter + '\n{% raw %}\n' + body + '\n{% endraw %}\n');
  pages++;
}
console.log('Prepared ' + pages + ' public Markdown pages and the TodoMVC demo in build/pages-source.');
