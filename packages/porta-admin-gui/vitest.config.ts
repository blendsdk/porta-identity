/**
 * Vitest config for @portaidentity/admin-gui.
 *
 * Runs unit tests by default. Integration tests are excluded
 * unless explicitly targeted (they require OIDC discovery).
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/client/**'], // Client code tested separately
    },
  },
});
