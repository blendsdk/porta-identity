# RD-01: Resource-Server Admin Management

> **Document**: RD-01-resource-server-admin.md
> **Status**: Complete
> **Created**: 2026-11-09
> **Project**: Porta
> **Depends On**: —
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Porta already models application-owned resource servers for RFC 8707 resource indicators. The model
is complete: a resource server has an absolute identifier, an access-token audience, and an explicit
custom-scope registry; provider resolution uses it for `resource` requests. Operators cannot manage
those rows through the product: the architecture docs state that no Admin API exists and the rows are
deployment data.

This requirement adds the missing management surface. It makes resource servers operable through the
Admin API, TypeScript SDK, CLI, and documentation without changing the provider resolution rules. The
work is a direct completion of the deferred admin surface recorded in the resource-servers roadmap
(AR-1).

---

## Functional Requirements

### Must Have

- [ ] **List resource servers (S).** `GET /api/admin/applications/:appId/resource-servers` returns
      `200` with `{ data: ResourceServer[] }` for the exact application. Ordering is by `name`, then
      `identifier`, both ascending. An application with no rows returns `{ data: [] }`.
- [ ] **Get one resource server (S).** `GET /api/admin/applications/:appId/resource-servers/:resourceServerId`
      returns `200` with `{ data: ResourceServer }`. The resource server must belong to `:appId`.
- [ ] **Create a resource server (M).** `POST /api/admin/applications/:appId/resource-servers`
      returns `201` with `{ data: ResourceServer }`. The request carries `name`, optional `slug`,
      `identifier`, optional `audience`, and optional `scopes`.
- [ ] **Update a resource server (M).** `PUT /api/admin/applications/:appId/resource-servers/:resourceServerId`
      replaces the complete definition and returns `200` with `{ data: ResourceServer }`. Required
      fields are `name`, `slug`, and `identifier`; `audience` and `scopes` are optional and default
      as defined below.
- [ ] **Delete a resource server (M).** `DELETE /api/admin/applications/:appId/resource-servers/:resourceServerId`
      returns `204` with no body. Deletion is hard, cascades the scope registry and namespace rows,
      and does not delete the application or its clients.
- [ ] **Resource-server projection (S).** Every response contains `id`, `applicationId`, `slug`,
      `name`, `identifier`, `audience`, `scopes`, `createdAt`, and `updatedAt`. `scopes` is a sorted
      array of custom scopes. Timestamps are ISO-8601 UTC strings.
- [ ] **Exact application ownership (M).** A resource server can be read, updated, or deleted only
      through its owning application. A foreign or unknown application/resource-server pair returns
      `404` and never reveals whether the row exists in another application.
- [ ] **Read authorization (S).** List and get require `admin:app:read` in addition to Admin
      authentication (AR-2).
- [ ] **Write authorization (S).** Create, update, and delete require `admin:app:update` in addition
      to Admin authentication (AR-2).
- [ ] **Replace-all scopes (M).** The scope registry is replaced atomically on update. An omitted or
      empty `scopes` array means no custom scopes. Duplicate entries and standard OIDC scopes are
      rejected (AR-3, AR-8).
- [ ] **Audience default (S).** On create and update, omitted or `null` `audience` becomes the
      identifier. An explicit audience is stored exactly (AR-7).
- [ ] **Hard-delete semantics (M).** Already-issued tokens remain valid until their normal expiry;
      new requests for the deleted identifier or audience fail with `invalid_target` (AR-9).
- [ ] **SDK surface (M).** The SDK exposes list, get, create, update, and delete methods on the
      applications domain, with exported `ResourceServer`, `CreateResourceServerInput`, and
      `UpdateResourceServerInput` types. Methods use the exact Admin API paths and validate response
      shapes before returning.
- [ ] **CLI surface (M).** The CLI exposes `porta app resource-server list|get|create|update|delete`
      with human-readable and `--json` output (AR-6). Update replaces the complete scope set.
- [ ] **Documentation (S).** Public API and CLI docs document every endpoint and command, including
      permissions, defaults, error bodies, hard-delete consequences, and the custom-only scope rule.
      Technical architecture docs no longer claim that no Admin API exists.
- [ ] **Audit (S).** Successful create, update, and delete requests produce the existing
      `admin.mutation.committed` audit row with actor, method, route, and result. No new
      domain-specific event is introduced (AR-10).

### Should Have

- [ ] Human CLI output uses the existing table/format helpers and prints the resource-server ID,
      name, slug, identifier, audience, and scopes.
- [ ] CLI `delete` asks for confirmation unless `--yes` is supplied.
- [ ] CLI `create` and `update` accept repeated `--scope` flags; omitting `--scope` on update clears
      the custom scope set, matching replace-all semantics.
