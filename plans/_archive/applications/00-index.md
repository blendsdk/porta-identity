# Application & Client Management Implementation Plan

> **Feature**: RD-05 — Application, Client & Secret Management
> **Status**: Planning Complete
> **Created**: 2026-04-08
> **Depends On**: RD-01 (Scaffolding ✅), RD-02 (Database ✅), RD-03 (OIDC Core ✅), RD-04 (Organizations ✅)

## Overview

Implement the application, client, and secret management system for Porta v5.
An **application** represents a SaaS product with its modules (e.g., "BusinessSuite"
with "CRM", "Invoicing", "HR" modules). A **client** represents a specific OIDC
registration for an organization (e.g., "Acme Corp's web client"). **Secrets** are
hashed credentials for confidential clients, stored as Argon2id hashes with support
for zero-downtime rotation via multiple active secrets.

This plan introduces two new source modules (`src/applications/` and `src/clients/`),
two new route files, a new npm dependency (`argon2`), and updates the existing
OIDC client-finder to use proper secret verification. The database schema already
exists (migrations 003 and 004 from RD-02).

## Document Index

| #  | Document                                           | Description                                    |
|----|----------------------------------------------------|------------------------------------------------|
| 00 | [Index](00-index.md)                               | This document — overview and navigation        |
| 01 | [Requirements](01-requirements.md)                 | Feature requirements and scope                 |
| 02 | [Current State](02-current-state.md)               | Analysis of current implementation             |
| 03 | [Application Module](03-application-module.md)     | Types, slugs, repository, cache, service       |
| 04 | [Client Module](04-client-module.md)               | Types, repository, cache, service              |
| 05 | [Secret Management](05-secret-management.md)       | Crypto, Argon2id, secret lifecycle             |
| 06 | [API Routes & Integration](06-api-routes-and-integration.md) | Routes, OIDC integration, server    |
| 07 | [Testing Strategy](07-testing-strategy.md)         | Test cases and verification                    |
| 99 | [Execution Plan](99-execution-plan.md)             | Phases, sessions, and task checklist           |

## Quick Reference

### Usage Examples

```typescript
// Create an application
const app = await applicationService.createApplication({
  name: 'BusinessSuite',
  description: 'All-in-one business platform',
});
// app.slug === 'business-suite' (auto-generated)

// Add a module to the application
const mod = await applicationService.createModule(app.id, {
  name: 'CRM',
  description: 'Customer relationship management',
});

// Create a confidential web client for an organization
const result = await clientService.createClient({
  organizationId: orgId,
  applicationId: app.id,
  clientName: 'Acme Web App',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://acme.example.com/callback'],
  secretLabel: 'production',
});
// result.client — the new client record
// result.secret — plaintext shown ONCE: { plaintext: 'YWJjZGVm...', ... }

// Verify a client secret (during OIDC token request)
const valid = await secretService.verify(clientDbId, providedSecret);

// Rotate a secret (zero-downtime)
const newSecret = await secretService.generate(clientDbId, { label: 'rotation-2026' });
// Later: revoke the old secret
await secretService.revoke(oldSecretId);
```

### Key Decisions

| Decision                    | Outcome                                                        |
|-----------------------------|----------------------------------------------------------------|
| Module layout               | Two modules: `src/applications/` and `src/clients/`            |
| Client ID format            | 32 random bytes, base64url-encoded (~43 chars)                 |
| Secret format               | 48 random bytes, base64url-encoded (~64 chars)                 |
| Secret storage              | Argon2id hash (plaintext never stored, shown once)             |
| Multiple secrets            | Supported — enables zero-downtime rotation                     |
| Redirect URI validation     | Strict match, HTTPS required in prod, HTTP ok for localhost    |
| Default auth method         | `client_secret_basic` for confidential, `none` for public      |
| PKCE default                | Required by default (configurable per client)                  |
| Slug generation             | Shared pattern with organizations (lowercase, hyphenated)      |
| Application cache           | Redis with 5-min TTL (same pattern as organizations)           |
| Client cache                | Redis with 5-min TTL, keyed by `client_id` (OIDC identifier)  |

## Related Files

### New Files

| File                                          | Purpose                                      |
|-----------------------------------------------|----------------------------------------------|
| `src/applications/types.ts`                   | Application & module types, row mapping      |
| `src/applications/slugs.ts`                   | Application slug generation/validation       |
| `src/applications/errors.ts`                  | Domain error classes                         |
| `src/applications/repository.ts`              | PostgreSQL CRUD for apps + modules           |
| `src/applications/cache.ts`                   | Redis cache layer                            |
| `src/applications/service.ts`                 | Business logic service                       |
| `src/applications/index.ts`                   | Barrel export                                |
| `src/clients/types.ts`                        | Client & secret types, row mapping           |
| `src/clients/errors.ts`                       | Domain error classes                         |
| `src/clients/crypto.ts`                       | Client ID gen, secret gen, Argon2id          |
| `src/clients/repository.ts`                   | PostgreSQL CRUD for clients                  |
| `src/clients/secret-repository.ts`            | PostgreSQL CRUD for secrets                  |
| `src/clients/cache.ts`                        | Redis cache layer                            |
| `src/clients/service.ts`                      | Client business logic                        |
| `src/clients/secret-service.ts`               | Secret lifecycle management                  |
| `src/clients/index.ts`                        | Barrel export                                |
| `src/routes/applications.ts`                  | Application admin routes                     |
| `src/routes/clients.ts`                       | Client & secret admin routes                 |
| `tests/unit/applications/*.test.ts`           | Application module tests (~7 files)          |
| `tests/unit/clients/*.test.ts`                | Client module tests (~7 files)               |
| `tests/unit/routes/applications.test.ts`      | Application route tests                      |
| `tests/unit/routes/clients.test.ts`           | Client route tests                           |

### Modified Files

| File                                          | Changes                                      |
|-----------------------------------------------|----------------------------------------------|
| `package.json`                                | Add `argon2` dependency                      |
| `src/oidc/client-finder.ts`                   | Use client service for proper secret verification |
| `src/server.ts`                               | Mount application + client routes            |
| `tests/unit/oidc/client-finder.test.ts`       | Update for new service integration           |
