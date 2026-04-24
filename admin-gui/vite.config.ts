import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    // Code splitting for optimal loading
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-fluent': ['@fluentui/react-components', '@fluentui/react-icons'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 4002,
    // In dev mode, proxy API calls to the BFF server
    proxy: {
      '/api': {
        target: 'http://localhost:4003', // BFF dev server
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
