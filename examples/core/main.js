import { createApp } from '../../src/index.js';
import { coreConfig } from './app.js';

export const app = createApp(coreConfig());
app.mount();
