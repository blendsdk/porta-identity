# Organization Management Implementation Plan

> **Feature**: RD-04 — Organization (Tenant) Management
> **Status**: Planning Complete
> **Created**: 2026-04-08
> **Depends On**: RD-01 (Scaffolding ✅), RD-02 (Database ✅), RD-03 (OIDC Core ✅)

## Overview

Implement the organization (tenant) management system for Porta v5. Organizations
represent customers of the SaaS product. Each organization has its own OIDC issuer,
user pool, branding configuration, and client registrations.

This plan covers: TypeScript types, slug generation/validation, database repository,
Redis caching, audit logging, business-logic service, enhanced tenant resolution
middleware, Koa API routes with Zod validation, and super-admin authorization.

The database schema already exists (migration 002) with all required columns.
The seed data (migration 011) creates the super-admin organization `porta-admin`.
The tenant resolver middleware exists but needs enhancement (Redis caching,
suspended/archived status differentiation).

## Document Index

| #  | Document                                           | Description                                |
|----|----------------------------------------------------|--------------------------------------------|
| 00 | [Index](00-index.md)                               | This document — overview and navigation    |
| 01 | [Requirements](01-requirements.md)                 | Feature requirements and scope             |
| 02 | [Current State](02-current-state.md)               | Analysis of current implementation         |
| 03 | [Types & Slug Utils](03-types-and-slugs.md)        | Organization types and slug utilities      |
| 04 | [Repository & Cache](04-repository-and-cache.md)   | Database repository and Redis cache layer  |
| 05 | [Service & Audit](05-service-and-audit.md)         | Business logic service and audit logging   |
| 06 | [API Routes](06-api-routes.md)                     | Koa routes, validation, and authorization  |
| 07 | [Testing Strategy](07-testing-strategy.md)         | Test cases and verification                |
| 99 | [Execution Plan](99-execution-plan.md)             | Phases, sessions, and task checklist       |

## Quick Reference

### Usage Examples

```typescript
// Create an organization
const org = await organizationService.create({
  name: 'Acme Corporation',
  defaultLocale: 'en',
  branding: { primaryColor: '#3B82F6', companyName: 'Acme Corp' },
});
// org.slug === 'acme-corporation' (auto-generated)

// Look up by slug (cache-backed)
const cached = await organizationService.findBySlug('acme-corporation');

// Suspend an organization
await organizationService.suspend(org.id, 'Non-payment');

// List organizations (paginated, super-admin)
const list = await organizationService.list({ page: 1, pageSize: 20, status: 'active' });
```

### Key Decisions

| Decision                   | Outcome                                                    |
|----------------------------|------------------------------------------------------------|
| Slug generation            | Built-in utility (no external dep) — lowercase, hyphenated |
| Caching strategy           | Redis with 5-minute TTL, invalidation on write             |
| Soft delete                | Status-based (`archived`), reversible via `restore()`      |
| Audit logging              | Generic service writing to `audit_log` table               |
| API authorization          | Super-admin middleware checking `ctx.state.organization`    |
| Input validation           | Zod schemas per endpoint                                   |
| Tenant resolver update     | Add Redis cache + differentiate suspended (403) vs archived (404) |

## Related Files

### New Files

| File                                    | Purpose                                    |
|-----------------------------------------|--------------------------------------------|
| `src/organizations/types.ts`            | Organization types and interfaces          |
| `src/organizations/slugs.ts`            | Slug generation and validation             |
| `src/organizations/repository.ts`       | PostgreSQL repository                      |
| `src/organizations/cache.ts`            | Redis cache layer                          |
| `src/organizations/service.ts`          | Business logic service                     |
| `src/organizations/index.ts`            | Public API barrel export                   |
| `src/lib/audit-log.ts`                  | Generic audit log service                  |
| `src/middleware/super-admin.ts`         | Super-admin authorization middleware       |
| `src/routes/organizations.ts`           | Koa router for org management API          |
| `tests/unit/organizations/types.test.ts`        | Type validation tests             |
| `tests/unit/organizations/slugs.test.ts`        | Slug utility tests                |
| `tests/unit/organizations/repository.test.ts`   | Repository tests                  |
| `tests/unit/organizations/cache.test.ts`        | Cache layer tests                 |
| `tests/unit/organizations/service.test.ts`      | Service tests                     |
| `tests/unit/lib/audit-log.test.ts`              | Audit log tests                   |
| `tests/unit/middleware/super-admin.test.ts`      | Super-admin middleware tests      |
| `tests/unit/routes/organizations.test.ts`        | Route handler tests               |

### Modified Files

| File                                     | Changes                                    |
|------------------------------------------|--------------------------------------------|
| `src/middleware/tenant-resolver.ts`      | Add Redis cache, differentiate 403 vs 404  |
| `src/server.ts`                          | Mount organization management routes       |
| `tests/unit/middleware/tenant-resolver.test.ts` | Update for new cache + status logic  |
