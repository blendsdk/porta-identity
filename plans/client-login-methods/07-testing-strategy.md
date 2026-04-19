# Testing Strategy: Client Login Methods

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

- **Unit tests:** 100% coverage of new code (resolver, validation helpers, mapping, parsers)
- **Integration tests:** Migration 014 (up/down) + existing migration tests regression-pass
- **E2E tests:** Full login flow verified for all three effective-method configurations

### Test Count Estimate

| Category                    | New Tests | Modified Tests |
| --------------------------- | --------- | -------------- |
| Organizations module unit   | ~10       | ~8             |
| Clients module unit         | ~15       | ~12            |
| Routes unit                 | ~10       | ~6             |
| OIDC config unit            | ~1        | 0              |
| CLI unit                    | ~8        | ~4             |
| Migrations unit             | ~2        | 0              |
| Migrations integration      | ~5        | 0              |
| E2E                         | ~6        | ~2             |
| UI Playwright flows         | ~6        | ~2             |
| Playground smoke (shell)    | ~3        | 0              |
| **Total**                   | **~68**   | **~34**        |

## Test Categories

### Unit Tests

#### Organizations module

| Test                                                         | Description                                                      | Priority |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | -------- |
| `mapRowToOrganization` includes `defaultLoginMethods`         | Row with `{password,magic_link}` maps correctly                  | High     |
| `mapRowToOrganization` handles missing field (old cache)      | Defaults to `['password', 'magic_link']`                         | High     |
| `insertOrganization` persists `default_login_methods`         | SQL receives the field, roundtrip via findById                   | High     |
| `updateOrganization` supports partial update                  | Only `defaultLoginMethods` → SET-clause includes it              | High     |
| `createOrganization` service rejects empty array              | Throws `OrganizationValidationError`                             | High     |
| `createOrganization` service rejects invalid method           | Throws `OrganizationValidationError('invalid method')`           | High     |
| `createOrganization` service normalizes duplicates            | Input `['password','password']` → `['password']`                 | Medium   |
| `updateOrganization` audit log includes diff                  | old + new values captured in metadata                            | Medium   |
| `updateOrganization` no-op skip                               | Same-value update does not produce duplicate audit entry         | Low      |
| `organizations.cache` roundtrip                               | `defaultLoginMethods` preserved through Redis                    | High     |

#### Clients module

| Test                                                         | Description                                                     | Priority |
| ------------------------------------------------------------ | --------------------------------------------------------------- | -------- |
| `mapRowToClient` handles `login_methods = null`              | Returns `loginMethods: null`                                     | High     |
| `mapRowToClient` handles `login_methods = ['password']`      | Returns `loginMethods: ['password']`                             | High     |
| `mapRowToClient` handles missing field (old cache)            | Returns `loginMethods: null`                                     | High     |
| `insertClient` with null `loginMethods`                       | Persists NULL in DB                                              | High     |
| `insertClient` with `['magic_link']`                          | Persists the array                                               | High     |
| `updateClient` with `undefined`                               | SQL does not include column in SET                               | High     |
| `updateClient` with `null`                                    | SQL sets `login_methods = NULL`                                  | High     |
| `updateClient` with array                                     | SQL sets the new array                                           | High     |
| `createClient` service rejects empty array                    | Throws `ClientValidationError`                                   | High     |
| `createClient` service rejects invalid method                 | Throws `ClientValidationError`                                   | High     |
| `createClient` service normalizes duplicates                  | `['password','password']` → `['password']`                       | Medium   |
| `updateClient` audit log includes diff                        | old + new                                                         | Medium   |
| `findForOidc` includes `urn:porta:login_methods` (null case)  | Metadata object has `null` value                                  | High     |
| `findForOidc` includes `urn:porta:login_methods` (array case) | Metadata object has the array                                     | High     |
| `clients.cache` roundtrip                                    | `loginMethods: null` and `loginMethods: [...]` both preserved    | High     |

#### Resolver (new file)

