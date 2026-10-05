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
  assert.equal(typeof framework.createActionSchema, 'function');
  assert.equal(typeof framework.FrameworkError, 'function');
  for (const name of ['element', 'div', 'span', 'form', 'input', 'when', 'derive', 'keyed']) assert.equal(typeof framework[name], 'function');
  const app = framework.createApp({ initialState: { ready: true } });
  assert.equal(app.status, 'created'); assert.equal(app.state.ready, true);
  app.dispose(); assert.equal(app.status, 'disposed');
  const schema = framework.createActionSchema()(({ action }) => ({
    set: action(value => typeof value === 'boolean', (draft, value) => { draft.ready = value; }),
  }));
  const actionable = framework.createApp({ initialState: { ready: false }, schema });
  const ready = actionable.computed(state => state.ready);
  const observer = actionable.observe(() => ready.value);
  assert.equal(ready.value, false);
  actionable.actions.set(true);
  assert.equal(observer.dirty, true); assert.equal(observer.read(), true);
  observer.dispose(); ready.dispose();
  assert.equal(actionable.state.ready, true); assert.equal(actionable.stateVersion, 2);
  actionable.dispose();
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

    for (const module of ['app.js', 'errors.js', 'records.js', 'actions/schema.js', 'actions/dispatch.js', 'state/initial-state.js',
      'state/transactions.js', 'state/data.js', 'state/draft.js', 'state/graph.js', 'reactivity/tracking.js', 'dom/bindings.js', 'dom/nodes.js', 'dom/properties.js', 'dom/renderer.js', 'dom/queue.js', 'dom/events.js', 'dom/inputs.js', 'diagnostics.js']) {
      const response = await fetchUrl(`${base}/src/runtime/${module}`);
      assert.equal(response.statusCode, 200, 'Runtime module must be served: ' + module);
      assert.ok(response.headers['content-type']?.includes('application/javascript'));
    }
    assert.ok(htmlRes.body.includes('<pre id="app"></pre>'), 'Example must provide the default #app container');
    assert.ok(mainJsRes.body.includes('app.mount()'), 'Example must use default public mounting');
    assert.ok(!mainJsRes.body.includes('innerHTML') && !mainJsRes.body.includes('addEventListener'),
      'Example consumes public lifecycle without manual DOM/event behavior');
    for (const file of ['examples/dom/', 'examples/dom/main.js', 'examples/features/', 'examples/features/main.js', 'examples/features/styles.css', 'examples/keyed/', 'examples/keyed/main.js', 'examples/inputs/', 'examples/inputs/main.js']) {
      const response = await fetchUrl(`${base}/${file}`);
      assert.equal(response.statusCode, 200, 'Public DOM example must be served');
      assert.ok(!response.body.includes('addEventListener') && !response.body.includes('innerHTML'));
    }
    for (const [file, mime] of [['examples/core/', 'text/html'], ['examples/core/app.js', 'application/javascript'], ['examples/core/main.js', 'application/javascript']]) {
      const response = await fetchUrl(`${base}/${file}`);
      assert.equal(response.statusCode, 200, 'Core example must be served: ' + file);
      assert.ok(response.headers['content-type']?.includes(mime));
    }
    console.log('[smoke]    Core/event/input modules and public-only examples OK');

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