- [ ] The list response remains a single bounded array; no pagination metadata is added (AR-5).

### Won't Have (Out of Scope)

- [ ] Management through the embedded `porta admin` terminal UI. The conventional CLI is the only
      CLI surface in this requirement.
- [ ] End-user self-service for resource servers.
- [ ] Portability export/import of resource-server rows (AR-10).
- [ ] Target-specific audit events beyond the generic Admin mutation row (AR-10).
- [ ] ETag/If-Match optimistic concurrency (AR-10).
- [ ] Cursor or offset pagination (AR-5).
- [ ] New RBAC permissions or role seeds (AR-2).
- [ ] New database migrations or changes to provider resolution (the existing schema and resolver
      are authoritative).
- [ ] Organization scoping. Resource servers remain application-global.

---

## Technical Requirements

### API Contract

| Method | Path | Permission | Success | Error bodies |
| --- | --- | --- | --- | --- |
| `GET` | `/api/admin/applications/:appId/resource-servers` | `admin:app:read` | `200 { data: ResourceServer[] }` | `404` application not found; `503` |
| `POST` | `/api/admin/applications/:appId/resource-servers` | `admin:app:update` | `201 { data: ResourceServer }` | `400`, `404`, `409`, `503` |
| `GET` | `/api/admin/applications/:appId/resource-servers/:resourceServerId` | `admin:app:read` | `200 { data: ResourceServer }` | `400`, `404`, `503` |
| `PUT` | `/api/admin/applications/:appId/resource-servers/:resourceServerId` | `admin:app:update` | `200 { data: ResourceServer }` | `400`, `404`, `409`, `503` |
| `DELETE` | `/api/admin/applications/:appId/resource-servers/:resourceServerId` | `admin:app:update` | `204` | `400`, `404`, `503` |

The `:appId` route parameter accepts an application UUID or slug, matching the existing
applications routes. The `:resourceServerId` parameter accepts a resource-server UUID or slug,
scoped to the resolved application.

### Request Fields

| Field | Create | Update | Rules |
| --- | --- | --- | --- |
| `name` | required | required | 1–255 characters; trimmed; no control characters |
| `slug` | optional | required | 3–100 characters; lowercase `[a-z0-9-]`; starts/ends alphanumeric; unique per application; auto-generated from `name` on create when omitted |
| `identifier` | required | required | Absolute URI; 1–2048 characters; no fragment; globally unique |
| `audience` | optional | optional | Absolute URI; 1–2048 characters; no fragment; globally unique; omitted/`null` defaults to `identifier` |
| `scopes` | optional | optional | Array of strings; each 1–255 characters matching `^[A-Za-z0-9_.:-]+$`; no duplicates; no standard OIDC scope; omitted/empty means no custom scopes |

Standard OIDC scopes rejected from the custom registry are exactly `openid`, `profile`, `email`,
`address`, `phone`, and `offline_access` (AR-8). They remain available through the existing resolver
and must not be stored as custom rows.

### Validation and Error Mapping

All request bodies and route parameters are validated with Zod before any database work. Fixed
public bodies are used so storage details are never exposed:

| Status | Body | Trigger |
| --- | --- | --- |
| `400` | `{ "error": "Resource server request is invalid" }` | Invalid body, path parameter, URI, scope, duplicate scope, or standard OIDC scope |
| `404` | `{ "error": "Application not found" }` | `:appId` does not resolve |
| `404` | `{ "error": "Resource server not found" }` | Unknown or foreign `:resourceServerId` |
| `409` | `{ "error": "Resource server conflicts with an existing identifier, audience, or slug" }` | Unique constraint violation |
| `503` | `{ "error": "Resource server operation failed" }` | Unexpected storage failure |

Authentication and permission middleware produce the existing `401` and `403` responses. A missing
permission must not fall through to a `404`.

### Persistence and Concurrency

The existing schema is used unchanged: `resource_servers`, `resource_server_scopes`, and
`resource_server_namespace` from migration 038. Create and update run in one database transaction.
Update locks the resource-server row with `FOR UPDATE` before replacing scopes. Unique constraints on
slug, identifier, and audience, plus the namespace trigger, remain the concurrency authority; a
PostgreSQL unique violation maps to the fixed `409` body. Delete locks the row, deletes it, and lets
the foreign-key cascade remove the scope and namespace rows. No new table, column, trigger, or
migration is required.

The generic `admin.mutation.committed` middleware records successful mutations after commit. A
failed transaction must not leave an audit row for a mutation that did not happen.

### SDK Contract

Add the following to the applications domain and export the supporting types from the SDK index:

