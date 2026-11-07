# Task T-01: Per-Application Resource-Server Scopes and Audience

> **Type**: Task (lightweight) · **Feature**: resource-servers · **CodeOps Artifact Schema**: 1
> **Progress**: 6/7 tasks (86%)
> **Reasoning**: high — token audience and scope resolution are security-sensitive, but the model
> is bounded to one table pair, one resolver and the existing provider callback.

## Objective

Model resource servers per application, with explicit scopes and an absolute-URI audience, and
resolve `getResourceServerInfo` from the requested RFC 8707 `resource`. Unknown resources and
unpermitted scopes must fail; requests without `resource` must keep the current unrestricted token
behavior. Closes GitHub #156.

**Smallest viable design:** one `resource_servers` table, one `resource_server_scopes` table, one
resolver that enforces exact application ownership and scope membership, and one callback change in
the existing provider configuration. No admin API, SDK, CLI, cache or generalized policy engine.

## Scope

In scope:

- Migration for per-application resource servers (`application_id`, slug, name, absolute-URI
  identifier, audience, timestamps) and their scope registry.
- Resolver: exact identifier + application lookup, unknown-resource rejection, registered-scope
  enforcement, standard OIDC scope allowance, opaque access tokens and the existing access-token
  TTL.
- Provider callback wiring through an injectable resolver for tests.
- No-resource default path remains unchanged.
- Spec-first unit and integration tests, maintainer/API documentation and roadmap.

Out of scope:

- Admin API/SDK/CLI management of resource servers (a later surface).
- Connected-apps list/revoke (#155), consent changes, JWT access tokens, per-client resource
  allowlists, caches, distributed invalidation or a scope-definition framework.
- Changing the existing default token behavior or any unrelated OIDC flow.

## Decisions (auto-design provenance)

| ID  | Decision | Rationale |
| --- | -------- | --------- |
| D1  | Per-application ownership | Confirmed by the user. It matches the existing application-scoped client, role and claim model. |
| D2  | Explicit scope registry per resource server | Confirmed by the user. It is the smallest auditable authority boundary for requested scopes. |
| D3  | Absolute-URI identifier and audience | Confirmed by the user. The identifier is the RFC 8707 resource value; the audience is the explicit `aud` and defaults to the identifier. |
| D4  | Standard OIDC scopes remain available in resource-bound flows | `openid`, `profile`, `email`, `address`, `phone` and `offline_access` are protocol scopes, not application API scopes. Rejecting them would break resource-bound OIDC flows. |
| D5  | Only clients of the owning application may resolve the resource | The client's existing `urn:porta:internal_application_id` metadata is the authority boundary; no new client metadata is introduced. |
| D6  | No-resource requests bypass resource resolution | Preserves the provider's deliberate unrestricted default and keeps userinfo working. |
| D7  | No management API in this task | #156 is a server-model issue; the resolver and repository are reusable by a later admin surface. |

AI resolved D2–D7 under `--auto-design`; D1–D3 were user-confirmed product decisions.

## Technical design

1. **Migration 038.** `resource_servers` with UUID id, application FK, slug, name, identifier,
   audience and timestamps; unique `(application_id, slug)`, unique `identifier`, unique `audience`.
   `resource_server_scopes` with `(resource_server_id, scope)` primary key and cascade delete.
2. **Resolver.** `packages/server/src/oidc/resource-servers.ts` validates the absolute identifier,
   queries the exact application/identifier pair and its ordered scopes, and returns
   `{ scope, audience, accessTokenFormat: 'opaque', accessTokenTTL }`. Unknown pairs throw
   `errors.InvalidTarget`; requested custom scopes outside the registry throw
   `errors.InvalidScope`. Standard OIDC scopes are added to the returned scope set.
3. **Provider callback.** `buildProviderConfiguration` accepts an optional injected resolver and
   reads the client's existing internal application UUID plus the request's `scope` parameter.
   Missing application identity is an `InvalidTarget`. The default resolver is the DB service.
4. **Tests.** Unit resolver tests mock the pool; integration tests use real PostgreSQL; config tests
   invoke the built callback with a fake resolver and assert the no-resource default path.
5. **Documentation.** Add the model and resolution rules to `techdocs/architecture/security.md` and
   `techdocs/architecture/api-design.md`; update the feature roadmap/portfolio.

## Tasks

- [x] T-01.1 Write resolver unit specs for exact resolution, unknown resource, unpermitted scope,
  invalid identifier, standard scopes and TTL; observe red. ✅ (completed: 13 focused specs green)
- [x] T-01.2 Write provider-callback specs for application isolation, requested scope forwarding and
  the no-resource default; observe red. ✅ (completed: callback and default-path specs green)
- [x] T-01.3 Add migration 038 and the resolver service; make resolver specs green. ✅ (completed:
  ordered migration, exact app/identifier lookup, scope enforcement, opaque TTL)
- [x] T-01.4 Wire the provider callback with the injectable resolver; make config specs green. ✅
  (completed: UUID application identity, requested scope forwarding, no-resource default)
- [x] T-01.5 Add a real-PostgreSQL integration spec for two applications and unknown/wrong-owner
  resources; run it green. ✅ (completed: 4 integration cases; full integration 1,168)
- [x] T-01.6 Update security/API docs and roadmap; run server lint, typecheck, build, focused tests,
  the affected integration selection and structure. ✅ (completed: techdocs security/api/data-model;
  server unit 4,445; integration 1,168; E2E 134; pentest 334; structure 158; docs build)
- [~] T-01.7 Independent review and scoped fixes; full server/CI gate; merge through `develop`, close
  #156 and record evidence/cleanup. ⏳ (review, final CI, merge and closure pending)

**Verify**: `pnpm --filter @portaidentity/server lint && pnpm --filter @portaidentity/server typecheck && pnpm --filter @portaidentity/server build && pnpm --filter @portaidentity/server test && pnpm test:structure`

## Evidence plan

- Record spec-red output, focused green counts, migration/integration evidence and review findings.
- Record CI, merge commit and #156 closure; clean up owned services and temporary artifacts.
