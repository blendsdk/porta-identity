# Requirements: Organization Management

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: `requirements/RD-04-organization-management.md`

## Feature Overview

Implement the organization (tenant) management system for Porta v5. Organizations
represent customers of the SaaS product. Each organization has its own OIDC issuer
(`/{org-slug}`), its own user pool, branding configuration, and client registrations.
A single super-admin organization (`porta-admin`) manages all tenants.

## Functional Requirements

### Must Have

- [ ] Organization CRUD operations (create, read, update, archive)
- [ ] Organization slug generation and validation (URL-safe, unique)
- [ ] Organization status lifecycle: `active` → `suspended` → `archived`
- [ ] Super-admin organization (exactly one, created during seed)
- [ ] Super-admin can manage all organizations
- [ ] Per-organization OIDC issuer URL (`/{org-slug}`)
- [ ] Organization lookup by slug (with Redis caching)
- [ ] Per-organization branding configuration (logo, colors, company name, favicon, custom CSS)
- [ ] Per-organization default locale setting
- [ ] Tenant resolution middleware enhancement (Redis cache, suspended=403, archived=404)
- [ ] Organization soft-delete (archive, don't hard-delete)

### Should Have

- [ ] Organization metadata/settings (extensible config — deferred to future if needed)
- [ ] Redis cache invalidation on organization update
- [ ] Pagination and filtering for organization listing (super-admin only)

### Won't Have (Out of Scope)

- Database-per-tenant isolation — single shared database with `organization_id` scoping
- Self-service organization registration — admin-created only in RD-04
- Billing or subscription management
- Organization hierarchies (parent-child)
- Organization-level rate limit overrides (deferred — requires rate-limiting infrastructure)

## Technical Requirements

### Performance

- Organization lookups by slug must use Redis cache (5-minute TTL)
- Cache invalidation on any write operation (update, status change, archive)
- Paginated listing with database-level pagination (LIMIT/OFFSET)

### Security

- Only super-admin organization users can create/manage organizations
- Super-admin org cannot be suspended, archived, or deleted
- All operations logged to audit_log table
- Input validation via Zod schemas on all API endpoints

### Compatibility

- Must integrate with existing tenant resolver middleware (RD-03)
- Must integrate with existing OIDC provider mounting (RD-03)
- Must not break existing health check or OIDC endpoints

## Scope Decisions

| Decision                | Options Considered                          | Chosen                    | Rationale                                 |
|-------------------------|---------------------------------------------|---------------------------|-------------------------------------------|
| Slug generation library | External `slugify` package, built-in        | Built-in utility          | Simple rules, no external dependency      |
| Module organization     | Single file, directory with barrel export   | `src/organizations/` dir  | Clear separation, multiple concerns       |
| Repository pattern      | Direct SQL in service, repository class     | Standalone functions      | Matches existing codebase style (no OOP)  |
| Cache abstraction       | Generic cache class, org-specific functions | Org-specific functions    | Simple, focused, matches codebase style   |
| API framework           | Koa router (existing), separate Express app | Koa router (existing)     | Consistency with existing codebase        |
| Route prefix            | `/api/organizations`, `/admin/organizations`| `/api/admin/organizations`| Clear admin namespace                     |

## Acceptance Criteria

1. [ ] Organization CRUD operations work correctly via API
2. [ ] Slug auto-generation produces valid, unique slugs
3. [ ] Slug validation rejects invalid/reserved slugs
4. [ ] Super-admin org exists after seeding and cannot be deleted/suspended
5. [ ] Tenant resolution middleware correctly resolves org with Redis cache
6. [ ] Suspended orgs return 403 on OIDC endpoints
7. [ ] Archived orgs return 404 on OIDC endpoints
8. [ ] Organization data is cached in Redis with 5-minute TTL
9. [ ] Cache is invalidated on organization update/status change
10. [ ] Branding configuration is stored and retrievable per org
11. [ ] Default locale is stored per org
12. [ ] All organization operations are audit-logged
13. [ ] Pagination and filtering works for org listing
14. [ ] Only super-admin can create/manage other organizations
15. [ ] All tests pass (`yarn verify`)