| Method | Path | Result |
| --- | --- | --- |
| `listResourceServers(appId)` | `GET /applications/:appId/resource-servers` | `ResourceServer[]` |
| `getResourceServer(appId, resourceServerId)` | `GET /applications/:appId/resource-servers/:resourceServerId` | `ResourceServer` |
| `createResourceServer(appId, input)` | `POST /applications/:appId/resource-servers` | `ResourceServer` |
| `updateResourceServer(appId, resourceServerId, input)` | `PUT /applications/:appId/resource-servers/:resourceServerId` | `ResourceServer` |
| `deleteResourceServer(appId, resourceServerId)` | `DELETE /applications/:appId/resource-servers/:resourceServerId` | `void` |

The SDK validates every response field and rejects a partial or malformed projection rather than
returning it.

### CLI Contract

| Command | Behavior |
| --- | --- |
| `porta app resource-server list <app>` | List the application's resource servers; human table or `--json` |
| `porta app resource-server get <app> <resource-server>` | Show one resource server |
| `porta app resource-server create <app> --name <name> --identifier <uri> [--slug <slug>] [--audience <uri>] [--scope <scope>]...` | Create; print the created row |
| `porta app resource-server update <app> <resource-server> --name <name> --slug <slug> --identifier <uri> [--audience <uri>] [--scope <scope>]...` | Replace the definition; omitted `--scope` clears custom scopes |
| `porta app resource-server delete <app> <resource-server> [--yes]` | Delete after confirmation |

`<app>` and `<resource-server>` accept the same UUID-or-slug forms as the API. Every command honors
the global `--json`, `--verbose`, and server-selection options.

### Documentation Contract

- Public API: a resource-server page under `docs/api/` plus a cross-link from the applications page.
- Public CLI: a resource-server section/page under `docs/cli/` plus a cross-link from the
  applications page.
- Technical docs: update `techdocs/architecture/api-design.md` to describe the Admin endpoints and
  remove the "no Admin API" statement; update `techdocs/architecture/data-model.md` only if the
  management surface adds a material data-lifecycle detail.
- Documentation must state the fixed error bodies, audience default, custom-only scope rule,
  permissions, hard-delete cascade, and the fact that already-issued tokens remain valid until
  expiry.

### Non-Functional Requirements

- **Performance:** list and get are single indexed queries by `application_id`/`id`; the expected
  per-application set is small. No new cache, queue, or background worker.
- **Compatibility:** no migration and no provider-resolution change, so existing clients and issued
  tokens keep their behavior.
- **Observability:** existing structured request and audit logging only; never log request bodies,
  scopes, identifiers, or database errors containing row values.
- **Availability:** a storage failure returns the fixed `503`; it never returns a partial success or
  an unaudited mutation.

### Complexity Estimates

| Area | Estimate | Notes |
| --- | --- | --- |
| Service and repository | M | Transaction, locks, unique mapping, scope replacement |
| Admin routes | S | Existing application-router patterns |
| SDK | M | Types, methods, response validation, tests |
| CLI | M | Command family, flags, output, tests |
| Documentation | S | API, CLI, techdocs |
| Verification | M | Unit, integration, pentest, SDK/CLI, docs |

---

## Integration Points

- **Provider resolution:** `packages/server/src/oidc/resource-servers.ts` remains the consumer of the
  rows. This requirement only writes the rows it reads; no signature or behavior change.
- **Applications domain:** the new routes are nested under the existing application router family
  and reuse application lookup and permission middleware.
- **SDK transport:** the methods use the existing applications domain transport and error handling.
- **CLI:** the command family follows the existing `app module`, `app role`, and `app claim`
  registration pattern.
- **Audit:** the global `adminMutationAudit` middleware remains the audit writer.
- **Portability:** export/import is deliberately excluded; it remains a separate decision (AR-10).

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
| --- | --- | --- | --- | --- |
| Feature ownership | Existing `resource-servers` / new feature | Existing feature | Keeps the model and its deferred admin surface together | AR-1 |
| Permissions | Reuse app read/update / dedicated resource-server permissions | Reuse `admin:app:read` and `admin:app:update` | No RBAC seed migration; App Admin already owns application configuration | AR-2 |
| Scope mutation | Replace-all / add-remove / both | Replace-all on update | One atomic contract, no partial-update state | AR-3 |
| Delivery | API+SDK+CLI+docs / API+SDK first / API only | API+SDK+CLI+docs | The capability is not operator-usable until all consumers exist | AR-4 |
| List shape | Bounded list / cursor pagination | Bounded list ordered by name | The per-application set is small | AR-5 |
| CLI location | `app resource-server` / top-level / defer | `porta app resource-server` | Matches existing application subcommands | AR-6 |
| Audience omission | Reset to identifier / preserve | Reset to identifier | `PUT` is full replacement and matches create/DB default | AR-7 |
| Standard scopes | Reject / allow | Reject with `400` | Keeps the registry custom-only; resolver owns protocol scopes | AR-8 |
| Delete behavior | Hard delete / block while referenced | Hard delete and document impact | No reference table; matches cascade model | AR-9 |
| Optional surfaces | None / export-import / target audit / ETag | None | Keeps the first surface bounded; generic audit remains | AR-10 |

