# RD-04: Organization (Tenant) Management

> **Document**: RD-04-organization-management.md
> **Status**: Draft
> **Created**: 2026-04-08
> **Project**: Porta v5 — OIDC Provider
> **Depends On**: RD-01 (Project Scaffolding), RD-02 (Database Schema), RD-03 (OIDC Core)

---

## Feature Overview

Implement the organization (tenant) management system for Porta v5. Organizations represent customers of the SaaS product. Each organization has its own OIDC issuer, its own user pool, its own branding configuration, and its own client registrations. A single super-admin organization manages all tenants.

---

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
- [ ] Tenant resolution middleware (extract org from request path, validate, set context)
- [ ] Organization soft-delete (archive, don't hard-delete)

### Should Have

- [ ] Organization metadata/settings (JSON field for extensible config)
- [ ] Organization-level rate limit overrides
- [ ] Redis cache invalidation on organization update
- [ ] Pagination and filtering for organization listing (super-admin only)

### Won't Have (Out of Scope)

- Database-per-tenant isolation — single shared database with `organization_id` scoping
- Self-service organization registration — admin-created only
- Billing or subscription management
- Organization hierarchies (parent-child)

---

## Technical Requirements

### Organization Service

The organization service provides the business logic layer for all organization operations.

```typescript
interface OrganizationService {
  // CRUD
  create(data: CreateOrganizationInput): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  update(id: string, data: UpdateOrganizationInput): Promise<Organization>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;

  // Listing (super-admin only)
  list(options: ListOptions): Promise<PaginatedResult<Organization>>;

  // Status
  suspend(id: string, reason?: string): Promise<void>;
  activate(id: string): Promise<void>;

  // Branding
  updateBranding(id: string, branding: BrandingInput): Promise<Organization>;

  // Validation
  validateSlug(slug: string): Promise<boolean>;
  generateSlug(name: string): string;
}
```

### Organization Repository

```typescript
interface OrganizationRepository {
  insert(org: Organization): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  update(id: string, data: Partial<Organization>): Promise<Organization>;
  list(options: ListOptions): Promise<PaginatedResult<Organization>>;
  findSuperAdmin(): Promise<Organization | null>;
  slugExists(slug: string): Promise<boolean>;
}
```

### Data Types

```typescript
interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  isSuperAdmin: boolean;

  // Branding
  brandingLogoUrl: string | null;
  brandingFaviconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingCompanyName: string | null;
  brandingCustomCss: string | null;

  // Locale
  defaultLocale: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface CreateOrganizationInput {
  name: string;
  slug?: string;          // Auto-generated from name if not provided
  defaultLocale?: string; // Defaults to 'en'
  branding?: BrandingInput;
}

interface UpdateOrganizationInput {
  name?: string;
  defaultLocale?: string;
  branding?: BrandingInput;
}

interface BrandingInput {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
  customCss?: string | null;
}

interface ListOptions {
  page: number;
  pageSize: number;
  status?: 'active' | 'suspended' | 'archived';
  search?: string;        // Search by name or slug
  sortBy?: 'name' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### Slug Generation & Validation

```
Rules:
- Lowercase alphanumeric + hyphens only
- 3-100 characters
- Cannot start or end with a hyphen
- Cannot be a reserved word (e.g., "admin", "api", "health", "static", ".well-known")
- Must be unique across all organizations (including archived)
- Auto-generated from organization name using slugify

Examples:
  "Acme Corporation" → "acme-corporation"
  "Globex Ltd." → "globex-ltd"
  "Wayne Enterprises" → "wayne-enterprises"
```

### Tenant Resolution Middleware

This Koa middleware is the entry point for all tenant-scoped requests:

```typescript
async function tenantResolver(ctx: KoaContext, next: Next): Promise<void> {
  const orgSlug = ctx.params.orgSlug;

  if (!orgSlug) {
    ctx.throw(400, 'Organization slug is required');
  }

  // 1. Check Redis cache first
  let org = await cache.get<Organization>(`org:${orgSlug}`);

  // 2. If not cached, load from database
  if (!org) {
    org = await organizationRepository.findBySlug(orgSlug);
    if (org) {
      await cache.set(`org:${orgSlug}`, org, 300); // Cache for 5 minutes
    }
  }

  // 3. Validate
  if (!org) {
    ctx.throw(404, 'Organization not found');
  }
  if (org.status === 'archived') {
    ctx.throw(404, 'Organization not found');
  }
  if (org.status === 'suspended') {
    ctx.throw(403, 'Organization is suspended');
  }

  // 4. Set context
  ctx.state.organization = org;
  ctx.state.issuer = `${config.issuerBaseUrl}/${org.slug}`;

  await next();
}
```

### Caching Strategy

```
Redis cache keys:
  org:{slug}          → Organization object (TTL: 5 minutes)
  org:id:{id}         → Organization object (TTL: 5 minutes)

Cache invalidation:
  On organization update → delete org:{slug} and org:id:{id}
  On organization status change → delete org:{slug} and org:id:{id}
  On organization archive → delete org:{slug} and org:id:{id}
```

### Super-Admin Rules

```
Super-admin organization:
1. Created during database seeding
2. is_super_admin = TRUE (enforced by unique partial index — only one allowed)
3. Cannot be suspended or archived
4. Cannot be deleted
5. Users in super-admin org can manage all other organizations
6. Super-admin org has access to all CLI commands

Authorization check:
  isSuperAdmin(ctx) → ctx.state.organization?.isSuperAdmin === true
  OR: user belongs to the super-admin organization
```

### Organization Status Lifecycle

```
                    ┌──── activate ────┐
                    ▼                  │
  ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │  active   │──│ suspended │──│   archived    │
  └──────────┘  └──────────┘  └──────────────┘
      │              │
      │   suspend    │
      └──────────────┘

Rules:
- active → suspended: Organization's users can no longer log in
- suspended → active: Organization is re-enabled
- active/suspended → archived: Soft-delete, org no longer visible in listings (except super-admin)
- archived → active: Restore (super-admin only)
```

### Audit Events

All organization operations must be logged to the audit_log table:

| Event | Event Type | Category |
|-------|-----------|----------|
| Organization created | `org.created` | `admin` |
| Organization updated | `org.updated` | `admin` |
| Organization suspended | `org.suspended` | `admin` |
| Organization activated | `org.activated` | `admin` |
| Organization archived | `org.archived` | `admin` |
| Organization restored | `org.restored` | `admin` |
| Branding updated | `org.branding.updated` | `admin` |

---

## Integration Points

### With RD-03 (OIDC Core)
- Tenant resolution middleware feeds organization context to OIDC provider
- OIDC issuer URL derived from organization slug
- Suspended/archived orgs → OIDC endpoints return error

### With RD-05 (Applications & Clients)
- Clients are scoped to organizations
- Organization archive → all clients become inactive

### With RD-06 (Users)
- Users belong to exactly one organization
- Organization suspend → users cannot log in
- Organization archive → all user sessions invalidated

### With RD-07 (Auth Workflows)
- Branding configuration used to customize login pages
- Default locale used as fallback for i18n

### With RD-09 (CLI)
- CLI commands for organization CRUD
- Super-admin operations via CLI

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Tenant isolation | DB-per-tenant, schema-per-tenant, shared schema | Shared schema with org_id | Simpler, sufficient for this use case |
| Tenant routing | Subdomain, path-based, header-based | Path-based (`/{slug}`) | Simple, single domain, easy to test |
| Soft delete | Hard delete, soft delete flag, status-based | Status-based (`archived`) | Preserves data, auditable, reversible |
| Cache | No cache, Redis, in-memory | Redis with 5min TTL | Shared across instances, consistent |
| Slug source | User-provided only, auto-generated only, both | Both (auto-generate, allow override) | Flexible |

---

## Acceptance Criteria

1. [ ] Organization CRUD operations work correctly
2. [ ] Slug auto-generation produces valid, unique slugs
3. [ ] Slug validation rejects invalid/reserved slugs
4. [ ] Super-admin org exists after seeding and cannot be deleted/suspended
5. [ ] Tenant resolution middleware correctly resolves org from URL path
6. [ ] Suspended orgs return 403 on OIDC endpoints
7. [ ] Archived orgs return 404 on OIDC endpoints
8. [ ] Organization data is cached in Redis with 5-minute TTL
9. [ ] Cache is invalidated on organization update
10. [ ] Branding configuration is stored and retrievable per org
11. [ ] Default locale is stored and used as i18n fallback
12. [ ] All organization operations are audit-logged
13. [ ] Pagination and filtering works for org listing
14. [ ] Only super-admin can create/manage other organizations
