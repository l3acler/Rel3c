// Audit-only local Git snapshot. Never changes the caller's repository or contacts a remote.
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execute = promisify(execFile);
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
environment.GIT_CONFIG_NOSYSTEM = '1';
environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const options = ['-c', 'core.hooksPath=' + environment.GIT_CONFIG_GLOBAL,
  '-c', 'commit.gpgsign=false', '-c', 'user.name=mini-framework acceptance audit',
  '-c', 'user.email=acceptance@mini-framework.invalid'];
async function git(directory, ...args) {
  const result = await execute('git', [...options, ...args], { cwd: directory, env: environment });
  return result.stdout.trim();
}

export async function createAuditCheckout(candidate, checkout) {
  candidate = path.resolve(candidate); checkout = path.resolve(checkout);
  assert.notEqual(candidate, checkout, 'Checkout must be separate from its candidate.');
  await assert.rejects(access(path.join(candidate, '.git')), { code: 'ENOENT' },
    'Candidate must be a fresh non-Git copy; never initialize an existing repository.');
  await git(candidate, 'init', '--quiet');
  await git(candidate, 'add', '--all');
  await git(candidate, 'commit', '--quiet', '-m', 'D.7 local acceptance candidate');
  const revision = await git(candidate, 'rev-parse', 'HEAD');
  const tree = await git(candidate, 'rev-parse', 'HEAD^{tree}');
  await git(candidate, 'clone', '--quiet', '--local', '--no-hardlinks', candidate, checkout);
  assert.equal(await git(checkout, 'rev-parse', 'HEAD'), revision);
  assert.equal(await git(checkout, 'rev-parse', 'HEAD^{tree}'), tree);
  assert.equal(await git(checkout, 'status', '--porcelain'), '', 'Checkout must start clean.');
  return { kind: 'local-git-candidate-checkout', revision, tree,
    gitVersion: await git(checkout, '--version'), initiallyClean: true };
}

export async function assertAuditCheckoutUnchanged(checkout, revision) {
  assert.equal(await git(checkout, 'rev-parse', 'HEAD'), revision, 'Checks must not create commits.');
  assert.equal(await git(checkout, 'diff', '--name-only', 'HEAD'), '', 'Checks must not change tracked files.');
}
