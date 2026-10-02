/**
 * examples/basic/main.js
 *
 * Demonstrates consuming the public framework entry point natively in the browser
 * via standard ES module imports without a bundler, compiler, or external runtime.
 */

import { VERSION, FRAMEWORK_INFO, createApp } from "../../src/index.js";

// The framework finds #app when mount() is called and owns every DOM write.
export const app = createApp({
  initialState: { message: "Public application lifecycle is running." },
  view: ({ state }) =>
    JSON.stringify(
      {
        message: state.message,
        framework: FRAMEWORK_INFO.name,
        version: VERSION,
        milestone: FRAMEWORK_INFO.phase,
        publicEntry: "/src/index.js",
        capabilities: FRAMEWORK_INFO.capabilities,
      },
      null,
      2,
    ),
});

app.mount();
// Call app.dispose() when the application is no longer needed.
