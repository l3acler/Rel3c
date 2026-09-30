/**
 * examples/basic/main.js
 *
 * Demonstrates consuming the public framework entry point natively in the browser
 * via standard ES module imports without a bundler, compiler, or external runtime.
 */

import { VERSION, FRAMEWORK_INFO, createApp } from '../../src/index.js';

const statusEl = document.getElementById('app-status');
const outputBox = document.getElementById('output-box');
const capabilityList = document.getElementById('capability-list');

try {
  // Verify public exports
  const app = createApp();

  if (statusEl) {
    statusEl.innerHTML = `Loaded <strong id="status-indicator">mini-framework v${VERSION}</strong> successfully via browser-native ES module import.`;
  }

  if (outputBox) {
    outputBox.innerHTML = `
      <pre><code>${JSON.stringify({
        framework: FRAMEWORK_INFO.name,
        version: FRAMEWORK_INFO.version,
        milestone: FRAMEWORK_INFO.phase,
        publicEntry: '/src/index.js',
        appInstanceCreated: Boolean(app)
      }, null, 2)}</code></pre>
    `;
  }

  if (capabilityList && Array.isArray(FRAMEWORK_INFO.capabilities)) {
    capabilityList.innerHTML = FRAMEWORK_INFO.capabilities
      .map((cap) => `<li>${cap}</li>`)
      .join('');
  }
} catch (err) {
  if (statusEl) {
    statusEl.innerHTML = `<span style="color: #f87171;">Failed to load framework: ${err.message}</span>`;
  }
  console.error('[mini-framework basic example error]', err);
}
