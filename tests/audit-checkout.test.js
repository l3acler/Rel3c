import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuditCheckout, assertAuditCheckoutUnchanged } from '../scripts/audit-checkout.js';

test('D.7 local checkout preserves sources, excludes ignored installs and detects tracked mutations', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'mini-framework-checkout-test-'));
  try {
    const candidate = path.join(temporary, 'candidate'), checkout = path.join(temporary, 'checkout');
    await mkdir(path.join(candidate, 'node_modules'), { recursive: true });
    await writeFile(path.join(candidate, '.gitignore'), 'node_modules/\n');
    await writeFile(path.join(candidate, 'README.md'), 'A copyable public guide.\n');
    await writeFile(path.join(candidate, 'node_modules', 'ignored.js'), 'not a startup dependency');
    const metadata = await createAuditCheckout(candidate, checkout);
    assert.equal(metadata.initiallyClean, true);
    assert.match(metadata.revision, /^[a-f0-9]{40,64}$/);
    assert.equal(await readFile(path.join(checkout, 'README.md'), 'utf8'), 'A copyable public guide.\n');
    await assert.rejects(readFile(path.join(checkout, 'node_modules', 'ignored.js')), { code: 'ENOENT' });
    await assertAuditCheckoutUnchanged(checkout, metadata.revision);
    await writeFile(path.join(checkout, 'README.md'), 'Changed.\n');
    await assert.rejects(assertAuditCheckoutUnchanged(checkout, metadata.revision), /tracked files/);
    assert.equal(await readFile(path.join(candidate, 'README.md'), 'utf8'), 'A copyable public guide.\n');
    await assert.rejects(createAuditCheckout(candidate, path.join(temporary, 'second')), /existing repository/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