---

## Security Considerations

- **Data sensitivity:** resource-server names, identifiers, audiences, and custom scopes are
  administrative configuration, not credentials or PII. They are still protected by Admin
  authentication and authorization.
- **Input validation:** all path parameters and bodies are parsed with Zod; identifiers and audiences
  must be absolute URIs with no fragment and bounded length; slugs use the application slug rules;
  scopes use the database-compatible character set and bounded length; standard OIDC scopes and
  duplicate scopes are rejected.
- **Authentication and authorization:** every route requires a human Admin token. Reads require
  `admin:app:read`; writes require `admin:app:update`. Application ownership is enforced by the
  route/service boundary; a foreign resource returns `404`.
- **Injection risks:** all SQL is parameterized; no dynamic SQL, shell, HTML, or path operation uses
  request data. Resource-server values are configuration, not rendered as HTML.
- **Encryption:** no new secret storage. Configuration travels over the existing HTTPS Admin API and
  is stored in PostgreSQL under the existing database controls.
- **Rate limiting:** the existing Admin mutation limiter applies; no new limiter or bypass is added.
- **Audit and logging:** the generic Admin mutation audit records successful mutations. Error
  responses are fixed and must not include SQL, row values, identifiers from other applications, or
  stack traces.
- **Abuse and enumeration:** a foreign application/resource pair is indistinguishable from an absent
  one (`404`). The API does not expose token contents, grants, or provider internals.
- **Infrastructure:** no new service, container, network surface, or dependency.

---

## Acceptance Criteria

1. [ ] `GET /api/admin/applications/:appId/resource-servers` with a valid `admin:app:read` token
       returns `200` and `{ data: [] }` for an application with no rows.
2. [ ] The same list with two rows returns them ordered by `name` ascending, then `identifier`
       ascending, and includes every projection field.
3. [ ] `POST` with `name`, `identifier`, and no `audience` returns `201`, sets `audience` equal to
       `identifier`, and returns `scopes: []`.
4. [ ] `POST` with a valid `scopes` array returns the scopes sorted and stored exactly once.
5. [ ] `POST` with a duplicate `identifier`, duplicate `audience`, or duplicate slug within the same
       application returns `409` with the fixed conflict body; the same slug in another application
       is accepted.
6. [ ] `POST` with a relative URI, a URI containing `#`, or a 2049-character identifier returns
       `400` with the fixed validation body.
7. [ ] `POST` with `openid`, `profile`, `email`, `address`, `phone`, or `offline_access` in `scopes`
       returns `400`; a duplicate scope also returns `400`.
8. [ ] `PUT` without `audience` resets the stored audience to the identifier.
9. [ ] `PUT` with `scopes` replaces the complete registry: omitted scopes become empty, and removed
       scopes are no longer returned.
10. [ ] `GET`, `PUT`, and `DELETE` for a resource server owned by a different application return
        `404`, never `200`, `403`, or a cross-application projection.
11. [ ] `DELETE` returns `204`; the row, its scopes, and its namespace entries are gone; a subsequent
        list does not include it.
12. [ ] After delete, `resolveResourceServerInfo` rejects the deleted identifier with
        `invalid_target`; an already-issued token remains usable until its normal expiry.
13. [ ] A caller without `admin:app:read` receives `403` on list/get; a caller without
        `admin:app:update` receives `403` on create/update/delete.
14. [ ] A successful create, update, and delete each produce one `admin.mutation.committed` audit row;
        a validation failure produces no successful-mutation audit row.
15. [ ] The SDK list/get/create/update/delete methods call the exact paths and reject a malformed
        response with the SDK's normal error type.
16. [ ] `porta app resource-server list|get|create|update|delete` work in human and `--json` modes;
        `update` without `--scope` clears custom scopes; `delete` requires confirmation unless
        `--yes`.
17. [ ] `pnpm test:structure`, the affected unit/integration/pentest suites, the SDK and CLI suites,
        and `pnpm docs:build` pass.
18. [ ] The public API/CLI docs and technical architecture docs describe the endpoints, permissions,
        defaults, errors, and hard-delete consequences; no doc claims the Admin API is absent.
19. [ ] No new migration is added and the existing resource-server schema tests still pass.
20. [ ] Security requirements verified: input validation, parameterized SQL, Admin authorization,
        exact application ownership, fixed errors, and no secret/row-value logging.
