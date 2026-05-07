/**
 * Vite config for the standalone Admin GUI SPA.
 *
 * Builds the React SPA that gets served by the BFF.
 * Uses the same FluentUI v9 + React setup as admin-gui.
 *
 * Dev mode architecture (matching embedded admin-gui pattern):
 *   Vite: port 4002 (user-facing, receives OIDC callbacks)
 *   BFF:  port 4003 (internal, accessed via Vite proxy)
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 4002,
    host: '127.0.0.1', // Must match OIDC redirect_uri host (http://127.0.0.1:4002)
    // Dev server proxies to the BFF on port 4003
    proxy: {
      '/api': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      },
    },
  },
});
