#!/usr/bin/env node
/**
 * scripts/smoke.js
 *
 * Root startup and public import smoke verification script.
 * Verifies that:
 * 1. The public entry point (src/index.js) is importable and exports required primitives.
 * 2. The dev server boots without error.
 * 3. The root route correctly directs to the basic example.
 * 4. The browser HTML, example JS, and framework src modules are served with proper MIME types.
 */

import http from 'node:http';
import assert from 'node:assert/strict';
import { startServer } from './dev-server.js';
import * as framework from '../src/index.js';

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function runSmoke() {
  console.log('[smoke] Starting mini-framework root smoke verification...');

  // 1. Verify public module imports
  console.log('[smoke] 1. Checking public module exports...');
  assert.ok(framework.VERSION, 'VERSION export must be defined');
  assert.ok(framework.FRAMEWORK_INFO, 'FRAMEWORK_INFO export must be defined');
  assert.equal(typeof framework.createApp, 'function', 'createApp must be a function');
  console.log(`[smoke]    Public exports OK (v${framework.VERSION})`);

  // 2. Start dev server on ephemeral port (0 lets OS assign free port)
  console.log('[smoke] 2. Booting dev server on ephemeral port...');
  const serverHandle = await startServer(0, '127.0.0.1');
  const base = `http://127.0.0.1:${serverHandle.port}`;
  console.log(`[smoke]    Server active at ${base}`);

  try {
    // 3. Test root redirect
    console.log('[smoke] 3. Testing GET / root redirect...');
    const rootRes = await fetchUrl(`${base}/`);
    assert.equal(rootRes.statusCode, 302, 'GET / should return 302 redirect');
    assert.equal(rootRes.headers.location, '/examples/basic/', 'GET / should redirect to /examples/basic/');
    console.log('[smoke]    Root redirect OK');

    // 4. Test basic example HTML
    console.log('[smoke] 4. Testing GET /examples/basic/...');
    const htmlRes = await fetchUrl(`${base}/examples/basic/`);
    assert.equal(htmlRes.statusCode, 200, 'GET /examples/basic/ should return 200');
    assert.ok(
      htmlRes.headers['content-type']?.includes('text/html'),
      'Content-Type must be text/html'
    );
    assert.ok(
      htmlRes.body.includes('<script type="module" src="./main.js"></script>'),
      'HTML must load main.js as ES module'
    );
    console.log('[smoke]    HTML served successfully');

    // 5. Test example JS module
    console.log('[smoke] 5. Testing GET /examples/basic/main.js...');
    const mainJsRes = await fetchUrl(`${base}/examples/basic/main.js`);
    assert.equal(mainJsRes.statusCode, 200, 'GET /examples/basic/main.js should return 200');
    assert.ok(
      mainJsRes.headers['content-type']?.includes('application/javascript'),
      'Content-Type must be application/javascript'
    );
    console.log('[smoke]    main.js served successfully');

    // 6. Test public framework entry point served via HTTP
    console.log('[smoke] 6. Testing GET /src/index.js...');
    const srcIndexRes = await fetchUrl(`${base}/src/index.js`);
    assert.equal(srcIndexRes.statusCode, 200, 'GET /src/index.js should return 200');
    assert.ok(
      srcIndexRes.headers['content-type']?.includes('application/javascript'),
      'Content-Type must be application/javascript'
    );
    assert.ok(
      srcIndexRes.body.includes('export const VERSION'),
      'src/index.js must contain public export code'
    );
    console.log('[smoke]    src/index.js served successfully');

    console.log('\n[smoke] ALL SMOKE CHECKS PASSED.');
  } finally {
    console.log('[smoke] Shutting down dev server...');
    await serverHandle.close();
    console.log('[smoke] Server stopped.');
  }
}

runSmoke().catch((err) => {
  console.error('\n[smoke] SMOKE TEST FAILED:', err);
  process.exit(1);
});
