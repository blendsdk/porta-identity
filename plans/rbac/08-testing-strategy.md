# Testing Strategy: RBAC & Custom Claims

> **Document**: 08-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- Unit tests: 90%+ coverage for all new modules
- Integration: Key workflows covered via token claims integration
- Baseline: 980 existing tests must continue passing (zero regressions)

### Test Counts (Estimated)

| Test File | Est. Tests | Priority |
|-----------|-----------|----------|
| `tests/unit/rbac/types.test.ts` | 10 | High |
| `tests/unit/rbac/errors.test.ts` | 6 | Medium |
| `tests/unit/rbac/slugs.test.ts` | 20 | High |
| `tests/unit/rbac/role-repository.test.ts` | 14 | High |
| `tests/unit/rbac/permission-repository.test.ts` | 14 | High |
| `tests/unit/rbac/mapping-repository.test.ts` | 18 | High |
| `tests/unit/rbac/cache.test.ts` | 14 | High |
| `tests/unit/rbac/role-service.test.ts` | 22 | High |
| `tests/unit/rbac/permission-service.test.ts` | 18 | High |
| `tests/unit/rbac/user-role-service.test.ts` | 24 | High |
| `tests/unit/custom-claims/types.test.ts` | 8 | High |
| `tests/unit/custom-claims/errors.test.ts` | 4 | Medium |
| `tests/unit/custom-claims/validators.test.ts` | 18 | High |
| `tests/unit/custom-claims/repository.test.ts` | 18 | High |
| `tests/unit/custom-claims/cache.test.ts` | 6 | Medium |
| `tests/unit/custom-claims/service.test.ts` | 24 | High |
| `tests/unit/routes/roles.test.ts` | 16 | High |
| `tests/unit/routes/permissions.test.ts` | 12 | High |
| `tests/unit/routes/user-roles.test.ts` | 10 | High |
| `tests/unit/routes/custom-claims.test.ts` | 16 | High |
| `tests/unit/oidc/account-finder.test.ts` | +8 | High |
| **Total** | **~300** | |

**New total after RD-08: ~1280 tests across ~80 test files**

## Test Categories

### Unit Tests — RBAC Module

| Test File | Description | Priority |
|-----------|-------------|----------|
| `rbac/types.test.ts` | mapRowToRole, mapRowToPermission, mapRowToUserRole | High |
| `rbac/errors.test.ts` | Error classes: name, message, instanceof | Medium |
| `rbac/slugs.test.ts` | generateRoleSlug, validateRoleSlug, validatePermissionSlug, parsePermissionSlug | High |
| `rbac/role-repository.test.ts` | CRUD + slugExists + countUsersWithRole | High |
| `rbac/permission-repository.test.ts` | CRUD + slugExists + countRolesWithPermission | High |
| `rbac/mapping-repository.test.ts` | Assign/remove permissions ↔ roles, user ↔ roles, permission resolution | High |
| `rbac/cache.test.ts` | Get/set/invalidate for roles, user roles, user permissions | High |
| `rbac/role-service.test.ts` | CRUD with validation, slug generation, deletion guards, audit logging | High |
| `rbac/permission-service.test.ts` | CRUD with slug format validation, deletion guards, audit | High |
| `rbac/user-role-service.test.ts` | Assign/remove, buildRoleClaims, buildPermissionClaims, caching | High |

### Unit Tests — Custom Claims Module

| Test File | Description | Priority |
|-----------|-------------|----------|
| `custom-claims/types.test.ts` | mapRowToDefinition, mapRowToValue | High |
| `custom-claims/errors.test.ts` | Error classes | Medium |
| `custom-claims/validators.test.ts` | Reserved names, claim name format, value type validation | High |
| `custom-claims/repository.test.ts` | Definitions CRUD, values CRUD, joined queries | High |
| `custom-claims/cache.test.ts` | Definitions cache get/set/invalidate | Medium |
| `custom-claims/service.test.ts` | Definition CRUD, value management, buildCustomClaims | High |

### Unit Tests — Routes

| Test File | Description | Priority |
|-----------|-------------|----------|
| `routes/roles.test.ts` | All role endpoints, Zod validation, error mapping | High |
| `routes/permissions.test.ts` | All permission endpoints, module filtering | High |
| `routes/user-roles.test.ts` | Assignment/removal, permissions resolution | High |
| `routes/custom-claims.test.ts` | Definitions + values endpoints | High |

### Extended Existing Tests

| Test File | Additional Tests | Priority |
|-----------|-----------------|----------|
| `oidc/account-finder.test.ts` | RBAC + custom claims in token claims output | High |

## Test Data

### Fixtures Needed

```typescript
// Role fixtures
const testRole = {
  id: 'role-uuid-1',
  applicationId: 'app-uuid-1',
  name: 'CRM Editor',
  slug: 'crm-editor',
  description: 'Can edit CRM records',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// Permission fixtures
const testPermission = {
  id: 'perm-uuid-1',
  applicationId: 'app-uuid-1',
  moduleId: 'module-uuid-1',
  name: 'Read CRM Contacts',
  slug: 'crm:contacts:read',
  description: null,
  createdAt: new Date('2026-01-01'),
};

// Claim definition fixtures
const testClaimDefinition = {
  id: 'claim-uuid-1',
  applicationId: 'app-uuid-1',
  claimName: 'department',
  claimType: 'string' as const,
  description: 'User department',
  includeInIdToken: false,
  includeInAccessToken: true,
  includeInUserinfo: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};
```

### Mock Requirements

Following established patterns (vi.mock at top level, inline factories, vi.mocked):

```typescript
// Repository mocks
vi.mock('../../src/rbac/role-repository.js', () => ({
  insertRole: vi.fn(),
  findRoleById: vi.fn(),
  // ... all functions
}));

// Cache mocks
vi.mock('../../src/rbac/cache.js', () => ({
  getCachedRole: vi.fn(),
  setCachedRole: vi.fn(),
  // ... all functions
}));

// Audit log mock
vi.mock('../../src/lib/audit-log.js', () => ({
  writeAuditLog: vi.fn(),
}));
```

**Key lesson from RD-07:** `vi.mock()` factories are hoisted and CANNOT reference top-level `const` variables. Use inline objects. `beforeEach` must explicitly restore mock default return values since `vi.clearAllMocks()` clears call history but does NOT reset `mockReturnValue` overrides.

## Verification Checklist

- [ ] All new unit tests pass
- [ ] All 980 existing tests continue to pass (zero regressions)
- [ ] `yarn verify` passes (lint + build + test)
- [ ] RBAC types map correctly from DB rows
- [ ] Permission slug format validated correctly
- [ ] Reserved claim names rejected
- [ ] Claim value types validated against definitions
- [ ] Token claims include roles, permissions, and custom claims
- [ ] Redis cache works with graceful degradation
- [ ] All audit events logged correctly
- [ ] Routes return correct HTTP status codes
- [ ] Super-admin middleware applied to all new routes
