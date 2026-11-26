# Current State: Device Authorization

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### Provider and discovery

`packages/server/src/oidc/configuration.ts:504-541` enables introspection, revocation, resource
indicators, client credentials and RP-initiated logout, but not `deviceFlow`. The provider therefore
does not expose the device authorization endpoint or advertise the grant. The configuration builder
already accepts TTLs and feature hooks. The provider computes `grant_types_supported` from the
enabled features, so enabling `deviceFlow` adds the full device URN without a separate static list.

`packages/server/src/oidc/provider.ts:58-71` builds the interaction URL and stores the request
organization in Redis. It currently uses `req._portaOrganization`, set from the URL tenant, not the
client's organization.

### Storage

`packages/server/migrations/010_oidc_adapter.sql:8-26` defines `oidc_payloads` with `id`, `type`,
`payload`, `grant_id`, `user_code`, `uid`, `expires_at` and `consumed_at`. The `user_code` index is
non-unique. The latest migration is `038_resource_servers.sql`.

`packages/server/src/oidc/postgres-adapter.ts` implements `upsert`, `find`, `findByUserCode`,
`consume`, `destroy`, `revokeByGrantId` and `purgeExpired`. `upsert` stores the provider TTL
exactly; `find` and `findByUserCode` filter expired rows. The provider expects to apply
`ignoreExpiration` itself, so expired retention needs an adapter change. `upsert` computes
`expiresIn ? date : null`, so a zero TTL currently stores a never-expiring row.

`packages/server/src/oidc/adapter-factory.ts:154-161` routes DeviceCode to PostgreSQL because it is
not in `REDIS_MODELS`. The hybrid adapter has `findByUserCode` and live-authority checks.

### Server routes and middleware

`packages/server/src/server.ts:482-552` mounts the organization-prefixed OIDC router, tenant
resolver, body parser, token/introspection limiters, preflight CORS, client-tenant binding, client
secret bridge and the provider callback. The token limiter regex is
`packages/server/src/middleware/token-rate-limiter.ts:47`; its per-client limit is 30/300 seconds
and per-IP limit is 300/300 seconds, so normal device polling would be blocked. The router uses
`prefix: '/:orgSlug'`, so `ctx.path` is `/{orgSlug}/...`; the existing limiter regex includes the
slug.

`packages/server/src/middleware/oidc-client-tenant.ts` checks `client_id` from query, body and Basic
auth. It does not see a client ID on the device verification POST because that request carries only
`user_code`. Its `resolvedOrganizationId` helper is module-private and takes an organization object.

### Browser interaction

`packages/server/src/routes/interactions.ts` already implements login, magic link, consent, 2FA and
abort. `showLogin` resolves the organization from the interaction's client or the Redis
`interaction:org:{uid}` value. The provider's device flow reuses this interaction route after code
confirmation.

The provider's `code_verification` action loads the DeviceCode globally and renders the default
input/confirmation pages. `node_modules/oidc-provider/lib/actions/code_verification.js:52` calls
`findByUserCode` without a tenant filter. The default pages are unbranded and use external fonts.
The POST params allowlist is only `xsrf`, `user_code`, `confirm` and `abort`; the requested scopes
are stored on the DeviceCode, not on `ctx.oidc.params`.

### Client contracts

- Server: `packages/server/src/clients/validators.ts:46-48` restricts grants to three values;
  `:51` requires exactly one `['code']` response type; `:169-176` rejects an empty redirect array;
  `:241-292` validates protocol compatibility and requires at least one redirect URI.
- Service: `packages/server/src/clients/service.ts:253` and `:431` call `validateRedirectUris`
  before the compatibility validator; `:261` defaults `responseTypes` to `['code']`; `:679` passes
  `response_types` to the provider.
- Provider: `node_modules/oidc-provider/lib/helpers/client_schema.js:289-301` rejects a client with
  non-empty response types and zero redirects; `:308-310` adds `authorization_code` when the
  response type contains `code`. A device-only client must therefore store `responseTypes: []`.
- Admin API: `packages/server/src/routes/clients.ts:115` and `:147` use the shared grant schema;
  `:132` defaults response types.
- SDK: `packages/sdk/src/types/clients.ts:20` and `packages/sdk/src/domains/clients.ts:59-65` use a
  closed union and runtime validator.
