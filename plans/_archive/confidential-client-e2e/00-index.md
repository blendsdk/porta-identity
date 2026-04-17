# Confidential Client E2E Workflow Test

> **Feature**: Fix OIDC token endpoint body parsing + comprehensive confidential client E2E test
> **Status**: Planning Complete
> **Created**: 2026-04-10

## Overview

Fix the body parser conflict that prevents confidential clients from authenticating
at the token endpoint, remove dead `findClient` code, and add a comprehensive
Playwright E2E test that validates the full OIDC confidential client workflow:
authentication → token exchange → ID token validation → introspection → userinfo.

The SHA-256 client secret middleware approach is already implemented. The issue is
that Koa's global `bodyParser()` consumes the request body stream before
oidc-provider can parse it, causing `client_id` to be undefined at the token endpoint.

## Document Index

| #  | Document                                    | Description                              |
|----|---------------------------------------------|------------------------------------------|
| 00 | [Index](00-index.md)                        | This document — overview and navigation  |
| 01 | [Requirements](01-requirements.md)          | Feature requirements and scope           |
| 02 | [Current State](02-current-state.md)        | Analysis of current implementation       |
| 03 | [Body Parser Fix](03-body-parser-fix.md)    | Fix body parser conflict for OIDC routes |
| 04 | [Dead Code Cleanup](04-dead-code-cleanup.md)| Remove dead findClient code              |
| 05 | [E2E Test](05-e2e-test.md)                  | Comprehensive Playwright test spec       |
| 07 | [Testing Strategy](07-testing-strategy.md)  | Test verification approach               |
| 99 | [Execution Plan](99-execution-plan.md)      | Phases, sessions, and task checklist     |

## Key Decisions

| Decision | Outcome |
|----------|---------|
| Body parser fix | Skip `koa-bodyparser` for OIDC routes (let oidc-provider parse its own body) |
| Client secret approach | Keep SHA-256 middleware (working). Monkey-patch `compareClientSecret` is for future multi-secret rotation |
| Dead `findClient` config | Remove — not a valid oidc-provider v9.8.0 option, silently ignored |
| Test approach | Playwright browser for auth+consent, HTTP API for token/introspect/userinfo |

## Related Files

- `src/server.ts` — Global bodyparser middleware
- `src/middleware/client-secret-hash.ts` — SHA-256 pre-hashing middleware
- `src/oidc/client-finder.ts` — Dead code (to remove)
- `src/oidc/configuration.ts` — Dead findClient config (to clean)
- `src/oidc/provider.ts` — Dead findClient import (to clean)
- `src/clients/service.ts` — `findForOidc()` returns SHA-256 as client_secret
- `tests/ui/flows/confidential-client.spec.ts` — New E2E test
