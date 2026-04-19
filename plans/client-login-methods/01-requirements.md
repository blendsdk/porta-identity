# Requirements: Client Login Methods

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Porta's login page currently shows **both** a password form and a magic-link button for every OIDC client, unconditionally. This creates two problems:

1. **User confusion.** Many users don't understand the difference and hesitate to choose. Others pick the wrong one for their context.
2. **No operator control.** Operators cannot enforce a specific auth experience (e.g., "magic link only" for a consumer app, "password only" for an internal admin app).

This feature introduces a two-level configuration:

- An **organization-level default** (`organizations.default_login_methods`) defines which methods are allowed across all clients of that org.
- A **per-client override** (`clients.login_methods`) can be `NULL` (inherit from org) or a non-empty array that narrows the methods for that client.

At interaction time, the effective methods are resolved (`client.loginMethods ?? org.defaultLoginMethods`), passed into the login template, and enforced by the backend routes.

## Functional Requirements

### Must Have

- [ ] New `organizations.default_login_methods TEXT[] NOT NULL DEFAULT '{password,magic_link}'` column
- [ ] New `clients.login_methods TEXT[] DEFAULT NULL` column
- [ ] TypeScript type `LoginMethod = 'password' | 'magic_link'` (extensible union)
- [ ] `Organization.defaultLoginMethods: LoginMethod[]` always non-empty
- [ ] `Client.loginMethods: LoginMethod[] | null` — `null` means inherit
- [ ] Resolver helper `resolveLoginMethods(org, client): LoginMethod[]` returning effective methods
- [ ] Login template renders conditional sections based on effective methods
- [ ] Backend rejects `POST /interaction/:uid/login` with 403 when `password` not in effective methods
- [ ] Backend rejects `POST /interaction/:uid/magic-link` with 403 when `magic_link` not in effective methods
- [ ] Admin API: `POST /api/admin/organizations` and `PATCH /api/admin/organizations/:id` accept `defaultLoginMethods`
- [ ] Admin API: `POST /api/admin/clients` and `PATCH /api/admin/clients/:id` accept `loginMethods` (nullable)
- [ ] CLI: `porta org create|update --login-methods <list>` supports setting org default
- [ ] CLI: `porta client create|update --login-methods <list|inherit>` supports override or reset
- [ ] OIDC metadata for clients exposes effective methods via `urn:porta:login_methods`
- [ ] Audit log on organization update and client update captures changes to login-method fields
- [ ] All existing login flows continue to work unchanged (backward-compatible defaults)
- [ ] **Forgot-password link is hidden for magic-link-only clients** — the `{{#if showPassword}}` wrapper suppresses it in the template
- [ ] **Forgot-password and reset-password routes return 403** when `password` is not in the client's effective methods (defense-in-depth, same pattern as POST `/login`)

### Should Have

- [ ] Backend enforcement audit-logs suspicious POSTs to disabled methods (`rate_limit.*` category or new `security.method_disabled`)
- [ ] Clear error page / flash when a disabled method is attempted (gracefully re-render login)
- [ ] Client list/show responses in admin API and CLI display both raw `loginMethods` and the resolved effective methods (e.g., `effectiveLoginMethods`)
- [ ] **Playground demonstrates all login-method scenarios out of the box** — after `yarn tsx scripts/playground-seed.ts`, both the static SPA (`playground/`) and the BFF (`playground-bff/`) expose password-only, magic-link-only, both, and org-forced variants via a client switcher (SPA dropdown, BFF env var). See [08-playground-integration.md](08-playground-integration.md).
- [ ] **BFF exposes a `/debug/client-login-methods` JSON endpoint** (dev-only) returning `{ client, organization, effective, source }` for scripted verification of the resolution chain.
- [ ] **BFF dashboard renders a "Login Methods Configuration" panel** showing raw + effective methods + resolution source for humans viewing `http://localhost:3000`.
- [ ] **`login_hint` OIDC parameter pre-populates the email input** on the login page (both password and magic-link email fields), improving UX when clients pass the known email.

### Won't Have (Out of Scope)

- ❌ SSO / federated login (`'sso'`) — the type is extensible but no implementation
- ❌ WebAuthn / passkeys (`'passkey'`) — same as above
- ❌ Per-user login method preferences (stays org + client level only)
- ❌ Per-environment overrides (dev/staging/prod are organization-scoped already via separate orgs)
- ❌ UI admin panel changes (only admin API + CLI) — there is no web admin UI in scope
- ❌ Migration of the `applications` module — this level was considered and rejected

