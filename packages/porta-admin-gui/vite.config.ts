/**
 * Vite config for the standalone Admin GUI SPA.
 *
 * Builds the React SPA that gets served by the BFF.
 * Uses the same FluentUI v9 + React setup as admin-gui.
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
    // Dev server proxies to the BFF during development
    proxy: {
      '/api': 'http://localhost:4002',
      '/auth': 'http://localhost:4002',
      '/health': 'http://localhost:4002',
    },
  },
});
