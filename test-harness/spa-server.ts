/**
 * OIDC Test Harness — SPA HTTPS Static Server
 *
 * Serves the SPA directory over HTTPS using the test harness self-signed cert.
 * Required because Crypto.subtle (used by oidc-client-ts for PKCE S256) is only
 * available in secure contexts (HTTPS or localhost). When testing cross-domain
 * (app.test ≠ localhost), the SPA must be served over HTTPS.
 *
 * Replaces sirv for cross-domain testing.
 */

import { createServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname!, '.');
const CERT_DIR = join(ROOT, 'certs');
const SPA_DIR = join(ROOT, 'spa');
const PORT = 4100;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(
  {
    key: readFileSync(join(CERT_DIR, 'server.key')),
    cert: readFileSync(join(CERT_DIR, 'server.crt')),
  },
  (req, res) => {
    const urlPath = (req.url || '/').split('?')[0]; // Strip query string
    const filePath = join(SPA_DIR, urlPath === '/' ? 'index.html' : urlPath);

    // Security: prevent path traversal
    if (!filePath.startsWith(SPA_DIR)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // CORS — allow cross-origin requests (needed for OIDC discovery fetch)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      res.statusCode = 200;
      res.end(content);
      const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
      console.log(`  [${ts}] ${res.statusCode} ─ ${urlPath}`);
    } catch (err) {
      res.statusCode = 500;
      res.end('Internal server error');
    }
  },
);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SPA-HTTPS] Server running at https://app.test:${PORT}`);
  console.log(`[SPA-HTTPS] Serving files from ${SPA_DIR}`);
});
