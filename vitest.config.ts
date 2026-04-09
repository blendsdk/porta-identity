/**
 * Vitest workspace configuration with 4 projects.
 *
 * Each project has its own include pattern, timeout, and setup:
 * - unit:        Fast tests, no external services, 10s timeout
 * - integration: Real DB/Redis tests, sequential, 30s timeout
 * - e2e:         Full server + HTTP requests, sequential, 60s timeout
 * - pentest:     Security/attack tests, sequential, 60s timeout
 *
 * Integration/E2E/pentest use singleFork to prevent DB race conditions.
 * Coverage thresholds enforce minimum quality on src/ code.
 *
 * NOTE: globalSetup files are added to projects when their setup files
 * are created in later phases (Phase 3: integration, Phase 6: e2e,
 * Phase 10: pentest). Until then, the projects are defined without
 * globalSetup so --project flags work immediately.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Coverage configuration (applies when running with --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**', // CLI tested via integration
        'src/types/**', // Type definitions only
        'src/**/index.ts', // Re-exports / barrel files
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Workspace projects — each project has its own include/setup/timeout
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          testTimeout: 10_000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // globalSetup added in Phase 3 when tests/integration/setup.ts is created
          testTimeout: 30_000,
          hookTimeout: 30_000,
          pool: 'forks',
          // Sequential execution to avoid DB conflicts
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          // globalSetup added in Phase 6 when tests/e2e/setup.ts is created
          testTimeout: 60_000,
          hookTimeout: 60_000,
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'pentest',
          include: ['tests/pentest/**/*.test.ts'],
          environment: 'node',
          // globalSetup added in Phase 10 when tests/pentest/setup.ts is created
          testTimeout: 60_000,
          hookTimeout: 60_000,
          pool: 'forks',
        },
      },
    ],
  },
});