- CLI commands: `packages/cli/src/commands/client.ts` has no `--grant-types` flag and requires
  `--redirect-uris` on create.
- Admin terminal: `packages/cli/src/admin/client-state.ts:27`,
  `client-service.ts:112-126` and `:184` (redirects minimum 1),
  `client-workspace.ts:399-459` (saves `responseTypes: ['code']`) and
  `client-registration-dialog.ts:143-159` use closed grant lists and a required redirect URI;
  `client-authentication-dialog.ts:203` guards the last redirect.
- Portability: `packages/server/src/portability/schema.ts:303-327` uses the same grant, redirect and
  response-type schemas.
- Docs: `docs/api/clients.md`, `docs/cli/clients.md`, `docs/concepts/oidc.md`,
  `docs/concepts/capabilities.md` and `docs/guide/custom-ui.md` do not describe the flow.

### CLI login

`packages/cli/src/commands/login.ts` wires `--server`, `--client-id` and `--no-browser` into
`authenticateCliSession`. `packages/cli/src/auth/login-coordinator.ts` implements authorization code
+ PKCE with a callback server or pasted callback. It verifies the ID token with
`verifyCliIdToken` in `packages/cli/src/auth/id-token-verifier.ts:61-104`, which requires a nonce.

`packages/cli/src/credential-store.ts` and the SDK `createCliAuth` own credential persistence and
refresh. The device flow can reuse both without a new profile. The CLI vitest project is pure unit;
no live CLI test runs against the E2E server.

### Audit, logging and cleanup

`packages/server/src/lib/logger.ts:63-89` redacts tokens, secrets and common PII but not
`device_code` or `user_code`. `packages/server/src/lib/audit-log.ts` exposes the existing
best-effort and transaction-bound writers; `writeAuditLog` inserts one row per call.
`packages/server/src/lib/deletion-cleanup.ts:157-193` already removes Redis OIDC payloads by
client/grant/user references, and client/user/organization deletion removes PostgreSQL
`oidc_payloads` rows. Connected-app revocation deletes by `grant_id`.

### i18n and tests

`packages/server/src/auth/i18n.ts:47-59` defines a closed `NAMESPACES` list; adding a locale file
without registering its namespace renders raw keys. `invitation-locales.spec.test.ts` asserts
exactly eleven namespaces, and `system-config-catalog.spec.test.ts` asserts the list equals
`REQUIRED_NAMESPACES`.

Existing suites:
- Unit: `packages/server/tests/unit/oidc/`, `unit/clients/`, `unit/middleware/`.
- Integration: `packages/server/tests/integration/oidc/`, `adapters/`, `clients/`,
  `migrations/`, `admin/`.
- E2E: `packages/server/tests/e2e/flows/`, `auth/`, `security/`.
- UI: `packages/server/tests/ui/flows/`, `security/`.
- Pentest: `packages/server/tests/pentest/`.
- SDK/CLI: `packages/sdk/tests/`, `packages/cli/tests/`.

There is no `codeops/test-map.json`. Verification follows the repository's local narrow policy and
the CI full gate (`pnpm verify`). `pnpm verify` includes `pnpm test:structure`, which pins exact
physical test-file counts (465 server, 26 UI, 62 SDK, 130 CLI); it excludes `pnpm test:ui` and the
OIDC harness.

## Gaps to Close

| Gap | Plan owner |
|---|---|
| Provider feature and discovery | 03-01 |
| Device flow interval response | 03-01 |
| DeviceCode retention, unique index, collision and duplicate preflight | 03-01, 03-05 |
| Cross-tenant verification/resume and shared path helper | 03-02 |
| Branded pages, scope source, generic abort page, form contract | 03-02 |
| `device` i18n namespace and exact-namespace tests | 03-02 |
| Device limiters, session UID resolution, approval-only reset and placement | 03-05 |
| Client grant, empty response types and zero redirects across surfaces | 03-03 |
| Admin terminal redirect/response-type support and last-redirect guards | 03-03 |
| CLI device coordinator, no-retry polling and live E2E | 03-04 |
| Audit hashing/deduplication/classification and redaction | 03-05 |
| Concurrent confirmation approval | 03-05 |
| Cleanup, fleet upgrade, assurance and structure counts | 03-03, 03-05, 99 |
| Public docs and techdocs | 03-03, 03-05 |
