# Server Contract: Selective Environment Portability

> **Document**: 03-01-server-contract.md
> **Parent**: [Index](00-index.md)

## Overview

This component owns the one strict server-side manifest schema, public request/result types,
authorization calculation, body-size boundary, and Koa response mapping. The RD owns all record
fields, category behavior, permission matrices, and public status/code semantics. (AR-1)

## Architecture

### Current Architecture

`routes/exports.ts` and `routes/imports.ts` validate separate legacy contracts. The global Admin
parser runs before route authentication. SDK types independently approximate the old import schema.

### Proposed Changes

Create `packages/server/src/portability/` as one direct feature module with `schema.ts`, `types.ts`,
`authorization.ts`, and `index.ts`. Routes import only its public entry. The server schema remains
the runtime authority; SDK types mirror the same wire contract through package-level contract tests,
without a generated-schema system or shared source dependency. (AR-2)

## Implementation Details

### Public Types and Schemas

```ts
export type PortabilityCategory =
  'organizations' | 'applications_authorization' | 'users_assignments' | 'oidc_clients';

export type PortabilityScope =
  | { readonly kind: 'organization'; readonly organization_slug: string }
  | { readonly kind: 'environment' };

export interface ExportManifestRequest {
  readonly scope: PortabilityScope;
  readonly categories: readonly PortabilityCategory[];
  readonly application_selection: {
    readonly all_applications: boolean;
    readonly application_slugs: readonly string[];
  };
}

export interface ImportManifestRequest {
  readonly manifest: PortabilityManifest;
  readonly mode: 'dry-run' | 'keep-existing' | 'update-existing';
}
```

`PortabilityManifest`, its eleven record types, `PortabilityResult`, `PortabilityResultItem`,
`PortabilityResultError`, and committed credential types exactly implement RD-02 **Manifest Schema
Contract** and **Result Contract**. Every Zod object uses `.strict()`. Normalization delegates to
the validation sources below before duplicate or natural-key comparison. (AR-1)

| Portable values                                    | Validation source                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization and application slugs                 | Existing exported domain slug validators                                                                                                                             |
| Organization/application/module/user scalar fields | Extract only the shared Zod field fragments from the current route-local schemas into their existing domain areas; ordinary routes and portability both consume them |
| Client protocol and scalar fields                  | Existing client validators plus only the shared route-local field fragments needed by both callers                                                                   |
| Role and permission slugs                          | Existing RBAC slug normalization, including the permission slug's trim-only contract                                                                                 |
| Claim definitions and values                       | Existing custom-claim validators                                                                                                                                     |
| Branding assets and scalar fields                  | Existing image validation plus only the shared branding field fragments needed by both callers                                                                       |

No validator registry, generated schema system, mutation-service call, or duplicate full mutation
schema is added. Focused contract tests prove that the ordinary route and portability boundary apply
the same extracted field rules.

### Authorization

```ts
export function requiredPortabilityPermissions(
  operation: 'export' | 'import',
  categories: readonly PortabilityCategory[],
): readonly AdminPermission[];

export function requirePortabilityAuthorization(
  operation: 'export' | 'import',
  readCategories: (ctx: Router.RouterContext) => readonly PortabilityCategory[] | undefined,
): Middleware;
```

The helper returns the closed union in RD-02 **Portability Permission Matrix**. It rejects malformed
or unavailable categories without inspecting destination records. Environment scope additionally
checks the authenticated role array for the exact `porta-super-admin` value; the helper never
treats the legacy `porta-admin` role as environment authority. Selected scope is constrained by the
request's normalized organization slug in all graph queries. (AR-1)

### Routes and Body Parsing

- `POST /api/admin/export/manifest` runs Admin auth, base export permission, closed request parsing,
  category permission authorization, service execution, and safe response mapping in that order.
- Existing `GET /api/admin/export/:entityType` report downloads remain unchanged.
- `POST /api/admin/import` runs Admin auth and base import permission before the route-local 64 MiB
  UTF-8 JSON parser. It then parses the strict request, authorizes category permissions and scope,
  and calls preview or apply.
- `server.ts` excludes the actual `POST /api/admin/import` route set from the ordinary 100 KiB parser,
  including the router's accepted trailing-slash and case variants. The route owns a
  `koa-bodyparser` instance with `jsonLimit: '64mb'`; no other route limit changes. (AR-1, AR-2)
- Every portability success and error response sets `Cache-Control: no-store` before returning.
- Export sets attachment type `application/json; charset=utf-8` and uses the filename from AR-5.

### Correlation and Error Mapping

The routes implement the exact status/code/body table in RD-02 **API Shape**. A rejected import plan
uses the fixed `{ error, code, result }` envelope so its bounded safe `PortabilityResult` remains
available. An unexpected 503 includes `request_id` equal to the existing `X-Request-Id`; it writes
one content-free log containing only operation, code, request ID, and import mode when applicable.
Zod issue paths, SQL errors, UUIDs, raw values, natural keys, manifest fragments, stack traces, and
dependency diagnostics never enter the public body or portability log. (AR-1)

## Integration Points

- `server.ts`: selective body-parser routing.
- `middleware/admin-auth.ts`: authenticated identity, exact roles, and permissions.
- `lib/admin-permissions.ts`: existing permission constants.
- `routes/exports.ts`, `routes/imports.ts`: transport-only orchestration.
- `portability/export.ts`, `portability/plan.ts`, `portability/apply.ts`: validated service calls.

## Error Handling

| Error Case                                | Handling Strategy                                              | AR Ref |
| ----------------------------------------- | -------------------------------------------------------------- | ------ |
| Authentication or permission failure      | Existing safe 401/403 before manifest content or plan          | AR-1   |
| Invalid export request                    | Fixed 400 `export_request_invalid`                             | AR-1   |
| Invalid import JSON/schema/version/field  | Fixed 400 `import_manifest_invalid`                            | AR-1   |
| Request body exceeds 64 MiB               | Fixed 413 `import_manifest_too_large` after auth/permission    | AR-1   |
| Serialized export exceeds 64 MiB          | Fixed 413 `export_manifest_too_large`, no partial attachment   | AR-1   |
| Rejected export scope                     | Fixed 409 `export_scope_rejected`                              | AR-1   |
| Control-plane or incompatible import plan | Fixed 409 `import_plan_rejected` with bounded safe result      | AR-1   |
| Unexpected execution failure              | Fixed 503 operation code and existing request ID, no internals | AR-1   |

## Testing Requirements

- Manifest specification tests cover ST-1–ST-4. Server route specification tests cover ST-5–ST-10
  and ST-22–ST-24. Engine specifications own ST-11–ST-21 and ST-25–ST-37.
- Type/contract tests prove strict manifest acceptance and rejection at the route boundary.
- Pentest coverage verifies permission unions, tenant isolation, protected payload parsing, and
  response secrecy.
