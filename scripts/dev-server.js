#!/usr/bin/env node
/**
 * scripts/dev-server.js
 *
 * Minimal development HTTP server using only Node.js standard library (node:http, node:fs, node:path).
 * Zero external runtime or build dependencies.
 *
 * Disclosed development tooling: Built-in Node.js HTTP server for Phase 0 local preview & smoke testing.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

export function createServer(options = {}) {
  const root = options.root || ROOT_DIR;

  const server = http.createServer((req, res) => {
    // Only handle GET and HEAD methods
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let reqPath = decodeURIComponent(parsedUrl.pathname);

      // Root path redirect to default basic example
      if (reqPath === '/' || reqPath === '') {
        res.writeHead(302, { Location: '/examples/basic/' });
        res.end();
        return;
      }

      // Safe path resolution inside root directory
      const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(root, safePath);

      // Security check: ensure path is within root
      if (!filePath.startsWith(root)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${reqPath}`);
        return;
      }

      // If directory, check trailing slash and try index.html
      if (stat.isDirectory()) {
        if (!reqPath.endsWith('/')) {
          res.writeHead(301, { Location: `${reqPath}/` });
          res.end();
          return;
        }
        filePath = path.join(filePath, 'index.html');
        try {
          stat = fs.statSync(filePath);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`404 Not Found: Directory index missing for ${reqPath}`);
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', (streamErr) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Internal Server Error');
      });
      stream.pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Internal Server Error: ${err.message}`);
    }
  });

  return server;
}

export function startServer(port = 3000, host = 'localhost') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', (err) => {
      reject(err);
    });
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        host,
        url: `http://${host}:${actualPort}/`,
        close: () => new Promise((resClose) => server.close(resClose))
      });
    });
  });
}

// Direct execution CLI entry
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const portArgIdx = process.argv.indexOf('--port');
  const port = portArgIdx !== -1 && process.argv[portArgIdx + 1]
    ? parseInt(process.argv[portArgIdx + 1], 10)
    : (parseInt(process.env.PORT, 10) || 3000);

  startServer(port)
    .then(({ url }) => {
      console.log(`[mini-framework dev-server] Server running at ${url}`);
      console.log(`[mini-framework dev-server] Root example: ${url}examples/basic/`);
      console.log(`[mini-framework dev-server] Press Ctrl+C to stop.`);
    })
    .catch((err) => {
      console.error(`[mini-framework dev-server] Failed to start:`, err);
      process.exit(1);
    });
}
