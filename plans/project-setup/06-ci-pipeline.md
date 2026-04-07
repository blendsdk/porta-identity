# CI Pipeline: Project Setup

> **Document**: 06-ci-pipeline.md
> **Parent**: [Index](00-index.md)

## Overview

GitHub Actions CI workflow that runs on every push and pull request. Builds the TypeScript project and runs all tests. Future plans will extend this with integration tests, Docker builds, and deployment steps.

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
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [22]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Run tests
        run: npm test
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
        run: npm run verify
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
- Runs on `main` and `v5` branches (v5 is the current working branch)
- Node.js 22 only (per requirements, no multi-version matrix needed)
- `npm ci` for deterministic installs
- Test env vars provided inline (no secrets needed for unit tests)
- `npm run verify` runs the full build + test pipeline — same as local development

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