## Technical Requirements

### Performance

- Resolution must happen in-memory in `showLogin()` — no additional DB roundtrip (org is already loaded via tenant resolver and client metadata is already loaded in OIDC interaction)
- No change to caching strategy — existing Redis cache entries for `Organization` and `Client` will include the new fields via normal mapping
- Cache invalidation: existing invalidation on `updateOrganization` and `updateClient` already covers these fields

### Compatibility

- **Backward-compatible defaults:** All existing orgs get `{password, magic_link}` via the DEFAULT clause in the migration. All existing clients get `NULL` → inherit → renders identical UI.
- **OIDC metadata:** Adding `urn:porta:login_methods` to `extraClientMetadata.properties` does not affect any OIDC-compliant flows — it's a custom Porta-internal property.
- **No breaking changes** to admin API — the new fields are optional on create/update.

### Security

- **Defense in depth.** Even if a user crafts a POST with the wrong method (bypassing the template), the backend must reject it. The UI is a UX optimization, not a security boundary.
- **CSRF protection** remains on all POST endpoints (unchanged).
- **Rate limiting** remains on all POST endpoints (unchanged).
- **User-enumeration guard** remains on magic-link endpoint (unchanged).
- **Audit logging.** Every create/update of login-method fields is audit-logged with before/after values.
- **Validation.** Both columns reject empty arrays at service-layer validation. The `login_methods` on clients can be `NULL` (inherit) but never `{}` (empty).

### Data Validation

- `defaultLoginMethods` must be non-empty and contain only known `LoginMethod` values.
- `loginMethods` on clients may be `null` OR a non-empty array of known `LoginMethod` values.
- Duplicates in the array should be normalized (either reject or dedupe — decision: **dedupe + preserve order** at service layer).

## Scope Decisions

| Decision                                | Options Considered                                  | Chosen                              | Rationale                                                                                       |
| --------------------------------------- | --------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Where to store per-entity methods       | Organization, Application, Client                   | Client (with org default)           | Client is the login-resolution boundary; applications have multiple clients with different needs |
| Inheritance model                       | Explicit required on client / NULL = inherit        | NULL = inherit                      | Cleaner — allows future UI toggle "Override for this client?"; preserves org-default semantics  |
| DB column value constraint              | CHECK (`method IN (...)`) or no constraint          | No CHECK                            | Future-proof — adding SSO/passkey only requires TS union extension, no migration                |
| TS type shape                           | Enum vs. union                                      | Union (`'password' \| 'magic_link'`) | Matches project convention (see `ClientType`, `TwoFactorPolicy`)                                |
| Org-level API placement                 | Under `branding` or top-level                       | Top-level alongside `twoFactorPolicy` | Login methods are an authentication policy, not a visual branding choice                        |
| CLI inherit syntax                      | `--login-methods ""` or `inherit` keyword           | `--login-methods inherit`           | Explicit + readable; prevents accidental blank-empty override                                   |
| Validation on duplicates                | Reject or dedupe                                    | Dedupe + preserve order             | Forgiving UX — `password,password,magic_link` → `[password, magic_link]`                        |
| Error presentation on disabled POST     | 403 with JSON / redirect to login with flash error  | Render login page with flash error  | User-friendly — bypass attempts are rare, most will be client-side forgery or browser back button |
| Audit event type for disabled-method POST | reuse `user.login.*.failed` vs. new event         | New `security.login_method_disabled` | Distinguishes enforcement trigger from credential failure in logs                                |

## Acceptance Criteria

1. [ ] Migration 014 applies cleanly (up) and reverts cleanly (down)
2. [ ] All existing tests continue to pass with no modification (backward compatibility check)
3. [ ] New unit tests cover: type mapping, validation, resolver, repository CRUD, service CRUD, route Zod schemas, CLI parsing, interaction enforcement
4. [ ] New integration test covers migration 014 forward + reverse
5. [ ] New E2E test covers:
   - Client with `['password']` — login page shows no magic-link form; POST to `/magic-link` returns 403
   - Client with `['magic_link']` — login page shows no password form; POST to `/login` returns 403
   - Client with `['password', 'magic_link']` — current behavior preserved
   - Client with `NULL` inherits org default correctly
6. [ ] `yarn verify` passes with zero warnings/errors
7. [ ] `.clinerules/project.md` is re-analyzed and updated post-completion
