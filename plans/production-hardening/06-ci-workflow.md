# CI Workflow (Phase D)

> **Document**: 06-ci-workflow.md
> **Parent**: [Index](00-index.md)

## Overview

Add GitHub Actions workflow that runs `yarn verify` on pull requests to `main` with Postgres 16 + Redis 7 service containers. Phase D is optional — skip if the project already has CI.

## File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    name: yarn verify
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: porta
          POSTGRES_PASSWORD: porta_dev
          POSTGRES_DB: porta
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U porta"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://porta:porta_dev@localhost:5432/porta
      REDIS_URL: redis://localhost:6379
      ISSUER_BASE_URL: http://localhost:3000
      COOKIE_KEYS: ci-cookie-key-for-github-actions-xxxxxx
      TWO_FACTOR_ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      LOG_LEVEL: silent

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: yarn

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Run migrations
        run: yarn migrate

      - name: Verify (lint + build + test)
        run: yarn verify
```

## Notes

- `NODE_ENV=test`, not `production`, so the Phase A `superRefine` does not kick in on the CI's dev-ish values.
- `timeout-minutes: 15` generous but lets a cold cache pass.
- Uses Node 22 (matches the `engines.node` field in `package.json`).
- `frozen-lockfile` enforces deterministic installs.
- No secrets required for the default job.
- `init-test-db.sql` under `docker/` is not needed here because the service container creates the DB via `POSTGRES_DB`.

## Optional extensions (future, not in scope)

- Nightly pentest run (`yarn test:pentest`) → separate workflow on `schedule`.
- E2E + Playwright UI → separate workflow because of the browser install cost.
- Dependency auditing (`yarn audit`) as a non-blocking job.

## Verification

- Push the workflow file in a throwaway branch; open PR; workflow runs green.
- No change to local developer workflow; `yarn verify` on laptop unchanged.
