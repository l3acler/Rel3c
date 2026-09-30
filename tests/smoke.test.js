import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VERSION, FRAMEWORK_INFO, createApp } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 0.1 Root Scaffold & Public Entry Smoke Tests', () => {
  test('public exports are available and immutable where expected', () => {
    assert.equal(typeof VERSION, 'string', 'VERSION should be a string');
    assert.match(VERSION, /^\d+\.\d+\.\d+/, 'VERSION should match semver pattern');

    assert.equal(typeof FRAMEWORK_INFO, 'object', 'FRAMEWORK_INFO should be an object');
    assert.equal(FRAMEWORK_INFO.name, 'mini-framework');
    assert.equal(FRAMEWORK_INFO.version, VERSION);
    assert.ok(Array.isArray(FRAMEWORK_INFO.capabilities), 'capabilities should be an array');
    assert.ok(FRAMEWORK_INFO.capabilities.length > 0, 'capabilities list should not be empty');

    // Confirm frozen objects
    assert.ok(Object.isFrozen(FRAMEWORK_INFO), 'FRAMEWORK_INFO should be frozen');
    assert.ok(Object.isFrozen(FRAMEWORK_INFO.capabilities), 'capabilities should be frozen');
  });

  test('createApp placeholder interface fulfills initial contract', () => {
    assert.equal(typeof createApp, 'function', 'createApp should be a function');
    const app = createApp();
    assert.equal(app.version, VERSION);
    assert.equal(app.mounted, false);

    // Error handling on invalid target
    assert.throws(() => {
      app.mount(null);
    }, /requires a valid target DOM element/);

    // Mock mounting
    const mockElement = { nodeType: 1, tagName: 'DIV' };
    const mountedApp = app.mount(mockElement);
    assert.equal(mountedApp, app, 'mount should return app instance for chaining');
    assert.equal(app.mounted, true);

    app.dispose();
    assert.equal(app.mounted, false);
  });

  test('package.json enforces zero runtime dependencies and ES module structure', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.equal(pkg.type, 'module', 'package.json must specify type="module"');
    assert.equal(pkg.version, VERSION, 'package.json version must match src/index.js VERSION');
    assert.equal(pkg.dependencies, undefined, 'There must be NO third-party runtime dependencies');
    assert.ok(pkg.scripts.dev, 'dev script must be present');
    assert.ok(pkg.scripts.test, 'test script must be present');
    assert.ok(pkg.scripts.smoke, 'smoke script must be present');
  });
});
