# Testing Strategy: Coverage & Verification

> **Document**: 08-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Overview

This document covers cross-cutting testing concerns: coverage thresholds, CI integration, test execution strategy, and the overall verification approach for all test suites.

## Coverage Goals

### Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Lines | 80% | Core business logic must be well-tested |
| Functions | 80% | All public functions should have test coverage |
| Branches | 75% | Error paths and conditionals covered (slightly lower for complex branching) |
| Statements | 80% | Overall code execution coverage |

### Coverage Exclusions

| Exclusion | Reason |
|-----------|--------|
| `src/cli/**` | CLI tested via integration/unit tests, not direct coverage |
| `src/types/**` | Type definitions only — no runtime code |
| `src/**/index.ts` | Barrel re-exports — no logic |

### Coverage Reporting

- **Text** — Console output during test runs
- **HTML** — Interactive report for local development (`coverage/index.html`)
- **LCOV** — Machine-readable for CI tools

## Test Execution Strategy

### Local Development

```bash
# Quick iteration — unit tests only (no Docker needed)
yarn test:unit

# Integration tests (requires Docker services)
yarn docker:up
yarn test:integration

# E2E tests (requires Docker services)
yarn test:e2e

# Penetration tests (requires Docker services)
yarn test:pentest

# Full suite with coverage
yarn test:coverage

# Full verify (lint + build + test)
yarn verify
```

### CI Pipeline

```bash
# 1. Start Docker services
docker compose -f docker/docker-compose.yml up -d --wait

# 2. Run full test suite with coverage
yarn test:coverage

# 3. Run pentest suite separately (clear reporting)
yarn test:pentest

# 4. Stop services
docker compose -f docker/docker-compose.yml down
```

### Test Execution Order

| Order | Suite | Docker Required | Sequential | Timeout |
|-------|-------|----------------|------------|---------|
| 1 | Unit | No | Parallel | 10s |
| 2 | Integration | Yes (DB + Redis) | Sequential | 30s |
| 3 | E2E | Yes (DB + Redis + MailHog) | Sequential | 60s |
| 4 | Pentest | Yes (DB + Redis + MailHog) | Sequential | 60s |

## Email Template Snapshot Tests

Snapshot tests verify that email template HTML output doesn't change unexpectedly.

```typescript
// Part of integration tests — email rendering
it('should render magic link email template consistently', async () => {
  const html = await renderEmail('magic-link', {
    userName: 'Test User',
    magicLinkUrl: 'http://example.com/magic/token',
    orgName: 'Acme Corp',
  });
  expect(html).toMatchSnapshot();
});
```

## Verification Checklist

### Before Task Completion

- [ ] All unit tests pass (`yarn test:unit`)
- [ ] All integration tests pass (`yarn test:integration`)
- [ ] All E2E tests pass (`yarn test:e2e`)
- [ ] All pentest tests pass (`yarn test:pentest`)
- [ ] No regressions in existing 1,677 unit tests
- [ ] Coverage meets thresholds
- [ ] Build succeeds (`yarn build`)
- [ ] Lint passes (`yarn lint`)
- [ ] `yarn verify` passes

### Acceptance Criteria Cross-Reference

See [01-requirements.md](01-requirements.md) — Acceptance Criteria section for the complete list of 31 criteria that must pass before RD-10 is complete.