| Test                                         | Description                                                     | Priority |
| -------------------------------------------- | --------------------------------------------------------------- | -------- |
| `resolveLoginMethods` with client override   | Returns client's array                                           | High     |
| `resolveLoginMethods` with null → inherit    | Returns org default                                              | High     |
| `resolveLoginMethods` with empty array       | Defensive: returns org default (shouldn't happen)                | Medium   |
| `normalizeLoginMethods` dedupe               | `['a','b','a']` → `['a','b']`                                    | High     |
| `normalizeLoginMethods` preserves order      | `['magic_link','password']` → `['magic_link','password']`        | High     |
| `normalizeLoginMethods` empty input          | `[]` → `[]`                                                      | Low      |

#### Routes (HTTP)

| Test                                                   | Description                                                    | Priority |
| ------------------------------------------------------ | -------------------------------------------------------------- | -------- |
| `POST /organizations` accepts `defaultLoginMethods`    | 201 with body incl. array                                      | High     |
| `POST /organizations` rejects empty                    | 400                                                            | High     |
| `PATCH /organizations/:id` updates field               | 200, roundtrip                                                  | High     |
| `POST /clients` accepts `loginMethods: null`           | 201, inherit                                                    | High     |
| `POST /clients` accepts `loginMethods: ['password']`   | 201                                                             | High     |
| `POST /clients` rejects empty array                    | 400                                                             | High     |
| `PATCH /clients/:id loginMethods: null`                | 200, field reset                                                | High     |
| `GET /clients/:id` response includes `effectiveLoginMethods` | Computed from org + client                                | High     |

#### Interactions

| Test                                                       | Description                                                    | Priority |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| `showLogin` sets `showPassword + showMagicLink = true` (both) | Default case                                                | High     |
| `showLogin` sets `showPassword = true`, others false (pwd-only) | Custom case                                                | High     |
| `showLogin` sets `showMagicLink = true`, others false (magic-only) | Custom case                                            | High     |
| `showLogin` falls back safely if `provider.Client.find` returns undefined | Default to both                                   | Medium   |
| `processLogin` rejects with 403 when password disabled     | Returns login page with error, does not touch user repo         | High     |
| `processLogin` audits `security.login_method_disabled`     | Audit log entry created                                         | High     |
| `processLogin` normal flow unchanged                       | Password-enabled client logs in                                 | High     |
| `handleSendMagicLink` rejects with 403 when magic disabled | Returns login page with error                                   | High     |
| `handleSendMagicLink` audits on reject                     | Audit log entry created                                         | High     |
| `handleSendMagicLink` normal flow unchanged                | Magic-enabled client gets email sent                            | High     |

#### OIDC configuration

| Test                                                       | Description                                                    | Priority |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| `buildProviderConfiguration` `extraClientMetadata.properties` includes `urn:porta:login_methods` | Property listed                                         | High     |

#### CLI

| Test                                                       | Description                                                    | Priority |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| `parseLoginMethodsFlag` returns undefined for undefined    | No flag → no change                                             | High     |
| `parseLoginMethodsFlag` returns null for `inherit` (allowed) | Client case                                                  | High     |
| `parseLoginMethodsFlag` throws for `inherit` (not allowed) | Org case                                                        | High     |
| `parseLoginMethodsFlag` parses comma-separated             | `password,magic_link` → array                                   | High     |
| `parseLoginMethodsFlag` rejects invalid                    | Unknown method → error                                          | High     |
| `parseLoginMethodsFlag` rejects empty string               | `""` → error                                                    | High     |
| `org create --login-methods password`                      | Handler calls `createOrganization` with correct arg             | High     |
| `client update <id> --login-methods inherit`               | Handler calls `updateClient` with `loginMethods: null`          | High     |

#### Migrations

| Test                                                       | Description                                                    | Priority |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| `migrations/014_login_methods.sql` has `-- Up Migration` + `-- Down Migration` markers | SQL format check                                  | High     |
| `migrations/014_login_methods.sql` syntax parses           | pg-query parses without errors                                  | High     |

### Integration Tests

#### Migration 014

| Test                                                       | Components                         | Description                                        |
| ---------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| Up migration adds columns                                  | Postgres + migrator                | `default_login_methods`, `login_methods` present   |
| Default values                                             | Postgres + migrator                | Org defaults to `{password,magic_link}`; client to NULL |
| Down migration removes columns                             | Postgres + migrator                | Columns gone                                        |
| Roundtrip: up → insert → down → up preserves data? (expected no — DROP COLUMN discards) | Postgres               | Data loss documented                                |
| Full migration chain (001–014) runs clean                  | Postgres + migrator                | No regressions                                      |

### End-to-End Tests

Add new file: `tests/e2e/login-methods.spec.ts` (or extend existing login E2E).

| Scenario                                              | Steps                                                                                          | Expected Result                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Default (both methods)**                            | 1. Create org (default methods)<br>2. Create client (inherit)<br>3. GET /interaction/:uid      | Login page shows password form + magic-link button + divider      |
| **Org default = password only**                       | 1. Create org with `['password']`<br>2. Client inherit<br>3. GET /interaction/:uid            | Login page shows only password form, no magic-link button         |
| **Org default = magic_link only**                     | 1. Create org with `['magic_link']`<br>2. Client inherit<br>3. GET /interaction/:uid          | Login page shows only magic-link form with email input            |
| **Client override = password only, org = both**       | 1. Create org (default)<br>2. Client override `['password']`<br>3. GET /interaction/:uid      | Login page shows only password form                               |
| **POST to disabled password**                         | Setup pwd-only-disabled client → POST /login                                                   | 403, login page re-rendered with error, audit log entry           |
| **POST to disabled magic-link**                       | Setup magic-disabled client → POST /magic-link                                                 | 403, login page re-rendered with error, audit log entry           |

### Security / Pentest Considerations

Add to `tests/pentest/`:

| Test                                                                           | Scenario                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| CSRF still required on `POST /login` even for disabled method                  | POST with no CSRF → 403 CSRF error (not method error)     |
| No information leak: disabled method error is generic (not "because client X has ...") | Response body does not expose config details    |
| Admin API mass-assignment: `loginMethods` in JSON body cannot bypass RBAC      | Non-super-admin cannot update orgs/clients                |
| `POST /auth/forgot-password` returns 403 for magic-link-only client            | Defense-in-depth: even with a hidden link, direct POST blocked |
| `POST /auth/reset-password` returns 403 with valid token for magic-link-only client | Token issued before config change cannot bypass enforcement |
| `login_hint` XSS attempt (`?login_hint=<script>…`) is safely HTML-escaped in rendered login page | Handlebars default escaping prevents injection     |

### UI Playwright Tests

Porta's user-facing UI is tested via Playwright specs in `tests/ui/flows/`. Add a new spec file and update two existing ones.

**New file:** `tests/ui/flows/login-methods.spec.ts`

| Scenario                                                      | Expected Result                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Password-only client renders only password form               | Page has `input[type="password"]`, no `#magic-link-btn`, no `.divider`        |
| Magic-link-only client renders only magic-link form           | Page has `#ml-email` input + `#magic-link-btn`, no password field             |
| Default (both) client renders both forms + divider             | All three: password field, magic-link button, `.divider`                      |
| Forgot-password link hidden for magic-link-only client        | `a[href*="forgot-password"]` not present on page                              |
| `login_hint=user@example.com` pre-populates email input       | `input[name="email"]` has `value="user@example.com"`                          |
| POST to disabled method via `page.request.post()` returns 403 | Direct fetch bypassing UI still blocked (defense-in-depth)                    |

**Updates to existing specs:**

- `tests/ui/flows/password-login.spec.ts` — add assertion that the test client has `loginMethods = null` (inherits both) and that both forms render (regression guard against accidental template misconfig).
- `tests/ui/flows/magic-link.spec.ts` — same regression assertion for the magic-link flow's test client.

These new Playwright scenarios exercise the full stack (DB → service → template → browser), complementing the unit-level template context tests.

### Playground Smoke Tests

Extend `scripts/playground-bff-smoke.sh` (local dev smoke script, not run in CI) with three new curl-based assertions after the seed script has been executed. See [08-playground-integration.md](08-playground-integration.md) §Scripts for the full command set.

| Assertion                                                                 | Guarantees                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /debug/client-login-methods` returns expected JSON shape              | Dev endpoint is wired and resolver runs cleanly   |
| Default profile `effective === ["password","magic_link"]`                  | Inheritance works for the baseline BFF client     |
| Dashboard HTML contains the "Login Methods Configuration" panel            | Server-side render is wired into the dashboard    |

These run only when `NODE_ENV=development` and are intended as a fast way to catch seed/config drift between the planning phases and the running playground.

## Test Data

### Fixtures Needed

Extend existing fixture helpers in `tests/fixtures/`:

```typescript
// tests/fixtures/organizations.ts
export function buildTestOrganization(overrides?: Partial<Organization>): Organization {
  return {
    // ... existing defaults ...
    defaultLoginMethods: ['password', 'magic_link'],
    ...overrides,
  };
}

// tests/fixtures/clients.ts
export function buildTestClient(overrides?: Partial<Client>): Client {
  return {
    // ... existing defaults ...
    loginMethods: null,  // inherit by default
    ...overrides,
  };
}
```

**Backward-compatibility task:** Audit all existing test files that build `Organization` or `Client` objects inline. If any omit `defaultLoginMethods` / `loginMethods`, add the field (or refactor to use the fixture builder). Track this as a dedicated migration task in the execution plan.

### Mock Requirements

- `provider.Client.find()` — mock to return an object with a `.metadata()` function returning a dict that includes `urn:porta:login_methods` (null or array)
- Audit log writer — existing mock pattern already in use
- Rate limiter — existing mock pattern already in use
- Email service — existing mock pattern already in use

**Prefer real over mock:** For repository tests, use the real Postgres via `tests/integration/` harness. For service tests, mock only the repository + cache interfaces, not the service itself.

## Verification Checklist

- [ ] All new unit tests pass
- [ ] All existing unit tests pass (no regressions)
- [ ] Migration integration tests pass
- [ ] E2E tests pass for all three method configurations
- [ ] Pentest additions pass
- [ ] `yarn lint` reports zero errors
- [ ] `yarn verify` passes end-to-end
- [ ] Test coverage of new files ≥ 95%
- [ ] No `console.log` / debug artifacts left behind
- [ ] All new code has JSDoc comments

## Session Plan Reference

Testing work is interleaved with implementation in the execution plan — each implementation task has corresponding test tasks in the same session where possible. The dedicated "verification" sessions run `yarn verify` at phase boundaries.
