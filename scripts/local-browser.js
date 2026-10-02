// Development-only isolated Chrome driver. No runtime/browser automation dependency.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './dev-server.js';

export async function withLocalBrowser(run) {
  const chrome = process.env.MINI_FRAMEWORK_CHROME_PATH
    ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
  await access(chrome);
  const profile = await mkdtemp(path.join(os.tmpdir(), 'mini-fw-lifecycle-'));
  const flags = ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--disable-extensions'];
  let server; let child; let exited; let closing = false; let stderr = '';
  try {
    server = await startServer(0, '127.0.0.1');
    child = spawn(chrome, [...flags, '--user-data-dir=' + profile, 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    exited = once(child, 'exit'); const pending = new Map(); let next = 1; let buffer = Buffer.alloc(0);
    const failAll = error => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); };
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-10000); });
    child.on('error', failAll); child.on('exit', () => { if (!closing) failAll(new Error('Chrome exited: ' + stderr)); });
    child.stdio[4].on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]); let split;
      while ((split = buffer.indexOf(0)) !== -1) {
        const text = buffer.subarray(0, split).toString(); buffer = buffer.subarray(split + 1);
        if (!text) continue; const message = JSON.parse(text); const request = pending.get(message.id);
        if (!request) continue; pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
      }
    });
    const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = next++; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome timeout: ' + method + ' ' + stderr)); }, 45000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
    const browserVersion = await command('Browser.getVersion');
    const open = async relativePath => {
      const { targetId } = await command('Target.createTarget', { url: server.url + relativePath, background: false });
      const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
      const evaluate = async expression => {
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      return { evaluate, waitFor: async expression => {
        for (let attempt = 0; attempt < 80; attempt++) {
          if (await evaluate(expression)) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Browser page did not become ready: ' + relativePath);
      } };
    };
    const result = await run({ open, browserVersion, flags });
    closing = true; await command('Browser.close'); return result;
  } finally {
    if (child) { if (child.exitCode === null) child.kill('SIGTERM'); await exited?.catch(() => {}); }
    await server?.close();
    // Only the exact temporary profile returned by mkdtemp above is removed.
    await rm(profile, { recursive: true, force: true });
  }
}
