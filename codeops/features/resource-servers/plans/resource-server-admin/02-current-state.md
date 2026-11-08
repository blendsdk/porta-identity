# Current State: Resource-Server Admin Management

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

Porta has a complete provider-side resource-server model:

- Migration 038 creates `resource_servers`, `resource_server_scopes`, and
  `resource_server_namespace` with absolute-URI checks, global identifier/audience uniqueness, a
  default-audience trigger, and a namespace trigger (`packages/server/migrations/038_resource_servers.sql:5`).
- `resolveResourceServerInfo` resolves an exact application-owned identifier and enforces the
  custom-scope registry for RFC 8707 resource indicators
  (`packages/server/src/oidc/resource-servers.ts:1`).
- Provider configuration wires the resolver into `oidc-provider`
  (`packages/server/src/oidc/configuration.ts`).
- Unit and integration coverage already exists under
  `packages/server/tests/unit/oidc/resource-servers.spec.test.ts`,
  `packages/server/tests/integration/oidc/resource-servers.spec.test.ts`, and
  `packages/server/tests/integration/oidc/resource-server-schema.spec.test.ts`.

The Admin API, SDK, CLI, and operator documentation for managing those rows do not exist. The
architecture docs explicitly state: "There is no Admin API for resource-server management in this
release" (`techdocs/architecture/api-design.md:189`).

### Relevant Files

| File | Purpose | Changes Needed |
| --- | --- | --- |
| `packages/server/migrations/038_resource_servers.sql` | Existing schema and constraints | None |
| `packages/server/src/oidc/resource-servers.ts` | Provider resolver | None; remains the consumer |
| `packages/server/src/routes/applications.ts` | Existing application router and error pattern | Reference only |
| `packages/server/src/routes/custom-claims.ts` | Nested `/applications/:appId/...` route pattern | Reference only |
| `packages/server/src/server.ts` | Router mounts | Mount the new resource-server router |
| `packages/server/src/lib/admin-permissions.ts` | `APP_READ` / `APP_UPDATE` permissions | Reuse; no change |
| `packages/server/src/lib/database.ts` | `runDatabaseTransaction` request transaction | Reuse |
| `packages/server/src/middleware/admin-mutation-audit.ts` | Generic Admin mutation audit | Reuse |
| `packages/server/src/applications/service.ts` | Application lookup and service patterns | Reference only |
| `packages/sdk/src/domains/applications.ts` | Applications SDK domain | Add resource-server methods |
| `packages/sdk/src/types/applications.ts` | Application SDK types | Reference only |
| `packages/cli/src/commands/app.ts` | `app` command registration | Register the new command family |
| `packages/cli/src/commands/app-module.ts` | Nested app command pattern | Reference only |
| `docs/api/applications.md` | Public application API docs | Cross-link the new page |
| `docs/cli/applications.md` | Public application CLI docs | Cross-link the new page |
| `techdocs/architecture/api-design.md` | Maintainer API design | Replace the "no Admin API" statement |
| `techdocs/architecture/data-model.md` | Maintainer data model | Reference the management surface if needed |

### Code Analysis

The existing application route family establishes the reusable pattern:

- `createApplicationRouter()` mounts `requireAdminAuth()` and per-route `requirePermission()`
  (`packages/server/src/routes/applications.ts:145`).
- Nested application resources use a dedicated router with the
  `/api/admin/applications/:appId/...` prefix (`packages/server/src/routes/custom-claims.ts:104`).
- The admin mutation middleware wraps every non-excluded `/api/admin/` mutation in one PostgreSQL
  transaction and writes `admin.mutation.committed` on success
  (`packages/server/src/middleware/admin-mutation-audit.ts:42`).
- `runDatabaseTransaction` shares one client through `getPool()` and supports
  `afterDatabaseCommit` effects (`packages/server/src/lib/database.ts:73`).
- `admin:app:read` and `admin:app:update` already exist and are granted to App Admin
  (`packages/server/src/lib/admin-permissions.ts:24`, `:184`).

## Gaps Identified

### Gap 1: No Admin CRUD surface

**Current Behavior:** resource-server rows are deployment data; operators cannot list, create,
update, or delete them through the product.

**Required Behavior:** RD-01 defines five Admin routes, exact application ownership, replace-all
scopes, audience defaulting, fixed errors, and hard delete.

**Fix Required:** add a `resource-servers` service/repository module and a nested route file, then
mount it in `server.ts`.

### Gap 2: No SDK or CLI consumer

**Current Behavior:** the SDK applications domain stops at application and module operations; the
CLI has no resource-server command family.

**Required Behavior:** RD-01 defines the SDK methods/types and the
`porta app resource-server list|get|create|update|delete` family.

**Fix Required:** add SDK types and methods, add the CLI command file, and register it under `app`.

### Gap 3: Documentation says the surface does not exist

**Current Behavior:** `techdocs/architecture/api-design.md` says there is no Admin API; public API
and CLI docs have no resource-server page.

**Required Behavior:** RD-01 requires dedicated public pages and corrected technical docs.

**Fix Required:** add the two public pages, cross-link them, and update the architecture docs.

## Dependencies

### Internal Dependencies

- Application lookup by UUID or slug (`packages/server/src/applications/service.ts`).
- Existing `requireAdminAuth`, `requirePermission`, `APP_READ`, and `APP_UPDATE`.
- Existing PostgreSQL schema and namespace trigger.
- Existing request transaction and generic mutation audit.
- Existing SDK transport, response helpers, and CLI output/error helpers.

### External Dependencies

- PostgreSQL 16 (existing development/CI service).
- No new npm dependency.

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Unique identifier/audience collision across applications | Medium | High | Rely on the DB primary-key namespace and map unique violations to fixed `409` |
| Concurrent update/delete of the same row | Low | Medium | Lock the row with `FOR UPDATE` inside the request transaction |
| Scope replacement removes a scope unintentionally | Medium | Medium | Full-replacement `PUT` contract is explicit in RD-01 and CLI docs; tests assert removal |
| Foreign application/resource access leaks existence | Low | High | Resolve through the owning application and return `404` for any foreign pair |
| Audit row missing on a mutation | Low | High | Generic `adminMutationAudit` wraps the route; integration test asserts the row |
| Documentation drifts from the API | Medium | Low | Dedicated pages plus structure/docs build checks |
| Plan accidentally adds a migration or provider change | Low | High | 02-current-state and execution tasks explicitly forbid both; schema tests remain green |
