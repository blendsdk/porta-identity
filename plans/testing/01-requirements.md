# Requirements: Testing Strategy

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-10](../../requirements/RD-10-testing-strategy.md)

## Feature Overview

Implement the comprehensive testing strategy for Porta v5, a public-facing multi-tenant OIDC provider. This covers integration tests (real PostgreSQL/Redis), end-to-end tests (full OIDC flows), invalid parameter tests (error handling verification), penetration tests (security hardening), test data factories, and coverage threshold enforcement.

Porta is the authentication front door for all downstream applications. Compromise of Porta means compromise of every tenant, every user, and every application. The testing strategy must reflect this criticality.

---

## Functional Requirements

### Must Have

- [ ] Vitest workspace configuration with 4 projects: unit, integration, e2e, pentest
- [ ] Test commands: `yarn test:unit`, `yarn test:integration`, `yarn test:e2e`, `yarn test:pentest`
- [ ] Separate test database (`porta_test`) via Docker init script
- [ ] Test data factories for all domain entities (orgs, apps, clients, users, roles, permissions, claims)
- [ ] Integration tests for all database repositories (real PostgreSQL)
- [ ] Integration tests for Redis operations (real Redis)
- [ ] Integration tests for OIDC PostgreSQL and Redis adapters
- [ ] Integration tests for services requiring infrastructure (config, email, signing keys)
- [ ] E2E tests for OIDC flows: Authorization Code + PKCE, Client Credentials, Refresh Token Rotation
- [ ] E2E tests for token operations: introspection, revocation, discovery
- [ ] E2E tests for authentication workflows: password login, magic link, forgot/reset password
- [ ] E2E tests for consent flow
- [ ] E2E tests verifying multi-tenant isolation
- [ ] E2E tests for invalid/malformed parameters on all OIDC endpoints (negative path testing)
- [ ] Penetration tests for OIDC protocol attacks (PKCE bypass, redirect manipulation, code injection, token replay)
- [ ] Penetration tests for authentication bypass (SQL injection, brute force, timing attacks)
- [ ] Penetration tests for magic link/password reset attacks (token prediction, host header injection)
- [ ] Penetration tests for admin API security (unauthorized access, IDOR, privilege escalation)
- [ ] Penetration tests for injection attacks (SQL, XSS, CRLF, SSTI)
- [ ] Penetration tests for cryptographic attacks (JWT algorithm confusion, key confusion)
- [ ] Penetration tests for multi-tenant exploitation (cross-tenant auth, tenant enumeration, slug injection)
- [ ] Penetration tests for infrastructure security (HTTP headers, CORS, method tampering, info disclosure)
- [ ] Test coverage reporting with threshold enforcement
- [ ] Test database setup/teardown with isolation per test suite
- [ ] Tests clean up after themselves (no leftover data)

### Should Have

- [ ] Coverage thresholds: 80% lines, 80% functions, 75% branches, 80% statements
- [ ] Snapshot tests for email templates (HTML output)
- [ ] Test data factories with `randomSuffix()` for uniqueness
- [ ] Parallel test execution for unit tests
- [ ] MailHog API client for email delivery assertions in E2E and pentest
- [ ] HTTP security header validation in pentest suite
- [ ] Race condition tests in pentest suite (parallel code exchange, refresh token rotation)

### Won't Have (Out of Scope)

- Load/stress testing (separate tooling, later)
- Visual regression testing for login pages
- Browser-based E2E testing (Playwright/Cypress) — pages are simple server-rendered forms
- Mutation testing
- Manual penetration testing (this plan covers automated pentests only)
- Third-party security scanning tools (OWASP ZAP, Burp Suite) — those are separate

---

## Technical Requirements

### Performance

- Unit tests: < 30 seconds total
- Integration tests: < 2 minutes total (sequential, real DB)
- E2E tests: < 3 minutes total (sequential, real server)
- Pentest suite: < 3 minutes total (sequential, real server)
- Full suite: < 10 minutes total

### Compatibility

- Vitest 4.1.3 (already installed)
- Node.js >=22.0.0
- Docker Compose services (Postgres 16, Redis 7, MailHog)
- TypeScript strict mode with `.js` extensions in imports

### Security (Pentest-Specific)

- All pentests must verify that attacks are **rejected** — no false positives
- Pentests must not leave the system in a compromised state
- Pentests must be idempotent and repeatable
- Pentests must cover OWASP Top 10 categories relevant to OIDC providers
- Pentests must think like an adversary: creative exploitation, chaining attacks

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Test framework | Jest, Vitest, Mocha | Vitest | Fast, TypeScript-native, already in use |
| Test DB | In-memory mock, testcontainers, Docker Compose | Docker Compose (shared) | Simple, already available, real PostgreSQL |
| Test isolation | Transactions, truncate, separate DBs | Truncate between suites | Simple, reliable, fast enough |
| E2E approach | Browser (Playwright), HTTP client, supertest | HTTP client (direct) | OIDC flows are HTTP-based, no browser needed |
| Email testing | Mock, MailHog, Ethereal | MailHog (via Docker) | Real SMTP, web UI for debugging, API for assertions |
| Coverage tool | c8, v8, istanbul | v8 (via Vitest) | Built-in, fast, accurate |
| Pentest approach | External tools, manual, automated in Vitest | Automated in Vitest | Repeatable, CI-compatible, same infrastructure |
| Invalid param tests | Part of E2E, separate suite | Part of E2E (subdirectory) | Same infrastructure, logically related |
| Pentest test command | Part of E2E, separate | Separate `yarn test:pentest` | Different intent, can run independently |

---

## Acceptance Criteria

### From RD-10

1. [ ] `yarn test` runs all tests and exits cleanly
2. [ ] `yarn test:unit` runs only unit tests (no DB/Redis needed)
3. [ ] `yarn test:integration` runs integration tests with real DB/Redis
4. [ ] `yarn test:e2e` runs E2E tests with full server
5. [ ] Test coverage report is generated
6. [ ] Coverage meets thresholds (80% lines, 80% functions, 75% branches)
7. [ ] E2E: Complete Authorization Code + PKCE flow passes
8. [ ] E2E: Complete Client Credentials flow passes
9. [ ] E2E: Complete password login flow passes
10. [ ] E2E: Complete magic link flow passes (email verified via MailHog)
11. [ ] E2E: Complete forgot/reset password flow passes
12. [ ] E2E: Token introspection and revocation work
13. [ ] E2E: Multi-tenant isolation verified
14. [ ] Integration: All repository tests pass with real PostgreSQL
15. [ ] Integration: OIDC adapter tests pass
16. [ ] Unit: All service-layer logic tested
17. [ ] Test data factories produce consistent, valid data
18. [ ] Tests are parallelizable where appropriate (unit tests)
19. [ ] Tests clean up after themselves (no leftover data)

### Additional (Pentest & Invalid Params)

20. [ ] `yarn test:pentest` runs penetration tests with full server
21. [ ] E2E: Invalid parameter tests verify proper OIDC error responses
22. [ ] Pentest: OIDC protocol attacks are all rejected
23. [ ] Pentest: Authentication bypass attempts are all blocked
24. [ ] Pentest: Injection attacks are all prevented
25. [ ] Pentest: JWT/cryptographic attacks are all rejected
26. [ ] Pentest: Admin API is properly protected
27. [ ] Pentest: Multi-tenant isolation cannot be breached
28. [ ] Pentest: HTTP security headers are present and correct
29. [ ] Pentest: No information disclosure in error responses
30. [ ] Pentest: Rate limiting cannot be bypassed
31. [ ] Pentest: Magic link/password reset tokens are secure
