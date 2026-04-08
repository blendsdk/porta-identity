# CI Pipeline: Project Setup

> **Document**: 06-ci-pipeline.md
> **Parent**: [Index](00-index.md)

## Overview

GitHub Actions CI workflow that runs on a **self-hosted runner** on every push and pull request. Builds the TypeScript project and runs all tests. Future plans will extend this with integration tests, Docker builds, and deployment steps.

## GitHub Actions Workflow

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, v5]
  pull_request:
    branches: [main, v5]

jobs:
  build-and-test:
    name: Build & Test
    runs-on: self-hosted

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'yarn'

      - name: Enable Corepack
        run: corepack enable

      - name: Install dependencies
        run: yarn install --immutable

      - name: Build
        run: yarn build

      - name: Run tests
        run: yarn test
        env:
          NODE_ENV: test
          ISSUER: http://localhost:3000
          DATABASE_URL: postgresql://porta:porta@localhost:5432/porta
          REDIS_URL: redis://localhost:6379
          KEY_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000'
          COOKIE_SECRETS: test-secret
          SMTP_HOST: localhost
          SMTP_PORT: '587'
          SMTP_USER: test
          SMTP_PASS: test
          SMTP_FROM: 'Test <test@localhost>'

      - name: Verify (build + test combined)
        run: yarn verify
        env:
          NODE_ENV: test
          ISSUER: http://localhost:3000
          DATABASE_URL: postgresql://porta:porta@localhost:5432/porta
          REDIS_URL: redis://localhost:6379
          KEY_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000'
          COOKIE_SECRETS: test-secret
          SMTP_HOST: localhost
          SMTP_PORT: '587'
          SMTP_USER: test
          SMTP_PASS: test
          SMTP_FROM: 'Test <test@localhost>'
```

**Design decisions:**
- **Self-hosted runner** (`runs-on: self-hosted`) — runs on the organization's own infrastructure, not GitHub's public runners
- Runs on `main` and `v5` branches (v5 is the current working branch)
- Node.js 22 via `actions/setup-node` (assumes the self-hosted runner supports this action)
- `corepack enable` activates Yarn modern (managed by Node.js)
- `yarn install --immutable` for deterministic installs (fails if lockfile is out of date)
- Test env vars provided inline (no secrets needed for unit tests)
- `yarn verify` runs the full build + test pipeline — same as local development

### Future Extensions (Not In This Plan)

These will be added by later plans as needed:

| Extension | Plan | What It Adds |
| --------- | ---- | ------------ |
| Integration tests | Plan 2: core-oidc | PostgreSQL + Redis services in CI |
| Docker build | Plan 2+ | `docker build .` step to verify Dockerfile |
| Deployment | Plan 6: security-testing-polish | Blue-green Docker deployment |
| OIDC conformance | Plan 6 | Conformance test suite |

## Testing Requirements

- Workflow file passes `yamllint` or GitHub Actions syntax validation
- Push to `v5` branch triggers the workflow
- All steps complete successfully (build + test + verify)
