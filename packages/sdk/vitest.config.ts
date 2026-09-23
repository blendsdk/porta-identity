/**
 * Vitest configuration for @portaidentity/sdk.
 *
 * All SDK tests are pure unit tests — no external services required.
 * Tests use mock transports to verify domain logic, error handling,
 * pagination, and type correctness.
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
      include: ['src/auth/cli-auth.ts', 'src/transport/node-transport.ts'],
      thresholds: {
        'src/auth/cli-auth.ts': { lines: 90 },
        'src/transport/node-transport.ts': { lines: 80 },
      },
    },
  },
});
