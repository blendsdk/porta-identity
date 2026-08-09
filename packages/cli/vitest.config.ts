/**
 * Vitest configuration for @portaidentity/cli.
 *
 * All CLI tests are pure unit tests — no external services required.
 * Tests mock SDK calls and verify command logic, output formatting,
 * error handling, and credential management.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
