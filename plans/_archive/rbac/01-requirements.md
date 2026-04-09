# Requirements: RBAC & Custom Claims

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-08](../../requirements/RD-08-rbac-custom-claims.md)

## Feature Overview

Implement the Role-Based Access Control (RBAC) system and custom claims mechanism for Porta v5. This feature enables:

1. **Roles** — Named role definitions per application (e.g., "CRM Editor", "Invoice Approver")
2. **Permissions** — Granular permission definitions per application with `module:resource:action` slugs
3. **Role-Permission Mapping** — Which permissions each role grants
4. **User-Role Assignment** — Which roles are assigned to each user (per-org context)
5. **Custom Claim Definitions** — Per-application metadata fields (string, number, boolean, json)
6. **Custom Claim Values** — Per-user values for custom claims
7. **Token Integration** — All of the above injected into OIDC tokens via `findAccount.claims()`

### Conceptual Model

```
Application: "BusinessSuite"
├── Role: "crm-viewer"
│   └── Permissions: ["crm:contacts:read", "crm:deals:read"]
├── Role: "crm-editor"
│   └── Permissions: ["crm:contacts:read", "crm:contacts:write", "crm:deals:read", "crm:deals:write"]
├── Role: "invoice-approver"
│   └── Permissions: ["invoice:read", "invoice:approve"]
└── Custom Claim: "department" (string)

Organization: "Acme Corp"
├── User: alice@acme.com
│   ├── Roles: ["crm-editor", "invoice-approver"]
│   └── Custom Claims: { department: "Sales" }
└── User: bob@acme.com
    ├── Roles: ["crm-viewer"]
    └── Custom Claims: { department: "Engineering" }
```

## Functional Requirements

### Must Have — Roles

- [ ] Role CRUD operations (create, read, update, delete)
- [ ] Roles defined per application (global, not per-org)
- [ ] Role slug auto-generated from name, uniqueness enforced within application
- [ ] Role listing per application
- [ ] Role deletion only if no users are assigned (or force with cascade)

### Must Have — Permissions

- [ ] Permission CRUD operations (create, read, update, delete)
- [ ] Permissions defined per application (global, not per-org)
- [ ] Permission slug uniqueness within application
- [ ] Permissions optionally linked to an application module
- [ ] Permission slug format: `{module}:{resource}:{action}` (e.g., `crm:contacts:read`)
- [ ] Permission listing per application, filterable by module
- [ ] Permission deletion only if not assigned to any role (or force)

### Must Have — Role-Permission Mapping

- [ ] Assign permissions to roles (bulk)
- [ ] Remove permissions from roles (bulk)
- [ ] List permissions for a role
- [ ] List roles that have a specific permission

### Must Have — User-Role Assignment

- [ ] Assign roles to users (per-user, bulk)
- [ ] Remove roles from users (bulk)
- [ ] List roles for a user
- [ ] List users with a specific role (within an organization)
- [ ] Track who assigned the role (`assigned_by`)

### Must Have — Token Integration

- [ ] Include user's roles in tokens as a custom claim (`roles: ["slug1", "slug2"]`)
- [ ] Include user's permissions in tokens as a custom claim (`permissions: ["mod:res:act", ...]`)
- [ ] Token claims built during `findAccount.claims()` in OIDC provider
- [ ] Claims resolved from user's assigned roles across all applications

### Must Have — Custom Claim Definitions

- [ ] Custom claim definition CRUD (per application)
- [ ] Supported claim types: `string`, `number`, `boolean`, `json`
- [ ] Configurable inclusion: ID token, access token, userinfo (per claim)
- [ ] Claim name uniqueness per application
- [ ] Claim name must not conflict with OIDC standard claims or Porta reserved claims

### Must Have — Custom Claim Values

- [ ] Set custom claim value per user (upsert)
- [ ] Update custom claim value
- [ ] Delete custom claim value
- [ ] Get all custom claim values for a user
- [ ] Validate value type matches claim definition type
- [ ] Custom claim values included in tokens via `findAccount.claims()`

### Should Have

- [ ] Bulk role assignment (assign multiple roles to a user at once) — **included in Must Have**
- [ ] Bulk permission assignment (assign multiple permissions to a role at once) — **included in Must Have**
- [ ] Permission grouping by module in API responses

### Won't Have (Out of Scope)

- Dynamic permission evaluation (runtime rule engine)
- Negative permissions (deny rules)
- Resource-level permissions (e.g., "can edit document X")
- Permission caching in tokens (all lookups are at token issuance time)
- Custom claim computed values (all values are static, set per user)
- Role inheritance (a role including permissions of another role) — deferred to future iteration
- Custom claim value history/audit trail — deferred to future iteration
- Configurable claim names per application (default `roles` and `permissions` for now)

## Technical Requirements

### Performance

- Redis caching for role lookups during token issuance (hot path)
- User-role resolution cached with TTL (invalidated on assignment changes)
- Custom claim definitions cached per application

### Compatibility

- Must work with existing `findAccount.claims()` flow in `src/oidc/account-finder.ts`
- Must not break existing OIDC standard claims (profile, email, etc.)
- Must integrate with existing audit log system (`src/lib/audit-log.ts`)

### Security

- All RBAC admin endpoints require super-admin authorization
- Permission slug format enforced via validation
- Reserved claim names cannot be used for custom claims
- Value type validated against claim definition before storage

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Role scope | Per-org, per-app, global | Per-app (global) | Same SaaS product, same roles for all customers |
| Assignment scope | Global, per-org | Per-user (users are org-scoped) | Users belong to one org, so assignments are inherently org-scoped |
| Permission format | Flat string, hierarchical, bitfield | Hierarchical slug (`module:resource:action`) | Readable, namespaced, filterable |
| Token claim format | Nested object, flat array | Flat arrays for roles/permissions | Simple, widely supported by client libraries |
| Custom claim storage | JSON column on user, separate table | Separate table (definition + values) | Type-safe, queryable, auditable |
| Claim inclusion | Always all, configurable per claim | Configurable per claim per token type | Flexible, minimizes token size |
| Module structure | Single module, two modules | Two modules (`rbac/` + `custom-claims/`) | Separation of concerns, independent testability |

## Acceptance Criteria

1. [ ] Role CRUD works per application with slug uniqueness
2. [ ] Permission CRUD works per application with module namespacing
3. [ ] Permission slug format `module:resource:action` enforced
4. [ ] Permissions correctly assigned to / removed from roles
5. [ ] Users correctly assigned / unassigned roles with `assigned_by` tracking
6. [ ] User's roles appear in token claims as `roles: ["slug1", "slug2"]`
7. [ ] User's permissions appear in token claims as `permissions: ["mod:res:act", ...]`
8. [ ] Custom claim definition CRUD works per application
9. [ ] Custom claim values validated against definition type
10. [ ] Custom claim values appear in correct token type (id_token/access_token/userinfo)
11. [ ] Reserved claim names are rejected for custom claim definitions
12. [ ] Role deletion prevented if users are assigned (without force flag)
13. [ ] Permission deletion prevented if assigned to roles (without force flag)
14. [ ] All RBAC and custom claim operations are audit-logged
15. [ ] Admin API routes created with super-admin authorization
16. [ ] All existing tests continue to pass (980 baseline)
17. [ ] Full unit test coverage for all new modules
