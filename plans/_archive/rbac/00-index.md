# RBAC & Custom Claims Implementation Plan

> **Feature**: Authorization (RBAC) & Custom Claims — Roles, permissions, user-role assignments, custom claim definitions/values, and token integration
> **Status**: Planning Complete
> **Created**: 2026-04-09
> **Source**: [RD-08](../../requirements/RD-08-rbac-custom-claims.md)

## Overview

Implement the Role-Based Access Control (RBAC) system and custom claims mechanism for Porta v5. Roles and permissions are defined globally per application (the SaaS product). Users within each organization are assigned roles, and those roles determine the permissions included in tokens. Custom claims allow applications to attach additional metadata to tokens on a per-user basis.

The database schema already exists (migrations 006 and 007 from RD-02), so this plan focuses on building the TypeScript module layers: types, errors, repositories, caches, services, API routes, OIDC token integration, and comprehensive tests.

This is split into two logical modules:
1. **RBAC module** (`src/rbac/`) — Roles, permissions, role-permission mapping, user-role assignments
2. **Custom Claims module** (`src/custom-claims/`) — Claim definitions, claim values, token integration

Both modules integrate into the existing OIDC `findAccount.claims()` flow to inject role/permission/custom claims into tokens.

## Document Index

| #  | Document                                              | Description                                          |
|----|-------------------------------------------------------|------------------------------------------------------|
| 00 | [Index](00-index.md)                                  | This document — overview and navigation              |
| 01 | [Requirements](01-requirements.md)                    | Feature requirements and scope                       |
| 02 | [Current State](02-current-state.md)                  | Analysis of current implementation                   |
| 03 | [RBAC Types & Errors](03-rbac-types-and-errors.md)    | Types, interfaces, row mappers, slug validation      |
| 04 | [RBAC Repository & Cache](04-rbac-repository-and-cache.md) | PostgreSQL repositories and Redis cache         |
| 05 | [RBAC Service](05-rbac-service.md)                    | Role, permission, and user-role business logic       |
| 06 | [Custom Claims Module](06-custom-claims-module.md)    | Claim definitions, values, validation, service       |
| 07 | [Token Integration & Routes](07-token-integration-and-routes.md) | OIDC claims injection and admin API routes |
| 08 | [Testing Strategy](08-testing-strategy.md)            | Test cases and verification                          |
| 99 | [Execution Plan](99-execution-plan.md)                | Phases, sessions, and task checklist                 |

## Quick Reference

### Usage Examples

```typescript
// Create a role for an application
const role = await createRole({
  applicationId: 'app-uuid',
  name: 'CRM Editor',
  description: 'Can edit CRM contacts and deals',
});

// Create permissions
const perm = await createPermission({
  applicationId: 'app-uuid',
  name: 'Read CRM Contacts',
  slug: 'crm:contacts:read',
});

// Assign permissions to a role
await assignPermissionsToRole(role.id, [perm.id]);

// Assign roles to a user
await assignRolesToUser(userId, [role.id], adminUserId);

// Build token claims (called from findAccount.claims())
const roles = await buildRoleClaims(userId);           // ["crm-editor"]
const perms = await buildPermissionClaims(userId);     // ["crm:contacts:read", ...]
const custom = await buildCustomClaims(userId, appId, 'access_token');
```

### Key Decisions

| Decision                   | Outcome                                                        |
|----------------------------|----------------------------------------------------------------|
| Role scope                 | Per-application (global, not per-org)                          |
| Assignment scope           | Per-user (users are org-scoped, so assignments are too)        |
| Permission format          | Hierarchical slug (`module:resource:action`)                   |
| Token claim format         | Flat arrays (`roles: [...]`, `permissions: [...]`)             |
| Custom claim storage       | Separate tables (definition + values)                          |
| Claim inclusion            | Configurable per claim per token type                          |
| Module structure           | Two modules: `src/rbac/` + `src/custom-claims/`               |
| Caching strategy           | Redis cache for role lookups and user-role resolution          |

## Related Files

### New Files (to be created)

```
src/rbac/types.ts              # Role, Permission, UserRole types, row mappers
src/rbac/errors.ts             # RoleNotFoundError, PermissionNotFoundError, etc.
src/rbac/slugs.ts              # Permission slug validation (module:resource:action)
src/rbac/role-repository.ts    # PostgreSQL CRUD for roles
src/rbac/permission-repository.ts # PostgreSQL CRUD for permissions
src/rbac/mapping-repository.ts # Role-permission and user-role join tables
src/rbac/cache.ts              # Redis cache for roles and user-role resolution
src/rbac/role-service.ts       # Role business logic + audit logging
src/rbac/permission-service.ts # Permission business logic + audit logging
src/rbac/user-role-service.ts  # User-role assignment + claims building
src/rbac/index.ts              # Barrel export

src/custom-claims/types.ts     # CustomClaimDefinition, CustomClaimValue types
src/custom-claims/errors.ts    # ClaimNotFoundError, ClaimValidationError
src/custom-claims/validators.ts # Claim name validation, value type validation
src/custom-claims/repository.ts # PostgreSQL CRUD for definitions + values
src/custom-claims/cache.ts     # Redis cache for claim definitions
src/custom-claims/service.ts   # Claim business logic + token claims building
src/custom-claims/index.ts     # Barrel export

src/routes/roles.ts            # /api/admin/applications/:appId/roles
src/routes/permissions.ts      # /api/admin/applications/:appId/permissions
src/routes/user-roles.ts       # /api/admin/organizations/:orgId/users/:userId/roles
src/routes/custom-claims.ts    # /api/admin/applications/:appId/claims + user values
```

### Existing Files (to be modified)

```
src/oidc/account-finder.ts     # Inject RBAC + custom claims into findAccount.claims()
src/users/claims.ts            # Extend with RBAC claim building support
src/server.ts                  # Mount new route handlers
```
