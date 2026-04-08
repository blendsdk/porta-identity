# User Management Implementation Plan

> **Feature**: RD-06 — User Management (org-scoped users, OIDC claims, password management)
> **Status**: Planning Complete
> **Created**: 2026-04-08
> **Source**: [RD-06](../../requirements/RD-06-user-management.md)

## Overview

Implement the user management system for Porta v5. Users are global entities scoped to exactly one organization. The user profile follows the OpenID Connect Standard Claims specification (§5.1). Users can authenticate via password (Argon2id) or passwordless (magic link) methods, and their accounts have a defined status lifecycle (active → inactive/suspended/locked).

This module follows the same architectural patterns established by RD-04 (Organizations) and RD-05 (Applications/Clients): types → repository → cache → service → routes, with full audit logging and Redis caching.

## Document Index

| #   | Document                                       | Description                                       |
| --- | ---------------------------------------------- | ------------------------------------------------- |
| 00  | [Index](00-index.md)                           | This document — overview and navigation           |
| 01  | [Requirements](01-requirements.md)             | Feature requirements and scope                    |
| 02  | [Current State](02-current-state.md)           | Analysis of current implementation                |
| 03  | [Types & Password](03-types-and-password.md)   | User types, row mapping, password utilities       |
| 04  | [Repository & Cache](04-repository-and-cache.md) | PostgreSQL CRUD and Redis caching                |
| 05  | [Service & Claims](05-service-and-claims.md)   | Business logic, status lifecycle, OIDC claims     |
| 06  | [API Routes](06-api-routes.md)                 | REST endpoints and Zod validation                 |
| 07  | [Testing Strategy](07-testing-strategy.md)     | Test cases and verification                       |
| 99  | [Execution Plan](99-execution-plan.md)         | Phases, sessions, and task checklist              |

## Quick Reference

### Usage Examples

```typescript
// Create a user
const user = await createUser({
  organizationId: 'org-uuid',
  email: 'john@example.com',
  givenName: 'John',
  familyName: 'Doe',
  password: 'secure-password-123',
});

// Verify password
const valid = await verifyUserPassword(user.id, 'secure-password-123');

// Build OIDC claims
const claims = buildUserClaims(user, ['openid', 'profile', 'email']);
```

### Key Decisions

| Decision                  | Outcome                                        |
| ------------------------- | ---------------------------------------------- |
| Password hashing          | Argon2id (OWASP recommended)                   |
| Password policy           | Length-only: 8–128 chars (NIST SP 800-63B)     |
| Email uniqueness          | Per-organization (CITEXT column)               |
| User identifier (sub)     | UUID                                           |
| Soft delete               | Status-based (`inactive`)                      |
| Claims building           | Scope-based (profile, email, phone, address)   |
| Cache strategy            | Redis by ID with 5min TTL                      |

## Related Files

### New Files
- `src/users/types.ts` — User types, row mapping, status lifecycle
- `src/users/errors.ts` — UserNotFoundError, UserValidationError
- `src/users/password.ts` — Argon2id hash/verify, password validation
- `src/users/repository.ts` — PostgreSQL CRUD with pagination/search
- `src/users/cache.ts` — Redis caching layer
- `src/users/service.ts` — Business logic orchestrator
- `src/users/claims.ts` — OIDC Standard Claims builder
- `src/users/index.ts` — Barrel export
- `src/routes/users.ts` — API route handlers

### Modified Files
- `src/oidc/account-finder.ts` — Upgrade stub to use user service/claims
- `src/server.ts` — Mount user routes
