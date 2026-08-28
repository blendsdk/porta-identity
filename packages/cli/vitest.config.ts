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
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/auth/**/*.ts',
        'src/credential-store.ts',
        'src/credential-lock.ts',
        'src/admin/session-service.ts',
        'src/admin/state.ts',
        'src/admin/organization-service.ts',
        'src/admin/organization-dialogs.ts',
        'src/admin/application.ts',
        'src/global-options.ts',
        'src/client-factory.ts',
        'src/admin/presentation.ts',
        'src/commands/admin.ts',
      ],
      thresholds: {
        'src/auth/**/*.ts': { lines: 90 },
        'src/credential-store.ts': { lines: 90 },
        'src/credential-lock.ts': { lines: 90 },
        'src/admin/session-service.ts': { lines: 90 },
        'src/admin/state.ts': { lines: 80 },
        'src/admin/organization-service.ts': { lines: 90 },
        'src/admin/organization-dialogs.ts': { lines: 60 },
        'src/admin/application.ts': { lines: 80 },
        'src/global-options.ts': { lines: 80 },
        'src/client-factory.ts': { lines: 80 },
        'src/admin/presentation.ts': { lines: 60 },
        'src/commands/admin.ts': { lines: 60 },
      },
    },
  },
});
